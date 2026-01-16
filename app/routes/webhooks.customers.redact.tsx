import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  //console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: Customer data erasure
  // Customer requests their data to be deleted (48 hours after request)
  // You must delete all customer data from your database

  if (topic === "CUSTOMERS_REDACT") {
    const customerId = payload.customer?.id;
    const shopDomain = payload.shop_domain;

    //console.log(`Customer redaction request for customer ${customerId} from shop ${shopDomain}`);

    // TODO: Delete all customer data from your database

    // For now, we don't store any customer data, so nothing to delete
  }

  return new Response("OK", { status: 200 });
};
