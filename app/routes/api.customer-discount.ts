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

  console.log("[Customer Discount API] Request:", { customerId, shop, url: request.url });

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

  try {
    // Unauthenticated admin API (app proxy için)
    const { admin } = await unauthenticated.admin(shop);

    // Müşteri bilgilerini ve tag'lerini al
    const customerResponse = await admin.graphql(
      `#graphql
        query GetCustomerTags($customerId: ID!) {
          customer(id: $customerId) {
            id
            email
            tags
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
    
    const customerTags = (customer.tags || []).map((t: string) => t.toLowerCase());
    
    // İndirim kurallarını metafield'dan al
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
    
    // Kuralları parse et ve en yüksek indirimi bul
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
        customerEmail: customer.email,
        allTags: customer.tags,
      }),
      { headers }
    );
    
  } catch (error) {
    console.error("Customer discount API error:", error);
    return new Response(
      JSON.stringify({ 
        discountPercentage: 0, 
        error: "Bir hata oluştu",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

