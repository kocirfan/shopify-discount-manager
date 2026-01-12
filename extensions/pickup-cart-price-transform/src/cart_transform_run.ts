import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function run(input: CartTransformRunInput): CartTransformRunResult {
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

  // SADECE PICKUP İÇİN EK İNDİRİM UYGULA
  // Diğer teslimat yöntemleri için hiçbir şey yapma
  if (selectedDeliveryType !== 'pickup') {
    console.error('⚠️ Not pickup delivery, skipping cart transform');
    return NO_CHANGES;
  }

  // Pickup seçiliyse, mevcut fiyat üzerinden %2 ek indirim uygula
  // Cart Transform, automatic discount'tan SONRA çalışır
  // Bu yüzden line.cost.amountPerQuantity zaten indirimli fiyatı içerir
  const pickupDiscountPercent = matchedMethod.discountValue; // örn: 2

  // Her cart line için ek %2 indirim operasyonu oluştur
  const operations = input.cart.lines.map((line: any) => {
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);

    // Mevcut fiyat üzerinden pickup indirimi uygula (compound)
    // Örnek: €90 (zaten %10 indirimli) -> €90 * 0.98 = €88.20
    const pickupDiscountDecimal = pickupDiscountPercent / 100;
    const finalMultiplier = 1 - pickupDiscountDecimal;
    const newPrice = currentPrice * finalMultiplier;

    const discountAmount = currentPrice - newPrice;

    console.error(
      `📦 Line ${line.id}: €${currentPrice.toFixed(2)} -> €${newPrice.toFixed(2)} ` +
      `(Pickup ${pickupDiscountPercent}% = -€${discountAmount.toFixed(2)})`
    );

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
