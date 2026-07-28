const pricingSection = document.getElementById("pricingSection");
const pricingGrid = document.getElementById("pricingGrid");
const registroFlow = document.getElementById("registroFlow");
const planHidden = document.getElementById("planHidden");
const planSeleccionadoLabel = document.getElementById("planSeleccionadoLabel");
const btnCambiarPlan = document.getElementById("btnCambiarPlan");

const paso1 = document.getElementById("paso1");
const paso2 = document.getElementById("paso2");
const paso3 = document.getElementById("paso3");
const dot2 = document.getElementById("dot2");
const dot3 = document.getElementById("dot3");
const label2 = document.getElementById("label2");
const label3 = document.getElementById("label3");

const nombreInput = document.getElementById("nombre");
const categoriaInput = document.getElementById("categoria");
const ciudadInput = document.getElementById("ciudad");
const barrioInput = document.getElementById("barrio");
const whatsappInput = document.getElementById("whatsapp");
const emailInput = document.getElementById("email");
const slugPreview = document.getElementById("slugPreview");
const msg1 = document.getElementById("msg1");
const comprobanteInput = document.getElementById("comprobante");
const msg2 = document.getElementById("msg2");

let planesById = {};
let datosNegocio = {};

const CHECK_SVG = `<svg class="price-card__check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/></svg>`;

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("es-AR");
}

function limiteLabel(limite) {
  if (limite == null) return "Profesionales ilimitados";
  if (Number(limite) === 1) return "Hasta 1 profesional";
  return `Hasta ${limite} profesionales`;
}

function featuresForPlan(plan) {
  const base = [limiteLabel(plan.limiteProfesionales), "Turnos online", "Panel admin", "WhatsApp"];
  if (plan.id === "profesional" || plan.id === "max" || plan.limiteProfesionales == null || Number(plan.limiteProfesionales) > 1) {
    if (plan.id !== "inicial") base.push("Soporte prioritario");
  }
  return base;
}

function showMsg(el, text) {
  el.textContent = text;
  el.classList.remove("hidden");
}

function activateDot(dot, label) {
  dot.className = "w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center";
  label.className = "text-sm font-semibold text-accent";
}

