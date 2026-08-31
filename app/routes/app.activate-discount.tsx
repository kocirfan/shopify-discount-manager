import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Önce function ID'sini alalım
    const functionsResponse = await admin.graphql(
      `#graphql
        query {
          shopifyFunctions(first: 25) {
            nodes {
              id
              title
              apiType
            }
          }
        }
      `
    );

    const functionsData = await functionsResponse.json();
    //console.log("Available functions:", JSON.stringify(functionsData, null, 2));

    // Pickup ORDER discount function'ı bul.
    // Discount Function API (2026-07) ile apiType "discount" oldu (eski: "order_discounts").
    // Not: ShopifyFunction.handle alanı 2025-10 Admin API'de yok; title + apiType ile eşleştir.
    const nodes = functionsData.data?.shopifyFunctions?.nodes || [];
    const discountFunction =
      nodes.find(
        (fn: any) =>
          (fn.apiType === "order_discounts" || fn.apiType === "discount") &&
          fn.title?.toLowerCase().includes("pickup") &&
          fn.title?.toLowerCase().includes("order")
      );

    if (!discountFunction) {
      //console.error("❌ No order discount function found!");
      //console.error("Available functions:", functionsData.data?.shopifyFunctions?.nodes?.map((f: any) => ({ title: f.title, type: f.apiType })));
      return { success: false, error: "Order discount function not found. Please deploy first." };
    }

    //console.log("Using ORDER discount function:", discountFunction);

    const response = await admin.graphql(
      `#graphql
        mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
            automaticAppDiscount {
              discountId
              title
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
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
          automaticAppDiscount: {
            title: "Pickup Afhaal Korting (Automatisch)",
            functionId: discountFunction.id,
            // Discount Function API: sınıf belirtilmezse function çıktısı uygulanmaz
            discountClasses: ["ORDER"],
            startsAt: "2024-01-01T00:00:00Z",
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: true
            }
          }
        }
      }
    );

    const result = await response.json();
    //console.log("Discount created:", JSON.stringify(result, null, 2));

    const errors = result.data?.discountAutomaticAppCreate?.userErrors;
    if (errors && errors.length > 0) {
      //console.error("❌ USER ERRORS:", errors);
      return { success: false, errors };
    }

    if (result.data?.discountAutomaticAppCreate?.automaticAppDiscount) {
      //console.log("✅ Discount created successfully!");
      return { success: true, data: result };
    }

    //console.error("❌ No discount created");
    return { success: false, error: "No discount created" };
  } catch (error) {
    //console.error("Error creating discount:", error);
    return { success: false, error: String(error) };
  }
};