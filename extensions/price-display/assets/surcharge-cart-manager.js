/**
 * Surcharge Cart Manager
 * - Sepet toplamının %X'i kadar surcharge ürününü yönetir
 * - İndirimli fiyatlar (final_line_price) baz alınır
 * - Checkout öncesi doğrulama döngüsü ile yanlış fiyatla checkout engellenir
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 8000; // 8 saniye

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
      percentage: parseFloat(el.getAttribute("data-percentage")) || 5,
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
      if (!r.ok) {
        return r.text().then(function (body) {
          return Promise.reject(new Error("HTTP " + r.status + " — " + body.slice(0, 200)));
        });
      }
      return r.json();
    });
  }

  function getCart() {
    return fetchJSON("/cart.js");
  }

  function removeSurchargeLines(surchargeLines) {
    if (surchargeLines.length === 0) return Promise.resolve();
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

  function addSurcharge(variantId) {
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

  // Gerçek ürünlerin indirimli toplamını cent olarak döner
  function calcRealTotalCents(lines, variantId) {
    return lines
      .filter(function (l) { return String(l.variant_id) !== variantId; })
      .reduce(function (sum, l) { return sum + l.final_line_price; }, 0);
  }

  // ============================================================
  // CORE LOGIC
  // ============================================================
  function applySurcharge(cart, config) {
    var lines = cart.items || [];
    var VARIANT_ID = config.variantId;

    var surchargeLines = lines.filter(function (l) {
      return String(l.variant_id) === VARIANT_ID;
    });

    var totalCents = calcRealTotalCents(lines, VARIANT_ID);
    var totalEur = totalCents / 100;

    // Sepet boşsa surcharge'ı kaldır
    if (totalEur <= 0) {
      if (surchargeLines.length === 0) return Promise.resolve();
      return removeSurchargeLines(surchargeLines);
    }

    var expectedCents = Math.round(totalCents * config.percentage / 100);

    // Tek surcharge, doğru fiyat, miktar 1 → değişiklik yok
    if (
      surchargeLines.length === 1 &&
      surchargeLines[0].quantity === 1 &&
      surchargeLines[0].price === expectedCents
    ) {
      return Promise.resolve();
    }

    // Variant fiyatını güncelle, sil, yeniden ekle
    return updateSurchargePrice(totalEur)
      .then(function () {
        return removeSurchargeLines(surchargeLines);
      })
      .then(function () {
        return addSurcharge(VARIANT_ID);
      });
  }

  // ============================================================
  // CHECKOUT INTERCEPT
  // ============================================================

  // Sepeti tekrar okuyup surcharge'ın kesinlikle doğru olduğunu doğrula.
  // Yanlışsa applySurcharge'ı yeniden çağırır; max 6 tur (yaklaşık 4.5 sn).
  function verifyAndFix(config, attempt) {
    if (attempt >= 6) {
      console.warn("[Surcharge] Doğrulama zaman aşımı — checkout'a devam ediliyor.");
      return Promise.resolve();
    }

    return getCart().then(function (cart) {
      var lines = cart.items || [];
      var VARIANT_ID = config.variantId;
      var surcharge = lines.filter(function (l) { return String(l.variant_id) === VARIANT_ID; });
      var totalCents = calcRealTotalCents(lines, VARIANT_ID);
      var expectedCents = Math.round(totalCents * config.percentage / 100);

      // Sepet boşsa surcharge olmamalı
      if (totalCents === 0) {
        if (surcharge.length === 0) return Promise.resolve();
        return removeSurchargeLines(surcharge).then(function () {
          return verifyAndFix(config, attempt + 1);
        });
      }

      // Tek satır, doğru fiyat, miktar 1 → onaylandı
      if (
        surcharge.length === 1 &&
        surcharge[0].quantity === 1 &&
        surcharge[0].price === expectedCents
      ) {
        return Promise.resolve();
      }

      // Hâlâ yanlış: düzelt, sonra tekrar kontrol et
      return applySurcharge(cart, config)
        .then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 700); });
        })
        .then(function () {
          return verifyAndFix(config, attempt + 1);
        });
    });
  }

  function showCheckoutSpinner(target) {
    if (target.tagName === "INPUT") {
      target.disabled = true;
      target.dataset._origValue = target.value;
      target.value = "...";
      return;
    }
    target.disabled = true;
    target.dataset._origHtml = target.innerHTML;
    target.style.position = "relative";
    target.style.pointerEvents = "none";
    target.style.opacity = "0.8";

    var spinner = document.createElement("span");
    spinner.className = "_surcharge-spinner";
    spinner.style.cssText = [
      "display:inline-block",
      "width:1em",
      "height:1em",
      "border:2px solid currentColor",
      "border-top-color:transparent",
      "border-radius:50%",
      "animation:_surcharge-spin 0.7s linear infinite",
      "vertical-align:middle",
      "margin-left:0.5em",
    ].join(";");

    if (!document.getElementById("_surcharge-spin-style")) {
      var style = document.createElement("style");
      style.id = "_surcharge-spin-style";
      style.textContent = "@keyframes _surcharge-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }

    target.appendChild(spinner);
  }

  function hideCheckoutSpinner(target) {
    if (target.tagName === "INPUT") {
      target.disabled = false;
      if (target.dataset._origValue !== undefined) {
        target.value = target.dataset._origValue;
        delete target.dataset._origValue;
      }
      return;
    }
    target.disabled = false;
    target.style.pointerEvents = "";
    target.style.opacity = "";
    if (target.dataset._origHtml !== undefined) {
      target.innerHTML = target.dataset._origHtml;
      delete target.dataset._origHtml;
    }
  }

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

    showCheckoutSpinner(target);

    enqueue(function () {
      return verifyAndFix(config, 0)
        .then(function () {
          window.location.href = href;
        })
        .catch(function (err) {
          console.error("[Surcharge] checkout hata:", err);
          hideCheckoutSpinner(target);
          window.location.href = href;
        });
    });
  }, true);

  // ============================================================
  // POLLING — indirim dahil her değişikliği yakalar
  // ============================================================
  var _lastRealHash = null;

  function realHash(lines, variantId) {
    return lines
      .filter(function (l) { return String(l.variant_id) !== variantId; })
      // final_line_price: indirim uygulanmış fiyat — bu değişince hash değişir
      .map(function (l) { return l.variant_id + ":" + l.quantity + ":" + l.final_line_price; })
      .sort()
      .join("|");
  }

  function syncPoll() {
    var config = getConfig();
    if (!config || !config.enabled) return;

    enqueue(function () {
      return getCart().then(function (cart) {
        var hash = realHash(cart.items || [], config.variantId);
        if (hash === _lastRealHash) return;
        _lastRealHash = hash;
        return applySurcharge(cart, config);
      }).catch(function (e) {
        if (e && e.message && e.message.indexOf("429") !== -1) return;
        console.error("[Surcharge] sync hata:", e);
      });
    });
  }

  // ============================================================
  // SURCHARGE SİL / ADET BUTONLARINI ENGELLE
  // ============================================================
  function hideSurchargeControls() {
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
      var t = el.textContent.toUpperCase();
      if (
        (t.includes("ORDERTOESLAG") || t.includes("SERVICE TOESLAG")) &&
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
    hideSurchargeControls();
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
