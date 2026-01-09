import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Önce cart transform function ID'sini alalım
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

    const cartTransformFunction = functionsData.data?.shopifyFunctions?.nodes?.find(
      (fn: any) => fn.apiType === "cart_transform"
    );

    if (!cartTransformFunction) {
      console.error("❌ No cart transform function found!");
      return { success: false, error: "Cart Transform function not found. Please deploy first." };
    }

    console.log("Using cart transform function:", cartTransformFunction);

    // Cart transform'u aktif et
    const response = await admin.graphql(
      `#graphql
        mutation cartTransformCreate($cartTransform: CartTransformCreateInput!) {
          cartTransformCreate(cartTransform: $cartTransform) {
            cartTransform {
              id
              functionId
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
          cartTransform: {
            functionId: cartTransformFunction.id,
            blockOnFailure: false
          }
        }
      }
    );

    const result = await response.json();
    console.log("Cart Transform created:", JSON.stringify(result, null, 2));

    const errors = result.data?.cartTransformCreate?.userErrors;
    if (errors && errors.length > 0) {
      console.error("❌ USER ERRORS:", errors);
      return { success: false, errors };
    }

    if (result.data?.cartTransformCreate?.cartTransform) {
      console.log("✅ Cart Transform activated successfully!");
      return { success: true, data: result };
    }

    console.error("❌ No cart transform created");
    return { success: false, error: "No cart transform created" };
  } catch (error) {
    console.error("Error activating cart transform:", error);
    return { success: false, error: String(error) };
  }
};