function renderPricingCards(planes) {
  const order = ["inicial", "profesional", "max"];
  const sorted = [...planes].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.precio - b.precio;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  pricingGrid.innerHTML = sorted
    .map((plan) => {
      const featured = plan.id === "profesional" || plan.featured;
      const features = featuresForPlan(plan);
      return `
      <article class="price-card ${featured ? "price-card--featured" : ""}" data-plan-id="${plan.id}">
        ${featured ? `<span class="price-card__badge">Más popular</span>` : ""}
        <p class="price-card__tier">${escapeHtml(plan.nombre)}</p>
        <div>
          <span class="price-card__amount">$${formatMoney(plan.precio)}</span>
          <span class="price-card__period">/mes</span>
        </div>
        <div class="price-card__divider"></div>
        <ul class="price-card__features">
          ${features.map((f) => `<li>${CHECK_SVG}<span>${escapeHtml(f)}</span></li>`).join("")}
        </ul>
        <button type="button" class="price-card__cta" data-empezar="${plan.id}">Empezar</button>
      </article>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function goToForm(planId) {
  const plan = planesById[planId];
  if (!plan) return;
  planHidden.value = planId;
  planSeleccionadoLabel.textContent = `${plan.nombre} · $${formatMoney(plan.precio)}/mes`;
  pricingSection.classList.add("hidden");
  registroFlow.classList.remove("hidden");
  paso1.classList.remove("hidden");
  paso2.classList.add("hidden");
  paso3.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Actualizar URL sin recargar
  const url = new URL(window.location.href);
  url.searchParams.set("plan", planId);
  history.replaceState({}, "", url);
}

function goToPricing() {
  registroFlow.classList.add("hidden");
  pricingSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

pricingGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-empezar]");
  if (!btn) return;
  goToForm(btn.dataset.empezar);
});

btnCambiarPlan?.addEventListener("click", goToPricing);

nombreInput.addEventListener("input", () => {
  const slug = toSlug(nombreInput.value);
  slugPreview.textContent = slug ? `/${slug}` : "—";
});

document.getElementById("btnSiguiente").addEventListener("click", async () => {
  msg1.classList.add("hidden");

  const nombre = nombreInput.value.trim();
  const categoria = (categoriaInput?.value || "otro").trim();
  const whatsapp = whatsappInput.value.trim().replace(/\D/g, "");
  const email = emailInput.value.trim();
  const plan = planHidden.value || "inicial";
  const ciudad = ciudadInput?.value.trim() || "";
  const barrio = barrioInput?.value.trim() || "";

  if (!nombre) return showMsg(msg1, "El nombre del negocio es requerido.");
  if (!whatsapp || whatsapp.length < 8) return showMsg(msg1, "Ingresá un número de WhatsApp válido.");
  if (!email || !email.includes("@")) return showMsg(msg1, "Ingresá un email válido.");

  datosNegocio = { nombre, categoria, whatsapp: "549" + whatsapp, email, plan, ciudad, barrio };

  const planInfo = planesById[plan];
  document.getElementById("precioSub").textContent = formatMoney(planInfo?.precio || 0);

  try {
    const res = await fetch("/api/planes");
    const planes = await res.json();
    const p = planes.find((x) => x.id === plan);
    if (p) {
      document.getElementById("aliasSub").textContent = p.alias || "—";
      document.getElementById("cbuSub").textContent = p.cbu || "—";
      document.getElementById("titularSub").textContent = p.titular || "—";
      if (p.precio != null) document.getElementById("precioSub").textContent = formatMoney(p.precio);
    }
  } catch (_) {}

  paso1.classList.add("hidden");
  paso2.classList.remove("hidden");
  activateDot(dot2, label2);
});

document.getElementById("btnVolver").addEventListener("click", () => {
  paso2.classList.add("hidden");
  paso1.classList.remove("hidden");
  dot2.className = "w-8 h-8 rounded-full bg-slate-300 text-slate-500 text-sm font-bold flex items-center justify-center";
  label2.className = "text-sm font-semibold text-slate-400";
});

document.getElementById("btnEnviar").addEventListener("click", async () => {
  msg2.classList.add("hidden");
  const btn = document.getElementById("btnEnviar");

  if (!comprobanteInput.files?.length) return showMsg(msg2, "Adjuntá el comprobante de pago.");

  const formData = new FormData();
  formData.append("nombre", datosNegocio.nombre);
  formData.append("categoria", datosNegocio.categoria);
  formData.append("ciudad", datosNegocio.ciudad || "");
  formData.append("barrio", datosNegocio.barrio || "");
  formData.append("whatsapp", datosNegocio.whatsapp);
  formData.append("email", datosNegocio.email);
  formData.append("plan", datosNegocio.plan);
  formData.append("comprobante", comprobanteInput.files[0]);

  try {
    btn.disabled = true;
    btn.textContent = "Enviando...";

    const res = await fetch("/api/solicitudes", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error al enviar la solicitud.");

    paso2.classList.add("hidden");
    paso3.classList.remove("hidden");
    activateDot(dot3, label3);
  } catch (error) {
    showMsg(msg2, error.message);
    btn.disabled = false;
    btn.textContent = "Enviar solicitud";
  }
});

async function init() {
  try {
    const res = await fetch("/api/planes");
    const planes = await res.json();
    if (!Array.isArray(planes) || !planes.length) throw new Error("Sin planes");
    planesById = Object.fromEntries(planes.map((p) => [p.id, p]));
    renderPricingCards(planes);

    const urlPlan = new URLSearchParams(window.location.search).get("plan");
    if (urlPlan && planesById[urlPlan]) {
      goToForm(urlPlan);
    }
  } catch (_) {
    pricingGrid.innerHTML = `<p class="pricing-loading col-span-full">No se pudieron cargar los planes. Recargá la página.</p>`;
  }
}

init();
