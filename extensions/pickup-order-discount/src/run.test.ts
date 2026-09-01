import { describe, it, expect } from "vitest";
import { run, isPickupSelected } from "./run";

type Opt = { handle: string; title: string; deliveryMethodType?: string } | null;
function input(opts: { attr?: string | null; option?: Opt; classes?: string[]; lines?: number } = {}) {
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

const PICKUP = { handle: "afhalen-terheijdenseweg", title: "Terheijdenseweg 439", deliveryMethodType: "PICK_UP" };
const SHIPPING = { handle: "standard", title: "Verzending", deliveryMethodType: "SHIPPING" };

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
  it("seçili teslimat PICK_UP -> %2 sipariş indirimi", () => {
    expect(run(input({ option: PICKUP }))).toEqual(expected);
  });
  it("seçili teslimat SHIPPING -> indirim yok, attribute 'pickup' takılı kalsa bile", () => {
    expect(run(input({ option: SHIPPING, attr: "pickup" })).operations).toHaveLength(0);
  });
  it("seçili teslimat PICKUP_POINT / LOCAL -> indirim yok", () => {
    expect(run(input({ option: { handle: "x", title: "Afhaalpunt", deliveryMethodType: "PICKUP_POINT" } })).operations).toHaveLength(0);
    expect(run(input({ option: { handle: "x", title: "Bezorging", deliveryMethodType: "LOCAL" } })).operations).toHaveLength(0);
  });
  it("tip bilgisi yoksa başlık/handle sezgisi (eski davranış)", () => {
    expect(run(input({ option: { handle: "x", title: "Afhalen Terheijdenseweg" } }))).toEqual(expected);
    expect(run(input({ option: { handle: "standard", title: "Verzending" } })).operations).toHaveLength(0);
  });
  it("teslimat seçilmemiş, attribute=pickup -> indirim (checkout UI ipucu)", () => {
    expect(run(input({ attr: "pickup" }))).toEqual(expected);
    expect(run(input({ attr: "pickup", option: null }))).toEqual(expected);
  });
  it("teslimat seçilmemiş, attribute yok/shipping -> indirim yok", () => {
    expect(run(input({})).operations).toHaveLength(0);
    expect(run(input({ attr: "shipping" })).operations).toHaveLength(0);
  });
  it("ORDER sınıfı açık değilse indirim yok", () => {
    expect(run(input({ option: PICKUP, classes: ["PRODUCT"] })).operations).toHaveLength(0);
  });
  it("sepet boşsa indirim yok", () => {
    expect(run(input({ option: PICKUP, lines: 0 })).operations).toHaveLength(0);
  });
  it("isPickupSelected: birden fazla grup varsa hepsi pickup olmalı", () => {
    const cart = { lines: [{ id: "a" }], attribute: null, deliveryGroups: [
      { id: "g1", selectedDeliveryOption: PICKUP }, { id: "g2", selectedDeliveryOption: SHIPPING },
    ] } as any;
    expect(isPickupSelected(cart)).toBe(false);
  });
});
