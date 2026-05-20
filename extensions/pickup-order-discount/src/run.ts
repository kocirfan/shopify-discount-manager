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

interface CustomerTagRule {
  id: string;
  customerTag: string;
  discountPercentage: number;
  discountName: string;
  enabled: boolean;
}

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

  // ============================================================
  // MÜŞTERİ TAG İNDİRİMİNİ BUL
  // subtotalAmount tag indirimi öncesi değeri içeriyor,
  // bu yüzden tag indirimini bulup subtotal'dan düşmemiz gerekiyor
  // ============================================================
  let tagDiscountPercent = 0;
  const customer = cart.buyerIdentity?.customer;

  if (customer?.id) {
    // Öncelik 1: metafield
    const metafieldValue = (customer as any).discountPercentage?.value;
    if (metafieldValue) {
      const parsed = parseFloat(metafieldValue);
      if (!isNaN(parsed) && parsed > 0) {
        tagDiscountPercent = parsed;
      }
    }

    // Öncelik 2: exactDiscountCode metafield (korting-XX formatı)
    if (tagDiscountPercent === 0) {
      const exactCode = (customer as any).exactDiscountCode?.value as string | undefined;
      if (exactCode) {
        const match = exactCode.match(/^korting-(.+)$/i);
        if (match) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed > 0) {
            tagDiscountPercent = parsed;
          }
        }
      }
    }

    // Öncelik 3: tag sistemi
    if (tagDiscountPercent === 0) {
      const activeTags = (customer.hasTags || [])
        .filter((t: any) => t.hasTag)
        .map((t: any) => t.tag.toLowerCase());

      const rulesJson = (input as any).shop?.customerTagDiscountRules?.value;
      if (rulesJson && activeTags.length > 0) {
        try {
          const rules: CustomerTagRule[] = JSON.parse(rulesJson);
          for (const rule of rules) {
            if (!rule.enabled) continue;
            if (
              activeTags.includes(rule.customerTag.toLowerCase()) &&
              rule.discountPercentage > tagDiscountPercent
            ) {
              tagDiscountPercent = rule.discountPercentage;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // ============================================================
  // DOĞRU BASE HESAPLA
  // Ordertoeslag hariç, tüm lines'ın orijinal fiyatlarını topla
  // Sonra tag indirimini uygula → pickup %2'nin uygulanacağı base
  // ============================================================
  const linesWithoutToeslag = (cart as any).lines.filter(
    (l: any) => l.merchandise?.id !== EXCLUDED_VARIANT_ID
  );

  const originalBaseWithoutToeslag = linesWithoutToeslag.reduce((sum: number, line: any) => {
    return sum + parseFloat(line.cost.amountPerQuantity.amount) * line.quantity;
  }, 0);

  // Tag indirimi uygulanmış değer
  const discountedBase = originalBaseWithoutToeslag * (1 - tagDiscountPercent / 100);

  const pickupDiscountAmount = (discountedBase * 0.02).toFixed(2);

  return {
    discounts: [
      {
        value: {
          fixedAmount: { amount: pickupDiscountAmount },
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
