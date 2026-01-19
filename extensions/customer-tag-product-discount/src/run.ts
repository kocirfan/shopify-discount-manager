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
  console.error("=== CUSTOMER TAG PRODUCT DISCOUNT START ===");

  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST",
  };

  // ============================================================
  // KURAL 1: LOGIN ZORUNLULUĞU
  // Guest kullanıcılar için tag bazlı indirim UYGULANMAZ.
  // Müşteri tag'i okunamayacağı için hiçbir tag bazlı indirim uygulanmaz.
  // ============================================================
  const customer = input.cart.buyerIdentity?.customer;

  if (!customer?.id) {
    //console.error("❌ LOGIN GEREKLİ: Müşteri giriş yapmamış (guest)");
    //console.error("   Tag bazlı hiçbir indirim UYGULANMAYACAK");
    return emptyReturn;
  }

  console.error("✅ Müşteri giriş yapmış:", customer.id);
  console.error("   E-posta:", customer.email || "(yok)");

  // ============================================================
  // KURAL 2: MÜŞTERİ TAG DOĞRULAMASI
  // Login olmuş olsa bile, tanımlı tag'lerden hiçbirine sahip değilse
  // tag bazlı indirim UYGULANMAZ.
  // ============================================================
  const activeTags = (customer.hasTags || [])
    .filter((t) => t.hasTag)
    .map((t) => t.tag.toLowerCase());

  console.error("🏷️ Müşteri tag'leri:", activeTags.join(", ") || "(hiç tag yok)");
  console.error("🔍 hasTags raw:", JSON.stringify(customer.hasTags));

  if (activeTags.length === 0) {
    //console.error("❌ TAG BULUNAMADI: Kullanıcının eşleşen tag'i yok");
    //console.error("   Tag bazlı indirim UYGULANMAYACAK");
    return emptyReturn;
  }

  // Kuralları al
  const rulesJson = input.shop?.customerTagDiscountRules?.value;
  if (!rulesJson) {
    //console.error("❌ KURAL BULUNAMADI");
    return emptyReturn;
  }

  let rules: CustomerTagRule[];
  try {
    rules = JSON.parse(rulesJson);
  } catch {
    //console.error("❌ JSON PARSE HATASI");
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
    console.error("❌ EŞLEŞME YOK - activeTags:", activeTags);
    return emptyReturn;
  }

  console.error(`🎯 Kural EŞLEŞTI: ${matchedRule.customerTag} -> %${matchedRule.discountPercentage}`);

  // ============================================================
  // ÜRÜN BAZLI İNDİRİM UYGULA
  // ============================================================
  const targets: { productVariant: { id: string } }[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename === "ProductVariant" && line.merchandise.id) {
      targets.push({ productVariant: { id: line.merchandise.id } });
      //console.error(`📦 ${line.merchandise.product?.title || 'Ürün'}: %${matchedRule.discountPercentage}`);
    }
  }

  if (targets.length === 0) {
    //console.error("❌ Ürün bulunamadı");
    return emptyReturn;
  }

  //console.error(`✅ ${targets.length} ürüne %${matchedRule.discountPercentage} indirim`);

  return {
    discounts: [{
      value: { percentage: { value: matchedRule.discountPercentage.toString() } },
      message: `Korting`,
      targets,
    }],
    discountApplicationStrategy: "FIRST",
  };
}
