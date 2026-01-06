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
    console.log("Available functions:", JSON.stringify(functionsData, null, 2));

    const discountFunction = functionsData.data?.shopifyFunctions?.nodes?.find(
      (fn: any) => fn.apiType === "order_discounts"
    );

    if (!discountFunction) {
      console.error("❌ No order discount function found!");
      return { success: false, error: "Discount function not found. Please deploy first." };
    }

    console.log("Using function:", discountFunction);

    const response = await admin.graphql(
      `#graphql
        mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
            automaticAppDiscount {
              discountId
              title
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
            title: "Teslimat İndirimi",
            functionId: discountFunction.id,
            startsAt: "2026-01-01T00:00:00Z"
          }
        }
      }
    );

    const result = await response.json();
    console.log("Discount created:", JSON.stringify(result, null, 2));

    const errors = result.data?.discountAutomaticAppCreate?.userErrors;
    if (errors && errors.length > 0) {
      console.error("❌ USER ERRORS:", errors);
      return { success: false, errors };
    }

    if (result.data?.discountAutomaticAppCreate?.automaticAppDiscount) {
      console.log("✅ Discount created successfully!");
      return { success: true, data: result };
    }

    console.error("❌ No discount created");
    return { success: false, error: "No discount created" };
  } catch (error) {
    console.error("Error creating discount:", error);
    return { success: false, error: String(error) };
  }
};