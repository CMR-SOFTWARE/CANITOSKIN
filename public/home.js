/* CMR Match — Landing interactions & clubs directory */

const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const clubsGrid = document.getElementById("clubsGrid");
const searchInput = document.getElementById("searchInput");
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
  "linear-gradient(135deg, #005C00, #71C55B)",
  "linear-gradient(135deg, #052000, #007B00)",
  "linear-gradient(135deg, #203500, #4EA93B)",
  "linear-gradient(135deg, #006600, #92E27A)",
  "linear-gradient(135deg, #007000, #B4FF9A)",
  "linear-gradient(135deg, #005200, #586E26)",
];

const DEPORTE_LABEL = {
  futbol: "Fútbol",
  padel: "Pádel",
  tenis: "Tenis",
  basquet: "Básquet",
  voley: "Voley",
  hockey: "Hockey",
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

function deporteLabel(d) {
  return DEPORTE_LABEL[d] || (d ? d.charAt(0).toUpperCase() + d.slice(1) : "Otro");
}

let allClubs = [];
let activeDeporte = "todos";

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

/* ─── Category & sport filters ─── */
function setActiveDeporte(deporte) {
  activeDeporte = deporte;

  categoriesGrid?.querySelectorAll(".category-chip, .category-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.deporte === deporte);
  });

  buildFilters();
  renderGrid();
}

function initCategories() {
  categoriesGrid?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-deporte]");
    if (!card) return;
    setActiveDeporte(card.dataset.deporte);
    document.getElementById("clubs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function buildFilters() {
  const deportes = [...new Set(allClubs.map((c) => c.deporte))];
  if (deportes.length <= 1) {
    sportFilters.hidden = true;
    return;
  }

  sportFilters.hidden = false;
  const all = ["todos", ...deportes];
  sportFilters.innerHTML = all
    .map(
      (d) => `
    <button type="button" data-deporte="${d}"
      class="sport-filter-btn cut-corners cut-corners--xs ${d === activeDeporte ? "is-active" : ""}">
      ${d === "todos" ? "Todos" : deporteLabel(d)}
    </button>`
    )
    .join("");
}

function initSportFilters() {
  sportFilters?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-deporte]");
    if (!btn) return;
    setActiveDeporte(btn.dataset.deporte);
  });
}

/* ─── Clubs grid ─── */
function renderGrid() {
  const query = searchInput?.value.trim().toLowerCase() || "";

  const filtered = allClubs.filter((c) => {
    const matchDeporte = activeDeporte === "todos" || c.deporte === activeDeporte;
    const matchSearch = !query || c.nombre.toLowerCase().includes(query);
    return matchDeporte && matchSearch;
  });

  if (!filtered.length) {
    clubsGrid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    const msg = emptyState.querySelector("p");
    if (msg) {
      msg.textContent =
        query || activeDeporte !== "todos"
          ? "No se encontraron clubs con ese criterio."
          : "No hay clubs disponibles aún.";
    }
    return;
  }

  emptyState.classList.add("hidden");
  clubsGrid.classList.remove("hidden");

  clubsGrid.innerHTML = filtered
    .map((club, i) => {
      const grad = gradientForSlug(club.slug);
      const avatar = club.logoUrl
        ? `<img src="${club.logoUrl}" alt="${club.nombre}" class="club-card__avatar" loading="lazy" />`
        : `<div class="club-card__initials" style="background:${grad}">${initials(club.nombre)}</div>`;

      const delay = Math.min(i, 5);
      return `
      <article class="club-card cut-corners cut-corners--sm reveal" style="transition-delay:${delay * 0.06}s">
        ${avatar}
        <h3 class="club-card__name">${club.nombre}</h3>
        <span class="club-card__sport cut-corners cut-corners--xs">${deporteLabel(club.deporte)}</span>
        <a href="/${club.slug}" class="btn-arena btn-arena--primary cut-corners">Reservar turno</a>
      </article>`;
    })
    .join("");

  clubsGrid.querySelectorAll(".reveal").forEach((el) => {
    requestAnimationFrame(() => el.classList.add("is-visible"));
  });
}

searchInput?.addEventListener("input", renderGrid);

async function initClubs() {
  try {
    const res = await fetch("/api/clubs");
    allClubs = await res.json();
    loading?.classList.add("hidden");
    buildFilters();
    renderGrid();

    const statNum = document.getElementById("statClubsNum");
    const statPlus = document.getElementById("statClubs");
    if (statNum && allClubs.length > 0) {
      statNum.textContent = String(allClubs.length);
      if (statPlus) statPlus.textContent = allClubs.length >= 10 ? "+" : "";
    }
  } catch (_) {
    if (loading) {
      loading.innerHTML = "<p>No se pudo cargar la lista de clubs.</p>";
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
initSportFilters();
initClubs();
initSteps();
initBenefits();
