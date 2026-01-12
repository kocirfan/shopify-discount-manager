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
    console.error("Error checking cart transforms:", error);
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
    console.log("Cart Transform created:", JSON.stringify(result, null, 2));

    // GraphQL errors kontrolü
    if (result.errors) {
      console.error("❌ GRAPHQL ERRORS:", JSON.stringify(result.errors, null, 2));
      return {
        success: false,
        error: result.errors.map((e: any) => e.message).join(", ")
      };
    }

    const errors = result.data?.cartTransformCreate?.userErrors;
    if (errors && errors.length > 0) {
      console.error("❌ USER ERRORS:", JSON.stringify(errors, null, 2));
      return { success: false, errors };
    }

    if (result.data?.cartTransformCreate?.cartTransform) {
      console.log("✅ Cart Transform activated successfully!");
      return { success: true, data: result };
    }

    console.error("❌ No cart transform created");
    return { success: false, error: "No cart transform created" };
  } catch (error: any) {
    console.error("Error activating cart transform:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return {
      success: false,
      error: error?.body?.errors?.[0]?.message || error?.message || String(error)
    };
  }
};

export default function ActivateCartTransform() {
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
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
            <Banner tone="info" title="Cart Transform Already Active">
              A Cart Transform function is already active on your store. Only one cart transform can be active at a time.
            </Banner>
          )}

          {actionData?.success && (
            <Banner tone="success" title="Success!">
              Cart Transform function has been activated successfully. Pickup discounts will now be applied automatically!
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="Error activating Cart Transform">
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
                <strong>What is Cart Transform?</strong>
                <p>
                  Cart Transform is a Shopify Function that automatically adjusts cart prices
                  based on the selected delivery method. When customers choose pickup, it applies
                  an additional 2% discount on top of any existing discounts.
                </p>
              </div>

              <div>
                <strong>How it works:</strong>
                <ul>
                  <li>Customer selects pickup at checkout</li>
                  <li>Cart Transform automatically applies 2% additional discount</li>
                  <li>Discount is invisible to customer (no code shown)</li>
                  <li>Discount is automatically removed if pickup is deselected</li>
                </ul>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  loading={isLoading && !actionData}
                  disabled={loaderData?.hasActiveTransform && !actionData?.success}
                >
                  {loaderData?.hasActiveTransform && !actionData?.success
                    ? "Cart Transform Already Active"
                    : "Activate Cart Transform Function"}
                </Button>

                {loaderData?.hasActiveTransform && (
                  <Button
                    tone="critical"
                    onClick={handleDeactivate}
                    loading={isLoading && !actionData}
                  >
                    Deactivate Cart Transform
                  </Button>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
