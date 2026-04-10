// ============================================================
// EXTRA SURCHARGE - CART TRANSFORM
// Sepet tutarına yüzde bazlı extra ücret ekler.
//
// Yaklaşım:
// - Shop metafield'ından surcharge ayarlarını okur
// - Aktifse, sepetteki ilk satırı lineExpand ile genişletir:
//   1. Orijinal ürün (orijinal fiyat)
//   2. Surcharge variant'ı (surcharge tutarı)
//
// SETUP GEREKSİNİMİ:
// Shopify Admin'de "Service Toeslag" adlı bir ürün oluşturun,
// variant ID'sini aşağıya girin.
// ============================================================

import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

interface SurchargeSettings {
  enabled: boolean;
  percentage: number;
  label: string;
}

// ⚠️ BU ID'Yİ DEĞİŞTİRİN: Shopify Admin'de oluşturduğunuz
// "Service Toeslag" ürününün variant GID'si
const SURCHARGE_VARIANT_ID = "gid://shopify/ProductVariant/61571547791690";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function run(input: CartTransformRunInput): CartTransformRunResult {
  // ============================================================
  // DEBUG: Input'u logla
  // ============================================================
  console.log("[ExtraSurcharge] run() called");
  console.log("[ExtraSurcharge] cart lines count:", input.cart.lines.length);
  console.log("[ExtraSurcharge] surchargeSettings raw:", input.shop?.surchargeSettings?.value);

  // ============================================================
  // AYARLARI OKU
  // ============================================================
  const settingsJson = input.shop?.surchargeSettings?.value;

  if (!settingsJson) {
    console.log("[ExtraSurcharge] No settings found, returning NO_CHANGES");
    return NO_CHANGES;
  }

  let settings: SurchargeSettings;
  try {
    settings = JSON.parse(settingsJson);
  } catch (e) {
    console.log("[ExtraSurcharge] Failed to parse settings JSON:", settingsJson);
    return NO_CHANGES;
  }

  console.log("[ExtraSurcharge] settings:", JSON.stringify(settings));

  // Aktif değilse işlem yapma
  if (!settings.enabled || !settings.percentage || settings.percentage <= 0) {
    console.log("[ExtraSurcharge] Surcharge disabled or percentage=0, returning NO_CHANGES");
    return NO_CHANGES;
  }

  const surchargeRate = settings.percentage / 100;
  console.log("[ExtraSurcharge] surchargeRate:", surchargeRate);

  // ============================================================
  // SEPETİN TOPLAM TUTARINI HESAPLA
  // ============================================================
  let cartSubtotal = 0;
  const validLines: typeof input.cart.lines = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;

    // Surcharge variant'ının kendisi varsa atla (infinite loop önlemi)
    if (merchandise.__typename === "ProductVariant" && merchandise.id === SURCHARGE_VARIANT_ID) {
      console.log("[ExtraSurcharge] Skipping existing surcharge line:", line.id);
      continue;
    }

    if (merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const pricePerUnit = parseFloat(line.cost.amountPerQuantity.amount as string);
    if (!isNaN(pricePerUnit) && pricePerUnit > 0) {
      cartSubtotal += pricePerUnit * line.quantity;
      validLines.push(line);
    }
  }

  console.log("[ExtraSurcharge] cartSubtotal:", cartSubtotal, "validLines:", validLines.length);

  if (validLines.length === 0 || cartSubtotal <= 0) {
    console.log("[ExtraSurcharge] No valid lines or subtotal=0, returning NO_CHANGES");
    return NO_CHANGES;
  }

  // ============================================================
  // SURCHARGE TUTARINI HESAPLA
  // Toplam surcharge = subtotal × rate
  // İlk satıra expand ile eklenecek (surcharge variant)
  // ============================================================
  const totalSurcharge = (cartSubtotal * surchargeRate).toFixed(2);
  console.log("[ExtraSurcharge] totalSurcharge:", totalSurcharge);

  // İlk geçerli satırı lineExpand ile genişlet:
  // - Orijinal ürün (orijinal fiyat)
  // - Surcharge variant'ı (surcharge tutarı, quantity=1)
  const firstLine = validLines[0];
  const firstMerchandise = firstLine.merchandise as { __typename: "ProductVariant"; id: string };
  const originalPrice = parseFloat(firstLine.cost.amountPerQuantity.amount as string).toFixed(2);

  console.log("[ExtraSurcharge] Expanding line:", firstLine.id, "originalPrice:", originalPrice);

  const operations: CartTransformRunResult["operations"] = [
    {
      lineExpand: {
        cartLineId: firstLine.id,
        expandedCartItems: [
          // Orijinal ürün, orijinal fiyat
          {
            merchandiseId: firstMerchandise.id,
            quantity: firstLine.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: originalPrice,
                },
              },
            },
          },
          // Surcharge satırı
          {
            merchandiseId: SURCHARGE_VARIANT_ID,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: totalSurcharge,
                },
              },
            },
          },
        ],
      },
    },
  ];

  console.log("[ExtraSurcharge] operations count:", operations.length);
  return { operations };
}
