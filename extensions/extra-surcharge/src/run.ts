import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = { operations: [] };
const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const DEFAULT_RATE = 0.05;

export function run(input: CartTransformRunInput): CartTransformRunResult {
  const lines = input.cart.lines;

  // Surcharge line'ı bul
  const surchargeLine = lines.find(
    (l) =>
      l.merchandise.__typename === "ProductVariant" &&
      (l.merchandise as { __typename: "ProductVariant"; id: string }).id === SURCHARGE_VARIANT_ID
  );

  if (!surchargeLine) return NO_CHANGES;

  // Surcharge hariç toplam
  let cartTotal = 0;
  for (const line of lines) {
    if (
      line.merchandise.__typename === "ProductVariant" &&
      (line.merchandise as { __typename: "ProductVariant"; id: string }).id === SURCHARGE_VARIANT_ID
    ) continue;
    // subtotalAmount = indirim uygulanmış satır toplamı (quantity dahil)
    const lineTotal = parseFloat(line.cost.subtotalAmount.amount as string);
    if (!isNaN(lineTotal)) cartTotal += lineTotal;
  }

  const surchargeAmount = parseFloat((cartTotal * DEFAULT_RATE).toFixed(2));
  if (cartTotal <= 0 || surchargeAmount <= 0) return NO_CHANGES;

  return {
    operations: [
      {
        lineUpdate: {
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
