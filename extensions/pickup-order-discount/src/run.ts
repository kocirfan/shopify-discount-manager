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

  // Önce cart attribute'dan delivery type'ı kontrol et (Checkout UI tarafından set edilir)
  const selectedDeliveryType = (cart as any).attribute?.value;
  if (selectedDeliveryType) {
    if (selectedDeliveryType !== "pickup") return emptyReturn;
  } else {
    // Cart attribute yoksa deliveryGroups'tan tespit et
    const deliveryGroups = (cart as any).deliveryGroups || [];
    if (deliveryGroups.length === 0) return emptyReturn;

    const firstGroup = deliveryGroups[0];
    const selected = firstGroup?.selectedDeliveryOption;
    if (!selected) return emptyReturn;

    const title = (selected.title || "").toLowerCase();
    const handle = (selected.handle || "").toLowerCase();
    const isPickup =
      title.includes("pickup") ||
      title.includes("afhalen") ||
      title.includes("abholung") ||
      title.includes("terheijdenseweg") ||
      handle.includes("pickup") ||
      handle.includes("afhalen") ||
      handle.includes("terheijdenseweg");

    if (!isPickup) return emptyReturn;
  }

  const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";

  // ORDERTOESLAG (surcharge) içeren satırları hariç tut
  const targets = ((cart as any).lines || [])
    .filter((line: any) => line.merchandise?.id !== SURCHARGE_VARIANT_ID)
    .map((line: any) => ({ productVariant: { id: line.merchandise.id } }));

  if (targets.length === 0) return emptyReturn;

  return {
    discounts: [
      {
        value: {
          percentage: { value: "2.0" },
        },
        message: "%2 Pickup Korting",
        targets,
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
