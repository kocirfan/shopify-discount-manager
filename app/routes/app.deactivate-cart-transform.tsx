import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { Page, Layout, Card, Button, Banner, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
        query {
          cartTransforms(first: 10) {
            nodes {
              id
              functionId
            }
          }
        }
      `
    );

    const result = await response.json();
    const hasActiveTransform = result.data?.cartTransforms?.nodes?.length > 0;

    return { hasActiveTransform, transforms: result.data?.cartTransforms?.nodes };
  } catch (error) {
    //console.error("Error checking cart transforms:", error);
    return { hasActiveTransform: false, transforms: [] };
  }
};

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
        //console.error("Delete errors:", deleteResult.data.cartTransformDelete.userErrors);
      }
    }

    //console.log("✅ Cart Transform deactivated successfully!");
    return { success: true, message: "Cart Transform deactivated", deactivated: true };
  } catch (error: any) {
    //console.error("Error deactivating cart transform:", error);
    return {
      success: false,
      error: error?.message || String(error),
      deactivated: false
    };
  }
};

export default function DeactivateCartTransform() {
  const submit = useSubmit();
  const actionData = useActionData<any>();
  const loaderData = useLoaderData<typeof loader>();
  const [isLoading, setIsLoading] = useState(false);

  const handleDeactivate = () => {
    setIsLoading(true);
    submit({}, { method: "post" });
  };

  return (
    <Page
      title="Deactivate Cart Transform"
      subtitle="Turn off cart price modifications"
      backAction={{ content: "Settings", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {!loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="info" title="ℹ️ No Active Cart Transform">
              <p>There is no active Cart Transform function on your store.</p>
            </Banner>
          )}

          {actionData?.success && actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Deactivated!">
              Cart Transform has been deactivated successfully. Now only Order Discount will apply to the cart subtotal (no duplicate discounts).
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="❌ Error">
              {actionData.error || "Unknown error occurred"}
            </Banner>
          )}

          {loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="warning" title="⚠️ Cart Transform is Currently Active">
              <p>Cart Transform modifies product prices directly. If you're also using Order Discount, this can cause duplicate discounts.</p>
              <p><strong>Click the button below to deactivate Cart Transform.</strong></p>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <div>
                <strong>Why Deactivate Cart Transform?</strong>
                <p>
                  If you're using both Cart Transform and Order Discount, you may see duplicate discounts:
                </p>
                <ul>
                  <li>Cart Transform: Modifies product prices directly</li>
                  <li>Order Discount: Applies discount to cart subtotal</li>
                </ul>
                <p>
                  <strong>Recommended:</strong> Use only Order Discount for cleaner, non-duplicate discounts.
                </p>
              </div>

              <div>
                <strong>Current Status:</strong>
                <p>
                  {loaderData?.hasActiveTransform ? (
                    <span style={{ color: 'orange' }}>⚠️ Cart Transform is <strong>ACTIVE</strong></span>
                  ) : (
                    <span style={{ color: 'green' }}>✅ Cart Transform is <strong>INACTIVE</strong></span>
                  )}
                </p>
              </div>

              {loaderData?.hasActiveTransform && (
                <Button
                  variant="primary"
                  tone="critical"
                  onClick={handleDeactivate}
                  loading={isLoading && !actionData}
                >
                  🛑 Deactivate Cart Transform
                </Button>
              )}

              {!loaderData?.hasActiveTransform && !actionData && (
                <Button
                  disabled
                  variant="secondary"
                >
                  Already Deactivated
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
