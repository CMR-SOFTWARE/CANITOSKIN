const modalAprobar = document.getElementById("modalAprobar");
const modalSlug = document.getElementById("modalSlug");
const modalPassword = document.getElementById("modalPassword");
const modalMsg = document.getElementById("modalMsg");
const solicitudMsg = document.getElementById("solicitudMsg");
const solicitudesList = document.getElementById("solicitudesList");
const btnRefreshSolicitudes = document.getElementById("btnRefreshSolicitudes");

let pendingSolicitudId = null;

const loginCard = document.getElementById("loginCard");
const saPanel = document.getElementById("saPanel");
const saPassword = document.getElementById("saPassword");
const btnSaLogin = document.getElementById("btnSaLogin");
const loginMsg = document.getElementById("loginMsg");
const clubsList = document.getElementById("clubsList");
const btnRefreshClubs = document.getElementById("btnRefreshClubs");
const logoMsg = document.getElementById("logoMsg");
const cfgNombre = document.getElementById("cfgNombre");
const cfgSlug = document.getElementById("cfgSlug");
const cfgPassword = document.getElementById("cfgPassword");
const btnCrearClub = document.getElementById("btnCrearClub");
const createMsg = document.getElementById("createMsg");
const subAlias = document.getElementById("subAlias");
const subCbu = document.getElementById("subCbu");
const subTitular = document.getElementById("subTitular");
const btnGuardarSuscripcion = document.getElementById("btnGuardarSuscripcion");
const subMsg = document.getElementById("subMsg");

let saToken = sessionStorage.getItem("saToken") || "";
let platformPlans = [];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMsg(el, text, isError = true) {
  if (!el) return;
  el.textContent = text;
  el.className = `text-sm ${isError ? "text-red-600" : "text-emerald-700"}`;
  el.classList.remove("hidden");
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(saToken ? { Authorization: `Bearer ${saToken}` } : {}),
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de servidor.");
  return data;
}

cfgNombre.addEventListener("input", () => {
  cfgSlug.value = cfgNombre.value
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
});

function limiteLabel(limite) {
  if (limite == null) return "profesionales ilimitados";
  const n = Number(limite);
  if (!Number.isFinite(n)) return "profesionales ilimitados";
  return n === 1 ? "hasta 1 profesional" : `hasta ${n} profesionales`;
}

function planOptionLabel(plan) {
  const precio = Number(plan.precio);
  const precioTxt = Number.isFinite(precio) ? ` ($${precio.toLocaleString("es-AR")}/mes)` : "";
  return `${plan.nombre} — ${limiteLabel(plan.limiteProfesionales)}${precioTxt}`;
}

const PLAN_LABELS = { inicial: "Inicial", profesional: "Profesional", max: "Max", estandar: "Estándar" };
const PLAN_BADGE = {
  inicial: "bg-slate-100 text-slate-600",
  profesional: "bg-blue-100 text-blue-700",
  estandar: "bg-blue-100 text-blue-700",
  max: "bg-violet-100 text-violet-700",
};

function isNegocioActivo(c) {
  if (typeof c.activo === "boolean") return c.activo;
  return (c.estado || "activo") === "activo";
}

function logoPreview(club) {
  const logoUrl = club.logoUrl || club.logo_url;
  if (logoUrl) {
    const bust = logoUrl.includes("?") ? "&" : "?";
    return `<img src="${escapeHtml(logoUrl)}${bust}v=${Date.now()}" alt="${escapeHtml(club.nombre)}"
              class="w-12 h-12 rounded-lg object-contain bg-white border border-slate-200 flex-shrink-0 p-0.5" />`;
  }
  const colors = ["bg-blue-500","bg-emerald-500","bg-violet-500","bg-orange-500","bg-rose-500","bg-teal-500"];
  let n = 0;
  for (const ch of club.slug) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const color = colors[n % colors.length];
  const initials = escapeHtml(club.nombre.split(/\s+/).slice(0,2).map((w) => w[0]?.toUpperCase() || "").join(""));
  return `<div class="w-12 h-12 rounded-lg ${color} flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            ${initials}
          </div>`;
}

