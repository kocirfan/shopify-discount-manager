export function run(input: any) {
  console.error('=== ORDER DISCOUNT START ===');
  console.error('Input:', JSON.stringify(input, null, 2));

  // Default return
  const emptyReturn = {
    discountApplicationStrategy: "FIRST",
    discounts: []
  };

  if (!input.cart?.lines?.length) {
    console.error('❌ No cart lines');
    return emptyReturn;
  }

  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    console.error('❌ No settings in metafield');
    return emptyReturn;
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
    console.error('✅ Settings loaded:', settings.length, 'methods');
  } catch (e) {
    console.error('❌ Parse error');
    return emptyReturn;
  }

  const activeMethods = settings.filter((m: any) => m.enabled);
  if (!activeMethods.length) {
    console.error('❌ No active methods');
    return emptyReturn;
  }

  console.error('✅ Active methods:', activeMethods.map((m: any) => m.name));

  // Önce cart attribute'dan delivery type'ı kontrol et
  const selectedDeliveryType = input.cart?.attribute?.value;
  console.error('🏷️ Cart attribute delivery type:', selectedDeliveryType);

  let matchedMethod = null;

  if (selectedDeliveryType) {
    // Cart attribute varsa, bunu kullan
    console.error('✅ Using cart attribute for delivery detection');

    for (const method of activeMethods) {
      if (method.type === selectedDeliveryType) {
        matchedMethod = method;
        console.error('✅ MATCHED via cart attribute:', method.name);
        break;
      }
    }
  } else {
    // Cart attribute yoksa, deliveryGroups'u dene (eski yöntem)
    console.error('⚠️ No cart attribute, trying deliveryGroups');
    const deliveryGroups = input.cart?.deliveryGroups || [];
    console.error('📦 Delivery groups count:', deliveryGroups.length);

    if (deliveryGroups.length === 0) {
      console.error('⚠️ No delivery groups - no discount applied');
      return emptyReturn;
    }

    for (const group of deliveryGroups) {
      const selected = group?.selectedDeliveryOption;
      if (!selected?.handle) continue;

      const deliveryOptions = group?.deliveryOptions || [];
      const fullOption = deliveryOptions.find((opt: any) => opt.handle === selected.handle);

      if (!fullOption) {
        console.error('⚠️ Could not find full delivery option for handle:', selected.handle);
        continue;
      }

      const title = fullOption.title?.toLowerCase() || '';
      console.error('🔍 Selected delivery title:', title);

      // Title'dan type'ı çıkar (pickup kelimesi varsa pickup, yoksa shipping)
      const isPickup = title.includes('pickup') || title.includes('afhalen') || title.includes('abholung') || title.includes('terheijdenseweg');
      const detectedType = isPickup ? 'pickup' : 'shipping';
      console.error('🔍 Detected type from title:', detectedType);

      for (const method of activeMethods) {
        if (method.type === 'pickup' && detectedType === 'pickup') {
          matchedMethod = method;
          console.error('✅ PICKUP matched');
          break;
        }

        if (method.type === 'shipping' && detectedType === 'shipping') {
          const methodName = method.name.toLowerCase().split('(')[0].trim();
          if (title.includes(methodName) || methodName.includes(title)) {
            matchedMethod = method;
            console.error('✅ SHIPPING matched:', method.name);
            break;
          }
        }
      }

      if (matchedMethod) break;
    }
  }

  if (!matchedMethod) {
    console.error('❌ No matched method');
    return emptyReturn;
  }

  console.error('✅ MATCHED:', matchedMethod.name, '| Discount:', matchedMethod.discountValue);

  return {
    discountApplicationStrategy: "FIRST",
    discounts: [{
      message: `${matchedMethod.discountValue}% korting`,
      targets: [{
        orderSubtotal: {
          excludedVariantIds: []
        }
      }],
      value: matchedMethod.discountType === 'percentage'
        ? {
            percentage: {
              value: matchedMethod.discountValue.toString()
            }
          }
        : {
            fixedAmount: {
              amount: matchedMethod.discountValue.toFixed(2)
            }
          }
    }]
  };
}