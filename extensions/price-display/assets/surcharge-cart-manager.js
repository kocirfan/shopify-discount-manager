/**
 * Surcharge Cart Manager
 * - Fiyat değişmemişse: hiçbir şey yapma
 * - Fiyat değişmişse: backend güncelle + eski satırı kaldır (paralel) → yeni ekle
 * - Backend hatası olsa bile surcharge eklenir (Cart Transform checkout'ta fiyatı düzeltir)
 * - Sepet boşsa: surcharge'ı kaldır
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
      percentage: parseFloat(el.getAttribute("data-percentage")) || 7,
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

  // Backend fiyat güncelleme — hata olursa sessizce geç, addItem'ı engelleme
  async function updateSurchargePrice(cartTotalEur) {
    try {
      const shop = window.Shopify && window.Shopify.shop;
      const res = await fetch(
        `/apps/discount-manager/api/surcharge-price?shop=${encodeURIComponent(shop || "")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartTotal: cartTotalEur }),
        }
      );
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      console.warn("[Surcharge] backend güncelleme başarısız (Cart Transform devreye girecek):", e);
      return null;
    }
  }

  // ============================================================
  // CHECKOUT BLOCKER
  // DOM'a sonradan eklenen butonları da yakalar (MutationObserver)
  // ============================================================
  const CHECKOUT_SELECTORS = [
    'a[href="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button[data-checkout-button]',
    '[data-testid="checkout-button"]',
  ].join(",");

  function applyBlock(el) {
    el.setAttribute("data-surcharge-blocked", "true");
    el.setAttribute("disabled", "true");
    el.style.opacity = "0.6";
    el.style.pointerEvents = "none";
    el.style.cursor = "wait";
  }

  function blockCheckout() {
    document.querySelectorAll(CHECKOUT_SELECTORS).forEach(applyBlock);
  }

  function unblockCheckout() {
    document.querySelectorAll("[data-surcharge-blocked]").forEach((el) => {
      el.removeAttribute("data-surcharge-blocked");
      el.removeAttribute("disabled");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.cursor = "";
    });
  }

  // Sonradan DOM'a eklenen checkout butonlarını da blokla
  const _observer = new MutationObserver(() => {
    if (_busy) blockCheckout();
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // Link tıklamalarını yakala
  document.addEventListener("click", function (e) {
    const anchor = e.target.closest('a[href="/checkout"]');
    if (!anchor || (!_busy && !_pending)) return;
    e.preventDefault();
    waitForSync().then(() => { window.location.href = "/checkout"; });
  }, true);

  function waitForSync() {
    return new Promise((resolve) => {
      if (!_busy && !_pending) return resolve();
      const id = setInterval(() => {
        if (!_busy && !_pending) { clearInterval(id); resolve(); }
      }, 100);
    });
  }

  let _busy = false;
  let _pending = false;

  async function sync() {
    if (_busy) { _pending = true; return; }

    const config = getConfig();
    if (!config || !config.enabled) return;

    _busy = true;
    blockCheckout();

    try {
      const cart = await getCart();
      const lines = cart.items || [];
      const VARIANT_ID = String(config.variantId);

      const surchargeLine = lines.find((l) => String(l.variant_id) === VARIANT_ID);
      const realLines = lines.filter((l) => String(l.variant_id) !== VARIANT_ID);
      const totalCents = realLines.reduce((sum, l) => sum + l.line_price, 0);
      const totalEur = totalCents / 100;

      if (totalEur <= 0) {
        if (surchargeLine) await removeLine(surchargeLine.key);
        return;
      }

      // Client'ta beklenen fiyatı hesapla
      const expectedCents = Math.round(totalEur * config.percentage / 100 * 100);
      const priceCorrect = surchargeLine &&
        surchargeLine.price === expectedCents &&
        surchargeLine.quantity === 1;

      if (priceCorrect) {
        return;
      }

      // Backend güncelleme + eski satır kaldırma paralel — backend hatası addItem'ı DURDURMAZ
      await Promise.all([
        updateSurchargePrice(totalEur), // hata olursa null döner, fırlatmaz
        surchargeLine ? removeLine(surchargeLine.key) : Promise.resolve(),
      ]);

      await addItem(VARIANT_ID);
      console.log("[Surcharge] güncellendi, totalEur:", totalEur);

    } catch (e) {
      console.error("[Surcharge] hata:", e);
    } finally {
      _busy = false;
      if (_pending) {
        _pending = false;
        setTimeout(sync, 300);
      } else {
        unblockCheckout();
      }
    }
  }

  sync();

  document.addEventListener("cart:updated", sync);
  document.addEventListener("cart:refresh", sync);

  // Fetch intercept
  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _origFetch.apply(this, args);
    if (_busy) return result;
    const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
    if (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("/apps/")
    ) {
      setTimeout(sync, 400);
    }
    return result;
  };

  // XHR intercept
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
