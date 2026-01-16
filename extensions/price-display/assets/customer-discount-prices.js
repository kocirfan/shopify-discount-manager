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
   * Fiyat metninden sayısal değer çıkar (Avrupa formatı: €204,00)
   */
  function extractPrice(text) {
    if (!text) return null;

    // Sadece fiyat kısmını al (€123,45 veya €1.234,56)
    const priceMatch = text.match(/€\s*([\d.]+),(\d{2})/);
    if (priceMatch) {
      // Avrupa formatı: binlik ayırıcı nokta, ondalık virgül
      const wholePart = priceMatch[1].replace(/\./g, '');
      const decimalPart = priceMatch[2];
      return parseFloat(`${wholePart}.${decimalPart}`);
    }

    // US format: $1,234.56
    const usPriceMatch = text.match(/[\$£]\s*([\d,]+)\.(\d{2})/);
    if (usPriceMatch) {
      const wholePart = usPriceMatch[1].replace(/,/g, '');
      const decimalPart = usPriceMatch[2];
      return parseFloat(`${wholePart}.${decimalPart}`);
    }

    return null;
  }

  /**
   * Fiyatı Avrupa formatında göster
   */
  function formatEuroPrice(value) {
    return '€' + value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /**
   * Fiyat elementini güncelle - sadece .money elementlerini hedefle
   */
  function updatePriceElement(element, discountPercent) {
    if (element.hasAttribute(CONFIG.processedAttr)) return;

    const text = element.textContent.trim();
    const price = extractPrice(text);

    if (!price || price <= 0) return;

    const discountedPrice = price * (1 - discountPercent / 100);
    const discountedFormatted = formatEuroPrice(discountedPrice);
    const originalFormatted = formatEuroPrice(price);

    // Element'i işaretle
    element.setAttribute(CONFIG.processedAttr, 'true');

    // Basit HTML: yeni fiyat + eski fiyat üstü çizili
    element.innerHTML = `
      <span style="color: #e53935; font-weight: bold;">${discountedFormatted}</span>
      <span style="text-decoration: line-through; opacity: 0.6; margin-left: 8px; font-size: 0.9em;">${originalFormatted}</span>
    `;
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

    // Sadece .money class'ına sahip elementleri bul
    const priceElements = document.querySelectorAll('.money:not([data-cdp-processed])');

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

