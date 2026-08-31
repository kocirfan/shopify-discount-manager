import { describe, it, expect } from "vitest";
import { run } from "./run";

describe("customer-tag-discount (deprecated no-op)", () => {
  it("her zaman boş operations döndürür", () => {
    expect(run({ discount: { discountClasses: ["ORDER", "PRODUCT"] } } as any)).toEqual({ operations: [] });
  });
});
