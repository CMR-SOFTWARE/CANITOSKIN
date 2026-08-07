/* CMR Nexo — Landing interactions & negocios directory */

const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const clubsGrid = document.getElementById("clubsGrid");
const searchInput = document.getElementById("searchInput");
const ciudadFilter = document.getElementById("ciudadFilter");
const sportFilters = document.getElementById("sportFilters");
const categoriesGrid = document.getElementById("categoriesGrid");
const mainNav = document.getElementById("mainNav");
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");
const heroImage = document.getElementById("heroImage");
const heroParticles = document.getElementById("heroParticles");
const heroSparks = document.getElementById("heroSparks");
const stepsShowcase = document.getElementById("stepsShowcase");
const stepsBar = document.getElementById("stepsBar");

const GRADIENT_AVATARS = [
  "linear-gradient(135deg, #4F46E5, #818CF8)",
  "linear-gradient(135deg, #312E81, #6366F1)",
  "linear-gradient(135deg, #4338CA, #A5B4FC)",
  "linear-gradient(135deg, #3730A3, #C7D2FE)",
  "linear-gradient(135deg, #4F46E5, #EEF2FF)",
  "linear-gradient(135deg, #1E1B4B, #6366F1)",
];

const CATEGORIA_LABEL = {
  peluqueria: "Peluquería",
  estetica: "Estética",
  masajes: "Masajes",
  psicologia: "Psicología",
  legal: "Legal",
  otro: "Otro",
};

function initials(nombre) {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function applyLogoContrast(img) {
  if (!img) return;
  const run = () => {
    try {
      const c = document.createElement("canvas");
      const size = 48;
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 40) continue;
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        n += 1;
      }
      const avg = n ? sum / n : 128;
      img.classList.toggle("is-light-logo", avg > 160);
    } catch (_) {
      /* cross-origin or tainted canvas — keep default white bg */
    }
  };
  if (img.complete && img.naturalWidth) run();
  else img.addEventListener("load", run, { once: true });
}

function gradientForSlug(slug) {
  let n = 0;
  for (const ch of slug) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_AVATARS[n % GRADIENT_AVATARS.length];
}

function categoriaLabel(c) {
  return CATEGORIA_LABEL[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : "Otro");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let allNegocios = [];
let activeCategoria = "todos";

/* ─── Navbar scroll & mobile ─── */
function setNavOpen(open) {
  if (!mainNav) return;
  mainNav.classList.toggle("is-open", open);
  navToggle?.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("nav-open", open);
  const backdrop = document.getElementById("navBackdrop");
  if (backdrop) backdrop.hidden = !open;
}

function initNav() {
  const onScroll = () => {
    mainNav?.classList.toggle("is-scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  navToggle?.addEventListener("click", () => {
    setNavOpen(!mainNav.classList.contains("is-open"));
  });

  document.getElementById("navBackdrop")?.addEventListener("click", () => {
    setNavOpen(false);
  });

  document.querySelectorAll(".arena-nav__menu a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 900) setNavOpen(false);
    },
    { passive: true }
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mainNav?.classList.contains("is-open")) {
      setNavOpen(false);
    }
  });
}

