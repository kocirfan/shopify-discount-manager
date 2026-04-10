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

  const rate = settings.percentage / 100;

  // Sadece ilk line'ı güncelle — test amaçlı
  const firstLine = input.cart.lines.find(
    (line) => line.merchandise.__typename === "ProductVariant"
  );
  if (!firstLine) return NO_CHANGES;

  const originalPrice = parseFloat(firstLine.cost.amountPerQuantity.amount as string);
  if (isNaN(originalPrice) || originalPrice <= 0) return NO_CHANGES;

  const newPrice = (originalPrice * (1 + rate)).toFixed(2);
  console.log("[extra-surcharge] originalPrice:", originalPrice, "newPrice:", newPrice);

  return {
    operations: [
      {
        lineUpdate: {
          cartLineId: firstLine.id,
          price: {
            adjustment: {
              fixedPricePerUnit: { amount: newPrice },
            },
          },
        },
      },
    ],
  };
}
