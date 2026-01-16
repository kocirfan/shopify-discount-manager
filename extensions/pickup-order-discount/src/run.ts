// ============================================================
// PICKUP ORDER DISCOUNT
// Mağazadan teslim (pickup) seçeneği için sipariş bazlı indirim uygular.
//
// ÖNEMLİ KURALLAR:
// 1. İNDİRİM İZOLASYONU: Bu indirim müşteri tag indirimi ile BAĞIMSIZ çalışır
// 2. PICKUP ZORUNLULUĞU: SADECE pickup seçeneği aktif olduğunda uygulanır
// 3. CHECKOUT GÜNCELLİĞİ: Shipping'e geçildiğinde indirim DERHAL kaldırılır
// 4. KOMBİNE ÇALIŞMA: Tag bazlı indirim ile birlikte uygulanabilir (combine kurallarına göre)
// ============================================================

import type { RunInput } from "../generated/api";

// Order discount function output type
type FunctionResult = {
  discounts: {
    value: {
      fixedAmount?: {
        amount: string;
      };
      percentage?: {
        value: string;
      };
    };
    message?: string;
    targets?: {
      orderSubtotal?: {
        excludedVariantIds: string[];
      };
    }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

export function run(input: RunInput): FunctionResult {
  //console.error('=== PICKUP ORDER DISCOUNT START ===');

  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  // ============================================================
  // TESLİMAT TİPİ TESPİTİ
  // Cart attribute'a güveniyoruz - delivery-tracker UI extension
  // tarafından güncelleniyor ve doğru çalışıyor.
  // ============================================================

  // Cart attribute'dan teslimat tipini kontrol et
  const selectedDeliveryType = cart.attribute?.value;
  //console.error('🏷️ Cart attribute (selected_delivery_type):', selectedDeliveryType || '(boş)');

  // Shopify deliveryGroups bilgisini de logla (debug için)
  const deliveryGroups = cart.deliveryGroups || [];
  if (deliveryGroups.length > 0) {
    const selectedOption = deliveryGroups[0]?.selectedDeliveryOption;
    if (selectedOption) {
      // console.error('📦 Shopify DeliveryGroup:');
      // console.error('   Title:', selectedOption.title || '(yok)');
      // console.error('   Handle:', selectedOption.handle || '(yok)');
    }
  } else {
    // console.error('📦 DeliveryGroups: (boş - normal, function bu veriyi almayabilir)');
  }

  // ============================================================
  // KARAR MANTIĞI:
  // - Cart attribute "pickup" ise -> indirim uygula
  // - Cart attribute boş veya "shipping" ise -> indirim yok
  // ============================================================

  const shouldApplyPickupDiscount = selectedDeliveryType === "pickup";

  if (!shouldApplyPickupDiscount) {
    // console.error('⛔ PICKUP SEÇİLİ DEĞİL - İndirim UYGULANMAYACAK');
    // console.error('   Mevcut değer:', selectedDeliveryType || '(boş)');
    return emptyReturn;
  }

  // console.error('✅ Pickup seçili - indirim değerlendirilecek');

  // Metafield'dan ayarları al
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    // console.error('❌ AYAR BULUNAMADI: Metafield boş');
    return emptyReturn;
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
    //console.error('📋 Ayarlar yüklendi:', settings.length, 'teslimat yöntemi');
  } catch (e) {
    // console.error('❌ JSON PARSE HATASI');
    return emptyReturn;
  }

  // ============================================================
  // KURAL 4: İNDİRİM İZOLASYONU - PICKUP İNDİRİMİ
  // Pickup indirimi, müşteri tag indirimi ile BAĞIMSIZ çalışır.
  // Bu indirim SADECE pickup seçimi aktifken uygulanır.
  // ============================================================

  // Aktif pickup metodunu bul
  const pickupMethod = settings.find(
    (m: any) => m.type === "pickup" && m.enabled,
  );

  if (!pickupMethod) {
    //console.error('❌ AKTİF PICKUP METODU BULUNAMADI');
    return emptyReturn;
  }

  // console.error('✅ Pickup metodu bulundu:', pickupMethod.name);
  // console.error('   İndirim değeri: %', pickupMethod.discountValue);

  // Sepet ara toplamı üzerinden indirim hesapla
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const discountPercent = pickupMethod.discountValue;
  const discountAmount = (subtotal * (discountPercent / 100)).toFixed(2);

  // console.error('💰 Ara toplam:', subtotal.toFixed(2));
  // console.error('💰 Pickup indirimi: %', discountPercent, '=', discountAmount);

  // ============================================================
  // KURAL 6: ÖNCELİK VE ÇAKIŞMA KURALLARI
  // Pickup indirimi, tag bazlı indirim ile birlikte uygulanabilir.
  // Her iki indirim de mevcutsa, combine kurallarına uygun çalışır.
  // ============================================================

  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: discountAmount,
          },
        },
        message: `%${discountPercent} Pickup Korting`,
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: [],
            },
          },
        ],
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
