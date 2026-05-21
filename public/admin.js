function getClubSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] || "";
}
const CLUB_SLUG = getClubSlug();

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const loginCard = document.getElementById("loginCard");
const adminPanel = document.getElementById("adminPanel");
const adminPassword = document.getElementById("adminPassword");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMessage = document.getElementById("loginMessage");
const adminMessage = document.getElementById("adminMessage");
const bloqCancha = document.getElementById("bloqCancha");
const bloqFecha = document.getElementById("bloqFecha");
const bloqHorarioDesde = document.getElementById("bloqHorarioDesde");
const bloqHorarioHasta = document.getElementById("bloqHorarioHasta");
const bloqDiaCompleto = document.getElementById("bloqDiaCompleto");
const bloqMotivo = document.getElementById("bloqMotivo");
const btnCrearBloqueo = document.getElementById("btnCrearBloqueo");
const bloqueosList = document.getElementById("bloqueosList");
const reservasList = document.getElementById("reservasList");

let config = null;
let adminToken = localStorage.getItem("adminToken") || "";
let reservasActuales = [];

function todayISO() {
  const date = new Date();
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date - tzOffset).toISOString().split("T")[0];
}

function formatFecha(fechaIso) {
  const [yyyy, mm, dd] = fechaIso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function setMessage(el, text, isError = true) {
  el.textContent = text;
  el.style.color = isError ? "#c62020" : "#1d6d2b";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || "Error de servidor.");
    err.status = response.status;
    throw err;
  }
  return data;
}

async function loadConfig() {
  config = await api(`/api/${CLUB_SLUG}/config`);

  // Poblar dropdown de canchas dinamicamente
  const canchaOptions = config.canchas
    .map((c) => `<option value="${c.nombre}">${c.etiqueta}</option>`)
    .join("");
  bloqCancha.innerHTML = canchaOptions;

  // Poblar selectores de horarios
  const horarioOptions = config.horarios
    .map((h) => `<option value="${h}">${h}</option>`)
    .join("");
  bloqHorarioDesde.innerHTML = horarioOptions;
  bloqHorarioHasta.innerHTML = horarioOptions;

  // Actualizar link de volver al menu
  const linkMenu = document.getElementById("linkMenu");
  if (linkMenu) linkMenu.href = `/${CLUB_SLUG}`;

  // Actualizar titulo con nombre del club
  const h1 = document.querySelector("h1");
  if (h1 && config.nombre) h1.textContent = `Panel Admin - ${config.nombre}`;

  // Poblar selector de cancha del calendario
  const calCanchaEl = document.getElementById("calCancha");
  if (calCanchaEl) {
    calCanchaEl.innerHTML = config.canchas
      .map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.etiqueta)}</option>`)
      .join("");
  }

  // Poblar selectores de bloqueos recurrentes
  const recCanchaEl = document.getElementById("recCancha");
  if (recCanchaEl) {
    recCanchaEl.innerHTML = config.canchas
      .map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.etiqueta)}</option>`)
      .join("");
  }
  const recHorarioDesdeEl = document.getElementById("recHorarioDesde");
  const recHorarioHastaEl = document.getElementById("recHorarioHasta");
  if (recHorarioDesdeEl && recHorarioHastaEl) {
    const horarioOpts = config.horarios.map((h) => `<option value="${h}">${h}</option>`).join("");
    recHorarioDesdeEl.innerHTML = horarioOpts;
    recHorarioHastaEl.innerHTML = horarioOpts;
  }
}

function getCanchaEtiqueta(nombreCancha) {
  if (!config) return `Cancha ${nombreCancha}`;
  const found = config.canchas.find((c) => c.nombre === String(nombreCancha));
  return found ? found.etiqueta : `Cancha ${nombreCancha}`;
}

function whatsappHref(r) {
  const telefono = r.telefono.replace(/\D/g, "");
  const canchaLabel = getCanchaEtiqueta(r.cancha);
  const fecha = formatFecha(r.fecha);
  const texto = encodeURIComponent(
    `Hola ${r.nombre}, te contactamos sobre tu reserva en ${canchaLabel} el ${fecha} a las ${r.horario}hs.`
  );
  return `https://wa.me/${telefono}?text=${texto}`;
}

