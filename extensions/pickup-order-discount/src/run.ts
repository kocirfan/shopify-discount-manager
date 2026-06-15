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

const EXCLUDED_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";

export function run(input: RunInput): FunctionResult {
  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  if (cart.attribute?.value !== "pickup") {
    return emptyReturn;
  }

  return {
    discounts: [
      {
        value: {
          percentage: { value: "2.0" },
        },
        message: "%2 Pickup Korting",
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: [EXCLUDED_VARIANT_ID],
            },
          },
        ],
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
