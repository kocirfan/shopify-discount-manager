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
      title="Cart Transform Activeren"
      subtitle="Activeer automatische afhaalkorting via Cart Transform functie"
      backAction={{ content: "Instellingen", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="warning" title="⚠️ Cart Transform is Momenteel Actief">
              <p>Cart Transform wijzigt productprijzen direct. Als u ook Order Discount gebruikt, kan dit dubbele kortingen veroorzaken.</p>
              <p><strong>Klik hieronder op "Cart Transform Deactiveren" om alleen Order Discount te gebruiken (aanbevolen).</strong></p>
            </Banner>
          )}

          {actionData?.success && actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Gedeactiveerd!">
              Cart Transform is succesvol gedeactiveerd. Nu wordt alleen Order Discount toegepast op het winkelwagentotaal (geen dubbele kortingen).
            </Banner>
          )}

          {actionData?.success && !actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Geactiveerd!">
              Cart Transform functie is succesvol geactiveerd. Afhaalkorting wordt nu toegepast op productprijzen!
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="❌ Fout">
              {actionData.error || "Onbekende fout opgetreden"}
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
                <strong>⚠️ Waarschuwing: Cart Transform vs Order Discount</strong>
                <p>
                  <strong>Cart Transform</strong> wijzigt productprijzen direct in de winkelwagen.
                  Dit kan <strong>dubbele kortingen</strong> veroorzaken als u ook de Order Discount functie gebruikt.
                </p>
              </div>

              <div>
                <strong>Aanbeveling:</strong>
                <ul>
                  <li>✅ <strong>Gebruik alleen Order Discount</strong> - Past korting toe op winkelwagentotaal (schoner, geen duplicaten)</li>
                  <li>❌ <strong>Vermijd beide te gebruiken</strong> - Cart Transform + Order Discount = dubbele kortingen</li>
                </ul>
              </div>

              <div>
                <strong>Wat is Cart Transform?</strong>
                <p>
                  Cart Transform past individuele productprijzen aan op basis van bezorgmethode.
                  Wanneer afhalen is geselecteerd, verlaagt het de prijs van elk product met het kortingspercentage.
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
                    🛑 Cart Transform Deactiveren (Aanbevolen)
                  </Button>
                )}

                <Button
                  variant={loaderData?.hasActiveTransform ? "secondary" : "primary"}
                  onClick={handleActivate}
                  loading={isLoading && !actionData}
                  disabled={loaderData?.hasActiveTransform}
                >
                  {loaderData?.hasActiveTransform
                    ? "✅ Reeds Actief"
                    : "Cart Transform Activeren"}
                </Button>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
