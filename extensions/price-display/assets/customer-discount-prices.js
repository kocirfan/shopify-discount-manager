/**
 * Customer Discount Price Display
 * Müşteri giriş yaptığında tüm fiyatları indirimli gösterir
 */
(function() {
  'use strict';

  const CONFIG = {
    // App Proxy URL - Shopify store'dan çağrılacak
    // /apps/discount-manager/* -> https://shopify-discount-manager.vercel.app/*
    apiUrl: '/apps/discount-manager/api/customer-discount',
    // Fiyat elementlerini bulmak için seçiciler
    priceSelectors: [
      '.price',
      '.product-price',
      '.price__regular',
      '.price__sale',
      '.price-item',
      '.price-item--regular',
      '.price-item--sale',
      '[data-product-price]',
      '.product__price',
      '.product-single__price',
      '.card__price',
      '.price-list',
      '.money',
      '.product-item__price',
      '.product-card__price',
      '.collection-product__price',
    ],
    // Cache süresi (ms)
    cacheDuration: 5 * 60 * 1000, // 5 dakika
    // CSS class'ları
    classes: {
      processed: 'cdp-processed',
      wrapper: 'cdp-price-wrapper',
      original: 'cdp-original-price',
      discounted: 'cdp-discounted-price',
      badge: 'cdp-discount-badge',
    }
  };

  // Müşteri indirim bilgisini cache'le
  let customerDiscount = null;
  let lastFetch = 0;

  /**
   * Müşteri indirim bilgisini al
   */
  async function fetchCustomerDiscount() {
    const now = Date.now();
    
    // Cache kontrolü
    if (customerDiscount !== null && (now - lastFetch) < CONFIG.cacheDuration) {
      return customerDiscount;
    }

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
   * Para birimini ve fiyatı parse et
   */
  function parsePrice(priceText) {
    if (!priceText) return null;
    
    // Para birimi sembollerini ve formatını tespit et
    const currencyMatch = priceText.match(/([€$£¥₺]|EUR|USD|GBP|TRY)/i);
    const currency = currencyMatch ? currencyMatch[0] : '';
    
    // Sayıyı çıkar (farklı formatları destekle)
    let cleanPrice = priceText.replace(/[^\d.,]/g, '');
    
    // Avrupa formatı (1.234,56) vs US formatı (1,234.56)
    if (cleanPrice.includes(',') && cleanPrice.includes('.')) {
      // Hangisi son? O ondalık ayırıcı
      const lastComma = cleanPrice.lastIndexOf(',');
      const lastDot = cleanPrice.lastIndexOf('.');
      
      if (lastComma > lastDot) {
        // Avrupa formatı: 1.234,56
        cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
      } else {
        // US formatı: 1,234.56
        cleanPrice = cleanPrice.replace(/,/g, '');
      }
    } else if (cleanPrice.includes(',')) {
      // Sadece virgül var - ondalık mı binlik mi?
      const parts = cleanPrice.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Ondalık ayırıcı (Avrupa)
        cleanPrice = cleanPrice.replace(',', '.');
      } else {
        // Binlik ayırıcı
        cleanPrice = cleanPrice.replace(/,/g, '');
      }
    }
    
    const numericPrice = parseFloat(cleanPrice);
    
    if (isNaN(numericPrice)) return null;
    
    // Orijinal formatı koru
    const isEuroFormat = priceText.includes(',') && 
      (priceText.lastIndexOf(',') > priceText.lastIndexOf('.') || !priceText.includes('.'));
    
    return {
      value: numericPrice,
      currency: currency,
      isEuroFormat: isEuroFormat,
      original: priceText.trim()
    };
  }

  /**
   * Fiyatı formatla
   */
  function formatPrice(value, currency, isEuroFormat) {
    let formatted;

    if (isEuroFormat) {
      formatted = value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return currency.includes('€') || currency === 'EUR'
        ? `€${formatted}`
        : `${formatted} ${currency}`;
    } else {
      formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${currency}${formatted}`;
    }
  }

  /**
   * Fiyat elementini güncelle
   */
  function updatePriceElement(element, discount) {
    if (element.classList.contains(CONFIG.classes.processed)) return;
    if (discount.discountPercentage <= 0) return;

    const priceText = element.textContent;
    const parsed = parsePrice(priceText);

    if (!parsed || parsed.value <= 0) return;

    const discountedValue = parsed.value * (1 - discount.discountPercentage / 100);
    const discountedFormatted = formatPrice(discountedValue, parsed.currency, parsed.isEuroFormat);

    // Elementi güncelle
    element.classList.add(CONFIG.classes.processed);

    const wrapper = document.createElement('span');
    wrapper.className = CONFIG.classes.wrapper;

    // Orijinal fiyat (üstü çizili)
    const originalSpan = document.createElement('span');
    originalSpan.className = CONFIG.classes.original;
    originalSpan.textContent = parsed.original;

    // İndirimli fiyat
    const discountedSpan = document.createElement('span');
    discountedSpan.className = CONFIG.classes.discounted;
    discountedSpan.textContent = discountedFormatted;

    // Badge
    const badge = document.createElement('span');
    badge.className = CONFIG.classes.badge;
    badge.textContent = `-${discount.discountPercentage}%`;

    wrapper.appendChild(discountedSpan);
    wrapper.appendChild(originalSpan);
    wrapper.appendChild(badge);

    element.textContent = '';
    element.appendChild(wrapper);
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

    const selector = CONFIG.priceSelectors.join(', ');
    const priceElements = document.querySelectorAll(selector);

    priceElements.forEach(el => updatePriceElement(el, discount));

    console.log('[CDP]', priceElements.length, 'fiyat elementi bulundu');
  }

  /**
   * MutationObserver ile dinamik içerikleri izle
   */
  function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              const selector = CONFIG.priceSelectors.join(', ');
              if (node.matches && (node.matches(selector) || node.querySelector(selector))) {
                shouldUpdate = true;
              }
            }
          });
        }
      });

      if (shouldUpdate) {
        setTimeout(updateAllPrices, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * CSS stillerini ekle
   */
  function addStyles() {
    const styles = `
      .${CONFIG.classes.wrapper} {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .${CONFIG.classes.original} {
        text-decoration: line-through;
        opacity: 0.6;
        font-size: 0.9em;
      }
      .${CONFIG.classes.discounted} {
        color: var(--cdp-discounted-color, #e53935);
        font-weight: bold;
      }
      .${CONFIG.classes.badge} {
        background: var(--cdp-badge-color, #e53935);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75em;
        font-weight: bold;
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Başlat
  function init() {
    console.log('[CDP] Customer Discount Price Display başlatılıyor...');
    addStyles();
    updateAllPrices();
    observeDOMChanges();
  }

  // DOM hazır olduğunda başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

