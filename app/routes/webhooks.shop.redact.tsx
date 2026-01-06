import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: Shop data erasure
  // Shop owner requests to delete the shop (48 hours after uninstall)
  // You must delete ALL shop data from your database

  if (topic === "SHOP_REDACT") {
    const shopDomain = payload.shop_domain;

    console.log(`Shop redaction request for shop ${shopDomain}`);

    // TODO: Delete all shop data from your database
    // This includes:
    // - Discount settings (metafields)
    // - Session data
    // - Any other stored data

    // For metafields, they are automatically deleted by Shopify
    // But you should delete any data in your database
  }

  return new Response("OK", { status: 200 });
};
