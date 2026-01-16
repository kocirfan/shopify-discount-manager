/**
 * Customer Discount Price Display
 * Müşteri giriş yaptığında tüm fiyatları indirimli gösterir
 */
(function() {
  'use strict';

  const CONFIG = {
    apiUrl: '/apps/discount-manager/api/customer-discount',
    // Sadece doğrudan fiyat içeren elementler
    priceSelectors: [
      '.money',
      '[data-product-price]',
      '.price-item--regular .money',
      '.price-item--sale .money',
    ],
    cacheDuration: 5 * 60 * 1000,
    processedAttr: 'data-cdp-processed'
  };

  let customerDiscount = null;
  let lastFetch = 0;

  /**
   * Müşteri indirim bilgisini al
   */
  async function fetchCustomerDiscount() {
    const now = Date.now();
    if (customerDiscount !== null && (now - lastFetch) < CONFIG.cacheDuration) {
      return customerDiscount;
    }

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      customerDiscount = data;
      lastFetch = now;
      console.log('[CDP] Müşteri indirimi:', data);
      return data;
    } catch (error) {
      console.error('[CDP] İndirim bilgisi alınamadı:', error);
      return { discountPercentage: 0 };
    }
  }

  /**
   * Fiyat metninden sayısal değer çıkar (€204,00 -> 204.00)
   */
  function extractPrice(text) {
    if (!text) return null;

    // Sadece rakamları ve virgülü al (€204,00 -> "204,00")
    const match = text.match(/(\d+),(\d{2})/);
    if (match) {
      return parseFloat(match[1] + '.' + match[2]);
    }
    return null;
  }

  /**
   * Fiyatı Euro formatında göster (183.60 -> €183,60)
   */
  function formatEuroPrice(value) {
    const fixed = value.toFixed(2); // "183.60"
    const parts = fixed.split('.'); // ["183", "60"]

    // Binlik ayırıcı ekle (1234 -> 1.234)
    let whole = parts[0];
    if (whole.length > 3) {
      whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    return '€' + whole + ',' + parts[1];
  }

  /**
   * Fiyat elementini güncelle
   */
  function updatePriceElement(element, discountPercent) {
    if (element.hasAttribute(CONFIG.processedAttr)) return;

    const text = element.textContent.trim();
    const price = extractPrice(text);

    if (!price || price <= 0) return;

    const discountedPrice = price * (1 - discountPercent / 100);
    const newPrice = formatEuroPrice(discountedPrice);
    const oldPrice = formatEuroPrice(price);

    // Element'i işaretle
    element.setAttribute(CONFIG.processedAttr, 'true');

    // Sadece fiyatı değiştir: yeni fiyat (kırmızı) + eski fiyat (üstü çizili)
    element.innerHTML = `<span style="color:#e53935;font-weight:bold">${newPrice}</span> <s style="opacity:0.6">${oldPrice}</s>`;
  }

  /**
   * Tüm fiyatları güncelle
   */
  async function updateAllPrices() {
    const discount = await fetchCustomerDiscount();

    if (!discount || discount.discountPercentage <= 0) {
      console.log('[CDP] İndirim yok veya müşteri giriş yapmamış');
      return;
    }

    console.log('[CDP] Fiyatlar güncelleniyor...', discount.discountPercentage + '%');

    // Fiyat elementlerini bul - theme'e özel selector'lar
    const selectors = [
      '.price-item--regular',
      '.price-item--sale',
      '.big-price',
      '.price-wrapper',
      '.money',
    ].map(s => `${s}:not([data-cdp-processed])`).join(', ');

    const priceElements = document.querySelectorAll(selectors);

    priceElements.forEach(el => updatePriceElement(el, discount.discountPercentage));

    console.log('[CDP]', priceElements.length, 'fiyat elementi güncellendi');
  }

  /**
   * MutationObserver ile dinamik içerikleri izle
   */
  function observeDOMChanges() {
    const observer = new MutationObserver(() => {
      const unprocessed = document.querySelectorAll('.money:not([data-cdp-processed])');
      if (unprocessed.length > 0 && customerDiscount?.discountPercentage > 0) {
        unprocessed.forEach(el => updatePriceElement(el, customerDiscount.discountPercentage));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * CSS stillerini ekle
   */
  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      [data-cdp-processed] {
        display: inline-flex !important;
        align-items: center;
        flex-wrap: wrap;
      }
    `;
    document.head.appendChild(style);
  }

  // Başlat
  function init() {
    console.log('[CDP] Customer Discount Price Display başlatılıyor...');
    addStyles();
    updateAllPrices();
    observeDOMChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

