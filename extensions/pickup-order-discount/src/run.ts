// ============================================================
// PICKUP ORDER DISCOUNT
// Mağazadan teslim (pickup) seçeneği için sipariş bazlı indirim uygular.
//
// ÖNEMLİ KURALLAR:
// 1. TAG İNDİRİMİ SONRASI: Pickup indirimi, tag indirimi uygulandıktan sonraki
//    fiyat üzerinden hesaplanır (indirimli subtotal)
// 2. PICKUP ZORUNLULUĞU: SADECE pickup seçeneği aktif olduğunda uygulanır
// 3. CHECKOUT GÜNCELLİĞİ: Shipping'e geçildiğinde indirim DERHAL kaldırılır
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

interface CustomerTagRule {
  id: string;
  customerTag: string;
  discountPercentage: number;
  discountName: string;
  enabled: boolean;
}

export function run(input: RunInput): FunctionResult {
  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  // ============================================================
  // PICKUP KONTROLÜ
  // ============================================================
  const selectedDeliveryType = cart.attribute?.value;

  if (selectedDeliveryType !== "pickup") {
    return emptyReturn;
  }

  // Delivery settings al
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) return emptyReturn;

  let settings;
  try {
    settings = JSON.parse(settingsJson);
  } catch {
    return emptyReturn;
  }

  const pickupMethod = settings.find((m: any) => m.type === "pickup" && m.enabled);
  if (!pickupMethod) return emptyReturn;

  // ============================================================
  // MÜŞTERİ TAG İNDİRİMİNİ HESAPLA
  // Pickup indirimi, tag indirimi uygulandıktan sonraki fiyat üzerinden hesaplanmalı
  // ============================================================
  let tagDiscountPercent = 0;

  const customer = cart.buyerIdentity?.customer;
  if (customer?.id) {
    const activeTags = (customer.hasTags || [])
      .filter((t: any) => t.hasTag)
      .map((t: any) => t.tag.toLowerCase());

    const rulesJson = input.shop?.customerTagDiscountRules?.value;
    if (rulesJson) {
      try {
        const rules: CustomerTagRule[] = JSON.parse(rulesJson);
        for (const rule of rules) {
          if (!rule.enabled) continue;
          if (activeTags.includes(rule.customerTag.toLowerCase())) {
            if (rule.discountPercentage > tagDiscountPercent) {
              tagDiscountPercent = rule.discountPercentage;
            }
          }
        }
      } catch {
        // Kural parse hatası - tag indirimi 0 kalır
      }
    }
  }

  // ============================================================
  // İNDİRİMLİ SUBTOTAL HESAPLA
  // Önce tag indirimini uygula, sonra pickup indirimini hesapla
  // ============================================================
  const originalSubtotal = parseFloat(cart.cost.subtotalAmount.amount);

  // Tag indirimi uygulandıktan sonraki fiyat
  const afterTagDiscount = originalSubtotal * (1 - tagDiscountPercent / 100);

  // Pickup indirimi: indirimli fiyat üzerinden
  const pickupDiscountPercent = pickupMethod.discountValue;
  const pickupDiscountAmount = (afterTagDiscount * (pickupDiscountPercent / 100)).toFixed(2);

  console.error('📊 Pickup İndirim Hesabı:');
  console.error('   Orijinal subtotal:', originalSubtotal.toFixed(2));
  console.error('   Tag indirimi: %' + tagDiscountPercent);
  console.error('   Tag sonrası:', afterTagDiscount.toFixed(2));
  console.error('   Pickup indirimi: %' + pickupDiscountPercent + ' = ' + pickupDiscountAmount);

  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: pickupDiscountAmount,
          },
        },
        message: `%${pickupDiscountPercent} Pickup Korting`,
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
