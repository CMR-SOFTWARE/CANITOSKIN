function getSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] || "";
}
const SLUG = getSlug();

const CATEGORIA_LABEL = {
  peluqueria: "Peluquería",
  estetica: "Estética",
  masajes: "Masajes",
  psicologia: "Psicología",
  legal: "Legal",
  otro: "Otro",
};

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function categoriaLabel(c) {
  return CATEGORIA_LABEL[c] || (c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : "");
}

function formatMoney(n) {
  const num = Number(String(n).replace(/[^\d.]/g, "")) || 0;
  return num.toLocaleString("es-AR");
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

function formatFecha(fechaIso) {
  const [yyyy, mm, dd] = String(fechaIso).split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatFechaLarga(fechaIso) {
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  if (!y || !m || !d) return formatFecha(fechaIso);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function todayISO() {
  const date = new Date();
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date - tzOffset).toISOString().split("T")[0];
}

function toISODate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function initials(nombre) {
  return String(nombre || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function isHorarioPasado(fechaIso, horario) {
  const [year, month, day] = String(fechaIso).split("-").map(Number);
  const [hour = 0, minute = 0] = String(horario).split(":").map(Number);
  if (
    !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
    !Number.isFinite(hour) || !Number.isFinite(minute)
  ) return false;
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime() < Date.now();
}

function formatDiasAtencion(dias) {
  const labels = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };
  const list = Array.isArray(dias) && dias.length ? dias.map(Number) : [1, 2, 3, 4, 5];
  const sorted = [...new Set(list)].sort((a, b) => {
    const order = (d) => (d === 0 ? 7 : d);
    return order(a) - order(b);
  });
  if (sorted.length === 7) return "Todos los días";
  const weekdays = [1, 2, 3, 4, 5];
  if (weekdays.every((d) => sorted.includes(d)) && sorted.length === 5) return "Lunes a viernes";
  if (weekdays.every((d) => sorted.includes(d)) && sorted.includes(6) && sorted.length === 6) {
    return "Lunes a sábados";
  }
  return sorted.map((d) => labels[d] || d).join(", ");
}

function formatHorarioNegocio(cfg) {
  const parts = [];
  if (cfg.horaInicio != null && cfg.horaFin != null) {
    parts.push(`${cfg.horaInicio}:00–${cfg.horaFin}:00`);
  }
  if (cfg.horaInicio2 != null && cfg.horaFin2 != null) {
    parts.push(`${cfg.horaInicio2}:00–${cfg.horaFin2}:00`);
  }
  const horas = parts.join(" · ");
  const dias = formatDiasAtencion(cfg.diasAtencion);
  if (horas && dias) return `${dias} · ${horas}`;
  return horas || dias || "";
}

function isDiaAtencion(fechaIso) {
  const pro = getSelectedProfessional();
  let days;
  if (pro?.horarioPropio && Array.isArray(pro.diasAtencion) && pro.diasAtencion.length) {
    days = pro.diasAtencion.map(Number);
  } else if (pro?.diasAtencion && Array.isArray(pro.diasAtencion) && pro.diasAtencion.length && (pro.horaInicio != null)) {
    days = pro.diasAtencion.map(Number);
  } else if (Array.isArray(config?.diasAtencion) && config.diasAtencion.length) {
    days = config.diasAtencion.map(Number);
  } else {
    days = [1, 2, 3, 4, 5];
  }
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  if (!y || !m || !d) return false;
  return days.includes(new Date(y, m - 1, d).getDay());
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

/* ── DOM ── */
const screenBusiness = document.getElementById("screenBusiness");
const screenWizard = document.getElementById("screenWizard");
const btnHome = document.getElementById("btnHome");
const btnWizardBack = document.getElementById("btnWizardBack");
const navBusinessName = document.getElementById("navBusinessName");
const heroNombre = document.getElementById("heroNombre");
const heroCategoria = document.getElementById("heroCategoria");
const heroTagline = document.getElementById("heroTagline");
const businessMeta = document.getElementById("businessMeta");
const serviciosList = document.getElementById("serviciosList");
const equipoSection = document.getElementById("equipoSection");
const equipoList = document.getElementById("equipoList");

const wizardStepLabel = document.getElementById("wizardStepLabel");
const wizardServiceChip = document.getElementById("wizardServiceChip");
const wizardProgressBar = document.getElementById("wizardProgressBar");
const stepProfessional = document.getElementById("stepProfessional");
const stepFecha = document.getElementById("stepFecha");
const stepDatos = document.getElementById("stepDatos");
const stepPago = document.getElementById("stepPago");
const stepConfirmacion = document.getElementById("stepConfirmacion");
const profesionalesList = document.getElementById("profesionalesList");
const calPrev = document.getElementById("calPrev");
const calNext = document.getElementById("calNext");
const calMonthLabel = document.getElementById("calMonthLabel");
const calGrid = document.getElementById("calGrid");
const horariosContainer = document.getElementById("horarios");
const slotsHint = document.getElementById("slotsHint");
const reservaSummary = document.getElementById("reservaSummary");
const formDatos = document.getElementById("formDatos");
const formReserva = document.getElementById("formReserva");
const mensaje = document.getElementById("mensaje");
const aliasTransferencia = document.getElementById("aliasTransferencia");
const cbuTransferencia = document.getElementById("cbuTransferencia");
const titularTransferencia = document.getElementById("titularTransferencia");
const senaMonto = document.getElementById("senaMonto");
const telefonoInput = document.getElementById("telefono");
const btnVolverDatos = document.getElementById("btnVolverDatos");
const btnSolicitarCancelacion = document.getElementById("btnSolicitarCancelacion");

let config = null;
let selectedServiceId = null;
let selectedProfessionalId = null;
let selectedFecha = null;
let selectedHora = null;
let slotsActuales = [];
let calYear = 0;
let calMonth = 0; // 0-indexed
let wizardStep = null; // 'professional' | 'fecha' | 'datos' | 'pago' | 'confirmacion'
let clientNombre = "";
let clientTelefono = "";
let slotsPollTimer = null;
let slotsPollInFlight = false;
let lastSlotsSig = "";
const SLOTS_POLL_MS = 3000;

function professionalsForSelectedService() {
  const all = (config?.professionals || []).filter((p) => p.activo !== false);
  if (!selectedServiceId) return all;
  const sid = Number(selectedServiceId);
  const fromPro = all.filter((p) =>
    Array.isArray(p.serviceIds) && p.serviceIds.map(Number).includes(sid)
  );
  if (fromPro.length) return fromPro;
  const svc = getSelectedService();
  const ids = Array.isArray(svc?.professionalIds) ? svc.professionalIds.map(Number) : [];
  if (ids.length) return all.filter((p) => ids.includes(Number(p.id)));
  if (svc?.professionalId != null) {
    return all.filter((p) => Number(p.id) === Number(svc.professionalId));
  }
  return all;
}

function needsProfessionalStep() {
  return professionalsForSelectedService().length > 1;
}

function getSelectedService() {
  return (config?.services || []).find((s) => String(s.id) === String(selectedServiceId));
}

function getSelectedProfessional() {
  const list = professionalsForSelectedService();
  if (selectedProfessionalId) {
    return list.find((p) => String(p.id) === String(selectedProfessionalId)) || null;
  }
  if (list.length === 1) return list[0];
  return null;
}

function wizardSteps() {
  const steps = [];
  if (needsProfessionalStep()) steps.push("professional");
  steps.push("fecha", "datos", "pago");
  return steps;
}

function setMensaje(texto, isError = true) {
  mensaje.textContent = texto;
  mensaje.style.color = isError ? "var(--danger)" : "var(--success)";
}

function showScreen(which) {
  const isBiz = which === "business";
  screenBusiness.classList.toggle("hidden", !isBiz);
  screenWizard.classList.toggle("hidden", isBiz);
  btnWizardBack.classList.toggle("hidden", isBiz);
}

function updateProgress() {
  const steps = wizardSteps();
  let idx = steps.indexOf(wizardStep);
  if (wizardStep === "confirmacion") idx = steps.length;
  const pct = Math.max(8, Math.round(((idx + 1) / (steps.length + 1)) * 100));
  wizardProgressBar.style.width = `${pct}%`;

  const labels = {
    professional: "Paso · Profesional",
    fecha: "Paso · Fecha y horario",
    datos: "Paso · Tus datos",
    pago: "Paso · Pago",
    confirmacion: "Confirmación",
  };
  wizardStepLabel.textContent = labels[wizardStep] || "";
  const svc = getSelectedService();
  wizardServiceChip.textContent = svc?.nombre || "";
}

function showWizardStep(step) {
  wizardStep = step;
  showScreen("wizard");
  [
    stepProfessional,
    stepFecha,
    stepDatos,
    stepPago,
    stepConfirmacion,
  ].forEach((el) => el.classList.add("hidden"));

  const map = {
    professional: stepProfessional,
    fecha: stepFecha,
    datos: stepDatos,
    pago: stepPago,
    confirmacion: stepConfirmacion,
  };
  map[step]?.classList.remove("hidden");
  if (step === "pago") updateSenaMonto();
  updateProgress();
  if (step === "fecha") startSlotsLivePoll();
  else stopSlotsLivePoll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function serviceSenaAmount(svc) {
  if (!svc) return config?.precio || "0";
  if (svc.sena != null && String(svc.sena).trim() !== "") return svc.sena;
  return config?.precio || "0";
}

function updateSenaMonto() {
  if (!senaMonto) return;
  senaMonto.textContent = formatPrice(serviceSenaAmount(getSelectedService()));
}

function resetWizardState() {
  selectedServiceId = null;
  selectedProfessionalId = null;
  selectedFecha = null;
  selectedHora = null;
  slotsActuales = [];
  lastSlotsSig = "";
  clientNombre = "";
  clientTelefono = "";
  wizardStep = null;
  stopSlotsLivePoll();
  formDatos?.reset();
  formReserva?.reset();
  setMensaje("");
  horariosContainer.innerHTML = "";
  slotsHint.textContent = "Seleccioná un día en el calendario.";
}

function goHome() {
  resetWizardState();
  showScreen("business");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startBooking(serviceId) {
  selectedServiceId = serviceId;
  selectedProfessionalId = null;
  selectedFecha = todayISO();
  selectedHora = null;
  clientNombre = "";
  clientTelefono = "";
  formDatos?.reset();
  formReserva?.reset();
  setMensaje("");

  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  const pros = professionalsForSelectedService();
  if (!pros.length) {
    setMensaje("Este servicio todavía no tiene un profesional asignado. Consultá al negocio.");
    return;
  }

  if (needsProfessionalStep()) {
    renderProfessionals();
    showWizardStep("professional");
  } else {
    selectedProfessionalId = pros[0].id;
    renderCalendar();
    showWizardStep("fecha");
    refreshSlots().catch(() => {});
  }
}

function wizardBack() {
  if (wizardStep === "confirmacion") {
    goHome();
    return;
  }
  const steps = wizardSteps();
  const idx = steps.indexOf(wizardStep);
  if (idx <= 0) {
    goHome();
    return;
  }
  const prev = steps[idx - 1];
  if (prev === "fecha") {
    selectedHora = null;
    renderCalendar();
  }
  showWizardStep(prev);
}

/* ── Screen A renders ── */
function renderBusinessMeta() {
  const bits = [];
  const lugar = [config.direccion, config.ciudad].filter(Boolean).join(", ");
  if (lugar) {
    bits.push(`
      <span class="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-4.5 7-10a7 7 0 10-14 0c0 5.5 7 10 7 10z"/><circle cx="12" cy="11" r="2.5"/></svg>
        ${escapeHtml(lugar)}
      </span>`);
  }
  const horario = formatHorarioNegocio(config);
  if (horario) {
    bits.push(`
      <span class="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        ${escapeHtml(horario)}
      </span>`);
  }
  businessMeta.innerHTML = bits.join("");
}

function renderServicios() {
  const services = (config?.services || []).filter((s) => s.activo !== false);
  if (!services.length) {
    serviciosList.innerHTML = `<p class="text-sm text-secondary">No hay servicios disponibles.</p>`;
    return;
  }

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
    groups[key].forEach((s) => {
      const dur = formatDuracion(s.duracionMin ?? s.duracion_min);
      const precio = s.precio != null && s.precio !== "" ? formatPrice(s.precio) : "";
      const senaVal = s.sena != null && String(s.sena).trim() !== "" && Number(String(s.sena).replace(/[^\d.-]/g, "")) > 0
        ? formatPrice(s.sena)
        : "";
      html += `
        <article class="svc-card">
          <div class="svc-card__top">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-primary leading-snug">${escapeHtml(s.nombre)}</h3>
              ${s.descripcion ? `<p class="mt-1 text-meta text-secondary">${escapeHtml(s.descripcion)}</p>` : ""}
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
            <button type="button" data-service-id="${escapeHtml(s.id)}" class="svc-card__btn">
              Reservar
            </button>
          </div>
        </article>`;
    });
  });
  serviciosList.innerHTML = html;
}

function buildPlanWhatsAppUrl(plan) {
  const wa = String(config?.whatsappNumero || "").replace(/\D/g, "");
  if (!wa) return null;
  const sesiones = Number(plan.sesiones) || 0;
  const text = [
    `Hola! Me interesa el plan "${plan.nombre}".`,
    sesiones ? `Incluye ${sesiones} sesiones.` : null,
    plan.precio ? `Precio: ${formatPrice(plan.precio)}.` : null,
    "¿Me contás cómo lo reservo?",
  ].filter(Boolean).join("\n");
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

function renderPlanes() {
  const section = document.getElementById("planesSection");
  const list = document.getElementById("planesList");
  if (!section || !list) return;

  const plans = (config?.plans || []).filter((p) => p.activo !== false);
  if (!plans.length) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  list.innerHTML = plans
    .map((p) => {
      const sesiones = Number(p.sesiones) || 0;
      const precio = p.precio != null && p.precio !== "" ? formatPrice(p.precio) : "";
      const waUrl = buildPlanWhatsAppUrl(p);
      return `
        <article class="svc-card plan-card">
          <div class="svc-card__top">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-primary leading-snug">${escapeHtml(p.nombre)}</h3>
              ${p.descripcion ? `<p class="mt-1 text-meta text-secondary">${escapeHtml(p.descripcion)}</p>` : ""}
            </div>
            <div class="svc-card__prices shrink-0 text-right">
              ${precio ? `<span class="svc-card__price">${escapeHtml(precio)}</span>` : ""}
            </div>
          </div>
          <div class="svc-card__footer">
            <span class="svc-card__dur">${sesiones ? `${sesiones} sesión${sesiones === 1 ? "" : "es"}` : "Plan"}</span>
            ${
              waUrl
                ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="svc-card__btn">Consultar</a>`
                : `<span class="text-meta text-secondary">WhatsApp no configurado</span>`
            }
          </div>
        </article>`;
    })
    .join("");
}

function renderEquipo() {
  const count = Number(config?.professionalsCount) || 0;
  const pros = config?.professionals || [];
  if (count <= 0 || !pros.length) {
    equipoSection.classList.add("hidden");
    return;
  }
  equipoSection.classList.remove("hidden");
  equipoList.innerHTML = pros.map((p) => {
    const avatar = p.fotoUrl
      ? `<img src="${escapeHtml(p.fotoUrl)}" alt="${escapeHtml(p.nombre)}" class="team-avatar team-avatar--img" loading="lazy" />`
      : `<div class="team-avatar" aria-hidden="true">${escapeHtml(initials(p.nombre))}</div>`;
    const rol = p.especialidad || "";
    const mat = p.matricula ? `Mat. ${p.matricula}` : "";
    return `
    <div class="flex w-28 flex-col items-center gap-2 text-center">
      ${avatar}
      <div>
        <p class="text-meta font-medium leading-snug text-primary">${escapeHtml(p.nombre)}</p>
        ${rol ? `<p class="text-xs text-secondary mt-0.5">${escapeHtml(rol)}</p>` : ""}
        ${mat ? `<p class="text-[11px] text-secondary/80 mt-0.5">${escapeHtml(mat)}</p>` : ""}
      </div>
    </div>`;
  }).join("");
}

function setNavLogo() {
  const navLogo = document.getElementById("navLogo");
  if (!navLogo) return;
  if (config.logoUrl) {
    navLogo.outerHTML = `<img id="navLogo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.nombre)}" class="h-10 w-10 shrink-0 rounded-full object-contain bg-white p-0.5 ring-1 ring-border" crossorigin="anonymous" />`;
    const img = document.getElementById("navLogo");
    if (img) {
      const apply = () => {
        try {
          const c = document.createElement("canvas");
          c.width = 40; c.height = 40;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 40, 40);
          const data = ctx.getImageData(0, 0, 40, 40).data;
          let sum = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 40) continue;
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            n += 1;
          }
          const avg = n ? sum / n : 128;
          img.classList.toggle("bg-white", avg <= 160);
          img.classList.toggle("bg-zinc-950", avg > 160);
        } catch (_) { /* keep white */ }
      };
      if (img.complete && img.naturalWidth) apply();
      else img.addEventListener("load", apply, { once: true });
    }
  } else {
    navLogo.textContent = initials(config.nombre) || "·";
  }
}

/* ── Professional step ── */
function renderProfessionals() {
  const pros = professionalsForSelectedService();
  if (!pros.length) {
    profesionalesList.innerHTML = `<p class="text-sm text-secondary">No hay profesionales para este servicio.</p>`;
    return;
  }
  profesionalesList.innerHTML = pros.map((p) => {
    const sel = String(p.id) === String(selectedProfessionalId);
    const avatar = p.fotoUrl
      ? `<img src="${escapeHtml(p.fotoUrl)}" alt="" class="pro-chip__avatar pro-chip__avatar--img" />`
      : `<span class="pro-chip__avatar">${escapeHtml(initials(p.nombre))}</span>`;
    const meta = [
      p.especialidad,
      p.matricula ? `Mat. ${p.matricula}` : "",
      p.horarioPropio && p.horaInicio != null && p.horaFin != null
        ? `${p.horaInicio}:00–${p.horaFin}:00`
        : "",
    ].filter(Boolean).join(" · ");
    return `
      <button type="button" data-pro-id="${escapeHtml(p.id)}"
        class="pro-chip ${sel ? "is-selected" : ""}">
        ${avatar}
        <span class="min-w-0 text-left">
          <span class="block font-semibold text-primary truncate">${escapeHtml(p.nombre)}</span>
          ${meta ? `<span class="block text-xs text-secondary truncate">${escapeHtml(meta)}</span>` : ""}
        </span>
      </button>`;
  }).join("");
}

profesionalesList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pro-id]");
  if (!btn) return;
  selectedProfessionalId = btn.dataset.proId;
  renderProfessionals();
  selectedFecha = todayISO();
  selectedHora = null;
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
  showWizardStep("fecha");
  refreshSlots().catch(() => {});
});

/* ── Calendar ── */
function renderCalendar() {
  const today = todayISO();
  calMonthLabel.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  let html = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  const first = new Date(calYear, calMonth, 1);
  let startDow = first.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Monday-first

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

  for (let i = 0; i < startDow; i++) {
    const day = prevMonthDays - startDow + i + 1;
    html += `<button type="button" class="cal-day is-outside" disabled>${day}</button>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toISODate(calYear, calMonth + 1, d);
    const isPast = iso < today;
    const cerrado = !isDiaAtencion(iso);
    const isToday = iso === today;
    const isSelected = iso === selectedFecha;
    const classes = [
      "cal-day",
      isToday ? "is-today" : "",
      isSelected ? "is-selected" : "",
      cerrado && !isPast ? "is-closed" : "",
    ].filter(Boolean).join(" ");
    html += `<button type="button" class="${classes}" data-fecha="${iso}" ${isPast || cerrado ? "disabled" : ""}>${d}</button>`;
  }

  const totalCells = startDow + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    html += `<button type="button" class="cal-day is-outside" disabled>${i}</button>`;
  }

  calGrid.innerHTML = html;
}

calGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-fecha]");
  if (!btn || btn.disabled) return;
  selectedFecha = btn.dataset.fecha;
  selectedHora = null;
  renderCalendar();
  try {
    await refreshSlots();
  } catch (err) {
    slotsHint.textContent = err.message || "Error al cargar horarios.";
    horariosContainer.innerHTML = "";
  }
});

calPrev.addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 0) { calMonth = 11; calYear -= 1; }
  renderCalendar();
});

