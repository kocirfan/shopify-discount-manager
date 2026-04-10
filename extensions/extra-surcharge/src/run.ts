import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = { operations: [] };

const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const SURCHARGE_RATE = 0.07; // %7

export function run(input: CartTransformRunInput): CartTransformRunResult {
  // Surcharge line'ını bul
  const surchargeLine = input.cart.lines.find(
    (l) =>
      l.merchandise.__typename === "ProductVariant" &&
      (l.merchandise as { __typename: "ProductVariant"; id: string }).id ===
        SURCHARGE_VARIANT_ID
  );

  if (!surchargeLine) return NO_CHANGES;

  // Sepet toplamını hesapla (surcharge line hariç)
  let cartTotal = 0;
  for (const line of input.cart.lines) {
    if (
      line.merchandise.__typename === "ProductVariant" &&
      (line.merchandise as { __typename: "ProductVariant"; id: string }).id ===
        SURCHARGE_VARIANT_ID
    ) {
      continue;
    }
    const price = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (!isNaN(price)) cartTotal += price * line.quantity;
  }

  const surchargeAmount = parseFloat((cartTotal * SURCHARGE_RATE).toFixed(2));

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
