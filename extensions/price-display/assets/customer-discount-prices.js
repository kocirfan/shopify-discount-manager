/**
 * Customer Discount Price Display
 * Müşteri giriş yaptığında tüm fiyatları indirimli gösterir
 */
(function() {
  'use strict';

  const CONFIG = {
    apiUrl: '/apps/discount-manager/api/customer-discount',
    cacheDuration: 5 * 60 * 1000,
    processedAttr: 'data-cdp-processed',
    // İşlenen elementin bizim yazdığımız çıktısı burada saklanır.
    // Tema (örn. varyant değişiminde) içeriği yeniden yazarsa eşleşme bozulur
    // ve elementi tekrar işleriz.
    outputAttr: 'data-cdp-output'
  };

  // Fiyat elementlerinin tek kaynağı - hem ilk yükleme hem observer bunu kullanır
  const PRICE_SELECTORS = [
    '.price-item--regular',
    '.price-item--sale',
    '.big-price',
    '.price-wrapper',
    '.money'
  ];

  // characterData da izleniyor: bazı temalar varyant değişiminde elementi
  // değiştirmeden sadece içindeki text node'u günceller.
  const OBSERVER_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true
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
    // Metinde birden fazla fiyat olabilir (örn. "€190,00 (€229,90 incl. btw)" veya
    // bizim yazdığımız "yeni fiyat + üstü çizili eski fiyat"). İlkini alıyoruz.
    const match = text.replace(/\s/g, '').match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d+)?/);
    if (!match) return null;
    const cleaned = match[0].replace(/\./g, '').replace(',', '.');
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

  let _nodiscountHandles = null;
  function getNoDiscountHandles() {
    if (_nodiscountHandles !== null) return _nodiscountHandles;
    const dataEl = document.getElementById('customer-discount-data');
    if (!dataEl) { _nodiscountHandles = []; return _nodiscountHandles; }
    try {
      _nodiscountHandles = JSON.parse(dataEl.textContent).nodiscountHandles || [];
    } catch (e) { _nodiscountHandles = []; }
    return _nodiscountHandles;
  }

  function updatePriceElement(element, discountPercent) {
    if (element.hasAttribute(CONFIG.processedAttr)) {
      // Tema içeriği yeniden yazdıysa (varyant değişimi vb.) damgayı temizleyip
      // yeni fiyatı işleyelim; aksi halde eski indirimli fiyat ekranda kalır.
      if (element.innerHTML === element.getAttribute(CONFIG.outputAttr)) {
        log('Element zaten işlenmiş, atlanıyor:', element);
        return;
      }
      log('İçerik tema tarafından değiştirilmiş, yeniden işleniyor:', element);
      // Kalıntımız (üstü çizili orijinal fiyat) duruyorsa onu kaynak alırız;
      // aksi halde zaten indirimli fiyattan tekrar indirim yapardık.
      const leftover = element.querySelector('s');
      if (leftover) {
        element.textContent = leftover.textContent;
      }
      element.removeAttribute(CONFIG.processedAttr);
      element.removeAttribute(CONFIG.outputAttr);
    }

    // Ürün kartında data-product handle'ı varsa ve nodiscount listesindeyse atla
    const cardWrapper = element.closest('[data-product]');
    if (cardWrapper) {
      const handle = cardWrapper.getAttribute('data-product');
      if (handle && getNoDiscountHandles().includes(handle)) {
        log('nodiscount ürün kartı, atlanıyor:', handle);
        return;
      }
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

    // Yazdığımız çıktıyı sakla - tema bunu değiştirirse yeniden işleyeceğiz
    element.setAttribute(CONFIG.outputAttr, element.innerHTML);
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

    // :not([data-cdp-processed]) filtresi kullanmıyoruz - updatePriceElement zaten
    // işlenmiş elementleri eleyip, tema tarafından değiştirilenleri yeniden işliyor.
    const priceElements = document.querySelectorAll(PRICE_SELECTORS.join(', '));
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
    let scheduled = false;

    const observer = new MutationObserver(() => {
      if (scheduled) return;
      if (isPageProductNoDiscount()) return;
      if (!(customerDiscount?.discountPercentage > 0)) return;

      // Kendi DOM yazımlarımız observer'ı yeniden tetikler. Bir microtask'a
      // toplayıp, yazarken observer'ı durdurarak döngüyü kırıyoruz.
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        observer.disconnect();
        try {
          const elements = document.querySelectorAll(PRICE_SELECTORS.join(', '));
          elements.forEach(el => updatePriceElement(el, customerDiscount.discountPercentage));
        } finally {
          observer.observe(document.body, OBSERVER_OPTIONS);
        }
      });
    });

    observer.observe(document.body, OBSERVER_OPTIONS);
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
    _nodiscountHandles = null; // sayfa yüklendiğinde cache'i sıfırla
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
