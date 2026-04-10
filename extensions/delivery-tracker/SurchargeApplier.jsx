import { extension } from '@shopify/ui-extensions/checkout';

const SURCHARGE_VARIANT_ID = 'gid://shopify/ProductVariant/61571547791690';

export default extension(
  'purchase.checkout.actions.render-before',
  async (_root, { lines, applyCartLinesChange }) => {
    let isProcessing = false;

    const syncSurcharge = async (currentLines) => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        const existing = currentLines.find(
          (l) => l.merchandise.id === SURCHARGE_VARIANT_ID
        );

        // Surcharge dışındaki ürünlerin toplam tutarı
        const cartTotal = currentLines.reduce((sum, line) => {
          if (line.merchandise.id === SURCHARGE_VARIANT_ID) return sum;
          return sum + parseFloat(line.cost?.totalAmount?.amount || '0');
        }, 0);

        if (cartTotal <= 0) {
          // Sepet boşsa surcharge'ı kaldır
          if (existing) {
            await applyCartLinesChange({
              type: 'removeCartLine',
              id: existing.id,
              quantity: existing.quantity,
            });
          }
          return;
        }

        // Surcharge yoksa ekle (Cart Transform fiyatı override edecek)
        if (!existing) {
          await applyCartLinesChange({
            type: 'addCartLine',
            merchandiseId: SURCHARGE_VARIANT_ID,
            quantity: 1,
          });
        }
      } catch (err) {
        console.error('[SurchargeApplier] error:', err?.message || err);
      } finally {
        isProcessing = false;
      }
    };

    lines.subscribe((currentLines) => {
      syncSurcharge(currentLines);
    });

    syncSurcharge(lines.current);
  }
);
