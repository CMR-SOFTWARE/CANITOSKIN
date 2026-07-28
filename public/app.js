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

function formatFecha(fechaIso) {
  const [yyyy, mm, dd] = fechaIso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function todayISO() {
  const date = new Date();
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date - tzOffset).toISOString().split("T")[0];
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

const serviciosList = document.getElementById("serviciosList");
const profesionalSection = document.getElementById("profesionalSection");
const profesionalSelect = document.getElementById("profesional");
const fechaInput = document.getElementById("fecha");
const fechaSectionTitle = document.getElementById("fechaSectionTitle");
const btnBuscar = document.getElementById("btnBuscar");
const horariosContainer = document.getElementById("horarios");
const slotsHint = document.getElementById("slotsHint");
const modal = document.getElementById("modal");
const btnCerrarModal = document.getElementById("btnCerrarModal");
const reservaSeleccion = document.getElementById("reservaSeleccion");
const formReserva = document.getElementById("formReserva");
const paso1 = document.getElementById("paso1");
const paso2 = document.getElementById("paso2");
const btnPaso2 = document.getElementById("btnPaso2");
const btnVolverPaso1 = document.getElementById("btnVolverPaso1");
const mensaje = document.getElementById("mensaje");
const aliasTransferencia = document.getElementById("aliasTransferencia");
const cbuTransferencia = document.getElementById("cbuTransferencia");
const titularTransferencia = document.getElementById("titularTransferencia");
const senaMonto = document.getElementById("senaMonto");
const btnSolicitarCancelacion = document.getElementById("btnSolicitarCancelacion");
const telefonoInput = document.getElementById("telefono");

let config = null;
let selectedServiceId = null;
let slotsActuales = [];
let seleccion = null;

function setMensaje(texto, isError = true) {
  mensaje.textContent = texto;
  mensaje.style.color = isError ? "#c62020" : "var(--success)";
}

function getSelectedService() {
  return (config?.services || []).find((s) => String(s.id) === String(selectedServiceId));
}

function getSelectedProfessional() {
  if (!config?.requiereProfesional) return null;
  const id = profesionalSelect.value;
  return (config.professionals || []).find((p) => String(p.id) === String(id)) || null;
}

function applyBrandColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty("--business-accent", color);
  /* Derivados suaves: hover más oscuro vía color-mix si el browser lo soporta */
  document.documentElement.style.setProperty(
    "--business-accent-hover",
    `color-mix(in srgb, ${color} 85%, black)`
  );
  document.documentElement.style.setProperty(
    "--business-accent-light",
    `color-mix(in srgb, ${color} 12%, white)`
  );
}

function updateStepNumbers() {
  const needsPro = Boolean(config?.requiereProfesional && (config.professionals || []).length);
  profesionalSection.classList.toggle("hidden", !needsPro);
  fechaSectionTitle.textContent = needsPro ? "3. Elegí fecha y horario" : "2. Elegí fecha y horario";
}

function renderServicios() {
  const services = config?.services || [];
  if (!services.length) {
    serviciosList.innerHTML = `<p class="text-sm text-slate-500">No hay servicios disponibles.</p>`;
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
      html += `<p class="col-span-full mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">${escapeHtml(categoriaLabel(key))}</p>`;
    }
    groups[key].forEach((s) => {
      const selected = String(s.id) === String(selectedServiceId);
      const dur = s.duracionMin ? `${s.duracionMin} min` : "";
      const precio = s.precio != null ? `$${formatMoney(s.precio)}` : "";
      const meta = [dur, precio].filter(Boolean).join(" · ");
      html += `
        <button type="button" data-service-id="${escapeHtml(s.id)}"
          class="service-card rounded-lg border-2 border-slate-200 px-3 py-3 text-left transition hover:border-slate-300 ${selected ? "is-selected" : ""}">
          <span class="block font-semibold text-slate-800">${escapeHtml(s.nombre)}</span>
          ${s.descripcion ? `<span class="mt-0.5 block text-xs text-slate-500">${escapeHtml(s.descripcion)}</span>` : ""}
          ${meta ? `<span class="mt-1 block text-sm font-medium text-brand">${escapeHtml(meta)}</span>` : ""}
        </button>`;
    });
  });
  serviciosList.innerHTML = html;
}

