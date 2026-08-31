import type { CartTransformRunInput } from "../generated/api";

// ============================================================
// ORDERTOESLAG (EXTRA SURCHARGE) — CART TRANSFORM
//
// Surcharge satırının fiyatı = eligible ürünlerin İNDİRİM SONRASI toplamı × %5.
//
// Cart Transform, Shopify'ın indirim motoru çalışmadan ÖNCE koşar; bu yüzden
// input'ta yalnızca indirimsiz fiyatlar (amountPerQuantity) vardır:
//  - Discount Manager (müşteri tag / metafield) indirimi burada AYNI kurallarla
//    yeniden hesaplanır (getCustomerDiscountRate) — mevcut mantık.
//  - Shopify'ın kendi indirimleri (admin'den açılan otomatik indirimler, indirim
//    kodları) buradan görülemez. Bunlar için checkout UI extension
//    (checkout-extension-app/custom-input-field/src/surchargeBaseSync.js) ve tema JS
//    (price-display/assets/surcharge-cart-manager.js) surcharge satırına
//    `_surcharge_base` attribute'ünü yazar: indirim SONRASI satır tutarları.
//
// Attribute formatı: {"<variantNumericId>": [adet, indirimSonrasıSatırToplamı], ...}
// Kullanım kuralı: attribute yalnızca adet eşleşiyorsa (güncel) VE mevcut hesaptan
// DÜŞÜK bir tutar veriyorsa kullanılır. Yani mevcut hesap asla yukarı yönlü
// değişmez; Shopify indirimleri sadece toeslag tabanını düşürür.
// ============================================================

const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const SURCHARGE_RATE = 0.05;
// DİKKAT (2026-07): Hedef `purchase.cart-transform.run` -> sonuç tipi FunctionRunResult ->
// operasyon adları `expand` / `merge` / `update`. `lineExpand` / `linesMerge` / `lineUpdate`
// adları YALNIZCA yeni `cart.transform.run` hedefine aittir; burada kullanılırsa Shopify
// çıktıyı InvalidOutputError ile reddeder (canlıda 31.08.2026 yaşandı).
export const SURCHARGE_BASE_ATTRIBUTE_KEY = "_surcharge_base";
// Bu ürünler Ordertoeslag (surcharge) hesaplamasına dahil edilmez
const SURCHARGE_EXEMPT_PRODUCT_IDS = [
  "gid://shopify/Product/15252021281098",
  "gid://shopify/Product/15564785058122",
];

function getCustomerDiscountRate(input: CartTransformRunInput): number {
  const customer = input.cart.buyerIdentity?.customer;
  if (!customer) return 0;

  // Öncelik 1: exactDiscountCode metafield (korting-25.1 formatı)
  const exactCode = customer.exactDiscountCode?.value;
  if (exactCode) {
    const match = exactCode.match(/^korting-(.+)$/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0) return parsed / 100;
    }
  }

  // Öncelik 2: discountPercentage metafield
  const metafieldVal = customer.discountPercentage?.value;
  if (metafieldVal) {
    const parsed = parseFloat(metafieldVal);
    if (!isNaN(parsed) && parsed > 0) return parsed / 100;
  }

  // Öncelik 3: tag sistemi
  const activeTags = (customer.hasTags || [])
    .filter((t) => t.hasTag)
    .map((t) => t.tag.toLowerCase());

  if (activeTags.length === 0) return 0;

  const rulesJson = input.shop?.customerTagDiscountRules?.value;
  if (!rulesJson) return 0;

  try {
    const rules: { customerTag: string; discountPercentage: number; enabled: boolean }[] = JSON.parse(rulesJson);
    let highest = 0;
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (activeTags.includes(rule.customerTag.toLowerCase())) {
        if (rule.discountPercentage > highest) highest = rule.discountPercentage;
      }
    }
    return highest > 0 ? highest / 100 : 0;
  } catch {
    return 0;
  }
}

