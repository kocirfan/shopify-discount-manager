// ============================================================
// EXTRA SURCHARGE - CART TRANSFORM
// Sepet tutarına yüzde bazlı extra ücret ekler.
//
// Nasıl çalışır:
// - Shop metafield'ından surcharge ayarlarını okur
// - Aktifse, her cart line'ın birim fiyatına % ücret ekler
// - lineExpand ile mevcut satırı aynı variant ile expand eder,
//   fiyatı (orijinal × (1 + rate/100)) olarak ayarlar
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

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function run(input: CartTransformRunInput): CartTransformRunResult {
  // ============================================================
  // AYARLARI OKU
  // ============================================================
  const settingsJson = input.shop?.surchargeSettings?.value;

  if (!settingsJson) {
    return NO_CHANGES;
  }

  let settings: SurchargeSettings;
  try {
    settings = JSON.parse(settingsJson);
  } catch {
    return NO_CHANGES;
  }

  // Aktif değilse işlem yapma
  if (!settings.enabled || !settings.percentage || settings.percentage <= 0) {
    return NO_CHANGES;
  }

  const surchargeRate = settings.percentage / 100;

  // ============================================================
  // HER CART LINE'A SURCHARGE EKLE
  // lineExpand kullanarak her satırı kendisiyle expand et,
  // yeni fiyat = orijinal fiyat × (1 + surchargeRate)
  // ============================================================
  const operations: CartTransformRunResult["operations"] = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;

    // Sadece ProductVariant satırlarını işle
    if (merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const originalPrice = parseFloat(
      line.cost.amountPerQuantity.amount as string
    );

    if (isNaN(originalPrice) || originalPrice <= 0) {
      continue;
    }

    // Yeni fiyat: orijinal + surcharge
    const newPrice = (originalPrice * (1 + surchargeRate)).toFixed(2);

    operations.push({
      lineExpand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: merchandise.id,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: newPrice,
                },
              },
            },
          },
        ],
      },
    });
  }

  if (operations.length === 0) {
    return NO_CHANGES;
  }

  return { operations };
}
