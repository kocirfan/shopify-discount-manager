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

  // TEST: attribute kontrolü geçici olarak kapatıldı
  // if (cart.attribute?.value !== "pickup") {
  //   return emptyReturn;
  // }

  return {
    discounts: [
      {
        value: {
          percentage: { value: "2.0" },
        },
        message: "%2 Pickup Korting",
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
