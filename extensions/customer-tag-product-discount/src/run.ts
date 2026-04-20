// ============================================================
// CUSTOMER TAG PRODUCT DISCOUNT — DEVRE DIŞI
// Müşteri tag/metafield bazlı indirim operasyonu iptal edildi.
// ============================================================

type FunctionResult = {
  discounts: {
    value: { percentage: { value: string } };
    message?: string;
    targets: { productVariant: { id: string } }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

interface RunInput {
  cart: unknown;
  shop?: unknown;
}

export function run(_input: RunInput): FunctionResult {
  // Müşteri tag indirimi devre dışı — her zaman boş döndür
  return {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };
}
