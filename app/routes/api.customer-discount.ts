import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * App Proxy Endpoint - Müşterinin indirim oranını döndürür
 * 
 * URL: /apps/discount-manager/customer-discount
 * Query params: customer_id (optional - Shopify will provide logged-in customer)
 * 
 * Returns: { discountPercentage: number, discountName: string, customerTag: string }
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    
    // URL'den customer ID'yi al (Shopify app proxy logged_in_customer_id sağlar)
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");
    
    // CORS headers
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    };
    
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