function estadoBadge(estado) {
  const estilos = {
    pendiente: "bg-amber-100 text-amber-800 border border-amber-200",
    confirmada: "bg-green-100 text-green-800 border border-green-200",
  };
  const labels = { pendiente: "Sin pagar", confirmada: "Pagado" };
  const cls = estilos[estado] || estilos.pendiente;
  const label = labels[estado] || "Sin pagar";
  return `<span class="rounded-full px-2 py-0.5 text-xs font-semibold ${cls}">${label}</span>`;
}

function renderReservas(reservas) {
  if (!reservas.length) { reservasList.innerHTML = "<p>No hay reservas.</p>"; return; }
  const sorted = [...reservas].sort((a, b) => {
    if (a.estado === "pendiente" && b.estado !== "pendiente") return -1;
    if (a.estado !== "pendiente" && b.estado === "pendiente") return 1;
    return 0;
  });
  reservasList.innerHTML = sorted.map((r) => `
    <article class="rounded-lg border border-green-100 bg-white p-3 shadow-sm">
      <div class="mb-1 flex items-center gap-2">
        ${estadoBadge(r.estado)}
        <strong>${escapeHtml(r.nombre)}</strong> — ${escapeHtml(r.telefono)}
      </div>
      <p class="text-sm text-slate-600">${escapeHtml(getCanchaEtiqueta(r.cancha))} · ${formatFecha(r.fecha)} · ${escapeHtml(r.horario)}</p>
      <p class="mt-1">
        <a href="${escapeHtml(r.comprobanteUrl)}" target="_blank" rel="noopener noreferrer"
           class="text-sm text-green-700 underline hover:text-green-900">Ver comprobante</a>
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        ${r.estado === "pendiente"
          ? `<button class="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800"
               data-action="confirmar" data-id="${r.id}" type="button">Marcar pagado</button>`
          : `<button class="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-950"
               data-action="revertir" data-id="${r.id}" type="button">Marcar sin pagar</button>`}
        <a href="${escapeHtml(whatsappHref(r))}" target="_blank" rel="noopener noreferrer"
           class="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
          WhatsApp
        </a>
        <button class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
          data-action="cancelar" data-id="${r.id}" type="button">Cancelar turno</button>
      </div>
    </article>
  `).join("");
}

function renderBloqueos(bloqueos) {
  if (!bloqueos.length) { bloqueosList.innerHTML = "<p>No hay bloqueos activos.</p>"; return; }
  bloqueosList.innerHTML = bloqueos.map((b) => `
    <article class="rounded-lg border border-amber-100 bg-amber-50 p-3">
      <p><strong>${escapeHtml(getCanchaEtiqueta(b.cancha))}</strong> - ${formatFecha(b.fecha)}</p>
      <p class="text-sm text-amber-800">${escapeHtml(describeBloqueoHorario(b))}</p>
      <p class="text-sm text-slate-600">Motivo: ${escapeHtml(b.motivo)}</p>
      <button class="mt-1 rounded-lg bg-red-700 px-3 py-2 font-semibold text-white hover:bg-red-800"
        data-action="quitar-bloqueo" data-id="${b.id}" type="button">
        Quitar bloqueo
      </button>
    </article>
  `).join("");
}

function describeBloqueoHorario(bloqueo) {
  if (bloqueo.diaCompleto) return "Dia completo";
  if (bloqueo.horarioDesde && bloqueo.horarioHasta) {
    return `Horario ${bloqueo.horarioDesde} a ${bloqueo.horarioHasta}`;
  }
  return `Horario ${bloqueo.horario}`;
}

const filtroFecha = document.getElementById("filtroFecha");
const btnFiltrarReservas = document.getElementById("btnFiltrarReservas");
const btnLimpiarFiltro = document.getElementById("btnLimpiarFiltro");

async function loadReservasAdmin(fecha = "") {
  const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
  const reservas = await api(`/api/${CLUB_SLUG}/admin/reservas${qs}`);
  reservasActuales = reservas;
  renderReservas(reservas);
}

