import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

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
      return { success: false, error: "No active cart transform found", deactivated: false };
    }

    // Her cart transform'u sil
    for (const transform of transforms) {
      const deleteResponse = await admin.graphql(
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

      const deleteResult: any = await deleteResponse.json();
      if (deleteResult.data?.cartTransformDelete?.userErrors?.length > 0) {
        console.error("Delete errors:", deleteResult.data.cartTransformDelete.userErrors);
      }
    }

    console.log("✅ Cart Transform deactivated successfully!");
    return { success: true, message: "Cart Transform deactivated", deactivated: true };
  } catch (error: any) {
    console.error("Error deactivating cart transform:", error);
    return {
      success: false,
      error: error?.message || String(error),
      deactivated: false
    };
  }
};