function populateProfessionals() {
  const pros = config?.professionals || [];
  profesionalSelect.innerHTML = pros
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</option>`)
    .join("");
}

serviciosList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-service-id]");
  if (!btn) return;
  selectedServiceId = btn.dataset.serviceId;
  renderServicios();
  slotsHint.textContent = "Elegí una fecha y tocá «Ver horarios».";
  horariosContainer.innerHTML = "";
});

async function loadConfig() {
  const response = await fetch(`/api/${SLUG}/config`);
  if (!response.ok) throw new Error("No se pudo cargar la configuración.");
  config = await response.json();

  applyBrandColor(config.colorMarca || config.color_marca);

  aliasTransferencia.textContent = config.transferencia?.alias || "—";
  cbuTransferencia.textContent = config.transferencia?.cbu || "—";
  titularTransferencia.textContent = config.transferencia?.titular || "—";
  senaMonto.textContent = `$${formatMoney(config.precio)}`;

  const linkAdmin = document.getElementById("linkAdmin");
  if (linkAdmin) linkAdmin.href = `/${SLUG}/admin`;

  const h1 = document.querySelector("h1");
  if (h1 && config.nombre) h1.textContent = `Turnos — ${config.nombre}`;
  document.title = config.nombre ? `${config.nombre} · CMR Turnos` : "CMR Turnos";

  const navLogo = document.getElementById("navLogo");
  if (navLogo) {
    if (config.logoUrl) {
      navLogo.outerHTML = `<img id="navLogo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.nombre)}" class="h-12 w-12 md:h-14 md:w-14 rounded-full object-cover ring-1 ring-zinc-600" />`;
    } else {
      const initials = config.nombre.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
      navLogo.textContent = initials;
    }
  }

  renderServicios();
  populateProfessionals();
  updateStepNumbers();
}

async function loadDisponibilidad() {
  if (!selectedServiceId) throw new Error("Seleccioná un servicio primero.");
  const fecha = fechaInput.value;
  if (!fecha) throw new Error("Seleccioná una fecha.");

  const params = new URLSearchParams({
    fecha,
    serviceId: selectedServiceId,
  });
  if (config?.requiereProfesional && profesionalSelect.value) {
    params.set("professionalId", profesionalSelect.value);
  }

  const response = await fetch(`/api/${SLUG}/disponibilidad?${params}`);
  if (!response.ok) throw new Error("No se pudieron cargar los horarios.");
  const data = await response.json();
  slotsActuales = data.slots || data || [];
  if (!Array.isArray(slotsActuales)) slotsActuales = [];
}

function renderSlots() {
  horariosContainer.innerHTML = "";
  if (!slotsActuales.length) {
    slotsHint.textContent = "No hay horarios disponibles para esa fecha.";
    return;
  }
  slotsHint.textContent = "Tocá un horario libre para reservar.";

  slotsActuales.forEach((horario) => {
    const pasado = isHorarioPasado(fechaInput.value, horario);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = horario;
    btn.className = "slot-btn rounded-lg px-3 py-3 font-bold";
    if (pasado) {
      btn.className += " bg-slate-200 text-slate-500 cursor-not-allowed";
      btn.title = "Horario ya pasado";
      btn.disabled = true;
    } else {
      btn.className += " bg-accent-light text-accent-hover hover:bg-accent/20";
      btn.addEventListener("click", () => openModal(horario));
    }
    horariosContainer.appendChild(btn);
  });
}

function openModal(horaInicio) {
  const service = getSelectedService();
  const pro = getSelectedProfessional();
  seleccion = {
    serviceId: selectedServiceId,
    serviceNombre: service?.nombre || "Servicio",
    professionalId: pro?.id || "",
    professionalNombre: pro?.nombre || "",
    fecha: fechaInput.value,
    horaInicio,
  };

  const parts = [
    seleccion.serviceNombre,
    seleccion.professionalNombre,
    formatFecha(seleccion.fecha),
    `${seleccion.horaInicio}hs`,
  ].filter(Boolean);
  reservaSeleccion.textContent = parts.join(" · ");

  paso1.classList.remove("hidden");
  paso2.classList.add("hidden");
  document.getElementById("paso3").classList.add("hidden");
  setMensaje("");
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  formReserva.reset();
  seleccion = null;
  setMensaje("");
  paso1.classList.remove("hidden");
  paso2.classList.add("hidden");
  document.getElementById("paso3").classList.add("hidden");
}

function validarPaso1() {
  const nombre = document.getElementById("nombre").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  if (nombre.length < 3) { setMensaje("Ingresá nombre y apellido."); return false; }
  if (!/^\d{6,15}$/.test(telefono)) { setMensaje("Ingresá un teléfono válido (solo números)."); return false; }
  return true;
}

function buildWhatsAppUrl(reserva) {
  const comprobanteTexto = reserva.comprobanteUrl
    ? `Comprobante: ${reserva.comprobanteUrl}`
    : "Comprobante: cargado en la web";
  const text = [
    "Hola, quiero confirmar mi turno:",
    `Nombre: ${reserva.nombre}`,
    `Teléfono: ${reserva.telefono}`,
    `Servicio: ${seleccion?.serviceNombre || reserva.servicio || ""}`,
    seleccion?.professionalNombre ? `Profesional: ${seleccion.professionalNombre}` : null,
    `Fecha: ${formatFecha(reserva.fecha || seleccion?.fecha)}`,
    `Horario: ${reserva.horaInicio || reserva.horario || seleccion?.horaInicio}hs`,
    comprobanteTexto,
    "Ya realicé la transferencia.",
  ].filter(Boolean).join("\n");
  return `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(text)}`;
}

async function refreshSlots() {
  if (!fechaInput.value) fechaInput.value = todayISO();
  if (!selectedServiceId) {
    slotsHint.textContent = "Seleccioná un servicio para ver los horarios disponibles.";
    horariosContainer.innerHTML = "";
    return;
  }
  await loadDisponibilidad();
  renderSlots();
}

function buildCancelacionWhatsAppUrl() {
  const service = getSelectedService();
  const fecha = fechaInput.value ? formatFecha(fechaInput.value) : "(indicar fecha)";
  const texto = [
    "Hola, quiero solicitar la cancelación de un turno.",
    `Servicio: ${service?.nombre || "(indicar servicio)"}`,
    `Fecha: ${fecha}`,
    "Horario: (indicar horario)",
    "Nombre y teléfono: (indicar datos)",
  ].join("\n");
  return `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(texto)}`;
}

btnBuscar.addEventListener("click", async () => {
  try {
    setMensaje("");
    await refreshSlots();
  } catch (error) {
    slotsHint.textContent = error.message || "Error al cargar horarios.";
    horariosContainer.innerHTML = "";
  }
});

profesionalSelect.addEventListener("change", async () => {
  if (!selectedServiceId || !fechaInput.value) return;
  try { await refreshSlots(); } catch (_) {}
});

fechaInput.addEventListener("change", async () => {
  if (!selectedServiceId) return;
  try { await refreshSlots(); } catch (_) {}
});

telefonoInput.addEventListener("input", () => {
  telefonoInput.value = telefonoInput.value.replace(/\D/g, "");
});

btnCerrarModal.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

btnPaso2.addEventListener("click", () => {
  if (!validarPaso1()) return;
  setMensaje("");
  paso1.classList.add("hidden");
  paso2.classList.remove("hidden");
});

btnVolverPaso1.addEventListener("click", () => {
  paso2.classList.add("hidden");
  paso1.classList.remove("hidden");
  setMensaje("");
});

btnSolicitarCancelacion.addEventListener("click", () => {
  if (!config?.whatsappNumero) { alert("No hay número de WhatsApp configurado."); return; }
  const confirmar = window.confirm("¿Estás seguro de que querés solicitar la cancelación del turno?");
  if (!confirmar) return;
  window.location.href = buildCancelacionWhatsAppUrl();
});

formReserva.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!seleccion) return;

  const formData = new FormData(formReserva);
  formData.set("serviceId", seleccion.serviceId);
  formData.set("fecha", seleccion.fecha);
  formData.set("horaInicio", seleccion.horaInicio);
  if (seleccion.professionalId) formData.set("professionalId", seleccion.professionalId);

  try {
    setMensaje("Guardando reserva...", false);
    const response = await fetch(`/api/${SLUG}/reservas`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar la reserva.");

    await refreshSlots().catch(() => {});
    showConfirmacion(data);
  } catch (error) { setMensaje(error.message || "Error al reservar."); }
});

function showConfirmacion(reserva) {
  const detalle = document.getElementById("confirmacionDetalle");
  const cancelToken = reserva.cancel_token || reserva.cancelToken || reserva.tokenCancelacion;
  if (detalle) {
    detalle.innerHTML = [
      `<p><strong>Nombre:</strong> ${escapeHtml(reserva.nombre)}</p>`,
      `<p><strong>Servicio:</strong> ${escapeHtml(seleccion?.serviceNombre || "")}</p>`,
      seleccion?.professionalNombre ? `<p><strong>Profesional:</strong> ${escapeHtml(seleccion.professionalNombre)}</p>` : "",
      `<p><strong>Fecha:</strong> ${escapeHtml(formatFecha(reserva.fecha || seleccion?.fecha))}</p>`,
      `<p><strong>Horario:</strong> ${escapeHtml(reserva.horaInicio || reserva.horario || seleccion?.horaInicio)}hs</p>`,
      cancelToken
        ? `<p class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"><strong>Código de cancelación:</strong> <code>${escapeHtml(cancelToken)}</code><br/><span class="text-xs">Guardalo por si necesitás cancelar el turno.</span></p>`
        : "",
    ].filter(Boolean).join("");
  }
  const btnWa = document.getElementById("btnWhatsAppConfirm");
  if (btnWa) btnWa.href = buildWhatsAppUrl(reserva);
  paso1.classList.add("hidden");
  paso2.classList.add("hidden");
  document.getElementById("paso3").classList.remove("hidden");
  setMensaje("");
}

