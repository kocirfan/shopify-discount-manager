import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: Customer data request
  // Store owner requests customer data
  // You should collect all data you have about this customer
  // and send it to the email provided in the webhook

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    const customerId = payload.customer?.id;
    const shopDomain = payload.shop_domain;

    console.log(`Customer data request for customer ${customerId} from shop ${shopDomain}`);

    // TODO: Collect customer data from your database
    // TODO: Send data to shop owner's email

    // For now, we don't store any customer data, so nothing to return
  }

  return new Response("OK", { status: 200 });
};
