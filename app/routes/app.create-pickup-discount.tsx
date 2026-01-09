import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("=== CREATING PICKUP20 DISCOUNT CODE ===");

  try {
    // Create automatic discount code for pickup
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
                    nodes {
                      code
                    }
                  }
                  startsAt
                  endsAt
                  customerSelection {
                    ... on DiscountCustomerAll {
                      allCustomers
                    }
                  }
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                  appliesOncePerCustomer
                  usageLimit
                  combinesWith {
                    orderDiscounts
                    productDiscounts
                    shippingDiscounts
                  }
                }
              }
            }
            userErrors {
              field
              code
              message
            }
          }
        }
      `,
      {
        variables: {
          basicCodeDiscount: {
            title: "Pickup 20% Discount",
            code: "PICKUP20",
            startsAt: new Date().toISOString(),
            customerSelection: {
              all: true
            },
            customerGets: {
              value: {
                percentage: 0.2 // 20%
              },
              items: {
                all: true
              }
            },
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: true
            }
          }
        }
      }
    );

    const result = await response.json();
    console.log("Discount creation result:", JSON.stringify(result, null, 2));

    if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const errors = result.data.discountCodeBasicCreate.userErrors;
      console.error("User errors:", errors);

      // Check if discount already exists
      if (errors.some((e: any) => e.code === "TAKEN")) {
        return {
          success: true,
          message: "PICKUP20 kodu zaten mevcut! Artık kullanılabilir.",
          alreadyExists: true
        };
      }

      return {
        success: false,
        message: "Hata: " + errors.map((e: any) => e.message).join(", ")
      };
    }

    if (result.data?.discountCodeBasicCreate?.codeDiscountNode) {
      console.log("✅ Discount code created successfully!");
      return {
        success: true,
        message: "✅ PICKUP20 indirim kodu başarıyla oluşturuldu! Artık checkout'ta kullanılabilir.",
        discount: result.data.discountCodeBasicCreate.codeDiscountNode
      };
    }

    return {
      success: false,
      message: "Beklenmeyen hata: İndirim kodu oluşturulamadı"
    };
  } catch (error: any) {
    console.error("Error creating discount:", error);
    return {
      success: false,
      message: "Hata: " + error.message
    };
  }
};
