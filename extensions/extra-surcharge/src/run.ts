import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

// Cart Transform artık gerekli değil — fiyat JS tarafında /cart/add.js price param ile set ediliyor.
// Bu function NO_CHANGES döner, kayıtlı olması yeterli.
const NO_CHANGES: CartTransformRunResult = { operations: [] };

export function run(_input: CartTransformRunInput): CartTransformRunResult {
  return NO_CHANGES;
}