document.getElementById("btnOtraReserva").addEventListener("click", closeModal);

/* ── Mis turnos ── */
const misTelefonoInput = document.getElementById("misTelefono");
const btnMisReservas = document.getElementById("btnMisReservas");
const misTurnosList = document.getElementById("misTurnosList");

misTelefonoInput.addEventListener("input", () => {
  misTelefonoInput.value = misTelefonoInput.value.replace(/\D/g, "");
});

misTelefonoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnMisReservas.click();
});

btnMisReservas.addEventListener("click", async () => {
  const tel = misTelefonoInput.value.trim();
  if (!/^\d{6,15}$/.test(tel)) {
    misTurnosList.innerHTML = `<p class="text-sm text-red-600">Ingresá un número de teléfono válido (solo números).</p>`;
    return;
  }
  misTurnosList.innerHTML = `<p class="text-sm text-slate-400">Buscando...</p>`;
  try {
    const response = await fetch(`/api/${SLUG}/mis-reservas?telefono=${encodeURIComponent(tel)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Error al consultar.");
    if (!data.length) {
      misTurnosList.innerHTML = `<p class="text-sm text-slate-500">No se encontraron turnos activos para ese número.</p>`;
      return;
    }
    misTurnosList.innerHTML = data.map((r) => {
      const serviceName = r.servicio || r.serviceNombre || r.serviceName ||
        (config?.services || []).find((s) => String(s.id) === String(r.serviceId))?.nombre ||
        "Servicio";
      const proName = r.profesional || r.professionalNombre || "";
      const hora = r.horaInicio || r.horario || "";
      const estadoColor = r.estado === "confirmada"
        ? "border-accent/30 bg-accent-light text-accent"
        : "border-amber-200 bg-amber-50 text-amber-700";
      const estadoLabel = r.estado === "confirmada" ? "Pagado" : "Sin pagar";
      return `<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <p class="font-semibold text-slate-800">${escapeHtml(serviceName)}${proName ? ` · ${escapeHtml(proName)}` : ""} · ${formatFecha(r.fecha)} · ${escapeHtml(hora)}hs</p>
        <span class="mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${estadoColor}">${estadoLabel}</span>
      </div>`;
    }).join("");
  } catch (e) {
    misTurnosList.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(e.message)}</p>`;
  }
});

/* ── Cancelar por token ── */
const cancelTokenInput = document.getElementById("cancelToken");
const btnCancelarToken = document.getElementById("btnCancelarToken");
const cancelTokenMsg = document.getElementById("cancelTokenMsg");

btnCancelarToken.addEventListener("click", async () => {
  const token = cancelTokenInput.value.trim();
  if (!token) {
    cancelTokenMsg.textContent = "Ingresá el código de cancelación.";
    cancelTokenMsg.style.color = "#c62020";
    return;
  }
  if (!window.confirm("¿Confirmás la cancelación de este turno?")) return;
  try {
    cancelTokenMsg.textContent = "Cancelando...";
    cancelTokenMsg.style.color = "var(--success)";
    let response = await fetch(`/api/${SLUG}/cancelar/${encodeURIComponent(token)}`, { method: "POST" });
    if (response.status === 405 || response.status === 404) {
      response = await fetch(`/api/${SLUG}/cancelar/${encodeURIComponent(token)}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo cancelar.");
    cancelTokenMsg.textContent = "Turno cancelado correctamente.";
    cancelTokenMsg.style.color = "var(--success)";
    cancelTokenInput.value = "";
  } catch (e) {
    cancelTokenMsg.textContent = e.message || "Error al cancelar.";
    cancelTokenMsg.style.color = "#c62020";
  }
});

async function init() {
  fechaInput.min = todayISO();
  fechaInput.value = todayISO();
  try {
    await loadConfig();
  } catch (error) {
    slotsHint.textContent = error.message || "Error inicializando la aplicación.";
  }
}

init();
