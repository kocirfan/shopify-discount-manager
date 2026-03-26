import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";

/**
 * App Proxy Endpoint - Müşterinin indirim oranını döndürür
 *
 * URL: /apps/discount-manager/api/customer-discount
 * Query params: logged_in_customer_id (Shopify app proxy tarafından sağlanır)
 *
 * Returns: { discountPercentage: number, discountName: string, customerTag: string }
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  // URL'den parametreleri al
  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");
  const shop = url.searchParams.get("shop");

  //console.log("[Customer Discount API] Request:", { customerId, shop, url: request.url });

  if (!shop) {
    return new Response(
      JSON.stringify({
        discountPercentage: 0,
        message: "Shop parameter missing"
      }),
      { headers }
    );
  }

  if (!customerId) {
    return new Response(
      JSON.stringify({
        discountPercentage: 0,
        discountName: null,
        customerTag: null,
        message: "Müşteri giriş yapmamış"
      }),
      { headers }
    );
  }

  let admin;
  try {
    // Unauthenticated admin API (app proxy için)
    const result = await unauthenticated.admin(shop);
    admin = result.admin;
  } catch (error) {
    //console.error("[Customer Discount API] Admin session error:", error);
    return new Response(
      JSON.stringify({
        discountPercentage: 0,
        message: "Store bağlantısı kurulamadı",
        error: "session_error"
      }),
      { headers }
    );
  }

  try {
    // Müşteri bilgilerini, metafield'larını ve tag'lerini al
    const customerResponse = await admin.graphql(
      `#graphql
        query GetCustomerDiscount($customerId: ID!) {
          customer(id: $customerId) {
            id
            tags
            exactDiscountCode: metafield(namespace: "custom", key: "exact_discount_code") {
              value
            }
            legacyDiscountPercentage: metafield(namespace: "custom.customer_discount", key: "percentage") {
              value
            }
          }
        }
      `,
      { variables: { customerId: `gid://shopify/Customer/${customerId}` } }
    );

    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;

    if (!customer) {
      return new Response(
        JSON.stringify({
          discountPercentage: 0,
          discountName: null,
          customerTag: null,
          message: "Müşteri bulunamadı"
        }),
        { headers }
      );
    }

    // ÖNCELİK 1: exact_discount_code metafield (örn. "korting-20.1" → 20.1)
    const exactDiscountCode: string | null = customer.exactDiscountCode?.value ?? null;
    if (exactDiscountCode) {
      const match = exactDiscountCode.match(/^korting-(.+)$/i);
      if (match) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed) && parsed > 0) {
          return new Response(
            JSON.stringify({
              discountPercentage: parsed,
              discountName: `Korting`,
              customerTag: null,
              allTags: customer.tags,
            }),
            { headers }
          );
        }
      }
    }

    // ÖNCELİK 2: legacy metafield (custom.customer_discount.percentage)
    const legacyValue: string | null = customer.legacyDiscountPercentage?.value ?? null;
    if (legacyValue) {
      const parsed = parseFloat(legacyValue);
      if (!isNaN(parsed) && parsed > 0) {
        return new Response(
          JSON.stringify({
            discountPercentage: parsed,
            discountName: `Korting`,
            customerTag: null,
            allTags: customer.tags,
          }),
          { headers }
        );
      }
    }

    // ÖNCELİK 3: Tag sistemi (mevcut fallback)
    const customerTags = (customer.tags || []).map((t: string) => t.toLowerCase());

    const shopResponse = await admin.graphql(
      `#graphql
        query GetDiscountRules {
          shop {
            customerTagDiscountRules: metafield(
              namespace: "customer_tag_discount"
              key: "rules"
            ) {
              value
            }
          }
        }
      `
    );

    const shopData = await shopResponse.json();
    const rulesJson = shopData.data?.shop?.customerTagDiscountRules?.value;

    if (!rulesJson) {
      return new Response(
        JSON.stringify({
          discountPercentage: 0,
          discountName: null,
          customerTag: null,
          message: "İndirim kuralları tanımlanmamış"
        }),
        { headers }
      );
    }

    const rules = JSON.parse(rulesJson);
    let bestMatch = { discountPercentage: 0, discountName: "", customerTag: "" };

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (customerTags.includes(rule.customerTag.toLowerCase())) {
        if (rule.discountPercentage > bestMatch.discountPercentage) {
          bestMatch = {
            discountPercentage: rule.discountPercentage,
            discountName: rule.discountName || `%${rule.discountPercentage} İndirim`,
            customerTag: rule.customerTag,
          };
        }
      }
    }

    return new Response(
      JSON.stringify({
        discountPercentage: bestMatch.discountPercentage,
        discountName: bestMatch.discountName || null,
        customerTag: bestMatch.customerTag || null,
        allTags: customer.tags,
      }),
      { headers }
    );
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    //console.error("Customer discount API error:", errorMessage);

    // Scope hatası mı kontrol et
    if (errorMessage.includes("read_customers") || errorMessage.includes("Access denied")) {
      return new Response(
        JSON.stringify({
          discountPercentage: 0,
          message: "Uygulama izinleri güncellenmeli. Lütfen Shopify Admin'den uygulamayı açın.",
          error: "scope_error"
        }),
        { headers }
      );
    }

    return new Response(
      JSON.stringify({
        discountPercentage: 0,
        message: "Bir hata oluştu",
        error: "api_error"
      }),
      { headers }
    );
  }
}

