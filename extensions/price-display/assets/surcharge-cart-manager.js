/**
 * Surcharge Cart Manager
 *
 * Sepet her değiştiğinde çalışır:
 *  - Surcharge ürünü sepette yoksa → qty=1 ile ekler (Cart Transform fiyatı override eder)
 *  - Sepet boşsa → surcharge ürününü kaldırır
 *  - Sayfa yüklendiğinde ve sepet güncellendiğinde tetiklenir
 */

(function () {
  "use strict";

  const configEl = document.getElementById("surcharge-config");
  if (!configEl) return;

  let config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch (e) {
    console.error("[Surcharge] Config parse hatası:", e);
    return;
  }

  if (!config.enabled) return;
  if (!config.variantId) {
    console.warn("[Surcharge] variantId ayarlanmamış.");
    return;
  }

  const VARIANT_ID = String(config.variantId);

  // ─── Shopify Cart API helpers ──────────────────────────────────────────────

  async function fetchCart() {
    const res = await fetch("/cart.js");
    return res.json();
  }

  async function addItem(variantId) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    });
    return res.json();
  }

  async function updateItem(lineKey, quantity) {
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
    isRunning = true;

    try {
      const cart = await fetchCart();
      const lines = cart.items || [];

      // Surcharge line'ı bul
      const surchargeLine = lines.find(
        (item) => String(item.variant_id) === VARIANT_ID
      );

      // Surcharge hariç toplam (kuruş → TL/EUR)
      const cartTotalCents = lines
        .filter((item) => String(item.variant_id) !== VARIANT_ID)
        .reduce((sum, item) => sum + item.line_price, 0);

      const hasRealItems = cartTotalCents > 0;

      if (!hasRealItems) {
        // Sepet boş → surcharge varsa kaldır
        if (surchargeLine) {
          await updateItem(surchargeLine.key, 0);
        }
        return;
      }

      if (!surchargeLine) {
        // Surcharge yok → qty=1 ile ekle (Cart Transform fiyatı set eder)
        await addItem(VARIANT_ID);
      }
      // Surcharge zaten varsa ve qty=1 ise Cart Transform zaten fiyatı doğru hesaplar.
      // Birden fazla qty olmuşsa 1'e düşür.
      else if (surchargeLine.quantity !== 1) {
        await updateItem(surchargeLine.key, 1);
      }
    } catch (err) {
      console.error("[Surcharge] Hata:", err);
    } finally {
      isRunning = false;
    }
  }

  // ─── Event dinleyicileri ───────────────────────────────────────────────────

  // Sayfa yüklendiğinde çalıştır
  document.addEventListener("DOMContentLoaded", () => {
    syncSurcharge();
  });

  // Shopify'ın standart cart:updated custom event'i (bazı temalarda)
  document.addEventListener("cart:updated", () => {
    syncSurcharge();
  });

  // fetch/XHR monkey-patch: /cart/add veya /cart/change sonrası tetikle
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("surcharge-sync")
    ) {
      // Clone et çünkü response body sadece bir kez okunabilir
      const clone = result.clone();
      clone.json().then(() => {
        setTimeout(syncSurcharge, 100);
      }).catch(() => {});
    }
    return result;
  };

  // XMLHttpRequest monkey-patch (eski tema uyumluluğu)
  const OriginalXHR = window.XMLHttpRequest;
  const XHROpen = OriginalXHR.prototype.open;
  const XHRSend = OriginalXHR.prototype.send;

  OriginalXHR.prototype.open = function (method, url, ...rest) {
    this._surchargeUrl = url;
    return XHROpen.call(this, method, url, ...rest);
  };

  OriginalXHR.prototype.send = function (...args) {
    if (
      this._surchargeUrl &&
      (this._surchargeUrl.includes("/cart/add") ||
        this._surchargeUrl.includes("/cart/change") ||
        this._surchargeUrl.includes("/cart/update"))
    ) {
      this.addEventListener("load", function () {
        setTimeout(syncSurcharge, 100);
      });
    }
    return XHRSend.apply(this, args);
  };
})();
