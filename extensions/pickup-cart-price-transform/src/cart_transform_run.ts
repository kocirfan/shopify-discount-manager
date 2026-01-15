import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

// ============================================================
// CART TRANSFORM - DEVRE DIŞI
// ============================================================
// Bu extension artık kullanılmıyor.
// Pickup indirimi "pickup-order-discount" function'ı tarafından
// SEPET TOPLAMI üzerinden uygulanıyor.
//
// Cart Transform'un fixedPricePerUnit kullanması, teslimat
// yöntemi değiştiğinde eski fiyat değişikliklerinin kalmasına
// neden oluyordu. Bu sorunu çözmek için Cart Transform
// tamamen devre dışı bırakıldı.
// ============================================================

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function run(input: CartTransformRunInput): CartTransformRunResult {
  console.error('=== CART TRANSFORM - DEVRE DIŞI ===');
  console.error('Pickup indirimi "pickup-order-discount" tarafından uygulanıyor.');
  console.error('Bu function hiçbir değişiklik yapmıyor.');

  // Her zaman boş operations döndür - hiçbir fiyat değişikliği yapma
  return NO_CHANGES;
}
