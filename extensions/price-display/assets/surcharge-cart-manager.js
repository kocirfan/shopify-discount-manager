/**
 * Surcharge Cart Manager
 * Sepet toplamının %7'si kadar surcharge ürününü sepete ekler/günceller/kaldırır.
 * Fiyat /cart/add.js'e "price" parametresiyle geçilir (Storefront API price override).
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

  // Shopify Storefront Cart API — price (cents) ile fiyat override
  async function addWithPrice(variantId, priceCents) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: Number(variantId), quantity: 1, price: priceCents }],
      }),
    });
    return res.json();
  }

  async function updateLine(lineKey, quantity) {
    const res = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity }),
    });
    return res.json();
  }

  let _busy = false;
  let _pending = false;

  async function sync() {
    if (_busy) { _pending = true; return; }

    const config = getConfig();
    if (!config || !config.enabled) return;

    _busy = true;
    try {
      const cart = await getCart();
      const lines = cart.items || [];
      const VARIANT_ID = String(config.variantId);

      const surcharge = lines.find((l) => String(l.variant_id) === VARIANT_ID);
      const realLines = lines.filter((l) => String(l.variant_id) !== VARIANT_ID);

      // Sepet toplamı (kuruş — Shopify tüm fiyatları kuruş olarak döner)
      const totalCents = realLines.reduce((sum, l) => sum + l.line_price, 0);

      console.log("[Surcharge] totalCents:", totalCents, "surchargeExists:", !!surcharge);

      if (totalCents <= 0) {
        if (surcharge) await updateLine(surcharge.key, 0);
        return;
      }

      // %7 → kuruş, en az 1 kuruş
      const surchargeCents = Math.max(1, Math.round(totalCents * (config.percentage / 100)));
      console.log("[Surcharge] surchargeCents:", surchargeCents);

      if (surcharge) {
        // Fiyat yanlışsa → kaldır ve yeniden ekle
        if (surcharge.price !== surchargeCents || surcharge.quantity !== 1) {
          await updateLine(surcharge.key, 0);
          await addWithPrice(VARIANT_ID, surchargeCents);
        }
      } else {
        await addWithPrice(VARIANT_ID, surchargeCents);
      }
    } catch (e) {
      console.error("[Surcharge] Hata:", e);
    } finally {
      _busy = false;
      if (_pending) {
        _pending = false;
        setTimeout(sync, 200);
      }
    }
  }

  // ─── Başlat ──────────────────────────────────────────────────────────────
  console.log("[Surcharge] Script yüklendi");
  sync();

  document.addEventListener("cart:updated", sync);
  document.addEventListener("cart:refresh", sync);

  // fetch patch — kendi isteklerimizi atla
  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _origFetch.apply(this, args);
    if (_busy) return result;
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) {
      setTimeout(sync, 300);
    }
    return result;
  };

  // XHR patch
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_m, url) {
    this._sUrl = url;
    return _origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (!_busy && this._sUrl &&
      (this._sUrl.includes("/cart/add") || this._sUrl.includes("/cart/change") || this._sUrl.includes("/cart/update"))) {
      this.addEventListener("load", () => setTimeout(sync, 300));
    }
    return _origSend.apply(this, arguments);
  };
})();
