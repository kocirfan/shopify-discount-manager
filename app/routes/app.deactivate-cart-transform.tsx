import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Mevcut cart transform'ları al
    const listResponse = await admin.graphql(
      `#graphql
        query {
          cartTransforms(first: 10) {
            nodes {
              id
            }
          }
        }
      `
    );

    const listResult: any = await listResponse.json();
    const transforms = listResult.data?.cartTransforms?.nodes || [];

    if (transforms.length === 0) {
      return { success: false, error: "No active cart transform found" };
    }

    // Her cart transform'u sil
    for (const transform of transforms) {
      await admin.graphql(
        `#graphql
          mutation cartTransformDelete($id: ID!) {
            cartTransformDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            id: transform.id
          }
        }
      );
    }

    console.log("✅ Cart Transform deactivated successfully!");
    return { success: true, message: "Cart Transform deactivated" };
  } catch (error: any) {
    console.error("Error deactivating cart transform:", error);
    return {
      success: false,
      error: error?.message || String(error)
    };
  }
};
