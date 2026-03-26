import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  DataTable,
  Pagination,
  InlineStack,
  Badge,
  Box,
  EmptyState,
  Modal,
  FormLayout,
  Banner,
  Button,
} from "@shopify/polaris";
import { SearchIcon, EditIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

const PAGE_SIZE = 20;

interface Customer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  exactDiscountCode: string | null;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface LoaderData {
  customers: Customer[];
  pageInfo: PageInfo;
  totalCount: number;
  query: string;
  after: string | null;
  before: string | null;
}

function parseDiscountRate(code: string | null): string {
  if (!code) return "-";
  // "korting-20.1" → "20.1"
  const match = code.match(/korting-(.+)/i);
  return match ? match[1] : "-";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const after = url.searchParams.get("after") || null;
  const before = url.searchParams.get("before") || null;

  const gqlQuery = `#graphql
    query GetCustomers(
      $first: Int
      $last: Int
      $after: String
      $before: String
      $query: String
    ) {
      customers(
        first: $first
        last: $last
        after: $after
        before: $before
        query: $query
      ) {
        edges {
          node {
            id
            firstName
            lastName
            email
            exactDiscountCode: metafield(namespace: "custom", key: "exact_discount_code") {
              value
            }
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
      customersCount(query: $query) {
        count
      }
    }
  `;

  let variables: Record<string, unknown> = { query: query || undefined };

  if (before) {
    variables = { ...variables, last: PAGE_SIZE, before };
  } else {
    variables = { ...variables, first: PAGE_SIZE, after: after || undefined };
  }

  const response = await admin.graphql(gqlQuery, { variables });
  const data = await response.json();

  const edges = data.data?.customers?.edges ?? [];
  const pageInfo: PageInfo = data.data?.customers?.pageInfo ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  };

  const customers: Customer[] = edges.map((edge: any) => ({
    id: edge.node.id,
    firstName: edge.node.firstName ?? null,
    lastName: edge.node.lastName ?? null,
    email: edge.node.email ?? null,
    exactDiscountCode: edge.node.exactDiscountCode?.value ?? null,
  }));

  const totalCount: number = data.data?.customersCount?.count ?? customers.length;

  return {
    customers,
    pageInfo,
    totalCount,
    query,
    after,
    before,
  } as LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const customerId = formData.get("customerId") as string;
  const newRate = formData.get("newRate") as string;

  // "korting-" prefix'i ile yeni kod oluştur
  const newCode = `korting-${newRate.trim()}`;

  // Önce mevcut metafield ID'sini al
  const getResponse = await admin.graphql(
    `#graphql
      query GetCustomerMetafield($id: ID!) {
        customer(id: $id) {
          metafield(namespace: "custom", key: "exact_discount_code") {
            id
          }
        }
      }
    `,
    { variables: { id: customerId } }
  );
  const getData = await getResponse.json();
  const metafieldId = getData.data?.customer?.metafield?.id ?? null;

  // Metafield'ı güncelle veya oluştur
  const mutation = metafieldId
    ? `#graphql
        mutation UpdateMetafield($id: ID!, $value: String!) {
          metafieldUpdate(input: { id: $id, value: $value }) {
            metafield { id value }
            userErrors { field message }
          }
        }
      `
    : `#graphql
        mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id value }
            userErrors { field message }
          }
        }
      `;

  const variables = metafieldId
    ? { id: metafieldId, value: newCode }
    : {
        metafields: [
          {
            ownerId: customerId,
            namespace: "custom",
            key: "exact_discount_code",
            type: "single_line_text_field",
            value: newCode,
          },
        ],
      };

  const mutResponse = await admin.graphql(mutation, { variables });
  const mutData = await mutResponse.json();

  const errors =
    mutData.data?.metafieldUpdate?.userErrors ||
    mutData.data?.metafieldsSet?.userErrors ||
    [];

  if (errors.length > 0) {
    return { success: false, message: errors[0].message };
  }

  return { success: true, message: `İndirim oranı "${newCode}" olarak güncellendi.` };
};

