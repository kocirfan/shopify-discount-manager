import {
  extension,
  BlockStack,
  Text,
  DatePicker,
  Banner,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.block.render',
  (root, { deliveryGroups, applyAttributeChange }) => {
    // ============================================================
    // TESLİMAT TİPİ TAKİP EXTENSION'I
    // Bu extension, checkout'ta teslimat yöntemi değişikliklerini izler
    // ve cart attribute'unu ANLIK olarak günceller.
    // ============================================================
    //console.log('[DELIVERY TRACKER] ✅ Extension başlatıldı');

    let lastDeliveryType = null;
    let selectedDate = null;
    let isUpdating = false; // Concurrent update koruması

    // UI container
    const container = root.createComponent(BlockStack, { spacing: 'base' });
    root.appendChild(container);

    // ============================================================
    // KURAL 5: CHECKOUT GÜNCELLİĞİ
    // Checkout yüklendiğinde cart attribute'ları temizle.
    // Bu, eski teslimat seçimine ait indirimlerin kalmasını engeller.
    // ============================================================
    applyAttributeChange({
      type: 'updateAttribute',
      key: 'selected_delivery_type',
      value: ''
    }).then(() => {
      //console.log('[DELIVERY TRACKER] 🧹 Başlangıç temizliği: cart attribute sıfırlandı');
    }).catch(err => {
      //console.error('[DELIVERY TRACKER] ❌ Temizlik hatası:', err);
    });

    // ============================================================
    // TESLİMAT SEÇİMİ İZLEYİCİSİ
    // Delivery groups değiştiğinde ANLIK olarak attribute güncelle.
    // ============================================================
    deliveryGroups.subscribe(async (groups) => {
      //console.log('[DELIVERY TRACKER] 📦 Teslimat grupları değişti:', groups?.length || 0);

      // Concurrent update koruması
      if (isUpdating) {
        //console.log('[DELIVERY TRACKER] ⏳ Güncelleme devam ediyor, bekleniyor...');
        return;
      }

      // ============================================================
      // KURAL 5: TESLİMAT YÖNTEMİ YOKSA ATTRIBUTE TEMİZLE
      // Bu, pickup indirimi için kritik - seçim yoksa indirim yok.
      // ============================================================
      if (!groups || groups.length === 0) {
        //console.log('[DELIVERY TRACKER] ⚠️ Teslimat grubu yok');

        if (lastDeliveryType !== null) {
          //console.log('[DELIVERY TRACKER] 🧹 Cart attribute temizleniyor');
          isUpdating = true;
          try {
            await applyAttributeChange({
              type: 'updateAttribute',
              key: 'selected_delivery_type',
              value: ''
            });
            lastDeliveryType = null;
            //console.log('[DELIVERY TRACKER] ✅ Attribute temizlendi - pickup indirimi KALDIRILDI');
          } catch (error) {
            //console.error('[DELIVERY TRACKER] ❌ Temizleme hatası:', error);
          } finally {
            isUpdating = false;
          }
        }
        return;
      }

      // İlk delivery group'u al
      const firstGroup = groups[0];
      const selected = firstGroup?.selectedDeliveryOption;

      if (!selected) {
        //console.log('[DELIVERY TRACKER] ⚠️ Seçili teslimat seçeneği yok');
        return;
      }

      // deliveryOptions içinden handle'a göre tam bilgiyi bul
      const deliveryOptions = firstGroup?.deliveryOptions || [];
      //console.log('[DELIVERY TRACKER] 🔍 Mevcut teslimat seçenekleri:', deliveryOptions.length);

      const fullOption = deliveryOptions.find(opt => opt.handle === selected.handle);

      if (!fullOption) {
        //console.log('[DELIVERY TRACKER] ⚠️ Handle için seçenek bulunamadı:', selected.handle);
        return;
      }

      //console.log('[DELIVERY TRACKER] 🔍 Seçilen seçenek:', JSON.stringify(fullOption, null, 2));

      // Title'dan delivery type'ı çıkar
      const title = fullOption.title?.toLowerCase() || '';
      const handle = fullOption.handle?.toLowerCase() || '';
      const type = fullOption.type?.toLowerCase() || '';
      const carrierServiceHandle = fullOption.carrierServiceHandle?.toLowerCase() || '';

      // ============================================================
      // TESLİMAT TİPİ TESPİTİ - GÜNCELLENMİŞ
      // 1. type field "pickup" veya "local" ise -> pickup
      // 2. type field "shipping" ise -> shipping
      // 3. type field yoksa title/handle'dan tespit et
      // ============================================================
      let deliveryType;

      // Öncelik 1: Shopify type field'ı
      if (type === 'pickup' || type === 'local' || type === 'pickUp' || type === 'localPickup') {
        deliveryType = 'pickup';
      } else if (type === 'shipping' || type === 'delivery') {
        deliveryType = 'shipping';
      } else {
        // Öncelik 2: Title/Handle parsing
        const isPickup = title.includes('pickup') ||
                         handle.includes('pickup') ||
                         title.includes('afhalen') ||
                         handle.includes('afhalen') ||
                         title.includes('local pickup') ||
                         title.includes('store pickup') ||
                         title.includes('mağazadan') ||
                         title.includes('markham') ||
                         carrierServiceHandle.includes('pickup') ||
                         carrierServiceHandle.includes('local');

        // SHIPPING kelimeleri varsa kesinlikle shipping
        const isShipping = title.includes('shipping') ||
                           title.includes('delivery') ||
                           title.includes('standard') ||
                           title.includes('express') ||
                           title.includes('fedex') ||
                           title.includes('ups') ||
                           title.includes('canada post') ||
                           title.includes('purolator') ||
                           carrierServiceHandle.includes('shipping');

        // Shipping kelimeleri varsa shipping, pickup varsa pickup, aksi halde shipping
        if (isShipping && !isPickup) {
          deliveryType = 'shipping';
        } else if (isPickup) {
          deliveryType = 'pickup';
        } else {
          deliveryType = 'shipping'; // Default: shipping
        }
      }

      //console.log('[DELIVERY TRACKER] 🔍 Tespit edilen tip:', deliveryType);
      //console.log('   Title:', title);
      //console.log('   Handle:', handle);
      //console.log('   Type field:', type || '(yok)');
      //console.log('   CarrierServiceHandle:', carrierServiceHandle || '(yok)');

      // ============================================================
      // KURAL 5: CHECKOUT GÜNCELLİĞİ - ANLIK ATTRIBUTE GÜNCELLEMESİ
      // Teslimat yöntemi değiştiğinde DERHAL cart attribute güncelle.
      // Bu, Shopify Functions'ın doğru indirim hesaplaması için kritik.
      // ============================================================
      if (deliveryType && deliveryType !== lastDeliveryType) {
        //console.log('[DELIVERY TRACKER] 🔄 TESLİMAT DEĞİŞİKLİĞİ TESPİT EDİLDİ');
        //console.log('   Önceki:', lastDeliveryType || 'yok');
        //console.log('   Yeni:', deliveryType);

        isUpdating = true;
        try {
          // Cart attribute'u ANLIK güncelle
          await applyAttributeChange({
            type: 'updateAttribute',
            key: 'selected_delivery_type',
            value: deliveryType
          });

          const previousType = lastDeliveryType;
          lastDeliveryType = deliveryType;

          // ============================================================
          // KURAL 3: PICKUP'TAN SHIPPING'E GEÇİŞ
          // Pickup seçiminden shipping'e geçildiğinde pickup indirimi
          // ANLIK olarak kaldırılır (attribute güncellenmesiyle otomatik).
          // ============================================================
          if (previousType === 'pickup' && deliveryType === 'shipping') {
            //console.log('[DELIVERY TRACKER] ⚠️ PICKUP -> SHIPPING GEÇİŞİ');
            //console.log('   Pickup indirimi KALDIRILDI');
          } else if (deliveryType === 'pickup') {
            //console.log('[DELIVERY TRACKER] ✅ PICKUP SEÇİLDİ');
            //console.log('   Pickup indirimi UYGULANACAK');
          } else {
            //console.log('[DELIVERY TRACKER] ✅ SHIPPING SEÇİLDİ');
            //console.log('   Sadece müşteri tag indirimi geçerli (varsa)');
          }

          //console.log('[DELIVERY TRACKER] ✅ Cart attribute güncellendi:', deliveryType);
        } catch (error) {
          //console.error('[DELIVERY TRACKER] ❌ Attribute güncelleme hatası:', error);
        } finally {
          isUpdating = false;
        }
      }

      // UI'ı güncelle (pickup seçiliyse tarih picker göster)
      updateUI(deliveryType);
    });

    // ============================================================
    // UI GÜNCELLEME FONKSİYONU
    // Teslimat tipine göre kullanıcı arayüzünü günceller.
    // Pickup seçildiğinde banner ve tarih seçici gösterir.
    // ============================================================
    function updateUI(deliveryType) {
      // Container'ı temizle
      container.replaceChildren();

      if (deliveryType === 'pickup') {
        // ============================================================
        // PICKUP SEÇİLDİĞİNDE UI
        // - İndirim banner'ı göster
        // - Teslim alma tarihi seçici göster
        // ============================================================
        const discountBanner = root.createComponent(Banner, {
          status: 'success',
          title: 'Pickup Korting!'
        });

        const discountText = root.createComponent(BlockStack, { spacing: 'tight' }, [
          root.createComponent(Text, {
            size: 'medium',
            emphasis: 'bold'
          }, '2% extra korting voor afhalen!'),
          root.createComponent(Text, {
            size: 'small',
            appearance: 'subdued'
          }, 'Deze korting wordt automatisch toegepast bij het afrekenen.')
        ]);

        // Tarih seçici başlık ve açıklama
        const dateHeading = root.createComponent(Text, {
          size: 'base',
          emphasis: 'bold'
        }, 'Afhaaldatum');

        const dateDescription = root.createComponent(Text, {
          size: 'small',
          appearance: 'subdued'
        }, 'Selecteer uw gewenste afhaaldatum');

        // Bugünün tarihi (minimum tarih)
        const today = new Date();
        const minDate = today.toISOString().split('T')[0];

        // 30 gün sonrası (maximum tarih)
        const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        const datePicker = root.createComponent(DatePicker, {
          selected: selectedDate || minDate,
          disabled: [],
          disableDatesAfter: maxDate,
          disableDatesBefore: minDate,
          onChange: async (date) => {
            selectedDate = date;
            //console.log('[DELIVERY TRACKER] 📅 Tarih seçildi:', date);

            // Tarihi cart attribute'a kaydet
            try {
              await applyAttributeChange({
                type: 'updateAttribute',
                key: 'pickup_delivery_date',
                value: date
              });
              //console.log('[DELIVERY TRACKER] ✅ Teslim alma tarihi kaydedildi');
            } catch (error) {
              //console.error('[DELIVERY TRACKER] ❌ Tarih kaydetme hatası:', error);
            }
          }
        });

        // Banner ve içerikleri ekle
        container.appendChild(discountBanner);
        container.appendChild(discountText);
        container.appendChild(dateHeading);
        container.appendChild(dateDescription);
        container.appendChild(datePicker);

        //console.log('[DELIVERY TRACKER] 🎉 Pickup UI gösterildi (banner + tarih seçici)');
      } else {
        // ============================================================
        // SHIPPING SEÇİLDİĞİNDE (veya pickup değilse)
        // - Pickup UI'ı gizle
        // - Teslim alma tarihini temizle
        // ============================================================
        if (selectedDate) {
          selectedDate = null;
          applyAttributeChange({
            type: 'updateAttribute',
            key: 'pickup_delivery_date',
            value: ''
          }).catch(err => {
            //console.error('[DELIVERY TRACKER] ❌ Tarih temizleme hatası:', err);
          });
          //console.log('[DELIVERY TRACKER] 🧹 Teslim alma tarihi temizlendi');
        }
        //console.log('[DELIVERY TRACKER] 📦 Shipping modu - pickup UI gizlendi');
      }
    }

    // İlk render - teslimat tipi henüz belirlenmedi
    updateUI(null);
  }
);
