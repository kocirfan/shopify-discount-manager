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
  TextField,
  DataTable,
  Modal,
  FormLayout,
  Box,
  Badge,
} from "@shopify/polaris";
import { DeleteIcon, EditIcon, PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

interface CustomerTagRule {
  id: string;
  customerTag: string;
  discountPercentage: number;
  discountName: string;
  enabled: boolean;
  createdAt: string;
}

interface LoaderData {
  rules: CustomerTagRule[];
  discountActive: boolean;
  discountTitle: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let rules: CustomerTagRule[] = [];
  let discountActive = false;
  let discountTitle = "Customer Tag Discount";

  try {
    // Kayıtlı kuralları metafield'dan al
    const shopResponse = await admin.graphql(
      `#graphql
        query {
          shop {
            id
            customerTagDiscountRules: metafield(
              namespace: "customer_tag_discount"
              key: "rules"
            ) {
              value
            }
            customerTagDiscountConfig: metafield(
              namespace: "customer_tag_discount"
              key: "config"
            ) {
              value
            }
          }
        }
      `
    );

    const shopData = await shopResponse.json();
    const savedRules = shopData.data.shop.customerTagDiscountRules?.value;
    const savedConfig = shopData.data.shop.customerTagDiscountConfig?.value;

    if (savedRules) {
      try {
        rules = JSON.parse(savedRules);
      } catch (error) {
        //console.error("Error parsing saved rules:", error);
      }
    }

    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        discountActive = config.active || false;
        discountTitle = config.title || "Customer Tag Discount";
      } catch (error) {
        //console.error("Error parsing saved config:", error);
      }
    }

    // Mevcut discount'u kontrol et
    const discountsResponse = await admin.graphql(
      `#graphql
        query {
          discountNodes(first: 50) {
            edges {
              node {
                id
                discount {
                  ... on DiscountAutomaticApp {
                    title
                    status
                  }
                }
              }
            }
          }
        }
      `
    );

    const discountsData = await discountsResponse.json();
    const existingDiscount = discountsData.data?.discountNodes?.edges?.find(
      (edge: any) => edge.node.discount?.title?.includes("Customer Tag")
    );

    if (existingDiscount) {
      discountActive = existingDiscount.node.discount.status === "ACTIVE";
    }

  } catch (error) {
    //console.error("Error loading customer tag discount rules:", error);
  }

  return { rules, discountActive, discountTitle };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  try {
    // Shop ID'sini al
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

    if (actionType === "saveRules") {
      const rules = formData.get("rules") as string;
      const discountTitle = formData.get("discountTitle") as string;

      // Kuralları ve config'i metafield'a kaydet
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
                namespace: "customer_tag_discount",
                key: "rules",
                type: "json",
                value: rules,
                ownerId: shopId,
              },
              {
                namespace: "customer_tag_discount",
                key: "config",
                type: "json",
                value: JSON.stringify({ title: discountTitle, active: true }),
                ownerId: shopId,
              },
            ],
          },
        }
      );

      const result = await response.json();

      if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        return {
          success: false,
          message: "Fout: " + result.data.metafieldsSet.userErrors[0].message,
        };
      }

      return { success: true, message: "Regels succesvol opgeslagen!" };
    }

    if (actionType === "activateDiscount") {
      const discountTitle = formData.get("discountTitle") as string || "Customer Tag Discount";

      // Önce function ID'sini al
      const functionsResponse = await admin.graphql(
        `#graphql
          query {
            shopifyFunctions(first: 50) {
              nodes {
                id
                title
                apiType
              }
            }
          }
        `
      );

      const functionsData = await functionsResponse.json();
      //console.log("Available functions:", JSON.stringify(functionsData, null, 2));

      // Customer tag PRODUCT discount function'ını bul
      // ÖNEMLİ: "customer-tag-product-discount" bir PRODUCT discount'tur, order discount değil!
      let discountFunction = functionsData.data?.shopifyFunctions?.nodes?.find(
        (fn: any) => fn.apiType === "product_discounts" &&
          (fn.title?.toLowerCase().includes("customer tag product") ||
           fn.title?.toLowerCase().includes("customer-tag-product"))
      );

      if (!discountFunction) {
        // Eğer product discount bulunamazsa, order discount'u da dene (eski versiyon için)
        discountFunction = functionsData.data?.shopifyFunctions?.nodes?.find(
          (fn: any) => fn.apiType === "order_discounts" &&
            (fn.title?.toLowerCase().includes("customer tag") || fn.title?.toLowerCase().includes("customer-tag"))
        );

        if (!discountFunction) {
          return {
            success: false,
            message: "Customer Tag Product Discount functie niet gevonden. Implementeer eerst de extensie."
          };
        }

        //console.log("Using order discount function as fallback:", discountFunction);
      }

      //console.log("Found discount function:", discountFunction);

      // Mevcut customer tag discount'u kontrol et ve sil
      const existingDiscountsResponse = await admin.graphql(
        `#graphql
          query {
            discountNodes(first: 100) {
              edges {
                node {
                  id
                  discount {
                    ... on DiscountAutomaticApp {
                      title
                    }
                  }
                }
              }
            }
          }
        `
      );

      const existingDiscountsData = await existingDiscountsResponse.json();
      const existingDiscount = existingDiscountsData.data?.discountNodes?.edges?.find(
        (edge: any) => edge.node.discount?.title?.includes("Customer Tag")
      );

      if (existingDiscount) {
        // Mevcut discount'u sil
        await admin.graphql(
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
          { variables: { id: existingDiscount.node.id } }
        );
      }

      // Yeni discount oluştur
      const createResponse = await admin.graphql(
        `#graphql
          mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
            discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
              automaticAppDiscount {
                discountId
                title
                combinesWith {
                  orderDiscounts
                  productDiscounts
                  shippingDiscounts
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
            automaticAppDiscount: {
              title: discountTitle,
              functionId: discountFunction.id,
              startsAt: "2024-01-01T00:00:00Z",
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: true,
                shippingDiscounts: true,
              },
            },
          },
        }
      );

      const createResult = await createResponse.json();
      //console.log("Discount creation result:", JSON.stringify(createResult, null, 2));

      if (createResult.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
        return {
          success: false,
          message: "Fout: " + createResult.data.discountAutomaticAppCreate.userErrors[0].message,
        };
      }

      if (createResult.data?.discountAutomaticAppCreate?.automaticAppDiscount) {
        return {
          success: true,
          message: `"${discountTitle}" korting succesvol geactiveerd!`
        };
      }

      return { success: false, message: "Korting kon niet worden aangemaakt." };
    }

    if (actionType === "deactivateDiscount") {
      // Mevcut discount'u bul ve sil
      const discountsResponse = await admin.graphql(
        `#graphql
          query {
            discountNodes(first: 100) {
              edges {
                node {
                  id
                  discount {
                    ... on DiscountAutomaticApp {
                      title
                    }
                  }
                }
              }
            }
          }
        `
      );

      const discountsData = await discountsResponse.json();
      const existingDiscount = discountsData.data?.discountNodes?.edges?.find(
        (edge: any) => edge.node.discount?.title?.includes("Customer Tag")
      );

      if (existingDiscount) {
        await admin.graphql(
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
          { variables: { id: existingDiscount.node.id } }
        );

        // Config'i güncelle
        await admin.graphql(
          `#graphql
            mutation CreateMetafield($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id }
                userErrors { field message }
              }
            }
          `,
          {
            variables: {
              metafields: [
                {
                  namespace: "customer_tag_discount",
                  key: "config",
                  type: "json",
                  value: JSON.stringify({ active: false }),
                  ownerId: shopId,
                },
              ],
            },
          }
        );

        return { success: true, message: "Korting gedeactiveerd." };
      }

      return { success: false, message: "Geen actieve korting gevonden." };
    }

    return { success: false, message: "Ongeldige actie." };
  } catch (error: any) {
    //console.error("Action error:", error);
    return { success: false, message: "Fout: " + error.message };
  }
};

export default function CustomerTagDiscounts() {
  const { rules: initialRules, discountActive, discountTitle: initialTitle } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message: string }>();
  const submit = useSubmit();

  const [rules, setRules] = useState<CustomerTagRule[]>(initialRules);
  const [discountTitle, setDiscountTitle] = useState(initialTitle);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomerTagRule | null>(null);
  const [formData, setFormData] = useState({
    customerTag: "",
    discountPercentage: "",
    discountName: "",
  });

  const handleOpenModal = (rule?: CustomerTagRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        customerTag: rule.customerTag,
        discountPercentage: rule.discountPercentage.toString(),
        discountName: rule.discountName,
      });
    } else {
      setEditingRule(null);
      setFormData({
        customerTag: "",
        discountPercentage: "",
        discountName: "",
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingRule(null);
    setFormData({
      customerTag: "",
      discountPercentage: "",
      discountName: "",
    });
  };

  const handleSaveRule = () => {
    const newRule: CustomerTagRule = {
      id: editingRule?.id || `rule-${Date.now()}`,
      customerTag: formData.customerTag.trim(),
      discountPercentage: parseFloat(formData.discountPercentage) || 0,
      discountName: formData.discountName.trim(),
      enabled: true,
      createdAt: editingRule?.createdAt || new Date().toISOString(),
    };

    if (editingRule) {
      setRules(rules.map((r) => (r.id === editingRule.id ? newRule : r)));
    } else {
      setRules([...rules, newRule]);
    }

    handleCloseModal();
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleToggleRule = (id: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleSaveAllRules = () => {
    const form = new FormData();
    form.append("actionType", "saveRules");
    form.append("rules", JSON.stringify(rules));
    form.append("discountTitle", discountTitle);
    submit(form, { method: "post" });
  };

  const handleActivateDiscount = () => {
    const form = new FormData();
    form.append("actionType", "activateDiscount");
    form.append("discountTitle", discountTitle);
    submit(form, { method: "post" });
  };

  const handleDeactivateDiscount = () => {
    const form = new FormData();
    form.append("actionType", "deactivateDiscount");
    submit(form, { method: "post" });
  };

  const tableRows = rules.map((rule) => [
    <Badge tone={rule.enabled ? "success" : "critical"}>
      {rule.enabled ? "Actief" : "Inactief"}
    </Badge>,
    <Text as="span" fontWeight="bold">{rule.customerTag}</Text>,
    `${rule.discountPercentage}%`,
    rule.discountName,
    <InlineStack gap="200">
      <Button
        icon={EditIcon}
        onClick={() => handleOpenModal(rule)}
        accessibilityLabel="Bewerken"
        size="slim"
      />
      <Button
        icon={DeleteIcon}
        onClick={() => handleDeleteRule(rule.id)}
        accessibilityLabel="Verwijderen"
        tone="critical"
        size="slim"
      />
      <Button
        onClick={() => handleToggleRule(rule.id)}
        size="slim"
      >
        {rule.enabled ? "Deactiveren" : "Activeren"}
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Klant Tag Kortingsbeheer"
      subtitle="Definieer automatische kortingen op basis van klant tags"
      primaryAction={{
        content: "Nieuwe Regel Toevoegen",
        icon: PlusIcon,
        onAction: () => handleOpenModal(),
      }}
    >
      <Layout>
        {actionData && (
          <Layout.Section>
            <Banner tone={actionData.success ? "success" : "critical"}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            <BlockStack gap="200">
              <Text as="p" fontWeight="bold">Hoe Werkt Het?</Text>
              <Text as="p">
                1. Bepaal klant tag en kortingspercentage (bijv. disc-10 → 10% korting)
              </Text>
              <Text as="p">
                2. Alle regels worden beheerd onder één Shopify Korting
              </Text>
              <Text as="p">
                3. Klant krijgt automatisch korting bij afrekenen op basis van tag
              </Text>
              <Text as="p">
                4. Korting wordt toegepast op alle producten en kan gecombineerd worden met andere kortingen
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Kortingsinstellingen</Text>

              <TextField
                label="Kortingsnaam (Zichtbaar bij afrekenen)"
                value={discountTitle}
                onChange={setDiscountTitle}
                autoComplete="off"
                helpText="Alle klanten zien deze kortingsnaam (bijv. KortingABC)"
              />

              <InlineStack gap="300">
                <Badge tone={discountActive ? "success" : "critical"}>
                  {discountActive ? "Korting Actief" : "Korting Inactief"}
                </Badge>
              </InlineStack>

              <InlineStack gap="300">
                <Button onClick={handleActivateDiscount} variant="primary">
                  Korting Activeren
                </Button>
                <Button onClick={handleDeactivateDiscount} tone="critical">
                  Korting Deactiveren
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Kortingsregels</Text>
                <Button onClick={() => handleOpenModal()} icon={PlusIcon}>
                  Nieuwe Regel Toevoegen
                </Button>
              </InlineStack>

              {rules.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Status", "Klant Tag", "Kortingspercentage", "Beschrijving", "Acties"]}
                  rows={tableRows}
                />
              ) : (
                <Box padding="400" background="bg-surface-secondary">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" tone="subdued">
                      Er zijn nog geen kortingsregels gedefinieerd.
                    </Text>
                    <Button onClick={() => handleOpenModal()}>Eerste Regel Toevoegen</Button>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Button variant="primary" size="large" onClick={handleSaveAllRules}>
                Alle Regels Opslaan
              </Button>
              <Text as="p" tone="subdued">
                Wanneer u opslaat, worden regels permanent opgeslagen en automatisch toegepast bij het afrekenen.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Voorbeeldscenario</Text>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p"><strong>Regel 1:</strong> disc-10 tag → 10% korting</Text>
                  <Text as="p"><strong>Regel 2:</strong> disc-20 tag → 20% korting</Text>
                  <Text as="p" tone="subdued">
                    Beide klantgroepen zien "{discountTitle}" bij het afrekenen, maar de kortingspercentages worden verschillend toegepast.
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title={editingRule ? "Regel Bewerken" : "Nieuwe Regel Toevoegen"}
        primaryAction={{
          content: "Opslaan",
          onAction: handleSaveRule,
          disabled: !formData.customerTag || !formData.discountPercentage,
        }}
        secondaryActions={[
          {
            content: "Annuleren",
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Klant Tag"
              value={formData.customerTag}
              onChange={(value) => setFormData({ ...formData, customerTag: value })}
              autoComplete="off"
              helpText="Tag toegewezen aan klant (bijv. disc-10, vip, wholesale)"
              placeholder="disc-10"
            />
            <TextField
              label="Kortingspercentage (%)"
              type="number"
              value={formData.discountPercentage}
              onChange={(value) => setFormData({ ...formData, discountPercentage: value })}
              autoComplete="off"
              helpText="Toe te passen kortingspercentage"
              placeholder="10"
              min={0}
              max={100}
            />
            <TextField
              label="Kortingsbeschrijving"
              value={formData.discountName}
              onChange={(value) => setFormData({ ...formData, discountName: value })}
              autoComplete="off"
              helpText="Beschrijving van deze regel (alleen zichtbaar in admin paneel)"
              placeholder="VIP Klantkorting"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