function planSelectHtml(currentPlan, clubId) {
  const plans = platformPlans.length
    ? platformPlans
    : [
        { id: "inicial", nombre: "Inicial", limiteProfesionales: 1, precio: 20000 },
        { id: "profesional", nombre: "Profesional", limiteProfesionales: 3, precio: 35000 },
        { id: "max", nombre: "Max", limiteProfesionales: null, precio: 60000 },
      ];
    const opts = plans
      .map((p) => {
      const selected = (currentPlan || "inicial") === p.id ? "selected" : "";
      return `<option value="${escapeHtml(p.id)}" ${selected}>${escapeHtml(planOptionLabel(p))}</option>`;
    })
    .join("");
  return `<select class="plan-select flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  data-club-id="${clubId}">${opts}</select>`;
}

async function loadPlatformPlans() {
  try {
    platformPlans = await api("/api/superadmin/platform-plans");
    if (!Array.isArray(platformPlans)) platformPlans = [];
    const modalPlan = document.getElementById("modalPlan");
    if (modalPlan && platformPlans.length) {
      const current = modalPlan.value;
      modalPlan.innerHTML = platformPlans
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(planOptionLabel(p))}</option>`)
        .join("");
      if ([...modalPlan.options].some((o) => o.value === current)) modalPlan.value = current;
    }
  } catch (_) {
    platformPlans = [];
  }
}

async function loadSuscripcion() {
  try {
    const data = await api("/api/superadmin/suscripcion");
    if (subAlias) subAlias.value = data.alias || "";
    if (subCbu) subCbu.value = data.cbu || "";
    if (subTitular) subTitular.value = data.titular || "";
  } catch (error) {
    setMsg(subMsg, error.message || "No se pudieron cargar los datos de transferencia.");
  }
}

btnGuardarSuscripcion?.addEventListener("click", async () => {
  try {
    btnGuardarSuscripcion.disabled = true;
    btnGuardarSuscripcion.textContent = "Guardando...";
    await api("/api/superadmin/suscripcion", {
      method: "PATCH",
      body: JSON.stringify({
        alias: subAlias?.value?.trim() || "",
        cbu: subCbu?.value?.trim() || "",
        titular: subTitular?.value?.trim() || "",
      }),
    });
    setMsg(subMsg, "Datos de transferencia guardados. Se muestran en el registro de nuevos negocios.", false);
  } catch (error) {
    setMsg(subMsg, error.message || "No se pudo guardar.");
  } finally {
    btnGuardarSuscripcion.disabled = false;
    btnGuardarSuscripcion.textContent = "Guardar datos de transferencia";
  }
});

async function loadClubs() {
  clubsList.textContent = "Cargando...";
  try {
    const clubs = await api("/api/superadmin/clubs");
    if (!clubs.length) {
      clubsList.innerHTML = "<p class='text-slate-400 text-sm'>No hay negocios registrados.</p>";
      return;
    }
    clubsList.innerHTML = clubs.map((c) => {
      const plan = c.plan || "inicial";
      const activo = isNegocioActivo(c);
      return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div class="flex items-center gap-3">
          ${logoPreview(c)}
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-800 truncate">${escapeHtml(c.nombre)}</div>
            <div class="text-xs text-slate-400 font-mono">/${escapeHtml(c.slug)}</div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[plan] || PLAN_BADGE.inicial}">
              ${PLAN_LABELS[plan] || plan}
            </span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}">
              ${activo ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="flex-1 min-w-0">
            <input type="file" accept="image/*"
                   class="logo-file-input block w-full text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-300 cursor-pointer"
                   data-club-id="${c.id}" />
          </label>
          <button class="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 flex-shrink-0"
                  data-action="subir-logo" data-club-id="${c.id}">
            Subir logo
          </button>
          <button class="rounded-lg px-3 py-1.5 text-xs font-semibold flex-shrink-0 ${activo ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}"
                  data-action="toggle-activo" data-club-id="${c.id}" data-activo="${activo ? '1' : '0'}">
            ${activo ? 'Desactivar' : 'Activar'}
          </button>
          <a href="/${escapeHtml(c.slug)}" target="_blank"
             class="text-xs text-blue-600 hover:underline flex-shrink-0">Ver</a>
          <a href="/${escapeHtml(c.slug)}/admin" target="_blank"
             class="text-xs text-blue-600 hover:underline flex-shrink-0">Admin</a>
        </div>
        <div class="flex items-center gap-2 pt-1 border-t border-slate-200">
          <span class="text-xs text-slate-500 shrink-0">Plan:</span>
          ${planSelectHtml(plan, c.id)}
          <button class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover shrink-0"
                  data-action="cambiar-plan" data-club-id="${c.id}">
            Guardar plan
          </button>
        </div>
        <div class="flex items-center gap-2 pt-1 border-t border-slate-200 flex-wrap">
          <span class="text-xs text-slate-500 shrink-0">Clave admin:</span>
          <input type="text" value="${escapeHtml(c.adminPassword || "")}"
                 placeholder="${c.adminPassword ? "" : "Sin clave guardada — definí una"}"
                 class="pwd-input flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-800"
                 data-club-id="${c.id}" autocomplete="off" />
          <button type="button"
                  class="rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 shrink-0"
                  data-action="guardar-password" data-club-id="${c.id}">
            Guardar clave
          </button>
          <button type="button"
                  class="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 shrink-0"
                  data-action="eliminar-local" data-club-id="${c.id}" data-club-nombre="${escapeHtml(c.nombre)}" data-club-slug="${escapeHtml(c.slug)}">
            Eliminar local
          </button>
        </div>
        <p class="text-[11px] text-slate-400">${
          c.adminPassword
            ? "Clave actual visible solo para superadmin. Podés editarla y guardar."
            : "Esta clave se creó antes de poder mostrarla. Guardá una nueva para verla después."
        }</p>
      </div>
    `}).join("");

    clubsList.addEventListener("click", handleClubListClick, { once: true });
  } catch (error) {
    clubsList.textContent = error.message;
  }
}

