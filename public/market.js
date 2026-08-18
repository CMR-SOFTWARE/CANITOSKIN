/* Canito Skin — catálogo completo del market (/market) */
(function () {
  const SLUG = window.CanitoCart.SLUG;
  let config = null;
  let productos = [];
  let categoriaActiva = "todos";
  let busqueda = "";
  let orden = "destacados";

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

  function initials(nombre) {
    return String(nombre || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");
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
          navLogo.outerHTML = `<img id="navLogo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.nombre)}" class="h-16 w-16 shrink-0 rounded-full object-contain bg-white p-0.5 ring-1 ring-border" crossorigin="anonymous" />`;
        } else {
          navLogo.outerHTML = `<img id="navLogo" src="/images/logo-canito-nav.png" alt="${escapeHtml(config.nombre || "Canito Skin")}" class="h-16 w-auto max-w-[9rem] shrink-0 object-contain" />`;
        }
      }
    } catch (_) { /* branding por defecto */ }
  }

  function productoMedia(p) {
    return p.imagenUrl
      ? `<img src="${escapeHtml(p.imagenUrl)}" alt="${escapeHtml(p.nombre)}" class="canito-service-card__media canito-product-card__media" loading="lazy" />`
      : `<div class="canito-service-card__media canito-product-card__media flex items-center justify-center bg-canito-taupe text-canito-carbon/40">
          <svg viewBox="0 0 24 24" class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>
        </div>`;
  }

  function productoCard(p) {
    const sinStock = p.stock != null && p.stock <= 0;
    return `
      <article class="canito-service-card">
        ${productoMedia(p)}
        <span class="canito-label">${escapeHtml(p.nombre)}</span>
        <div class="canito-service-card__body">
          ${p.categoria ? `<p class="text-meta-sm text-secondary">${escapeHtml(p.categoria)}</p>` : ""}
          <div class="mt-2 flex items-center justify-between gap-3">
            <p class="font-semibold text-primary">${escapeHtml(formatPrice(p.precio))}</p>
            ${sinStock
              ? `<span class="text-meta-sm font-semibold text-secondary">Sin stock</span>`
              : `<button type="button" data-add-to-cart="${escapeHtml(p.id)}" class="svc-card__btn !min-w-0 px-3 text-xs">Agregar</button>`}
          </div>
        </div>
      </article>`;
  }

  function wireAddButtons(container, lista) {
    container.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
      const producto = lista.find((p) => String(p.id) === btn.getAttribute("data-add-to-cart"));
      if (!producto) return;
      btn.addEventListener("click", () => {
        window.CanitoCart.addItem(producto, 1);
        const original = btn.textContent;
        btn.textContent = "Agregado ✓";
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1200);
      });
    });
  }

  function renderChips() {
    const wrap = document.getElementById("categoriaChips");
    if (!wrap) return;
    const counts = new Map();
    productos.forEach((p) => {
      const cat = p.categoria || "Otros";
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    const categorias = ["todos", ...Array.from(counts.keys()).sort()];
    wrap.innerHTML = categorias.map((cat) => {
      const label = cat === "todos" ? "Todos" : cat;
      const count = cat === "todos" ? productos.length : counts.get(cat);
      const activa = cat === categoriaActiva;
      return `<button type="button" data-cat="${escapeHtml(cat)}" class="rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        activa
          ? "border-business-accent bg-business-accent text-white"
          : "border-border text-secondary hover:border-business-accent hover:text-business-accent"
      }">${escapeHtml(label)} <span class="opacity-70">${count}</span></button>`;
    }).join("");
    wrap.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        categoriaActiva = btn.getAttribute("data-cat");
        render();
      });
    });
  }

  function filtrarYOrdenar(lista) {
    let items = lista.slice();
    if (categoriaActiva !== "todos") {
      items = items.filter((p) => (p.categoria || "Otros") === categoriaActiva);
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      items = items.filter((p) =>
        p.nombre.toLowerCase().includes(q) || (p.descripcion || "").toLowerCase().includes(q)
      );
    }
    switch (orden) {
      case "precio_asc":
        items.sort((a, b) => a.precio - b.precio);
        break;
      case "precio_desc":
        items.sort((a, b) => b.precio - a.precio);
        break;
      case "novedades":
        items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
      default:
        items.sort((a, b) => (b.destacado === true) - (a.destacado === true));
    }
    return items;
  }

  function render() {
    renderChips();

    const destacadosSection = document.getElementById("destacadosSection");
    const destacadosList = document.getElementById("destacadosList");
    const destacados = productos.filter((p) => p.destacado);
    if (destacados.length && categoriaActiva === "todos" && !busqueda.trim()) {
      destacadosSection.classList.remove("hidden");
      destacadosList.innerHTML = destacados.map(productoCard).join("");
      wireAddButtons(destacadosList, destacados);
    } else {
      destacadosSection.classList.add("hidden");
      destacadosList.innerHTML = "";
    }

    const catalogoList = document.getElementById("catalogoList");
    const catalogoCount = document.getElementById("catalogoCount");
    const catalogoVacio = document.getElementById("catalogoVacio");
    const catalogoSinResultados = document.getElementById("catalogoSinResultados");

    if (!productos.length) {
      catalogoList.innerHTML = "";
      catalogoCount.textContent = "";
      catalogoVacio.classList.remove("hidden");
      catalogoSinResultados.classList.add("hidden");
      return;
    }
    catalogoVacio.classList.add("hidden");

    const filtrados = filtrarYOrdenar(productos);
    catalogoCount.textContent = `${filtrados.length} producto${filtrados.length === 1 ? "" : "s"}`;
    if (!filtrados.length) {
      catalogoList.innerHTML = "";
      catalogoSinResultados.classList.remove("hidden");
      return;
    }
    catalogoSinResultados.classList.add("hidden");
    catalogoList.innerHTML = filtrados.map(productoCard).join("");
    wireAddButtons(catalogoList, filtrados);
  }

  async function loadProductos() {
    try {
      const res = await fetch(`/api/${SLUG}/productos`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      productos = Array.isArray(data) ? data : [];
    } catch (_) {
      productos = [];
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    loadProductos();
    document.getElementById("buscarInput")?.addEventListener("input", (e) => {
      busqueda = e.target.value || "";
      render();
    });
    document.getElementById("ordenSelect")?.addEventListener("change", (e) => {
      orden = e.target.value;
      render();
    });
  });
})();