/* ─── Hero parallax & particles ─── */
function initHero() {
  if (heroParticles) {
    const count = window.innerWidth < 768 ? 32 : 60;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      const variant = Math.random();
      if (variant > 0.85) {
        p.className = "particle particle--trail";
      } else {
        p.className = "particle";
        if (variant > 0.45) p.classList.add("particle--green");
      }
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${30 + Math.random() * 65}%`;
      p.style.animationDelay = `${Math.random() * 12}s`;
      p.style.animationDuration = `${4 + Math.random() * 8}s`;
      heroParticles.appendChild(p);
    }
  }

  if (heroSparks) {
    const sparkCount = window.innerWidth < 768 ? 22 : 45;
    for (let i = 0; i < sparkCount; i++) {
      const el = document.createElement("span");
      const r = Math.random();
      if (r < 0.35) {
        el.className = "spark-line";
        el.style.transform = `rotate(${Math.random() * 360}deg)`;
      } else if (r < 0.55) {
        el.className = "spark spark--bright";
      } else {
        el.className = "spark";
      }
      el.style.left = `${5 + Math.random() * 90}%`;
      el.style.top = `${10 + Math.random() * 80}%`;
      el.style.animationDelay = `${Math.random() * 8}s`;
      el.style.animationDuration = `${2 + Math.random() * 6}s`;
      heroSparks.appendChild(el);
    }
  }

  if (heroImage) {
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          heroImage.style.transform = `scale(1.02) translateY(${y * 0.2}px)`;
        }
      },
      { passive: true }
    );
  }
}

/* ─── Scroll reveal ─── */
function initReveal() {
  const reveals = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  reveals.forEach((el) => observer.observe(el));
}

/* ─── Category filters ─── */
function setActiveCategoria(categoria) {
  activeCategoria = categoria;

  categoriesGrid?.querySelectorAll(".category-chip, .category-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.categoria === categoria);
  });

  renderGrid();
}

function initCategories() {
  categoriesGrid?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-categoria]");
    if (!card) return;
    setActiveCategoria(card.dataset.categoria);
    document.getElementById("negocios")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function normalizePlaceText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesLocation(negocio, query) {
  const q = normalizePlaceText(query);
  if (!q) return true;
  const ciudad = normalizePlaceText(negocio.ciudad);
  return Boolean(ciudad) && ciudad === q;
}

function clearCiudadMenuPosition(menu) {
  if (!menu) return;
  menu.style.position = "";
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.left = "";
  menu.style.right = "";
  menu.style.width = "";
  menu.style.maxHeight = "";
  menu.style.zIndex = "";
}

function positionCiudadMenu() {
  const trigger = document.getElementById("ciudadFilterTrigger");
  const menu = document.getElementById("ciudadFilterMenu");
  if (!trigger || !menu || menu.hidden) return;

  const rect = trigger.getBoundingClientRect();
  const gutter = 8;
  const gap = 6;
  const width = Math.min(rect.width, window.innerWidth - gutter * 2);
  const left = Math.min(
    Math.max(gutter, rect.left),
    window.innerWidth - gutter - width
  );
  const spaceBelow = window.innerHeight - rect.bottom - gutter;
  const spaceAbove = rect.top - gutter;
  const preferUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxH = Math.min(256, preferUp ? spaceAbove - gap : spaceBelow - gap);

  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.width = `${width}px`;
  menu.style.right = "auto";
  menu.style.zIndex = "2000";
  menu.style.maxHeight = `${Math.max(120, maxH)}px`;

  if (preferUp) {
    menu.style.top = "auto";
    menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    menu.style.transformOrigin = "bottom center";
  } else {
    menu.style.bottom = "auto";
    menu.style.top = `${rect.bottom + gap}px`;
    menu.style.transformOrigin = "top center";
  }
}

function setCiudadSelectOpen(open) {
  const root = document.getElementById("ciudadSelect");
  const trigger = document.getElementById("ciudadFilterTrigger");
  const menu = document.getElementById("ciudadFilterMenu");
  if (!root || !trigger || !menu) return;
  root.classList.toggle("is-open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  menu.hidden = !open;
  if (open) {
    positionCiudadMenu();
  } else {
    clearCiudadMenuPosition(menu);
  }
}

function syncCiudadSelectUI() {
  const label = document.getElementById("ciudadFilterLabel");
  const menu = document.getElementById("ciudadFilterMenu");
  if (!ciudadFilter || !label) return;
  const selected = ciudadFilter.options[ciudadFilter.selectedIndex];
  label.textContent = selected?.textContent || "Todas las localidades";
  if (!menu) return;
  menu.querySelectorAll('[role="option"]').forEach((opt) => {
    const isSelected = (opt.dataset.value || "") === ciudadFilter.value;
    opt.setAttribute("aria-selected", isSelected ? "true" : "false");
    opt.classList.toggle("is-selected", isSelected);
  });
}

function buildCiudadMenu() {
  const menu = document.getElementById("ciudadFilterMenu");
  if (!ciudadFilter || !menu) return;
  const wasOpen = !menu.hidden;
  menu.innerHTML = Array.from(ciudadFilter.options)
    .map((opt) => {
      const value = opt.value;
      const isSelected = value === ciudadFilter.value;
      return `<li role="option" class="loc-select__option${isSelected ? " is-selected" : ""}" data-value="${escapeHtml(value)}" aria-selected="${isSelected}" tabindex="-1">${escapeHtml(opt.textContent)}</li>`;
    })
    .join("");
  syncCiudadSelectUI();
  if (wasOpen) positionCiudadMenu();
}

function initCiudadSelect() {
  const root = document.getElementById("ciudadSelect");
  const trigger = document.getElementById("ciudadFilterTrigger");
  const menu = document.getElementById("ciudadFilterMenu");
  if (!root || !trigger || !menu || !ciudadFilter || root.dataset.ready) return;
  root.dataset.ready = "1";

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCiudadSelectOpen(!root.classList.contains("is-open"));
  });

  menu.addEventListener("click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest('[role="option"]');
    if (!opt) return;
    ciudadFilter.value = opt.dataset.value ?? "";
    syncCiudadSelectUI();
    setCiudadSelectOpen(false);
    ciudadFilter.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.addEventListener("click", (e) => {
    if (!root.classList.contains("is-open")) return;
    if (root.contains(e.target) || menu.contains(e.target)) return;
    setCiudadSelectOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) {
      setCiudadSelectOpen(false);
      trigger.focus();
    }
  });

  const onReposition = () => {
    if (root.classList.contains("is-open")) positionCiudadMenu();
  };
  window.addEventListener("resize", onReposition, { passive: true });
  window.addEventListener("scroll", onReposition, { passive: true, capture: true });

  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCiudadSelectOpen(true);
      const focusOpt =
        menu.querySelector('[aria-selected="true"]') || menu.querySelector('[role="option"]');
      focusOpt?.focus();
    }
  });

  menu.addEventListener("keydown", (e) => {
    const options = [...menu.querySelectorAll('[role="option"]')];
    const idx = options.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (options[Math.min(idx + 1, options.length - 1)] || options[0])?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (options[Math.max(idx - 1, 0)] || options[0])?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      document.activeElement?.click();
    } else if (e.key === "Escape") {
      setCiudadSelectOpen(false);
      trigger.focus();
    }
  });

  buildCiudadMenu();
}

function updateNegociosStat() {
  const statNum = document.getElementById("statClubsNum");
  const statPlus = document.getElementById("statClubs");
  if (!statNum) return;
  const n = Array.isArray(allNegocios) ? allNegocios.length : 0;
  statNum.textContent = String(n);
  if (statPlus) statPlus.textContent = n >= 10 ? "+" : "";
}

async function populateCiudades() {
  if (!ciudadFilter) return;
  const current = ciudadFilter.value;
  let localidades = [];
  try {
    const res = await fetch("/api/localidades");
    const data = await res.json();
    if (Array.isArray(data)) localidades = data.map((l) => l.nombre).filter(Boolean);
  } catch (_) {
    localidades = [...new Set(allNegocios.map((n) => n.ciudad).filter(Boolean))];
  }
  localidades.sort((a, b) => a.localeCompare(b, "es"));
  ciudadFilter.innerHTML =
    `<option value="">Todas las localidades</option>` +
    localidades.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (localidades.includes(current)) ciudadFilter.value = current;
  buildCiudadMenu();
}

/* ─── Negocios grid ─── */
function renderGrid() {
  const query = searchInput?.value.trim().toLowerCase() || "";
  const lugar = ciudadFilter?.value || "";

  const filtered = allNegocios.filter((n) => {
    const matchCat = activeCategoria === "todos" || n.categoria === activeCategoria;
    const matchSearch = !query || n.nombre.toLowerCase().includes(query);
    const matchCiudad = matchesLocation(n, lugar);
    return matchCat && matchSearch && matchCiudad;
  });

  if (!filtered.length) {
    clubsGrid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    const msg = emptyState.querySelector("p");
    if (msg) {
      msg.textContent =
        query || activeCategoria !== "todos" || lugar
          ? "No se encontraron negocios con ese criterio."
          : "No hay negocios disponibles aún.";
    }
    return;
  }

  emptyState.classList.add("hidden");
  clubsGrid.classList.remove("hidden");

  clubsGrid.innerHTML = filtered
    .map((negocio, i) => {
      const grad = gradientForSlug(negocio.slug);
      const avatar = negocio.logoUrl
        ? `<img src="${escapeHtml(negocio.logoUrl)}" alt="${escapeHtml(negocio.nombre)}" class="club-card__avatar" loading="lazy" crossorigin="anonymous" />`
        : `<div class="club-card__initials" style="background:${grad}">${escapeHtml(initials(negocio.nombre))}</div>`;

      const lugarTxt = [negocio.ciudad, negocio.direccion || negocio.barrio].filter(Boolean).join(" · ");
      const delay = Math.min(i, 5);
      return `
      <article class="club-card cut-corners cut-corners--sm reveal" style="transition-delay:${delay * 0.06}s">
        ${avatar}
        <h3 class="club-card__name">${escapeHtml(negocio.nombre)}</h3>
        <span class="club-card__sport cut-corners cut-corners--xs">${escapeHtml(categoriaLabel(negocio.categoria))}</span>
        ${lugarTxt ? `<p class="club-card__meta" style="font-size:0.8rem;opacity:0.75;margin:0.25rem 0 0">${escapeHtml(lugarTxt)}</p>` : ""}
        <a href="/${escapeHtml(negocio.slug)}" class="btn-arena btn-arena--primary cut-corners">Reservar turno</a>
      </article>`;
    })
    .join("");

  clubsGrid.querySelectorAll("img.club-card__avatar").forEach(applyLogoContrast);
  clubsGrid.querySelectorAll(".reveal").forEach((el) => {
    requestAnimationFrame(() => el.classList.add("is-visible"));
  });
}

searchInput?.addEventListener("input", renderGrid);
ciudadFilter?.addEventListener("change", renderGrid);
initCiudadSelect();

async function initNegocios() {
  try {
    let res = await fetch("/api/negocios", { cache: "no-store" });
    if (!res.ok) res = await fetch("/api/clubs", { cache: "no-store" });
    allNegocios = await res.json();
    loading?.classList.add("hidden");
    await populateCiudades();
    renderGrid();
    updateNegociosStat();
    startHomeLivePoll();
  } catch (_) {
    if (loading) {
      loading.innerHTML = "<p>No se pudo cargar la lista de negocios.</p>";
    }
  }
}

let homePollTimer = null;
let homePollInFlight = false;
let lastHomeSig = "";
const HOME_LIVE_POLL_MS = 15000;

function negociosSignature(list) {
  return (list || [])
    .map((n) => `${n.slug}:${n.nombre}:${n.ciudad || ""}:${n.direccion || ""}:${n.logoUrl || ""}`)
    .sort()
    .join("|");
}

async function pollHomeNegocios() {
  if (homePollInFlight || document.hidden) return;
  homePollInFlight = true;
  try {
    let res = await fetch("/api/negocios", { cache: "no-store" });
    if (!res.ok) res = await fetch("/api/clubs", { cache: "no-store" });
    const list = await res.json();
    const sig = negociosSignature(list);
    if (sig === lastHomeSig) return;
    lastHomeSig = sig;
    allNegocios = list;
    await populateCiudades();
    renderGrid();
    updateNegociosStat();
  } catch (_) {
    /* silencioso */
  } finally {
    homePollInFlight = false;
  }
}

function startHomeLivePoll() {
  if (homePollTimer) clearInterval(homePollTimer);
  lastHomeSig = negociosSignature(allNegocios);
  homePollTimer = setInterval(pollHomeNegocios, HOME_LIVE_POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pollHomeNegocios();
  });
}

/* ─── Smooth anchor offset for fixed nav ─── */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const id = anchor.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: "smooth" });
  });
});

/* ─── Steps: scroll + hover paso a paso ─── */
function initSteps() {
  if (!stepsShowcase || !stepsBar) return;
  const cards = [...stepsShowcase.querySelectorAll(".step-card-cut")];
  let hovering = false;

  function activateStep(index) {
    const total = cards.length;
    const idx = Math.max(0, Math.min(total - 1, index));
    stepsBar.style.width = `${((idx + 1) / total) * 100}%`;

    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i <= idx);
      card.classList.toggle("is-current", i === idx);
    });
  }

  function updateFromScroll() {
    if (hovering) return;
    const rect = stepsShowcase.getBoundingClientRect();
    const vh = window.innerHeight;
    const progress = Math.min(1, Math.max(0, (vh * 0.8 - rect.top) / (rect.height + vh * 0.3)));
    const idx = Math.min(cards.length - 1, Math.floor(progress * cards.length));
    activateStep(idx);
  }

  cards.forEach((card, i) => {
    card.addEventListener("mouseenter", () => {
      hovering = true;
      stepsShowcase.classList.add("is-hovering");
      activateStep(i);
    });
    card.addEventListener("focusin", () => {
      hovering = true;
      stepsShowcase.classList.add("is-hovering");
      activateStep(i);
    });
  });

  stepsShowcase.addEventListener("mouseleave", () => {
    hovering = false;
    stepsShowcase.classList.remove("is-hovering");
    updateFromScroll();
  });

  stepsShowcase.addEventListener("focusout", (e) => {
    if (!stepsShowcase.contains(e.relatedTarget)) {
      hovering = false;
      stepsShowcase.classList.remove("is-hovering");
      updateFromScroll();
    }
  });

  window.addEventListener("scroll", updateFromScroll, { passive: true });
  updateFromScroll();
}

/* ─── Benefit cards hover pulse ─── */
function initBenefits() {
  document.querySelectorAll(".benefit-card-cut").forEach((card) => {
    card.addEventListener("mouseenter", () => card.classList.add("is-hovered"));
    card.addEventListener("mouseleave", () => card.classList.remove("is-hovered"));
  });
}

/* ─── Planes dinámicos (precios + promos) ─── */
function formatPlanMoney(n) {
  return Number(n || 0).toLocaleString("es-AR");
}

function escapePlanHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultFeaturesForPlan(plan) {
  const lim = plan.limiteProfesionales;
  const base = [
    lim == null ? "Profesionales ilimitados" : (Number(lim) === 1 ? "Hasta 1 profesional" : `Hasta ${lim} profesionales`),
    "Turnos online",
    "Panel admin",
    "WhatsApp",
  ];
  if (plan.id !== "inicial") base.push("Soporte prioritario");
  return base;
}

async function loadHomePlans() {
  const grid = document.getElementById("plansGrid");
  if (!grid) return;
  try {
    const res = await fetch("/api/planes", { cache: "no-store" });
    const planes = await res.json();
    if (!Array.isArray(planes) || !planes.length) throw new Error("sin planes");
    const order = ["inicial", "profesional", "max"];
    const sorted = [...planes].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return (a.sortOrder || 0) - (b.sortOrder || 0) || a.precio - b.precio;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    grid.innerHTML = sorted.map((plan) => {
      const featured = !!plan.featured || plan.id === "profesional";
      const features = Array.isArray(plan.features) && plan.features.length
        ? plan.features
        : defaultFeaturesForPlan(plan);
      const promo = !!plan.is_promo_active;
      const amount = promo ? plan.final_price : plan.precio;
      const ctaClass = featured
        ? "btn-arena btn-arena--plan-primary cut-corners cut-corners--sm"
        : "btn-arena btn-arena--plan-outline cut-corners cut-corners--sm";
      return `
        <article class="plan-card reveal ${featured ? "plan-card--featured" : ""}">
          ${featured ? `<span class="plan-card__badge cut-corners cut-corners--xs">Más popular</span>` : ""}
          ${promo ? `<span class="plan-card__promo">${escapePlanHtml(plan.promo_title || "Promo")}</span>` : ""}
          <header class="plan-card__head">
            <span class="plan-card__tier">${escapePlanHtml(plan.nombre)}</span>
            <div class="plan-card__price">
              ${promo ? `<span class="plan-card__amount-old">$${formatPlanMoney(plan.original_price)}</span>` : ""}
              <span class="plan-card__amount">$${formatPlanMoney(amount)}</span>
              <span class="plan-card__period">/ mes</span>
            </div>
          </header>
          <ul class="plan-card__features">
            ${features.map((f) => `<li><span class="plan-card__check" aria-hidden="true"></span>${escapePlanHtml(f)}</li>`).join("")}
          </ul>
          <a href="/sumate?plan=${encodeURIComponent(plan.id)}" class="${ctaClass}">Empezar</a>
        </article>`;
    }).join("");
    // Re-run reveal observer for new cards
    if (typeof initReveal === "function") {
      grid.querySelectorAll(".reveal").forEach((el) => {
        el.classList.add("is-visible");
      });
    }
  } catch (_) {
    grid.innerHTML = `<p class="arena-empty">No se pudieron cargar los planes.</p>`;
  }
}

/* ─── Features Nexo ─── */
const FEATURES_NEXO = [
  {
    title: "Reservas online",
    description:
      "Tus clientes reservan sus turnos las 24 horas desde el celular, sin llamados ni ida y vuelta por mensajes.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>`,
  },
  {
    title: "Sumá a tus profesionales",
    description:
      "Agregá a todo tu equipo, asignales su propia agenda y gestioná la disponibilidad de cada uno.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  {
    title: "Horarios y turnos",
    description:
      "Configurá horarios de atención, duración de turnos y disponibilidad de cada profesional en segundos.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  },
  {
    title: "Avisos directo a tu WhatsApp",
    description:
      "Cada vez que reservan un turno, te llega la notificación directo a tu WhatsApp. Nunca más te enterás tarde.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  },
  {
    title: "Estadísticas",
    description:
      "Mirá cómo crece tu negocio: turnos por día, clientes frecuentes y horarios más pedidos, todo en tiempo real.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 16V9M12 16v-5M17 16V7"/></svg>`,
  },
  {
    title: "Ingresos, egresos y balance",
    description:
      "Registrá lo que entra y lo que sale de tu negocio, y mirá tu balance actualizado al instante.",
    href: "/sumate",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  },
];

function renderFeaturesNexo() {
  const grid = document.getElementById("featuresGrid");
  if (!grid) return;

  grid.innerHTML = FEATURES_NEXO.map(
    (item, index) => `
    <article class="feature-nexo-card" style="--feature-delay:${index * 100}ms">
      <span class="feature-nexo-card__icon">${item.icon}</span>
      <h3 class="feature-nexo-card__title">${escapePlanHtml(item.title)}</h3>
      <p class="feature-nexo-card__text">${escapePlanHtml(item.description)}</p>
      <a class="feature-nexo-card__more" href="${escapePlanHtml(item.href)}">Ver más <span aria-hidden="true">→</span></a>
    </article>`
  ).join("");

  const cards = grid.querySelectorAll(".feature-nexo-card");
  if (!cards.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cards.forEach((card) => card.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -48px 0px" }
  );
  cards.forEach((card) => observer.observe(card));
}

/* ─── Boot ─── */
initNav();
initHero();
initReveal();
renderFeaturesNexo();
loadHomePlans();
initCategories();
initNegocios();
initSteps();
initBenefits();
