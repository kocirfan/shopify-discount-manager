import type { RunInput } from "../generated/api";

type FunctionResult = {
  discounts: never[];
  discountApplicationStrategy: "FIRST";
};

// pickup-discount (product-discount target) kullanılıyor, bu function devre dışı
export function run(_input: RunInput): FunctionResult {
  return {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };
}
