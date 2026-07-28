/* CMR Turnos — Landing interactions & negocios directory */

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
function initNav() {
  const onScroll = () => {
    mainNav.classList.toggle("is-scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  navToggle?.addEventListener("click", () => {
    const open = mainNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  document.querySelectorAll(".arena-nav__menu a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
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

function populateCiudades() {
  if (!ciudadFilter) return;
  const ciudades = [...new Set(allNegocios.map((n) => n.ciudad).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const current = ciudadFilter.value;
  ciudadFilter.innerHTML =
    `<option value="">Todas las ciudades</option>` +
    ciudades.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (ciudades.includes(current)) ciudadFilter.value = current;
}

/* ─── Negocios grid ─── */
function renderGrid() {
  const query = searchInput?.value.trim().toLowerCase() || "";
  const ciudad = ciudadFilter?.value || "";

  const filtered = allNegocios.filter((n) => {
    const matchCat = activeCategoria === "todos" || n.categoria === activeCategoria;
    const matchSearch = !query || n.nombre.toLowerCase().includes(query);
    const matchCiudad = !ciudad || n.ciudad === ciudad;
    return matchCat && matchSearch && matchCiudad;
  });

  if (!filtered.length) {
    clubsGrid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    const msg = emptyState.querySelector("p");
    if (msg) {
      msg.textContent =
        query || activeCategoria !== "todos" || ciudad
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
        ? `<img src="${escapeHtml(negocio.logoUrl)}" alt="${escapeHtml(negocio.nombre)}" class="club-card__avatar" loading="lazy" />`
        : `<div class="club-card__initials" style="background:${grad}">${escapeHtml(initials(negocio.nombre))}</div>`;

      const lugar = [negocio.ciudad, negocio.barrio].filter(Boolean).join(" · ");
      const delay = Math.min(i, 5);
      return `
      <article class="club-card cut-corners cut-corners--sm reveal" style="transition-delay:${delay * 0.06}s">
        ${avatar}
        <h3 class="club-card__name">${escapeHtml(negocio.nombre)}</h3>
        <span class="club-card__sport cut-corners cut-corners--xs">${escapeHtml(categoriaLabel(negocio.categoria))}</span>
        ${lugar ? `<p class="club-card__meta" style="font-size:0.8rem;opacity:0.75;margin:0.25rem 0 0">${escapeHtml(lugar)}</p>` : ""}
        <a href="/${escapeHtml(negocio.slug)}" class="btn-arena btn-arena--primary cut-corners">Reservar turno</a>
      </article>`;
    })
    .join("");

  clubsGrid.querySelectorAll(".reveal").forEach((el) => {
    requestAnimationFrame(() => el.classList.add("is-visible"));
  });
}

searchInput?.addEventListener("input", renderGrid);
ciudadFilter?.addEventListener("change", renderGrid);

async function initNegocios() {
  try {
    let res = await fetch("/api/negocios");
    if (!res.ok) res = await fetch("/api/clubs");
    allNegocios = await res.json();
    loading?.classList.add("hidden");
    populateCiudades();
    renderGrid();

    const statNum = document.getElementById("statClubsNum");
    const statPlus = document.getElementById("statClubs");
    if (statNum && allNegocios.length > 0) {
      statNum.textContent = String(allNegocios.length);
      if (statPlus) statPlus.textContent = allNegocios.length >= 10 ? "+" : "";
    }
  } catch (_) {
    if (loading) {
      loading.innerHTML = "<p>No se pudo cargar la lista de negocios.</p>";
    }
  }
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

/* ─── Boot ─── */
initNav();
initHero();
initReveal();
initCategories();
initNegocios();
initSteps();
initBenefits();
