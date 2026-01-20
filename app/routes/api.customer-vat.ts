import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";

/**
 * API Endpoint - Müşterinin notes alanından VAT numarasını çeker
 *
 * URL: /api/customer-vat?customer_id=123&shop=example.myshopify.com
 *
 * Notes format:
 * Exact Online ID: 8113bca9-e333-4a7a-9e6b-c4d397304ee6
 * Code:            1300455
 * VAT: NL805263329B01
 * Last Updated: 2026-01-15 11:26:15
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customer_id");
  const shop = url.searchParams.get("shop");

  console.log("[Customer VAT API] Request:", { customerId, shop });

  if (!shop) {
    return new Response(
      JSON.stringify({ success: false, error: "Shop parameter missing" }),
      { status: 400, headers }
    );
  }

  if (!customerId) {
    return new Response(
      JSON.stringify({ success: false, error: "Customer ID missing", vat: null }),
      { headers }
    );
  }

  let admin;
  try {
    const result = await unauthenticated.admin(shop);
    admin = result.admin;
  } catch (error) {
    console.error("[Customer VAT API] Admin session error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Store connection failed", vat: null }),
      { headers }
    );
  }

  try {
    // Müşteri bilgilerini al (notes dahil)
    const customerResponse = await admin.graphql(
      `#graphql
        query GetCustomerNotes($customerId: ID!) {
          customer(id: $customerId) {
            id
            note
            email
            firstName
            lastName
          }
        }
      `,
      { variables: { customerId: `gid://shopify/Customer/${customerId}` } }
    );

    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;

    if (!customer) {
      console.log("[Customer VAT API] Customer not found");
      return new Response(
        JSON.stringify({ success: false, error: "Customer not found", vat: null }),
        { headers }
      );
    }

    console.log("[Customer VAT API] Customer note:", customer.note);

    // Notes'tan VAT numarasını parse et
    const vat = parseVatFromNotes(customer.note);
    const code = parseCodeFromNotes(customer.note);
    const exactOnlineId = parseExactOnlineIdFromNotes(customer.note);

    console.log("[Customer VAT API] Parsed VAT:", vat);

    return new Response(
      JSON.stringify({
        success: true,
        vat: vat,
        code: code,
        exactOnlineId: exactOnlineId,
        customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        customerEmail: customer.email,
      }),
      { headers }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Customer VAT API] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, vat: null }),
      { headers }
    );
  }
}

/**
 * Notes'tan VAT numarasını parse eder
 * Format: "VAT: NL805263329B01" veya "VAT:NL805263329B01"
 */
function parseVatFromNotes(notes: string | null): string | null {
  if (!notes || notes.trim() === '') return null;

  // VAT: ile başlayan satırı bul
  const vatMatch = notes.match(/VAT:\s*([A-Z]{2}[A-Z0-9]+)/i);
  if (vatMatch && vatMatch[1]) {
    const vat = vatMatch[1].toUpperCase();
    // N/A veya geçersiz değerleri filtrele
    if (vat === 'N/A' || vat === 'NA' || vat.length < 8) {
      return null;
    }
    return vat;
  }

  // BTW: ile de dene (Hollandaca)
  const btwMatch = notes.match(/BTW:\s*([A-Z]{2}[A-Z0-9]+)/i);
  if (btwMatch && btwMatch[1]) {
    const vat = btwMatch[1].toUpperCase();
    // N/A veya geçersiz değerleri filtrele
    if (vat === 'N/A' || vat === 'NA' || vat.length < 8) {
      return null;
    }
    return vat;
  }

  return null;
}

/**
 * Notes'tan Code değerini parse eder
 * Format: "Code: 1300455" veya "Code:1300455"
 */
function parseCodeFromNotes(notes: string | null): string | null {
  if (!notes) return null;

  const codeMatch = notes.match(/Code:\s*(\d+)/i);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1];
  }

  return null;
}

/**
 * Notes'tan Exact Online ID'yi parse eder
 * Format: "Exact Online ID: 8113bca9-e333-4a7a-9e6b-c4d397304ee6"
 */
function parseExactOnlineIdFromNotes(notes: string | null): string | null {
  if (!notes) return null;

  const idMatch = notes.match(/Exact Online ID:\s*([a-f0-9-]+)/i);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }

  return null;
}
