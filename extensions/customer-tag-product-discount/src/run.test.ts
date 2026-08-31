import { describe, it, expect } from "vitest";
import { run } from "./run";

const SURCHARGE = "gid://shopify/ProductVariant/61571547791690";

function line(id: string, variantId: string, productId: string, nodiscount = false) {
  return {
    id,
    quantity: 1,
    merchandise: {
      __typename: "ProductVariant" as const,
      id: variantId,
      product: { id: productId, title: "x", hasAnyTag: nodiscount },
    },
    cost: { amountPerQuantity: { amount: "100.00", currencyCode: "EUR" } },
  };
}

function input(opts: {
  classes?: string[];
  customer?: any;
  lines?: any[];
  rules?: any[];
  excluded?: string[];
}) {
  return {
    cart: {
      lines: opts.lines ?? [
        line("gid://shopify/CartLine/a", "gid://shopify/ProductVariant/1", "gid://shopify/Product/1"),
        line("gid://shopify/CartLine/s", SURCHARGE, "gid://shopify/Product/s"),
      ],
      buyerIdentity: opts.customer === null ? null : { customer: opts.customer ?? { id: "gid://shopify/Customer/1", exactDiscountCode: { value: "korting-25" }, hasTags: [] } },
    },
    discount: { discountClasses: opts.classes ?? ["PRODUCT"] },
    shop: {
      customerTagDiscountRules: opts.rules ? { value: JSON.stringify(opts.rules) } : null,
      excludedProducts: opts.excluded ? { value: JSON.stringify(opts.excluded) } : null,
    },
  } as any;
}

describe("customer-tag-product-discount (Discount Function API)", () => {
  it("PRODUCT sınıfı açık değilse hiçbir şey üretmez", () => {
    expect(run(input({ classes: ["ORDER"] })).operations).toHaveLength(0);
  });

  it("guest için indirim yok", () => {
    expect(run(input({ customer: null })).operations).toHaveLength(0);
  });

  it("exact_discount_code (korting-25) -> %25 productDiscountsAdd, surcharge satırı hariç", () => {
    const result = run(input({}));
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0].productDiscountsAdd;
    expect(op.selectionStrategy).toBe("FIRST");
    expect(op.candidates).toHaveLength(1);
    expect(op.candidates[0].value).toEqual({ percentage: { value: 25 } });
    expect(op.candidates[0].message).toBe("Korting");
    expect(op.candidates[0].targets).toEqual([{ cartLine: { id: "gid://shopify/CartLine/a" } }]);
  });

  it("eski metafield (percentage) ikinci öncelik", () => {
    const result = run(input({ customer: { id: "c", discountPercentage: { value: "12.5" }, hasTags: [] } }));
    expect(result.operations[0].productDiscountsAdd.candidates[0].value.percentage.value).toBe(12.5);
  });

  it("tag + kurallar: en yüksek eşleşen kural", () => {
    const result = run(
      input({
        customer: { id: "c", hasTags: [{ hasTag: true, tag: "korting-10" }, { hasTag: true, tag: "vip" }] },
        rules: [
          { id: "1", customerTag: "korting-10", discountPercentage: 10, discountName: "a", enabled: true },
          { id: "2", customerTag: "vip", discountPercentage: 15, discountName: "b", enabled: true },
          { id: "3", customerTag: "vip", discountPercentage: 40, discountName: "c", enabled: false },
        ],
      })
    );
    expect(result.operations[0].productDiscountsAdd.candidates[0].value.percentage.value).toBe(15);
  });

  it("tag var ama kural yoksa indirim yok", () => {
    const result = run(input({ customer: { id: "c", hasTags: [{ hasTag: true, tag: "vip" }] } }));
    expect(result.operations).toHaveLength(0);
  });

  it("nodiscount tag'li ve excluded ürünler hedeflenmez", () => {
    const result = run(
      input({
        lines: [
          line("gid://shopify/CartLine/a", "gid://shopify/ProductVariant/1", "gid://shopify/Product/1"),
          line("gid://shopify/CartLine/b", "gid://shopify/ProductVariant/2", "gid://shopify/Product/2", true),
          line("gid://shopify/CartLine/c", "gid://shopify/ProductVariant/3", "gid://shopify/Product/3"),
        ],
        excluded: ["gid://shopify/Product/3"],
      })
    );
    expect(result.operations[0].productDiscountsAdd.candidates[0].targets).toEqual([
      { cartLine: { id: "gid://shopify/CartLine/a" } },
    ]);
  });

  it("hedef kalmazsa boş döner", () => {
    const result = run(input({ lines: [line("gid://shopify/CartLine/s", SURCHARGE, "gid://shopify/Product/s")] }));
    expect(result.operations).toHaveLength(0);
  });
});
