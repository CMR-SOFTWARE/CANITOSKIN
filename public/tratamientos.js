/* Canito Skin — listado completo de tratamientos (/tratamientos) */
(function () {
  const SLUG = window.CanitoCart.SLUG;
  let config = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(n) {
    return new Intl.NumberFormat("es-AR").format(Math.round(Number(n) || 0));
  }

  function formatPrice(n) {
    return `$ ${formatMoney(n)}`;
  }

  function formatDuracion(min) {
    const m = Number(min) || 0;
    if (m <= 0) return "";
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (rest === 0) return `${h}h`;
    return `${h}h ${rest}min`;
  }

  function categoriaLabel(c) {
    return c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : "";
  }

  function applyBrandColor(color) {
    if (!color) return;
    document.documentElement.style.setProperty("--business-accent", color);
    document.documentElement.style.setProperty(
      "--business-accent-hover",
      `color-mix(in srgb, ${color} 85%, black)`
    );
    document.documentElement.style.setProperty(
      "--business-accent-light",
      `color-mix(in srgb, ${color} 12%, white)`
    );
  }

  async function loadConfig() {
    try {
      const res = await fetch(`/api/${SLUG}/config`);
      if (!res.ok) return;
      config = await res.json();
      applyBrandColor(config.colorAcento);
      const navBusinessName = document.getElementById("navBusinessName");
      if (navBusinessName) navBusinessName.textContent = config.nombre || "";
      const navLogo = document.getElementById("navLogo");
      if (navLogo) {
        if (config.logoUrl) {
          navLogo.outerHTML = `<img id="navLogo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.nombre)}" class="h-10 w-10 shrink-0 rounded-full object-contain bg-white p-0.5 ring-1 ring-border" crossorigin="anonymous" />`;
        } else {
          navLogo.outerHTML = `<img id="navLogo" src="/images/logo-canito-nav.png" alt="${escapeHtml(config.nombre || "Canito Skin")}" class="h-10 w-auto max-w-[7rem] shrink-0 object-contain" />`;
        }
      }
    } catch (_) { /* branding por defecto */ }
  }

  function serviceCardHtml(s) {
    const dur = formatDuracion(s.duracionMin);
    const precio = s.precio != null && s.precio !== "" ? formatPrice(s.precio) : "";
    const senaVal = s.sena != null && String(s.sena).trim() !== "" && Number(String(s.sena).replace(/[^\d.-]/g, "")) > 0
      ? formatPrice(s.sena)
      : "";
    return `
      <article class="svc-card">
        <div class="svc-card__top">
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-primary leading-snug">${escapeHtml(s.nombre)}</h3>
            ${s.descripcion ? `
              <p class="mt-1 text-meta text-secondary svc-card__desc">${escapeHtml(s.descripcion)}</p>
              ${s.descripcion.length > 100 ? `<button type="button" class="svc-card__desc-toggle" data-desc-toggle>Leer todo</button>` : ""}
            ` : ""}
          </div>
          <div class="svc-card__prices shrink-0 text-right">
            ${precio ? `<span class="svc-card__price">${escapeHtml(precio)}</span>` : ""}
            ${senaVal ? `<p class="svc-card__sena">Seña ${escapeHtml(senaVal)}</p>` : ""}
          </div>
        </div>
        <div class="svc-card__footer">
          ${dur ? `<span class="svc-card__dur">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            ${escapeHtml(dur)}
          </span>` : `<span></span>`}
          <a href="/?servicio=${escapeHtml(s.id)}" class="svc-card__btn">Reservar</a>
        </div>
      </article>`;
  }

  function wireDescToggles(container) {
    container.querySelectorAll("[data-desc-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const desc = btn.previousElementSibling;
        if (!desc) return;
        const expanded = desc.classList.toggle("is-expanded");
        btn.textContent = expanded ? "Leer menos" : "Leer todo";
      });
    });
  }

  function render() {
    const container = document.getElementById("tratamientosList");
    const vacio = document.getElementById("tratamientosVacio");
    if (!container) return;
    const services = (config?.services || []).filter((s) => s.activo !== false);
    if (!services.length) {
      container.innerHTML = "";
      vacio.classList.remove("hidden");
      return;
    }
    vacio.classList.add("hidden");

    const groups = {};
    services.forEach((s) => {
      const key = s.categoria || "_";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    const keys = Object.keys(groups);
    const hasCats = keys.some((k) => k !== "_");

    let html = "";
    keys.forEach((key) => {
      if (hasCats && key !== "_") {
        html += `<p class="svc-section-label">${escapeHtml(categoriaLabel(key))}</p>`;
      }
      html += `<div class="svc-grid mt-3 mb-8">${groups[key].map(serviceCardHtml).join("")}</div>`;
    });
    container.innerHTML = html;
    wireDescToggles(container);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    render();
  });
})();