calNext.addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 11) { calMonth = 0; calYear += 1; }
  renderCalendar();
});

/* ── Slots ── */
async function loadDisponibilidad() {
  if (!selectedServiceId) throw new Error("Seleccioná un servicio primero.");
  if (!selectedFecha) throw new Error("Seleccioná una fecha.");

  const params = new URLSearchParams({
    fecha: selectedFecha,
    serviceId: selectedServiceId,
  });
  if (selectedProfessionalId) {
    params.set("professionalId", selectedProfessionalId);
  }

  const response = await fetch(`/api/${SLUG}/disponibilidad?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudieron cargar los horarios.");
  const data = await response.json();
  slotsActuales = data.slots || data || [];
  if (!Array.isArray(slotsActuales)) slotsActuales = [];
  lastSlotsSig = slotsActuales.join("|");
}

function renderSlots() {
  horariosContainer.innerHTML = "";
  if (!slotsActuales.length) {
    slotsHint.textContent = "No hay horarios disponibles para esa fecha.";
    return;
  }
  slotsHint.textContent = "Tocá un horario para continuar. Se actualiza en vivo.";

  slotsActuales.forEach((horario) => {
    const pasado = isHorarioPasado(selectedFecha, horario);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = horario;
    btn.className = "slot-pill";
    if (pasado) {
      btn.disabled = true;
      btn.title = "Horario ya pasado";
    } else if (horario === selectedHora) {
      btn.classList.add("is-selected");
    } else {
      btn.addEventListener("click", () => {
        selectedHora = horario;
        renderSlots();
        renderDatosSummary();
        showWizardStep("datos");
      });
    }
    horariosContainer.appendChild(btn);
  });
}

async function refreshSlots() {
  if (!selectedFecha) selectedFecha = todayISO();
  if (!selectedServiceId) {
    slotsHint.textContent = "Seleccioná un servicio para ver los horarios disponibles.";
    horariosContainer.innerHTML = "";
    return;
  }
  slotsHint.textContent = "Cargando horarios…";
  await loadDisponibilidad();
  renderSlots();
}

async function pollSlotsSilent() {
  if (slotsPollInFlight || document.hidden) return;
  if (wizardStep !== "fecha" || !selectedServiceId || !selectedFecha) return;
  slotsPollInFlight = true;
  try {
    const prevSelected = selectedHora;
    const params = new URLSearchParams({
      fecha: selectedFecha,
      serviceId: selectedServiceId,
    });
    if (selectedProfessionalId) {
      params.set("professionalId", selectedProfessionalId);
    }
    const response = await fetch(`/api/${SLUG}/disponibilidad?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const next = data.slots || data || [];
    const list = Array.isArray(next) ? next : [];
    const sig = list.join("|");
    if (sig === lastSlotsSig) return;
    slotsActuales = list;
    lastSlotsSig = sig;
    if (prevSelected && !list.includes(prevSelected)) {
      selectedHora = null;
    }
    renderSlots();
  } catch (_) {
    /* silencioso */
  } finally {
    slotsPollInFlight = false;
  }
}

