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

  // Ordertoeslag hariç, lines üzerinden indirimli subtotal hesapla
  const excludedVariantId = "gid://shopify/ProductVariant/61571547791690";
  const linesSubtotal = (cart as any).lines.reduce((sum: number, line: any) => {
    if (line.merchandise?.id === excludedVariantId) return sum;
    return sum + parseFloat(line.cost.amountPerQuantity.amount) * line.quantity;
  }, 0);

  const pickupDiscountAmount = (linesSubtotal * 0.02).toFixed(2);

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
