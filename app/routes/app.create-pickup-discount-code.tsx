import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { Page, Layout, Card, Button, Banner, BlockStack, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // PICKUP2 discount code'unun var olup olmadığını kontrol et
    const response = await admin.graphql(
      `#graphql
        query getDiscountByCode($code: String!) {
          codeDiscountNodeByCode(code: $code) {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
                customerGets {
                  value {
                    ... on DiscountPercentage {
                      percentage
                    }
                  }
                }
                status
                startsAt
                endsAt
              }
            }
          }
        }
      `,
      {
        variables: {
          code: "PICKUP2"
        }
      }
    );

    const result = await response.json();
    const discountExists = !!result.data?.codeDiscountNodeByCode?.id;
    const discountData = result.data?.codeDiscountNodeByCode;

    return {
      discountExists,
      discountData,
      code: "PICKUP2"
    };
  } catch (error) {
    //console.error("Error checking discount code:", error);
    return { discountExists: false, discountData: null, code: "PICKUP2" };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "create") {
      // PICKUP2 discount code'unu oluştur
      const response = await admin.graphql(
        `#graphql
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 1) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                    customerGets {
                      value {
                        ... on DiscountPercentage {
                          percentage
                        }
                      }
                    }
                  }
                }
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
            basicCodeDiscount: {
              title: "Pickup Discount 2%",
              code: "PICKUP2",
              startsAt: new Date().toISOString(),
              customerSelection: {
                all: true
              },
              customerGets: {
                value: {
                  percentage: 0.02
                },
                items: {
                  all: true
                }
              },
              appliesOncePerCustomer: false,
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: true,
                shippingDiscounts: true
              }
            }
          }
        }
      );

      const result: any = await response.json();

      if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
        return {
          success: false,
          errors: result.data.discountCodeBasicCreate.userErrors
        };
      }

      return {
        success: true,
        message: "PICKUP2 discount code created successfully!",
        discount: result.data?.discountCodeBasicCreate?.codeDiscountNode
      };
    }

    if (action === "delete") {
      // Önce discount code'un ID'sini al
      const checkResponse = await admin.graphql(
        `#graphql
          query getDiscountByCode($code: String!) {
            codeDiscountNodeByCode(code: $code) {
              id
            }
          }
        `,
        {
          variables: {
            code: "PICKUP2"
          }
        }
      );

      const checkResult: any = await checkResponse.json();
      const discountId = checkResult.data?.codeDiscountNodeByCode?.id;

      if (!discountId) {
        return {
          success: false,
          error: "Discount code not found"
        };
      }

      // Discount code'u sil
      const deleteResponse = await admin.graphql(
        `#graphql
          mutation discountCodeDelete($id: ID!) {
            discountCodeDelete(id: $id) {
              deletedCodeDiscountId
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            id: discountId
          }
        }
      );

      const deleteResult: any = await deleteResponse.json();

      if (deleteResult.data?.discountCodeDelete?.userErrors?.length > 0) {
        return {
          success: false,
          errors: deleteResult.data.discountCodeDelete.userErrors
        };
      }

      return {
        success: true,
        message: "PICKUP2 discount code deleted successfully!",
        deleted: true
      };
    }

    return {
      success: false,
      error: "Invalid action"
    };
  } catch (error: any) {
    //console.error("Error managing discount code:", error);
    return {
      success: false,
      error: error?.message || String(error)
    };
  }
};

export default function CreatePickupDiscountCode() {
  const submit = useSubmit();
  const actionData = useActionData<any>();
  const loaderData = useLoaderData<typeof loader>();
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "create");
    submit(formData, { method: "post" });
  };

  const handleDelete = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "delete");
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Afhaal Kortingscode"
      subtitle="Beheer PICKUP2 kortingscode voor automatische afhaalkorting"
      backAction={{ content: "Instellingen", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && !actionData?.deleted && (
            <Banner tone="success" title="✅ Kortingscode Aangemaakt!">
              <p>PICKUP2 kortingscode is succesvol aangemaakt. Deze wordt automatisch toegepast wanneer klanten afhalen selecteren.</p>
            </Banner>
          )}

          {actionData?.success && actionData?.deleted && (
            <Banner tone="success" title="✅ Kortingscode Verwijderd!">
              <p>PICKUP2 kortingscode is succesvol verwijderd.</p>
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="❌ Fout">
              <p>{actionData.error || "Onbekende fout opgetreden"}</p>
              {actionData.errors && (
                <BlockStack gap="200">
                  {actionData.errors.map((err: any, idx: number) => (
                    <Text key={idx} as="p">
                      {err.field}: {err.message}
                    </Text>
                  ))}
                </BlockStack>
              )}
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <div>
                <strong>Huidige Status:</strong>
                <p>
                  {loaderData?.discountExists ? (
                    <span style={{ color: 'green' }}>✅ PICKUP2 kortingscode <strong>BESTAAT</strong></span>
                  ) : (
                    <span style={{ color: 'orange' }}>⚠️ PICKUP2 kortingscode <strong>NIET GEVONDEN</strong></span>
                  )}
                </p>
              </div>

              {loaderData?.discountData && (
                <div>
                  <strong>Kortingsdetails:</strong>
                  <ul>
                    <li><strong>Code:</strong> {loaderData.code}</li>
                    <li><strong>Korting:</strong> 2% korting op alle producten</li>
                    <li><strong>Status:</strong> {loaderData.discountData.codeDiscount?.status || 'ACTIEF'}</li>
                    <li><strong>Gebruik:</strong> Onbeperkt gebruik, alle klanten</li>
                  </ul>
                </div>
              )}

              <div>
                <strong>Hoe het werkt:</strong>
                <ul>
                  <li>Klant selecteert afhalen bij het afrekenen</li>
                  <li>Extensie past automatisch PICKUP2 kortingscode toe</li>
                  <li>2% korting wordt toegepast op alle producten</li>
                  <li>Werkt samen met andere Order Discount functies van andere apps</li>
                  <li>Kortingscode wordt verwijderd als klant overschakelt naar verzending</li>
                </ul>
              </div>

              <div>
                <strong>⚠️ Belangrijk:</strong>
                <p>Deze kortingscode aanpak stelt u in staat om afhaalkorting te gebruiken naast Order Discount functies van andere apps, aangezien Shopify Kortingscodes + Order Discounts samen laat werken.</p>
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {!loaderData?.discountExists && (
                  <Button
                    variant="primary"
                    onClick={handleCreate}
                    loading={isLoading && !actionData}
                  >
                    PICKUP2 Kortingscode Aanmaken
                  </Button>
                )}

                {loaderData?.discountExists && (
                  <>
                    <Button
                      disabled
                      variant="secondary"
                    >
                      ✅ Reeds Aangemaakt
                    </Button>
                    <Button
                      tone="critical"
                      onClick={handleDelete}
                      loading={isLoading && !actionData}
                    >
                      Kortingscode Verwijderen
                    </Button>
                  </>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