function startSlotsLivePoll() {
  stopSlotsLivePoll();
  slotsPollTimer = setInterval(pollSlotsSilent, SLOTS_POLL_MS);
}

function stopSlotsLivePoll() {
  if (slotsPollTimer) {
    clearInterval(slotsPollTimer);
    slotsPollTimer = null;
  }
}

/* ── Datos / pago ── */
function renderDatosSummary() {
  const service = getSelectedService();
  const pro = getSelectedProfessional();
  const parts = [
    service?.nombre,
    pro?.nombre,
    selectedFecha ? formatFechaLarga(selectedFecha) : "",
    selectedHora ? `${selectedHora}hs` : "",
  ].filter(Boolean);
  reservaSummary.innerHTML = `
    <strong>Resumen</strong>
    <span>${parts.map(escapeHtml).join(" · ")}</span>
  `;
}

function validarDatos() {
  const nombre = document.getElementById("nombre").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  if (nombre.length < 3) {
    alert("Ingresá nombre y apellido.");
    return false;
  }
  if (!/^\d{6,15}$/.test(telefono)) {
    alert("Ingresá un teléfono válido (solo números).");
    return false;
  }
  clientNombre = nombre;
  clientTelefono = telefono;
  return true;
}

function buildWhatsAppUrl(reserva) {
  const comprobanteTexto = reserva.comprobanteUrl
    ? `Comprobante: ${reserva.comprobanteUrl}`
    : "Comprobante: cargado en la web";
  const pro = getSelectedProfessional();
  const text = [
    "Hola, quiero confirmar mi turno:",
    `Nombre: ${reserva.nombre}`,
    `Teléfono: ${reserva.telefono}`,
    `Servicio: ${getSelectedService()?.nombre || reserva.servicio || ""}`,
    pro?.nombre ? `Profesional: ${pro.nombre}` : null,
    `Fecha: ${formatFecha(reserva.fecha || selectedFecha)}`,
    `Horario: ${reserva.horaInicio || reserva.horario || selectedHora}hs`,
    comprobanteTexto,
    "Ya realicé la transferencia.",
  ].filter(Boolean).join("\n");
  return `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(text)}`;
}

