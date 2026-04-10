import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

interface SurchargeSettings {
  enabled: boolean;
  percentage: number;
  label: string;
}

const NO_CHANGES: CartTransformRunResult = { operations: [] };

export function run(input: CartTransformRunInput): CartTransformRunResult {
  console.log("[extra-surcharge] run() called");

  const settingsJson = input.shop?.surchargeSettings?.value;
  console.log("[extra-surcharge] settingsJson:", settingsJson);
  if (!settingsJson) return NO_CHANGES;

  let settings: SurchargeSettings;
  try {
    settings = JSON.parse(settingsJson);
  } catch {
    return NO_CHANGES;
  }

  if (!settings.enabled || !settings.percentage || settings.percentage <= 0) {
    return NO_CHANGES;
  }

  const cartTotal = input.cart.lines.reduce((sum, line) => {
    const price = parseFloat(line.cost.amountPerQuantity.amount as string);
    return sum + (isNaN(price) ? 0 : price * line.quantity);
  }, 0);

  console.log("[extra-surcharge] Surcharge percentage:", settings.percentage + "%");
  console.log("[extra-surcharge] Cart total:", cartTotal.toFixed(2));

  const rate = settings.percentage / 100;
  const operations: CartTransformRunResult["operations"] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const originalPrice = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (isNaN(originalPrice) || originalPrice <= 0) continue;

    // Fiyatı (1 + rate) ile çarp: %5 için 1.05x
    const newPrice = (originalPrice * (1 + rate)).toFixed(2);

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: newPrice },
          },
        },
      },
    });
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