export default function Customers() {
  const { customers, pageInfo, totalCount, query: initialQuery } =
    useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message: string }>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const [searchValue, setSearchValue] = useState(initialQuery);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [rateInput, setRateInput] = useState("");

  const buildUrl = useCallback(
    (params: { query?: string; after?: string | null; before?: string | null }) => {
      const url = new URLSearchParams();
      if (params.query) url.set("query", params.query);
      if (params.after) url.set("after", params.after);
      if (params.before) url.set("before", params.before);
      return `/app/customers?${url.toString()}`;
    },
    []
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (searchTimeout) clearTimeout(searchTimeout);
      const t = setTimeout(() => {
        navigate(buildUrl({ query: value }));
      }, 400);
      setSearchTimeout(t);
    },
    [searchTimeout, navigate, buildUrl]
  );

  const handleNextPage = useCallback(() => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      navigate(buildUrl({ query: searchValue, after: pageInfo.endCursor }));
    }
  }, [pageInfo, searchValue, navigate, buildUrl]);

  const handlePreviousPage = useCallback(() => {
    if (pageInfo.hasPreviousPage && pageInfo.startCursor) {
      navigate(buildUrl({ query: searchValue, before: pageInfo.startCursor }));
    }
  }, [pageInfo, searchValue, navigate, buildUrl]);

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setRateInput(parseDiscountRate(customer.exactDiscountCode));
  };

  const handleCloseEdit = () => {
    setEditingCustomer(null);
    setRateInput("");
  };

  const handleSaveRate = () => {
    if (!editingCustomer || !rateInput.trim()) return;
    const form = new FormData();
    form.append("customerId", editingCustomer.id);
    form.append("newRate", rateInput.trim());
    submit(form, { method: "post" });
    handleCloseEdit();
  };

  const tableRows = customers.map((customer) => {
    const fullName =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "-";
    const rate = parseDiscountRate(customer.exactDiscountCode);

    return [
      fullName,
      customer.email || "-",
      customer.exactDiscountCode ? (
        <Badge tone="success">{customer.exactDiscountCode}</Badge>
      ) : (
        <Text as="span" tone="subdued">-</Text>
      ),
      rate !== "-" ? (
        <Badge tone="info">{`%${rate}`}</Badge>
      ) : (
        <Text as="span" tone="subdued">-</Text>
      ),
      <Button
        icon={EditIcon}
        size="slim"
        accessibilityLabel="Düzenle"
        onClick={() => handleOpenEdit(customer)}
      />,
    ];
  });

  return (
    <Page
      title="Müşteriler"
      subtitle={`Toplam ${totalCount} müşteri`}
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
          <Card>
            <BlockStack gap="400">
              <TextField
                label=""
                labelHidden
                value={searchValue}
                onChange={handleSearchChange}
                placeholder="Ad, soyad veya e-posta ile ara..."
                prefix={<SearchIcon />}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => handleSearchChange("")}
              />

              {customers.length === 0 ? (
                <Box padding="400">
                  <EmptyState heading="Müşteri bulunamadı" image="">
                    <p>Arama kriterlerinizi değiştirmeyi deneyin.</p>
                  </EmptyState>
                </Box>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Ad Soyad", "E-posta", "Exact İndirim Kodu", "İndirim Oranı", "İşlem"]}
                    rows={tableRows}
                    hoverable
                  />

                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" tone="subdued">
                      Bu sayfada {customers.length} / toplam {totalCount} müşteri
                    </Text>
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={handlePreviousPage}
                      hasNext={pageInfo.hasNextPage}
                      onNext={handleNextPage}
                    />
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={editingCustomer !== null}
        onClose={handleCloseEdit}
        title={
          editingCustomer
            ? `İndirim Oranı Düzenle — ${[editingCustomer.firstName, editingCustomer.lastName].filter(Boolean).join(" ") || editingCustomer.email}`
            : ""
        }
        primaryAction={{
          content: "Kaydet",
          onAction: handleSaveRate,
          disabled: !rateInput.trim(),
        }}
        secondaryActions={[{ content: "İptal", onAction: handleCloseEdit }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="İndirim Oranı"
              value={rateInput}
              onChange={setRateInput}
              autoComplete="off"
              helpText='Sadece sayıyı girin (örn. 20.1). Kaydedilecek kod: korting-{oran}'
              placeholder="20.1"
            />
            {rateInput.trim() && (
              <Text as="p" tone="subdued">
                Kaydedilecek değer: <strong>korting-{rateInput.trim()}</strong>
              </Text>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
