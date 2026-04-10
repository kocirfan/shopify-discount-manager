import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};

const SURCHARGE_VARIANT_ID = "61571547791690";

/**
 * App Proxy Endpoint
 * POST /apps/discount-manager/api/surcharge-price
 * Body: { shop, cartTotal }  (cartTotal: float, EUR)
 *
 * 1. Shop metafield'dan enabled + percentage oku
 * 2. surchargePrice = cartTotal * percentage / 100
 * 3. Variant fiyatını admin API ile güncelle
 * 4. { price } döndür — JS bu fiyatla ürünü sepete ekler
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response(JSON.stringify({ error: "shop param missing" }), { status: 400, headers: CORS });
  }

  let cartTotal = 0;
  try {
    const body = await request.json();
    cartTotal = parseFloat(body.cartTotal) || 0;
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400, headers: CORS });
  }

  if (cartTotal <= 0) {
    return new Response(JSON.stringify({ price: 0 }), { status: 200, headers: CORS });
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    // 1. Ayarları oku
    const settingsRes = await admin.graphql(`#graphql
      query {
        shop {
          metafield(namespace: "extra_surcharge", key: "settings") {
            value
          }
        }
      }
    `);
    const settingsData = await settingsRes.json();
    const raw = settingsData.data?.shop?.metafield?.value;

    let enabled = true;
    let percentage = 7;
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s.enabled === false) {
          return new Response(JSON.stringify({ price: 0 }), { status: 200, headers: CORS });
        }
        if (typeof s.percentage === "number" && s.percentage > 0) {
          percentage = s.percentage;
        }
      } catch { /* default kullan */ }
    }

    if (!enabled) {
      return new Response(JSON.stringify({ price: 0 }), { status: 200, headers: CORS });
    }

    // 2. Surcharge fiyatını hesapla (2 ondalık)
    const surchargePrice = parseFloat((cartTotal * percentage / 100).toFixed(2));

    // 3. Variant fiyatını güncelle
    await admin.graphql(`#graphql
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant { id price }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: `gid://shopify/ProductVariant/${SURCHARGE_VARIANT_ID}`,
          price: String(surchargePrice),
        },
      },
    });

    // 4. Fiyatı döndür
    return new Response(JSON.stringify({ price: surchargePrice }), { status: 200, headers: CORS });

  } catch (err: any) {
    console.error("[surcharge-price] hata:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}

export async function loader() {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
}