async function refreshAdminData() {
  const [, bloqueos, bloqueosRec] = await Promise.all([
    loadReservasAdmin(filtroFecha.value),
    api(`/api/${CLUB_SLUG}/admin/bloqueos`),
    api(`/api/${CLUB_SLUG}/admin/bloqueos-recurrentes`),
  ]);
  renderBloqueos(bloqueos);
  renderBloqueosRecurrentes(bloqueosRec);
}

btnFiltrarReservas.addEventListener("click", () => loadReservasAdmin(filtroFecha.value));

btnLimpiarFiltro.addEventListener("click", () => {
  filtroFecha.value = "";
  loadReservasAdmin("");
});

function setAuthenticatedUI(isAuth) {
  loginCard.classList.toggle("hidden", isAuth);
  adminPanel.classList.toggle("hidden", !isAuth);
}

btnLogin.addEventListener("click", async () => {
  try {
    const password = adminPassword.value.trim();
    if (!password) { setMessage(loginMessage, "Ingresa la clave admin."); return; }
    const data = await api(`/api/${CLUB_SLUG}/admin/login`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    adminToken = data.token;
    localStorage.setItem("adminToken", adminToken);
    setAuthenticatedUI(true);
    setMessage(loginMessage, "");
    await refreshAdminData();
  } catch (error) { setMessage(loginMessage, error.message || "No se pudo iniciar sesion."); }
});

btnLogout.addEventListener("click", () => {
  adminToken = "";
  localStorage.removeItem("adminToken");
  window.location.href = `/${CLUB_SLUG}`;
});

btnCrearBloqueo.addEventListener("click", async () => {
  try {
    const payload = {
      cancha: bloqCancha.value,
      fecha: bloqFecha.value,
      horario: bloqHorarioDesde.value,
      horarioDesde: bloqDiaCompleto.checked ? "" : bloqHorarioDesde.value,
      horarioHasta: bloqDiaCompleto.checked ? "" : bloqHorarioHasta.value,
      diaCompleto: bloqDiaCompleto.checked,
      motivo: bloqMotivo.value.trim(),
    };
    await api(`/api/${CLUB_SLUG}/admin/bloqueos`, { method: "POST", body: JSON.stringify(payload) });
    setMessage(adminMessage, "Bloqueo creado correctamente.", false);
    await refreshAdminData();
  } catch (error) { setMessage(adminMessage, error.message || "No se pudo crear el bloqueo."); }
});

bloqDiaCompleto.addEventListener("change", () => {
  bloqHorarioDesde.disabled = bloqDiaCompleto.checked;
  bloqHorarioHasta.disabled = bloqDiaCompleto.checked;
});

bloqueosList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.action !== "quitar-bloqueo") return;
  const id = target.dataset.id;
  if (!id) return;
  if (!window.confirm("¿Estas seguro de que queres quitar este bloqueo?")) return;
  try {
    await api(`/api/${CLUB_SLUG}/admin/bloqueos/${id}`, { method: "DELETE" });
    setMessage(adminMessage, "Bloqueo eliminado.", false);
    await refreshAdminData();
  } catch (error) { setMessage(adminMessage, error.message || "No se pudo eliminar el bloqueo."); }
});

reservasList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const { action, id } = target.dataset;
  if (!action || !id) return;

  if (action === "confirmar" || action === "revertir") {
    const nuevoEstado = action === "confirmar" ? "confirmada" : "pendiente";
    try {
      await api(`/api/${CLUB_SLUG}/admin/reservas/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      setMessage(adminMessage, nuevoEstado === "confirmada" ? "Turno marcado como pagado." : "Turno marcado sin pagar.", false);
      await loadReservasAdmin(filtroFecha.value);
    } catch (error) { setMessage(adminMessage, error.message || "No se pudo actualizar el estado."); }
    return;
  }

  if (action === "cancelar") {
    if (!window.confirm("¿Estas seguro de que queres cancelar este turno? Esta accion lo libera.")) return;
    try {
      const data = await api(`/api/${CLUB_SLUG}/admin/reservas/${id}`, { method: "DELETE" });
      setMessage(adminMessage, "Turno cancelado y liberado.", false);
      const r = data.reserva;
      const telefono = r.telefono.replace(/\D/g, "");
      const fecha = formatFecha(r.fecha);
      const canchaLabel = getCanchaEtiqueta(r.cancha);
      const mensajeWa = encodeURIComponent(
        `Hola ${r.nombre}, te informamos que tu turno en ${canchaLabel} el ${fecha} a las ${r.horario}hs fue cancelado por administración. Disculpá los inconvenientes.`
      );
      window.open(`https://wa.me/${telefono}?text=${mensajeWa}`, "_blank");
      await refreshAdminData();
    } catch (error) { setMessage(adminMessage, error.message || "No se pudo cancelar el turno."); }
  }
});

