import { extension } from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.block.render',
  (root, { deliveryGroups, applyAttributeChange }) => {
    console.log('[DELIVERY TRACKER] ✅ Extension initialized');

    let lastDeliveryType = null;

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

      // Değişiklik varsa cart attribute'u güncelle
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
        } catch (error) {
          console.error('[DELIVERY TRACKER] ❌ Error updating attribute:', error);
        }
      }
    });

    // UI render etme - boş view döndür (görünmez)
    root.appendChild(root.createComponent('View', {}, []));
  }
);
