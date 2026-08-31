// ============================================================
// PICKUP ORDER DISCOUNT
// Pickup (afhalen) seçildiğinde sepet ara toplamına %2 sipariş indirimi.
//
// API: Discount Function API (cart.lines.discounts.generate.run, 2026-07).
// Legacy "purchase.order-discount.run" 2026-04 itibarıyla kaldırıldı; çıktı
// `orderDiscountsAdd` + `orderSubtotal` hedefine taşındı. Pickup tespiti aynıdır.
// NOT: Legacy sürüm `productVariant` hedefleri döndürüyordu; Order Discount API'sinde
// bu hedef tipi bulunmadığı için o çıktı geçersizdi. Bu sürüm geçerli çıktı üretir.
// ============================================================

import type { CartLinesDiscountsGenerateRunInput } from "../generated/api";

const PICKUP_DISCOUNT_PERCENTAGE = 2;

type FunctionResult = {
  operations: {
    orderDiscountsAdd: {
      candidates: {
        message?: string;
        targets: { orderSubtotal: { excludedCartLineIds: string[] } }[];
        value: { percentage: { value: number } };
      }[];
      selectionStrategy: "FIRST" | "MAXIMUM";
    };
  }[];
};

function isPickupSelected(cart: CartLinesDiscountsGenerateRunInput["cart"]): boolean {
  // Önce cart attribute'dan delivery type'ı kontrol et (Checkout UI tarafından set edilir)
  const selectedDeliveryType = cart.attribute?.value;
  if (selectedDeliveryType) {
    return selectedDeliveryType === "pickup";
  }

  // Cart attribute yoksa deliveryGroups'tan tespit et
  const deliveryGroups = cart.deliveryGroups || [];
  if (deliveryGroups.length === 0) return false;

  const selected = deliveryGroups[0]?.selectedDeliveryOption;
  if (!selected) return false;

  const title = (selected.title || "").toLowerCase();
  const handle = String(selected.handle || "").toLowerCase();
  return (
    title.includes("pickup") ||
    title.includes("afhalen") ||
    title.includes("abholung") ||
    title.includes("terheijdenseweg") ||
    handle.includes("pickup") ||
    handle.includes("afhalen") ||
    handle.includes("terheijdenseweg")
  );
}

export function run(input: CartLinesDiscountsGenerateRunInput): FunctionResult {
  const emptyReturn: FunctionResult = { operations: [] };

  const discountClasses = (input.discount?.discountClasses || []) as string[];
  if (!discountClasses.includes("ORDER")) return emptyReturn;

  const cart = input.cart;
  if (!cart.lines || cart.lines.length === 0) return emptyReturn;
  if (!isPickupSelected(cart)) return emptyReturn;

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: `%${PICKUP_DISCOUNT_PERCENTAGE} Pickup Korting`,
              // Legacy sürümdeki gibi tüm satırlar dahil (hariç tutulan satır yok)
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: { percentage: { value: PICKUP_DISCOUNT_PERCENTAGE } },
            },
          ],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}
