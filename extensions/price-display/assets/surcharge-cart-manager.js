/**
 * Surcharge Cart Manager
 * - Polling ile sepeti kontrol eder, surcharge eksikse ekler
 * - Checkout tıklandığında surcharge'ı garantileyip yönlendirir
 * - Checkout butonuna hiç dokunulmaz (gidip gelme yok)
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 1500;

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
  // CHECKOUT INTERCEPT
  // Butona dokunmaz — tıklandığında surcharge garantilenip yönlendirilir
  // ============================================================
  document.addEventListener("click", function (e) {
    var anchor = e.target.closest('a[href*="/checkout"]');
    var btn = !anchor && e.target.closest('button[name="checkout"], input[name="checkout"]');
    var target = anchor || btn;
    if (!target) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    var href = anchor ? anchor.href : "/checkout";

    ensureSurcharge().then(function () {
      window.location.href = href;
    });
  }, true);

  function ensureSurcharge() {
    var config = getConfig();
    if (!config || !config.enabled) return Promise.resolve();

    return getCart().then(function (cart) {
      var lines = cart.items || [];
      var VARIANT_ID = String(config.variantId);
      var surchargeLine = lines.find(function (l) { return String(l.variant_id) === VARIANT_ID; });
      var realLines = lines.filter(function (l) { return String(l.variant_id) !== VARIANT_ID; });
      var totalCents = realLines.reduce(function (sum, l) { return sum + l.line_price; }, 0);
      var totalEur = totalCents / 100;

      if (totalEur <= 0) return Promise.resolve();

      var expectedCents = Math.round(totalEur * config.percentage / 100 * 100);
      var ok = surchargeLine && surchargeLine.price === expectedCents && surchargeLine.quantity === 1;
      if (ok) return Promise.resolve();

      return Promise.all([
        updateSurchargePrice(totalEur),
        surchargeLine ? removeLine(surchargeLine.key) : Promise.resolve(),
      ]).then(function () {
        return addItem(VARIANT_ID);
      });
    });
  }

  // ============================================================
  // SURCHARGE SİL BUTONU ENGELLE
  // ============================================================
  function hideSurchargeRemoveButton() {
    var config = getConfig();
    if (!config) return;

    var containers = [];

    document.querySelectorAll(
      '[data-variant-id="' + config.variantId + '"], [data-id="' + config.variantId + '"]'
    ).forEach(function (el) {
      var c = el.closest("tr, li, [data-cart-item], .cart-item, .cart__item");
      if (c && containers.indexOf(c) === -1) containers.push(c);
    });

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
      });
      container.querySelectorAll(
        ".quantity, .cart-item__quantity-wrapper, [data-quantity-wrapper]"
      ).forEach(function (el) {
        el.style.pointerEvents = "none";
        el.style.opacity = "0.4";
      });
    });
  }

  var _observer = new MutationObserver(function () {
    hideSurchargeRemoveButton();
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  // CORE SYNC (arka planda sessizce çalışır, butona dokunmaz)
  // ============================================================
  var _busy = false;
  var _lastCartHash = null;

  function cartHash(lines) {
    var config = getConfig();
    return lines
      .filter(function (l) { return String(l.variant_id) !== String(config.variantId); })
      .map(function (l) { return l.variant_id + ":" + l.quantity; })
      .sort()
      .join("|");
  }

  function sync() {
    if (_busy) return;
    var config = getConfig();
    if (!config || !config.enabled) return;

    _busy = true;

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
          return removeLine(surchargeLine.key).then(function () { _lastCartHash = null; });
        }
        return Promise.resolve();
      }

      var expectedCents = Math.round(totalEur * config.percentage / 100 * 100);
      var priceCorrect = surchargeLine && surchargeLine.price === expectedCents && surchargeLine.quantity === 1;

      if (priceCorrect && currentHash === _lastCartHash) {
        return Promise.resolve();
      }

      _lastCartHash = currentHash;

      return Promise.all([
        updateSurchargePrice(totalEur),
        surchargeLine ? removeLine(surchargeLine.key) : Promise.resolve(),
      ]).then(function () {
        return addItem(VARIANT_ID);
      }).then(function () {
        hideSurchargeRemoveButton();
      });

    }).catch(function (e) {
      console.error("[Surcharge] hata:", e);
    }).then(function () {
      _busy = false;
    });
  }

  // ============================================================
  // POLLING
  // ============================================================
  function startPolling() {
    sync();
    setInterval(function () {
      if (!_busy) sync();
    }, POLL_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startPolling);
  } else {
    startPolling();
  }

  document.addEventListener("cart:updated", function () { if (!_busy) sync(); });
  document.addEventListener("cart:refresh", function () { if (!_busy) sync(); });

})();