async function handleClubListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) { clubsList.addEventListener("click", handleClubListClick, { once: true }); return; }

  const action = target.dataset.action;
  const clubId = target.dataset.clubId;

  if (action === "subir-logo") {
    const input = clubsList.querySelector(`.logo-file-input[data-club-id="${clubId}"]`);
    if (!input?.files?.length) {
      setMsg(logoMsg, "Seleccioná una imagen primero.");
      clubsList.addEventListener("click", handleClubListClick, { once: true });
      return;
    }
    const formData = new FormData();
    formData.append("logo", input.files[0]);
    try {
      target.disabled = true;
      target.textContent = "Subiendo...";
      await api(`/api/superadmin/negocios/${clubId}/logo`, { method: "PATCH", body: formData });
      setMsg(logoMsg, "Logo actualizado correctamente.", false);
      await loadClubs();
    } catch (error) {
      setMsg(logoMsg, error.message || "No se pudo subir el logo.");
      target.disabled = false;
      target.textContent = "Subir logo";
      clubsList.addEventListener("click", handleClubListClick, { once: true });
    }
    return;
  }

  if (action === "toggle-activo") {
    const nuevoEstado = target.dataset.activo !== "1";
    try {
      target.disabled = true;
      await api(`/api/superadmin/clubs/${clubId}/activo`, {
        method: "PATCH",
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      await loadClubs();
    } catch (error) {
      setMsg(logoMsg, error.message || "No se pudo cambiar el estado.");
      target.disabled = false;
      clubsList.addEventListener("click", handleClubListClick, { once: true });
    }
    return;
  }

  if (action === "cambiar-plan") {
    const select = clubsList.querySelector(`.plan-select[data-club-id="${clubId}"]`);
    const plan = select?.value;
    if (!plan) { clubsList.addEventListener("click", handleClubListClick, { once: true }); return; }
    try {
      target.disabled = true;
      target.textContent = "Guardando...";
      await api(`/api/superadmin/clubs/${clubId}/plan`, {
        method: "PATCH",
        body: JSON.stringify({ plan }),
      });
      setMsg(logoMsg, "Plan actualizado correctamente.", false);
      await loadClubs();
    } catch (error) {
      setMsg(logoMsg, error.message || "No se pudo cambiar el plan.");
      target.disabled = false;
      target.textContent = "Guardar plan";
      clubsList.addEventListener("click", handleClubListClick, { once: true });
    }
    return;
  }

  if (action === "guardar-password") {
    const input = clubsList.querySelector(`.pwd-input[data-club-id="${clubId}"]`);
    const password = (input?.value || "").trim();
    if (!password) {
      setMsg(logoMsg, "Ingresá la nueva contraseña del admin.");
      clubsList.addEventListener("click", handleClubListClick, { once: true });
      return;
    }
    if (password.length < 6) {
      setMsg(logoMsg, "La contraseña debe tener al menos 6 caracteres.");
      clubsList.addEventListener("click", handleClubListClick, { once: true });
      return;
    }
    try {
      target.disabled = true;
      target.textContent = "Guardando...";
      await api(`/api/superadmin/negocios/${clubId}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      setMsg(logoMsg, `Clave admin actualizada: ${password}`, false);
      await loadClubs();
    } catch (error) {
      setMsg(logoMsg, error.message || "No se pudo actualizar la clave.");
      target.disabled = false;
      target.textContent = "Guardar clave";
      clubsList.addEventListener("click", handleClubListClick, { once: true });
    }
    return;
  }

  if (action === "eliminar-local") {
    const nombre = target.dataset.clubNombre || "este local";
    const slug = target.dataset.clubSlug || "";
    const ok = confirm(
      `¿Eliminar permanentemente "${nombre}" (${slug ? "/" + slug : ""})?\n\n` +
      "Se borran turnos, servicios, profesionales, caja y todo lo asociado. No se puede deshacer."
    );
    if (!ok) {
      clubsList.addEventListener("click", handleClubListClick, { once: true });
      return;
    }
    const confirmName = prompt(`Para confirmar, escribí el slug del local: ${slug}`);
    if ((confirmName || "").trim() !== slug) {
      setMsg(logoMsg, "Eliminación cancelada: el slug no coincide.");
      clubsList.addEventListener("click", handleClubListClick, { once: true });
      return;
    }
    try {
      target.disabled = true;
      target.textContent = "Eliminando...";
      await api(`/api/superadmin/negocios/${clubId}`, { method: "DELETE" });
      setMsg(logoMsg, `Local "${nombre}" eliminado.`, false);
      await loadClubs();
    } catch (error) {
      setMsg(logoMsg, error.message || "No se pudo eliminar el local.");
      target.disabled = false;
      target.textContent = "Eliminar local";
      clubsList.addEventListener("click", handleClubListClick, { once: true });
    }
    return;
  }

  clubsList.addEventListener("click", handleClubListClick, { once: true });
}

async function enterPanel() {
  loginCard.classList.add("hidden");
  saPanel.classList.remove("hidden");
  await loadPlatformPlans();
  await Promise.all([loadClubs(), loadSolicitudes(), loadSuscripcion(), loadLocalidades()]);
  startSaLivePolling();
}

let saPollTimer = null;
let saPollInFlight = false;
let lastSaSolSig = "";
let lastSaClubsSig = "";
const SA_LIVE_POLL_MS = 4000;

function solicitudesSignature(list) {
  return (list || [])
    .map((s) => `${s.id}:${s.estado}:${s.nombre}:${s.ciudad || ""}`)
    .sort()
    .join("|");
}

function clubsSignature(list) {
  return (list || [])
    .map((c) => `${c.id}:${c.estado || c.activo}:${c.plan}:${c.nombre}`)
    .sort()
    .join("|");
}

async function pollSaLive() {
  if (!saToken || saPollInFlight || document.hidden) return;
  saPollInFlight = true;
  try {
    const [sols, clubs] = await Promise.all([
      api("/api/superadmin/solicitudes"),
      api("/api/superadmin/negocios"),
    ]);
    const sSig = solicitudesSignature(sols);
    const cSig = clubsSignature(clubs);
    if (sSig !== lastSaSolSig) {
      lastSaSolSig = sSig;
      await loadSolicitudes();
    }
    if (cSig !== lastSaClubsSig) {
      lastSaClubsSig = cSig;
      await loadClubs();
    }
  } catch (_) {
    /* silencioso */
  } finally {
    saPollInFlight = false;
  }
}

function startSaLivePolling() {
  stopSaLivePolling();
  saPollTimer = setInterval(pollSaLive, SA_LIVE_POLL_MS);
  pollSaLive();
}

function stopSaLivePolling() {
  if (saPollTimer) {
    clearInterval(saPollTimer);
    saPollTimer = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && saToken) pollSaLive();
});


btnSaLogin.addEventListener("click", async () => {
  const password = saPassword.value.trim();
  if (!password) { setMsg(loginMsg, "Ingresá la clave maestra."); return; }
  try {
    const data = await api("/api/superadmin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    saToken = data.token;
    sessionStorage.setItem("saToken", saToken);
    await enterPanel();
  } catch (error) { setMsg(loginMsg, error.message || "No se pudo iniciar sesión."); }
});

btnRefreshClubs.addEventListener("click", loadClubs);

const localidadesList = document.getElementById("localidadesList");
const locNombre = document.getElementById("locNombre");
const btnCrearLocalidad = document.getElementById("btnCrearLocalidad");
const btnRefreshLocalidades = document.getElementById("btnRefreshLocalidades");
const localidadMsg = document.getElementById("localidadMsg");

async function loadLocalidades() {
  if (!localidadesList) return;
  localidadesList.textContent = "Cargando...";
  try {
    const lista = await api("/api/superadmin/localidades");
    if (!lista.length) {
      localidadesList.innerHTML = "<p class='text-slate-400 text-sm'>Todavía no hay localidades. Agregá la primera.</p>";
      return;
    }
    localidadesList.innerHTML = lista.map((l) => `
      <div class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <span class="font-semibold text-slate-800">${escapeHtml(l.nombre)}</span>
          <span class="ml-2 text-xs ${l.activo ? "text-emerald-600" : "text-slate-400"}">${l.activo ? "Activa" : "Inactiva"}</span>
        </div>
        <button type="button"
                class="text-xs font-semibold ${l.activo ? "text-amber-700 hover:underline" : "text-accent hover:underline"}"
                data-loc-toggle="${l.id}" data-loc-activo="${l.activo ? "1" : "0"}">
          ${l.activo ? "Desactivar" : "Activar"}
        </button>
      </div>
    `).join("");
  } catch (error) {
    localidadesList.textContent = error.message;
  }
}

localidadesList?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-loc-toggle]");
  if (!btn) return;
  const id = btn.dataset.locToggle;
  const activo = btn.dataset.locActivo !== "1";
  try {
    btn.disabled = true;
    await api(`/api/superadmin/localidades/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ activo }),
    });
    setMsg(localidadMsg, activo ? "Localidad activada." : "Localidad desactivada.", false);
    await loadLocalidades();
  } catch (error) {
    setMsg(localidadMsg, error.message);
    btn.disabled = false;
  }
});

