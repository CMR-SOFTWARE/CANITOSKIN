/* Canito Skin — página /cart (revisión de carrito + checkout) */
(function () {
  const SLUG = window.CanitoCart.SLUG;

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

  let config = null;

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
          navLogo.outerHTML = `<img id="navLogo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.nombre)}" class="h-10 w-10 shrink-0 rounded-full object-contain bg-white p-0.5 ring-1 ring-border" crossorigin="anonymous" />`;
        } else {
          navLogo.outerHTML = `<img id="navLogo" src="/images/logo-canito-nav.png" alt="${escapeHtml(config.nombre || "Canito Skin")}" class="h-10 w-auto max-w-[7rem] shrink-0 object-contain" />`;
        }
      }
    } catch (_) {
      /* la página funciona igual sin config (branding por defecto) */
    }
  }

  function renderCart() {
    const cart = window.CanitoCart.getCart();
    const empty = document.getElementById("cartEmpty");
    const content = document.getElementById("cartContent");
    const confirmacion = document.getElementById("cartConfirmacion");
    if (!confirmacion.classList.contains("hidden")) return;

    if (!cart.length) {
      empty.classList.remove("hidden");
      empty.classList.add("flex");
      content.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    empty.classList.remove("flex");
    content.classList.remove("hidden");

    const list = document.getElementById("cartItems");
    list.innerHTML = cart.map((it) => `
      <li class="flex items-center gap-4 rounded-xl border border-border p-3">
        <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canito-taupe/30">
          ${it.imagenUrl
            ? `<img src="${escapeHtml(it.imagenUrl)}" alt="${escapeHtml(it.nombre)}" class="h-full w-full object-cover" />`
            : `<svg viewBox="0 0 24 24" class="h-6 w-6 text-canito-oliva" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></svg>`}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-primary">${escapeHtml(it.nombre)}</p>
          <p class="text-meta-sm text-secondary">${escapeHtml(formatPrice(it.precio))} c/u</p>
          <div class="mt-2 flex items-center gap-2">
            <button type="button" data-qty-down="${escapeHtml(it.productoId)}" class="flex h-7 w-7 items-center justify-center rounded-full border border-border text-sm" aria-label="Restar">−</button>
            <span class="w-6 text-center text-sm font-medium">${it.cantidad}</span>
            <button type="button" data-qty-up="${escapeHtml(it.productoId)}" class="flex h-7 w-7 items-center justify-center rounded-full border border-border text-sm" aria-label="Sumar">+</button>
          </div>
        </div>
        <div class="flex flex-col items-end gap-2">
          <p class="font-semibold text-primary">${escapeHtml(formatPrice(it.precio * it.cantidad))}</p>
          <button type="button" data-remove="${escapeHtml(it.productoId)}" class="text-meta-sm text-secondary hover:text-red-600">Quitar</button>
        </div>
      </li>
    `).join("");

    document.getElementById("cartTotal").textContent = formatPrice(window.CanitoCart.total());

    list.querySelectorAll("[data-qty-up]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-qty-up");
        const item = window.CanitoCart.getCart().find((it) => String(it.productoId) === id);
        if (item) window.CanitoCart.setQty(id, item.cantidad + 1);
      });
    });
    list.querySelectorAll("[data-qty-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-qty-down");
        const item = window.CanitoCart.getCart().find((it) => String(it.productoId) === id);
        if (!item) return;
        if (item.cantidad <= 1) window.CanitoCart.removeItem(id);
        else window.CanitoCart.setQty(id, item.cantidad - 1);
      });
    });
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => window.CanitoCart.removeItem(btn.getAttribute("data-remove")));
    });
  }

  function buildPedidoWhatsAppUrl(pedido, nombre, telefono) {
    const wa = String(config?.whatsappNumero || "").replace(/\D/g, "");
    if (!wa) return "#";
    const lineas = pedido.items.map((it) => `- ${it.cantidad}x ${it.nombre}`).join("\n");
    const pagoTexto = pedido.pagoMetodo === "efectivo"
      ? "Pago: efectivo al retirar"
      : `Comprobante: ${pedido.comprobanteUrl || "ya lo subí en la web"}`;
    const text = [
      "Hola, quiero coordinar mi pedido:",
      `Nombre: ${nombre}`,
      `Teléfono: ${telefono}`,
      "",
      lineas,
      "",
      `Total: ${formatPrice(pedido.total)}`,
      pagoTexto,
      `N° de pedido: ${pedido.id}`,
    ].join("\n");
    return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  }

  function initEntregaToggle() {
    const radios = document.querySelectorAll('input[name="entregaTipo"]');
    const direccionField = document.getElementById("direccionField");
    radios.forEach((r) => {
      r.addEventListener("change", () => {
        direccionField.classList.toggle("hidden", r.value !== "envio" || !r.checked);
      });
    });
  }

  function initPagoToggle() {
    const radios = document.querySelectorAll('input[name="pagoMetodo"]');
    const comprobanteField = document.getElementById("comprobanteField");
    const comprobanteInput = document.getElementById("comprobante");
    radios.forEach((r) => {
      r.addEventListener("change", () => {
        const esTransferencia = form_currentPago() === "transferencia";
        comprobanteField.classList.toggle("hidden", !esTransferencia);
        if (comprobanteInput) comprobanteInput.required = esTransferencia;
      });
    });
    function form_currentPago() {
      return document.querySelector('input[name="pagoMetodo"]:checked')?.value || "transferencia";
    }
    if (comprobanteInput) comprobanteInput.required = true;
  }

  function initCheckoutForm() {
    const form = document.getElementById("checkoutForm");
    const errorEl = document.getElementById("checkoutError");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.classList.add("hidden");
      const btn = document.getElementById("btnSubmitPedido");
      const entregaTipo = form.querySelector('input[name="entregaTipo"]:checked')?.value || "retiro";
      const pagoMetodo = form.querySelector('input[name="pagoMetodo"]:checked')?.value || "transferencia";
      const nombre = form.nombre.value.trim();
      const telefono = form.telefono.value.trim();
      const comprobanteFile = form.comprobante?.files?.[0] || null;
      const cart = window.CanitoCart.getCart();

      if (!cart.length) return;
      if (pagoMetodo === "transferencia" && !comprobanteFile) {
        errorEl.textContent = "Subí el comprobante o elegí pagar en efectivo.";
        errorEl.classList.remove("hidden");
        return;
      }

      const formData = new FormData();
      formData.append("nombre", nombre);
      formData.append("telefono", telefono);
      formData.append("email", form.email.value.trim());
      formData.append("entregaTipo", entregaTipo);
      formData.append("entregaDireccion", form.entregaDireccion.value.trim());
      formData.append("notas", form.notas.value.trim());
      formData.append("pagoMetodo", pagoMetodo);
      formData.append("items", JSON.stringify(cart.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad, nombre: it.nombre }))));
      if (comprobanteFile) formData.append("comprobante", comprobanteFile);

      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        const res = await fetch(`/api/${SLUG}/pedidos`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No pudimos enviar tu pedido.");

        document.getElementById("cartContent").classList.add("hidden");
        const confirmacion = document.getElementById("cartConfirmacion");
        confirmacion.classList.remove("hidden");
        confirmacion.classList.add("flex");
        const btnWa = document.getElementById("btnWhatsAppPedido");
        const waUrl = buildPedidoWhatsAppUrl(data, nombre, telefono);
        if (waUrl === "#") btnWa.classList.add("hidden");
        else btnWa.href = waUrl;
        window.CanitoCart.clear();
      } catch (err) {
        errorEl.textContent = err.message || "No pudimos enviar tu pedido. Probá de nuevo.";
        errorEl.classList.remove("hidden");
      } finally {
        btn.disabled = false;
        btn.textContent = "Enviar pedido";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    renderCart();
    initEntregaToggle();
    initPagoToggle();
    initCheckoutForm();
  });
  window.addEventListener("canito-cart-change", renderCart);
})();
