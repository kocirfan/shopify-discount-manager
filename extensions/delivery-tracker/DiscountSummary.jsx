import {
  extension,
  InlineLayout,
  Text,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.payment-method-list.render-before',
  (root, { cost, deliveryGroups }) => {
    //console.log('[DISCOUNT SUMMARY] ✅ Extension initialized');

    const container = root.createComponent(InlineLayout, {
      spacing: 'base',
      blockAlignment: 'center',
      columns: ['fill', 'auto'],
      padding: ['base', 'none'],
    });

    const discountLabel = root.createComponent(Text, {
      size: 'small',
      appearance: 'subdued',
    }, '💰 Pickup korting (2%)');

    const discountAmount = root.createComponent(Text, {
      size: 'small',
      appearance: 'success',
      emphasis: 'bold',
    });

    container.appendChild(discountLabel);
    container.appendChild(discountAmount);

    // İlk state
    let isPickup = false;
    let currentTotal = 0;

    // Delivery type değişimini izle
    deliveryGroups.subscribe((groups) => {
      if (!groups || groups.length === 0) {
        isPickup = false;
        updateUI();
        return;
      }

      const firstGroup = groups[0];
      const selected = firstGroup?.selectedDeliveryOption;

      if (!selected) {
        isPickup = false;
        updateUI();
        return;
      }

      const deliveryOptions = firstGroup?.deliveryOptions || [];
      const fullOption = deliveryOptions.find(opt => opt.handle === selected.handle);

      if (!fullOption) {
        isPickup = false;
        updateUI();
        return;
      }

      const title = fullOption.title?.toLowerCase() || '';
      const handle = fullOption.handle?.toLowerCase() || '';
      const type = fullOption.type?.toLowerCase() || '';

      let deliveryType;
      if (type) {
        deliveryType = type;
      } else {
        const isPickupDetected = title.includes('pickup') || handle.includes('pickup') ||
                                  title.includes('terheijdenseweg') || handle.includes('terheijdenseweg');
        deliveryType = isPickupDetected ? 'pickup' : 'shipping';
      }

      isPickup = deliveryType === 'pickup';
      updateUI();
    });

    // Total değişimini izle
    cost.subscribe((costData) => {
      if (costData?.totalAmount?.amount) {
        currentTotal = parseFloat(costData.totalAmount.amount);
        updateUI();
      }
    });

    function updateUI() {
      if (isPickup && currentTotal > 0) {
        // Pickup indirimi hesapla (toplam üzerinden %2)
        // Not: Cart Transform zaten fiyatları düşürdü, bu sadece bilgilendirme
        const discountValue = currentTotal * 0.02;

        discountAmount.replaceChildren(`-€ ${discountValue.toFixed(2)}`);

        if (!container.parent) {
          root.appendChild(container);
        }

        //console.log('[DISCOUNT SUMMARY] 💰 Showing pickup discount:', discountValue.toFixed(2));
      } else {
        if (container.parent) {
          root.removeChild(container);
        }
      }
    }

    // İlk render
    updateUI();
  }
);
