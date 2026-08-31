// ============================================================
// CUSTOMER TAG PRODUCT DISCOUNT
// Müşteri tag'lerine göre ÜRÜN FİYATLARINA indirim uygular.
// Her ürün satırı ayrı ayrı yüzde indirim alır.
//
// API: Discount Function API (target: cart.lines.discounts.generate.run, 2026-07)
// Legacy "purchase.product-discount.run" API'si 2026-04 itibarıyla kaldırıldı;
// çıktı formatı `productDiscountsAdd` operasyonuna taşındı. İndirim mantığı aynıdır.
//
// ÖNEMLİ KURALLAR:
// 1. LOGIN ZORUNLULUĞU: Guest kullanıcılar için tag bazlı indirim UYGULANMAZ
// 2. TAG DOĞRULAMASI: Kullanıcı login olmuş olsa bile, tanımlı tag yoksa indirim UYGULANMAZ
// 3. İNDİRİM İZOLASYONU: Bu indirim pickup/shipping seçiminden BAĞIMSIZ çalışır
// 4. KOMBİNE ÇALIŞMA: Pickup indirimi ile birlikte uygulanabilir (combine kurallarına göre)
// 5. SINIF KONTROLÜ: Discount'ta PRODUCT sınıfı açık değilse hiçbir şey üretilmez
// ============================================================

import type { CartLinesDiscountsGenerateRunInput } from "../generated/api";

type ProductDiscountCandidate = {
  message?: string;
  targets: { cartLine: { id: string; quantity?: number } }[];
  value: { percentage: { value: number } };
};

type FunctionResult = {
  operations: {
    productDiscountsAdd: {
      candidates: ProductDiscountCandidate[];
      selectionStrategy: "FIRST" | "MAXIMUM" | "ALL";
    };
  }[];
};

interface CustomerTagRule {
  id: string;
  customerTag: string;
  discountPercentage: number;
  discountName: string;
  enabled: boolean;
}

const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";

export function run(input: CartLinesDiscountsGenerateRunInput): FunctionResult {
  const emptyReturn: FunctionResult = { operations: [] };

  // ============================================================
  // KURAL 5: SINIF KONTROLÜ
  // ============================================================
  const discountClasses = (input.discount?.discountClasses || []) as string[];
  if (!discountClasses.includes("PRODUCT")) {
    return emptyReturn;
  }

  // ============================================================
  // KURAL 1: LOGIN ZORUNLULUĞU
  // Guest kullanıcılar için indirim UYGULANMAZ.
  // ============================================================
  const customer = input.cart.buyerIdentity?.customer;

  if (!customer?.id) {
    return emptyReturn;
  }

  // ============================================================
  // ÖNCELİK 1: exact_discount_code METAFIELD (EN YENİ SİSTEM)
  // custom.exact_discount_code değeri "korting-20.1" formatında gelir,
  // "korting-" prefix'inden sonraki sayı indirim oranı olarak kullanılır.
  // ============================================================
  const exactDiscountCode = customer.exactDiscountCode?.value;
  let discountPercentage = 0;

  if (exactDiscountCode) {
    const match = exactDiscountCode.match(/^korting-(.+)$/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0) {
        discountPercentage = parsed;
      }
    }
  }

  // ============================================================
  // ÖNCELİK 2: MÜŞTERİ METAFIELD KONTROLÜ (ESKİ SİSTEM)
  // ============================================================
  if (discountPercentage === 0) {
    const customerMetafieldValue = customer.discountPercentage?.value;
    if (customerMetafieldValue) {
      const metafieldPercent = parseFloat(customerMetafieldValue);
      if (!isNaN(metafieldPercent) && metafieldPercent > 0) {
        discountPercentage = metafieldPercent;
      }
    }
  }

  // ============================================================
  // ÖNCELİK 3: TAG SİSTEMİ (MEVCUT SİSTEM - FALLBACK)
  // ============================================================
  if (discountPercentage === 0) {
    const activeTags = (customer.hasTags || [])
      .filter((t) => t.hasTag)
      .map((t) => t.tag.toLowerCase());

    if (activeTags.length === 0) {
      return emptyReturn;
    }

    const rulesJson = input.shop?.customerTagDiscountRules?.value;
    if (!rulesJson) {
      return emptyReturn;
    }

    let rules: CustomerTagRule[];
    try {
      rules = JSON.parse(rulesJson);
    } catch {
      return emptyReturn;
    }

    // En yüksek indirimli eşleşen kuralı bul
    let matchedRule: CustomerTagRule | null = null;
    let highestDiscount = 0;

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (activeTags.includes(rule.customerTag.toLowerCase())) {
        if (rule.discountPercentage > highestDiscount) {
          highestDiscount = rule.discountPercentage;
          matchedRule = rule;
        }
      }
    }

    if (!matchedRule) {
      return emptyReturn;
    }

    discountPercentage = matchedRule.discountPercentage;
  }

  if (discountPercentage <= 0) {
    return emptyReturn;
  }

  // ============================================================
  // ÜRÜN BAZLI İNDİRİM UYGULA
  // Surcharge ürününe indirim uygulanmaz.
  // Muaf tutulan ürünlere indirim uygulanmaz.
  // ============================================================
  let excludedProductIds: string[] = [];
  const excludedProductsJson = input.shop?.excludedProducts?.value;
  if (excludedProductsJson) {
    try {
      excludedProductIds = JSON.parse(excludedProductsJson);
    } catch {
      // parse hatası olursa boş liste kullan
    }
  }

  const targets: ProductDiscountCandidate["targets"] = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant") continue;
    if (merchandise.id === SURCHARGE_VARIANT_ID) continue;
    // Ürün muaf listesindeyse atla
    if (merchandise.product?.id && excludedProductIds.includes(merchandise.product.id)) continue;
    // "nodiscount" tag'i olan ürünlere indirim uygulanmaz
    if (merchandise.product?.hasAnyTag) continue;
    // Yeni API'de hedef, variant değil sepet satırıdır
    targets.push({ cartLine: { id: line.id } });
  }

  if (targets.length === 0) {
    return emptyReturn;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: "Korting",
              targets,
              value: { percentage: { value: discountPercentage } },
            },
          ],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}
