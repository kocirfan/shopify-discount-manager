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

  // Calculate 2% discount
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const discountAmount = (subtotal * (DISCOUNT_PERCENTAGE / 100)).toFixed(2);

  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: discountAmount,
          },
        },
        message: `${DISCOUNT_PERCENTAGE}% korting bij afhalen`,
      },
    ],
  };
}
