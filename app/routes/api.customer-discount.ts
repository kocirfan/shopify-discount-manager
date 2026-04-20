import type { LoaderFunctionArgs } from "react-router";

/**
 * Customer Discount API — DEVRE DIŞI
 * Müşteri tag/metafield bazlı indirim operasyonu iptal edildi.
 * Her zaman discountPercentage: 0 döndürür.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  return new Response(
    JSON.stringify({
      discountPercentage: 0,
      discountName: null,
      customerTag: null,
      message: "Müşteri indirimi devre dışı",
    }),
    { headers }
  );
}
