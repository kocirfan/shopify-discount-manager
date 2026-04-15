/**
 * Surcharge Cart Manager
 * 1. Sepet toplamını backend'e gönderir → variant base price güncellenir (sepet sayfasında doğru görünsün)
 * 2. Surcharge ürününü sepete ekler / fiyatı değişince günceller
 * 3. Sync tamamlanana kadar checkout butonları bloklanır
 *
 * NOT: Cart Transform function checkout'ta fiyatı ayrıca override eder.
 * Buradaki backend çağrısı sepet sayfasındaki gösterim içindir.
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

  async function updateSurchargePrice(cartTotalEur) {
    const shop = window.Shopify && window.Shopify.shop;
    const res = await fetch(
      `/apps/discount-manager/api/surcharge-price?shop=${encodeURIComponent(shop || "")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartTotal: cartTotalEur }),
      }
    );
    if (!res.ok) throw new Error("surcharge-price endpoint error: " + res.status);
    return res.json();
  }

  // ============================================================
  // CHECKOUT BLOCKER
  // ============================================================
  const CHECKOUT_SELECTORS = [
    'a[href="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button[data-checkout-button]',
    '[data-testid="checkout-button"]',
  ].join(", ");

  function blockCheckout() {
    document.querySelectorAll(CHECKOUT_SELECTORS).forEach((el) => {
      el.setAttribute("data-surcharge-blocked", "true");
      el.setAttribute("disabled", "true");
      el.style.opacity = "0.6";
      el.style.pointerEvents = "none";
      el.style.cursor = "wait";
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
  }

  document.addEventListener("click", function (e) {
    const anchor = e.target.closest('a[href="/checkout"]');
    if (!anchor) return;
    if (!_busy && !_pending) return;
    e.preventDefault();
    waitForSync().then(() => { window.location.href = "/checkout"; });
  }, true);

  function waitForSync() {
    return new Promise((resolve) => {
      if (!_busy && !_pending) return resolve();
      const interval = setInterval(() => {
        if (!_busy && !_pending) { clearInterval(interval); resolve(); }
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
    console.log("[Surcharge] sync başladı");

    try {
      const cart = await getCart();
      const lines = cart.items || [];
      const VARIANT_ID = String(config.variantId);

      const surchargeLine = lines.find((l) => String(l.variant_id) === VARIANT_ID);
      const realLines = lines.filter((l) => String(l.variant_id) !== VARIANT_ID);
      const totalCents = realLines.reduce((sum, l) => sum + l.line_price, 0);
      const totalEur = totalCents / 100;

      // Sepet boşsa surcharge'ı kaldır
      if (totalEur <= 0) {
        if (surchargeLine) await removeLine(surchargeLine.key);
        return;
      }

      // Beklenen fiyatı client'ta hesapla (backend ile aynı formül)
      const expectedCents = Math.round(totalEur * config.percentage / 100 * 100);

      // Surcharge zaten sepette ve fiyat doğruysa — sadece backend'i güncelle (sepet gösterimi için),
      // ürünü tekrar ekleme/kaldırma
      if (surchargeLine && surchargeLine.price === expectedCents && surchargeLine.quantity === 1) {
        console.log("[Surcharge] fiyat doğru, değişiklik yok");
        // Yine de backend'i sessizce güncelle (bir sonraki yükleme için)
        updateSurchargePrice(totalEur).catch(() => {});
        return;
      }

      // Fiyat değişmiş ya da surcharge yok:
      // 1. Backend'e gönder — variant base price'ını güncelle
      const result = await updateSurchargePrice(totalEur);
      if (!result.price) {
        console.error("[Surcharge] backend fiyat döndürmedi");
        return;
      }

      // 2. Varsa kaldır
      if (surchargeLine) await removeLine(surchargeLine.key);

      // 3. Güncel base price ile ekle (bekleme yok — backend zaten güncelledi)
      await addItem(VARIANT_ID);
      console.log("[Surcharge] güncellendi:", result.price);

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

  console.log("[Surcharge] script yüklendi");
  sync();

  document.addEventListener("cart:updated", sync);
  document.addEventListener("cart:refresh", sync);

  const _origFetch = window.fetch;
  window.fetch = async function (...args) {
    const result = await _origFetch.apply(this, args);
    if (_busy) return result;
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (
      (url.includes("/cart/add") || url.includes("/cart/change") || url.includes("/cart/update")) &&
      !url.includes("/apps/")
    ) {
      setTimeout(sync, 400);
    }
    return result;
  };

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
