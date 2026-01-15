// ============================================================
// CUSTOMER TAG DISCOUNT - ORDER LEVEL (DEPRECATED)
// Bu extension artık kullanılmıyor.
// Yeni "customer-tag-product-discount" extension'ı kullanın.
// ============================================================

type FunctionResult = {
  discounts: {
    value: {
      fixedAmount?: { amount: string };
      percentage?: { value: string };
    };
    message?: string;
    targets?: { orderSubtotal?: { excludedVariantIds: string[] } }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

interface RunInput {
  cart: {
    cost: { subtotalAmount: { amount: string } };
    buyerIdentity?: {
      customer?: {
        id: string;
        email?: string;
        hasTags?: { hasTag: boolean; tag: string }[];
      };
    };
  };
  shop?: { customerTagDiscountRules?: { value?: string } };
}

export function run(input: RunInput): FunctionResult {
  console.error("=== CUSTOMER TAG DISCOUNT (ORDER LEVEL - DEPRECATED) ===");
  console.error("Bu extension devre dışı. 'customer-tag-product-discount' kullanın.");

  // Bu extension artık kullanılmıyor - her zaman boş döndür
  return {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };
}
