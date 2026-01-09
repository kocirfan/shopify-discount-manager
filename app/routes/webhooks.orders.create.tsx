import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    console.error("No admin API available");
    return new Response("No admin", { status: 401 });
  }

  console.log("=== ORDER CREATE WEBHOOK ===");
  console.log("Order ID:", payload.id);
  console.log("Order attributes:", payload.note_attributes);

  try {
    // Check if pickup was selected
    const pickupAttribute = payload.note_attributes?.find(
      (attr: any) => attr.name === "_selected_delivery_type" && attr.value === "pickup"
    );

    if (!pickupAttribute) {
      console.log("No pickup attribute found, skipping discount");
      return new Response("OK - No pickup", { status: 200 });
    }

    console.log("✅ Pickup order detected!");

    // Get discount settings from metafield
    const shopResponse = await admin.graphql(
      `#graphql
        query {
          shop {
            deliveryDiscountSettings: metafield(
              namespace: "delivery_discount"
              key: "settings"
            ) {
              value
            }
          }
        }
      `
    );

    const shopData = await shopResponse.json();
    const settingsJson = shopData.data?.shop?.deliveryDiscountSettings?.value;

    if (!settingsJson) {
      console.log("No settings found");
      return new Response("OK - No settings", { status: 200 });
    }

    const settings = JSON.parse(settingsJson);
    const pickupMethod = settings.find((m: any) => m.type === "pickup" && m.enabled);

    if (!pickupMethod) {
      console.log("No active pickup discount method found");
      return new Response("OK - No pickup method", { status: 200 });
    }

    console.log("Pickup discount value:", pickupMethod.discountValue);

    // Calculate additional discount on subtotal (after all other discounts)
    const currentSubtotal = parseFloat(payload.current_subtotal_price);
    const additionalDiscountAmount = (currentSubtotal * pickupMethod.discountValue) / 100;

    console.log("Current subtotal:", currentSubtotal);
    console.log(`Additional discount (${pickupMethod.discountValue}%):`, additionalDiscountAmount);

    // Add a note to the order about the pickup discount
    const noteText = `🎉 Pickup Discount Applied!\n\nOriginal subtotal: €${currentSubtotal.toFixed(2)}\nPickup discount (${pickupMethod.discountValue}%): -€${additionalDiscountAmount.toFixed(2)}\n\nNote: This discount will be manually applied by the store owner.`;

    const noteResponse = await admin.graphql(
      `#graphql
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
              note
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            id: `gid://shopify/Order/${payload.id}`,
            note: noteText,
            tags: ["pickup-discount-pending"]
          }
        }
      }
    );

    const noteResult = await noteResponse.json();
    console.log("Note added:", JSON.stringify(noteResult, null, 2));

    if (noteResult.data?.orderUpdate?.userErrors?.length > 0) {
      console.error("Error updating order:", noteResult.data.orderUpdate.userErrors);
      return new Response("Error", { status: 500 });
    }

    console.log("✅ Pickup discount note added to order!");

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing order webhook:", error);
    return new Response("Error", { status: 500 });
  }
};
