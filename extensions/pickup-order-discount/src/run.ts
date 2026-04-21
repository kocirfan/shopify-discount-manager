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

  // Sabit pickup indirim değeri
  const pickupMethod = { discountValue: 2 };

  // ============================================================
  // MÜŞTERİ İNDİRİMİNİ HESAPLA (HYBRID SİSTEM)
  // Öncelik 1: Customer metafield (yeni sistem)
  // Öncelik 2: Tag bazlı indirim (mevcut sistem)
  // ============================================================
  let tagDiscountPercent = 0;
  let discountSource = "";

  const customer = cart.buyerIdentity?.customer;
  //console.error('🔍 Customer:', customer?.id || 'YOK');

  if (customer?.id) {
    // ÖNCELİK 1: Customer metafield kontrolü
    const customerMetafieldValue = (customer as any).discountPercentage?.value;
    if (customerMetafieldValue) {
      const metafieldPercent = parseFloat(customerMetafieldValue);
      if (!isNaN(metafieldPercent) && metafieldPercent > 0) {
        tagDiscountPercent = metafieldPercent;
        discountSource = "metafield";
        //console.error('🎯 METAFIELD İNDİRİMİ: %' + tagDiscountPercent);
      }
    }

    // ÖNCELİK 2: Tag bazlı indirim (metafield yoksa)
    if (tagDiscountPercent === 0) {
      const activeTags = (customer.hasTags || [])
        .filter((t: any) => t.hasTag)
        .map((t: any) => t.tag.toLowerCase());

      //console.error('🔍 Active Tags:', activeTags.join(', ') || 'YOK');

      const rulesJson = (input as any).shop?.customerTagDiscountRules?.value;

      if (rulesJson && activeTags.length > 0) {
        try {
          const rules: CustomerTagRule[] = JSON.parse(rulesJson);
          for (const rule of rules) {
            if (!rule.enabled) continue;
            if (activeTags.includes(rule.customerTag.toLowerCase())) {
              if (rule.discountPercentage > tagDiscountPercent) {
                tagDiscountPercent = rule.discountPercentage;
                discountSource = `tag:${rule.customerTag}`;
              }
            }
          }
          if (tagDiscountPercent > 0) {
            //console.error('🎯 TAG İNDİRİMİ: %' + tagDiscountPercent + ' (' + discountSource + ')');
          }
        } catch (e) {
          //console.error('❌ JSON parse error');
        }
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

  //console.error('📊 Pickup İndirim Hesabı:');
  //console.error('   Orijinal subtotal:', originalSubtotal.toFixed(2));
  //console.error('   Tag indirimi: %' + tagDiscountPercent);
  //console.error('   Tag sonrası:', afterTagDiscount.toFixed(2));
  //console.error('   Pickup indirimi: %' + pickupDiscountPercent + ' = ' + pickupDiscountAmount);

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
              excludedVariantIds: ["gid://shopify/ProductVariant/61571547791690"],
            },
          },
        ],
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
