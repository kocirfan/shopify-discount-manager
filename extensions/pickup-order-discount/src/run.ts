import type {
  RunInput,
} from "../generated/api";

// Order discount function output type
type FunctionResult = {
  discounts: {
    value: {
      fixedAmount?: {
        amount: string;
      };
      percentage?: {
        value: string;
      };
    };
    message?: string;
    targets?: {
      orderSubtotal?: {
        excludedVariantIds: string[];
      };
    }[];
  }[];
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
};

export function run(input: RunInput): FunctionResult {
  console.error('=== PICKUP ORDER DISCOUNT START ===');

  const cart = input.cart;
  const emptyReturn: FunctionResult = {
    discounts: [],
    discountApplicationStrategy: "FIRST"
  };

  // Check cart attribute first (set by Delivery Tracker UI)
  const selectedDeliveryType = cart.attribute?.value;
  console.error('🏷️ Selected delivery type (from attribute):', selectedDeliveryType);

  // If not pickup, return early
  if (selectedDeliveryType !== 'pickup') {
    console.error('⚠️ Not pickup delivery, no order discount');
    return emptyReturn;
  }

  // Get settings from metafield
  const settingsJson = input.shop?.deliveryDiscountSettings?.value;
  if (!settingsJson) {
    console.error('❌ No settings in metafield');
    return emptyReturn;
  }

  let settings;
  try {
    settings = JSON.parse(settingsJson);
    console.error('✅ Settings loaded:', settings.length, 'methods');
  } catch (e) {
    console.error('❌ Parse error');
    return emptyReturn;
  }

  // Find active pickup method
  const pickupMethod = settings.find((m: any) => m.type === 'pickup' && m.enabled);

  if (!pickupMethod) {
    console.error('❌ No active pickup method found');
    return emptyReturn;
  }

  console.error('✅ MATCHED:', pickupMethod.name, '| Discount:', pickupMethod.discountValue, '%');

  // Calculate discount on cart subtotal
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
  const discountPercent = pickupMethod.discountValue;
  const discountAmount = (subtotal * (discountPercent / 100)).toFixed(2);

  console.error('💰 Subtotal:', subtotal.toFixed(2));
  console.error('💰 Discount:', discountPercent, '% = €', discountAmount);

  // Return order-level discount (applies to entire cart subtotal)
  return {
    discounts: [
      {
        value: {
          fixedAmount: {
            amount: discountAmount,
          },
        },
        message: `${discountPercent}% korting bij afhalen`,
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: []
            }
          }
        ]
      },
    ],
    discountApplicationStrategy: "FIRST"
  };
}
