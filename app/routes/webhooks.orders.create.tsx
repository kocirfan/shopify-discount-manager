import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const SURCHARGE_VARIANT_ID = "61571547791690";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("No admin", { status: 401 });
  }

  try {
    // ============================================================
    // SURCHARGE KONTROLÜ
    // Sipariş içinde surcharge line item yoksa "surcharge-missing"
    // tag'i ekle — admin'den manuel takip edilebilsin.
    // ============================================================
    const lineItems: any[] = payload.line_items || [];
    const hasSurcharge = lineItems.some(
      (item: any) => String(item.variant_id) === SURCHARGE_VARIANT_ID
    );

    if (!hasSurcharge) {
      const realItems = lineItems.filter(
        (item: any) => String(item.variant_id) !== SURCHARGE_VARIANT_ID
      );
      const hasRealItems = realItems.length > 0;

      if (hasRealItems) {
        await admin.graphql(`#graphql
          mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              userErrors { message }
            }
          }
        `, {
          variables: {
            id: `gid://shopify/Order/${payload.id}`,
            tags: ["surcharge-missing"],
          },
        });
        console.error(`[surcharge-webhook] ⚠️ Surcharge eksik! Sipariş #${payload.order_number} — 'surcharge-missing' tag eklendi`);
      }
    }

    // ============================================================
    // PICKUP İNDİRİMİ KONTROLÜ
    // ============================================================
    const pickupAttribute = payload.note_attributes?.find(
      (attr: any) => attr.name === "_selected_delivery_type" && attr.value === "pickup"
    );

    if (!pickupAttribute) {
      return new Response("OK", { status: 200 });
    }

    const shopResponse = await admin.graphql(`#graphql
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
    `);

    const shopData = await shopResponse.json();
    const settingsJson = shopData.data?.shop?.deliveryDiscountSettings?.value;

    if (!settingsJson) {
      return new Response("OK - No settings", { status: 200 });
    }

    const settings = JSON.parse(settingsJson);
    const pickupMethod = settings.find((m: any) => m.type === "pickup" && m.enabled);

    if (!pickupMethod) {
      return new Response("OK - No pickup method", { status: 200 });
    }

    const currentSubtotal = parseFloat(payload.current_subtotal_price);
    const additionalDiscountAmount = (currentSubtotal * pickupMethod.discountValue) / 100;

    const noteText = `🎉 Pickup Discount Applied!\n\nOriginal subtotal: €${currentSubtotal.toFixed(2)}\nPickup discount (${pickupMethod.discountValue}%): -€${additionalDiscountAmount.toFixed(2)}\n\nNote: This discount will be manually applied by the store owner.`;

    await admin.graphql(`#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id note }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: `gid://shopify/Order/${payload.id}`,
          note: noteText,
          tags: ["pickup-discount-pending"],
        },
      },
    });

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("[orders/create webhook] hata:", error);
    return new Response("Error", { status: 500 });
  }
};
