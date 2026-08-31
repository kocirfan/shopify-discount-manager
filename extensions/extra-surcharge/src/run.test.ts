import { describe, it, expect } from "vitest";
import { run, parseDiscountedBaseHint } from "./run";

const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";
const EXEMPT_PRODUCT_ID = "gid://shopify/Product/15252021281098";

type LineOpts = {
  id?: string;
  variantId: string;
  productId?: string;
  price: string;
  quantity?: number;
  nodiscount?: boolean;
  surchargeBase?: string | null;
};

function line(opts: LineOpts) {
  const quantity = opts.quantity ?? 1;
  const total = (parseFloat(opts.price) * quantity).toFixed(2);
  return {
    id: opts.id ?? `gid://shopify/CartLine/${opts.variantId.split("/").pop()}`,
    quantity,
    cost: {
      totalAmount: { amount: total },
      amountPerQuantity: { amount: opts.price },
    },
    surchargeBase: opts.surchargeBase === undefined ? null : opts.surchargeBase === null ? null : { value: opts.surchargeBase },
    merchandise: {
      __typename: "ProductVariant" as const,
      id: opts.variantId,
      product: {
        id: opts.productId ?? `gid://shopify/Product/${opts.variantId.split("/").pop()}`,
        hasAnyTag: opts.nodiscount === true,
      },
    },
  };
}

function surchargeLine(surchargeBase?: string | null) {
  return line({
    id: "gid://shopify/CartLine/surcharge",
    variantId: SURCHARGE_VARIANT_ID,
    productId: "gid://shopify/Product/surcharge",
    price: "0.00",
    surchargeBase,
  });
}

function input(lines: ReturnType<typeof line>[], extra: { exactDiscountCode?: string; excludedProducts?: string[] } = {}) {
  return {
    cart: {
      lines,
      buyerIdentity: extra.exactDiscountCode
        ? { customer: { exactDiscountCode: { value: extra.exactDiscountCode }, discountPercentage: null, hasTags: [] } }
        : null,
    },
    shop: {
      customerTagDiscountRules: null,
      excludedProducts: extra.excludedProducts ? { value: JSON.stringify(extra.excludedProducts) } : null,
    },
  } as any;
}

function surchargeAmount(result: any): string | null {
  if (!result.operations.length) return null;
  return result.operations[0].update.price.adjustment.fixedPricePerUnit.amount;
}

const DESK = "gid://shopify/ProductVariant/111";
const CHAIR = "gid://shopify/ProductVariant/222";

describe("run — mevcut mantık (değişmedi)", () => {
  it("surcharge satırı yoksa işlem yapmaz", () => {
    const result: any = run(input([line({ variantId: DESK, price: "320.00" })]));
    expect(result.operations).toHaveLength(0);
  });

  it("indirim yoksa indirimsiz toplamın %5'i", () => {
    const result = run(input([surchargeLine(), line({ variantId: DESK, price: "320.00" })]));
    expect(surchargeAmount(result)).toBe("16");
  });

  it("surcharge satırını update operasyonu ile fiyatlar", () => {
    const result: any = run(input([surchargeLine(), line({ variantId: DESK, price: "320.00" })]));
    expect(result.operations[0].update.cartLineId).toBe("gid://shopify/CartLine/surcharge");
  });

  it("Discount Manager müşteri indirimini (korting-25) hesaba yansıtır", () => {
    const result = run(
      input([surchargeLine(), line({ variantId: DESK, price: "320.00" })], { exactDiscountCode: "korting-25" })
    );
    // 320 * 0.75 = 240 -> %5 = 12
    expect(surchargeAmount(result)).toBe("12");
  });

  it("nodiscount tag'li ürüne müşteri indirimi uygulanmaz", () => {
    const result = run(
      input([surchargeLine(), line({ variantId: DESK, price: "320.00", nodiscount: true })], { exactDiscountCode: "korting-25" })
    );
    expect(surchargeAmount(result)).toBe("16");
  });

  it("excluded_products listesindeki ürüne müşteri indirimi uygulanmaz", () => {
    const result = run(
      input([surchargeLine(), line({ variantId: DESK, productId: "gid://shopify/Product/999", price: "100.00" })], {
        exactDiscountCode: "korting-25",
        excludedProducts: ["gid://shopify/Product/999"],
      })
    );
    expect(surchargeAmount(result)).toBe("5");
  });

  it("muaf ürünler (SURCHARGE_EXEMPT_PRODUCT_IDS) tabana dahil edilmez", () => {
    const result = run(
      input([
        surchargeLine(),
        line({ variantId: DESK, price: "320.00" }),
        line({ variantId: CHAIR, productId: EXEMPT_PRODUCT_ID, price: "500.00" }),
      ])
    );
    expect(surchargeAmount(result)).toBe("16");
  });

  it("çoklu satır ve adetleri toplar", () => {
    const result = run(
      input([
        surchargeLine(),
        line({ variantId: DESK, price: "100.00", quantity: 2 }),
        line({ variantId: CHAIR, price: "50.00" }),
      ])
    );
    // 250 * 0.05 = 12.5
    expect(surchargeAmount(result)).toBe("12.5");
  });
});

