# Extra Surcharge (Ordertoeslag %5) — Cart Transform

API sürümü: **2026-07** (`purchase.cart-transform.run`). Bu sürümde operasyon adı
`update` → `lineUpdate` oldu; eski sürümler (≤ 2025-07) deploy edilemez.

Surcharge ürünü (`ProductVariant/61571547791690`) sepetteyken fiyatını
**eligible ürünlerin indirim sonrası toplamı × %5** olarak belirler.

## Neden bir "taban ipucu" var?

Cart Transform, Shopify'ın indirim motorundan **önce** çalışır; input'ta yalnızca
indirimsiz fiyatlar (`cost.amountPerQuantity`) vardır.

| İndirim kaynağı | Cart Transform nasıl görür? |
|---|---|
| Discount Manager (müşteri tag / metafield) | `getCustomerDiscountRate` ile aynı kurallarla **yeniden hesaplar** (mevcut mantık) |
| Shopify otomatik indirimleri, indirim kodları | **Göremez** → `_surcharge_base` attribute'ünden okur |

## `_surcharge_base` line attribute

Surcharge satırına yazılır. Format:

```json
{"<variantNumericId>": [adet, indirimSonrasıSatırToplamı], ...}
```

Örnek: `{"61571547791111": [1, 208]}` → Bureau €320, %35 otomatik indirimle €208.

Yazanlar (ikisi de aynı formatı üretir):

- **Checkout:** `checkout-extension-app/extensions/custom-input-field/src/surchargeBaseSync.js`
  (`line.cost.totalAmount` = satır seviyesi tüm indirimler düşülmüş tutar). İndirim kodu
  girilince/çıkarılınca otomatik güncellenir.
- **Sepet sayfası:** `extensions/price-display/assets/surcharge-cart-manager.js`
  (`/cart.js` → `final_line_price`).

Okuyan: `src/run.ts` (`surchargeBase: attribute(key: "_surcharge_base")`).

## Kullanım kuralı (mevcut mantık korunur)

Her varyant için:

1. Mevcut hesap yapılır: `amountPerQuantity × (1 − müşteriİndirimi) × adet`
   (nodiscount / excluded ürünlerde indirim yok, muaf ürünler tabana girmez).
2. İpucu **yalnızca** adet eşleşiyorsa (güncelse) **ve** mevcut hesaptan **düşükse** kullanılır.

Yani ipucu tabanı asla yukarı çekmez; Shopify indirimleri sadece tabanı düşürür.
İpucu yok / bozuk / bayat ise davranış eskisiyle birebir aynıdır.

## Geliştirme

```bash
npm run typegen   # run.graphql değişince generated/api.ts'i günceller
npm run test:unit # vitest
npm run build     # dist/function.wasm
```
