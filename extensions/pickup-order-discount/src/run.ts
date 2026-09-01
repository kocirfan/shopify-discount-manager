// ============================================================
// PICKUP ORDER DISCOUNT
// Pickup (afhalen) seçildiğinde sepet ara toplamına %2 sipariş indirimi.
//
// API: Discount Function API (cart.lines.discounts.generate.run, 2026-07).
// Legacy "purchase.order-discount.run" 2026-04 itibarıyla kaldırıldı; çıktı
// `orderDiscountsAdd` + `orderSubtotal` hedefine taşındı.
// NOT: Legacy sürüm `productVariant` hedefleri döndürüyordu; Order Discount API'sinde
// bu hedef tipi bulunmadığı için o çıktı geçersizdi. Bu sürüm geçerli çıktı üretir.
//
// PICKUP TESPİTİ (öncelik sırası):
// 1. Checkout'ta SEÇİLİ teslimat seçeneği (deliveryGroups[].selectedDeliveryOption):
//    deliveryMethodType == PICK_UP -> pickup; SHIPPING vb. -> pickup DEĞİL.
//    Bu, kaynağı doğrudan Shopify olan tek güvenilir bilgidir.
// 2. Henüz teslimat seçilmemişse cart attribute `selected_delivery_type`
//    (delivery-tracker checkout UI yazar). Attribute tek başına kullanılmaz çünkü
//    Verzenden'e geçildiğinde UI extension sökülüp attribute "pickup"ta takılı
//    kalabiliyor (31.08.2026: kargo seçiliyken %2 pickup uygulandı).
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

type SelectedOption = {
  handle?: string | null;
  title?: string | null;
  deliveryMethodType?: string | null;
};

function looksLikePickup(option: SelectedOption): boolean {
  const type = String(option.deliveryMethodType || "").toUpperCase();
  if (type === "PICK_UP") return true;
  if (type && type !== "NONE") return false; // SHIPPING, LOCAL, RETAIL, PICKUP_POINT -> pickup değil

  // Tip bilgisi yoksa başlık/handle sezgisi (eski davranış)
  const title = (option.title || "").toLowerCase();
  const handle = String(option.handle || "").toLowerCase();
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

export function isPickupSelected(cart: CartLinesDiscountsGenerateRunInput["cart"]): boolean {
  const selectedOptions = (cart.deliveryGroups || [])
    .map((group) => group?.selectedDeliveryOption as SelectedOption | null | undefined)
    .filter((option): option is SelectedOption => !!option);

  // 1) Teslimat seçilmişse yalnızca o belirleyicidir (tüm gruplar pickup olmalı)
  if (selectedOptions.length > 0) {
    return selectedOptions.every(looksLikePickup);
  }

  // 2) Henüz seçim yoksa checkout UI'ın yazdığı attribute'a bak
  return cart.attribute?.value === "pickup";
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
