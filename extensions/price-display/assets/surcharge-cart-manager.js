/**
 * Surcharge Cart Manager
 * - Sepet toplamının %X'i kadar surcharge ürününü yönetir
 * - Fiyatı Cart Transform (extra-surcharge) belirler; JS surcharge satırının
 *   sepette (adet 1) olmasını sağlar
 * - Cart Transform Shopify indirimlerini (otomatik indirim / kod) göremediği için
 *   indirim SONRASI satır tutarları (final_line_price) surcharge satırına
 *   `_surcharge_base` line property'si olarak yazılır:
 *     {"<variantId>": [adet, indirimSonrasıSatırToplamı], ...}
 *   Aynı property checkout'ta checkout UI extension tarafından güncel tutulur.
 * - Checkout öncesi doğrulama döngüsü ile yanlış surcharge ile checkout engellenir
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 8000; // 8 saniye
  var SURCHARGE_BASE_KEY = "_surcharge_base";

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

  function addSurcharge(variantId, baseHint) {
    var item = { id: Number(variantId), quantity: 1 };
    if (baseHint) {
      item.properties = {};
      item.properties[SURCHARGE_BASE_KEY] = baseHint;
    }
    return fetchJSON("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [item] }),
    });
  }

  // Mevcut surcharge satırının `_surcharge_base` property'sini günceller
  function updateSurchargeBase(line, baseHint) {
    var properties = {};
    properties[SURCHARGE_BASE_KEY] = baseHint;
    return fetchJSON("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: line.key, quantity: 1, properties: properties }),
    });
  }

  function hasRealItems(lines, variantId) {
    return lines.some(function (l) { return String(l.variant_id) !== variantId; });
  }

  // ============================================================
  // İNDİRİM SONRASI TABAN (Cart Transform için ipucu)
  // final_line_price: satır seviyesi tüm indirimler (otomatik indirim, kod,
  // function indirimleri) düşülmüş tutar, cent cinsinden.
  // ============================================================
  function buildBaseHint(lines, variantId) {
    var perVariant = {};

    lines.forEach(function (l) {
      if (String(l.variant_id) === variantId) return;
      var quantity = Number(l.quantity);
      var finalLinePrice = Number(l.final_line_price);
      if (!isFinite(finalLinePrice) || !(quantity > 0)) return;

      var key = String(l.variant_id);
      var agg = perVariant[key] || { quantity: 0, total: 0 };
      agg.quantity += quantity;
      agg.total += finalLinePrice;
      perVariant[key] = agg;
    });

    var keys = Object.keys(perVariant).sort();
    if (keys.length === 0) return null;

    var out = {};
    keys.forEach(function (key) {
      out[key] = [perVariant[key].quantity, Math.round(perVariant[key].total) / 100];
    });
    return JSON.stringify(out);
  }

  function currentBaseHint(line) {
    var props = line.properties || {};
    var value = props[SURCHARGE_BASE_KEY];
    return value == null ? null : String(value);
  }

  // ============================================================
  // CORE LOGIC
  // Cart Transform fiyatı hallediyor — JS variant'ın sepette olup olmadığını
  // ve `_surcharge_base` ipucunun güncel olmasını yönetir. Idempotent:
  // yapılacak bir şey yoksa hiç istek atmaz.
  // ============================================================
  function applySurcharge(cart, config) {
    var lines = cart.items || [];
    var VARIANT_ID = config.variantId;

    var surchargeLines = lines.filter(function (l) {
      return String(l.variant_id) === VARIANT_ID;
    });

    var hasItems = hasRealItems(lines, VARIANT_ID);

    // Gerçek ürün yoksa surcharge'ı kaldır
    if (!hasItems) {
      if (surchargeLines.length === 0) return Promise.resolve();
      return removeSurchargeLines(surchargeLines);
    }

    var baseHint = buildBaseHint(lines, VARIANT_ID);

    // Tek surcharge, miktar 1 → sadece ipucu güncelliğine bak
    if (surchargeLines.length === 1 && surchargeLines[0].quantity === 1) {
      if (baseHint && currentBaseHint(surchargeLines[0]) !== baseHint) {
        return updateSurchargeBase(surchargeLines[0], baseHint);
      }
      return Promise.resolve();
    }

    // Fazla/eksik satır varsa düzelt
    return removeSurchargeLines(surchargeLines).then(function () {
      return addSurcharge(VARIANT_ID, baseHint);
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
      var hasItems = hasRealItems(lines, VARIANT_ID);

      // Gerçek ürün yoksa surcharge olmamalı
      if (!hasItems) {
        if (surcharge.length === 0) return Promise.resolve();
        return removeSurchargeLines(surcharge).then(function () {
          return verifyAndFix(config, attempt + 1);
        });
      }

      // Tek satır, miktar 1, ipucu güncel → onaylandı (fiyatı Cart Transform halleder)
      if (surcharge.length === 1 && surcharge[0].quantity === 1) {
        var baseHint = buildBaseHint(lines, VARIANT_ID);
        if (!baseHint || currentBaseHint(surcharge[0]) === baseHint) {
          return Promise.resolve();
        }
      }

      // Eksik/fazla/bayat ipucu: düzelt
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
  // applySurcharge idempotent olduğu için her turda çağrılır;
  // sepet zaten doğruysa /cart.js dışında istek atılmaz.
  // ============================================================
  function syncPoll() {
    var config = getConfig();
    if (!config || !config.enabled) return;

    enqueue(function () {
      return getCart().then(function (cart) {
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