function buildCancelacionWhatsAppUrl() {
  const service = getSelectedService();
  const fecha = selectedFecha ? formatFecha(selectedFecha) : "(indicar fecha)";
  const texto = [
    "Hola, quiero solicitar la cancelación de un turno.",
    `Servicio: ${service?.nombre || "(indicar servicio)"}`,
    `Fecha: ${fecha}`,
    "Horario: (indicar horario)",
    "Nombre y teléfono: (indicar datos)",
  ].join("\n");
  return `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(texto)}`;
}

function showConfirmacion(reserva) {
  const detalle = document.getElementById("confirmacionDetalle");
  const pro = getSelectedProfessional();
  if (detalle) {
    detalle.innerHTML = [
      `<p><strong>Nombre:</strong> ${escapeHtml(reserva.nombre)}</p>`,
      `<p><strong>Servicio:</strong> ${escapeHtml(getSelectedService()?.nombre || "")}</p>`,
      pro?.nombre ? `<p><strong>Profesional:</strong> ${escapeHtml(pro.nombre)}</p>` : "",
      `<p><strong>Fecha:</strong> ${escapeHtml(formatFecha(reserva.fecha || selectedFecha))}</p>`,
      `<p><strong>Horario:</strong> ${escapeHtml(reserva.horaInicio || reserva.horario || selectedHora)}hs</p>`,
      `<p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 text-xs">Para cancelar, abrí “Mis turnos” e ingresá el teléfono de la reserva.</p>`,
    ].filter(Boolean).join("");
  }
  const btnWa = document.getElementById("btnWhatsAppConfirm");
  if (btnWa) btnWa.href = buildWhatsAppUrl(reserva);
  showWizardStep("confirmacion");
  setMensaje("");
}

