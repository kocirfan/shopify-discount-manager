import type { ActionFunctionArgs } from "react-router";
import { useActionData, useSubmit } from "react-router";
import { Page, Layout, Card, Button, BlockStack, Text, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "clear_metafield") {
      // Metafield'ı temizle
      const shopResponse = await admin.graphql(
        `#graphql
          query {
            shop {
              id
            }
          }
        `
      );
      const shopData = await shopResponse.json();
      const shopId = shopData.data.shop.id;

      const deleteResponse = await admin.graphql(
        `#graphql
          mutation DeleteMetafield($input: MetafieldDeleteInput!) {
            metafieldDelete(input: $input) {
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
            input: {
              id: shopId,
              key: "settings",
              namespace: "delivery_discount"
            }
          }
        }
      );

      return { success: true, message: "Metafield temizlendi!" };
    }

    if (action === "list_discounts") {
      // Tüm automatic discount'ları listele
      const response = await admin.graphql(
        `#graphql
          query {
            automaticDiscountNodes(first: 50) {
              edges {
                node {
                  id
                  automaticDiscount {
                    ... on DiscountAutomaticApp {
                      title
                      discountId
                      appDiscountType {
                        appKey
                        functionId
                      }
                    }
                  }
                }
              }
            }
          }
        `
      );

      const data = await response.json();
      console.log("Automatic Discounts:", JSON.stringify(data, null, 2));

      const discounts = data.data?.automaticDiscountNodes?.edges || [];
      return {
        success: true,
        message: `${discounts.length} adet automatic discount bulundu. Console'a yazdırıldı.`,
        discounts: discounts
      };
    }

    if (action === "delete_all_discounts") {
      // Tüm automatic discount'ları sil
      const response = await admin.graphql(
        `#graphql
          query {
            automaticDiscountNodes(first: 50) {
              edges {
                node {
                  id
                }
              }
            }
          }
        `
      );

      const data = await response.json();
      const discounts = data.data?.automaticDiscountNodes?.edges || [];

      let deleted = 0;
      for (const edge of discounts) {
        const deleteResponse = await admin.graphql(
          `#graphql
            mutation discountAutomaticDelete($id: ID!) {
              discountAutomaticDelete(id: $id) {
                deletedAutomaticDiscountId
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          {
            variables: {
              id: edge.node.id
            }
          }
        );

        const result = await deleteResponse.json();
        if (result.data?.discountAutomaticDelete?.deletedAutomaticDiscountId) {
          deleted++;
        }
      }

      return {
        success: true,
        message: `${deleted} adet automatic discount silindi!`
      };
    }

    return { success: false, message: "Bilinmeyen işlem" };
  } catch (error: any) {
    console.error("Cleanup error:", error);
    return { success: false, message: error.message };
  }
};

export default function Cleanup() {
  const actionData = useActionData<{ success: boolean; message: string; discounts?: any[] }>();
  const submit = useSubmit();

  const handleAction = (action: string) => {
    const formData = new FormData();
    formData.append("action", action);
    submit(formData, { method: "post" });
  };

  return (
    <Page title="Cleanup & Debug" backAction={{ url: "/app" }}>
      <Layout>
        {actionData && (
          <Layout.Section>
            <Banner tone={actionData.success ? "success" : "critical"}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Metafield Temizleme
              </Text>
              <Text as="p" tone="subdued">
                Admin panelinde kaydettiğiniz teslimat ayarlarını temizler.
              </Text>
              <Button onClick={() => handleAction("clear_metafield")} tone="critical">
                Metafield'ı Temizle
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Automatic Discounts
              </Text>
              <Text as="p" tone="subdued">
                Shopify Admin'deki tüm automatic discount'ları listele veya sil.
              </Text>
              <BlockStack gap="200">
                <Button onClick={() => handleAction("list_discounts")}>
                  Discount'ları Listele
                </Button>
                <Button onClick={() => handleAction("delete_all_discounts")} tone="critical">
                  Tüm Automatic Discount'ları Sil
                </Button>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData?.discounts && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Bulunan Discount'lar ({actionData.discounts.length})
                </Text>
                {actionData.discounts.map((edge: any, index: number) => (
                  <Card key={index}>
                    <BlockStack gap="200">
                      <Text as="p">
                        <strong>ID:</strong> {edge.node.id}
                      </Text>
                      {edge.node.automaticDiscount?.title && (
                        <Text as="p">
                          <strong>Title:</strong> {edge.node.automaticDiscount.title}
                        </Text>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
