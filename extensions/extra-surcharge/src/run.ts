import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = { operations: [] };
const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const DEFAULT_RATE = 0.07;

export function run(input: CartTransformRunInput): CartTransformRunResult {
  // Ayarları oku
  const raw = (input as any).shop?.surchargeSettings?.value;
  if (!raw) return NO_CHANGES;

  let enabled = true;
  let rate = DEFAULT_RATE;
  try {
    const s = JSON.parse(raw);
    if (s.enabled === false) return NO_CHANGES;
    if (typeof s.percentage === "number" && s.percentage > 0) {
      rate = s.percentage / 100;
    }
  } catch {
    return NO_CHANGES;
  }

  if (!enabled) return NO_CHANGES;

  const lines = input.cart.lines;
  if (lines.length === 0) return NO_CHANGES;

  // Sepet toplamını hesapla
  let cartTotal = 0;
  for (const line of lines) {
    const price = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (!isNaN(price)) cartTotal += price * line.quantity;
  }

  if (cartTotal <= 0) return NO_CHANGES;

  // Surcharge tutarını tüm sepete böl — sadece ilk line'ı expand et
  // Diğer line'lar olduğu gibi kalır, ilk line expand edilir: [orijinal + surcharge]
  const surchargeAmount = parseFloat((cartTotal * rate).toFixed(2));
  if (surchargeAmount <= 0) return NO_CHANGES;

  const firstLine = lines[0];
  const firstLinePrice = parseFloat(firstLine.cost.amountPerQuantity.amount as string);

  return {
    operations: [
      {
        lineExpand: {
          cartLineId: firstLine.id,
          expandedCartItems: [
            {
              merchandiseId: (firstLine.merchandise as { __typename: "ProductVariant"; id: string }).id,
              quantity: firstLine.quantity,
              price: {
                adjustment: {
                  fixedPricePerUnit: {
                    amount: String(firstLinePrice),
                  },
                },
              },
            },
            {
              merchandiseId: SURCHARGE_VARIANT_ID,
              quantity: 1,
              price: {
                adjustment: {
                  fixedPricePerUnit: {
                    amount: String(surchargeAmount),
                  },
                },
              },
            },
          ],
        },
      },
    ],
  };
}