/* ── Events ── */
serviciosList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-service-id]");
  if (!btn) return;
  startBooking(btn.dataset.serviceId);
});

btnHome.addEventListener("click", goHome);
btnWizardBack.addEventListener("click", wizardBack);

telefonoInput.addEventListener("input", () => {
  telefonoInput.value = telefonoInput.value.replace(/\D/g, "");
});

formDatos.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validarDatos()) return;
  setMensaje("");
  showWizardStep("pago");
});

btnVolverDatos.addEventListener("click", () => {
  showWizardStep("datos");
  setMensaje("");
});

btnSolicitarCancelacion.addEventListener("click", () => {
  if (!config?.whatsappNumero) {
    alert("No hay número de WhatsApp configurado.");
    return;
  }
  if (!window.confirm("¿Estás seguro de que querés solicitar la cancelación del turno?")) return;
  window.location.href = buildCancelacionWhatsAppUrl();
});

formReserva.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedServiceId || !selectedFecha || !selectedHora) return;

  const formData = new FormData(formReserva);
  formData.set("nombre", clientNombre || document.getElementById("nombre").value.trim());
  formData.set("telefono", clientTelefono || document.getElementById("telefono").value.trim());
  formData.set("serviceId", selectedServiceId);
  formData.set("fecha", selectedFecha);
  formData.set("horaInicio", selectedHora);
  if (selectedProfessionalId) {
    formData.set("professionalId", selectedProfessionalId);
  }

  try {
    setMensaje("Guardando reserva…", false);
    const response = await fetch(`/api/${SLUG}/reservas`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar la reserva.");
    showConfirmacion(data);
  } catch (error) {
    setMensaje(error.message || "Error al reservar.");
  }
});

