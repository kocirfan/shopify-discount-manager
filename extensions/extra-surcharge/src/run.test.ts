import { describe, it, expect } from "vitest";
import { run } from "./run";
import type { CartTransformRunInput } from "../generated/api";

const SETTINGS = JSON.stringify({ enabled: true, percentage: 5, label: "Service Toeslag" });

const baseInput: CartTransformRunInput = {
  cart: {
    lines: [
      {
        id: "gid://shopify/CartLine/1",
        quantity: 1,
        cost: {
          amountPerQuantity: { amount: "268.47" },
          subtotalAmount: { amount: "268.47" },
        },
        merchandise: {
          __typename: "ProductVariant",
          id: "gid://shopify/ProductVariant/999999999",
        },
      },
    ],
  },
  shop: {
    surchargeSettings: {
      value: SETTINGS,
    },
  },
};

describe("run", () => {
  it("returns NO_CHANGES when settings missing", () => {
    const input = { ...baseInput, shop: { surchargeSettings: null } } as any;
    const result = run(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns NO_CHANGES when disabled", () => {
    const input = {
      ...baseInput,
      shop: { surchargeSettings: { value: JSON.stringify({ enabled: false, percentage: 5, label: "x" }) } },
    } as any;
    const result = run(input);
    expect(result.operations).toHaveLength(0);
  });

  it("creates lineExpand with surcharge for a single product", () => {
    const result = run(baseInput as any);
    console.log("RESULT:", JSON.stringify(result, null, 2));
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0] as any;
    expect(op.lineExpand).toBeDefined();
    expect(op.lineExpand.expandedCartItems).toHaveLength(2);
    // İlk item: orijinal ürün
    expect(op.lineExpand.expandedCartItems[0].merchandiseId).toBe("gid://shopify/ProductVariant/999999999");
    expect(op.lineExpand.expandedCartItems[0].price.adjustment.fixedPricePerUnit.amount).toBe("268.47");
    // İkinci item: surcharge
    expect(op.lineExpand.expandedCartItems[1].merchandiseId).toBe("gid://shopify/ProductVariant/61571547791690");
    // 268.47 * 0.05 = 13.42
    expect(op.lineExpand.expandedCartItems[1].price.adjustment.fixedPricePerUnit.amount).toBe("13.42");
  });

  it("calculates surcharge from cart subtotal (multiple lines)", () => {
    const input: CartTransformRunInput = {
      ...baseInput,
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            cost: {
              amountPerQuantity: { amount: "100.00" },
              subtotalAmount: { amount: "200.00" },
            },
            merchandise: {
              __typename: "ProductVariant",
              id: "gid://shopify/ProductVariant/111",
            },
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 1,
            cost: {
              amountPerQuantity: { amount: "50.00" },
              subtotalAmount: { amount: "50.00" },
            },
            merchandise: {
              __typename: "ProductVariant",
              id: "gid://shopify/ProductVariant/222",
            },
          },
        ],
      },
    } as any;

    const result = run(input as any);
    console.log("MULTI-LINE RESULT:", JSON.stringify(result, null, 2));
    // subtotal = 200 + 50 = 250, surcharge = 250 * 0.05 = 12.50
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0] as any;
    expect(op.lineExpand.expandedCartItems[1].price.adjustment.fixedPricePerUnit.amount).toBe("12.50");
  });
});
