import type { RunInput } from "../generated/api";

type FunctionResult = {
  discounts: {
    value: {
      fixedAmount?: { amount: string };
      percentage?: { value: string };
    };
    message?: string;
    targets?: {
      orderSubtotal?: { excludedVariantIds: string[] };
    }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

export function run(input: RunInput): FunctionResult {
  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  const selectedDeliveryType = cart.attribute?.value;
  if (selectedDeliveryType !== "pickup") {
    return emptyReturn;
  }

  const originalSubtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const pickupDiscountAmount = (originalSubtotal * 0.02).toFixed(2);

  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: pickupDiscountAmount,
          },
        },
        message: "%2 Pickup Korting",
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: ["gid://shopify/ProductVariant/61571547791690"],
            },
          },
        ],
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
