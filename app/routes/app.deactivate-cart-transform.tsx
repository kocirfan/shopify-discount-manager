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
      title="Cart Transform Deactiveren"
      subtitle="Winkelwagen prijswijzigingen uitschakelen"
      backAction={{ content: "Instellingen", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {!loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="info" title="ℹ️ Geen Actieve Cart Transform">
              <p>Er is geen actieve Cart Transform functie in uw winkel.</p>
            </Banner>
          )}

          {actionData?.success && actionData?.deactivated && (
            <Banner tone="success" title="✅ Cart Transform Gedeactiveerd!">
              Cart Transform is succesvol gedeactiveerd. Nu wordt alleen Order Discount toegepast op het winkelwagentotaal (geen dubbele kortingen).
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="❌ Fout">
              {actionData.error || "Onbekende fout opgetreden"}
            </Banner>
          )}

          {loaderData?.hasActiveTransform && !actionData && (
            <Banner tone="warning" title="⚠️ Cart Transform is Momenteel Actief">
              <p>Cart Transform wijzigt productprijzen direct. Als u ook Order Discount gebruikt, kan dit dubbele kortingen veroorzaken.</p>
              <p><strong>Klik op de onderstaande knop om Cart Transform te deactiveren.</strong></p>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <div>
                <strong>Waarom Cart Transform Deactiveren?</strong>
                <p>
                  Als u zowel Cart Transform als Order Discount gebruikt, kunt u dubbele kortingen zien:
                </p>
                <ul>
                  <li>Cart Transform: Wijzigt productprijzen direct</li>
                  <li>Order Discount: Past korting toe op winkelwagentotaal</li>
                </ul>
                <p>
                  <strong>Aanbevolen:</strong> Gebruik alleen Order Discount voor schonere, niet-dubbele kortingen.
                </p>
              </div>

              <div>
                <strong>Huidige Status:</strong>
                <p>
                  {loaderData?.hasActiveTransform ? (
                    <span style={{ color: 'orange' }}>⚠️ Cart Transform is <strong>ACTIEF</strong></span>
                  ) : (
                    <span style={{ color: 'green' }}>✅ Cart Transform is <strong>INACTIEF</strong></span>
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
                  🛑 Cart Transform Deactiveren
                </Button>
              )}

              {!loaderData?.hasActiveTransform && !actionData && (
                <Button
                  disabled
                  variant="secondary"
                >
                  Reeds Gedeactiveerd
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
