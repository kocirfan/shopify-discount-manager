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

// ============================================================
// ACTIEKORTING (kampanya): shop metafield checkout_promo.active = true iken
// HERKESE (guest dahil) ek %5. Bayi indirimiyle SIRALI birleşir:
//   %25 bayi + %5 actie -> 1 - 0.75 * 0.95 = %28.75
// nodiscount tag'li ve muaf listesindeki ürünler actiekorting de ALMAZ.
// Metafield yoksa / false ise davranış eskisiyle birebir aynıdır.
// ============================================================
export const PROMO_PERCENTAGE = 5;

export function isPromoActive(input: CartLinesDiscountsGenerateRunInput): boolean {
  return input.shop?.checkoutPromoActive?.value === "true";
}

// SKU karşılaştırması büyük/küçük harf ve boşluk duyarsız.
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

// checkout_promo.excluded_skus -> Set. Bozuk / boş değer -> boş set.
export function parsePromoExcludedSkus(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return set;
    for (const v of parsed) {
      if (typeof v === "string" && v.trim()) set.add(normalizeSku(v));
    }
  } catch {
    // boş set
  }
  return set;
}

// Sıralı birleşim; float gürültüsünü önlemek için 4 haneye yuvarlanır.
export function combinePercentages(dealer: number, promo: number): number {
  const combined = (1 - (1 - dealer / 100) * (1 - promo / 100)) * 100;
  return Math.round(combined * 10000) / 10000;
}

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
  // KURAL 1: LOGIN ZORUNLULUĞU (bayi indirimi için)
  // Guest kullanıcılar bayi indirimi ALMAZ; actiekorting aktifse sadece onu alır.
  // ============================================================
  const promoActive = isPromoActive(input);
  const customer = input.cart.buyerIdentity?.customer;

  // Guest: bayi indirimi yok; actiekorting aktifse sadece o uygulanır.
  const discountPercentage = customer?.id ? getDealerPercentage(input) : 0;

  const finalPercentage = promoActive
    ? combinePercentages(discountPercentage, PROMO_PERCENTAGE)
    : discountPercentage;

  if (finalPercentage <= 0) {
    return emptyReturn;
  }

  const message = !promoActive
    ? "Korting"
    : discountPercentage > 0
    ? `Korting + ${PROMO_PERCENTAGE}% actiekorting`
    : `${PROMO_PERCENTAGE}% actiekorting`;

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

  // Actie aktifken Mega Deal SKU'ları nodiscount gibi davranır (bayi + actie yok).
  // Actie kapalıyken liste yok sayılır (mevcut davranış).
  const promoExcludedSkus = promoActive
    ? parsePromoExcludedSkus(input.shop?.promoExcludedSkus?.value)
    : new Set<string>();

  const targets: ProductDiscountCandidate["targets"] = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant") continue;
    if (merchandise.id === SURCHARGE_VARIANT_ID) continue;
    // Ürün muaf listesindeyse atla
    if (merchandise.product?.id && excludedProductIds.includes(merchandise.product.id)) continue;
    // "nodiscount" tag'i olan ürünlere indirim uygulanmaz
    if (merchandise.product?.hasAnyTag) continue;
    // Actie sırasında Mega Deal SKU'su ise nodiscount gibi atla
    if (promoExcludedSkus.size > 0 && merchandise.sku && promoExcludedSkus.has(normalizeSku(merchandise.sku))) continue;
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
              message,
              targets,
              value: { percentage: { value: finalPercentage } },
            },
          ],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}

// ============================================================
// BAYİ İNDİRİM ORANI (mevcut mantık — değişmedi). Guest / eşleşme yoksa 0.
// ============================================================
function getDealerPercentage(input: CartLinesDiscountsGenerateRunInput): number {
  // ============================================================
  // ÖNCELİK 1: exact_discount_code METAFIELD (EN YENİ SİSTEM)
  // custom.exact_discount_code değeri "korting-20.1" formatında gelir,
  // "korting-" prefix'inden sonraki sayı indirim oranı olarak kullanılır.
  // ============================================================
  const customer = input.cart.buyerIdentity?.customer;
  if (!customer?.id) return 0;

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
      return 0;
    }

    const rulesJson = input.shop?.customerTagDiscountRules?.value;
    if (!rulesJson) {
      return 0;
    }

    let rules: CustomerTagRule[];
    try {
      rules = JSON.parse(rulesJson);
    } catch {
      return 0;
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
      return 0;
    }

    discountPercentage = matchedRule.discountPercentage;
  }

  return discountPercentage > 0 ? discountPercentage : 0;
}
