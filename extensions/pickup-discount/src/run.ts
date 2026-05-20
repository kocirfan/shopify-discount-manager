import type {
  RunInput,
  FunctionRunResult,
} from "../generated/api";

const DISCOUNT_PERCENTAGE = 2;

export function run(input: RunInput): FunctionRunResult {
  const cart = input.cart;

  // Check if pickup delivery is selected
  const hasPickup = cart.deliveryGroups?.some((group) => {
    const selected = group.selectedDeliveryOption;
    if (!selected) return false;

    const title = selected.title?.toLowerCase() || "";
    const handle = selected.handle?.toLowerCase() || "";

    // Check for pickup keywords
    return (
      title.includes("pickup") ||
      title.includes("ophalen") ||
      title.includes("afhalen") ||
      title.includes("terheijdenseweg") ||
      handle.includes("pickup")
    );
  });

  if (!hasPickup) {
    return {
      discounts: [],
    };
  }

  // Ordertoeslag variant ID - pickup indiriminden hariç tut
  const excludedVariantId = "gid://shopify/ProductVariant/61571547791690";

  const targets = cart.lines
    .filter((line) => {
      if (line.merchandise.__typename !== "ProductVariant") return false;
      if ((line.merchandise as any).id === excludedVariantId) return false;
      return true;
    })
    .map((line) => ({ cartLine: { id: line.id } }));

  if (targets.length === 0) {
    return { discounts: [] };
  }

  return {
    discounts: [
      {
        value: {
          percentage: {
            value: DISCOUNT_PERCENTAGE,
          },
        },
        targets,
        message: `${DISCOUNT_PERCENTAGE}% Pickup Korting`,
      },
    ],
  };
}
