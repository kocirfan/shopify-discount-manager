/**
 * Surcharge Cart Manager
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
    };
  }

  async function fetchCart() {
    const res = await fetch("/cart.js");
    return res.json();
  }

  async function addItem(variantId) {
    console.log("[Surcharge] Ekleniyor:", variantId);
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(variantId), quantity: 1 }),
    });
    const data = await res.json();
    console.log("[Surcharge] Ekleme sonucu:", data);
    return data;
  }

  async function removeItem(lineKey) {
    console.log("[Surcharge] Kaldırılıyor:", lineKey);
    const res = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: 0 }),
    });
    return res.json();
  }

  // Surcharge kendi fetch'lerini tetiklememeye yarar
  let _surchargeActive = false;
  let _syncQueued = false;

  async function syncSurcharge() {
    if (_surchargeActive) {
      _syncQueued = true;
      return;
    }

    const config = getConfig();
    if (!config) {
      console.warn("[Surcharge] config bulunamadı");
      return;
    }
    if (!config.enabled) return;

    _surchargeActive = true;
    console.log("[Surcharge] Senkronize ediliyor...");

    try {
      const cart = await fetchCart();
      const lines = cart.items || [];
      const VARIANT_ID = String(config.variantId);

      const surchargeLine = lines.find((item) => String(item.variant_id) === VARIANT_ID);
      const realLines = lines.filter((item) => String(item.variant_id) !== VARIANT_ID);
      const hasRealItems = realLines.some((item) => item.quantity > 0);

      console.log("[Surcharge] hasRealItems:", hasRealItems, "surchargeVar mevcut:", !!surchargeLine);

      if (!hasRealItems) {
        if (surchargeLine) await removeItem(surchargeLine.key);
      } else if (!surchargeLine) {
        await addItem(VARIANT_ID);
      } else if (surchargeLine.quantity !== 1) {
        await removeItem(surchargeLine.key);
        await addItem(VARIANT_ID);
      }
    } catch (err) {
      console.error("[Surcharge] Hata:", err);
    } finally {
      _surchargeActive = false;
      if (_syncQueued) {
        _syncQueued = false;
        setTimeout(syncSurcharge, 300);
      }
    }
  }

  // ─── İlk çalıştırma ───────────────────────────────────────────────────────
  console.log("[Surcharge] Script yüklendi");
  syncSurcharge();

  // ─── Event dinleyicileri ──────────────────────────────────────────────────
  document.addEventListener("cart:updated", syncSurcharge);
  document.addEventListener("cart:refresh", syncSurcharge);

  // fetch monkey-patch — kendi fetch'lerimizi atla
  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _origFetch.apply(this, args);
    if (_surchargeActive) return result;

    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) {
      setTimeout(syncSurcharge, 300);
    }
    return result;
  };

  // XHR monkey-patch
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (_m, url) {
    this._surchUrl = url;
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (
      !_surchargeActive &&
      this._surchUrl &&
      (this._surchUrl.includes("/cart/add") ||
        this._surchUrl.includes("/cart/change") ||
        this._surchUrl.includes("/cart/update"))
    ) {
      this.addEventListener("load", function () {
        setTimeout(syncSurcharge, 300);
      });
    }
    return _origSend.apply(this, arguments);
  };
})();
