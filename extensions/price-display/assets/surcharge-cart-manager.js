/**
 * Surcharge Cart Manager
 * - Sepet toplamının %X'i kadar surcharge ürününü yönetir
 * - İndirimli fiyatlar (final_line_price) baz alınır
 * - Fiyat görüntüsü Cart Transform Function tarafından yönetilir;
 *   bu kod sadece doğru tutarı API'ye bildirir ve ürünü sepete ekler
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 8000;

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

  // İndirim uygulanmış gerçek ürün toplamı (cent)
  function calcRealTotalCents(lines, variantId) {
    return lines
      .filter(function (l) { return String(l.variant_id) !== variantId; })
      .reduce(function (sum, l) { return sum + l.final_line_price; }, 0);
  }

  // ============================================================
  // CORE LOGIC
  // Önemli not: /cart.js'deki `price` Cart Transform'un override
  // ettiği fiyatı değil, variant'ın kayıtlı fiyatını döndürür.
  // Bu yüzden fiyat karşılaştırması yapılmaz; sadece sepette
  // tam olarak 1 adet surcharge olup olmadığı kontrol edilir.
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

    // Zaten tam 1 adet surcharge var ve totalEur değişmemişse dokunma
    // (fiyat doğruluğu Cart Transform Function'ın sorumluluğu)
    if (surchargeLines.length === 1 && surchargeLines[0].quantity === 1) {
      // Sadece API'ye güncel tutarı bildir; sil/ekle döngüsüne girme
      return updateSurchargePrice(totalEur);
    }

    // Surcharge yok veya birden fazla var: düzelt
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
  // Checkout öncesi: tutarı API'ye bildir, surcharge sepette var mı
  // kontrol et. Fiyat karşılaştırması yapma — Cart Transform halleder.
  // ============================================================
  function ensureSurchargePresent(config, attempt) {
    if (attempt >= 4) return Promise.resolve();

    return getCart().then(function (cart) {
      var lines = cart.items || [];
      var VARIANT_ID = config.variantId;
      var surcharge = lines.filter(function (l) { return String(l.variant_id) === VARIANT_ID; });
      var totalCents = calcRealTotalCents(lines, VARIANT_ID);
      var totalEur = totalCents / 100;

      if (totalEur <= 0) {
        // Sepet boş, surcharge olmamalı
        if (surcharge.length === 0) return Promise.resolve();
        return removeSurchargeLines(surcharge);
      }

      // 1 adet surcharge var → API'ye son tutarı bildir, git
      if (surcharge.length === 1 && surcharge[0].quantity === 1) {
        return updateSurchargePrice(totalEur);
      }

      // Surcharge eksik veya fazla → düzelt ve bir kez daha kontrol et
      return updateSurchargePrice(totalEur)
        .then(function () { return removeSurchargeLines(surcharge); })
        .then(function () { return addSurcharge(VARIANT_ID); })
        .then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 500); });
        })
        .then(function () {
          return ensureSurchargePresent(config, attempt + 1);
        });
    });
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

    enqueue(function () {
      return ensureSurchargePresent(config, 0)
        .then(function () {
          window.location.href = href;
        })
        .catch(function (err) {
          console.error("[Surcharge] checkout hata:", err);
          window.location.href = href;
        });
    });
  }, true);

  // ============================================================
  // POLLING — sadece gerçek ürün toplamı değişince çalışır
  // ============================================================
  var _lastRealHash = null;

  function realHash(lines, variantId) {
    return lines
      .filter(function (l) { return String(l.variant_id) !== variantId; })
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
