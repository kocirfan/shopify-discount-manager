import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);

  try {
    const body = await request.json();
    const { cartId, discountPercentage = 2 } = body;

    if (!cartId) {
      return Response.json({ success: false, error: "Cart ID is required" }, { status: 400 });
    }

    // Unique discount code oluştur
    const discountCode = `PICKUP${discountPercentage}`;
    const timestamp = Date.now();
    const uniqueCode = `${discountCode}-${timestamp.toString().slice(-6)}`;

    // Mevcut discount code'u kontrol et
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
          code: discountCode
        }
      }
    );

    const checkResult: any = await checkResponse.json();

    // Eğer discount code yoksa oluştur
    if (!checkResult.data?.codeDiscountNodeByCode?.id) {
      const createResponse = await admin.graphql(
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
              title: `Pickup Discount ${discountPercentage}%`,
              code: discountCode,
              startsAt: new Date().toISOString(),
              customerSelection: {
                all: true
              },
              customerGets: {
                value: {
                  percentage: discountPercentage / 100
                },
                items: {
                  all: true
                }
              },
              appliesOncePerCustomer: false,
              usageLimit: null
            }
          }
        }
      );

      const createResult: any = await createResponse.json();

      if (createResult.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
        //console.error("Discount creation errors:", createResult.data.discountCodeBasicCreate.userErrors);
      }
    }

    // Discount code'u cart'a uygula
    const applyResponse = await admin.graphql(
      `#graphql
        mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
          cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
            cart {
              id
              discountCodes {
                code
                applicable
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
          cartId: cartId,
          discountCodes: [discountCode]
        }
      }
    );

    const applyResult: any = await applyResponse.json();

    if (applyResult.data?.cartDiscountCodesUpdate?.userErrors?.length > 0) {
      return Response.json({
        success: false,
        error: applyResult.data.cartDiscountCodesUpdate.userErrors[0].message
      }, { status: 400 });
    }

    return Response.json({
      success: true,
      discountCode: discountCode,
      cart: applyResult.data?.cartDiscountCodesUpdate?.cart
    });

  } catch (error: any) {
    //console.error("Error applying pickup discount:", error);
    return Response.json({
      success: false,
      error: error?.message || String(error)
    }, { status: 500 });
  }
};
