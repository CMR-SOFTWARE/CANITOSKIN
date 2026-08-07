/* CMR Nexo — Google Places + mapa para ciudad/barrio */
(function (global) {
  "use strict";

  let mapsReadyPromise = null;

  function loadGoogleMaps(apiKey, { language = "es", region = "AR" } = {}) {
    if (global.google?.maps?.places) return Promise.resolve();
    if (mapsReadyPromise) return mapsReadyPromise;
    mapsReadyPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-cmr-maps]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps.")));
        return;
      }
      const script = document.createElement("script");
      script.dataset.cmrMaps = "1";
      script.async = true;
      script.defer = true;
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(apiKey) +
        "&libraries=places&language=" +
        encodeURIComponent(language) +
        "&region=" +
        encodeURIComponent(region);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
      document.head.appendChild(script);
    });
    return mapsReadyPromise;
  }

  function component(components, type) {
    const hit = (components || []).find((c) => (c.types || []).includes(type));
    return hit ? hit.long_name || hit.short_name || "" : "";
  }

  function parsePlace(place) {
    const comps = place?.address_components || [];
    const ciudad =
      component(comps, "locality") ||
      component(comps, "administrative_area_level_2") ||
      component(comps, "postal_town") ||
      "";
    const barrio =
      component(comps, "sublocality_level_1") ||
      component(comps, "sublocality") ||
      component(comps, "neighborhood") ||
      component(comps, "administrative_area_level_3") ||
      "";
    const lat = place?.geometry?.location?.lat?.();
    const lng = place?.geometry?.location?.lng?.();
    return {
      ciudad,
      barrio,
      formatted: place?.formatted_address || place?.name || "",
      lat: typeof lat === "number" ? lat : null,
      lng: typeof lng === "number" ? lng : null,
    };
  }

  /**
   * @param {object} opts
   * @param {HTMLInputElement} opts.searchInput
   * @param {HTMLElement} opts.mapEl
   * @param {HTMLInputElement} opts.ciudadInput
   * @param {HTMLInputElement} opts.barrioInput
   * @param {HTMLElement} [opts.hintEl]
   * @param {HTMLElement} [opts.extrasEl] — search + map (se muestra si Maps está disponible)
   */
  async function initLocationPicker(opts) {
    const {
      searchInput,
      mapEl,
      ciudadInput,
      barrioInput,
      hintEl,
      extrasEl,
    } = opts;

    if (!searchInput || !ciudadInput || !barrioInput) return { enabled: false };

    let config;
    try {
      const res = await fetch("/api/maps-config");
      config = await res.json();
    } catch (_) {
      config = { enabled: false };
    }

    if (!config?.enabled || !config.apiKey) {
      if (extrasEl) extrasEl.classList.add("hidden");
      return { enabled: false };
    }

    try {
      await loadGoogleMaps(config.apiKey, {
        language: config.language || "es",
        region: config.region || "AR",
      });
    } catch (err) {
      if (extrasEl) extrasEl.classList.add("hidden");
      if (hintEl) hintEl.textContent = err.message || "Google Maps no disponible.";
      return { enabled: false };
    }

    if (extrasEl) extrasEl.classList.remove("hidden");

    const defaultCenter = { lat: -33.3335, lng: -60.2110 }; // San Nicolás AR
    let map = null;
    let marker = null;

    if (mapEl) {
      map = new google.maps.Map(mapEl, {
        center: defaultCenter,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      marker = new google.maps.Marker({
        map,
        position: defaultCenter,
        visible: false,
      });
    }

    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      fields: ["address_components", "geometry", "formatted_address", "name"],
      types: ["geocode"],
      componentRestrictions: { country: "ar" },
    });

    if (map) {
      autocomplete.bindTo("bounds", map);
    }

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place?.geometry?.location) {
        if (hintEl) hintEl.textContent = "Elegí una opción de la lista de Google.";
        return;
      }
      const parsed = parsePlace(place);
      ciudadInput.value = parsed.ciudad || "";
      barrioInput.value = parsed.barrio || "";
      if (!parsed.barrio && hintEl) {
        hintEl.textContent = "Ciudad cargada. Completá el barrio si hace falta.";
      } else if (hintEl) {
        hintEl.textContent = parsed.formatted || "Ubicación seleccionada.";
      }

      if (map && marker) {
        map.setCenter(place.geometry.location);
        map.setZoom(place.geometry.viewport ? 14 : 16);
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        marker.setPosition(place.geometry.location);
        marker.setVisible(true);
      }
    });

    if ((ciudadInput.value || barrioInput.value) && !searchInput.value) {
      searchInput.value = [barrioInput.value, ciudadInput.value].filter(Boolean).join(", ");
    }

    if (hintEl && !hintEl.textContent) {
      hintEl.textContent = "Buscá y elegí una sugerencia de Google Maps.";
    }

    return { enabled: true, map, marker, autocomplete };
  }

  /**
   * Filtro de ubicación del directorio (Places + geolocalización).
   * @param {object} opts
   * @param {HTMLInputElement} opts.input
   * @param {HTMLButtonElement} [opts.geoBtn]
   * @param {HTMLSelectElement} [opts.fallbackSelect]
   * @param {(label: string) => void} opts.onChange
   */
  async function initDirectoryLocationFilter(opts) {
    const { input, geoBtn, fallbackSelect, onChange } = opts;
    if (!input) return { enabled: false };

    let config;
    try {
      const res = await fetch("/api/maps-config");
      config = await res.json();
    } catch (_) {
      config = { enabled: false };
    }

    if (!config?.enabled || !config.apiKey) {
      if (fallbackSelect) {
        fallbackSelect.hidden = false;
        fallbackSelect.removeAttribute("hidden");
      }
      input.closest(".hero-arena__location-field")?.classList.add("hidden");
      if (geoBtn) geoBtn.classList.add("hidden");
      return { enabled: false };
    }

    try {
      await loadGoogleMaps(config.apiKey, {
        language: config.language || "es",
        region: config.region || "AR",
      });
    } catch (_) {
      if (fallbackSelect) {
        fallbackSelect.hidden = false;
        fallbackSelect.removeAttribute("hidden");
      }
      input.closest(".hero-arena__location-field")?.classList.add("hidden");
      if (geoBtn) geoBtn.classList.add("hidden");
      return { enabled: false };
    }

    if (fallbackSelect) {
      fallbackSelect.hidden = true;
      fallbackSelect.setAttribute("hidden", "");
    }

    const autocomplete = new google.maps.places.Autocomplete(input, {
      fields: ["address_components", "geometry", "formatted_address", "name"],
      types: ["geocode"],
      componentRestrictions: { country: "ar" },
    });

    function emitFromPlace(place) {
      const parsed = parsePlace(place);
      const label = parsed.barrio || parsed.ciudad || place?.name || place?.formatted_address || "";
      if (label) input.value = label;
      if (typeof onChange === "function") onChange(label);
    }

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place?.geometry) return;
      emitFromPlace(place);
    });

    input.addEventListener("input", () => {
      if (!input.value.trim() && typeof onChange === "function") onChange("");
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (typeof onChange === "function") onChange(input.value.trim());
      }
    });

    if (geoBtn) {
      geoBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
          alert("Tu navegador no permite geolocalización.");
          return;
        }
        geoBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const latLng = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: latLng }, (results, status) => {
              geoBtn.disabled = false;
              if (status !== "OK" || !results?.[0]) {
                alert("No se pudo detectar tu ciudad.");
                return;
              }
              emitFromPlace(results[0]);
              document.getElementById("negocios")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          },
          () => {
            geoBtn.disabled = false;
            alert("No se pudo obtener tu ubicación. Permití el acceso en el navegador.");
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      });
    }

    return { enabled: true, autocomplete };
  }

  global.CmrMapsLocation = {
    initLocationPicker,
    initDirectoryLocationFilter,
    parsePlace,
    loadGoogleMaps,
  };
})(window);
