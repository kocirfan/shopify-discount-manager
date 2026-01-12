import type {
  RunInput,
} from "../generated/api";

const DISCOUNT_PERCENTAGE = 2;

// Order discount function output type
type FunctionResult = {
  discounts: {
    value: {
      fixedAmount?: {
        amount: string;
      };
      percentage?: {
        value: string;
      };
    };
    message?: string;
    targets?: {
      orderSubtotal?: {
        excludedVariantIds: string[];
      };
    }[];
  }[];
};

export function run(input: RunInput): FunctionResult {
  const cart = input.cart;

  console.error('[PICKUP ORDER DISCOUNT] Starting...');

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

  console.error('[PICKUP ORDER DISCOUNT] Is pickup:', hasPickup);

  if (!hasPickup) {
    console.error('[PICKUP ORDER DISCOUNT] Not pickup, no discount');
    return {
      discounts: [],
    };
  }

  // Calculate 2% discount on cart subtotal
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const discountAmount = (subtotal * (DISCOUNT_PERCENTAGE / 100)).toFixed(2);

  console.error('[PICKUP ORDER DISCOUNT] Subtotal:', subtotal);
  console.error('[PICKUP ORDER DISCOUNT] Discount amount:', discountAmount);

  // Return order-level discount (applies to entire cart)
  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: discountAmount,
          },
        },
        message: `${DISCOUNT_PERCENTAGE}% korting bij afhalen`,
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: []
            }
          }
        ]
      },
    ],
  };
}
