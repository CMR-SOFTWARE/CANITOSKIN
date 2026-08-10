/* Canito Skin — Panel admin */
(function () {
  "use strict";

  function getBusinessSlug() {
    const reserved = new Set(["admin", "cart", "privacidad", "terminos"]);
    const parts = window.location.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    if (!first || reserved.has(first)) return "canito";
    return first;
  }

  const SLUG = getBusinessSlug();
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const DIAS_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function $(id) {
    return document.getElementById(id);
  }

  /** Comprime/redimensiona fotos del celular para no superar el límite de subida. */
  function compressImageFile(file, { maxSide = 1600, quality = 0.82, maxBytes = 5 * 1024 * 1024 } = {}) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith("image/")) {
        resolve(file);
        return;
      }
      if (file.size <= 1.2 * 1024 * 1024 && file.type !== "image/heic" && file.type !== "image/heif") {
        resolve(file);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const finish = (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = String(file.name || "foto").replace(/\.\w+$/, "") + ".jpg";
          resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
        };
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > maxBytes) {
              canvas.toBlob(finish, "image/jpeg", 0.7);
            } else {
              finish(blob);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function todayISO() {
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date - tzOffset).toISOString().split("T")[0];
  }

  function addDaysISO(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    const tz = dt.getTimezoneOffset() * 60000;
    return new Date(dt - tz).toISOString().split("T")[0];
  }

  function formatFecha(fechaIso) {
    if (!fechaIso) return "—";
    const [yyyy, mm, dd] = String(fechaIso).split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatMoney(n) {
    const num = Number(String(n).replace(/[^\d.-]/g, "")) || 0;
    return "$ " + num.toLocaleString("es-AR");
  }

  function formatDuration(mins) {
    const m = Number(mins) || 0;
    if (m <= 0) return "—";
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h && rest) return `${h}h ${rest}min`;
    if (h) return `${h}h`;
    return `${rest}min`;
  }

  function greetingForHour(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 12) return { text: "Buenos días", emoji: "☀️" };
    if (h >= 12 && h < 20) return { text: "Buenas tardes", emoji: "🌤️" };
    return { text: "Buenas noches", emoji: "🌙" };
  }

  function proColorFromId(id) {
    const palette = ["#0D9488", "#6366F1", "#2563EB", "#0891B2", "#4F46E5", "#0284C7", "#14B8A6", "#3B82F6"];
    const n = Math.abs(Number(id) || 0);
    let hash = n;
    const s = String(id ?? "0");
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  function initialsOf(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "N";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function trendLabel(current, previous) {
    if (!Number.isFinite(previous) || previous === 0) {
      if (!current) return { text: "sin comparación", cls: "trend-flat" };
      return { text: "nuevo período", cls: "trend-flat" };
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { text: "igual que antes", cls: "trend-flat" };
    const sign = pct > 0 ? "+" : "";
    return {
      text: `${sign}${pct}% vs período ant.`,
      cls: pct > 0 ? "trend-up" : "trend-down",
    };
  }

  function parsePrice(val) {
    const n = Number(String(val ?? "0").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function setMessage(el, text, isError = true) {
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "var(--danger)" : "var(--success)";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function minutesToHHMM(mins) {
    if (!Number.isFinite(mins)) return "";
    if (mins >= 24 * 60) return "24:00";
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }

  function hhmmToMinutes(hhmm) {
    if (hhmm == null || hhmm === "") return NaN;
    const s = String(hhmm).trim();
    if (s === "24:00") return 24 * 60;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return NaN;
  }

  /**
   * Normaliza lo que escribe el usuario a HH:MM.
   * Acepta: 9, 09:00, 9:00, 20.30, 20,30, 20.5 (→ 20:50 si un dígito de minutos).
   * Rechaza: "-", textos inválidos.
   */
  function normalizeClockInput(raw) {
    if (raw == null) return "";
    let s = String(raw).trim();
    if (!s) return "";
    s = s.replace(/\s+/g, "").replace(",", ".");
    if (s.includes("-") || /[^\d:.]/.test(s)) return "";

    if (/^\d{1,2}:\d{1,2}$/.test(s)) {
      const [hs, ms] = s.split(":");
      const h = Number(hs);
      const m = Number(ms);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 24 || m < 0 || m > 59) return "";
      if (h === 24 && m !== 0) return "";
      return h === 24 ? "24:00" : `${pad2(h)}:${pad2(m)}`;
    }

    // 20.30 / 20.5 → hora.minuto
    const dec = /^(\d{1,2})\.(\d{1,2})$/.exec(s);
    if (dec) {
      const h = Number(dec[1]);
      let m = Number(dec[2]);
      if (dec[2].length === 1) m *= 10; // 20.3 → 20:30
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 24 || m < 0 || m > 59) return "";
      if (h === 24 && m !== 0) return "";
      return h === 24 ? "24:00" : `${pad2(h)}:${pad2(m)}`;
    }

    // Solo hora entera: 9 / 20
    if (/^\d{1,2}$/.test(s)) {
      const h = Number(s);
      if (!Number.isFinite(h) || h < 0 || h > 24) return "";
      return h === 24 ? "24:00" : `${pad2(h)}:00`;
    }

    return "";
  }

  /** Acepta "09:15", 9 (hora legacy), 20.30 o minutos. */
  function scheduleToMinutes(raw) {
    if (raw == null || raw === "") return NaN;
    const normalized = normalizeClockInput(raw);
    if (normalized) return hhmmToMinutes(normalized);
    const s = String(raw).trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) return hhmmToMinutes(s);
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n)) return NaN;
    // Solo enteros 0-24 como hora legacy; NO decimales (20.30 no es 20.3 horas)
    if (Number.isInteger(n) && n >= 0 && n <= 24) return n * 60;
    if (n > 24 && n <= 24 * 60) return Math.round(n);
    return NaN;
  }

  function scheduleToClock(raw, fallback = "") {
    const normalized = normalizeClockInput(raw);
    if (normalized) return normalized;
    const mins = scheduleToMinutes(raw);
    return Number.isFinite(mins) ? minutesToHHMM(mins) : fallback;
  }

  function readAndNormalizeClockField(id) {
    const el = $(id);
    if (!el) return "";
    const normalized = normalizeClockInput(el.value);
    if (normalized) el.value = normalized;
    return normalized;
  }

  function bindClockInputNormalize(id) {
    const el = $(id);
    if (!el || el.dataset.clockBound === "1") return;
    el.dataset.clockBound = "1";
    el.addEventListener("blur", () => {
      const n = normalizeClockInput(el.value);
      if (n) el.value = n;
      else if (String(el.value || "").trim()) {
        // deja el valor para que el usuario corrija, pero avisa en placeholder
        el.setCustomValidity("Usá HH:MM (ej. 09:00 o 20:30)");
      } else {
        el.setCustomValidity("");
      }
    });
    el.addEventListener("input", () => el.setCustomValidity(""));
  }

  function buildDaySlots(stepMin = 15) {
    const step = stepMin || 15;
    const out = [];
    for (let m = 0; m <= 24 * 60; m += step) out.push(minutesToHHMM(m));
    return out;
  }

  function ensureHorariosDatalist() {
    const list = $("listaHorariosDia");
    if (!list || list.dataset.ready === "1") return;
    list.innerHTML = buildDaySlots(15).map((h) => `<option value="${h}"></option>`).join("");
    list.dataset.ready = "1";
  }

  function generateHorariosFromConfig(cfg, stepMin) {
    const step = stepMin || 15;
    const ranges = [];
    const a1 = scheduleToMinutes(cfg?.horaInicio ?? "09:00");
    const b1 = scheduleToMinutes(cfg?.horaFin ?? "20:00");
    if (Number.isFinite(a1) && Number.isFinite(b1) && a1 < b1) ranges.push([a1, b1]);
    const a2 = scheduleToMinutes(cfg?.horaInicio2);
    const b2 = scheduleToMinutes(cfg?.horaFin2);
    if (Number.isFinite(a2) && Number.isFinite(b2) && a2 < b2) ranges.push([a2, b2]);
    const out = [];
    for (const [start, end] of ranges) {
      for (let m = start; m <= end; m += step) out.push(minutesToHHMM(m));
    }
    return out;
  }

  function effectiveScheduleForPro(pro) {
    const base = {
      horaInicio: scheduleToClock(config?.horaInicio, "09:00"),
      horaFin: scheduleToClock(config?.horaFin, "20:00"),
      horaInicio2: config?.horaInicio2 != null ? scheduleToClock(config.horaInicio2) : null,
      horaFin2: config?.horaFin2 != null ? scheduleToClock(config.horaFin2) : null,
      diasAtencion: Array.isArray(config?.diasAtencion) && config.diasAtencion.length
        ? config.diasAtencion.map(Number)
        : [1, 2, 3, 4, 5],
    };
    if (!pro) return base;
    const hasHours =
      Number.isFinite(scheduleToMinutes(pro.horaInicio)) &&
      Number.isFinite(scheduleToMinutes(pro.horaFin));
    const hasDays = Array.isArray(pro.diasAtencion) && pro.diasAtencion.length;
    if (!hasHours) {
      return hasDays ? { ...base, diasAtencion: pro.diasAtencion.map(Number) } : base;
    }
    return {
      horaInicio: scheduleToClock(pro.horaInicio),
      horaFin: scheduleToClock(pro.horaFin),
      horaInicio2: pro.horaInicio2 != null && pro.horaInicio2 !== "" ? scheduleToClock(pro.horaInicio2) : null,
      horaFin2: pro.horaFin2 != null && pro.horaFin2 !== "" ? scheduleToClock(pro.horaFin2) : null,
      diasAtencion: hasDays ? pro.diasAtencion.map(Number) : base.diasAtencion,
    };
  }

  function scheduleOpenRanges(sched) {
    const ranges = [];
    const a1 = scheduleToMinutes(sched?.horaInicio);
    const b1 = scheduleToMinutes(sched?.horaFin);
    if (Number.isFinite(a1) && Number.isFinite(b1) && a1 < b1) ranges.push({ start: a1, end: b1 });
    const a2 = scheduleToMinutes(sched?.horaInicio2);
    const b2 = scheduleToMinutes(sched?.horaFin2);
    if (Number.isFinite(a2) && Number.isFinite(b2) && a2 < b2) ranges.push({ start: a2, end: b2 });
    return ranges;
  }

  function isMinuteInSchedule(sched, minute) {
    return scheduleOpenRanges(sched).some((r) => minute >= r.start && minute < r.end);
  }

  function isDiaAtencionSchedule(sched, fechaIso) {
    const days = Array.isArray(sched?.diasAtencion) && sched.diasAtencion.length
      ? sched.diasAtencion.map(Number)
      : [1, 2, 3, 4, 5];
    const [y, m, d] = String(fechaIso).split("-").map(Number);
    if (!y || !m || !d) return false;
    return days.includes(new Date(y, m - 1, d).getDay());
  }

  function generateHorarios(horaInicio, horaFin, stepMin) {
    return generateHorariosFromConfig({ horaInicio, horaFin }, stepMin);
  }

  function applyBrand(color) {
    const brand = color || "#6366F1";
    document.documentElement.style.setProperty("--business-accent", brand);
    document.documentElement.style.setProperty(
      "--business-accent-hover",
      `color-mix(in srgb, ${brand} 85%, black)`
    );
    document.documentElement.style.setProperty(
      "--business-accent-light",
      `color-mix(in srgb, ${brand} 12%, white)`
    );
  }

  function initialOf(name) {
    return initialsOf(name).slice(0, 1);
  }

  // ---- state ----
  let config = null;
  let adminToken = localStorage.getItem("adminToken") || "";
  let reservasActuales = [];
  let servicesCache = [];
  let professionalsCache = [];
  let plansCache = [];
  let movimientosCache = [];
  let editingMovimientoId = null;
  let currentView = "dashboard";
  let pollTimer = null;
  let pollInFlight = false;
  let lastReservasSig = "";
  let lastBloqueosSig = "";
  let lastMovimientosSig = "";
  const LIVE_POLL_MS = 2500;
  let agendaMode = "lista";
  let calWeekStart = null;
  let bloqueosCache = [];
  let bloqueosRecCache = [];
  let statsMode = "semana";
  let mobileNavOpen = false;
  let editingServiceId = null;
  let editingPlanId = null;
  let clientesQuery = "";
  let videosCache = [];
  let galeriaCache = [];

  // ---- API ----
  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && adminToken) {
        logout(false);
      }
      const err = new Error(data.error || "Error de servidor.");
      err.status = response.status;
      throw err;
    }
    return data;
  }

  // ---- helpers domain ----
  function serviceById(id) {
    return servicesCache.find((s) => Number(s.id) === Number(id)) || null;
  }

  function professionalById(id) {
    return professionalsCache.find((p) => Number(p.id) === Number(id)) || null;
  }

  function serviceName(r) {
    const s = serviceById(r.serviceId);
    return s?.nombre || "Servicio";
  }

  function professionalName(r) {
    if (r.professionalId == null) return "Sin asignar";
    return professionalById(r.professionalId)?.nombre || "Profesional";
  }

  function appointmentPrice(r) {
    const s = serviceById(r.serviceId);
    if (s) {
      const sena = parsePrice(s.sena);
      if (sena > 0) return sena;
      return parsePrice(s.precio);
    }
    return parsePrice(config?.precio);
  }

  function horaLabel(r) {
    const ini = r.horaInicio || r.horario || "";
    const fin = r.horaFin || "";
    return fin ? `${ini}–${fin}` : ini;
  }

  function estadoBadge(estado) {
    const map = {
      pendiente: { cls: "badge-warning", label: "Sin cobrar" },
      confirmada: { cls: "badge-success", label: "Pagado" },
      cancelada: { cls: "badge-danger", label: "Cancelada" },
    };
    const m = map[estado] || map.pendiente;
    return `<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}">${m.label}</span>`;
  }

  function whatsappHref(r) {
    const telefono = String(r.telefono || "").replace(/\D/g, "");
    const texto = encodeURIComponent(
      `Hola ${r.nombre}, te contactamos sobre tu turno de ${serviceName(r)} el ${formatFecha(r.fecha)} a las ${r.horaInicio || r.horario || ""}hs.`
    );
    return `https://wa.me/${telefono}?text=${texto}`;
  }

  function activeProfessionals() {
    return professionalsCache.filter((p) => p.activo !== false);
  }

  function fillProfessionalSelects() {
    const pros = activeProfessionals();
    const optsAll =
      `<option value="">Todos / cualquiera</option>` +
      pros.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</option>`).join("");
    const optsOnly = pros
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</option>`)
      .join("");

    ["bloqProfesional", "recProfesional", "calProfesional", "manProfesional"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const prev = el.value;
      if (id === "manProfesional") {
        el.innerHTML = optsOnly || `<option value="">Sin profesionales</option>`;
      } else {
        el.innerHTML = optsAll;
      }
      if (prev) el.value = prev;
      if (id !== "calProfesional" && !el.value && pros.length === 1) {
        el.value = String(pros[0].id);
      }
    });

    const showPro = pros.length > 0;
    ["bloqProWrap", "bloqProLabel", "recProLabel", "calProLabel"].forEach((id) => {
      const el = $(id);
      if (el) el.classList.toggle("hidden", !showPro && id !== "bloqProWrap");
    });
    const wrap = $("bloqProWrap");
    if (wrap) wrap.classList.toggle("hidden", !showPro);
    const manWrap = $("manProWrap");
    if (manWrap) manWrap.classList.toggle("hidden", pros.length <= 1);
  }

  function fillHorarioSelects() {
    ensureHorariosDatalist();
    const step = config?.slotStepMin || 15;
    const horarios = generateHorariosFromConfig(config, step);
    const opts = horarios.map((h) => `<option value="${h}">${h}</option>`).join("");
    ["bloqHorarioDesde", "bloqHorarioHasta", "recHorarioDesde", "recHorarioHasta"].forEach((id) => {
      const el = $(id);
      if (el) el.innerHTML = opts;
    });
  }

  function setAvatarEl(el, name, logoUrl) {
    if (!el) return;
    const ini = initialsOf(name);
    if (logoUrl) {
      el.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" class="h-full w-full object-contain p-1.5" crossorigin="anonymous" />`;
      el.classList.add("overflow-hidden", "p-0");
      el.style.background = "#FFFFFF";
      const img = el.querySelector("img");
      if (img) {
        const applyBg = () => {
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
            el.style.background = avg > 160 ? "#0A0A0A" : "#FFFFFF";
          } catch (_) {
            el.style.background = "#FFFFFF";
          }
        };
        if (img.complete && img.naturalWidth) applyBg();
        else img.addEventListener("load", applyBg, { once: true });
      }
    } else {
      el.textContent = ini.length > 2 ? ini.slice(0, 2) : ini;
      el.classList.remove("p-0");
      el.style.background = "";
    }
  }

  function updateLogoPreview() {
    const preview = $("cfgLogoPreview");
    if (!preview) return;
    setAvatarEl(preview, config?.nombre || "Negocio", config?.logoUrl || null);
  }

  function updateBrandUI() {
    const name = config?.nombre || "Negocio";
    const logoUrl = config?.logoUrl || null;
    ["sidebarAvatar", "mobileAvatar", "loginAvatar"].forEach((id) => {
      setAvatarEl($(id), name, logoUrl);
    });
    ["sidebarBusinessName", "mobileBusinessName", "loginBusinessName", "dashGreetingName"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (id === "loginBusinessName") el.textContent = name;
      else if (id === "dashGreetingName") el.textContent = name;
      else el.textContent = name;
    });
    const linkMenu = $("linkMenu");
    if (linkMenu) linkMenu.href = `/${SLUG}`;
    const linkLogin = $("linkMenuLogin");
    if (linkLogin) linkLogin.href = `/${SLUG}`;
    updateLogoPreview();
  }

  // ---- auth / shell ----
  function showLogin() {
    $("loginCard")?.classList.remove("hidden");
    $("adminPanel")?.classList.add("hidden");
  }

  function showApp() {
    $("loginCard")?.classList.add("hidden");
    $("adminPanel")?.classList.remove("hidden");
  }

  function logout(clearMsg = true) {
    stopLivePolling();
    adminToken = "";
    localStorage.removeItem("adminToken");
    lastReservasSig = "";
    showLogin();
    if (clearMsg) setMessage($("loginMessage"), "");
  }

  function setMobileNav(open) {
    mobileNavOpen = open;
    const sidebar = $("sidebar");
    if (!sidebar) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      sidebar.classList.remove("hidden");
      sidebar.classList.add("lg:flex");
      return;
    }
    sidebar.classList.toggle("hidden", !open);
    if (open) sidebar.classList.add("flex", "flex-col");
    else sidebar.classList.remove("flex", "flex-col");
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.toggle("is-active", el.id === `view-${view}`);
    });
    document.querySelectorAll(".nav-item").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("is-active", active);
      btn.classList.toggle("ds-sidebar__item", true);
      if (!active) btn.classList.add("hover:bg-white/5");
    });
    setMobileNav(false);

    if (view === "dashboard") renderDashboard();
    if (view === "agenda") {
      fillConfigForm();
      if (agendaMode === "calendario") {
        loadReservas()
          .then(() => loadBloqueosData())
          .then(() => {
            renderCalendario();
          })
          .catch(() => renderCalendario());
      } else {
        renderReservas();
      }
      loadBloqueos();
      loadBloqueosRecurrentes();
    }
    if (view === "servicios") renderServicios();
    if (view === "equipo") renderEquipo();
    if (view === "clientes") renderClientes();
    if (view === "planes") renderPlanes();
    if (view === "movimientos") {
      loadMovimientos()
        .then(() => renderMovimientos())
        .catch((e) => setMessage($("movFormMsg"), e.message, true));
    }
    if (view === "contenido") {
      loadVideos().then(renderVideosAdmin).catch((e) => handleMigracionAviso(e.message));
      loadGaleriaAdmin().then(renderGaleriaAdmin).catch((e) => handleMigracionAviso(e.message));
    }
    if (view === "estadisticas") {
      loadMovimientos().catch(() => { movimientosCache = []; }).finally(() => renderEstadisticas());
    }
    if (view === "configuracion") fillConfigForm();
  }

  // ---- loaders ----
  async function loadConfig() {
    config = await api(`/api/${SLUG}/config`);
    applyBrand(config.colorMarca || config.color_marca);
    updateBrandUI();
    fillHorarioSelects();
    if ($("bloqFecha") && !$("bloqFecha").value) $("bloqFecha").value = todayISO();
  }

  async function loadProfessionals() {
    professionalsCache = await api(`/api/${SLUG}/admin/professionals`);
    fillProfessionalSelects();
  }

  async function loadServices() {
    servicesCache = await api(`/api/${SLUG}/admin/services`);
  }

  async function loadPlans() {
    plansCache = await api(`/api/${SLUG}/admin/plans`);
  }

  async function loadMovimientos() {
    const data = await api(`/api/${SLUG}/admin/movimientos`);
    if (Array.isArray(data)) {
      movimientosCache = data;
    } else {
      movimientosCache = data?.items || [];
      const sync = data?.sync;
      if (sync?.error) {
        const rls = /row-level security/i.test(sync.error);
        setMessage(
          $("movFormMsg"),
          rls
            ? "Supabase bloquea la caja (RLS). En SQL Editor ejecutá: alter table movimientos disable row level security;"
            : `No se pudieron importar turnos: ${sync.error}`,
          true
        );
      } else if (sync?.created > 0) {
        setMessage($("movFormMsg"), `Se importaron ${sync.created} ingreso(s) de turnos existentes.`, false);
      }
    }
    return movimientosCache;
  }

  async function loadReservas(fecha) {
    const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    reservasActuales = await api(`/api/${SLUG}/admin/reservas${q}`);
    lastReservasSig = reservasSignature(reservasActuales);
    return reservasActuales;
  }

  function reservasSignature(list) {
    return (list || [])
      .map((r) => `${r.id}:${r.estado}:${r.fecha}:${r.horaInicio || ""}:${r.horaFin || ""}:${r.nombre || ""}`)
      .sort()
      .join("|");
  }

  function bloqueosSignature(puntuales, recurrentes) {
    const a = (puntuales || [])
      .map((b) => `${b.id}:${b.fecha}:${b.horarioDesde || ""}:${b.horarioHasta || ""}:${b.professionalId ?? ""}`)
      .sort()
      .join("|");
    const b = (recurrentes || [])
      .map((r) => `${r.id}:${r.diaSemana}:${r.horarioDesde || ""}:${r.horarioHasta || ""}:${r.activo === false ? 0 : 1}`)
      .sort()
      .join("|");
    return `${a}#${b}`;
  }

  function movimientosSignature(list) {
    return (list || [])
      .map((m) => `${m.id}:${m.tipo}:${m.monto}:${m.fecha}:${m.descripcion || ""}`)
      .sort()
      .join("|");
  }

  function refreshLiveViews({ reservasChanged = true, bloqueosChanged = false, movimientosChanged = false } = {}) {
    if (currentView === "dashboard" && (reservasChanged || movimientosChanged)) renderDashboard();
    if (currentView === "agenda" && (reservasChanged || bloqueosChanged)) {
      renderReservas();
      if (agendaMode === "calendario") renderCalendario();
    }
    if (currentView === "clientes" && reservasChanged) renderClientes();
    if (currentView === "movimientos" && movimientosChanged) renderMovimientos();
    if (currentView === "estadisticas" && (reservasChanged || movimientosChanged)) renderEstadisticas();
  }

  async function pollLiveReservas() {
    if (!adminToken || pollInFlight || document.hidden) return;
    pollInFlight = true;
    try {
      const fecha =
        currentView === "agenda" && agendaMode === "lista"
          ? ($("filtroFecha")?.value || "")
          : "";
      const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
      const live = await api(`/api/${SLUG}/admin/live${q}`);

      const reservas = live.reservas || [];
      const bloqueos = live.bloqueos || [];
      const bloqueosRec = live.bloqueosRecurrentes || [];
      const movimientos = live.movimientos || [];

      const rSig = reservasSignature(reservas);
      const bSig = bloqueosSignature(bloqueos, bloqueosRec);
      const mSig = movimientosSignature(movimientos);

      const reservasChanged = rSig !== lastReservasSig;
      const bloqueosChanged = bSig !== lastBloqueosSig;
      const movimientosChanged = mSig !== lastMovimientosSig;

      if (reservasChanged) {
        reservasActuales = reservas;
        lastReservasSig = rSig;
      }
      if (bloqueosChanged) {
        bloqueosCache = (bloqueos || []).filter(
          (b) => !b._recurrente && !String(b.id).startsWith?.("rec-")
        );
        bloqueosRecCache = bloqueosRec || [];
        lastBloqueosSig = bSig;
      }
      if (movimientosChanged) {
        movimientosCache = movimientos;
        lastMovimientosSig = mSig;
      }

      if (reservasChanged || bloqueosChanged || movimientosChanged) {
        refreshLiveViews({ reservasChanged, bloqueosChanged, movimientosChanged });
      }
    } catch (e) {
      if (e.status === 401) {
        stopLivePolling();
        logout(false);
        setMessage($("loginMessage"), "Sesión expirada. Ingresá de nuevo.", true);
      }
    } finally {
      pollInFlight = false;
    }
  }

  function startLivePolling() {
    stopLivePolling();
    pollTimer = setInterval(pollLiveReservas, LIVE_POLL_MS);
    pollLiveReservas();
  }

  function stopLivePolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function refreshAll() {
    await loadConfig();
    await Promise.all([loadProfessionals(), loadServices(), loadPlans(), loadMovimientos().catch(() => { movimientosCache = []; })]);
    await loadReservas();
    await loadBloqueosData().catch(() => {});
    lastReservasSig = reservasSignature(reservasActuales);
    lastBloqueosSig = bloqueosSignature(bloqueosCache, bloqueosRecCache);
    lastMovimientosSig = movimientosSignature(movimientosCache);
  }

  // ---- dashboard ----
  function weekRangeAround(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay(); // 0 sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDaysISO(iso, mondayOffset);
    const end = addDaysISO(start, 6);
    return { start, end };
  }

  function isActiveEstado(estado) {
    return estado !== "cancelada";
  }

  function renderMiniTurno(r, { showDate = false } = {}) {
    const estado = r.estado || "pendiente";
    const meta = showDate
      ? `${formatFecha(r.fecha)} · ${horaLabel(r)} · ${serviceName(r)} · ${professionalName(r)}`
      : `${horaLabel(r)} · ${serviceName(r)} · ${professionalName(r)}`;
    return `
      <article class="appt-row is-${escapeHtml(estado)}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold truncate">${escapeHtml(r.nombre)}</p>
              ${estadoBadge(estado)}
            </div>
            <p class="text-meta-sm mt-1">${escapeHtml(meta)}</p>
          </div>
          <p class="shrink-0 text-sm font-semibold text-secondary">${escapeHtml(r.horaInicio || r.horario || "")}</p>
        </div>
      </article>`;
  }

  function renderDashboard() {
    const hoy = todayISO();
    const { start, end } = weekRangeAround(hoy);
    const prevStart = addDaysISO(start, -7);
    const prevEnd = addDaysISO(start, -1);
    const activas = reservasActuales.filter((r) => isActiveEstado(r.estado));
    const deHoy = activas.filter((r) => r.fecha === hoy);
    const deSemana = activas.filter((r) => r.fecha >= start && r.fecha <= end);
    const deSemanaPrev = activas.filter((r) => r.fecha >= prevStart && r.fecha <= prevEnd);
    const pendientes = reservasActuales.filter((r) => r.estado === "pendiente");
    const confirmadosHoy = deHoy.filter((r) => r.estado === "confirmada").length;
    const ingresos = deSemana.reduce((acc, r) => acc + appointmentPrice(r), 0);

    const greet = greetingForHour();
    if ($("dashGreeting")) $("dashGreeting").textContent = `${greet.text} ${greet.emoji}`;
    if ($("dashSubtitle")) {
      const n = deHoy.length;
      $("dashSubtitle").textContent = `${n} turno${n === 1 ? "" : "s"} para hoy`;
    }

    if ($("kpiHoy")) $("kpiHoy").textContent = String(deHoy.length);
    if ($("kpiHoySub")) $("kpiHoySub").textContent = `${confirmadosHoy} confirmado${confirmadosHoy === 1 ? "" : "s"}`;
    if ($("kpiSemana")) $("kpiSemana").textContent = String(deSemana.length);
    if ($("kpiSemanaSub")) {
      const t = trendLabel(deSemana.length, deSemanaPrev.length);
      $("kpiSemanaSub").textContent = t.text;
      $("kpiSemanaSub").className = `kpi-sub ${t.cls}`;
    }
    if ($("kpiIngresos")) $("kpiIngresos").textContent = formatMoney(ingresos);
    if ($("kpiIngresosSub")) $("kpiIngresosSub").textContent = "esta semana";
    if ($("kpiPendientes")) $("kpiPendientes").textContent = String(pendientes.length);
    if ($("kpiPendientesSub")) $("kpiPendientesSub").textContent = "sin cobrar";

    const hoyList = $("dashHoyList");
    if (hoyList) {
      const sorted = [...deHoy].sort((a, b) => String(a.horaInicio).localeCompare(String(b.horaInicio)));
      hoyList.innerHTML = sorted.length
        ? sorted.map((r) => renderMiniTurno(r)).join("")
        : `<p class="text-meta">No hay turnos para hoy.</p>`;
    }

    const proxList = $("dashProximosList");
    if (proxList) {
      const proximos = activas
        .filter((r) => r.fecha > hoy || (r.fecha === hoy && String(r.horaInicio || "") > new Date().toTimeString().slice(0, 5)))
        .sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`))
        .slice(0, 8);
      proxList.innerHTML = proximos.length
        ? proximos.map((r) => renderMiniTurno(r, { showDate: true })).join("")
        : `<p class="text-meta">No hay próximos turnos.</p>`;
    }
  }

  // ---- agenda list ----
  function filteredReservas() {
    const fecha = $("filtroFecha")?.value || "";
    const estado = $("filtroEstado")?.value || "";
    return reservasActuales.filter((r) => {
      if (fecha && r.fecha !== fecha) return false;
      if (estado && r.estado !== estado) return false;
      return true;
    });
  }

  function renderReservas() {
    const list = $("reservasList");
    if (!list) return;
    const items = filteredReservas().sort((a, b) =>
      `${b.fecha}${b.horaInicio}`.localeCompare(`${a.fecha}${a.horaInicio}`)
    );
    if (!items.length) {
      list.innerHTML = `<p class="text-meta py-4 text-center">No hay turnos para mostrar.</p>`;
      return;
    }
    list.innerHTML = items
      .map((r) => {
        const canModify = r.estado === "pendiente" || r.estado === "confirmada";
        const canCancel = r.estado === "pendiente" || r.estado === "confirmada";
        const estado = r.estado || "pendiente";
        return `
        <article class="appt-row is-${escapeHtml(estado)}">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold">${escapeHtml(r.nombre)}</h3>
                ${estadoBadge(estado)}
                ${r.manual ? `<span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Manual</span>` : ""}
              </div>
              <p class="text-meta mt-1">
                ${escapeHtml(formatFecha(r.fecha))} · ${escapeHtml(horaLabel(r))}
                · ${escapeHtml(serviceName(r))}
                · ${escapeHtml(professionalName(r))}
              </p>
              <p class="text-meta-sm">${escapeHtml(r.telefono)}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              ${
                r.comprobanteUrl
                  ? `<a href="${escapeHtml(r.comprobanteUrl)}" target="_blank" rel="noopener" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">Comprobante</a>`
                  : ""
              }
              <a href="${whatsappHref(r)}" target="_blank" rel="noopener" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">WhatsApp</a>
              ${
                canModify
                  ? `<button type="button" data-action="modify" data-id="${escapeHtml(r.id)}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">Modificar</button>`
                  : ""
              }
              ${
                canCancel
                  ? `<button type="button" data-action="cancel" data-id="${escapeHtml(r.id)}" class="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Cancelar</button>`
                  : ""
              }
              <button type="button" data-action="delete" data-id="${escapeHtml(r.id)}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-neutral-bg">Eliminar</button>
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  // ---- agendar manual ----
  function fillManServicioSelect() {
    const sel = $("manServicio");
    if (!sel) return;
    const prev = sel.value;
    const items = (servicesCache || []).filter((s) => s.activo !== false);
    sel.innerHTML = items.length
      ? items.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.nombre)}</option>`).join("")
      : `<option value="">Sin servicios</option>`;
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function resetAgendarForm() {
    if ($("manNombre")) $("manNombre").value = "";
    if ($("manTelefono")) $("manTelefono").value = "";
    if ($("manFecha")) $("manFecha").value = todayISO();
    if ($("manEstado")) $("manEstado").value = "confirmada";
    if ($("manHorario")) {
      $("manHorario").innerHTML = `<option value="">Elegí fecha y servicio</option>`;
    }
    setMessage($("manMsg"), "");
    fillManServicioSelect();
    fillProfessionalSelects();
  }

  async function loadManHorarios() {
    const sel = $("manHorario");
    if (!sel) return;
    const serviceId = $("manServicio")?.value;
    const fecha = $("manFecha")?.value;
    const professionalId = $("manProfesional")?.value || "";
    if (!serviceId || !fecha) {
      sel.innerHTML = `<option value="">Elegí fecha y servicio</option>`;
      return;
    }
    sel.innerHTML = `<option value="">Cargando…</option>`;
    try {
      let url = `/api/${SLUG}/disponibilidad?fecha=${encodeURIComponent(fecha)}&serviceId=${encodeURIComponent(serviceId)}`;
      if (professionalId) url += `&professionalId=${encodeURIComponent(professionalId)}`;
      const data = await api(url);
      const slots = data?.slots || [];
      if (data?.cerrado) {
        sel.innerHTML = `<option value="">Cerrado ese día</option>`;
        return;
      }
      if (!slots.length) {
        sel.innerHTML = `<option value="">Sin horarios libres</option>`;
        return;
      }
      sel.innerHTML = slots.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
    } catch (e) {
      sel.innerHTML = `<option value="">Error al cargar</option>`;
      setMessage($("manMsg"), e.message || "No se pudieron cargar horarios.", true);
    }
  }

  async function guardarAgendarManual() {
    const body = {
      nombre: $("manNombre")?.value?.trim(),
      telefono: $("manTelefono")?.value?.trim(),
      serviceId: Number($("manServicio")?.value),
      fecha: $("manFecha")?.value,
      horaInicio: $("manHorario")?.value,
      estado: $("manEstado")?.value || "confirmada",
    };
    const pros = activeProfessionals();
    if (pros.length > 1) {
      body.professionalId = Number($("manProfesional")?.value);
    } else if (pros.length === 1) {
      body.professionalId = pros[0].id;
    }
    try {
      setMessage($("manMsg"), "Guardando…", false);
      await api(`/api/${SLUG}/admin/reservas`, { method: "POST", body: JSON.stringify(body) });
      setMessage($("manMsg"), "Turno agendado.", false);
      setMessage($("adminMessage"), "Turno manual creado.", false);
      $("manNombre").value = "";
      $("manTelefono").value = "";
      await loadManHorarios();
      const fechaFiltro =
        agendaMode === "lista" ? ($("filtroFecha")?.value || undefined) : undefined;
      await loadReservas(fechaFiltro);
      renderReservas();
      if (agendaMode === "calendario") renderCalendario();
      renderDashboard();
    } catch (e) {
      setMessage($("manMsg"), e.message || "No se pudo agendar.", true);
    }
  }

  async function patchEstado(id, estado) {
    await api(`/api/${SLUG}/admin/reservas/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    });
    const fecha =
      agendaMode === "lista" ? ($("filtroFecha")?.value || undefined) : undefined;
    await loadReservas(fecha);
    renderReservas();
    if (agendaMode === "calendario") renderCalendario();
    renderDashboard();
  }

  async function deleteReserva(id) {
    if (!confirm("¿Eliminar este turno definitivamente?")) return;
    await api(`/api/${SLUG}/admin/reservas/${id}`, { method: "DELETE" });
    const fecha =
      agendaMode === "lista" ? ($("filtroFecha")?.value || undefined) : undefined;
    await loadReservas(fecha);
    renderReservas();
    if (agendaMode === "calendario") renderCalendario();
    renderDashboard();
  }

  function closeModificarHorario() {
    $("formModificarHorario")?.classList.add("hidden");
    if ($("modReservaId")) $("modReservaId").value = "";
    if ($("modServiceId")) $("modServiceId").value = "";
    if ($("modProfessionalId")) $("modProfessionalId").value = "";
    if ($("modFecha")) $("modFecha").value = "";
    if ($("modHorario")) $("modHorario").innerHTML = `<option value="">Elegí fecha</option>`;
    setMessage($("modMsg"), "", false);
  }

  function openModificarHorario(id) {
    const r = reservasActuales.find((x) => Number(x.id) === Number(id));
    if (!r) return;
    $("formAgendarManual")?.classList.add("hidden");
    if ($("modReservaId")) $("modReservaId").value = String(r.id);
    if ($("modServiceId")) $("modServiceId").value = String(r.serviceId || "");
    if ($("modProfessionalId")) $("modProfessionalId").value = r.professionalId != null ? String(r.professionalId) : "";
    if ($("modReservaInfo")) {
      $("modReservaInfo").textContent = `${r.nombre} · ${serviceName(r)} · actual: ${formatFecha(r.fecha)} ${horaLabel(r)}`;
    }
    if ($("modFecha")) $("modFecha").value = r.fecha || "";
    $("formModificarHorario")?.classList.remove("hidden");
    $("formModificarHorario")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    loadModHorarios().catch(() => {});
  }

  async function loadModHorarios() {
    const sel = $("modHorario");
    if (!sel) return;
    const serviceId = $("modServiceId")?.value;
    const fecha = $("modFecha")?.value;
    const professionalId = $("modProfessionalId")?.value || "";
    const excludeId = $("modReservaId")?.value || "";
    if (!serviceId || !fecha) {
      sel.innerHTML = `<option value="">Elegí fecha</option>`;
      return;
    }
    sel.innerHTML = `<option value="">Cargando…</option>`;
    try {
      let url = `/api/${SLUG}/disponibilidad?fecha=${encodeURIComponent(fecha)}&serviceId=${encodeURIComponent(serviceId)}`;
      if (professionalId) url += `&professionalId=${encodeURIComponent(professionalId)}`;
      if (excludeId) url += `&excludeAppointmentId=${encodeURIComponent(excludeId)}`;
      const data = await api(url);
      const slots = data?.slots || [];
      if (data?.cerrado) {
        sel.innerHTML = `<option value="">Cerrado ese día</option>`;
        return;
      }
      if (!slots.length) {
        sel.innerHTML = `<option value="">Sin horarios libres</option>`;
        return;
      }
      const current = reservasActuales.find((x) => Number(x.id) === Number(excludeId));
      const currentHora = current && current.fecha === fecha ? (current.horaInicio || "") : "";
      const opts = slots.slice();
      if (currentHora && !opts.includes(currentHora)) opts.unshift(currentHora);
      sel.innerHTML = opts.map((h) => `<option value="${escapeHtml(h)}"${h === currentHora ? " selected" : ""}>${escapeHtml(h)}</option>`).join("");
    } catch (e) {
      sel.innerHTML = `<option value="">Error al cargar</option>`;
      setMessage($("modMsg"), e.message || "No se pudieron cargar horarios.", true);
    }
  }

  async function guardarModificarHorario() {
    const id = $("modReservaId")?.value;
    const fecha = $("modFecha")?.value;
    const horaInicio = $("modHorario")?.value;
    if (!id) return;
    if (!fecha || !horaInicio) {
      setMessage($("modMsg"), "Elegí fecha y horario.", true);
      return;
    }
    try {
      await api(`/api/${SLUG}/admin/reservas/${id}/horario`, {
        method: "PATCH",
        body: JSON.stringify({ fecha, horaInicio }),
      });
      setMessage($("modMsg"), "Horario actualizado.", false);
      closeModificarHorario();
      const filtro =
        agendaMode === "lista" ? ($("filtroFecha")?.value || undefined) : undefined;
      await loadReservas(filtro);
      renderReservas();
      if (agendaMode === "calendario") renderCalendario();
      renderDashboard();
    } catch (e) {
      setMessage($("modMsg"), e.message || "No se pudo modificar.", true);
    }
  }

  function exportCSV() {
    const rows = filteredReservas();
    const header = ["fecha", "horaInicio", "horaFin", "nombre", "telefono", "servicio", "profesional", "estado"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push(
        [
          r.fecha,
          r.horaInicio || "",
          r.horaFin || "",
          `"${String(r.nombre || "").replace(/"/g, '""')}"`,
          r.telefono || "",
          `"${String(serviceName(r)).replace(/"/g, '""')}"`,
          `"${String(professionalName(r)).replace(/"/g, '""')}"`,
          r.estado || "",
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `turnos-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- calendar ----
  function getMonday(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return addDaysISO(iso, offset);
  }

  async function loadBloqueosData() {
    const [puntuales, recurrentes] = await Promise.all([
      api(`/api/${SLUG}/admin/bloqueos`),
      api(`/api/${SLUG}/admin/bloqueos-recurrentes`),
    ]);
    bloqueosCache = (puntuales || []).filter(
      (b) => !b._recurrente && !String(b.id).startsWith?.("rec-")
    );
    bloqueosRecCache = recurrentes || [];
  }

  function bloqueoMatchesPro(b, proFilter) {
    if (!proFilter) return true;
    if (b.professionalId == null || b.professionalId === "") return true;
    return Number(b.professionalId) === Number(proFilter);
  }

  function expandBloqueosForWeek(days) {
    const set = new Set(days);
    const out = bloqueosCache.filter((b) => set.has(b.fecha));
    for (const fecha of days) {
      const [y, m, d] = fecha.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      for (const r of bloqueosRecCache) {
        if (Number(r.diaSemana) !== dow) continue;
        if (r.activo === false) continue;
        out.push({
          id: `rec-${r.id}-${fecha}`,
          professionalId: r.professionalId ?? null,
          fecha,
          horarioDesde: r.horarioDesde,
          horarioHasta: r.horarioHasta,
          diaCompleto: Boolean(r.diaCompleto),
          motivo: r.motivo || "Bloqueo recurrente",
          _recurrente: true,
        });
      }
    }
    return out;
  }

  function getBloqueoSpanMinutes(b) {
    if (b.diaCompleto) return { desde: 0, hasta: 24 * 60 };
    const desde = hhmmToMinutes(b.horarioDesde || b.horario || "");
    let hasta = hhmmToMinutes(b.horarioHasta || "");
    if (!Number.isFinite(desde)) return null;
    if (!Number.isFinite(hasta) || hasta <= desde) hasta = desde + (config?.slotStepMin || 15);
    return { desde, hasta };
  }

  function buildCalendarSlots(weekReservas, weekBloqueos, step, scheduleOverride = null) {
    let minM = Infinity;
    let maxM = -Infinity;

    const pushRange = (a, b) => {
      if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) return;
      minM = Math.min(minM, a);
      maxM = Math.max(maxM, b);
    };

    const sched = scheduleOverride || {
      horaInicio: config?.horaInicio ?? "09:00",
      horaFin: config?.horaFin ?? "20:00",
      horaInicio2: config?.horaInicio2,
      horaFin2: config?.horaFin2,
    };
    const a1 = scheduleToMinutes(sched.horaInicio ?? "09:00");
    const b1 = scheduleToMinutes(sched.horaFin ?? "20:00");
    pushRange(a1, b1);
    const a2 = scheduleToMinutes(sched.horaInicio2);
    const b2 = scheduleToMinutes(sched.horaFin2);
    pushRange(a2, b2);

    for (const r of weekReservas) {
      const start = hhmmToMinutes(r.horaInicio || r.horario);
      const endRaw = hhmmToMinutes(r.horaFin);
      const end = Number.isFinite(endRaw) && endRaw > start
        ? endRaw
        : start + (Number(r.duracionMin) || step);
      pushRange(start, end);
    }

    for (const b of weekBloqueos) {
      if (b.diaCompleto) continue;
      const span = getBloqueoSpanMinutes(b);
      if (span) pushRange(span.desde, span.hasta);
    }

    if (!Number.isFinite(minM) || !Number.isFinite(maxM) || minM >= maxM) {
      minM = 9 * 60;
      maxM = 20 * 60;
    }

    minM = Math.floor(minM / step) * step;
    maxM = Math.ceil(maxM / step) * step;
    if (maxM <= minM) maxM = minM + step;

    const slots = [];
    for (let m = minM; m < maxM; m += step) slots.push(minutesToHHMM(m));
    return slots;
  }

  async function setAgendaMode(mode) {
    agendaMode = mode;
    $("vistaLista")?.classList.toggle("hidden", mode !== "lista");
    $("vistaCalendario")?.classList.toggle("hidden", mode !== "calendario");
    $("filtrosLista")?.classList.toggle("hidden", mode === "calendario");
    const btnL = $("btnVistaLista");
    const btnC = $("btnVistaCalendario");
    btnL?.classList.toggle("is-active", mode === "lista");
    btnC?.classList.toggle("is-active", mode === "calendario");
    if (mode === "calendario") {
      if (!calWeekStart) calWeekStart = getMonday(todayISO());
      // La agenda semanal necesita todos los turnos, no el filtro por día de la lista
      try {
        await loadReservas();
        await loadBloqueosData();
      } catch (_) { /* keep cache */ }
      renderCalendario();
    } else {
      renderReservas();
    }
  }

  function renderCalendario() {
    const grid = $("calGrid");
    const label = $("calSemanaLabel");
    if (!grid) return;
    if (!calWeekStart) calWeekStart = getMonday(todayISO());
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(calWeekStart, i));
    if (label) label.textContent = `${formatFecha(days[0])} – ${formatFecha(days[6])}`;

    const proFilter = $("calProfesional")?.value || "";
    const step = config?.slotStepMin || 15;
    const daySet = new Set(days);

    const weekReservas = reservasActuales.filter((r) => {
      if (!daySet.has(r.fecha) || r.estado === "cancelada") return false;
      if (proFilter && r.professionalId != null && Number(r.professionalId) !== Number(proFilter)) {
        return false;
      }
      if (proFilter && r.professionalId == null) return true;
      return true;
    });

    const weekBloqueos = expandBloqueosForWeek(days).filter((b) => bloqueoMatchesPro(b, proFilter));
    const filteredPro = proFilter ? professionalById(proFilter) : null;
    const viewSchedule = effectiveScheduleForPro(filteredPro);
    const slots = buildCalendarSlots(weekReservas, weekBloqueos, step, proFilter ? viewSchedule : null);

    const fullDayByFecha = {};
    for (const b of weekBloqueos) {
      if (!b.diaCompleto) continue;
      if (!fullDayByFecha[b.fecha]) fullDayByFecha[b.fecha] = [];
      fullDayByFecha[b.fecha].push(b);
    }

    const header = `
      <div class="cal-head"></div>
      ${days
        .map((fecha) => {
          const [y, m, d] = fecha.split("-").map(Number);
          const dow = new Date(y, m - 1, d).getDay();
          const isToday = fecha === todayISO();
          const full = fullDayByFecha[fecha] || [];
          const blocked = full.length > 0;
          const cerradoPro = proFilter && !isDiaAtencionSchedule(viewSchedule, fecha);
          const motivo = full.map((b) => b.motivo || "Bloqueado").join(" · ");
          return `
            <div class="cal-head ${isToday ? "font-bold" : ""} ${blocked ? "is-blocked" : ""} ${cerradoPro ? "is-cerrado" : ""}">
              <div class="text-meta-sm uppercase tracking-wide">${escapeHtml(DIAS[dow].toUpperCase())} ${String(d).padStart(2, "0")}</div>
              ${blocked ? `<div class="cal-head-blocked" title="${escapeHtml(motivo)}">Día bloqueado</div>` : ""}
              ${cerradoPro && !blocked ? `<div class="cal-head-blocked">No atiende</div>` : ""}
            </div>`;
        })
        .join("")}`;

    const body = slots
      .map((slot) => {
        const slotMin = hhmmToMinutes(slot);
        const nextMin = slotMin + step;
        const cells = days
          .map((fecha) => {
            const dayFull = fullDayByFecha[fecha] || [];
            const dayReservas = weekReservas.filter((r) => {
              if (r.fecha !== fecha) return false;
              const start = hhmmToMinutes(r.horaInicio || r.horario);
              if (!Number.isFinite(start)) return false;
              return start >= slotMin && start < nextMin;
            });
            const dayBloqs = weekBloqueos.filter((b) => {
              if (b.fecha !== fecha || b.diaCompleto) return false;
              const span = getBloqueoSpanMinutes(b);
              if (!span) return false;
              return span.desde < nextMin && span.hasta > slotMin;
            });

            const fueraHorario =
              proFilter &&
              (!isDiaAtencionSchedule(viewSchedule, fecha) || !isMinuteInSchedule(viewSchedule, slotMin));
            const isBlockedCell = dayFull.length > 0 || dayBloqs.length > 0;
            const blocks = [];

            if (dayFull.length && slot === slots[0]) {
              const b = dayFull[0];
              blocks.push(`
                <div class="cal-block is-bloqueo is-bloqueo-full" title="${escapeHtml(b.motivo || "Día completo bloqueado")}">
                  Día completo${b.motivo ? ` · ${escapeHtml(b.motivo)}` : ""}
                </div>`);
            }

            dayBloqs.forEach((b) => {
              const span = getBloqueoSpanMinutes(b);
              const labelBloq =
                span && Number.isFinite(span.desde)
                  ? `${minutesToHHMM(span.desde)}–${minutesToHHMM(span.hasta)}`
                  : "Bloqueo";
              if (span && span.desde >= slotMin && span.desde < nextMin) {
                blocks.push(`
                  <div class="cal-block is-bloqueo" title="${escapeHtml(b.motivo || "Horario bloqueado")}">
                    ${escapeHtml(labelBloq)}${b.motivo ? ` · ${escapeHtml(b.motivo)}` : " · Bloqueado"}
                  </div>`);
              } else if (span && span.desde < slotMin && span.hasta > slotMin) {
                blocks.push(`
                  <div class="cal-block is-bloqueo" title="${escapeHtml(b.motivo || "Horario bloqueado")}">
                    Bloqueado
                  </div>`);
              }
            });

            dayReservas.forEach((r) => {
              const color = proColorFromId(r.professionalId ?? serviceName(r));
              const estadoTag = r.estado === "pendiente" ? " · pend." : "";
              const svc = serviceName(r);
              const proNom = r.professionalId != null ? professionalName(r) : "";
              const titleBits = [r.nombre, svc, proNom, r.estado].filter(Boolean).join(" · ");
              blocks.push(`
                <div class="cal-block" style="background:${color}" title="${escapeHtml(titleBits)}">
                  <strong>${escapeHtml(r.horaInicio || r.horario || "")}</strong> ${escapeHtml(r.nombre)}${estadoTag}
                  ${svc ? `<span class="cal-block-meta">${escapeHtml(svc)}${proNom && !proFilter ? ` · ${escapeHtml(proNom)}` : ""}</span>` : ""}
                </div>`);
            });

            return `<div class="cal-cell ${isBlockedCell ? "is-blocked" : ""} ${fueraHorario ? "is-fuera" : ""}">${blocks.join("")}</div>`;
          })
          .join("");
        return `<div class="cal-time">${escapeHtml(slot)}</div>${cells}`;
      })
      .join("");

    grid.innerHTML = `<div class="cal-week">${header}${body}</div>`;
  }

  // ---- bloqueos ----
  function bloqueoHorarioText(b) {
    if (b.diaCompleto) return "Día completo";
    if (b.horarioDesde && b.horarioHasta) return `${b.horarioDesde}–${b.horarioHasta}`;
    return b.horario || "—";
  }

  async function loadBloqueos() {
    const list = $("bloqueosList");
    if (!list) return;
    try {
      await loadBloqueosData();
      const reales = bloqueosCache;
      if (!reales.length) {
        list.innerHTML = `<p class="text-meta">No hay bloqueos puntuales.</p>`;
      } else {
        list.innerHTML = reales
          .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
          .map((b) => {
            const pro =
              b.professionalId != null
                ? professionalById(b.professionalId)?.nombre || "Profesional"
                : "Todos";
            return `
          <div class="bloqueo-card flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-semibold">${escapeHtml(formatFecha(b.fecha))} · ${escapeHtml(bloqueoHorarioText(b))}</p>
              <p class="text-meta-sm">${escapeHtml(pro)} · ${escapeHtml(b.motivo || "Sin motivo")}</p>
            </div>
            <button type="button" data-del-bloqueo="${escapeHtml(b.id)}" class="rounded-lg border border-danger/30 bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Quitar</button>
          </div>`;
          })
          .join("");
      }
      if (agendaMode === "calendario" && currentView === "agenda") renderCalendario();
    } catch (e) {
      list.innerHTML = `<p class="text-danger text-sm">${escapeHtml(e.message)}</p>`;
    }
  }

  async function loadBloqueosRecurrentes() {
    const list = $("bloqueosRecurrentesList");
    if (!list) return;
    try {
      const items = await api(`/api/${SLUG}/admin/bloqueos-recurrentes`);
      bloqueosRecCache = items || [];
      if (!items.length) {
        list.innerHTML = `<p class="text-meta">No hay bloqueos recurrentes.</p>`;
      } else {
        list.innerHTML = items
          .map((b) => {
            const pro =
              b.professionalId != null
                ? professionalById(b.professionalId)?.nombre || "Profesional"
                : "Todos";
            const horario = b.diaCompleto
              ? "Día completo"
              : `${b.horarioDesde || ""}–${b.horarioHasta || ""}`;
            return `
          <div class="bloqueo-card flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-semibold">Cada ${escapeHtml(DIAS_FULL[b.diaSemana] || "")} · ${escapeHtml(horario)}</p>
              <p class="text-meta-sm">${escapeHtml(pro)} · ${escapeHtml(b.motivo || "Sin motivo")}</p>
            </div>
            <button type="button" data-del-bloq-rec="${escapeHtml(b.id)}" class="rounded-lg border border-danger/30 bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Quitar</button>
          </div>`;
          })
          .join("");
      }
      if (agendaMode === "calendario" && currentView === "agenda") renderCalendario();
    } catch (e) {
      list.innerHTML = `<p class="text-danger text-sm">${escapeHtml(e.message)}</p>`;
    }
  }

  async function crearBloqueo() {
    const diaCompleto = Boolean($("bloqDiaCompleto")?.checked);
    const professionalId = $("bloqProfesional")?.value || "";
    const body = {
      fecha: $("bloqFecha")?.value,
      motivo: $("bloqMotivo")?.value || "",
      diaCompleto,
      professionalId: professionalId === "" ? null : Number(professionalId),
    };
    if (!diaCompleto) {
      body.horarioDesde = $("bloqHorarioDesde")?.value;
      body.horarioHasta = $("bloqHorarioHasta")?.value;
    }
    try {
      await api(`/api/${SLUG}/admin/bloqueos`, { method: "POST", body: JSON.stringify(body) });
      setMessage($("adminMessage"), "Bloqueo creado.", false);
      if ($("bloqMotivo")) $("bloqMotivo").value = "";
      await loadBloqueos();
    } catch (e) {
      setMessage($("adminMessage"), e.message, true);
    }
  }

  async function crearBloqueoRecurrente() {
    const diaCompleto = Boolean($("recDiaCompleto")?.checked);
    const professionalId = $("recProfesional")?.value || "";
    const body = {
      diaSemana: Number($("recDiaSemana")?.value),
      motivo: $("recMotivo")?.value || "",
      diaCompleto,
      professionalId: professionalId === "" ? null : Number(professionalId),
    };
    if (!diaCompleto) {
      body.horarioDesde = $("recHorarioDesde")?.value;
      body.horarioHasta = $("recHorarioHasta")?.value;
    }
    try {
      await api(`/api/${SLUG}/admin/bloqueos-recurrentes`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage($("recMsg"), "Bloqueo recurrente guardado.", false);
      $("formBloqRecContainer")?.classList.add("hidden");
      await loadBloqueosRecurrentes();
    } catch (e) {
      setMessage($("recMsg"), e.message, true);
    }
  }

  // ---- servicios ----
  function resetServicioForm() {
    editingServiceId = null;
    ["nuevoServNombre", "nuevoServDesc", "nuevoServDuracion", "nuevoServPrecio", "nuevoServSena", "nuevoServCat"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });
    fillServicioProfessionalSelect("");
    const btn = $("btnAgregarServicio");
    if (btn) btn.textContent = "Guardar servicio";
  }

  function fillServicioForm(s) {
    editingServiceId = s.id;
    if ($("nuevoServNombre")) $("nuevoServNombre").value = s.nombre || "";
    if ($("nuevoServDesc")) $("nuevoServDesc").value = s.descripcion || "";
    if ($("nuevoServDuracion")) $("nuevoServDuracion").value = s.duracionMin || "";
    if ($("nuevoServPrecio")) $("nuevoServPrecio").value = s.precio || "";
    if ($("nuevoServSena")) $("nuevoServSena").value = s.sena ?? "";
    if ($("nuevoServCat")) $("nuevoServCat").value = s.categoria || "";
    const fromLinks = (professionalsCache || []).find((p) =>
      Array.isArray(p.serviceIds) && p.serviceIds.map(Number).includes(Number(s.id))
    );
    fillServicioProfessionalSelect(fromLinks?.id ?? s.professionalId ?? "");
    const btn = $("btnAgregarServicio");
    if (btn) btn.textContent = "Actualizar servicio";
    $("formServicio")?.classList.remove("hidden");
    $("formServicio")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderServicios() {
    const list = $("serviciosAdminList");
    const empty = $("serviciosEmpty");
    const meta = $("serviciosMeta");
    if (!list) return;
    const all = servicesCache || [];
    const activos = all.filter((s) => s.activo !== false);
    if (meta) meta.textContent = `${activos.length} activo${activos.length === 1 ? "" : "s"} · ${all.length} total`;

    if (!all.length) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    list.innerHTML = all
      .map((s) => {
        const activo = s.activo !== false;
        const linkedPros = (professionalsCache || []).filter((p) =>
          Array.isArray(p.serviceIds) && p.serviceIds.map(Number).includes(Number(s.id))
        );
        const proLabel = linkedPros.length
          ? linkedPros.map((p) => p.nombre).join(", ")
          : (s.professionalId != null ? (professionalById(s.professionalId)?.nombre || "—") : "Cualquiera");
        return `
        <tr class="border-b border-border last:border-0 align-top">
          <td class="px-4 py-3">
            <p class="font-semibold">${escapeHtml(s.nombre)}</p>
            <p class="text-meta-sm mt-0.5">${escapeHtml(s.descripcion || "Sin descripción")}</p>
            <p class="text-meta-sm mt-0.5">Profesional: ${escapeHtml(proLabel)}</p>
          </td>
          <td class="px-4 py-3 text-meta">${escapeHtml(s.categoria || "—")}</td>
          <td class="px-4 py-3">${escapeHtml(formatDuration(s.duracionMin))}</td>
          <td class="px-4 py-3 font-medium">${escapeHtml(formatMoney(s.precio))}</td>
          <td class="px-4 py-3 font-medium">${escapeHtml(formatMoney(s.sena))}</td>
          <td class="px-4 py-3">
            <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${activo ? "badge-success" : "badge-neutral"}">${activo ? "Activo" : "Inactivo"}</span>
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button type="button" data-edit-servicio="${escapeHtml(s.id)}" class="text-xs font-semibold text-business-accent hover:underline mr-3">Editar</button>
            <button type="button" data-del-servicio="${escapeHtml(s.id)}" class="text-xs font-semibold text-danger hover:underline">Eliminar</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function agregarServicio() {
    const body = {
      nombre: $("nuevoServNombre")?.value?.trim(),
      descripcion: $("nuevoServDesc")?.value?.trim() || "",
      duracionMin: Number($("nuevoServDuracion")?.value),
      precio: $("nuevoServPrecio")?.value?.trim() || "0",
      sena: $("nuevoServSena")?.value?.trim() || "0",
      categoria: $("nuevoServCat")?.value?.trim() || null,
      professionalId: $("nuevoServProfesional")?.value || null,
    };
    try {
      if (editingServiceId) {
        await api(`/api/${SLUG}/admin/services/${editingServiceId}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, activo: true }),
        });
        setMessage($("cfgServMsg"), "Servicio actualizado.", false);
      } else {
        await api(`/api/${SLUG}/admin/services`, { method: "POST", body: JSON.stringify(body) });
        setMessage($("cfgServMsg"), "Servicio agregado.", false);
      }
      resetServicioForm();
      $("formServicio")?.classList.add("hidden");
      await Promise.all([loadServices(), loadProfessionals()]);
      renderServicios();
      renderEquipo();
    } catch (e) {
      setMessage($("cfgServMsg"), e.message, true);
    }
  }

  // ---- equipo ----
  let editingProId = null;
  let pendingProFotoFile = null;

  function atProfessionalLimit() {
    const max = config?.maxProfessionals;
    if (!Number.isFinite(max)) return false;
    const count = activeProfessionals().length;
    return count >= max;
  }

  function renderProServiciosCheckboxes(selectedIds = []) {
    const box = $("nuevoProServicios");
    if (!box) return;
    const activos = (servicesCache || []).filter((s) => s.activo !== false);
    if (!activos.length) {
      box.innerHTML = `<p class="text-meta-sm">Todavía no hay servicios. Creá al menos uno en <button type="button" data-goto="servicios" class="font-semibold text-business-accent underline">Servicios</button>.</p>`;
      return;
    }
    const selected = new Set((selectedIds || []).map(Number));
    box.innerHTML = activos
      .map(
        (s) => `
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="pro-svc-check accent-[var(--business-accent)]" value="${escapeHtml(s.id)}" ${selected.has(Number(s.id)) ? "checked" : ""} />
        <span>${escapeHtml(s.nombre)}</span>
      </label>`
      )
      .join("");
  }

  function selectedProServiceIds() {
    return [...document.querySelectorAll("#nuevoProServicios .pro-svc-check:checked")].map((el) => Number(el.value));
  }

  function fillServicioProfessionalSelect(selected) {
    const sel = $("nuevoServProfesional");
    if (!sel) return;
    const pros = activeProfessionals();
    sel.innerHTML =
      `<option value="">Profesional (opcional)</option>` +
      pros.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</option>`).join("");
    if (selected != null && selected !== "") sel.value = String(selected);
  }

  function setProFranja2Visible(visible) {
    const block = $("proFranja2Block");
    const btnAdd = $("btnProAgregarFranja2");
    if (block) block.classList.toggle("hidden", !visible);
    if (btnAdd) btnAdd.classList.toggle("hidden", !!visible);
    if (!visible) {
      if ($("proHoraInicio2")) $("proHoraInicio2").value = "";
      if ($("proHoraFin2")) $("proHoraFin2").value = "";
    }
  }

  function setProHorarioPropio(enabled) {
    const check = $("proHorarioPropio");
    if (check) check.checked = !!enabled;
    $("proHorarioBlock")?.classList.toggle("hidden", !enabled);
  }

  function getSelectedProDiasAtencion() {
    return [...document.querySelectorAll("#proDiasAtencion .dia-chip.is-active")]
      .map((btn) => Number(btn.dataset.dia))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
  }

  function setSelectedProDiasAtencion(dias) {
    const fallback =
      Array.isArray(config?.diasAtencion) && config.diasAtencion.length
        ? config.diasAtencion
        : [1, 2, 3, 4, 5];
    const selected = new Set(
      (Array.isArray(dias) && dias.length ? dias : fallback).map(Number)
    );
    document.querySelectorAll("#proDiasAtencion .dia-chip").forEach((btn) => {
      const d = Number(btn.dataset.dia);
      btn.classList.toggle("is-active", selected.has(d));
    });
  }

  function readProScheduleFromForm() {
    const propio = Boolean($("proHorarioPropio")?.checked);
    if (!propio) {
      return { horarioPropio: false };
    }
    const franja2 = !$("proFranja2Block")?.classList.contains("hidden");
    ["proHoraInicio", "proHoraFin", "proHoraInicio2", "proHoraFin2"].forEach(bindClockInputNormalize);
    return {
      horarioPropio: true,
      horaInicio: readAndNormalizeClockField("proHoraInicio"),
      horaFin: readAndNormalizeClockField("proHoraFin"),
      horaInicio2: franja2 ? readAndNormalizeClockField("proHoraInicio2") : "",
      horaFin2: franja2 ? readAndNormalizeClockField("proHoraFin2") : "",
      diasAtencion: getSelectedProDiasAtencion(),
    };
  }

  function formatProHorarioLabel(p) {
    if (!p?.horarioPropio && (p?.horaInicio == null || p?.horaFin == null)) {
      return "Horario del negocio";
    }
    const sched = effectiveScheduleForPro(p);
    let label = `${sched.horaInicio}–${sched.horaFin}`;
    if (sched.horaInicio2 != null && sched.horaFin2 != null) {
      label += ` · ${sched.horaInicio2}–${sched.horaFin2}`;
    }
    return label;
  }

  function resetProForm() {
    editingProId = null;
    pendingProFotoFile = null;
    if ($("editingProId")) $("editingProId").value = "";
    ["nuevoProNombre", "nuevoProEspecialidad", "nuevoProMatricula", "nuevoProBio"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });
    if ($("nuevoProFoto")) $("nuevoProFoto").value = "";
    const preview = $("nuevoProFotoPreview");
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    renderProServiciosCheckboxes([]);
    setProHorarioPropio(false);
    setProFranja2Visible(false);
    if ($("proHoraInicio")) $("proHoraInicio").value = scheduleToClock(config?.horaInicio, "09:00");
    if ($("proHoraFin")) $("proHoraFin").value = scheduleToClock(config?.horaFin, "20:00");
    setSelectedProDiasAtencion(config?.diasAtencion);
    const btn = $("btnGuardarPro");
    if (btn) btn.textContent = "Guardar";
  }

  function fillProForm(p) {
    editingProId = p.id;
    if ($("editingProId")) $("editingProId").value = String(p.id);
    if ($("nuevoProNombre")) $("nuevoProNombre").value = p.nombre || "";
    if ($("nuevoProEspecialidad")) $("nuevoProEspecialidad").value = p.especialidad || "";
    if ($("nuevoProMatricula")) $("nuevoProMatricula").value = p.matricula || "";
    if ($("nuevoProBio")) $("nuevoProBio").value = p.bio || "";
    if ($("nuevoProFoto")) $("nuevoProFoto").value = "";
    pendingProFotoFile = null;
    const preview = $("nuevoProFotoPreview");
    if (preview) {
      if (p.fotoUrl) {
        preview.src = p.fotoUrl;
        preview.classList.remove("hidden");
      } else {
        preview.src = "";
        preview.classList.add("hidden");
      }
    }
    const fromCache = Array.isArray(p.serviceIds) ? p.serviceIds : [];
    const legacy = servicesCache
      .filter((s) => Number(s.professionalId) === Number(p.id))
      .map((s) => Number(s.id));
    renderProServiciosCheckboxes(fromCache.length ? fromCache : legacy);

    const propio = Boolean(p.horarioPropio) || (p.horaInicio != null && p.horaFin != null);
    setProHorarioPropio(propio);
    if (propio) {
      if ($("proHoraInicio")) $("proHoraInicio").value = scheduleToClock(p.horaInicio);
      if ($("proHoraFin")) $("proHoraFin").value = scheduleToClock(p.horaFin);
      const has2 = p.horaInicio2 != null && p.horaFin2 != null;
      setProFranja2Visible(has2);
      if (has2) {
        if ($("proHoraInicio2")) $("proHoraInicio2").value = scheduleToClock(p.horaInicio2);
        if ($("proHoraFin2")) $("proHoraFin2").value = scheduleToClock(p.horaFin2);
      }
      setSelectedProDiasAtencion(p.diasAtencion);
    } else {
      setProFranja2Visible(false);
      if ($("proHoraInicio")) $("proHoraInicio").value = scheduleToClock(config?.horaInicio, "09:00");
      if ($("proHoraFin")) $("proHoraFin").value = scheduleToClock(config?.horaFin, "20:00");
      setSelectedProDiasAtencion(config?.diasAtencion);
    }

    const btn = $("btnGuardarPro");
    if (btn) btn.textContent = "Actualizar";
    $("formPro")?.classList.remove("hidden");
    $("formPro")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function proAvatarHtml(p, sizeClass = "h-16 w-16 text-lg") {
    const color = proColorFromId(p.id);
    if (p.fotoUrl) {
      return `<img src="${escapeHtml(p.fotoUrl)}" alt="${escapeHtml(p.nombre)}" class="${sizeClass} rounded-full object-cover ring-1 ring-border" />`;
    }
    return `<div class="${sizeClass} flex items-center justify-center rounded-full font-bold text-white" style="background:${color}">${escapeHtml(initialsOf(p.nombre))}</div>`;
  }

  function renderEquipo() {
    const list = $("prosAdminList");
    const hint = $("planLimitHint");
    const btn = $("btnAgregarPro");
    const limited = atProfessionalLimit();
    if (hint) {
      if (Number.isFinite(config?.maxProfessionals)) {
        hint.classList.remove("hidden");
        hint.innerHTML = limited
          ? `Tu plan permite hasta ${escapeHtml(config.maxProfessionals)} profesional${config.maxProfessionals === 1 ? "" : "es"}. <button type="button" data-goto="configuracion" class="font-semibold text-business-accent underline">Mejorá tu plan</button>`
          : `Plan: hasta ${escapeHtml(config.maxProfessionals)} profesional${config.maxProfessionals === 1 ? "" : "es"} (${activeProfessionals().length} activos).`;
      } else {
        hint.classList.add("hidden");
      }
    }
    if (btn) {
      btn.disabled = limited && !editingProId;
      btn.classList.toggle("opacity-50", limited && !editingProId);
      btn.classList.toggle("cursor-not-allowed", limited && !editingProId);
    }
    if (!list) return;
    if (!professionalsCache.length) {
      list.innerHTML = `<p class="text-meta sm:col-span-2 lg:col-span-3">Todavía no hay profesionales.</p>`;
      return;
    }
    list.innerHTML = professionalsCache
      .map((p) => {
        const activo = p.activo !== false;
        const svcIds = Array.isArray(p.serviceIds) ? p.serviceIds : [];
        const svcCount = svcIds.length
          ? svcIds.length
          : servicesCache.filter(
              (s) => s.activo !== false && Number(s.professionalId) === Number(p.id)
            ).length;
        const svcNames = (svcIds.length
          ? servicesCache.filter((s) => svcIds.map(Number).includes(Number(s.id)))
          : servicesCache.filter((s) => Number(s.professionalId) === Number(p.id))
        )
          .map((s) => s.nombre)
          .filter(Boolean);
        const rol = p.especialidad || (activo ? "Sin especialidad" : "Inactivo");
        const matricula = p.matricula ? `Mat. ${p.matricula}` : "";
        const bio = p.bio ? `<p class="mt-2 text-meta-sm text-left line-clamp-3">${escapeHtml(p.bio)}</p>` : "";
        const svcList = svcNames.length
          ? `<p class="mb-2 text-center text-meta-sm">${escapeHtml(svcNames.slice(0, 3).join(" · "))}${svcNames.length > 3 ? "…" : ""}</p>`
          : "";
        return `
        <article class="ds-card p-5">
          <div class="flex flex-col items-center text-center mb-3">
            <div class="mb-3">${proAvatarHtml(p)}</div>
            <h3 class="font-semibold w-full truncate">${escapeHtml(p.nombre)}</h3>
            <p class="text-meta-sm font-medium" style="color: var(--business-accent)">${escapeHtml(rol)}</p>
            ${matricula ? `<p class="text-meta-sm mt-0.5">${escapeHtml(matricula)}</p>` : ""}
            ${!activo ? `<p class="mt-1 text-xs font-semibold text-slate-400">Inactivo</p>` : ""}
            ${bio}
          </div>
          ${svcList}
          <p class="mb-1 text-center text-meta-sm">${escapeHtml(formatProHorarioLabel(p))}</p>
          <p class="mb-4 text-center text-meta-sm">${escapeHtml(svcCount)} servicio${svcCount === 1 ? "" : "s"} asignado${svcCount === 1 ? "" : "s"}</p>
          <div class="flex flex-wrap justify-center gap-2">
            <button type="button" data-edit-pro="${escapeHtml(p.id)}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">Editar</button>
            <button type="button" data-toggle-pro="${escapeHtml(p.id)}" data-activo="${activo ? "0" : "1"}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">${activo ? "Desactivar" : "Activar"}</button>
            <button type="button" data-del-pro="${escapeHtml(p.id)}" class="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Eliminar</button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function uploadProFoto(proId, file) {
    if (!file || !proId) return null;
    const prepared = await compressImageFile(file);
    if (prepared.size > 5 * 1024 * 1024) {
      throw new Error("La imagen supera 5 MB incluso comprimida. Probá otra foto.");
    }
    const form = new FormData();
    form.append("foto", prepared);
    const data = await api(`/api/${SLUG}/admin/professionals/${proId}/foto`, {
      method: "PATCH",
      body: form,
    });
    return data.fotoUrl || null;
  }

  async function agregarProfesional() {
    const serviceIds = selectedProServiceIds();
    if (!serviceIds.length) {
      setMessage($("cfgProMsg"), "Seleccioná al menos un servicio.", true);
      return;
    }
    const schedule = readProScheduleFromForm();
    if (schedule.horarioPropio) {
      const a = scheduleToMinutes(schedule.horaInicio);
      const b = scheduleToMinutes(schedule.horaFin);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) {
        setMessage($("cfgProMsg"), "Horario inválido: usá formato HH:MM (ej. 09:00) y Desde menor que Hasta.", true);
        return;
      }
      if (!schedule.diasAtencion.length) {
        setMessage($("cfgProMsg"), "Seleccioná al menos un día de atención.", true);
        return;
      }
    }
    const body = {
      nombre: $("nuevoProNombre")?.value?.trim(),
      especialidad: $("nuevoProEspecialidad")?.value?.trim() || "",
      matricula: $("nuevoProMatricula")?.value?.trim() || "",
      bio: $("nuevoProBio")?.value?.trim() || "",
      serviceIds,
      ...schedule,
    };
    try {
      let proId = editingProId;
      if (editingProId) {
        await api(`/api/${SLUG}/admin/professionals/${editingProId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setMessage($("cfgProMsg"), "Profesional actualizado.", false);
      } else {
        const created = await api(`/api/${SLUG}/admin/professionals`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        proId = created.id;
        setMessage($("cfgProMsg"), "Profesional agregado.", false);
      }
      if (pendingProFotoFile && proId) {
        await uploadProFoto(proId, pendingProFotoFile);
        setMessage($("cfgProMsg"), editingProId ? "Perfil y foto actualizados." : "Profesional y foto guardados.", false);
      }
      resetProForm();
      $("formPro")?.classList.add("hidden");
      await Promise.all([loadProfessionals(), loadServices()]);
      renderEquipo();
      renderServicios();
    } catch (e) {
      setMessage($("cfgProMsg"), e.message, true);
    }
  }

  async function toggleProfesional(id, activo) {
    const pro = professionalById(id);
    if (!pro) return;
    const body = {
      nombre: pro.nombre,
      especialidad: pro.especialidad || "",
      matricula: pro.matricula || "",
      bio: pro.bio || "",
      activo: Boolean(activo),
    };
    if (Array.isArray(pro.serviceIds)) body.serviceIds = pro.serviceIds;
    await api(`/api/${SLUG}/admin/professionals/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    await loadProfessionals();
    renderEquipo();
  }

  async function deleteProfesional(id) {
    if (!confirm("¿Eliminar este profesional?")) return;
    try {
      await api(`/api/${SLUG}/admin/professionals/${id}`, { method: "DELETE" });
      await loadProfessionals();
      renderEquipo();
    } catch (e) {
      alert(e.message);
    }
  }

  // ---- clientes ----
  function buildClientes() {
    const map = new Map();
    reservasActuales.forEach((r) => {
      const tel = String(r.telefono || "").replace(/\D/g, "");
      if (!tel) return;
      const prev = map.get(tel) || { nombre: r.nombre, telefono: tel, count: 0, ultima: r.fecha };
      prev.count += 1;
      if (!prev.ultima || r.fecha > prev.ultima) {
        prev.ultima = r.fecha;
        prev.nombre = r.nombre || prev.nombre;
      }
      map.set(tel, prev);
    });
    return [...map.values()].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));
  }

  function renderClientes() {
    const tbody = $("clientesTableBody");
    const empty = $("clientesEmpty");
    if (!tbody) return;
    const q = String(clientesQuery || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    let clients = buildClientes();
    if (q) {
      clients = clients.filter((c) => {
        const name = String(c.nombre || "").toLowerCase();
        const tel = String(c.telefono || "");
        return name.includes(q) || tel.includes(q.replace(/\D/g, "")) || name.replace(/\s+/g, "").includes(q);
      });
    }
    if (!clients.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      if (empty) {
        empty.textContent = q
          ? "No hay clientes que coincidan con la búsqueda."
          : "Todavía no hay clientes con turnos.";
      }
      return;
    }
    empty?.classList.add("hidden");
    tbody.innerHTML = clients
      .map((c) => {
        const wa = `https://wa.me/${c.telefono}`;
        const frecuente =
          c.count >= 5
            ? `<span class="ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold badge-success">Frecuente</span>`
            : "";
        return `
        <tr class="border-b border-border last:border-0">
          <td class="px-4 py-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style="background: var(--business-accent)">${escapeHtml(initialsOf(c.nombre))}</div>
              <div class="min-w-0">
                <p class="font-medium truncate">${escapeHtml(c.nombre)}${frecuente}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-meta">${escapeHtml(c.telefono)}</td>
          <td class="px-4 py-3 font-medium">${escapeHtml(c.count)}</td>
          <td class="px-4 py-3 text-meta">${escapeHtml(formatFecha(c.ultima))}</td>
          <td class="px-4 py-3 text-right">
            <a href="${wa}" target="_blank" rel="noopener" class="text-xs font-semibold text-business-accent hover:underline">WhatsApp</a>
          </td>
        </tr>`;
      })
      .join("");
  }

  // ---- planes ----
  function resetPlanForm() {
    editingPlanId = null;
    ["nuevoPlanNombre", "nuevoPlanSesiones", "nuevoPlanPrecio", "nuevoPlanDesc"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });
    const btn = $("btnAgregarPlanCliente");
    if (btn) btn.textContent = "Guardar plan";
  }

  function fillPlanForm(p) {
    editingPlanId = p.id;
    if ($("nuevoPlanNombre")) $("nuevoPlanNombre").value = p.nombre || "";
    if ($("nuevoPlanSesiones")) $("nuevoPlanSesiones").value = p.sesiones || "";
    if ($("nuevoPlanPrecio")) $("nuevoPlanPrecio").value = p.precio || "";
    if ($("nuevoPlanDesc")) $("nuevoPlanDesc").value = p.descripcion || "";
    const btn = $("btnAgregarPlanCliente");
    if (btn) btn.textContent = "Actualizar plan";
    $("formPlan")?.classList.remove("hidden");
    $("formPlan")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlanes() {
    const list = $("planesClienteList");
    if (!list) return;
    const items = plansCache || [];
    const cards = items
      .map((p) => {
        const activo = p.activo !== false;
        return `
      <article class="ds-card p-5 flex flex-col">
        <div class="mb-3">
          <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${activo ? "badge-success" : "badge-neutral"}">${activo ? "Activo" : "Inactivo"}</span>
        </div>
        <h3 class="font-semibold text-lg">${escapeHtml(p.nombre)}</h3>
        <p class="text-meta mt-1 flex-1">${escapeHtml(p.descripcion || "Sin descripción")}</p>
        <p class="mt-4 text-2xl font-bold" style="color: var(--business-accent)">${escapeHtml(formatMoney(p.precio))}</p>
        <p class="text-meta-sm mt-1">${escapeHtml(p.sesiones)} sesiones</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" data-edit-plan="${escapeHtml(p.id)}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">Editar</button>
          <button type="button" data-del-plan="${escapeHtml(p.id)}" class="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Eliminar</button>
        </div>
      </article>`;
      })
      .join("");

    const createCard = `
      <button type="button" id="btnCrearPlanCard" class="plan-create-card">
        <span class="text-2xl font-light leading-none">+</span>
        <span class="text-sm font-semibold">Crear nuevo plan</span>
      </button>`;

    list.innerHTML = cards + createCard;
  }

  async function agregarPlan() {
    const body = {
      nombre: $("nuevoPlanNombre")?.value?.trim(),
      sesiones: Number($("nuevoPlanSesiones")?.value),
      precio: $("nuevoPlanPrecio")?.value?.trim() || "0",
      descripcion: $("nuevoPlanDesc")?.value?.trim() || "",
    };
    try {
      if (editingPlanId) {
        await api(`/api/${SLUG}/admin/plans/${editingPlanId}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, activo: true }),
        });
        setMessage($("cfgPlanClienteMsg"), "Plan actualizado.", false);
      } else {
        await api(`/api/${SLUG}/admin/plans`, { method: "POST", body: JSON.stringify(body) });
        setMessage($("cfgPlanClienteMsg"), "Plan agregado.", false);
      }
      resetPlanForm();
      $("formPlan")?.classList.add("hidden");
      await loadPlans();
      renderPlanes();
    } catch (e) {
      setMessage($("cfgPlanClienteMsg"), e.message, true);
    }
  }

  // ---- contenido (videos + galería) ----
  function handleMigracionAviso(message) {
    const el = $("contenidoMigracionAviso");
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  async function loadVideos() {
    const data = await api(`/api/${SLUG}/admin/videos`);
    videosCache = Array.isArray(data) ? data : [];
    handleMigracionAviso(null);
  }

  function renderVideosAdmin() {
    const list = $("videosAdminList");
    const empty = $("videosAdminEmpty");
    if (!list) return;
    const items = videosCache || [];
    empty?.classList.toggle("hidden", items.length > 0);
    list.innerHTML = items.map((v) => `
      <article class="ds-card p-4 flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <p class="font-semibold truncate">${escapeHtml(v.titulo || "Sin título")}</p>
          <span class="shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${v.activo ? "badge-success" : "badge-neutral"}">${v.activo ? "Activo" : "Oculto"}</span>
        </div>
        <a href="${escapeHtml(v.url)}" target="_blank" rel="noopener" class="text-xs text-business-accent hover:underline truncate">${escapeHtml(v.url)}</a>
        <p class="text-meta-sm">Orden: ${escapeHtml(v.orden ?? 0)}</p>
        <div class="mt-1 flex flex-wrap gap-2">
          <button type="button" data-toggle-video="${escapeHtml(v.id)}" data-activo="${v.activo ? "0" : "1"}" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-bg">${v.activo ? "Ocultar" : "Mostrar"}</button>
          <button type="button" data-del-video="${escapeHtml(v.id)}" class="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg">Eliminar</button>
        </div>
      </article>`).join("");

    list.querySelectorAll("[data-toggle-video]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-video");
        const activo = btn.getAttribute("data-activo") === "1";
        try {
          await api(`/api/${SLUG}/admin/videos/${id}`, { method: "PUT", body: JSON.stringify({ activo }) });
          await loadVideos();
          renderVideosAdmin();
        } catch (e) { setMessage($("videoFormMsg"), e.message, true); }
      });
    });
    list.querySelectorAll("[data-del-video]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este video?")) return;
        try {
          await api(`/api/${SLUG}/admin/videos/${btn.getAttribute("data-del-video")}`, { method: "DELETE" });
          await loadVideos();
          renderVideosAdmin();
        } catch (e) { setMessage($("videoFormMsg"), e.message, true); }
      });
    });
  }

  function uploadVideoDirectoASupabase(file, onProgress) {
    return new Promise(async (resolve, reject) => {
      let signed;
      try {
        signed = await api(`/api/${SLUG}/admin/videos/upload-url`, {
          method: "POST",
          body: JSON.stringify({ mimetype: file.type }),
        });
      } catch (e) {
        reject(e);
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.signedUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(signed.publicUrl);
        else reject(new Error("No se pudo subir el video (código " + xhr.status + ")."));
      });
      xhr.addEventListener("error", () => reject(new Error("No se pudo subir el video. Revisá tu conexión.")));
      xhr.send(file);
    });
  }

  async function agregarVideo() {
    const titulo = $("nuevoVideoTitulo")?.value?.trim() || "";
    const url = $("nuevoVideoUrl")?.value?.trim() || "";
    const orden = Number($("nuevoVideoOrden")?.value) || 0;
    const fileInput = $("nuevoVideoArchivo");
    const file = fileInput?.files?.[0] || null;

    if (!url && !file) {
      setMessage($("videoFormMsg"), "Pegá un link o subí un archivo de video.", true);
      return;
    }

    const btn = $("btnAgregarVideo");
    const progressWrap = $("videoUploadProgress");
    const progressBar = $("videoUploadBar");
    if (btn) btn.disabled = true;

    try {
      let finalUrl = url;
      if (file) {
        progressWrap?.classList.remove("hidden");
        if (progressBar) progressBar.style.width = "0%";
        setMessage($("videoFormMsg"), "Subiendo video…", false);
        finalUrl = await uploadVideoDirectoASupabase(file, (pct) => {
          if (progressBar) progressBar.style.width = pct + "%";
        });
      }
      await api(`/api/${SLUG}/admin/videos`, { method: "POST", body: JSON.stringify({ titulo, url: finalUrl, orden }) });
      ["nuevoVideoTitulo", "nuevoVideoUrl", "nuevoVideoOrden"].forEach((id) => { if ($(id)) $(id).value = ""; });
      if (fileInput) fileInput.value = "";
      setMessage($("videoFormMsg"), "Video agregado.", false);
      await loadVideos();
      renderVideosAdmin();
    } catch (e) {
      setMessage($("videoFormMsg"), e.message, true);
    } finally {
      if (btn) btn.disabled = false;
      progressWrap?.classList.add("hidden");
    }
  }

  async function loadGaleriaAdmin() {
    const data = await api(`/api/${SLUG}/admin/galeria`);
    galeriaCache = Array.isArray(data) ? data : [];
    handleMigracionAviso(null);
  }

  function renderGaleriaAdmin() {
    const list = $("galeriaAdminList");
    const empty = $("galeriaAdminEmpty");
    if (!list) return;
    const items = galeriaCache || [];
    empty?.classList.toggle("hidden", items.length > 0);
    list.innerHTML = items.map((f) => `
      <article class="ds-card overflow-hidden">
        <div class="aspect-square bg-neutral-bg">
          <img src="${escapeHtml(f.imagenUrl)}" alt="${escapeHtml(f.titulo || "")}" class="h-full w-full object-cover" loading="lazy" />
        </div>
        <div class="p-2.5 flex flex-col gap-1.5">
          <p class="text-xs font-semibold truncate">${escapeHtml(f.titulo || "Sin título")}</p>
          <span class="inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${f.activo ? "badge-success" : "badge-neutral"}">${f.activo ? "Activa" : "Oculta"}</span>
          <div class="flex flex-wrap gap-1.5">
            <button type="button" data-toggle-foto="${escapeHtml(f.id)}" data-activo="${f.activo ? "0" : "1"}" class="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-neutral-bg">${f.activo ? "Ocultar" : "Mostrar"}</button>
            <button type="button" data-del-foto="${escapeHtml(f.id)}" class="rounded-lg border border-danger/30 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-bg">Eliminar</button>
          </div>
        </div>
      </article>`).join("");

    list.querySelectorAll("[data-toggle-foto]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-foto");
        const activo = btn.getAttribute("data-activo") === "1";
        try {
          await api(`/api/${SLUG}/admin/galeria/${id}`, { method: "PATCH", body: JSON.stringify({ activo }) });
          await loadGaleriaAdmin();
          renderGaleriaAdmin();
        } catch (e) { setMessage($("fotoFormMsg"), e.message, true); }
      });
    });
    list.querySelectorAll("[data-del-foto]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta foto?")) return;
        try {
          await api(`/api/${SLUG}/admin/galeria/${btn.getAttribute("data-del-foto")}`, { method: "DELETE" });
          await loadGaleriaAdmin();
          renderGaleriaAdmin();
        } catch (e) { setMessage($("fotoFormMsg"), e.message, true); }
      });
    });
  }

  async function agregarFoto() {
    const fileInput = $("nuevaFotoArchivo");
    const file = fileInput?.files?.[0];
    if (!file) {
      setMessage($("fotoFormMsg"), "Elegí una foto para subir.", true);
      return;
    }
    const titulo = $("nuevaFotoTitulo")?.value?.trim() || "";
    const orden = Number($("nuevaFotoOrden")?.value) || 0;
    const btn = $("btnAgregarFoto");
    if (btn) { btn.disabled = true; btn.textContent = "Subiendo…"; }
    try {
      const prepared = await compressImageFile(file);
      const form = new FormData();
      form.append("foto", prepared);
      form.append("titulo", titulo);
      form.append("orden", String(orden));
      await api(`/api/${SLUG}/admin/galeria`, { method: "POST", body: form });
      ["nuevaFotoTitulo", "nuevaFotoOrden"].forEach((id) => { if ($(id)) $(id).value = ""; });
      if (fileInput) fileInput.value = "";
      setMessage($("fotoFormMsg"), "Foto subida.", false);
      await loadGaleriaAdmin();
      renderGaleriaAdmin();
    } catch (e) {
      setMessage($("fotoFormMsg"), e.message, true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Subir foto"; }
    }
  }

  // ---- movimientos (caja) ----
  const MOV_CATS = {
    ingreso: ["Turnos", "Señas", "Productos", "Otros"],
    gasto: ["Alquiler", "Insumos", "Sueldos", "Servicios", "Marketing", "Impuestos", "Otros"],
  };

  function fillMovCategorias(tipo) {
    const sel = $("movCategoria");
    if (!sel) return;
    const cats = MOV_CATS[tipo] || MOV_CATS.ingreso;
    const current = sel.value;
    sel.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (cats.includes(current)) sel.value = current;
  }

  function resetMovimientoForm() {
    editingMovimientoId = null;
    if ($("movTipo")) $("movTipo").value = "ingreso";
    fillMovCategorias("ingreso");
    if ($("movDescripcion")) $("movDescripcion").value = "";
    if ($("movMonto")) $("movMonto").value = "";
    if ($("movFecha")) $("movFecha").value = todayISO();
    const btn = $("btnGuardarMovimiento");
    if (btn) btn.textContent = "+ Agregar movimiento";
    $("btnCancelarEditMov")?.classList.add("hidden");
  }

  function fillMovimientoForm(m) {
    editingMovimientoId = m.id;
    if ($("movTipo")) $("movTipo").value = m.tipo || "ingreso";
    fillMovCategorias(m.tipo || "ingreso");
    if ($("movCategoria")) $("movCategoria").value = m.categoria || "Otros";
    if ($("movDescripcion")) $("movDescripcion").value = m.descripcion || "";
    if ($("movMonto")) $("movMonto").value = m.monto ?? "";
    if ($("movFecha")) $("movFecha").value = m.fecha || todayISO();
    const btn = $("btnGuardarMovimiento");
    if (btn) btn.textContent = "Actualizar movimiento";
    $("btnCancelarEditMov")?.classList.remove("hidden");
    $("movDescripcion")?.focus();
  }

  function fillMovFiltroMes() {
    const sel = $("movFiltroMes");
    if (!sel) return;
    const current = sel.value;
    const months = new Set();
    (movimientosCache || []).forEach((m) => {
      if (m.fecha && m.fecha.length >= 7) months.add(m.fecha.slice(0, 7));
    });
    const sorted = [...months].sort().reverse();
    sel.innerHTML =
      `<option value="">Todos los meses</option>` +
      sorted
        .map((ym) => {
          const [y, mo] = ym.split("-");
          const label = `${mo}/${y}`;
          return `<option value="${escapeHtml(ym)}">${escapeHtml(label)}</option>`;
        })
        .join("");
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  function filteredMovimientos() {
    const mes = $("movFiltroMes")?.value || "";
    const tipo = $("movFiltroTipo")?.value || "";
    const q = ($("movBuscar")?.value || "").trim().toLowerCase();
    return (movimientosCache || []).filter((m) => {
      if (mes && !String(m.fecha || "").startsWith(mes)) return false;
      if (tipo && m.tipo !== tipo) return false;
      if (q) {
        const hay = `${m.descripcion || ""} ${m.categoria || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderMovimientos() {
    fillMovFiltroMes();
    if (!$("movFecha")?.value) {
      if ($("movFecha")) $("movFecha").value = todayISO();
    }
    if (!$("movCategoria")?.options?.length) fillMovCategorias($("movTipo")?.value || "ingreso");

    const items = filteredMovimientos();
    const ingresos = items.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + (Number(m.monto) || 0), 0);
    const gastos = items.filter((m) => m.tipo === "gasto").reduce((a, m) => a + (Number(m.monto) || 0), 0);
    const balance = ingresos - gastos;

    if ($("movKpiIngresos")) $("movKpiIngresos").textContent = formatMoney(ingresos);
    if ($("movKpiGastos")) $("movKpiGastos").textContent = formatMoney(gastos);
    if ($("movKpiBalance")) $("movKpiBalance").textContent = formatMoney(balance);

    const list = $("movimientosList");
    const empty = $("movimientosEmpty");
    if (!list) return;

    if (!items.length) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    list.innerHTML = items
      .map((m) => {
        const isGasto = m.tipo === "gasto";
        const montoTxt = `${isGasto ? "−" : "+"} ${formatMoney(m.monto)}`;
        return `
        <tr class="border-b border-border last:border-0 align-top">
          <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(m.fecha || "—")}</td>
          <td class="px-4 py-3">
            <span class="mov-badge ${isGasto ? "is-gasto" : "is-ingreso"}">${isGasto ? "Gasto" : "Ingreso"}</span>
          </td>
          <td class="px-4 py-3 font-medium">
            ${escapeHtml(m.descripcion || "—")}
            ${m.appointmentId || String(m.descripcion || "").includes("#turno:") ? `<span class="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Turno</span>` : ""}
          </td>
          <td class="px-4 py-3 text-meta">${escapeHtml(m.categoria || "—")}</td>
          <td class="px-4 py-3 font-semibold whitespace-nowrap ${isGasto ? "text-red-600" : "text-emerald-700"}">${escapeHtml(montoTxt)}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button type="button" data-edit-mov="${escapeHtml(m.id)}" class="text-xs font-semibold text-business-accent hover:underline mr-3">Editar</button>
            <button type="button" data-del-mov="${escapeHtml(m.id)}" class="text-xs font-semibold text-danger hover:underline">Eliminar</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function guardarMovimiento() {
    const body = {
      tipo: $("movTipo")?.value || "ingreso",
      descripcion: $("movDescripcion")?.value?.trim(),
      categoria: $("movCategoria")?.value || "Otros",
      monto: $("movMonto")?.value,
      fecha: $("movFecha")?.value || todayISO(),
    };
    try {
      if (editingMovimientoId) {
        await api(`/api/${SLUG}/admin/movimientos/${editingMovimientoId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setMessage($("movFormMsg"), "Movimiento actualizado.", false);
      } else {
        await api(`/api/${SLUG}/admin/movimientos`, { method: "POST", body: JSON.stringify(body) });
        setMessage($("movFormMsg"), "Movimiento agregado.", false);
      }
      resetMovimientoForm();
      await loadMovimientos();
      renderMovimientos();
    } catch (e) {
      setMessage($("movFormMsg"), e.message, true);
    }
  }

  // ---- estadísticas ----
  function setStatsMode(mode) {
    statsMode = mode;
    $("btnStatsSemana")?.classList.toggle("is-active", mode === "semana");
    $("btnStatsMes")?.classList.toggle("is-active", mode === "mes");
    renderEstadisticas();
  }

  function buildPeriodBuckets() {
    const buckets = [];
    const now = todayISO();
    if (statsMode === "semana") {
      for (let i = 5; i >= 0; i--) {
        const start = getMonday(addDaysISO(now, -i * 7));
        const end = addDaysISO(start, 6);
        buckets.push({ key: start, label: formatFecha(start), start, end });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const [y, m] = now.split("-").map(Number);
        let mm = m - i;
        let yy = y;
        while (mm <= 0) {
          mm += 12;
          yy -= 1;
        }
        const key = `${yy}-${pad2(mm)}`;
        const start = `${key}-01`;
        const lastDay = new Date(yy, mm, 0).getDate();
        const end = `${key}-${pad2(lastDay)}`;
        buckets.push({ key, label: `${pad2(mm)}/${yy}`, start, end });
      }
    }
    return buckets;
  }

  function inBucket(fecha, bucket) {
    if (statsMode === "semana") return fecha >= bucket.start && fecha <= bucket.end;
    return String(fecha).slice(0, 7) === bucket.key;
  }

  function svgLineChart(values, { width = 420, height = 160, color = "var(--business-accent)" } = {}) {
    const max = Math.max(1, ...values.map((v) => v.count));
    const padX = 16;
    const padY = 16;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const n = Math.max(1, values.length - 1);
    const points = values.map((v, i) => {
      const x = padX + (i / n) * innerW;
      const y = padY + innerH - (v.count / max) * innerH;
      return { x, y, ...v };
    });
    const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
    const area = `${padX},${padY + innerH} ${polyline} ${padX + innerW},${padY + innerH}`;
    const dots = points
      .map(
        (p) =>
          `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" /><title>${escapeHtml(p.label)}: ${escapeHtml(p.count)}</title>`
      )
      .join("");
    const labels = points
      .map(
        (p, i) =>
          i % Math.ceil(points.length / 4) === 0 || i === points.length - 1
            ? `<text x="${p.x}" y="${height - 2}" text-anchor="middle" font-size="10" fill="#71717A">${escapeHtml(p.label)}</text>`
            : ""
      )
      .join("");
    return `
      <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" role="img" aria-label="Gráfico de turnos">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <polygon points="${area}" fill="url(#lineFill)" />
        <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${labels}
      </svg>`;
  }

  function svgBarChart(values, { width = 420, height = 140, color = "var(--business-accent)" } = {}) {
    const max = Math.max(1, ...values.map((v) => v.count));
    const padX = 16;
    const padY = 12;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2 - 14;
    const gap = 8;
    const barW = Math.max(8, (innerW - gap * (values.length - 1)) / Math.max(1, values.length));
    const bars = values
      .map((v, i) => {
        const h = (v.count / max) * innerH;
        const x = padX + i * (barW + gap);
        const y = padY + innerH - h;
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(2, h)}" rx="4" fill="${color}" opacity="0.9">
            <title>${escapeHtml(v.label)}: ${escapeHtml(formatMoney(v.count))}</title>
          </rect>
          <text x="${x + barW / 2}" y="${height - 2}" text-anchor="middle" font-size="9" fill="#71717A">${escapeHtml(v.label)}</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" role="img" aria-label="Gráfico de ingresos">${bars}</svg>`;
  }

  function renderEstadisticas() {
    const all = reservasActuales;
    const buckets = buildPeriodBuckets();
    const current = buckets[buckets.length - 1];
    const previous = buckets[buckets.length - 2];

    const inCurrent = all.filter((r) => inBucket(r.fecha, current));
    const inPrev = previous ? all.filter((r) => inBucket(r.fecha, previous)) : [];

    const confirmados = all.filter((r) => r.estado === "confirmada");
    const cancelados = all.filter((r) => r.estado === "cancelada");
    const ingresos = confirmados.reduce((acc, r) => acc + appointmentPrice(r), 0);

    const curTotal = inCurrent.length;
    const prevTotal = inPrev.length;
    const curConf = inCurrent.filter((r) => r.estado === "confirmada").length;
    const prevConf = inPrev.filter((r) => r.estado === "confirmada").length;
    const curCanc = inCurrent.filter((r) => r.estado === "cancelada").length;
    const prevCanc = inPrev.filter((r) => r.estado === "cancelada").length;
    const curIng = inCurrent
      .filter((r) => r.estado === "confirmada")
      .reduce((acc, r) => acc + appointmentPrice(r), 0);
    const prevIng = inPrev
      .filter((r) => r.estado === "confirmada")
      .reduce((acc, r) => acc + appointmentPrice(r), 0);

    if ($("statTotal")) $("statTotal").textContent = String(all.length);
    if ($("statConfirmados")) $("statConfirmados").textContent = String(confirmados.length);
    if ($("statCancelados")) $("statCancelados").textContent = String(cancelados.length);
    if ($("statIngresos")) $("statIngresos").textContent = formatMoney(ingresos);

    const setTrend = (id, cur, prev) => {
      const el = $(id);
      if (!el) return;
      const t = trendLabel(cur, prev);
      el.textContent = t.text;
      el.className = `kpi-sub ${t.cls}`;
    };
    setTrend("statTotalTrend", curTotal, prevTotal);
    setTrend("statConfirmadosTrend", curConf, prevConf);
    setTrend("statCanceladosTrend", curCanc, prevCanc);
    setTrend("statIngresosTrend", curIng, prevIng);

    const series = buckets.map((b) => ({
      label: b.label,
      count: all.filter((r) => r.estado !== "cancelada" && inBucket(r.fecha, b)).length,
    }));
    const ingresosSeries = buckets.map((b) => ({
      label: b.label,
      count: all
        .filter((r) => r.estado === "confirmada" && inBucket(r.fecha, b))
        .reduce((acc, r) => acc + appointmentPrice(r), 0),
    }));

    const bars = $("statsBars");
    if (bars) bars.innerHTML = svgLineChart(series);

    const ingresosEl = $("statsIngresos");
    if (ingresosEl) ingresosEl.innerHTML = svgBarChart(ingresosSeries);

    const pie = $("statsPie");
    if (pie) {
      const total = Math.max(1, all.length);
      const parts = [
        { key: "confirmada", label: "Pagado", color: "var(--success)", n: confirmados.length },
        {
          key: "pendiente",
          label: "Sin cobrar",
          color: "var(--warning)",
          n: all.filter((r) => r.estado === "pendiente").length,
        },
        { key: "cancelada", label: "Cancelada", color: "var(--danger)", n: cancelados.length },
      ];
      let acc = 0;
      const stops = parts
        .map((p) => {
          const start = acc;
          const pct = (p.n / total) * 100;
          acc += pct;
          return `${p.color} ${start}% ${acc}%`;
        })
        .join(", ");
      pie.innerHTML = `
        <div class="relative h-36 w-36 shrink-0">
          <div class="h-full w-full rounded-full" style="background: conic-gradient(${stops})"></div>
          <div class="absolute inset-4 rounded-full bg-card flex items-center justify-center">
            <div class="text-center">
              <p class="text-lg font-bold leading-none">${escapeHtml(all.length)}</p>
              <p class="text-meta-sm">total</p>
            </div>
          </div>
        </div>
        <ul class="space-y-2 text-sm">
          ${parts
            .map(
              (p) => `
            <li class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full" style="background:${p.color}"></span>
              ${escapeHtml(p.label)}: <strong>${escapeHtml(p.n)}</strong>
            </li>`
            )
            .join("")}
        </ul>`;
    }

    const activas = all.filter((r) => r.estado !== "cancelada");
    const svcCount = new Map();
    activas.forEach((r) => {
      const name = serviceName(r);
      svcCount.set(name, (svcCount.get(name) || 0) + 1);
    });
    const top = [...svcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxSvc = Math.max(1, ...top.map(([, n]) => n));
    const svcEl = $("statsServicios");
    if (svcEl) {
      svcEl.innerHTML = top.length
        ? top
            .map(
              ([name, n]) => `
          <div>
            <div class="mb-1 flex justify-between gap-2 text-sm">
              <span class="truncate">${escapeHtml(name)}</span>
              <span class="font-semibold">${escapeHtml(n)}</span>
            </div>
            <div class="stat-bar"><span style="width:${Math.round((n / maxSvc) * 100)}%"></span></div>
          </div>`
            )
            .join("")
        : `<p class="text-meta">Sin datos aún.</p>`;
    }

    // Caja (movimientos)
    const movs = movimientosCache || [];
    const curMovs = movs.filter((m) => inBucket(m.fecha, current));
    const prevMovs = previous ? movs.filter((m) => inBucket(m.fecha, previous)) : [];
    const sumTipo = (arr, tipo) =>
      arr.filter((m) => m.tipo === tipo).reduce((a, m) => a + (Number(m.monto) || 0), 0);
    const curIngCaja = sumTipo(curMovs, "ingreso");
    const curGasCaja = sumTipo(curMovs, "gasto");
    const prevIngCaja = sumTipo(prevMovs, "ingreso");
    const prevGasCaja = sumTipo(prevMovs, "gasto");
    const curBal = curIngCaja - curGasCaja;
    const prevBal = prevIngCaja - prevGasCaja;

    if ($("statCajaIngresos")) $("statCajaIngresos").textContent = formatMoney(curIngCaja);
    if ($("statCajaGastos")) $("statCajaGastos").textContent = formatMoney(curGasCaja);
    if ($("statCajaBalance")) $("statCajaBalance").textContent = formatMoney(curBal);
    setTrend("statCajaIngresosTrend", curIngCaja, prevIngCaja);
    setTrend("statCajaGastosTrend", curGasCaja, prevGasCaja);
    setTrend("statCajaBalanceTrend", curBal, prevBal);

    const cajaEl = $("statsCaja");
    if (cajaEl) {
      const cajaSeries = buckets.map((b) => {
        const inB = movs.filter((m) => inBucket(m.fecha, b));
        const ing = sumTipo(inB, "ingreso");
        const gas = sumTipo(inB, "gasto");
        return { label: b.label, count: Math.max(0, ing - gas), ing, gas };
      });
      if (!movs.length) {
        cajaEl.innerHTML = `<p class="text-meta">Todavía no hay movimientos de caja. Cargalos en <button type="button" data-goto="movimientos" class="font-semibold text-business-accent underline">Movimientos</button>.</p>`;
      } else {
        cajaEl.innerHTML =
          svgBarChart(cajaSeries) +
          `<p class="text-meta-sm mt-2">Barras = balance (ingresos − gastos) por período.</p>`;
      }
    }
  }

  // ---- config ----
  function setFranja2Visible(visible) {
    const block = $("franja2Block");
    const btnAdd = $("btnAgregarFranja2");
    if (block) block.classList.toggle("hidden", !visible);
    if (btnAdd) btnAdd.classList.toggle("hidden", !!visible);
    if (!visible) {
      if ($("cfgHoraInicio2")) $("cfgHoraInicio2").value = "";
      if ($("cfgHoraFin2")) $("cfgHoraFin2").value = "";
    }
  }

  function clearHorarioSuccessMsg() {
    const msg = $("horarioMsg");
    if (msg && /guardado|guardando/i.test(msg.textContent || "")) {
      msg.textContent = "";
    }
  }

  function getSelectedDiasAtencion() {
    return [...document.querySelectorAll("#cfgDiasAtencion .dia-chip.is-active")]
      .map((btn) => Number(btn.dataset.dia))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
  }

  function setSelectedDiasAtencion(dias) {
    const selected = new Set(
      (Array.isArray(dias) && dias.length ? dias : [1, 2, 3, 4, 5]).map(Number)
    );
    document.querySelectorAll("#cfgDiasAtencion .dia-chip").forEach((btn) => {
      const d = Number(btn.dataset.dia);
      btn.classList.toggle("is-active", selected.has(d));
    });
  }

  function fillConfigForm() {
    if (!config) return;
    ensureHorariosDatalist();
    ["cfgHoraInicio", "cfgHoraFin", "cfgHoraInicio2", "cfgHoraFin2"].forEach(bindClockInputNormalize);
    if ($("cfgNombre")) $("cfgNombre").value = config.nombre || "";
    if ($("cfgWhatsapp")) $("cfgWhatsapp").value = config.whatsappNumero || "";
    if ($("cfgHoraInicio")) $("cfgHoraInicio").value = scheduleToClock(config.horaInicio, "09:00");
    if ($("cfgHoraFin")) $("cfgHoraFin").value = scheduleToClock(config.horaFin, "20:00");
    const hasFranja2 = config.horaInicio2 != null && config.horaFin2 != null;
    setFranja2Visible(hasFranja2);
    if (hasFranja2) {
      if ($("cfgHoraInicio2")) $("cfgHoraInicio2").value = scheduleToClock(config.horaInicio2);
      if ($("cfgHoraFin2")) $("cfgHoraFin2").value = scheduleToClock(config.horaFin2);
    }
    setSelectedDiasAtencion(config.diasAtencion);
    if ($("cfgCategoria")) $("cfgCategoria").value = config.categoria || "estetica";
    if ($("cfgCiudad")) $("cfgCiudad").value = config.ciudad || "";
    if ($("cfgDireccion")) $("cfgDireccion").value = config.direccion || "";
    if ($("cfgColor")) $("cfgColor").value = config.colorMarca || "#6366F1";
    if ($("cfgAlias")) $("cfgAlias").value = config.transferencia?.alias || "";
    if ($("cfgCbu")) $("cfgCbu").value = config.transferencia?.cbu || "";
    if ($("cfgTitular")) $("cfgTitular").value = config.transferencia?.titular || "";
    const planInfo = $("cfgPlanInfo");
    if (planInfo) {
      const max = config.maxProfessionals;
      planInfo.textContent = `Plan actual: ${config.plan || "—"}${
        Number.isFinite(max) ? ` · hasta ${max} profesional${max === 1 ? "" : "es"}` : ""
      }`;
    }
    updateLogoPreview();
  }

  async function subirLogo(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage($("cfgLogoMsg"), "Solo se permiten imágenes.", true);
      return;
    }
    try {
      setMessage($("cfgLogoMsg"), "Preparando imagen…", false);
      const prepared = await compressImageFile(file);
      if (prepared.size > 5 * 1024 * 1024) {
        setMessage($("cfgLogoMsg"), "La imagen supera 5 MB. Probá otra foto más liviana.", true);
        return;
      }
      const form = new FormData();
      form.append("logo", prepared);
      setMessage($("cfgLogoMsg"), "Subiendo…", false);
      const data = await api(`/api/${SLUG}/admin/logo`, { method: "PATCH", body: form });
      if (config) config.logoUrl = data.logoUrl;
      updateBrandUI();
      setMessage($("cfgLogoMsg"), "Foto actualizada.", false);
    } catch (e) {
      setMessage($("cfgLogoMsg"), e.message || "No se pudo subir la foto.", true);
    }
  }

  async function guardarNegocio() {
    const body = collectNegocioBody();
    if (body.error) {
      setMessage($("cfgNegocioMsg"), body.error, true);
      return;
    }
    try {
      await api(`/api/${SLUG}/admin/business`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage($("cfgNegocioMsg"), "Cambios guardados.", false);
      await loadConfig();
      fillHorarioSelects();
      fillConfigForm();
    } catch (e) {
      setMessage($("cfgNegocioMsg"), e.message, true);
    }
  }

  function collectNegocioBody() {
    const diasAtencion = getSelectedDiasAtencion();
    if (!diasAtencion.length) {
      return { error: "Seleccioná al menos un día de atención." };
    }
    const franja2Visible = !$("franja2Block")?.classList.contains("hidden");
    const horaInicio = readAndNormalizeClockField("cfgHoraInicio");
    const horaFin = readAndNormalizeClockField("cfgHoraFin");
    const a = scheduleToMinutes(horaInicio);
    const b = scheduleToMinutes(horaFin);
    if (!horaInicio || !horaFin || !Number.isFinite(a) || !Number.isFinite(b) || a >= b) {
      return { error: "Horario inválido: usá HH:MM (ej. 09:00 o 20:30). También sirve 9 o 20.30." };
    }
    let horaInicio2 = "";
    let horaFin2 = "";
    if (franja2Visible) {
      horaInicio2 = readAndNormalizeClockField("cfgHoraInicio2");
      horaFin2 = readAndNormalizeClockField("cfgHoraFin2");
      const a2 = scheduleToMinutes(horaInicio2);
      const b2 = scheduleToMinutes(horaFin2);
      if (!horaInicio2 || !horaFin2 || !Number.isFinite(a2) || !Number.isFinite(b2) || a2 >= b2) {
        return { error: "Franja 2 inválida: usá HH:MM (ej. 16:00 o 16.00) y Desde menor que Hasta." };
      }
      if (a2 < b) {
        return {
          error: `La franja 2 debe empezar a las ${horaFin} o después (cuando termina la franja 1).`,
        };
      }
    }
    const direccion = $("cfgDireccion")?.value?.trim() || config?.direccion || "";
    if (!direccion) {
      return { error: "Falta la dirección del negocio. Completala en Configuración y volvé a guardar el horario." };
    }
    return {
      nombre: $("cfgNombre")?.value?.trim() || config?.nombre || "",
      whatsapp: $("cfgWhatsapp")?.value?.trim() || config?.whatsappNumero || "",
      horaInicio,
      horaFin,
      horaInicio2,
      horaFin2,
      diasAtencion,
      categoria: $("cfgCategoria")?.value || config?.categoria || "otro",
      ciudad: $("cfgCiudad")?.value?.trim() || config?.ciudad || "",
      direccion,
      colorMarca: $("cfgColor")?.value || config?.colorMarca || "#6366F1",
      transferAlias: $("cfgAlias")?.value?.trim() || config?.transferencia?.alias || "",
      transferCbu: $("cfgCbu")?.value?.trim() || config?.transferencia?.cbu || "",
      transferTitular: $("cfgTitular")?.value?.trim() || config?.transferencia?.titular || "",
    };
  }

  async function guardarHorario() {
    const btn = $("btnGuardarHorario");
    const msg = $("horarioMsg");
    setMessage(msg, "Guardando…", false);
    const body = collectNegocioBody();
    if (body.error) {
      setMessage(msg, body.error, true);
      return;
    }
    try {
      if (btn) btn.disabled = true;
      await api(`/api/${SLUG}/admin/business`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage(msg, "Horario guardado.", false);
      await loadConfig();
      fillHorarioSelects();
      fillConfigForm();
      if (agendaMode === "calendario") renderCalendario();
    } catch (e) {
      setMessage(msg, e.message || "No se pudo guardar el horario.", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function cambiarPassword() {
    const body = {
      passwordActual: $("cfgPassActual")?.value?.trim(),
      passwordNuevo: $("cfgPassNuevo")?.value?.trim(),
    };
    try {
      await api(`/api/${SLUG}/admin/password`, { method: "POST", body: JSON.stringify(body) });
      setMessage($("cfgPassMsg"), "Contraseña actualizada.", false);
      if ($("cfgPassActual")) $("cfgPassActual").value = "";
      if ($("cfgPassNuevo")) $("cfgPassNuevo").value = "";
    } catch (e) {
      setMessage($("cfgPassMsg"), e.message, true);
    }
  }

  // ---- login ----
  async function login() {
    const password = $("adminPassword")?.value || "";
    setMessage($("loginMessage"), "");
    try {
      const data = await api(`/api/${SLUG}/admin/login`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      adminToken = data.token;
      localStorage.setItem("adminToken", adminToken);
      if ($("adminPassword")) $("adminPassword").value = "";
      await enterApp();
    } catch (e) {
      setMessage($("loginMessage"), e.message, true);
    }
  }

  async function enterApp() {
    showApp();
    setMobileNav(false);
    try {
      await refreshAll();
      switchView("dashboard");
      startLivePolling();
    } catch (e) {
      if (e.status === 401) {
        logout(false);
        setMessage($("loginMessage"), "Sesión expirada. Ingresá de nuevo.", true);
      } else {
        setMessage($("loginMessage"), e.message, true);
        showLogin();
      }
    }
  }

  // ---- events ----
  function bindEvents() {
    $("btnLogin")?.addEventListener("click", login);
    $("adminPassword")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") login();
    });
    $("btnLogout")?.addEventListener("click", () => logout(true));
    $("btnMobileNav")?.addEventListener("click", () => setMobileNav(!mobileNavOpen));

    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.addEventListener("click", (e) => {
      const goto = e.target.closest?.("[data-goto]");
      if (goto) switchView(goto.dataset.goto);

      const actionBtn = e.target.closest?.("[data-action][data-id]");
      if (actionBtn) {
        const id = actionBtn.dataset.id;
        const action = actionBtn.dataset.action;
        if (action === "modify") openModificarHorario(id);
        if (action === "cancel") {
          if (confirm("¿Cancelar este turno?")) patchEstado(id, "cancelada").catch((err) => alert(err.message));
        }
        if (action === "delete") deleteReserva(id).catch((err) => alert(err.message));
      }

      const delBloq = e.target.closest?.("[data-del-bloqueo]");
      if (delBloq) {
        api(`/api/${SLUG}/admin/bloqueos/${delBloq.dataset.delBloqueo}`, { method: "DELETE" })
          .then(loadBloqueos)
          .catch((err) => alert(err.message));
      }
      const delRec = e.target.closest?.("[data-del-bloq-rec]");
      if (delRec) {
        api(`/api/${SLUG}/admin/bloqueos-recurrentes/${delRec.dataset.delBloqRec}`, { method: "DELETE" })
          .then(loadBloqueosRecurrentes)
          .catch((err) => alert(err.message));
      }
      const delServ = e.target.closest?.("[data-del-servicio]");
      if (delServ) {
        if (!confirm("¿Eliminar este servicio de forma permanente?")) return;
        api(`/api/${SLUG}/admin/services/${delServ.dataset.delServicio}`, { method: "DELETE" })
          .then(async () => {
            await loadServices();
            renderServicios();
          })
          .catch((err) => alert(err.message));
      }
      const editServ = e.target.closest?.("[data-edit-servicio]");
      if (editServ) {
        const s = serviceById(editServ.dataset.editServicio);
        if (s) fillServicioForm(s);
      }
      const delPro = e.target.closest?.("[data-del-pro]");
      if (delPro) deleteProfesional(delPro.dataset.delPro);
      const editPro = e.target.closest?.("[data-edit-pro]");
      if (editPro) {
        const p = professionalById(editPro.dataset.editPro);
        if (p) fillProForm(p);
      }
      const togPro = e.target.closest?.("[data-toggle-pro]");
      if (togPro) {
        toggleProfesional(togPro.dataset.togglePro, togPro.dataset.activo === "1").catch((err) =>
          alert(err.message)
        );
      }
      const delPlan = e.target.closest?.("[data-del-plan]");
      if (delPlan) {
        if (!confirm("¿Eliminar este plan de forma permanente?")) return;
        api(`/api/${SLUG}/admin/plans/${delPlan.dataset.delPlan}`, { method: "DELETE" })
          .then(async () => {
            await loadPlans();
            renderPlanes();
          })
          .catch((err) => alert(err.message));
      }
      const editPlan = e.target.closest?.("[data-edit-plan]");
      if (editPlan) {
        const p = plansCache.find((x) => Number(x.id) === Number(editPlan.dataset.editPlan));
        if (p) fillPlanForm(p);
      }
      const editMov = e.target.closest?.("[data-edit-mov]");
      if (editMov) {
        const m = movimientosCache.find((x) => Number(x.id) === Number(editMov.dataset.editMov));
        if (m) fillMovimientoForm(m);
      }
      const delMov = e.target.closest?.("[data-del-mov]");
      if (delMov) {
        if (!confirm("¿Eliminar este movimiento?")) return;
        api(`/api/${SLUG}/admin/movimientos/${delMov.dataset.delMov}`, { method: "DELETE" })
          .then(async () => {
            await loadMovimientos();
            renderMovimientos();
          })
          .catch((err) => alert(err.message));
      }
      if (e.target.closest?.("#btnCrearPlanCard")) {
        resetPlanForm();
        $("formPlan")?.classList.remove("hidden");
        $("nuevoPlanNombre")?.focus();
      }
    });

    $("btnVistaLista")?.addEventListener("click", () => setAgendaMode("lista"));
    $("btnVistaCalendario")?.addEventListener("click", () => setAgendaMode("calendario"));
    $("btnToggleAgendar")?.addEventListener("click", () => {
      closeModificarHorario();
      const form = $("formAgendarManual");
      const willOpen = form?.classList.contains("hidden");
      if (willOpen) resetAgendarForm();
      form?.classList.toggle("hidden");
      if (willOpen) {
        loadManHorarios();
        $("manNombre")?.focus();
      }
    });
    $("btnCancelarAgendar")?.addEventListener("click", () => {
      $("formAgendarManual")?.classList.add("hidden");
      setMessage($("manMsg"), "");
    });
    $("btnGuardarAgendar")?.addEventListener("click", guardarAgendarManual);
    $("manTelefono")?.addEventListener("input", () => {
      $("manTelefono").value = $("manTelefono").value.replace(/\D/g, "");
    });
    ["manServicio", "manFecha", "manProfesional"].forEach((id) => {
      $(id)?.addEventListener("change", loadManHorarios);
    });
    $("modFecha")?.addEventListener("change", () => {
      loadModHorarios().catch(() => {});
    });
    $("btnGuardarModHorario")?.addEventListener("click", guardarModificarHorario);
    $("btnCancelarModHorario")?.addEventListener("click", closeModificarHorario);
    $("btnFiltrarReservas")?.addEventListener("click", async () => {
      const fecha = $("filtroFecha")?.value || "";
      try {
        await loadReservas(fecha || undefined);
        renderReservas();
      } catch (e) {
        alert(e.message);
      }
    });
    $("btnLimpiarFiltro")?.addEventListener("click", async () => {
      if ($("filtroFecha")) $("filtroFecha").value = "";
      if ($("filtroEstado")) $("filtroEstado").value = "";
      await loadReservas();
      renderReservas();
    });
    $("filtroEstado")?.addEventListener("change", renderReservas);
    $("btnExportarCSV")?.addEventListener("click", exportCSV);
    $("btnCalPrev")?.addEventListener("click", async () => {
      calWeekStart = addDaysISO(calWeekStart || getMonday(todayISO()), -7);
      try {
        await loadReservas();
        await loadBloqueosData();
      } catch (_) { /* keep */ }
      renderCalendario();
    });
    $("btnCalNext")?.addEventListener("click", async () => {
      calWeekStart = addDaysISO(calWeekStart || getMonday(todayISO()), 7);
      try {
        await loadReservas();
        await loadBloqueosData();
      } catch (_) { /* keep */ }
      renderCalendario();
    });
    $("calProfesional")?.addEventListener("change", renderCalendario);

    $("bloqDiaCompleto")?.addEventListener("change", () => {
      const on = $("bloqDiaCompleto").checked;
      ["bloqHorarioDesde", "bloqHorarioHasta"].forEach((id) => {
        if ($(id)) $(id).disabled = on;
      });
    });
    $("btnCrearBloqueo")?.addEventListener("click", crearBloqueo);

    $("btnToggleBloqRec")?.addEventListener("click", () => {
      $("formBloqRecContainer")?.classList.toggle("hidden");
    });
    $("btnCancelarBloqRec")?.addEventListener("click", () => {
      $("formBloqRecContainer")?.classList.add("hidden");
    });
    $("recDiaCompleto")?.addEventListener("change", () => {
      const on = $("recDiaCompleto").checked;
      ["recHorarioDesde", "recHorarioHasta"].forEach((id) => {
        if ($(id)) $(id).disabled = on;
      });
    });
    $("btnGuardarBloqRec")?.addEventListener("click", crearBloqueoRecurrente);

    $("btnToggleServForm")?.addEventListener("click", () => {
      const form = $("formServicio");
      const willOpen = form?.classList.contains("hidden");
      if (willOpen) {
        resetServicioForm();
        fillServicioProfessionalSelect("");
      }
      form?.classList.toggle("hidden");
    });
    $("btnAgregarServicio")?.addEventListener("click", agregarServicio);

    $("btnAgregarPro")?.addEventListener("click", () => {
      if (atProfessionalLimit()) {
        switchView("configuracion");
        return;
      }
      resetProForm();
      renderProServiciosCheckboxes([]);
      $("formPro")?.classList.remove("hidden");
      $("nuevoProNombre")?.focus();
    });
    $("btnGuardarPro")?.addEventListener("click", agregarProfesional);
    $("btnCancelarPro")?.addEventListener("click", () => {
      resetProForm();
      $("formPro")?.classList.add("hidden");
      setMessage($("cfgProMsg"), "", false);
    });
    $("proHorarioPropio")?.addEventListener("change", (e) => {
      setProHorarioPropio(e.target.checked);
      if (e.target.checked && !$("proHoraInicio")?.value) {
        if ($("proHoraInicio")) $("proHoraInicio").value = scheduleToClock(config?.horaInicio, "09:00");
        if ($("proHoraFin")) $("proHoraFin").value = scheduleToClock(config?.horaFin, "20:00");
        setSelectedProDiasAtencion(config?.diasAtencion);
      }
    });
    $("proDiasAtencion")?.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".dia-chip");
      if (!btn) return;
      btn.classList.toggle("is-active");
    });
    $("btnProAgregarFranja2")?.addEventListener("click", () => setProFranja2Visible(true));
    $("btnProQuitarFranja2")?.addEventListener("click", () => setProFranja2Visible(false));
    $("nuevoProFoto")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      pendingProFotoFile = file;
      const preview = $("nuevoProFotoPreview");
      if (!preview) return;
      if (!file) {
        preview.src = "";
        preview.classList.add("hidden");
        return;
      }
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.classList.remove("hidden");
    });

    $("btnTogglePlanForm")?.addEventListener("click", () => {
      const form = $("formPlan");
      const willOpen = form?.classList.contains("hidden");
      if (willOpen) resetPlanForm();
      form?.classList.toggle("hidden");
    });
    $("btnAgregarPlanCliente")?.addEventListener("click", agregarPlan);
    $("btnAgregarVideo")?.addEventListener("click", agregarVideo);
    $("btnAgregarFoto")?.addEventListener("click", agregarFoto);

    $("clientesSearch")?.addEventListener("input", (e) => {
      clientesQuery = e.target.value || "";
      renderClientes();
    });

    $("btnStatsSemana")?.addEventListener("click", () => setStatsMode("semana"));
    $("btnStatsMes")?.addEventListener("click", () => setStatsMode("mes"));

    $("movTipo")?.addEventListener("change", () => fillMovCategorias($("movTipo").value));
    $("btnGuardarMovimiento")?.addEventListener("click", guardarMovimiento);
    $("btnCancelarEditMov")?.addEventListener("click", () => {
      resetMovimientoForm();
      setMessage($("movFormMsg"), "", false);
      $("movFormMsg")?.classList.add("hidden");
    });
    $("movFiltroMes")?.addEventListener("change", renderMovimientos);
    $("movFiltroTipo")?.addEventListener("change", renderMovimientos);
    $("movBuscar")?.addEventListener("input", renderMovimientos);

    $("btnGuardarNegocio")?.addEventListener("click", guardarNegocio);
    $("btnGuardarHorario")?.addEventListener("click", guardarHorario);
    $("btnAgregarFranja2")?.addEventListener("click", () => {
      clearHorarioSuccessMsg();
      setFranja2Visible(true);
      ["cfgHoraInicio2", "cfgHoraFin2"].forEach(bindClockInputNormalize);
      $("cfgHoraInicio2")?.focus();
    });
    $("btnQuitarFranja2")?.addEventListener("click", () => {
      clearHorarioSuccessMsg();
      setFranja2Visible(false);
    });
    $("cfgDiasAtencion")?.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".dia-chip");
      if (!btn) return;
      btn.classList.toggle("is-active");
    });
    $("cfgLogoInput")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) subirLogo(file);
      e.target.value = "";
    });
    $("btnCambiarPass")?.addEventListener("click", cambiarPassword);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && adminToken) pollLiveReservas();
    });

    window.addEventListener("resize", () => setMobileNav(mobileNavOpen));
  }

  // ---- boot ----
  async function boot() {
    if (!SLUG) {
      setMessage($("loginMessage"), "URL inválida: falta el slug del negocio.", true);
      return;
    }
    bindEvents();
    try {
      await loadConfig();
    } catch (e) {
      setMessage($("loginMessage"), e.message || "No se pudo cargar el negocio.", true);
    }
    if (adminToken) {
      await enterApp();
    } else {
      showLogin();
    }
  }

  boot();
})();
