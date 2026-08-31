// ============================================================
// CUSTOMER TAG DISCOUNT - ORDER LEVEL (DEPRECATED)
// Bu extension artık kullanılmıyor.
// Yeni "customer-tag-product-discount" extension'ı kullanın.
//
// API: Discount Function API (cart.lines.discounts.generate.run, 2026-07).
// Legacy "purchase.order-discount.run" 2026-04 itibarıyla kaldırıldığı için
// deploy edilebilir kalması adına yeni API'ye taşındı; davranış değişmedi:
// her zaman boş operations döndürür.
// ============================================================

import type { CartLinesDiscountsGenerateRunInput } from "../generated/api";

type FunctionResult = { operations: never[] };

export function run(_input: CartLinesDiscountsGenerateRunInput): FunctionResult {
  // Bu extension artık kullanılmıyor - her zaman boş döndür
  return { operations: [] };
}
