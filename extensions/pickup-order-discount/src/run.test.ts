import { describe, it, expect } from "vitest";
import { run } from "./run";

function input(opts: { attr?: string | null; option?: { handle: string; title: string } | null; classes?: string[]; lines?: number } = {}) {
  const lines = Array.from({ length: opts.lines ?? 2 }, (_, i) => ({ id: `gid://shopify/CartLine/${i}` }));
  return {
    cart: {
      lines,
      deliveryGroups: opts.option === undefined ? [] : [{ id: "g", selectedDeliveryOption: opts.option }],
      attribute: opts.attr === undefined || opts.attr === null ? null : { value: opts.attr },
    },
    discount: { discountClasses: opts.classes ?? ["ORDER"] },
  } as any;
}

const expected = {
  operations: [
    {
      orderDiscountsAdd: {
        candidates: [
          {
            message: "%2 Pickup Korting",
            targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
            value: { percentage: { value: 2 } },
          },
        ],
        selectionStrategy: "FIRST",
      },
    },
  ],
};

describe("pickup-order-discount (Discount Function API)", () => {
  it("attribute=pickup -> %2 sipariş indirimi", () => {
    expect(run(input({ attr: "pickup" }))).toEqual(expected);
  });
  it("attribute=shipping -> indirim yok (deliveryGroups pickup dese bile)", () => {
    expect(run(input({ attr: "shipping", option: { handle: "pickup-1", title: "Afhalen" } })).operations).toHaveLength(0);
  });
  it("attribute yok, seçili teslimat 'Afhalen' -> indirim", () => {
    expect(run(input({ option: { handle: "x", title: "Afhalen Terheijdenseweg" } }))).toEqual(expected);
  });
  it("attribute yok, seçili teslimat kargo -> indirim yok", () => {
    expect(run(input({ option: { handle: "standard", title: "Verzending" } })).operations).toHaveLength(0);
  });
  it("attribute yok, teslimat seçilmemiş -> indirim yok", () => {
    expect(run(input({ option: null })).operations).toHaveLength(0);
    expect(run(input({})).operations).toHaveLength(0);
  });
  it("ORDER sınıfı açık değilse indirim yok", () => {
    expect(run(input({ attr: "pickup", classes: ["PRODUCT"] })).operations).toHaveLength(0);
  });
  it("sepet boşsa indirim yok", () => {
    expect(run(input({ attr: "pickup", lines: 0 })).operations).toHaveLength(0);
  });
});
