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
    // Standart checkout
    'a[href="/checkout"]',
    'a[href*="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button[data-checkout-button]',
    '[data-testid="checkout-button"]',
    // Accelerated checkout (PayPal, Shop Pay, Google Pay, Apple Pay)
    '.shopify-payment-button__button',
    '.shopify-payment-button button',
    '[data-shopify="payment-button"]',
    '[data-payment-button]',
    'button.dynamic-checkout__button',
    '.dynamic-checkout__content button',
  ].join(",");

  // Accelerated checkout container'ları (Shop Pay, PayPal, Apple Pay, Google Pay)
  // Bunlar iframe içinde render edilir, disable edilemez — tamamen gizlenir
  const ACCELERATED_SELECTORS = [
    '.shopify-payment-button',
    '[data-shopify="payment-button"]',
    '.dynamic-checkout',
    '#dynamic-checkout-cart',
    '[data-dynamic-checkout]',
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
    // Accelerated butonları tamamen gizle (iframe erişilemez)
    document.querySelectorAll(ACCELERATED_SELECTORS).forEach((el) => {
      if (!el.hasAttribute("data-surcharge-hidden")) {
        el.setAttribute("data-surcharge-hidden", "true");
        el.style.display = "none";
      }
    });
  }

  function unblockCheckout() {
    document.querySelectorAll("[data-surcharge-blocked]").forEach((el) => {
      el.removeAttribute("data-surcharge-blocked");
      el.removeAttribute("disabled");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.cursor = "";
    });
    document.querySelectorAll("[data-surcharge-hidden]").forEach((el) => {
      el.removeAttribute("data-surcharge-hidden");
      el.style.display = "";
    });
  }

  // ============================================================
  // SURCHARGE SİL BUTONU ENGELLE
  // Sepette surcharge satırındaki remove/delete butonunu gizle
  // ============================================================
  const SURCHARGE_VARIANT_ID_NUM = getConfig()?.variantId;

  function hideSurchargeRemoveButton() {
    if (!SURCHARGE_VARIANT_ID_NUM) return;

    // Yöntem 1: data-variant-id attribute ile satırı bul
    document.querySelectorAll(
      `[data-variant-id="${SURCHARGE_VARIANT_ID_NUM}"], ` +
      `[data-id="${SURCHARGE_VARIANT_ID_NUM}"]`
    ).forEach((lineEl) => {
      const container = lineEl.closest("tr, li, [data-cart-item], .cart-item, .cart__item");
      if (container) hideRemoveBtn(container);
    });

    // Yöntem 2: /cart/change.js veya remove linkini içeren butonları tara
    // Tema bazı butonlara line index veya key koyar, bu yüzden tüm remove butonlarını
    // parent container üzerinden kontrol et
    document.querySelectorAll(
      'a[href*="/cart/change"], button[data-line], [data-cart-item-remove], ' +
      '.cart-remove, .cart__remove, [aria-label*="Remove"], [aria-label*="Verwijder"]'
    ).forEach((btn) => {
      const container = btn.closest("tr, li, [data-cart-item], .cart-item, .cart__item");
      if (!container) return;
      const variantEl = container.querySelector(
        `[data-variant-id="${SURCHARGE_VARIANT_ID_NUM}"], ` +
        `[data-id="${SURCHARGE_VARIANT_ID_NUM}"]`
      );
      // data-variant-id yoksa, içindeki metni veya SKU'yu kontrol et
      const hasOrdertoeslagText = container.textContent?.includes("ORDERTOESLA") ||
        container.textContent?.includes("Service Toeslag") ||
        container.textContent?.includes("toeslag");
      if (variantEl || hasOrdertoeslagText) hideRemoveBtn(container);
    });
  }

  function hideRemoveBtn(container) {
    container.querySelectorAll(
      'a[href*="/cart/change"], button[data-line], [data-cart-item-remove], ' +
      '.cart-remove, .cart__remove, [aria-label*="Remove"], [aria-label*="Verwijder"], ' +
      'button.quantity__button, a.cart-item__remove'
    ).forEach((btn) => {
      btn.style.display = "none";
      btn.setAttribute("data-surcharge-remove-hidden", "true");
    });
    // Quantity +/- butonlarını da gizle (miktar değiştirmeyi engelle)
    container.querySelectorAll(
      '.quantity, .cart-item__quantity-wrapper, [data-quantity-wrapper]'
    ).forEach((el) => {
      el.style.pointerEvents = "none";
      el.style.opacity = "0.4";
    });
  }

  // MutationObserver: DOM değişince tekrar kontrol et
  const _observer = new MutationObserver(() => {
    if (_busy) blockCheckout();
    hideSurchargeRemoveButton();
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
      hideSurchargeRemoveButton();

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
  // /cart/add veya /cart/change isteği tamamlandığında sync'i başlat
  // ve response'u sync bitene kadar beklet — tema sync bitmeden checkout butonunu aktif edemez
  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
    const isCartMutation = (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("/apps/")
    );

    const result = await _origFetch.apply(this, args);

    if (isCartMutation && !_busy) {
      // sync'i başlat ve bitmesini bekle, sonra response'u döndür
      sync();
      await waitForSync();
    }

    return result;
  };

  // XHR intercept — sync başlat ve response'u beklet
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_m, url) {
    this._sUrl = url;
    return _origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this._sUrl &&
      (this._sUrl.includes("/cart/add") || this._sUrl.includes("/cart/change") || this._sUrl.includes("/cart/update")) &&
      !this._sUrl.includes("/apps/")) {
      const xhr = this;
      const _origOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = null;
      this.addEventListener("load", async () => {
        if (!_busy) {
          sync();
          await waitForSync();
        }
        if (_origOnReadyStateChange) _origOnReadyStateChange.call(xhr);
      });
    }
    return _origSend.apply(this, arguments);
  };
})();
