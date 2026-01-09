import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Banner,
  Select,
  TextField,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

interface DeliveryMethod {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  discountType: "percentage" | "fixed";
  discountValue: number;
}

interface LoaderData {
  settings: {
    deliveryMethods: DeliveryMethod[];
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  const deliveryMethods: DeliveryMethod[] = [];

  try {
    // Önce shop ID'sini ve kayıtlı ayarları alalım
    const shopResponse = await admin.graphql(
      `#graphql
        query {
          shop {
            id
            deliveryDiscountSettings: metafield(
              namespace: "delivery_discount"
              key: "settings"
            ) {
              value
            }
          }
        }
      `
    );

    const shopData = await shopResponse.json();
    const savedSettings = shopData.data.shop.deliveryDiscountSettings?.value;
    
    let savedMethodsMap: Map<string, DeliveryMethod> = new Map();
    
    // Kayıtlı ayarları parse et
    if (savedSettings) {
      try {
        const savedMethods: DeliveryMethod[] = JSON.parse(savedSettings);
        savedMethods.forEach(method => {
          savedMethodsMap.set(method.id, method);
        });
        console.log("Loaded saved settings:", savedMethods);
      } catch (error) {
        console.error("Error parsing saved settings:", error);
      }
    }

    // Delivery profiles'ları çek (shipping için)
    const profilesResponse = await admin.graphql(
      `#graphql
        query {
          deliveryProfiles(first: 5) {
            edges {
              node {
                id
                name
                profileLocationGroups {
                  locationGroupZones(first: 10) {
                    edges {
                      node {
                        zone {
                          name
                        }
                        methodDefinitions(first: 10) {
                          edges {
                            node {
                              id
                              name
                              rateProvider {
                                ... on DeliveryRateDefinition {
                                  id
                                  price {
                                    amount
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `
    );

    const profilesData = await profilesResponse.json();

    // Shipping methodları ekle
    if (profilesData.data?.deliveryProfiles?.edges) {
      profilesData.data.deliveryProfiles.edges.forEach((profileEdge: any) => {
        const profile = profileEdge.node;
        
        profile.profileLocationGroups?.forEach((group: any) => {
          group.locationGroupZones?.edges?.forEach((zoneEdge: any) => {
            const zone = zoneEdge.node;
            
            zone.methodDefinitions?.edges?.forEach((methodEdge: any) => {
              const method = methodEdge.node;
              const methodId = `shipping-${method.id}`;
              
              // Kayıtlı ayarları kullan veya default değerler
              const savedMethod = savedMethodsMap.get(methodId);
              
              deliveryMethods.push({
                id: methodId,
                name: `${method.name} (${zone.zone?.name || 'Shipping'})`,
                type: "shipping",
                enabled: savedMethod?.enabled || false,
                discountType: savedMethod?.discountType || "percentage",
                discountValue: savedMethod?.discountValue || 0,
              });
            });
          });
        });
      });
    }

    // Pickup locations'ları çek
    const locationsResponse = await admin.graphql(
      `#graphql
        query {
          locations(first: 10) {
            edges {
              node {
                id
                name
                fulfillsOnlineOrders
                address {
                  address1
                  city
                }
              }
            }
          }
        }
      `
    );

    const locationsData = await locationsResponse.json();

    // Pickup methodları ekle
    if (locationsData.data?.locations?.edges) {
      locationsData.data.locations.edges.forEach((edge: any) => {
        const location = edge.node;
        if (location.fulfillsOnlineOrders) {
          const locationName = location.address?.city
            ? `${location.name} - ${location.address.city}`
            : location.name;

          const methodId = `pickup-${location.id}`;
          const savedMethod = savedMethodsMap.get(methodId);

          deliveryMethods.push({
            id: methodId,
            name: `${locationName} (Pickup)`,
            type: "pickup",
            enabled: savedMethod?.enabled || false,
            discountType: savedMethod?.discountType || "percentage",
            discountValue: savedMethod?.discountValue !== undefined ? savedMethod.discountValue : 2,
          });
        }
      });
    }
  } catch (error) {
    console.error("Error fetching delivery methods:", error);
  }

  // Fallback eğer hiç metod yoksa
  if (deliveryMethods.length === 0) {
    deliveryMethods.push(
      {
        id: "default-pickup",
        name: "Store Pickup",
        type: "pickup",
        enabled: false,
        discountType: "percentage",
        discountValue: 2,
      },
      {
        id: "default-shipping",
        name: "Standard Shipping",
        type: "shipping",
        enabled: false,
        discountType: "percentage",
        discountValue: 0,
      }
    );
  }

  return { settings: { deliveryMethods } };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const methods = JSON.parse(formData.get("methods") as string);

  console.log("=== SAVING SETTINGS ===");
  console.log("Methods to save:", JSON.stringify(methods, null, 2));

  try {
    // Önce shop ID'sini alalım
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
    console.log("Shop ID:", shopId);

    // Metafield'a kaydet
    const response = await admin.graphql(
      `#graphql
        mutation CreateMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
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
          metafields: [
            {
              namespace: "delivery_discount",
              key: "settings",
              type: "json",
              value: JSON.stringify(methods),
              ownerId: shopId,
            },
          ],
        },
      }
    );

    const result = await response.json();
    console.log("Metafield save result:", JSON.stringify(result, null, 2));

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const error = result.data.metafieldsSet.userErrors[0];
      console.error("Metafield error:", error);
      return {
        success: false,
        message: "Hata: " + error.message
      };
    }

    if (result.data?.metafieldsSet?.metafields?.length > 0) {
      console.log("✅ Metafield saved successfully!");
      return { success: true, message: "Ayarlar başarıyla kaydedildi!" };
    }

    console.error("❌ No metafield created");
    return { success: false, message: "Metafield oluşturulamadı!" };
  } catch (error: any) {
    console.error("Error saving settings:", error);
    return { success: false, message: "Kaydetme hatası: " + error.message };
  }
};

export default function Index() {
  const { settings } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message: string }>();
  const submit = useSubmit();
  const [methods, setMethods] = useState(settings.deliveryMethods);

  const handleToggle = (id: string) => {
    setMethods(
      methods.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const handleDiscountChange = (id: string, field: string, value: any) => {
    setMethods(
      methods.map((m) =>
        m.id === id ? { ...m, [field]: value } : m
      )
    );
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("methods", JSON.stringify(methods));
    submit(formData, { method: "post" });
  };
  const handleActivateDiscount = async () => {
  try {
    const response = await fetch('/app/activate-discount', {
      method: 'POST',
    });
    const result = await response.json();
    console.log('Activation result:', result);
    alert('Discount activated!');
  } catch (error) {
    console.error('Error:', error);
    alert('Error activating discount');
  }
};

  const handleActivateCartTransform = async () => {
  try {
    const response = await fetch('/app/activate-cart-transform', {
      method: 'POST',
    });
    const result = await response.json();
    console.log('Cart Transform activation result:', result);
    alert('Cart Transform activated!');
  } catch (error) {
    console.error('Error:', error);
    alert('Error activating cart transform');
  }
};

  return (
    <Page title="Delivery Discount Manager">
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            <p>
              Teslimat metodlarına göre otomatik indirim uygulayın. Pickup
              seçildiğinde sepete %2 indirim gibi.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            {methods.map((method) => (
              <Card key={method.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">
                      {method.name}
                    </Text>
                    <Checkbox
                      label="Aktif"
                      checked={method.enabled}
                      onChange={() => handleToggle(method.id)}
                    />
                  </InlineStack>

                  {method.enabled && (
                    <BlockStack gap="300">
                      <Select
                        label="İndirim Tipi"
                        options={[
                          { label: "Yüzde (%)", value: "percentage" },
                          { label: "Sabit Tutar (€)", value: "fixed" },
                        ]}
                        value={method.discountType}
                        onChange={(value) =>
                          handleDiscountChange(method.id, "discountType", value)
                        }
                      />

                      <TextField
                        label={`İndirim Değeri ${
                          method.discountType === "percentage" ? "(%)" : "(€)"
                        }`}
                        type="number"
                        value={method.discountValue.toString()}
                        onChange={(value) =>
                          handleDiscountChange(
                            method.id,
                            "discountValue",
                            parseFloat(value)
                          )
                        }
                        autoComplete="off"
                      />
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Layout.Section>

              <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Function Aktivasyonu
            </Text>
            <Text as="p" tone="subdued">
              İki yaklaşımdan birini seçin: Cart Transform (önerilen - diğer indirimlerle çalışır) veya Product Discount.
            </Text>
            <InlineStack gap="300">
              <Button onClick={handleActivateCartTransform} variant="primary">
                Cart Transform'u Aktifleştir (Önerilen)
              </Button>
              <Button onClick={handleActivateDiscount}>
                Product Discount'u Aktifleştir
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>


        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Button variant="primary" size="large" onClick={handleSave}>
                Ayarları Kaydet
              </Button>
              <Text as="p" tone="subdued">
                Kaydettiğinizde indirimler otomatik uygulanmaya başlar.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}