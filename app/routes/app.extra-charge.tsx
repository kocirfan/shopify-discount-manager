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
  Banner,
  TextField,
  Checkbox,
  InlineStack,
  Badge,
  Divider,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

interface SurchargeSettings {
  enabled: boolean;
  percentage: number;
  label: string;
}

interface LoaderData {
  settings: SurchargeSettings;
  isCartTransformActive: boolean;
  cartTransformId: string | null;
}

const DEFAULT_SETTINGS: SurchargeSettings = {
  enabled: false,
  percentage: 7,
  label: "Service toeslag",
};

// ============================================================
// LOADER - Mevcut ayarları ve Cart Transform durumunu yükle
// ============================================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let settings: SurchargeSettings = { ...DEFAULT_SETTINGS };
  let isCartTransformActive = false;
  let cartTransformId: string | null = null;

  try {
    // Ayarları oku
    const settingsResponse = await admin.graphql(
      `#graphql
        query {
          shop {
            surchargeSettings: metafield(
              namespace: "extra_surcharge"
              key: "settings"
            ) {
              value
            }
          }
        }
      `
    );
    const settingsData = await settingsResponse.json();
    const savedValue = settingsData.data?.shop?.surchargeSettings?.value;
    if (savedValue) {
      try {
        settings = JSON.parse(savedValue);
      } catch {
        // Parse hatası olursa default kullan
      }
    }
  } catch (error) {
    // Hata olursa default değerlerle devam et
  }

  try {
    // Aktif Cart Transform'ları kontrol et
    const transformsResponse = await admin.graphql(
      `#graphql
        query {
          cartTransforms(first: 20) {
            nodes {
              id
              functionId
            }
          }
        }
      `
    );
    const transformsData = await transformsResponse.json();
    const transforms = transformsData.data?.cartTransforms?.nodes || [];

    // functionId formatı: "gid://shopify/ShopifyFunction/<uid>" veya
    // sadece uid string'i olabilir. Handle veya uid ile eşleştir.
    const surchargeUid = "2009ae03-b390-9bf4-fedb-ae9dbd6cde8b3a9ade62";
    const surchargeExtensionId = "019d7615-26a2-7230-8bcb-b98f1828826b";

    for (const t of transforms) {
      const fid = t.functionId || "";
      if (
        fid.includes("extra-surcharge") ||
        fid.includes(surchargeUid) ||
        fid.includes(surchargeExtensionId)
      ) {
        isCartTransformActive = true;
        cartTransformId = t.id;
        break;
      }
    }
  } catch (error) {
    // Hata olursa inactive kabul et
  }

  return { settings, isCartTransformActive, cartTransformId };
};

// ============================================================
// ACTION - Ayarları kaydet ve/veya Cart Transform yönet
// ============================================================
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ---- CART TRANSFORM AKTİFLEŞTİR ----
  if (intent === "activate") {
    try {
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
        { variables: { functionHandle: "extra-surcharge" } }
      );

      const result = await response.json();

      // GraphQL seviye hataları (schema/syntax hataları)
      if (result.errors && result.errors.length > 0) {
        return {
          success: false,
          message: "GraphQL fout: " + result.errors.map((e: any) => e.message).join(", "),
          intent,
        };
      }

      const errors = result.data?.cartTransformCreate?.userErrors;
      if (errors && errors.length > 0) {
        const msg = errors[0].message || "";
        // Al zaten kayıtlıysa başarı say
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("already registered")) {
          return { success: true, message: "Cart Transform is al actief!", intent };
        }
        return { success: false, message: "Fout: " + msg, intent };
      }

      if (result.data?.cartTransformCreate?.cartTransform) {
        return { success: true, message: "Extra toeslag geactiveerd! Sla nu de instellingen op.", intent };
      }

      return {
        success: false,
        message: "Activering mislukt. Controleer of de app is gedeployed (shopify app deploy).",
        intent,
      };
    } catch (error: any) {
      return { success: false, message: "Uitzondering: " + (error?.message || String(error)), intent };
    }
  }

  // ---- CART TRANSFORM DEVRE DIŞI ----
  if (intent === "deactivate") {
    const transformId = formData.get("transformId") as string;
    if (!transformId) {
      return { success: false, message: "Transform ID bulunamadı.", intent };
    }

    try {
      const response = await admin.graphql(
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
        { variables: { id: transformId } }
      );

      const result = await response.json();
      const errors = result.data?.cartTransformDelete?.userErrors;

      if (errors && errors.length > 0) {
        return { success: false, message: "Fout: " + errors[0].message, intent };
      }

      return { success: true, message: "Extra toeslag gedeactiveerd.", intent };
    } catch (error: any) {
      return { success: false, message: "Fout: " + error.message, intent };
    }
  }

  // ---- AYARLARI KAYDET ----
  if (intent === "save") {
    const enabled = formData.get("enabled") === "true";
    const percentage = parseFloat(formData.get("percentage") as string) || 0;
    const label = (formData.get("label") as string) || DEFAULT_SETTINGS.label;

    const settings: SurchargeSettings = { enabled, percentage, label };

    try {
      // Shop ID'yi al
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

      // Metafield'a kaydet
      const response = await admin.graphql(
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
            metafields: [
              {
                namespace: "extra_surcharge",
                key: "settings",
                type: "json",
                value: JSON.stringify(settings),
                ownerId: shopId,
              },
            ],
          },
        }
      );

      const result = await response.json();
      const errors = result.data?.metafieldsSet?.userErrors;

      if (errors && errors.length > 0) {
        return { success: false, message: "Fout: " + errors[0].message, intent };
      }

      return { success: true, message: "Instellingen opgeslagen!", intent };
    } catch (error: any) {
      return { success: false, message: "Fout: " + error.message, intent };
    }
  }

  return { success: false, message: "Onbekende actie.", intent: "" };
};

