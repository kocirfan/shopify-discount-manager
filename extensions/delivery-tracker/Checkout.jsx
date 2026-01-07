import {
  extension,
  BlockStack,
  Text,
  DatePicker,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.block.render',
  (root, { deliveryGroups, applyAttributeChange, applyDiscountCodeChange }) => {
    console.log('[DELIVERY TRACKER] ✅ Extension initialized');

    let lastDeliveryType = null;
    let selectedDate = null;
    let isInitialized = false;

    // UI container
    const container = root.createComponent(BlockStack, { spacing: 'base' });
    root.appendChild(container);

    // Tarih picker (başlangıçta gizli)
    let datePickerWrapper = null;

    // İlk yüklemede cart attribute'ları temizle
    // (Sepetten geldiğinde eski değerler kalmasın diye)
    applyAttributeChange({
      type: 'updateAttribute',
      key: '_selected_delivery_type',
      value: ''
    }).then(() => {
      console.log('[DELIVERY TRACKER] 🧹 Initial cleanup: cart attributes cleared');
    }).catch(err => {
      console.error('[DELIVERY TRACKER] ❌ Error in initial cleanup:', err);
    });

    // Delivery seçimini izle
    deliveryGroups.subscribe(async (groups) => {
      console.log('[DELIVERY TRACKER] 📦 Delivery groups changed:', groups?.length || 0);

      if (!groups || groups.length === 0) {
        console.log('[DELIVERY TRACKER] ⚠️ No delivery groups');

        // Delivery groups boşsa, attribute'u temizle
        if (lastDeliveryType !== null) {
          console.log('[DELIVERY TRACKER] 🧹 Clearing cart attribute');
          try {
            await applyAttributeChange({
              type: 'updateAttribute',
              key: '_selected_delivery_type',
              value: ''
            });
            lastDeliveryType = null;
            console.log('[DELIVERY TRACKER] ✅ Cart attribute cleared');
          } catch (error) {
            console.error('[DELIVERY TRACKER] ❌ Error clearing attribute:', error);
          }
        }
        return;
      }

      // İlk delivery group'u al
      const firstGroup = groups[0];
      const selected = firstGroup?.selectedDeliveryOption;

      if (!selected) {
        console.log('[DELIVERY TRACKER] ⚠️ No selected delivery option');
        return;
      }

      // deliveryOptions içinden handle'a göre tam bilgiyi bul
      const deliveryOptions = firstGroup?.deliveryOptions || [];
      console.log('[DELIVERY TRACKER] 🔍 Available delivery options:', deliveryOptions.length);

      const fullOption = deliveryOptions.find(opt => opt.handle === selected.handle);

      if (!fullOption) {
        console.log('[DELIVERY TRACKER] ⚠️ Could not find full delivery option for handle:', selected.handle);
        return;
      }

      console.log('[DELIVERY TRACKER] 🔍 Full option:', JSON.stringify(fullOption, null, 2));

      // Title'dan delivery type'ı çıkar
      const title = fullOption.title?.toLowerCase() || '';
      const handle = fullOption.handle?.toLowerCase() || '';
      const type = fullOption.type?.toLowerCase() || '';

      // Type field'ı varsa kullan, yoksa title'dan çıkar
      let deliveryType;
      if (type) {
        deliveryType = type;
      } else {
        const isPickup = title.includes('pickup') || handle.includes('pickup') || title.includes('terheijdenseweg') || handle.includes('terheijdenseweg');
        deliveryType = isPickup ? 'pickup' : 'shipping';
      }

      console.log('[DELIVERY TRACKER] 🔍 Title:', title, '| Type field:', type, '| Detected type:', deliveryType);

      // Değişiklik varsa cart attribute'u güncelle ve discount code ekle/kaldır
      if (deliveryType && deliveryType !== lastDeliveryType) {
        console.log('[DELIVERY TRACKER] 📝 Updating cart attribute to:', deliveryType);

        try {
          await applyAttributeChange({
            type: 'updateAttribute',
            key: '_selected_delivery_type',
            value: deliveryType
          });
          lastDeliveryType = deliveryType;
          console.log('[DELIVERY TRACKER] ✅ Cart attribute updated successfully');

          // Pickup seçildiyse discount code ekle, değilse kaldır
          if (deliveryType === 'pickup') {
            console.log('[DELIVERY TRACKER] 💰 Adding pickup discount code');
            await applyDiscountCodeChange({
              type: 'addDiscountCode',
              code: 'PICKUP20'
            });
            console.log('[DELIVERY TRACKER] ✅ Discount code added');
          } else {
            console.log('[DELIVERY TRACKER] 💰 Removing pickup discount code');
            await applyDiscountCodeChange({
              type: 'removeDiscountCode',
              code: 'PICKUP20'
            });
            console.log('[DELIVERY TRACKER] ✅ Discount code removed');
          }
        } catch (error) {
          console.error('[DELIVERY TRACKER] ❌ Error updating attribute or discount:', error);
        }
      }

      // UI'ı güncelle (pickup seçiliyse tarih picker göster)
      updateUI(deliveryType);
    });

    // UI güncelleme fonksiyonu
    function updateUI(deliveryType) {
      // Container'ı temizle
      container.replaceChildren();

      if (deliveryType === 'pickup') {
        // Pickup seçiliyse tarih picker göster
        const heading = root.createComponent(Text, {
          size: 'base',
          emphasis: 'bold'
        }, 'Afhaaldatum');

        const description = root.createComponent(Text, {
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
            console.log('[DELIVERY TRACKER] 📅 Date selected:', date);

            // Tarihi cart attribute'a kaydet
            try {
              await applyAttributeChange({
                type: 'updateAttribute',
                key: 'pickup_delivery_date',
                value: date
              });
              console.log('[DELIVERY TRACKER] ✅ Pickup date saved to cart');
            } catch (error) {
              console.error('[DELIVERY TRACKER] ❌ Error saving pickup date:', error);
            }
          }
        });

        container.appendChild(heading);
        container.appendChild(description);
        container.appendChild(datePicker);

        console.log('[DELIVERY TRACKER] 🗓️ Date picker shown');
      } else {
        // Pickup değilse, tarihi temizle
        if (selectedDate) {
          selectedDate = null;
          applyAttributeChange({
            type: 'updateAttribute',
            key: 'pickup_delivery_date',
            value: ''
          }).catch(err => {
            console.error('[DELIVERY TRACKER] ❌ Error clearing pickup date:', err);
          });
        }
        console.log('[DELIVERY TRACKER] 🗓️ Date picker hidden');
      }
    }

    // İlk render
    updateUI(null);
  }
);
