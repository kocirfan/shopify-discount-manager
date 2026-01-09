import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  console.error('=== CART TRANSFORM START ===');
  console.error('Input:', JSON.stringify(input, null, 2));

  // Gerekli verileri kontrol et
  if (!input.cart?.lines?.length) {
    console.error('❌ No cart lines');
    return NO_CHANGES;
  }

  const selectedDeliveryType = input.cart?.attribute?.value;
  console.error('🏷️ Selected delivery type:', selectedDeliveryType);

  if (!selectedDeliveryType) {
    console.error('❌ No delivery type selected');
    return NO_CHANGES;
  }

  // Settings'i al
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    console.error('❌ No settings in metafield');
    return NO_CHANGES;
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
    console.error('✅ Settings loaded:', settings.length, 'methods');
  } catch (e) {
    console.error('❌ Parse error');
    return NO_CHANGES;
  }

  // Aktif metotları filtrele
  const activeMethods = settings.filter((m: any) => m.enabled);
  if (!activeMethods.length) {
    console.error('❌ No active methods');
    return NO_CHANGES;
  }

  // Seçilen delivery type ile eşleşen metodu bul
  const matchedMethod = activeMethods.find((m: any) => m.type === selectedDeliveryType);
  
  if (!matchedMethod) {
    console.error('❌ No matched method for type:', selectedDeliveryType);
    return NO_CHANGES;
  }

  console.error('✅ MATCHED:', matchedMethod.name, '| Discount:', matchedMethod.discountValue);

  // Her cart line için fiyat düşürme operasyonu oluştur
  const operations = input.cart.lines.map((line: any) => {
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);
    const discountPercent = matchedMethod.discountValue / 100;
    const newPrice = currentPrice * (1 - discountPercent);

    console.error(`📦 Line ${line.id}: ${currentPrice} -> ${newPrice.toFixed(2)} (${matchedMethod.discountValue}% off)`);

    return {
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: newPrice.toFixed(2)
            }
          }
        }
      }
    };
  });

  console.error('✅ Returning', operations.length, 'price update operations');

  return {
    operations
  };
}