// ============================================================
// UI
// ============================================================
export default function ExtraChargePage() {
  const { settings, isCartTransformActive, cartTransformId } =
    useLoaderData<LoaderData>();
  const actionData = useActionData<{
    success: boolean;
    message: string;
    intent: string;
  }>();
  const submit = useSubmit();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [percentage, setPercentage] = useState(settings.percentage.toString());
  const [label, setLabel] = useState(settings.label);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("enabled", enabled.toString());
    formData.append("percentage", percentage);
    formData.append("label", label);
    submit(formData, { method: "post" });
  };

  const handleActivate = () => {
    const formData = new FormData();
    formData.append("intent", "activate");
    submit(formData, { method: "post" });
  };

  const handleDeactivate = () => {
    const formData = new FormData();
    formData.append("intent", "deactivate");
    formData.append("transformId", cartTransformId || "");
    submit(formData, { method: "post" });
  };

  // Aktif durumu: actionData'dan son state'i al (sayfa yenilemeden önce)
  const currentlyActive =
    actionData?.intent === "activate" && actionData?.success
      ? true
      : actionData?.intent === "deactivate" && actionData?.success
      ? false
      : isCartTransformActive;

  const currentTransformId =
    actionData?.intent === "deactivate" && actionData?.success
      ? null
      : cartTransformId;

  return (
    <Page
      title="Extra Toeslag Beheer"
      subtitle="Voeg een procentuele toeslag toe aan het winkelwagentotaal"
      backAction={{ content: "Instellingen", url: "/app" }}
    >
      <Layout>
        {/* Feedback banner */}
        {actionData?.message && (
          <Layout.Section>
            <Banner tone={actionData.success ? "success" : "critical"}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Durum kartı */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Cart Transform Durumu
                </Text>
                <Badge tone={currentlyActive ? "success" : "enabled"}>
                  {currentlyActive ? "Actief" : "Inactief"}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                De Cart Transform functie moet actief zijn voordat de toeslag
                wordt toegepast in de winkelwagen. Activeer hieronder eenmalig.
                Zorg ervoor dat de app eerst is gedeployed via{" "}
                <strong>shopify app deploy</strong>.
              </Text>
              <InlineStack gap="300">
                {!currentlyActive ? (
                  <Button variant="primary" onClick={handleActivate}>
                    Activeren
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    tone="critical"
                    onClick={handleDeactivate}
                    disabled={!currentTransformId}
                  >
                    Deactiveren
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Ayarlar kartı */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Toeslag Instellingen
              </Text>

              <Checkbox
                label="Extra toeslag inschakelen"
                helpText="Wanneer uitgeschakeld, wordt er geen toeslag toegevoegd, ook al is de Cart Transform actief."
                checked={enabled}
                onChange={setEnabled}
              />

              <Divider />

              <TextField
                label="Toeslagpercentage (%)"
                type="number"
                value={percentage}
                onChange={setPercentage}
                autoComplete="off"
                helpText="Voer het percentage in dat op het winkelwagentotaal wordt toegevoegd. Bijv: 7 voor 7%."
                min="0"
                max="100"
                suffix="%"
              />

              <TextField
                label="Omschrijving toeslag"
                value={label}
                onChange={setLabel}
                autoComplete="off"
                helpText="Deze tekst is zichtbaar voor de klant in de winkelwagen naast de toeslagprijs."
              />

              <Box paddingBlockStart="200">
                <Text as="p" tone="subdued">
                  Voorbeeld: Bij een winkelwagen van €100 en {percentage || "0"}%
                  toeslag betaalt de klant €
                  {(100 * (1 + (parseFloat(percentage) || 0) / 100)).toFixed(2)}.
                </Text>
              </Box>

              <Button variant="primary" onClick={handleSave}>
                Instellingen Opslaan
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Bilgi kartı */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Hoe werkt het?
              </Text>
              <BlockStack gap="200">
                <Text as="p">
                  1. Klik op <strong>Activeren</strong> om de Cart Transform
                  functie eenmalig te registreren bij Shopify.
                </Text>
                <Text as="p">
                  2. Stel het gewenste toeslagpercentage in en schakel de
                  toeslag in via het selectievakje.
                </Text>
                <Text as="p">
                  3. Klik op <strong>Instellingen Opslaan</strong>.
                </Text>
                <Text as="p">
                  4. De toeslag wordt automatisch toegepast op alle orders —
                  het percentage wordt opgeteld bij de prijs van elk artikel.
                </Text>
                <Text as="p" tone="subdued">
                  Let op: deze toeslag werkt onafhankelijk van de
                  bezorgkortingen en de klanttagkortingen. De bestaande
                  functies worden niet beinvloed.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
