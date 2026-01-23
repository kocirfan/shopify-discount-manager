// ============================================================
// CUSTOMER TAG PRODUCT DISCOUNT
// Müşteri tag'lerine göre ÜRÜN FİYATLARINA indirim uygular.
// Her ürün satırı ayrı ayrı yüzde indirim alır.
//
// ÖNEMLİ KURALLAR:
// 1. LOGIN ZORUNLULUĞU: Guest kullanıcılar için tag bazlı indirim UYGULANMAZ
// 2. TAG DOĞRULAMASI: Kullanıcı login olmuş olsa bile, tanımlı tag yoksa indirim UYGULANMAZ
// 3. İNDİRİM İZOLASYONU: Bu indirim pickup/shipping seçiminden BAĞIMSIZ çalışır
// 4. KOMBİNE ÇALIŞMA: Pickup indirimi ile birlikte uygulanabilir (combine kurallarına göre)
// ============================================================

type FunctionResult = {
  discounts: {
    value: { percentage: { value: string } };
    message?: string;
    targets: { productVariant: { id: string } }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

interface CustomerTagRule {
  id: string;
  customerTag: string;
  discountPercentage: number;
  discountName: string;
  enabled: boolean;
}

interface HasTagResponse {
  hasTag: boolean;
  tag: string;
}

interface CartLine {
  id: string;
  quantity: number;
  merchandise: {
    __typename: string;
    id?: string;
    product?: { id: string; title: string };
  };
  cost: {
    amountPerQuantity: { amount: string; currencyCode: string };
  };
}

interface RunInput {
  cart: {
    lines: CartLine[];
    buyerIdentity?: {
      customer?: {
        id: string;
        email?: string;
        hasTags?: HasTagResponse[];
      };
    };
  };
  shop?: { customerTagDiscountRules?: { value?: string } };
}

export function run(input: RunInput): FunctionResult {
  //console.error("=== CUSTOMER TAG PRODUCT DISCOUNT START ===");

  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  // ============================================================
  // KURAL 1: LOGIN ZORUNLULUĞU
  // Guest kullanıcılar için indirim UYGULANMAZ.
  // ============================================================
  const customer = input.cart.buyerIdentity?.customer;

  if (!customer?.id) {
    return emptyReturn;
  }

  //console.error("✅ Müşteri giriş yapmış:", customer.id);
  //console.error("   E-posta:", customer.email || "(yok)");

  // ============================================================
  // ÖNCELİK 1: MÜŞTERİ METAFIELD KONTROLÜ (YENİ SİSTEM)
  // Müşterinin customer_discount.percentage metafield'ı varsa,
  // direkt bu değeri kullan - tag sistemi atlanır
  // ============================================================
  const customerMetafieldValue = (customer as any).discountPercentage?.value;
  let discountPercentage = 0;
  let discountSource = "";

  if (customerMetafieldValue) {
    const metafieldPercent = parseFloat(customerMetafieldValue);
    if (!isNaN(metafieldPercent) && metafieldPercent > 0) {
      discountPercentage = metafieldPercent;
      discountSource = "metafield";
      //console.error(`🎯 METAFIELD İNDİRİMİ: %${discountPercentage}`);
    }
  }

  // ============================================================
  // ÖNCELİK 2: TAG SİSTEMİ (MEVCUT SİSTEM - FALLBACK)
  // Metafield yoksa, tag bazlı indirim sistemini kullan
  // ============================================================
  if (discountPercentage === 0) {
    const activeTags = (customer.hasTags || [])
      .filter((t) => t.hasTag)
      .map((t) => t.tag.toLowerCase());

    //console.error("🏷️ Müşteri tag'leri:", activeTags.join(", ") || "(hiç tag yok)");

    if (activeTags.length === 0) {
      return emptyReturn;
    }

    // Kuralları al
    const rulesJson = input.shop?.customerTagDiscountRules?.value;
    if (!rulesJson) {
      return emptyReturn;
    }

    let rules: CustomerTagRule[];
    try {
      rules = JSON.parse(rulesJson);
    } catch {
      return emptyReturn;
    }

    // En yüksek indirimli eşleşen kuralı bul
    let matchedRule: CustomerTagRule | null = null;
    let highestDiscount = 0;

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (activeTags.includes(rule.customerTag.toLowerCase())) {
        if (rule.discountPercentage > highestDiscount) {
          highestDiscount = rule.discountPercentage;
          matchedRule = rule;
        }
      }
    }

    if (!matchedRule) {
      //console.error("❌ EŞLEŞME YOK - activeTags:", activeTags);
      return emptyReturn;
    }

    discountPercentage = matchedRule.discountPercentage;
    discountSource = `tag:${matchedRule.customerTag}`;
    //console.error(`🎯 TAG İNDİRİMİ: ${matchedRule.customerTag} -> %${discountPercentage}`);
  }

  // İndirim yüzdesi bulunamadıysa çık
  if (discountPercentage <= 0) {
    return emptyReturn;
  }

  //console.error(`💰 Uygulanacak indirim: %${discountPercentage} (kaynak: ${discountSource})`);

  // ============================================================
  // ÜRÜN BAZLI İNDİRİM UYGULA
  // ============================================================
  const targets: { productVariant: { id: string } }[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename === "ProductVariant" && line.merchandise.id) {
      targets.push({ productVariant: { id: line.merchandise.id } });
      ////console.error(`📦 ${line.merchandise.product?.title || 'Ürün'}: %${matchedRule.discountPercentage}`);
    }
  }

  if (targets.length === 0) {
    ////console.error("❌ Ürün bulunamadı");
    return emptyReturn;
  }

  //console.error(`✅ ${targets.length} ürüne %${discountPercentage} indirim uygulanıyor`);

  return {
    discounts: [{
      value: { percentage: { value: discountPercentage.toString() } },
      message: `Korting`,
      targets,
    }],
    discountApplicationStrategy: "FIRST",
  };
}
