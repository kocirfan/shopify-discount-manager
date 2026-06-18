/**
 * Customer Discount Price Display
 * Müşteri giriş yaptığında tüm fiyatları indirimli gösterir
 */
(function() {
  'use strict';

  const CONFIG = {
    apiUrl: '/apps/discount-manager/api/customer-discount',
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

  function log(...args) {
    //console.log('[CDP]', ...args);
  }

  function logError(...args) {
   // console.error('[CDP]', ...args);
  }

  async function fetchCustomerDiscount() {
    const now = Date.now();
    if (customerDiscount !== null && (now - lastFetch) < CONFIG.cacheDuration) {
      log('Cache\'den döndürülüyor:', customerDiscount);
      return customerDiscount;
    }

    log('API isteği gönderiliyor:', CONFIG.apiUrl);

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });

      log('API yanıtı - status:', response.status, response.statusText);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      log('API yanıtı - data:', data);

      customerDiscount = data;
      lastFetch = now;
      return data;
    } catch (error) {
      logError('İndirim bilgisi alınamadı:', error);
      return { discountPercentage: 0 };
    }
  }

  function extractPrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return (!isNaN(value) && value > 0) ? value : null;
  }

  function formatEuroPrice(value) {
    const fixed = value.toFixed(2);
    const parts = fixed.split('.');
    let whole = parts[0];
    if (whole.length > 3) {
      whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    return '€' + whole + ',' + parts[1];
  }

  function updatePriceElement(element, discountPercent) {
    if (element.hasAttribute(CONFIG.processedAttr)) {
      log('Element zaten işlenmiş, atlanıyor:', element);
      return;
    }

    const text = element.textContent.trim();
    const price = extractPrice(text);

    if (!price || price <= 0) {
      log('Geçerli fiyat bulunamadı, atlanıyor. text:', JSON.stringify(text), '| parsed:', price);
      return;
    }

    const discountAmount = Math.floor(price * discountPercent) / 100;
    const discountedPrice = price - discountAmount;
    const newPrice = formatEuroPrice(discountedPrice);
    const oldPrice = formatEuroPrice(price);

    log(`Fiyat güncellendi: ${oldPrice} → ${newPrice} (%${discountPercent})`, element);

    element.setAttribute(CONFIG.processedAttr, 'true');

    if (element.classList.contains('big-price') || element.classList.contains('price-wrapper')) {
      element.innerHTML = `<span class="my-custom-big-price" style="color:#02437d;font-weight:bold;font-size:40px">${newPrice}</span> <s style="opacity:0.6;color:#000!important;padding-left:10px;font-size:20px">${oldPrice}</s>`;
    } else {
      element.innerHTML = `<span style="color:#02437d;font-weight:bold">${newPrice}</span> <s style="opacity:0.6;color:#000!important;padding-left:10px">${oldPrice}</s>`;
    }
  }

  async function updateAllPrices() {
    log('updateAllPrices() başladı');

    // Sayfadaki ürünün nodiscount tag'i varsa fiyat güncelleme
    const dataEl = document.getElementById('customer-discount-data');
    if (dataEl) {
      try {
        const pageData = JSON.parse(dataEl.textContent);
        if (pageData.pageProductHasNoDiscount) {
          log('Bu ürün nodiscount tag\'ine sahip, fiyat güncellenmeyecek.');
          return;
        }
      } catch (e) {}
    }

    const discount = await fetchCustomerDiscount();

    if (!discount || discount.discountPercentage <= 0) {
      log('İndirim yok veya müşteri giriş yapmamış. discountPercentage:', discount?.discountPercentage);
      return;
    }

    log('İndirim uygulanıyor:', discount.discountPercentage + '%');

    const selectors = [
      '.price-item--regular',
      '.price-item--sale',
      '.big-price',
      '.price-wrapper',
      '.money',
    ].map(s => `${s}:not([data-cdp-processed])`).join(', ');

    const priceElements = document.querySelectorAll(selectors);
    log('Bulunan fiyat elementleri:', priceElements.length, 'adet');

    priceElements.forEach(el => updatePriceElement(el, discount.discountPercentage));

    log('updateAllPrices() tamamlandı. Güncellenen:', document.querySelectorAll('[data-cdp-processed]').length, 'element');
  }

  function isPageProductNoDiscount() {
    const dataEl = document.getElementById('customer-discount-data');
    if (!dataEl) return false;
    try {
      return JSON.parse(dataEl.textContent).pageProductHasNoDiscount === true;
    } catch (e) {
      return false;
    }
  }

  function observeDOMChanges() {
    const observer = new MutationObserver(() => {
      if (isPageProductNoDiscount()) return;
      const unprocessed = document.querySelectorAll('.money:not([data-cdp-processed])');
      if (unprocessed.length > 0 && customerDiscount?.discountPercentage > 0) {
        log('MutationObserver: yeni', unprocessed.length, 'element bulundu, güncelleniyor...');
        unprocessed.forEach(el => updatePriceElement(el, customerDiscount.discountPercentage));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('MutationObserver başlatıldı');
  }

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

  function init() {
    log('Customer Discount Price Display başlatılıyor... readyState:', document.readyState);
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
