import '@shopify/ui-extensions';

//@ts-ignore
declare module './Checkout.jsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}
