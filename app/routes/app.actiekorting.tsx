import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useState } from "react";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
  Badge,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// ============================================================
// ACTIEKORTING (kampanya indirimi)
// Shop metafield checkout_promo.active (boolean). customer-tag-product-discount
// fonksiyonu bunu okur: true iken herkese (guest dahil) ek %5, bayi indirimiyle
// sıralı birleşir. nodiscount tag'li / muaf ürünler hariç.
// ============================================================

const PROMO_PERCENTAGE = 5;

// Yapıştırılan metni SKU listesine çevirir: satır / virgül / noktalı virgül / tab ayırıcı,
// boşluklar kırpılır, büyük harfe çevrilir, tekrarlar atılır.
function parseSkuText(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n\r,;\t]+/)) {
    const sku = part.trim().toUpperCase();
    if (sku) seen.add(sku);
  }
  return Array.from(seen);
}

async function getShopId(admin: any): Promise<string> {
  const res = await admin.graphql(`#graphql
    query {
      shop {
        id
      }
    }
  `);
  const data = await res.json();
  return data.data.shop.id;
}

async function setShopMetafield(admin: any, key: string, type: string, value: string) {
  const shopId = await getShopId(admin);
  const res = await admin.graphql(
    `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        metafields: [{ namespace: "checkout_promo", key, type, value, ownerId: shopId }],
      },
    }
  );
  const result = await res.json();
  return result.data?.metafieldsSet?.userErrors || [];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let isActive = false;
  let excludedSkus: string[] = [];
  try {
    const res = await admin.graphql(`#graphql
      query {
        shop {
          checkoutPromoActive: metafield(namespace: "checkout_promo", key: "active") {
            value
          }
          promoExcludedSkus: metafield(namespace: "checkout_promo", key: "excluded_skus") {
            value
          }
        }
      }
    `);
    const data = await res.json();
    isActive = data.data?.shop?.checkoutPromoActive?.value === "true";
    const rawSkus = data.data?.shop?.promoExcludedSkus?.value;
    if (rawSkus) {
      try {
        const parsed = JSON.parse(rawSkus);
        if (Array.isArray(parsed)) excludedSkus = parsed.filter((v) => typeof v === "string");
      } catch {
        // bozuksa boş göster
      }
    }
  } catch {
    // okunamazsa kapalı göster
  }

  return { isActive, excludedSkus };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ---- MEGA DEAL SKU LİSTESİNİ KAYDET ----
  if (intent === "save_skus") {
    const skus = parseSkuText((formData.get("skus") as string) || "");
    try {
      const errors = await setShopMetafield(admin, "excluded_skus", "json", JSON.stringify(skus));
      if (errors.length > 0) {
        return { success: false, message: "Fout: " + errors[0].message, intent };
      }
      return { success: true, message: `${skus.length} SKU's opgeslagen.`, intent };
    } catch (error: any) {
      return { success: false, message: "Fout: " + (error?.message || String(error)), intent };
    }
  }

  if (intent !== "activate" && intent !== "deactivate") {
    return { success: false, message: "Onbekende actie.", intent: "" };
  }

  const active = intent === "activate";

  try {
    const errors = await setShopMetafield(admin, "active", "boolean", active ? "true" : "false");
    if (errors.length > 0) {
      return { success: false, message: "Fout: " + errors[0].message, intent };
    }

    return {
      success: true,
      message: active
        ? `Actiekorting van ${PROMO_PERCENTAGE}% is geactiveerd.`
        : "Actiekorting is uitgeschakeld.",
      intent,
    };
  } catch (error: any) {
    return { success: false, message: "Fout: " + (error?.message || String(error)), intent };
  }
};

export default function ActiekortingPage() {
  const { isActive, excludedSkus } = useLoaderData<typeof loader>();
  const [skuText, setSkuText] = useState(excludedSkus.join("\n"));
  const parsedCount = parseSkuText(skuText).length;
  const actionData = useActionData<{ success: boolean; message: string; intent: string }>();
  const submit = useSubmit();

  const currentlyActive =
    actionData?.intent === "activate" && actionData?.success
      ? true
      : actionData?.intent === "deactivate" && actionData?.success
      ? false
      : isActive;

  const handleToggle = () => {
    const formData = new FormData();
    formData.append("intent", currentlyActive ? "deactivate" : "activate");
    submit(formData, { method: "post" });
  };

  const handleSaveSkus = () => {
    const formData = new FormData();
    formData.append("intent", "save_skus");
    formData.append("skus", skuText);
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Actiekorting"
      subtitle={`Extra ${PROMO_PERCENTAGE}% korting voor alle klanten tijdens een actieperiode`}
      backAction={{ content: "Home", url: "/app" }}
    >
      <Layout>
        {actionData?.message && (
          <Layout.Section>
            <Banner tone={actionData.success ? "success" : "critical"}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Extra {PROMO_PERCENTAGE}% actiekorting
                </Text>
                <Badge tone={currentlyActive ? "success" : undefined}>
                  {currentlyActive ? "Actief" : "Uit"}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {currentlyActive
                  ? `Alle klanten krijgen automatisch ${PROMO_PERCENTAGE}% extra korting in de winkelwagen.`
                  : "De actiekorting is uitgeschakeld. Klanten krijgen alleen hun normale dealerkorting."}
              </Text>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  tone={currentlyActive ? "critical" : undefined}
                  onClick={handleToggle}
                >
                  {currentlyActive ? "Actiekorting uitschakelen" : "Actiekorting activeren"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Mega Deals (uitgesloten SKU's)
                </Text>
                <Badge>{`${excludedSkus.length} opgeslagen`}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Zolang de actiekorting actief is, krijgen deze SKU's géén korting:
                geen actiekorting en ook geen dealerkorting (alsof ze de tag
                nodiscount hebben). Als de actie uit staat, wordt deze lijst
                genegeerd.
              </Text>
              <TextField
                label="SKU's (één per regel, of gescheiden door komma's)"
                value={skuText}
                onChange={setSkuText}
                multiline={8}
                autoComplete="off"
                helpText={`${parsedCount} unieke SKU's herkend. Kopieer de kolom 'Sku' uit Excel en plak hier.`}
              />
              <InlineStack gap="300">
                <Button onClick={handleSaveSkus}>SKU-lijst opslaan</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Hoe werkt het?
              </Text>
              <Text as="p">
                • Gasten (niet ingelogd): {PROMO_PERCENTAGE}% korting.
              </Text>
              <Text as="p">
                • Ingelogde dealers: de actiekorting komt bovenop de dealerkorting
                (bijv. 25% dealerkorting + {PROMO_PERCENTAGE}% = 28,75% totaal).
              </Text>
              <Text as="p">
                • Producten met de tag <strong>nodiscount</strong>, de Mega Deal
                SKU's hierboven en uitgesloten producten krijgen geen korting.
              </Text>
              <Text as="p">• De ordertoeslag zelf krijgt nooit korting.</Text>
              <Text as="p" tone="subdued">
                Vereist: de automatische korting "Klant Tag Kortingen" moet actief
                zijn in Shopify (Kortingen).
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
