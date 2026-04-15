/**
 * Surcharge Cart Manager
 * Fetch/XHR intercept yerine polling kullanır — tema'nın internal module'leri
 * window.fetch override'ını bypass ettiği için polling daha güvenilir.
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 1500; // ms — sepeti bu aralıkla kontrol et

  function getConfig() {
    var el = document.getElementById("surcharge-config");
    if (!el) return null;
    var variantId = el.getAttribute("data-variant-id");
    if (!variantId) return null;
    return {
      variantId: variantId,
      enabled: el.getAttribute("data-enabled") !== "false",
      percentage: parseFloat(el.getAttribute("data-percentage")) || 7,
    };
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (r) { return r.json(); });
  }

  function getCart() {
    return fetchJSON("/cart.js");
  }

  function addItem(variantId) {
    return fetchJSON("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
    });
  }

  function removeLine(lineKey) {
    return fetchJSON("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: 0 }),
    });
  }

  function updateSurchargePrice(cartTotalEur) {
    var shop = window.Shopify && window.Shopify.shop;
    return fetch(
      "/apps/discount-manager/api/surcharge-price?shop=" + encodeURIComponent(shop || ""),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartTotal: cartTotalEur }),
      }
    ).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
      return null;
    });
  }

  // ============================================================
  // CHECKOUT BLOCKER
  // ============================================================
  var CHECKOUT_SELECTORS = [
    'a[href="/checkout"]',
    'a[href*="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button[data-checkout-button]',
    '[data-testid="checkout-button"]',
    ".shopify-payment-button__button",
    ".shopify-payment-button button",
    '[data-shopify="payment-button"]',
    "button.dynamic-checkout__button",
    ".dynamic-checkout__content button",
  ].join(",");

  var ACCELERATED_SELECTORS = [
    ".shopify-payment-button",
    '[data-shopify="payment-button"]',
    ".dynamic-checkout",
    "#dynamic-checkout-cart",
    "[data-dynamic-checkout]",
  ].join(",");

  function blockCheckout() {
    document.querySelectorAll(CHECKOUT_SELECTORS).forEach(function (el) {
      el.setAttribute("data-surcharge-blocked", "true");
      el.setAttribute("disabled", "true");
      el.style.opacity = "0.6";
      el.style.pointerEvents = "none";
      el.style.cursor = "wait";
    });
    document.querySelectorAll(ACCELERATED_SELECTORS).forEach(function (el) {
      if (!el.hasAttribute("data-surcharge-hidden")) {
        el.setAttribute("data-surcharge-hidden", "true");
        el.style.display = "none";
      }
    });
  }

  function unblockCheckout() {
    document.querySelectorAll("[data-surcharge-blocked]").forEach(function (el) {
      el.removeAttribute("data-surcharge-blocked");
      el.removeAttribute("disabled");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.cursor = "";
    });
    document.querySelectorAll("[data-surcharge-hidden]").forEach(function (el) {
      el.removeAttribute("data-surcharge-hidden");
      el.style.display = "";
    });
  }

  // Checkout linkine tıklanırsa sync bitene kadar beklet
  document.addEventListener("click", function (e) {
    var anchor = e.target.closest('a[href*="/checkout"]');
    if (!anchor) return;
    if (!_busy) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    waitForSync().then(function () {
      window.location.href = anchor.href;
    });
  }, true);

  function waitForSync() {
    return new Promise(function (resolve) {
      if (!_busy) return resolve();
      var id = setInterval(function () {
        if (!_busy) { clearInterval(id); resolve(); }
      }, 100);
    });
  }

  // ============================================================
  // SURCHARGE SİL BUTONU ENGELLE
  // ============================================================
  function hideSurchargeRemoveButton() {
    var config = getConfig();
    if (!config) return;

    // Variant ID ile satırı bul
    var containers = [];

    document.querySelectorAll(
      '[data-variant-id="' + config.variantId + '"], [data-id="' + config.variantId + '"]'
    ).forEach(function (el) {
      var c = el.closest("tr, li, [data-cart-item], .cart-item, .cart__item");
      if (c && containers.indexOf(c) === -1) containers.push(c);
    });

    // Text içeriğiyle bul (fallback)
    document.querySelectorAll("tr, li, [data-cart-item], .cart-item, .cart__item").forEach(function (el) {
      if (
        (el.textContent.includes("ORDERTOESLAG") || el.textContent.includes("Service Toeslag")) &&
        containers.indexOf(el) === -1
      ) {
        containers.push(el);
      }
    });

    containers.forEach(function (container) {
      container.querySelectorAll(
        'a[href*="/cart/change"], [data-cart-item-remove], .cart-remove, ' +
        '.cart__remove, [aria-label*="Remove"], [aria-label*="Verwijder"], ' +
        'a.cart-item__remove, button.cart-item__remove'
      ).forEach(function (btn) {
        btn.style.display = "none";
        btn.setAttribute("data-surcharge-remove-hidden", "true");
      });
      container.querySelectorAll(
        ".quantity, .cart-item__quantity-wrapper, [data-quantity-wrapper]"
      ).forEach(function (el) {
        el.style.pointerEvents = "none";
        el.style.opacity = "0.4";
      });
    });
  }

  // MutationObserver
  var _observer = new MutationObserver(function () {
    if (_busy) blockCheckout();
    hideSurchargeRemoveButton();
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  // CORE SYNC
  // ============================================================
  var _busy = false;
  var _lastCartHash = null;

  function cartHash(lines) {
    // Surcharge hariç satırların variant+quantity'sini hash'le
    return lines
      .filter(function (l) { return String(l.variant_id) !== String(getConfig().variantId); })
      .map(function (l) { return l.variant_id + ":" + l.quantity; })
      .sort()
      .join("|");
  }

  function sync() {
    if (_busy) return;

    var config = getConfig();
    if (!config || !config.enabled) return;

    _busy = true;
    blockCheckout();

    getCart().then(function (cart) {
      var lines = cart.items || [];
      var VARIANT_ID = String(config.variantId);

      var surchargeLine = lines.find(function (l) { return String(l.variant_id) === VARIANT_ID; });
      var realLines = lines.filter(function (l) { return String(l.variant_id) !== VARIANT_ID; });
      var totalCents = realLines.reduce(function (sum, l) { return sum + l.line_price; }, 0);
      var totalEur = totalCents / 100;

      var currentHash = cartHash(lines);

      if (totalEur <= 0) {
        if (surchargeLine) {
          blockCheckout();
          return removeLine(surchargeLine.key).then(function () { _lastCartHash = null; });
        }
        return Promise.resolve();
      }

      var expectedCents = Math.round(totalEur * config.percentage / 100 * 100);
      var priceCorrect = surchargeLine &&
        surchargeLine.price === expectedCents &&
        surchargeLine.quantity === 1;

      // Hash değişmemişse ve fiyat doğruysa — hiçbir şey yapma, butona dokunma
      if (priceCorrect && currentHash === _lastCartHash) {
        return Promise.resolve();
      }

      // Gerçekten iş var — şimdi blokla
      blockCheckout();
      _lastCartHash = currentHash;

      return Promise.all([
        updateSurchargePrice(totalEur),
        surchargeLine ? removeLine(surchargeLine.key) : Promise.resolve(),
      ]).then(function () {
        return addItem(VARIANT_ID);
      }).then(function () {
        hideSurchargeRemoveButton();
        console.log("[Surcharge] eklendi, totalEur:", totalEur);
      });

    }).catch(function (e) {
      console.error("[Surcharge] hata:", e);
    }).then(function () {
      _busy = false;
      unblockCheckout();
    });
  }

  // ============================================================
  // POLLING — her POLL_INTERVAL ms'de sepeti kontrol et
  // ============================================================
  function startPolling() {
    sync(); // ilk çalışma
    setInterval(function () {
      if (!_busy) sync();
    }, POLL_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startPolling);
  } else {
    startPolling();
  }

  // Event-based tetikleyiciler (polling'e ek olarak, daha hızlı tepki için)
  document.addEventListener("cart:updated", function () { if (!_busy) sync(); });
  document.addEventListener("cart:refresh", function () { if (!_busy) sync(); });

})();