// ── Configuración del club ────────────────────────────────────

const btnToggleConfig = document.getElementById("btnToggleConfig");
const configPanel = document.getElementById("configPanel");
const configChevron = document.getElementById("configChevron");

const cfgNombre = document.getElementById("cfgNombre");
const cfgWhatsapp = document.getElementById("cfgWhatsapp");
const cfgHoraInicio = document.getElementById("cfgHoraInicio");
const cfgHoraFin = document.getElementById("cfgHoraFin");
const cfgPrecio = document.getElementById("cfgPrecio");
const cfgAlias = document.getElementById("cfgAlias");
const cfgCbu = document.getElementById("cfgCbu");
const cfgTitular = document.getElementById("cfgTitular");
const btnGuardarClub = document.getElementById("btnGuardarClub");
const cfgClubMsg = document.getElementById("cfgClubMsg");

const canchasList = document.getElementById("canchasList");
const nuevaCanchaNombre = document.getElementById("nuevaCanchaNombre");
const nuevaCanchaEtiqueta = document.getElementById("nuevaCanchaEtiqueta");
const btnAgregarCancha = document.getElementById("btnAgregarCancha");
const cfgCanchaMsg = document.getElementById("cfgCanchaMsg");

const cfgPassActual = document.getElementById("cfgPassActual");
const cfgPassNuevo = document.getElementById("cfgPassNuevo");
const btnCambiarPass = document.getElementById("btnCambiarPass");
const cfgPassMsg = document.getElementById("cfgPassMsg");

btnToggleConfig.addEventListener("click", () => {
  const hidden = configPanel.classList.toggle("hidden");
  configChevron.style.transform = hidden ? "" : "rotate(180deg)";
  if (!hidden) loadConfigPanel();
});

function fillClubForm(cfg) {
  cfgNombre.value = cfg.nombre || "";
  cfgWhatsapp.value = cfg.whatsappNumero || "";
  cfgHoraInicio.value = cfg.horaInicio ?? 10;
  cfgHoraFin.value = cfg.horaFin ?? 23;
  cfgPrecio.value = cfg.precio || "0";
  cfgAlias.value = cfg.transferencia?.alias || "";
  cfgCbu.value = cfg.transferencia?.cbu || "";
  cfgTitular.value = cfg.transferencia?.titular || "";
}

const PLAN_LABEL = { inicial: "Inicial", estandar: "Estándar", max: "Max" };