btnCrearLocalidad?.addEventListener("click", async () => {
  const nombre = locNombre?.value.trim() || "";
  if (!nombre) {
    setMsg(localidadMsg, "Escribí el nombre de la localidad.");
    return;
  }
  try {
    btnCrearLocalidad.disabled = true;
    await api("/api/superadmin/localidades", {
      method: "POST",
      body: JSON.stringify({ nombre }),
    });
    locNombre.value = "";
    setMsg(localidadMsg, `Localidad "${nombre}" creada.`, false);
    await loadLocalidades();
  } catch (error) {
    setMsg(localidadMsg, error.message);
  } finally {
    btnCrearLocalidad.disabled = false;
  }
});

btnRefreshLocalidades?.addEventListener("click", loadLocalidades);

const ESTADO_BADGE = {
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-red-100 text-red-600",
};

async function loadSolicitudes() {
  solicitudesList.textContent = "Cargando...";
  try {
    const lista = await api("/api/superadmin/solicitudes");
    if (!lista.length) {
      solicitudesList.innerHTML = "<p class='text-slate-400 text-sm'>No hay solicitudes pendientes.</p>";
      return;
    }
    solicitudesList.innerHTML = lista.map((s) => `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-slate-800">${escapeHtml(s.nombre)}</div>
            <div class="text-xs text-slate-400">${escapeHtml(s.email)} · WA: ${escapeHtml(s.whatsapp)} · <span class="capitalize">${escapeHtml(s.categoria || s.deporte || "")}</span></div>
            <div class="text-xs text-slate-400">${[s.ciudad, s.direccion || s.barrio].filter(Boolean).map(escapeHtml).join(" · ") || "Sin ubicación"}</div>
            <div class="text-xs text-slate-400 font-mono">slug sugerido: /${escapeHtml(s.slug)} · Plan: <strong>${escapeHtml(PLAN_LABELS[s.plan] || s.plan || "Inicial")}</strong></div>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ESTADO_BADGE[s.estado] || ''}">
            ${escapeHtml((s.estado || "").charAt(0).toUpperCase() + (s.estado || "").slice(1))}
          </span>
        </div>
        ${s.comprobante_url ? `<a href="${escapeHtml(s.comprobante_url)}" target="_blank" class="text-xs text-blue-600 hover:underline">Ver comprobante</a>` : ""}
        ${s.estado === "pendiente" ? `
        <div class="flex gap-2 pt-1">
          <button class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                  data-sol-action="aprobar" data-sol-id="${s.id}" data-sol-slug="${s.slug}" data-sol-plan="${s.plan || 'inicial'}">
            Aprobar
          </button>
          <button class="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200"
                  data-sol-action="rechazar" data-sol-id="${s.id}">
            Rechazar
          </button>
        </div>` : ""}
      </div>
    `).join("");

    solicitudesList.addEventListener("click", handleSolicitudClick, { once: true });
  } catch (error) {
    solicitudesList.textContent = error.message;
  }
}

