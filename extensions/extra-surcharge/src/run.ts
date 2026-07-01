import type { CartTransformRunInput } from "../generated/api";

const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const SURCHARGE_RATE = 0.05;

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

  // Her line için indirim sonrası tutarı hesapla
  let cartTotal = 0;
  for (const line of lines) {
    const merch = line.merchandise;
    if (merch.__typename !== "ProductVariant") continue;
    const variant = merch as { __typename: "ProductVariant"; id: string; product?: { id: string; hasAnyTag?: boolean } };
    if (variant.id === SURCHARGE_VARIANT_ID) continue;

    const linePrice = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (isNaN(linePrice)) continue;

    // Ürün muaf mı? (nodiscount tag veya excluded list)
    const isExcluded =
      (variant.product?.hasAnyTag === true) ||
      (variant.product?.id != null && excludedProductIds.includes(variant.product.id));

    const effectivePrice = isExcluded ? linePrice : linePrice * (1 - discountRate);
    cartTotal += effectivePrice * line.quantity;
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
