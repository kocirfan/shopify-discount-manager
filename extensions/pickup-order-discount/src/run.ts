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

import type {
  RunInput,
} from "../generated/api";

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
  console.error('=== PICKUP ORDER DISCOUNT START ===');

  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST"
  };

  // ============================================================
  // TESLİMAT TİPİ TESPİTİ - ÇİFT KONTROL
  // 1. Öncelik: Shopify deliveryGroups (en güvenilir)
  // 2. Fallback: Cart attribute (UI extension tarafından ayarlanır)
  // ============================================================

  // Yöntem 1: Shopify deliveryGroups'tan teslimat tipini al
  let isPickupFromDeliveryGroup = false;
  const deliveryGroups = cart.deliveryGroups || [];

  if (deliveryGroups.length > 0) {
    const selectedOption = deliveryGroups[0]?.selectedDeliveryOption;
    if (selectedOption) {
      const title = (selectedOption.title || '').toLowerCase();
      const handle = (selectedOption.handle || '').toLowerCase();

      console.error('📦 Shopify DeliveryGroup:');
      console.error('   Title:', selectedOption.title || '(yok)');
      console.error('   Handle:', selectedOption.handle || '(yok)');

      // Pickup kelimelerini ara
      isPickupFromDeliveryGroup =
        title.includes('pickup') ||
        title.includes('afhalen') ||
        title.includes('local pickup') ||
        title.includes('store pickup') ||
        title.includes('mağazadan') ||
        title.includes('markham') ||
        handle.includes('pickup') ||
        handle.includes('local');

      console.error('   Pickup tespit edildi (deliveryGroup):', isPickupFromDeliveryGroup);
    }
  } else {
    console.error('⚠️ DeliveryGroups boş - henüz teslimat seçilmemiş olabilir');
  }

  // Yöntem 2: Cart attribute'dan teslimat tipini kontrol et
  const selectedDeliveryType = cart.attribute?.value;
  console.error('🏷️ Cart attribute (selected_delivery_type):', selectedDeliveryType || '(boş)');

  // ============================================================
  // KARAR MANTIĞI (GÜVENLİ DEFAULT):
  // - DeliveryGroup varsa VE pickup ise -> indirim uygula
  // - DeliveryGroup boşsa -> indirim UYGULAMA (güvenli default)
  // - Cart attribute tek başına YETERLİ DEĞİL (güvenilir değil)
  // ============================================================

  let shouldApplyPickupDiscount = false;

  if (deliveryGroups.length > 0 && deliveryGroups[0]?.selectedDeliveryOption) {
    // DeliveryGroup varsa, ona güven (en güvenilir kaynak)
    shouldApplyPickupDiscount = isPickupFromDeliveryGroup;
    console.error('🎯 Karar kaynağı: Shopify DeliveryGroups');
  } else {
    // DeliveryGroup boşsa - GÜVENLİ DEFAULT: İndirim uygulama
    // Cart attribute güvenilir değil çünkü UI extension düzgün çalışmıyor olabilir
    console.error('⚠️ DeliveryGroups boş - güvenli default: İNDİRİM YOK');
    console.error('   Cart attribute:', selectedDeliveryType || '(boş)');
    console.error('   NOT: Pickup indirimi için checkout\'ta teslimat seçimi gerekli');
    return emptyReturn;
  }

  if (!shouldApplyPickupDiscount) {
    console.error('⛔ PICKUP SEÇİLİ DEĞİL - İndirim UYGULANMAYACAK');
    return emptyReturn;
  }

  console.error('✅ Pickup seçili - indirim değerlendirilecek');

  // Metafield'dan ayarları al
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    console.error('❌ AYAR BULUNAMADI: Metafield boş');
    return emptyReturn;
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
    console.error('📋 Ayarlar yüklendi:', settings.length, 'teslimat yöntemi');
  } catch (e) {
    console.error('❌ JSON PARSE HATASI');
    return emptyReturn;
  }

  // ============================================================
  // KURAL 4: İNDİRİM İZOLASYONU - PICKUP İNDİRİMİ
  // Pickup indirimi, müşteri tag indirimi ile BAĞIMSIZ çalışır.
  // Bu indirim SADECE pickup seçimi aktifken uygulanır.
  // ============================================================

  // Aktif pickup metodunu bul
  const pickupMethod = settings.find((m: any) => m.type === 'pickup' && m.enabled);

  if (!pickupMethod) {
    console.error('❌ AKTİF PICKUP METODU BULUNAMADI');
    return emptyReturn;
  }

  console.error('✅ Pickup metodu bulundu:', pickupMethod.name);
  console.error('   İndirim değeri: %', pickupMethod.discountValue);

  // Sepet ara toplamı üzerinden indirim hesapla
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const discountPercent = pickupMethod.discountValue;
  const discountAmount = (subtotal * (discountPercent / 100)).toFixed(2);

  console.error('💰 Ara toplam:', subtotal.toFixed(2));
  console.error('💰 Pickup indirimi: %', discountPercent, '=', discountAmount);

  // ============================================================
  // KURAL 6: ÖNCELİK VE ÇAKIŞMA KURALLARI
  // Pickup indirimi, tag bazlı indirim ile birlikte uygulanabilir.
  // Her iki indirim de mevcutsa, combine kurallarına uygun çalışır.
  // ============================================================
  console.error('✅ PICKUP İNDİRİMİ UYGULANACAK');

  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: discountAmount,
          },
        },
        message: `%${discountPercent} mağazadan teslim indirimi`,
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: []
            }
          }
        ]
      },
    ],
    discountApplicationStrategy: "FIRST"
  };
}
