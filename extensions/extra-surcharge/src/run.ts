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

  // Sepet toplamını hesapla
  let cartTotal = 0;
  for (const line of input.cart.lines) {
    const price = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (!isNaN(price)) cartTotal += price * line.quantity;
  }
  console.log("[extra-surcharge] Cart total:", cartTotal.toFixed(2));
  console.log("[extra-surcharge] Surcharge would be:", (cartTotal * rate).toFixed(2));

  // CartTransform lineUpdate/lineExpand fiyat artıramaz — şimdilik no-op
  return NO_CHANGES;
}
