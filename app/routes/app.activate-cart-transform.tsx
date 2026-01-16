import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { Page, Layout, Card, Button, Banner, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Mevcut cart transform'ları kontrol et
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
  const { admin } = await authenticate.admin(request);

  try {
    // Cart transform handle - extension TOML dosyasındaki handle değeri
    const functionHandle = "pickup-cart-price-transform";

    // Cart transform'u aktif et
    const response = await admin.graphql(
      `#graphql
        mutation cartTransformCreate($functionHandle: String!) {
          cartTransformCreate(functionHandle: $functionHandle) {
            cartTransform {
              id
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
          functionHandle: functionHandle
        }
      }
    );

    const result: any = await response.json();
    //console.log("Cart Transform created:", JSON.stringify(result, null, 2));

    // GraphQL errors kontrolü
    if (result.errors) {
      //console.error("❌ GRAPHQL ERRORS:", JSON.stringify(result.errors, null, 2));
      return {
        success: false,
        error: result.errors.map((e: any) => e.message).join(", ")
      };
    }

    const errors = result.data?.cartTransformCreate?.userErrors;
    if (errors && errors.length > 0) {
      //console.error("❌ USER ERRORS:", JSON.stringify(errors, null, 2));
      return { success: false, errors };
    }

    if (result.data?.cartTransformCreate?.cartTransform) {
      //console.log("✅ Cart Transform activated successfully!");
      return { success: true, data: result };
    }

    //console.error("❌ No cart transform created");
    return { success: false, error: "No cart transform created" };
  } catch (error: any) {
    //console.error("Error activating cart transform:", error);
    //console.error("Error details:", JSON.stringify(error, null, 2));
    return {
      success: false,
      error: error?.body?.errors?.[0]?.message || error?.message || String(error)
    };
  }
};

export default function ActivateCartTransform() {
  const submit = useSubmit();
  const actionData = useActionData<any>();
  const loaderData = useLoaderData<typeof loader>();
  const [isLoading, setIsLoading] = useState(false);

  const handleActivate = () => {
    setIsLoading(true);
    submit({}, { method: "post" });
  };

  const handleDeactivate = () => {
    setIsLoading(true);
    submit({}, { method: "post", action: "/app/deactivate-cart-transform" });
  };

  return (
    <Page
      title="Activate Cart Transform"
      subtitle="Enable automatic pickup discount via Cart Transform function"
      backAction={{ content: "Settings", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="warning" title="⚠️ Cart Transform is Currently Active">
              <p>Cart Transform modifies product prices directly. If you're also using Order Discount, this can cause duplicate discounts.</p>
              <p><strong>Click "Deactivate Cart Transform" below to use only Order Discount (recommended).</strong></p>
            </Banner>
          )}

          {actionData?.success && actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Deactivated!">
              Cart Transform has been deactivated successfully. Now only Order Discount will apply to the cart subtotal (no duplicate discounts).
            </Banner>
          )}

          {actionData?.success && !actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Activated!">
              Cart Transform function has been activated successfully. Pickup discounts will now be applied to product prices!
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="❌ Error">
              {actionData.error || "Unknown error occurred"}
              {actionData.errors && (
                <BlockStack gap="200">
                  {actionData.errors.map((err: any, idx: number) => (
                    <div key={idx}>
                      {err.field}: {err.message}
                    </div>
                  ))}
                </BlockStack>
              )}
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <div>
                <strong>⚠️ Warning: Cart Transform vs Order Discount</strong>
                <p>
                  <strong>Cart Transform</strong> modifies product prices directly in the cart.
                  This can cause <strong>duplicate discounts</strong> if you're also using Order Discount function.
                </p>
              </div>

              <div>
                <strong>Recommendation:</strong>
                <ul>
                  <li>✅ <strong>Use Order Discount only</strong> - Applies discount to cart subtotal (cleaner, no duplicates)</li>
                  <li>❌ <strong>Avoid using both</strong> - Cart Transform + Order Discount = duplicate discounts</li>
                </ul>
              </div>

              <div>
                <strong>What is Cart Transform?</strong>
                <p>
                  Cart Transform adjusts individual product prices based on delivery method.
                  When pickup is selected, it reduces each product's price by the discount percentage.
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {loaderData?.hasActiveTransform && (
                  <Button
                    variant="primary"
                    tone="critical"
                    onClick={handleDeactivate}
                    loading={isLoading && !actionData}
                  >
                    🛑 Deactivate Cart Transform (Recommended)
                  </Button>
                )}

                <Button
                  variant={loaderData?.hasActiveTransform ? "secondary" : "primary"}
                  onClick={handleActivate}
                  loading={isLoading && !actionData}
                  disabled={loaderData?.hasActiveTransform}
                >
                  {loaderData?.hasActiveTransform
                    ? "✅ Already Active"
                    : "Activate Cart Transform"}
                </Button>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
