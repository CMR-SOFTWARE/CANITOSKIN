/* Canito Skin — carrito de compra (localStorage), compartido entre index.html y cart.html */
(function () {
  function getSlug() {
    const reserved = new Set(["admin", "cart", "market", "privacidad", "terminos"]);
    const parts = window.location.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    if (!first || reserved.has(first)) return "canito";
    return first;
  }

  const SLUG = getSlug();
  const CART_KEY = `canito_cart_${SLUG}`;

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderBadge();
    window.dispatchEvent(new CustomEvent("canito-cart-change", { detail: { cart } }));
  }

  function addItem(producto, cantidad = 1) {
    const cart = getCart();
    const id = String(producto.id);
    const existing = cart.find((it) => String(it.productoId) === id);
    if (existing) {
      existing.cantidad = Math.min(50, existing.cantidad + cantidad);
    } else {
      cart.push({
        productoId: id,
        nombre: producto.nombre,
        precio: Number(producto.precio) || 0,
        imagenUrl: producto.imagenUrl || null,
        cantidad: Math.max(1, Math.min(50, cantidad)),
      });
    }
    saveCart(cart);
  }

  function removeItem(productoId) {
    saveCart(getCart().filter((it) => String(it.productoId) !== String(productoId)));
  }

  function setQty(productoId, cantidad) {
    const qty = Math.max(1, Math.min(50, Math.trunc(Number(cantidad) || 1)));
    const cart = getCart().map((it) =>
      String(it.productoId) === String(productoId) ? { ...it, cantidad: qty } : it
    );
    saveCart(cart);
  }

  function clear() {
    saveCart([]);
  }

  function count() {
    return getCart().reduce((sum, it) => sum + it.cantidad, 0);
  }

  function total() {
    return getCart().reduce((sum, it) => sum + it.precio * it.cantidad, 0);
  }

  function renderBadge() {
    const n = count();
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      el.classList.toggle("hidden", n === 0);
    });
  }

  window.CanitoCart = { SLUG, getCart, addItem, removeItem, setQty, clear, count, total, renderBadge };

  document.addEventListener("DOMContentLoaded", renderBadge);
})();
