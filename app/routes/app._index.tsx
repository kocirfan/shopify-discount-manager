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
    baseDiscountPercentage: number;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const deliveryMethods: DeliveryMethod[] = [];
  let baseDiscountPercentage = 10; // Default TestKocirfan discount

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
            baseDiscountSettings: metafield(
              namespace: "delivery_discount"
              key: "base_discount"
            ) {
              value
            }
          }
        }
      `
    );

    const shopData = await shopResponse.json();
    const savedSettings = shopData.data.shop.deliveryDiscountSettings?.value;
    const savedBaseDiscount = shopData.data.shop.baseDiscountSettings?.value;

    // Base discount'u yükle
    if (savedBaseDiscount) {
      try {
        baseDiscountPercentage = parseFloat(savedBaseDiscount);
        ////console.log("Loaded base discount:", baseDiscountPercentage);
      } catch (error) {
        ////console.error("Error parsing base discount:", error);
      }
    }

    let savedMethodsMap: Map<string, DeliveryMethod> = new Map();

    // Kayıtlı ayarları parse et
    if (savedSettings) {
      try {
        const savedMethods: DeliveryMethod[] = JSON.parse(savedSettings);
        savedMethods.forEach(method => {
          savedMethodsMap.set(method.id, method);
        });
        ////console.log("Loaded saved settings:", savedMethods);
      } catch (error) {
        //console.error("Error parsing saved settings:", error);
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
    //console.error("Error fetching delivery methods:", error);
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

  return { settings: { deliveryMethods, baseDiscountPercentage } };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const methods = JSON.parse(formData.get("methods") as string);
  const baseDiscount = formData.get("baseDiscount") as string;

  //console.log("=== SAVING SETTINGS ===");
  //console.log("Methods to save:", JSON.stringify(methods, null, 2));
  //console.log("Base discount to save:", baseDiscount);

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
    //console.log("Shop ID:", shopId);

    // Metafield'a kaydet (hem delivery methods hem base discount)
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
            {
              namespace: "delivery_discount",
              key: "base_discount",
              type: "number_decimal",
              value: baseDiscount,
              ownerId: shopId,
            },
          ],
        },
      }
    );

    const result = await response.json();
    //console.log("Metafield save result:", JSON.stringify(result, null, 2));

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const error = result.data.metafieldsSet.userErrors[0];
      //console.error("Metafield error:", error);
      return {
        success: false,
        message: "Fout: " + error.message
      };
    }

    if (result.data?.metafieldsSet?.metafields?.length > 0) {
      //console.log("✅ Metafield saved successfully!");
      return { success: true, message: "Instellingen succesvol opgeslagen!" };
    }

    //console.error("❌ No metafield created");
    return { success: false, message: "Metafield kon niet worden aangemaakt!" };
  } catch (error: any) {
    //console.error("Error saving settings:", error);
    return { success: false, message: "Opslaan mislukt: " + error.message };
  }
};

export default function Index() {
  const { settings } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message: string }>();
  const submit = useSubmit();
  const [methods, setMethods] = useState(settings.deliveryMethods);
  const [baseDiscount, setBaseDiscount] = useState(settings.baseDiscountPercentage);

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
    formData.append("baseDiscount", baseDiscount.toString());
    submit(formData, { method: "post" });
  };

  const handleActivateCartTransform = async () => {
    try {
      const response = await fetch('/app/activate-cart-transform', {
        method: 'POST',
      });
      const result = await response.json();
      //console.log('Cart Transform activation result:', result);
      if (result.success) {
        alert('✅ Cart Transform succesvol geactiveerd! Het werkt nu samen met TestKocirfan.');
      } else {
        alert('❌ Fout: ' + (result.error || JSON.stringify(result.errors)));
      }
    } catch (error) {
      //console.error('Error:', error);
      alert('❌ Activatiefout');
    }
  };

  const handleActivateOrderDiscount = async () => {
    try {
      const response = await fetch('/app/activate-discount', {
        method: 'POST',
      });
      const result = await response.json();
      //console.log('Order Discount activation result:', result);
      if (result.success) {
        alert('✅ Order Discount succesvol geactiveerd! Bij afhalen wordt automatisch winkelwagenkorting toegepast.');
      } else {
        alert('❌ Fout: ' + (result.error || JSON.stringify(result.errors)));
      }
    } catch (error) {
      //console.error('Error:', error);
      alert('❌ Activatiefout');
    }
  };

  return (
    <Page title="Bezorgkorting Beheer">
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
              Pas automatische kortingen toe op basis van bezorgmethoden. Bij afhalen
              wordt automatisch 20% korting toegepast op de winkelwagen.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                🎯 Basiskortingspercentage
              </Text>
              <Text as="p" tone="subdued">
                Basiskortingspercentage dat samen met andere kortingen wordt toegepast (bijv. TestKocirfan, klantsegmentatie)
              </Text>
              <TextField
                label="Basiskortingspercentage (%)"
                type="number"
                value={baseDiscount.toString()}
                onChange={(value) => setBaseDiscount(parseFloat(value) || 0)}
                autoComplete="off"
                helpText="Dit percentage wordt gecombineerd met de afhaalkorting (samengestelde korting)"
              />
            </BlockStack>
          </Card>
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
                      label="Actief"
                      checked={method.enabled}
                      onChange={() => handleToggle(method.id)}
                    />
                  </InlineStack>

                  {method.enabled && (
                    <BlockStack gap="300">
                      <Select
                        label="Kortingstype"
                        options={[
                          { label: "Percentage (%)", value: "percentage" },
                          { label: "Vast bedrag (€)", value: "fixed" },
                        ]}
                        value={method.discountType}
                        onChange={(value) =>
                          handleDiscountChange(method.id, "discountType", value)
                        }
                      />

                      <TextField
                        label={`Kortingswaarde ${
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
                ⚡ Order Discount Activering (AANBEVOLEN)
              </Text>
              <Text as="p" tone="subdued">
                Activeer de Order Discount functie om automatisch korting toe te passen op het winkelwagentotaal bij afhalen.
                Deze korting werkt samen met andere kortingen (TESTKOCIRFAN) en is zichtbaar bij het afrekenen.
              </Text>
              <Button onClick={handleActivateOrderDiscount} variant="primary">
                Order Discount Activeren
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                🔧 Cart Transform (Alternatief)
              </Text>
              <Text as="p" tone="subdued">
                Als alternatief kan Cart Transform worden gebruikt, maar Order Discount wordt aanbevolen.
                Cart Transform wijzigt productprijzen, Order Discount past korting toe op het winkelwagentotaal.
              </Text>
              <Button onClick={handleActivateCartTransform}>
                Cart Transform Activeren
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Button variant="primary" size="large" onClick={handleSave}>
                Instellingen Opslaan
              </Button>
              <Text as="p" tone="subdued">
                Wanneer u opslaat, worden kortingen automatisch toegepast.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}