async function handleSolicitudClick(event) {
  const btn = event.target.closest("[data-sol-action]");
  if (!btn) { solicitudesList.addEventListener("click", handleSolicitudClick, { once: true }); return; }

  const action = btn.dataset.solAction;
  const id = btn.dataset.solId;

  if (action === "aprobar") {
    pendingSolicitudId = id;
    modalSlug.value = btn.dataset.solSlug || "";
    modalPassword.value = "";
    modalMsg.classList.add("hidden");
    const modalPlan = document.getElementById("modalPlan");
    if (modalPlan) {
      const wanted = btn.dataset.solPlan || "inicial";
      modalPlan.value = [...modalPlan.options].some((o) => o.value === wanted) ? wanted : (modalPlan.options[0]?.value || "inicial");
    }
    modalAprobar.classList.remove("hidden");
    return;
  }

  if (action === "rechazar") {
    if (!confirm("¿Rechazar esta solicitud?")) { solicitudesList.addEventListener("click", handleSolicitudClick, { once: true }); return; }
    try {
      btn.disabled = true;
      await api(`/api/superadmin/solicitudes/${id}/rechazar`, { method: "PATCH" });
      setMsg(solicitudMsg, "Solicitud rechazada.", false);
      await loadSolicitudes();
    } catch (error) {
      setMsg(solicitudMsg, error.message);
      btn.disabled = false;
      solicitudesList.addEventListener("click", handleSolicitudClick, { once: true });
    }
  }
}

