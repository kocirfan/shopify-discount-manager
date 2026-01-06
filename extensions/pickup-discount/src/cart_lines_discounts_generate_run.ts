// import {
//   CartInput,
//   CartLinesDiscountsGenerateRunResult,
//   ProductDiscountSelectionStrategy,
// } from '../generated/api';

// interface DeliveryMethod {
//   id: string;
//   name: string;
//   type: string;
//   enabled: boolean;
//   discountType: "percentage" | "fixed";
//   discountValue: number;
// }

// export function cartLinesDiscountsGenerateRun(
//   input: CartInput,
// ): CartLinesDiscountsGenerateRunResult {
//   console.error('=== PICKUP DISCOUNT FUNCTION ===');
//   console.error('Full input:', JSON.stringify(input, null, 2));

//   if (!input.cart.lines.length) {
//     console.error('No cart lines');
//     return {operations: []};
//   }

//   // Metafield'dan ayarları oku
//   const settingsJson = input.shop?.deliveryDiscountSettings?.value;
//   if (!settingsJson) {
//     console.error('No settings found in metafield');
//     return {operations: []};
//   }

//   let settings: DeliveryMethod[];
//   try {
//     settings = JSON.parse(settingsJson);
//     console.error('Loaded settings:', settings);
//   } catch (error) {
//     console.error('Error parsing settings:', error);
//     return {operations: []};
//   }

//   // Aktif metodları filtrele
//   const activeMethods = settings.filter(m => m.enabled);
//   if (activeMethods.length === 0) {
//     console.error('No active discount methods');
//     return {operations: []};
//   }

//   // Seçili teslimat metodunu kontrol et
//   const deliveryGroups = input.cart?.deliveryGroups || [];
//   let matchedMethod: DeliveryMethod | null = null;

//   for (const group of deliveryGroups) {
//     const selected = group?.selectedDeliveryOption;
//     if (!selected) continue;

//     const title = selected.title?.toLowerCase() || '';
//     const handle = selected.handle?.toLowerCase() || '';

//     console.error('Checking delivery option:', { title, handle });

//     // Aktif metodlarla eşleştir
//     for (const method of activeMethods) {
//       const methodName = method.name.toLowerCase();
      
//       if (title.includes(methodName) || 
//           methodName.includes(title) ||
//           handle.includes(methodName.replace(/\s+/g, '-'))) {
//         matchedMethod = method;
//         break;
//       }
//     }

//     if (matchedMethod) break;
//   }

//   if (!matchedMethod) {
//     console.error('No matching method found');
//     return {operations: []};
//   }

//   console.error('Matched method:', matchedMethod);

//   // İndirim hesapla
//   const subtotal = parseFloat(input.cart.cost.subtotalAmount.amount);
//   let discountAmount: string;

//   if (matchedMethod.discountType === 'percentage') {
//     discountAmount = (subtotal * matchedMethod.discountValue / 100).toFixed(2);
//   } else {
//     discountAmount = matchedMethod.discountValue.toFixed(2);
//   }

//   console.error('Applying discount:', discountAmount);

//   // Her ürüne eşit oranda dağıt
//   return {
//     operations: [
//       {
//         productDiscountsAdd: {
//           candidates: input.cart.lines.map(line => ({
//             message: `${matchedMethod.discountValue}% korting voor ${matchedMethod.name}`,
//             targets: [{
//               cartLineId: line.id
//             }],
//             value: matchedMethod.discountType === 'percentage' 
//               ? {
//                   percentage: {
//                     value: matchedMethod.discountValue.toString()
//                   }
//                 }
//               : {
//                   fixedAmount: {
//                     amount: (parseFloat(discountAmount) / input.cart.lines.length).toFixed(2)
//                   }
//                 }
//           })),
//           selectionStrategy: ProductDiscountSelectionStrategy.First,
//         },
//       },
//     ],
//   };
// }
export function run(input: any) {
  // Boş sepet
  if (!input.cart?.lines?.length) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  // Metafield
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
  } catch (e) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  const activeMethods = settings.filter((m: any) => m.enabled);
  if (!activeMethods.length) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  // Delivery groups kontrol
  const deliveryGroups = input.cart?.deliveryGroups || [];

  // Eğer delivery groups yoksa veya boşsa, indirim uygulanmaz
  if (!deliveryGroups.length) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  let matchedMethod = null;

  // Seçilen teslimat yöntemini kontrol et
  for (const group of deliveryGroups) {
    const selected = group?.selectedDeliveryOption;
    if (!selected?.title) continue;

    const title = selected.title.toLowerCase();

    // Aktif metodlarla eşleştir
    for (const method of activeMethods) {
      // Pickup metodları için özel kontrol
      if (method.type === 'pickup') {
        if (title.includes('pickup') || title.includes('ophalen') || title.includes('afhalen')) {
          matchedMethod = method;
          break;
        }
      }

      // Shipping metodları için isim eşleştirmesi
      if (method.type === 'shipping') {
        const methodName = method.name.toLowerCase();
        // "Free Shipping (Zone 1)" -> "free shipping" ve "zone 1" kontrol et
        const methodParts = methodName.split('(')[0].trim();

        if (title.includes(methodParts) || methodParts.includes(title)) {
          matchedMethod = method;
          break;
        }
      }
    }

    if (matchedMethod) break;
  }

  if (!matchedMethod) {
    return { discountApplicationStrategy: "FIRST", discounts: [] };
  }

  const subtotal = parseFloat(input.cart.cost?.subtotalAmount?.amount || '0');
  
  const discount: any = {
    message: `${matchedMethod.discountValue}% korting`,
    targets: [{
      orderSubtotal: {
        excludedVariantIds: []
      }
    }]
  };

  if (matchedMethod.discountType === 'percentage') {
    discount.value = {
      percentage: {
        value: matchedMethod.discountValue.toString()
      }
    };
  } else {
    discount.value = {
      fixedAmount: {
        amount: matchedMethod.discountValue.toFixed(2)
      }
    };
  }

  return {
    discountApplicationStrategy: "FIRST",
    discounts: [discount]
  };
}