describe("run — _surcharge_base attribute (Shopify indirimleri)", () => {
  it("güncel hint mevcut hesaptan düşükse indirimli tutarı kullanır", () => {
    // Bureau 320 -> Shopify otomatik indirim %35 -> 208
    const hint = JSON.stringify({ "111": [1, 208] });
    const result = run(input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" })]));
    expect(surchargeAmount(result)).toBe("10.4");
  });

  it("hint yalnızca ilgili varyantı etkiler, diğerleri mevcut mantıkla hesaplanır", () => {
    const hint = JSON.stringify({ "111": [1, 208] });
    const result = run(
      input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" }), line({ variantId: CHAIR, price: "100.00" })])
    );
    // 208 + 100 = 308 -> 15.4
    expect(surchargeAmount(result)).toBe("15.4");
  });

  it("adet eşleşmiyorsa hint bayattır ve yok sayılır", () => {
    const hint = JSON.stringify({ "111": [1, 208] });
    const result = run(input([surchargeLine(hint), line({ variantId: DESK, price: "320.00", quantity: 2 })]));
    // 640 * 0.05 = 32
    expect(surchargeAmount(result)).toBe("32");
  });

  it("aynı varyantın birden fazla satırını adet ve tutar olarak toplar", () => {
    const hint = JSON.stringify({ "111": [3, 624] }); // 3 x 208
    const result = run(
      input([
        surchargeLine(hint),
        line({ id: "gid://shopify/CartLine/a", variantId: DESK, price: "320.00", quantity: 1 }),
        line({ id: "gid://shopify/CartLine/b", variantId: DESK, price: "320.00", quantity: 2 }),
      ])
    );
    // 624 * 0.05 = 31.2
    expect(surchargeAmount(result)).toBe("31.2");
  });

  it("hint mevcut hesaptan yüksekse mevcut hesap korunur (asla yukarı değişmez)", () => {
    // korting-25 -> 240; hint indirimsiz 320 diyor -> 240 kalır
    const hint = JSON.stringify({ "111": [1, 320] });
    const result = run(
      input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" })], { exactDiscountCode: "korting-25" })
    );
    expect(surchargeAmount(result)).toBe("12");
  });

  it("müşteri indirimi + Shopify indirimi: daha düşük olan (gerçek ödenen) kullanılır", () => {
    // korting-25 -> 240; Shopify'da en iyi indirim %35 uygulanmış -> 208
    const hint = JSON.stringify({ "111": [1, 208] });
    const result = run(
      input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" })], { exactDiscountCode: "korting-25" })
    );
    expect(surchargeAmount(result)).toBe("10.4");
  });

  it("nodiscount ürününe Shopify indirimi uygulanmışsa yine indirimli tutar kullanılır", () => {
    const hint = JSON.stringify({ "111": [1, 208] });
    const result = run(
      input([surchargeLine(hint), line({ variantId: DESK, price: "320.00", nodiscount: true })], { exactDiscountCode: "korting-25" })
    );
    expect(surchargeAmount(result)).toBe("10.4");
  });

  it("muaf ürün için hint gelse bile tabana dahil edilmez", () => {
    const hint = JSON.stringify({ "111": [1, 208], "222": [1, 300] });
    const result = run(
      input([
        surchargeLine(hint),
        line({ variantId: DESK, price: "320.00" }),
        line({ variantId: CHAIR, productId: EXEMPT_PRODUCT_ID, price: "500.00" }),
      ])
    );
    expect(surchargeAmount(result)).toBe("10.4");
  });

  it("gid formatındaki anahtarları da kabul eder", () => {
    const hint = JSON.stringify({ [DESK]: [1, 208] });
    const result = run(input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" })]));
    expect(surchargeAmount(result)).toBe("10.4");
  });

  it("tüm ürünler %100 indirimliyse surcharge uygulanmaz", () => {
    const hint = JSON.stringify({ "111": [1, 0] });
    const result: any = run(input([surchargeLine(hint), line({ variantId: DESK, price: "320.00" })]));
    expect(result.operations).toHaveLength(0);
  });

  it("bozuk hint yok sayılır", () => {
    for (const bad of ["not json", "[1,2]", "null", JSON.stringify({ "111": "208" }), JSON.stringify({ "111": [0, 208] }), JSON.stringify({ "111": [1, -5] })]) {
      const result = run(input([surchargeLine(bad), line({ variantId: DESK, price: "320.00" })]));
      expect(surchargeAmount(result)).toBe("16");
    }
  });
});

describe("parseDiscountedBaseHint", () => {
  it("geçerli girdileri normalize eder", () => {
    expect(parseDiscountedBaseHint(JSON.stringify({ "111": [2, "416.00"], [CHAIR]: [1, 50] }))).toEqual({
      "111": { quantity: 2, total: 416 },
      "222": { quantity: 1, total: 50 },
    });
  });

  it("boş/geçersiz girdide null döner", () => {
    expect(parseDiscountedBaseHint(null)).toBeNull();
    expect(parseDiscountedBaseHint("")).toBeNull();
    expect(parseDiscountedBaseHint("{}")).toBeNull();
    expect(parseDiscountedBaseHint("{bad")).toBeNull();
  });
});