document.getElementById("btnCancelarModal").addEventListener("click", () => {
  modalAprobar.classList.add("hidden");
  pendingSolicitudId = null;
  solicitudesList.addEventListener("click", handleSolicitudClick, { once: true });
});

document.getElementById("btnConfirmarAprobar").addEventListener("click", async () => {
  const slug = modalSlug.value.trim();
  const password = modalPassword.value.trim();
  modalMsg.classList.add("hidden");

  if (!slug) { modalMsg.textContent = "El slug es requerido."; modalMsg.classList.remove("hidden"); return; }
  if (!password) { modalMsg.textContent = "La clave admin es requerida."; modalMsg.classList.remove("hidden"); return; }

  const plan = document.getElementById("modalPlan")?.value || "inicial";
  const btn = document.getElementById("btnConfirmarAprobar");
  try {
    btn.disabled = true;
    btn.textContent = "Procesando...";
    const data = await api(`/api/superadmin/solicitudes/${pendingSolicitudId}/aprobar`, {
      method: "PATCH",
      body: JSON.stringify({ slug, password, plan }),
    });
    modalAprobar.classList.add("hidden");
    setMsg(solicitudMsg, `Negocio "${data.nombre}" dado de alta en /${data.slug}.`, false);
    pendingSolicitudId = null;
    await loadSolicitudes();
    await loadClubs();
  } catch (error) {
    modalMsg.textContent = error.message;
    modalMsg.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar alta";
  }
});

btnRefreshSolicitudes.addEventListener("click", loadSolicitudes);

btnCrearClub.addEventListener("click", async () => {
  const nombre = cfgNombre.value.trim();
  const slug = cfgSlug.value.trim();
  const password = cfgPassword.value.trim();
  if (!nombre || !slug || !password) {
    setMsg(createMsg, "Completá todos los campos.");
    return;
  }
  try {
    const data = await api("/api/superadmin/clubs", {
      method: "POST",
      body: JSON.stringify({ nombre, slug, password }),
    });
    setMsg(createMsg, `Negocio "${data.nombre}" creado. URL: /${data.slug}`, false);
    cfgNombre.value = "";
    cfgSlug.value = "";
    cfgPassword.value = "";
    await loadClubs();
  } catch (error) { setMsg(createMsg, error.message || "No se pudo crear el negocio."); }
});

if (saToken) {
  enterPanel().catch(() => {
    saToken = "";
    sessionStorage.removeItem("saToken");
    loginCard.classList.remove("hidden");
    saPanel.classList.add("hidden");
  });
}
