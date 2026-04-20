/**
 * Surcharge Cart Manager
 * - Sepet toplamının %X'i kadar surcharge ürününü yönetir
 * - Checkout anında fiyat günceller ve sepete ekler
 * - Polling: sadece sepet değişince çalışır, rate limit korumalı
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 10000; // 10 saniye

  // ============================================================
  // CONFIG
  // ============================================================
  function getConfig() {
    var el = document.getElementById("surcharge-config");
    if (!el) return null;
    var variantId = el.getAttribute("data-variant-id");
    if (!variantId || variantId === "") return null;
    return {
      variantId: String(variantId),
      enabled: el.getAttribute("data-enabled") !== "false",
      percentage: parseFloat(el.getAttribute("data-percentage")) || 7,
    };
  }

  // ============================================================
  // CART API — tek sıralı kuyruk, eş zamanlı istek olmaz
  // ============================================================
  var _queue = Promise.resolve();

  function enqueue(fn) {
    _queue = _queue.then(fn).catch(function () {});
    return _queue;
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (r) {
      if (!r.ok) return Promise.reject(new Error("HTTP " + r.status));
      return r.json();
    });
  }

  function getCart() {
    return fetchJSON("/cart.js");
  }

  // Tüm surcharge satırlarını sil (duplicate varsa hepsini)
  function removeAllSurchargeLines(lines, variantId) {
    var surchargeLines = lines.filter(function (l) {
      return String(l.variant_id) === variantId;
    });
    if (surchargeLines.length === 0) return Promise.resolve();
    // Sırayla sil
    return surchargeLines.reduce(function (p, line) {
      return p.then(function () {
        return fetchJSON("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: line.key, quantity: 0 }),
        });
      });
    }, Promise.resolve());
  }

  function addItem(variantId) {
    return fetchJSON("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
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
  // CORE LOGIC — her zaman bu fonksiyon üzerinden geçilir
  // ============================================================
  function applySurcharge(cart, config) {
    var lines = cart.items || [];
    var VARIANT_ID = config.variantId;

    var surchargeLines = lines.filter(function (l) {
      return String(l.variant_id) === VARIANT_ID;
    });
    var realLines = lines.filter(function (l) {
      return String(l.variant_id) !== VARIANT_ID;
    });

    var totalCents = realLines.reduce(function (sum, l) { return sum + l.line_price; }, 0);
    var totalEur = totalCents / 100;

    // Sepet boşsa surcharge'ı kaldır
    if (totalEur <= 0) {
      if (surchargeLines.length === 0) return Promise.resolve();
      return removeAllSurchargeLines(surchargeLines, VARIANT_ID);
    }

    var expectedCents = Math.round(totalEur * config.percentage / 100 * 100);

    // Tek surcharge var, fiyatı doğruysa hiçbir şey yapma
    if (
      surchargeLines.length === 1 &&
      surchargeLines[0].price === expectedCents &&
      surchargeLines[0].quantity === 1
    ) {
      return Promise.resolve();
    }

    // Fiyat güncelle, sonra eski satırları sil, sonra ekle (sırayla)
    return updateSurchargePrice(totalEur)
      .then(function () {
        return removeAllSurchargeLines(surchargeLines, VARIANT_ID);
      })
      .then(function () {
        return addItem(VARIANT_ID);
      });
  }

  // ============================================================
  // CHECKOUT INTERCEPT
  // ============================================================
  document.addEventListener("click", function (e) {
    var anchor = e.target.closest('a[href*="/checkout"]');
    var btn = !anchor && e.target.closest('button[name="checkout"], input[name="checkout"]');
    var target = anchor || btn;
    if (!target) return;

    var config = getConfig();
    if (!config || !config.enabled) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    var href = anchor ? anchor.href : "/checkout";

    enqueue(function () {
      return getCart().then(function (cart) {
        return applySurcharge(cart, config);
      }).then(function () {
        window.location.href = href;
      }).catch(function (e) {
        console.error("[Surcharge] checkout hata:", e);
        window.location.href = href; // hata olsa da checkout'a git
      });
    });
  }, true);

  // ============================================================
  // POLLING — sadece gerçek ürün değişince çalışır
  // ============================================================
  var _lastRealHash = null;

  function realHash(lines, variantId) {
    return lines
      .filter(function (l) { return String(l.variant_id) !== variantId; })
      .map(function (l) { return l.variant_id + ":" + l.quantity + ":" + l.line_price; })
      .sort()
      .join("|");
  }

  function syncPoll() {
    var config = getConfig();
    if (!config || !config.enabled) return;

    enqueue(function () {
      return getCart().then(function (cart) {
        var hash = realHash(cart.items || [], config.variantId);
        if (hash === _lastRealHash) return; // değişmedi, çık
        _lastRealHash = hash;
        return applySurcharge(cart, config);
      }).catch(function (e) {
        if (e && e.message && e.message.indexOf("429") !== -1) return; // sessiz
        console.error("[Surcharge] sync hata:", e);
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
  // BAŞLAT
  // ============================================================
  function start() {
    syncPoll();
    setInterval(syncPoll, POLL_INTERVAL);
  }

  document.addEventListener("cart:updated", syncPoll);
  document.addEventListener("cart:refresh", syncPoll);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