async function loadCanchas() {
  const canchas = await api(`/api/${CLUB_SLUG}/admin/canchas`);
  const plan = config?.plan || "inicial";
  const maxCanchas = config?.maxCanchas ?? 2;
  const planNombre = PLAN_LABEL[plan] || plan;
  const activas = canchas.filter((c) => c.activa !== false).length;
  const atLimit = activas >= maxCanchas;

  const planBadge = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-slate-500">
        Plan <strong class="text-slate-700">${escapeHtml(planNombre)}</strong> — ${activas}/${maxCanchas} cancha${maxCanchas === 1 ? "" : "s"}
      </span>
      ${atLimit ? `<span class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Límite alcanzado</span>` : ""}
    </div>
  `;

  if (!canchas.length) {
    canchasList.innerHTML = planBadge + "<p class='text-slate-500 text-sm'>No hay canchas cargadas.</p>";
    return;
  }
  canchasList.innerHTML = planBadge + canchas.map((c) => `
    <div class="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2" data-cancha-id="${c.id}">
      <span class="font-mono text-sm bg-green-200 text-green-900 rounded px-2 py-0.5">${escapeHtml(c.nombre)}</span>
      <input type="text" value="${escapeHtml(c.etiqueta)}" class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm cancha-etiqueta-input focus:outline-none focus:ring-1 focus:ring-green-500" data-id="${c.id}" />
      <button class="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white hover:bg-green-800"
        data-action="renombrar-cancha" data-id="${c.id}" type="button">Guardar</button>
      <button class="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
        data-action="eliminar-cancha" data-id="${c.id}" type="button">Eliminar</button>
    </div>
  `).join("");
}

async function loadConfigPanel() {
  try {
    fillClubForm(config);
    await loadCanchas();
  } catch (error) {
    cfgClubMsg.textContent = error.message || "No se pudo cargar la configuracion.";
    cfgClubMsg.style.color = "#c62020";
  }
}

btnGuardarClub.addEventListener("click", async () => {
  try {
    await api(`/api/${CLUB_SLUG}/admin/club`, {
      method: "PATCH",
      body: JSON.stringify({
        nombre: cfgNombre.value.trim(),
        whatsapp: cfgWhatsapp.value.trim(),
        horaInicio: cfgHoraInicio.value,
        horaFin: cfgHoraFin.value,
        precio: cfgPrecio.value.trim(),
        transferAlias: cfgAlias.value.trim(),
        transferCbu: cfgCbu.value.trim(),
        transferTitular: cfgTitular.value.trim(),
      }),
    });
    setMessage(cfgClubMsg, "Cambios guardados.", false);
    // Recargar config para reflejar cambios en el resto del panel
    await loadConfig();
  } catch (error) { setMessage(cfgClubMsg, error.message || "No se pudo guardar."); }
});

btnAgregarCancha.addEventListener("click", async () => {
  try {
    await api(`/api/${CLUB_SLUG}/admin/canchas`, {
      method: "POST",
      body: JSON.stringify({
        nombre: nuevaCanchaNombre.value.trim(),
        etiqueta: nuevaCanchaEtiqueta.value.trim(),
      }),
    });
    nuevaCanchaNombre.value = "";
    nuevaCanchaEtiqueta.value = "";
    setMessage(cfgCanchaMsg, "Cancha agregada.", false);
    await loadCanchas();
    await loadConfig();
  } catch (error) { setMessage(cfgCanchaMsg, error.message || "No se pudo agregar la cancha."); }
});

canchasList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.action === "renombrar-cancha") {
    const id = target.dataset.id;
    const input = canchasList.querySelector(`.cancha-etiqueta-input[data-id="${id}"]`);
    const etiqueta = input?.value.trim();
    if (!etiqueta) { setMessage(cfgCanchaMsg, "La etiqueta no puede estar vacia."); return; }
    try {
      await api(`/api/${CLUB_SLUG}/admin/canchas/${id}`, { method: "PUT", body: JSON.stringify({ etiqueta }) });
      setMessage(cfgCanchaMsg, "Etiqueta actualizada.", false);
      await loadConfig();
    } catch (error) { setMessage(cfgCanchaMsg, error.message || "No se pudo actualizar."); }
  }

  if (target.dataset.action === "eliminar-cancha") {
    const id = target.dataset.id;
    if (!window.confirm("¿Eliminar esta cancha? Solo se puede si no tiene reservas futuras.")) return;
    try {
      await api(`/api/${CLUB_SLUG}/admin/canchas/${id}`, { method: "DELETE" });
      setMessage(cfgCanchaMsg, "Cancha eliminada.", false);
      await loadCanchas();
      await loadConfig();
    } catch (error) { setMessage(cfgCanchaMsg, error.message || "No se pudo eliminar."); }
  }
});

btnCambiarPass.addEventListener("click", async () => {
  try {
    await api(`/api/${CLUB_SLUG}/admin/password`, {
      method: "POST",
      body: JSON.stringify({
        passwordActual: cfgPassActual.value,
        passwordNuevo: cfgPassNuevo.value,
      }),
    });
    cfgPassActual.value = "";
    cfgPassNuevo.value = "";
    setMessage(cfgPassMsg, "Contrasena cambiada correctamente.", false);
  } catch (error) { setMessage(cfgPassMsg, error.message || "No se pudo cambiar la contrasena."); }
});

// ── Bloqueos recurrentes ──────────────────────────────────────

const DAY_LABELS_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function renderBloqueosRecurrentes(bloqueos) {
  const container = document.getElementById("bloqueosRecurrentesList");
  if (!container) return;
  if (!bloqueos.length) {
    container.innerHTML = "<p class='text-sm text-slate-500'>No hay bloqueos recurrentes.</p>";
    return;
  }
  container.innerHTML = bloqueos.map((b) => {
    const canchaLabel = getCanchaEtiqueta(b.cancha);
    const diaLabel = DAY_LABELS_FULL[b.diaSemana] ?? `Día ${b.diaSemana}`;
    const horarioLabel = b.diaCompleto ? "Día completo" : `${b.horarioDesde} — ${b.horarioHasta}`;
    return `<article class="flex items-start justify-between gap-3 rounded-lg border border-violet-100 bg-violet-50 p-3">
      <div>
        <p class="font-semibold text-slate-800">${escapeHtml(canchaLabel)} — todos los ${escapeHtml(diaLabel)}</p>
        <p class="text-sm text-slate-600">${escapeHtml(horarioLabel)}${b.motivo ? ` · ${escapeHtml(b.motivo)}` : ""}</p>
      </div>
      <button class="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
        data-action="quitar-bloqueo-rec" data-id="${b.id}" type="button">Quitar</button>
    </article>`;
  }).join("");
}

document.getElementById("btnToggleBloqRec")?.addEventListener("click", () => {
  document.getElementById("formBloqRecContainer")?.classList.toggle("hidden");
});

document.getElementById("btnCancelarBloqRec")?.addEventListener("click", () => {
  document.getElementById("formBloqRecContainer")?.classList.add("hidden");
});

document.getElementById("recDiaCompleto")?.addEventListener("change", (e) => {
  const dis = e.target.checked;
  document.getElementById("recHorarioDesde").disabled = dis;
  document.getElementById("recHorarioHasta").disabled = dis;
});

document.getElementById("btnGuardarBloqRec")?.addEventListener("click", async () => {
  const recMsg = document.getElementById("recMsg");
  try {
    const cancha = document.getElementById("recCancha").value;
    const diaSemana = parseInt(document.getElementById("recDiaSemana").value, 10);
    const diaCompleto = document.getElementById("recDiaCompleto").checked;
    const horarioDesde = document.getElementById("recHorarioDesde").value;
    const horarioHasta = document.getElementById("recHorarioHasta").value;
    const motivo = document.getElementById("recMotivo").value.trim();
    await api(`/api/${CLUB_SLUG}/admin/bloqueos-recurrentes`, {
      method: "POST",
      body: JSON.stringify({ cancha, diaSemana, diaCompleto, horarioDesde, horarioHasta, motivo }),
    });
    setMessage(recMsg, "Bloqueo recurrente guardado.", false);
    document.getElementById("recMotivo").value = "";
    document.getElementById("recDiaCompleto").checked = false;
    document.getElementById("recHorarioDesde").disabled = false;
    document.getElementById("recHorarioHasta").disabled = false;
    document.getElementById("formBloqRecContainer").classList.add("hidden");
    const bloqueosRec = await api(`/api/${CLUB_SLUG}/admin/bloqueos-recurrentes`);
    renderBloqueosRecurrentes(bloqueosRec);
  } catch (e) { setMessage(recMsg, e.message || "No se pudo guardar."); }
});

document.getElementById("bloqueosRecurrentesList")?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.action !== "quitar-bloqueo-rec") return;
  const id = target.dataset.id;
  if (!id || !window.confirm("¿Quitar este bloqueo recurrente?")) return;
  try {
    await api(`/api/${CLUB_SLUG}/admin/bloqueos-recurrentes/${id}`, { method: "DELETE" });
    setMessage(adminMessage, "Bloqueo recurrente eliminado.", false);
    const bloqueosRec = await api(`/api/${CLUB_SLUG}/admin/bloqueos-recurrentes`);
    renderBloqueosRecurrentes(bloqueosRec);
  } catch (e) { setMessage(adminMessage, e.message || "No se pudo eliminar."); }
});

// ── Vista calendario ──────────────────────────────────────────

const btnVistaLista = document.getElementById("btnVistaLista");
const btnVistaCalendario = document.getElementById("btnVistaCalendario");
const vistaLista = document.getElementById("vistaLista");
const vistaCalendario = document.getElementById("vistaCalendario");
const filtrosLista = document.getElementById("filtrosLista");

let calSemanaOffset = 0;

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function getWeekDates(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().split("T")[0];
  });
}

function updateCalLabel(dates) {
  const label = document.getElementById("calSemanaLabel");
  if (!label) return;
  const [, m0, d0] = dates[0].split("-");
  const [y1, m1, d1] = dates[6].split("-");
  label.textContent = `${d0}/${m0} — ${d1}/${m1}/${y1}`;
}

function findBloqueoCalendario(bloqueos, cancha, fecha, horario) {
  const horaNum = Number(horario.split(":")[0]);
  return bloqueos.find((b) => {
    if (b.cancha !== cancha || b.fecha !== fecha) return false;
    if (b.diaCompleto) return true;
    if (b.horarioDesde && b.horarioHasta) {
      return horaNum >= Number(b.horarioDesde.split(":")[0]) && horaNum <= Number(b.horarioHasta.split(":")[0]);
    }
    return b.horario === horario;
  });
}

function renderCalGrid(dates, reservasPorDia, bloqueos, cancha) {
  const calGrid = document.getElementById("calGrid");
  if (!calGrid || !config) return;
  const horarios = config.horarios;
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  const todayStr = new Date(now - tz).toISOString().split("T")[0];

  const reservaMap = {};
  dates.forEach((fecha, i) => { reservaMap[fecha] = reservasPorDia[i] || []; });

  const thead = `<thead><tr>
    <th class="sticky left-0 z-10 min-w-[52px] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">Hora</th>
    ${dates.map((fecha, i) => {
      const [, mm, dd] = fecha.split("-");
      const isToday = fecha === todayStr;
      return `<th class="min-w-[90px] border-b border-r border-slate-200 px-2 py-2 text-xs font-semibold ${isToday ? "bg-green-50 text-green-800" : "bg-slate-50 text-slate-500"}">
        ${escapeHtml(DAY_NAMES[i])}<br/><span class="font-normal">${dd}/${mm}</span>
      </th>`;
    }).join("")}
  </tr></thead>`;

  const tbody = horarios.map((horario) => {
    const cells = dates.map((fecha) => {
      const reserva = (reservaMap[fecha] || []).find((r) => r.horario === horario);
      const bloqueo = findBloqueoCalendario(bloqueos, cancha, fecha, horario);
      const [y, mo, d] = fecha.split("-").map(Number);
      const [h, m] = horario.split(":").map(Number);
      const pasado = new Date(y, mo - 1, d, h, m).getTime() < Date.now();

      if (bloqueo) {
        return `<td class="border-r border-b border-slate-200 bg-amber-50 px-1.5 py-1.5 align-top text-xs">
          <span class="block font-semibold leading-tight text-amber-700">Bloqueado</span>
          ${bloqueo.motivo ? `<span class="block max-w-[80px] truncate leading-tight text-amber-600">${escapeHtml(bloqueo.motivo)}</span>` : ""}
        </td>`;
      }
      if (reserva) {
        const color = reserva.estado === "confirmada" ? "text-green-700" : "text-amber-700";
        const label = reserva.estado === "confirmada" ? "Pagado" : "Sin pagar";
        return `<td class="border-r border-b border-slate-200 bg-blue-50 px-1.5 py-1.5 align-top text-xs">
          <span class="block max-w-[80px] truncate font-semibold leading-tight text-slate-700">${escapeHtml(reserva.nombre)}</span>
          <span class="block leading-tight ${color}">${escapeHtml(label)}</span>
        </td>`;
      }
      if (pasado) {
        return `<td class="border-r border-b border-slate-200 bg-slate-50 px-1.5 py-1.5 text-xs text-slate-300">—</td>`;
      }
      return `<td class="border-r border-b border-slate-200 bg-emerald-50 px-1.5 py-1.5 text-xs text-emerald-400">libre</td>`;
    }).join("");
    return `<tr>
      <td class="sticky left-0 z-10 border-r border-b border-slate-200 bg-slate-50 px-2 py-2 text-xs font-mono font-semibold text-slate-600">${escapeHtml(horario)}</td>
      ${cells}
    </tr>`;
  }).join("");

  calGrid.innerHTML = `<table class="w-full border-collapse text-left">${thead}<tbody>${tbody}</tbody></table>`;
}

async function loadCalendario() {
  const calGrid = document.getElementById("calGrid");
  const calCanchaEl = document.getElementById("calCancha");
  if (!calGrid || !calCanchaEl || !config) return;
  const cancha = calCanchaEl.value;
  const dates = getWeekDates(calSemanaOffset);
  updateCalLabel(dates);
  calGrid.innerHTML = `<div class="p-4 text-sm text-slate-400">Cargando...</div>`;
  try {
    const [reservasPorDia, todosBloqueos] = await Promise.all([
      Promise.all(
        dates.map((fecha) =>
          api(`/api/${CLUB_SLUG}/admin/reservas?fecha=${encodeURIComponent(fecha)}`)
            .then((rs) => rs.filter((r) => r.cancha === cancha))
            .catch(() => [])
        )
      ),
      api(`/api/${CLUB_SLUG}/admin/bloqueos`).catch(() => []),
    ]);
    renderCalGrid(dates, reservasPorDia, todosBloqueos, cancha);
  } catch (e) {
    calGrid.innerHTML = `<div class="p-4 text-sm text-red-600">${escapeHtml(e.message)}</div>`;
  }
}

function setVista(vista) {
  const isLista = vista === "lista";
  vistaLista?.classList.toggle("hidden", !isLista);
  vistaCalendario?.classList.toggle("hidden", isLista);
  filtrosLista?.classList.toggle("hidden", !isLista);
  btnVistaLista?.classList.toggle("bg-green-800", isLista);
  btnVistaLista?.classList.toggle("text-white", isLista);
  btnVistaLista?.classList.toggle("text-green-800", !isLista);
  btnVistaCalendario?.classList.toggle("bg-green-800", !isLista);
  btnVistaCalendario?.classList.toggle("text-white", !isLista);
  btnVistaCalendario?.classList.toggle("text-green-800", isLista);
  if (!isLista) loadCalendario();
}

btnVistaLista?.addEventListener("click", () => setVista("lista"));
btnVistaCalendario?.addEventListener("click", () => setVista("calendario"));
document.getElementById("btnCalPrev")?.addEventListener("click", () => { calSemanaOffset--; loadCalendario(); });
document.getElementById("btnCalNext")?.addEventListener("click", () => { calSemanaOffset++; loadCalendario(); });
document.getElementById("calCancha")?.addEventListener("change", () => loadCalendario());

// ── Exportar CSV ──────────────────────────────────────────────

function exportarCSV() {
  if (!reservasActuales.length) {
    alert("No hay reservas cargadas. Filtrá primero las reservas que querés exportar.");
    return;
  }
  const headers = ["Fecha", "Cancha", "Horario", "Nombre", "Telefono", "Estado"];
  const filas = [headers, ...reservasActuales.map((r) => [
    r.fecha,
    getCanchaEtiqueta(r.cancha),
    r.horario,
    r.nombre,
    r.telefono,
    r.estado === "confirmada" ? "Pagado" : "Sin pagar",
  ])];
  const csv = filas.map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reservas-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById("btnExportarCSV")?.addEventListener("click", exportarCSV);

// ─────────────────────────────────────────────────────────────

async function init() {
  bloqFecha.value = todayISO();
  await loadConfig();
  if (adminToken) {
    try {
      setAuthenticatedUI(true);
      await refreshAdminData();
      return;
    } catch (err) {
      if (err.status === 401) {
        adminToken = "";
        localStorage.removeItem("adminToken");
      } else {
        setMessage(adminMessage, err.message || "Error al cargar datos. Recargá la página.");
        return;
      }
    }
  }
  setAuthenticatedUI(false);
}

init();
