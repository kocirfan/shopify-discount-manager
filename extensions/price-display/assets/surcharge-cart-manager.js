/**
 * Surcharge Cart Manager
 *
 * Sepet her değiştiğinde çalışır:
 *  - Surcharge ürünü sepette yoksa → qty=1 ile ekler (Cart Transform fiyatı override eder)
 *  - Sepet boşsa → surcharge ürününü kaldırır
 */

(function () {
  "use strict";

  // Config'i data attribute'lardan oku
  function getConfig() {
    const el = document.getElementById("surcharge-config");
    if (!el) return null;
    const variantId = el.getAttribute("data-variant-id");
    const enabled = el.getAttribute("data-enabled");
    const percentage = el.getAttribute("data-percentage");
    if (!variantId) return null;
    return {
      variantId: variantId,
      enabled: enabled !== "false",
      percentage: parseFloat(percentage) || 7,
    };
  }

  // ─── Shopify Cart API ──────────────────────────────────────────────────────

  async function fetchCart() {
    const res = await fetch("/cart.js");
    return res.json();
  }

  async function addItem(variantId) {
    console.log("[Surcharge] Sepete ekleniyor, variantId:", variantId);
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
    console.log("[Surcharge] Sepetten kaldırılıyor, key:", lineKey);
    const res = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: 0 }),
    });
    return res.json();
  }

  async function setItemQty(lineKey, quantity) {
    const res = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity }),
    });
    return res.json();
  }

  // ─── Ana mantık ───────────────────────────────────────────────────────────

  let isRunning = false;

  async function syncSurcharge() {
    if (isRunning) return;

    const config = getConfig();
    if (!config) {
      console.warn("[Surcharge] #surcharge-config elementi bulunamadı.");
      return;
    }
    if (!config.enabled) return;

    isRunning = true;
    console.log("[Surcharge] syncSurcharge çalışıyor, variantId:", config.variantId);

    try {
      const cart = await fetchCart();
      const lines = cart.items || [];

      const VARIANT_ID = String(config.variantId);

      // Surcharge line'ı bul
      const surchargeLine = lines.find(
        (item) => String(item.variant_id) === VARIANT_ID
      );

      // Surcharge hariç satır var mı?
      const realLines = lines.filter(
        (item) => String(item.variant_id) !== VARIANT_ID
      );
      const hasRealItems = realLines.length > 0 && realLines.some((item) => item.quantity > 0);

      console.log("[Surcharge] hasRealItems:", hasRealItems, "surchargeLine:", !!surchargeLine);

      if (!hasRealItems) {
        if (surchargeLine) {
          await removeItem(surchargeLine.key);
        }
        return;
      }

      if (!surchargeLine) {
        await addItem(VARIANT_ID);
      } else if (surchargeLine.quantity !== 1) {
        await setItemQty(surchargeLine.key, 1);
      }
    } catch (err) {
      console.error("[Surcharge] Hata:", err);
    } finally {
      isRunning = false;
    }
  }

  // ─── Başlat ───────────────────────────────────────────────────────────────

  // Script body'de sync yüklendiği için DOM hazır, hemen çalıştır
  syncSurcharge();

  // Shopify custom events (birçok tema bunları fırlatır)
  document.addEventListener("cart:updated", syncSurcharge);
  document.addEventListener("cart:refresh", syncSurcharge);

  // fetch monkey-patch: /cart/add veya /cart/change sonrası tetikle
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _fetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("/cart/add.js") === false // sadece dış tetikleyicilerde çalış, kendi add'imizde çalışma
    ) {
      setTimeout(syncSurcharge, 300);
    }
    return result;
  };

  // XHR monkey-patch
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (_method, url) {
    this._surchUrl = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (
      this._surchUrl &&
      (this._surchUrl.includes("/cart/add") ||
        this._surchUrl.includes("/cart/change") ||
        this._surchUrl.includes("/cart/update"))
    ) {
      this.addEventListener("load", function () {
        setTimeout(syncSurcharge, 300);
      });
    }
    return _send.apply(this, arguments);
  };
})();