document.getElementById("btnOtraReserva").addEventListener("click", goHome);

/* ── Mis turnos ── */
const misTelefonoInput = document.getElementById("misTelefono");
const btnMisReservas = document.getElementById("btnMisReservas");
const misTurnosList = document.getElementById("misTurnosList");
const misTurnosMsg = document.getElementById("misTurnosMsg");

function setMisTurnosMsg(text, isError = false) {
  if (!misTurnosMsg) return;
  misTurnosMsg.textContent = text || "";
  misTurnosMsg.style.color = isError ? "var(--danger)" : "var(--success)";
}

async function cancelarPorToken(token) {
  let response = await fetch(`/api/${SLUG}/cancelar/${encodeURIComponent(token)}`, { method: "POST" });
  if (response.status === 405 || response.status === 404) {
    response = await fetch(`/api/${SLUG}/cancelar/${encodeURIComponent(token)}`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo cancelar.");
  return data;
}

async function cargarMisReservas() {
  const tel = misTelefonoInput.value.trim();
  if (!/^\d{6,15}$/.test(tel)) {
    misTurnosList.innerHTML = `<p class="text-sm text-danger">Ingresá un número de teléfono válido (solo números).</p>`;
    return;
  }
  setMisTurnosMsg("");
  misTurnosList.innerHTML = `<p class="text-sm text-secondary">Buscando…</p>`;
  try {
    const response = await fetch(`/api/${SLUG}/mis-reservas?telefono=${encodeURIComponent(tel)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Error al consultar.");
    if (!data.length) {
      misTurnosList.innerHTML = `<p class="text-sm text-secondary">No se encontraron turnos activos para ese número.</p>`;
      return;
    }
    misTurnosList.innerHTML = data.map((r) => {
      const serviceName = r.servicio || r.serviceNombre || r.serviceName ||
        (config?.services || []).find((s) => String(s.id) === String(r.serviceId || r.service_id))?.nombre ||
        "Servicio";
      const proName = r.profesional || r.professionalNombre || "";
      const hora = r.horaInicio || r.horario || r.hora_inicio || "";
      const token = r.cancelToken || r.cancel_token || "";
      const estadoColor = r.estado === "confirmada"
        ? "border-business-accent/30 bg-business-accent-light text-business-accent"
        : "border-amber-200 bg-amber-50 text-amber-700";
      const estadoLabel = r.estado === "confirmada" ? "Pagado" : "Sin pagar";
      return `<div class="rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-card">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold text-primary">${escapeHtml(serviceName)}${proName ? ` · ${escapeHtml(proName)}` : ""}</p>
            <p class="mt-0.5 text-meta text-secondary">${formatFecha(r.fecha)} · ${escapeHtml(hora)}hs</p>
            <span class="mt-1.5 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${estadoColor}">${estadoLabel}</span>
          </div>
          ${token ? `<button type="button" data-cancel-token="${escapeHtml(token)}" class="shrink-0 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Cancelar</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch (e) {
    misTurnosList.innerHTML = `<p class="text-sm text-danger">${escapeHtml(e.message)}</p>`;
  }
}

misTelefonoInput.addEventListener("input", () => {
  misTelefonoInput.value = misTelefonoInput.value.replace(/\D/g, "");
});

misTelefonoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnMisReservas.click();
});

btnMisReservas.addEventListener("click", () => {
  cargarMisReservas();
});

misTurnosList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel-token]");
  if (!btn) return;
  const token = btn.getAttribute("data-cancel-token");
  if (!token) return;
  if (!window.confirm("¿Confirmás la cancelación de este turno?")) return;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    await cancelarPorToken(token);
    setMisTurnosMsg("Turno cancelado correctamente.", false);
    await cargarMisReservas();
  } catch (err) {
    setMisTurnosMsg(err.message || "Error al cancelar.", true);
    btn.disabled = false;
    btn.textContent = "Cancelar";
  }
});

/* ── Init ── */
async function loadConfig() {
  const response = await fetch(`/api/${SLUG}/config`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar la configuración.");
  config = await response.json();

  applyBrandColor(config.colorMarca || config.color_marca);

  aliasTransferencia.textContent = config.transferencia?.alias || "—";
  cbuTransferencia.textContent = config.transferencia?.cbu || "—";
  titularTransferencia.textContent = config.transferencia?.titular || "—";
  updateSenaMonto();

  const linkAdmin = document.getElementById("linkAdmin");
  if (linkAdmin) linkAdmin.href = `/${SLUG}/admin`;

  document.title = config.nombre ? `${config.nombre} · CMR Turnos` : "CMR Turnos";
  navBusinessName.textContent = config.nombre || "";
  heroNombre.textContent = config.nombre || "Reservá tu turno";
  const cat = categoriaLabel(config.categoria);
  heroCategoria.textContent = cat;
  heroTagline.textContent = cat
    ? `${cat} · Reservá online en minutos`
    : "Reservá online en minutos";

  setNavLogo();
  renderBusinessMeta();
  renderServicios();
  renderPlanes();
  renderEquipo();
}

async function init() {
  try {
    await loadConfig();
  } catch (error) {
    serviciosList.innerHTML = `<p class="text-sm text-danger">${escapeHtml(error.message || "Error inicializando.")}</p>`;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && wizardStep === "fecha") pollSlotsSilent();
  });
}

init();
