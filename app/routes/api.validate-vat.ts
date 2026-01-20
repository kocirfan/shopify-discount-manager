import type { LoaderFunctionArgs } from "react-router";

// VIES VAT Validation API
// Avrupa Komisyonu'nun resmi VAT doğrulama servisi

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const vatNumber = url.searchParams.get("vat");

  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!vatNumber) {
    return new Response(
      JSON.stringify({ valid: false, error: "VAT number is required" }),
      { status: 400, headers }
    );
  }

  // VAT numarasını temizle
  const cleanVat = vatNumber.replace(/[\s.-]/g, "").toUpperCase();

  // Ülke kodu ve numara ayır
  const countryCode = cleanVat.substring(0, 2);
  const vatNumberOnly = cleanVat.substring(2);

  if (!countryCode || !vatNumberOnly) {
    return new Response(
      JSON.stringify({ valid: false, error: "Invalid VAT format. Use format: NL123456789B01" }),
      { status: 400, headers }
    );
  }

  console.log(`[VAT Validation] Checking: ${countryCode} - ${vatNumberOnly}`);

  try {
    // VIES API'ye istek at
    const viesResponse = await fetch(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countryCode: countryCode,
          vatNumber: vatNumberOnly,
        }),
      }
    );

    if (!viesResponse.ok) {
      console.log("[VAT Validation] VIES unavailable, using format validation");
      // VIES API'si çalışmıyor - fallback olarak format kontrolü yap
      const formatValid = validateVATFormat(cleanVat);
      return new Response(
        JSON.stringify({
          valid: formatValid,
          viesAvailable: false,
          message: "VIES service unavailable, format validation only",
          countryCode: countryCode,
          vatNumber: vatNumberOnly,
        }),
        { headers }
      );
    }

    const viesData = await viesResponse.json();

    console.log(`[VAT Validation] VIES Response: valid=${viesData.valid}, name=${viesData.name}`);

    return new Response(
      JSON.stringify({
        valid: viesData.valid === true,
        viesAvailable: true,
        countryCode: countryCode,
        vatNumber: vatNumberOnly,
        name: viesData.name || null,
        address: viesData.address || null,
        requestDate: viesData.requestDate || new Date().toISOString(),
      }),
      { headers }
    );
  } catch (error) {
    console.error("[VAT Validation] Error:", error);

    // Hata durumunda format kontrolü yap
    const formatValid = validateVATFormat(cleanVat);
    return new Response(
      JSON.stringify({
        valid: formatValid,
        viesAvailable: false,
        message: "VIES service error, format validation only",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers }
    );
  }
}

// Format doğrulama (VIES çalışmazsa fallback)
function validateVATFormat(vat: string): boolean {
  const vatPatterns: Record<string, RegExp> = {
    NL: /^NL\d{9}B\d{2}$/, // Hollanda
    BE: /^BE[01]\d{9}$/, // Belçika
    DE: /^DE\d{9}$/, // Almanya
    FR: /^FR[A-Z0-9]{2}\d{9}$/, // Fransa
    GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, // İngiltere
    AT: /^ATU\d{8}$/, // Avusturya
    IT: /^IT\d{11}$/, // İtalya
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, // İspanya
    PL: /^PL\d{10}$/, // Polonya
    PT: /^PT\d{9}$/, // Portekiz
  };

  const countryCode = vat.substring(0, 2);
  const pattern = vatPatterns[countryCode];

  if (!pattern) {
    return vat.length >= 8; // Bilinmeyen ülke - en az 8 karakter
  }

  return pattern.test(vat);
}
