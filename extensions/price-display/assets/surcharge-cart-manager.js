/**
 * Surcharge Cart Manager
 * Sepet toplamının %7'si → App Proxy'ye gönderir → backend variant fiyatını günceller
 * → surcharge ürününü güncel fiyatla sepete ekler.
 */
(function () {
  "use strict";

  function getConfig() {
    const el = document.getElementById("surcharge-config");
    if (!el) return null;
    const variantId = el.getAttribute("data-variant-id");
    if (!variantId) return null;
    return {
      variantId: variantId,
      enabled: el.getAttribute("data-enabled") !== "false",
      percentage: parseFloat(el.getAttribute("data-percentage") || "7") || 7,
    };
  }

  async function getCart() {
    const res = await fetch("/cart.js");
    return res.json();
  }

  async function addItem(variantId) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
    });
    return res.json();
  }

  async function removeLine(lineKey) {
    const res = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: 0 }),
    });
    return res.json();
  }

  // App Proxy üzerinden backend'e sepet toplamını gönder, variant fiyatını güncellettir
  async function updateSurchargePrice(cartTotalEur) {
    const shop = window.Shopify && window.Shopify.shop;
    const res = await fetch(
      `/apps/discount-manager/api/surcharge-price?shop=${encodeURIComponent(shop || "")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartTotal: cartTotalEur }),
      }
    );
    return res.json();
  }

  let _busy = false;
  let _pending = false;

  async function sync() {
    if (_busy) { _pending = true; return; }

    const config = getConfig();
    if (!config || !config.enabled) return;

    _busy = true;
    console.log("[Surcharge] sync başladı");

    try {
      const cart = await getCart();
      const lines = cart.items || [];
      const VARIANT_ID = String(config.variantId);

      const surchargeLine = lines.find((l) => String(l.variant_id) === VARIANT_ID);
      const realLines = lines.filter((l) => String(l.variant_id) !== VARIANT_ID);

      // Sepet toplamı EUR (Shopify cents → EUR)
      const totalCents = realLines.reduce((sum, l) => sum + l.line_price, 0);
      const totalEur = totalCents / 100;

      console.log("[Surcharge] totalEur:", totalEur);

      if (totalEur <= 0) {
        if (surchargeLine) await removeLine(surchargeLine.key);
        return;
      }

      // Backend'e gönder — variant fiyatını güncellettir
      const result = await updateSurchargePrice(totalEur);
      console.log("[Surcharge] backend sonucu:", result);

      if (result.error || !result.price) {
        console.error("[Surcharge] fiyat alınamadı:", result.error);
        return;
      }

      const expectedPriceCents = Math.round(result.price * 100);

      if (surchargeLine) {
        // Fiyat değiştiyse → kaldır ve tekrar ekle (variant fiyatı güncellendi)
        if (surchargeLine.price !== expectedPriceCents || surchargeLine.quantity !== 1) {
          await removeLine(surchargeLine.key);
          // Kısa bekleme — Shopify variant fiyat güncellemesinin yayılması için
          await new Promise((r) => setTimeout(r, 800));
          await addItem(VARIANT_ID);
        }
      } else {
        await new Promise((r) => setTimeout(r, 800));
        await addItem(VARIANT_ID);
      }

      console.log("[Surcharge] tamamlandı, fiyat:", result.price);
    } catch (e) {
      console.error("[Surcharge] hata:", e);
    } finally {
      _busy = false;
      if (_pending) {
        _pending = false;
        setTimeout(sync, 300);
      }
    }
  }

  console.log("[Surcharge] script yüklendi");
  sync();

  document.addEventListener("cart:updated", sync);
  document.addEventListener("cart:refresh", sync);

  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _origFetch.apply(this, args);
    if (_busy) return result;
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("/apps/")
    ) {
      setTimeout(sync, 400);
    }
    return result;
  };

  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_m, url) {
    this._sUrl = url;
    return _origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (!_busy && this._sUrl &&
      (this._sUrl.includes("/cart/add") || this._sUrl.includes("/cart/change") || this._sUrl.includes("/cart/update")) &&
      !this._sUrl.includes("/apps/")) {
      this.addEventListener("load", () => setTimeout(sync, 400));
    }
    return _origSend.apply(this, arguments);
  };
})();