// "gid://shopify/ProductVariant/123" -> "123" (sayısal id zaten sayısalsa aynen döner)
function variantNumericId(id: string): string {
  const idx = id.lastIndexOf("/");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

type DiscountedBaseHint = Record<string, { quantity: number; total: number }>;

// `_surcharge_base` attribute'ünü güvenli şekilde parse eder; bozuk girdiler yok sayılır.
export function parseDiscountedBaseHint(raw: string | null | undefined): DiscountedBaseHint | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const hint: DiscountedBaseHint = {};
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    const entry = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const quantity = Number(entry[0]);
    const total = Number(entry[1]);
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(total) || total < 0) continue;
    hint[variantNumericId(String(key))] = { quantity, total };
  }
  return Object.keys(hint).length > 0 ? hint : null;
}

export function run(input: CartTransformRunInput): unknown {
  const lines = input.cart.lines;

  const surchargeLine = lines.find(
    (l) =>
      l.merchandise.__typename === "ProductVariant" &&
      (l.merchandise as { __typename: "ProductVariant"; id: string }).id === SURCHARGE_VARIANT_ID
  );

  if (!surchargeLine) return { operations: [] };

  const discountRate = getCustomerDiscountRate(input);

  // Muaf ürün ID listesi
  let excludedProductIds: string[] = [];
  try {
    const raw = input.shop?.excludedProducts?.value;
    if (raw) excludedProductIds = JSON.parse(raw);
  } catch { /* boş liste */ }

  // Checkout / tema tarafından yazılan indirim sonrası tutarlar (Shopify indirimleri dahil)
  const discountedHint = parseDiscountedBaseHint(surchargeLine.surchargeBase?.value);

  // Her line için indirim sonrası tutarı hesapla (mevcut mantık — değişmedi).
  // Hint ile karşılaştırabilmek için variant bazında toplanır.
  const perVariant: Record<string, { quantity: number; computed: number }> = {};
  for (const line of lines) {
    const merch = line.merchandise;
    if (merch.__typename !== "ProductVariant") continue;
    const variant = merch as { __typename: "ProductVariant"; id: string; product?: { id: string; hasAnyTag?: boolean } };
    if (variant.id === SURCHARGE_VARIANT_ID) continue;
    if (variant.product?.id != null && SURCHARGE_EXEMPT_PRODUCT_IDS.includes(variant.product.id)) continue;

    const linePrice = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (isNaN(linePrice)) continue;

    // Ürün muaf mı? (nodiscount tag veya excluded list)
    const isExcluded =
      (variant.product?.hasAnyTag === true) ||
      (variant.product?.id != null && excludedProductIds.includes(variant.product.id));

    const effectivePrice = isExcluded ? linePrice : linePrice * (1 - discountRate);

    const key = variantNumericId(variant.id);
    const agg = perVariant[key] || { quantity: 0, computed: 0 };
    agg.quantity += line.quantity;
    agg.computed += effectivePrice * line.quantity;
    perVariant[key] = agg;
  }

  let cartTotal = 0;
  for (const key of Object.keys(perVariant)) {
    const agg = perVariant[key];
    let effective = agg.computed;

    // Shopify indirimi varsa (otomatik indirim / kod) hint mevcut hesaptan düşük gelir.
    // Adet eşleşmiyorsa hint bayattır (sepet değişmiş) -> yok say, mevcut hesap kalır.
    const hint = discountedHint ? discountedHint[key] : undefined;
    if (hint && hint.quantity === agg.quantity && hint.total < effective) {
      effective = hint.total;
    }

    cartTotal += effective;
  }

  cartTotal = parseFloat(cartTotal.toFixed(2));
  const surchargeAmount = parseFloat((cartTotal * SURCHARGE_RATE).toFixed(2));

  if (cartTotal <= 0 || surchargeAmount <= 0) return { operations: [] };

  return {
    operations: [
      {
        update: {
          cartLineId: surchargeLine.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: String(surchargeAmount),
              },
            },
          },
        },
      },
    ],
  };
}
