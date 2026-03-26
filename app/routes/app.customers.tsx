import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
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
  Spinner,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
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

  return {
    customers,
    pageInfo,
    totalCount: customers.length,
    query,
    after,
    before,
  } as LoaderData;
};

export default function Customers() {
  const { customers, pageInfo, query: initialQuery } = useLoaderData<LoaderData>();
  const navigate = useNavigate();

  const [searchValue, setSearchValue] = useState(initialQuery);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

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

  const tableRows = customers.map((customer) => {
    const fullName =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "-";
    return [
      fullName,
      customer.email || "-",
      customer.exactDiscountCode ? (
        <Badge tone="success">{customer.exactDiscountCode}</Badge>
      ) : (
        <Text as="span" tone="subdued">-</Text>
      ),
    ];
  });

  return (
    <Page
      title="Müşteriler"
      subtitle="Tüm müşterileri, e-postalarını ve indirim kodlarını görüntüleyin"
    >
      <Layout>
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
                  <EmptyState
                    heading="Müşteri bulunamadı"
                    image=""
                  >
                    <p>Arama kriterlerinizi değiştirmeyi deneyin.</p>
                  </EmptyState>
                </Box>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Ad Soyad", "E-posta", "Exact İndirim Kodu"]}
                    rows={tableRows}
                    hoverable
                  />

                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={handlePreviousPage}
                      hasNext={pageInfo.hasNextPage}
                      onNext={handleNextPage}
                    />
                  </InlineStack>

                  <Text as="p" tone="subdued" alignment="center">
                    Bu sayfada {customers.length} müşteri gösteriliyor
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
