import { extension } from '@shopify/ui-extensions/checkout';

const SURCHARGE_VARIANT_ID = 'gid://shopify/ProductVariant/61571547791690';
const SETTINGS_NAMESPACE = 'extra_surcharge';
const SETTINGS_KEY = 'settings';

export default extension(
  'purchase.checkout.cart-line-list.render-after',
  async (root, { lines, applyCartLinesChange, shop, query }) => {
    let applied = false;

    const applyIfNeeded = async () => {
      if (applied) return;

      // Metafield'dan surcharge ayarlarını al
      const result = await query(
        `query {
          shop {
            metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${SETTINGS_KEY}") {
              value
            }
          }
        }`
      );

      const settingsJson = result?.data?.shop?.metafield?.value;
      if (!settingsJson) return;

      let settings;
      try {
        settings = JSON.parse(settingsJson);
      } catch {
        return;
      }

      if (!settings.enabled || !settings.percentage || settings.percentage <= 0) return;

      const currentLines = lines.current;

      // Mevcut surcharge line'ı bul
      const surchargeLineIndex = currentLines.findIndex(
        (line) => line.merchandise.id === SURCHARGE_VARIANT_ID
      );

      // Sepet toplamını hesapla (surcharge hariç)
      const cartTotal = currentLines.reduce((sum, line) => {
        if (line.merchandise.id === SURCHARGE_VARIANT_ID) return sum;
        const price = parseFloat(line.cost?.totalAmount?.amount || '0');
        return sum + price;
      }, 0);

      console.log('[surcharge] cartTotal:', cartTotal, 'percentage:', settings.percentage);

      const surchargeAmount = parseFloat((cartTotal * settings.percentage / 100).toFixed(2));

      if (surchargeAmount <= 0) return;

      applied = true;

      if (surchargeLineIndex >= 0) {
        // Zaten var — kaldır ve yeniden ekle (fiyat değişmiş olabilir)
        await applyCartLinesChange({
          type: 'removeCartLine',
          id: currentLines[surchargeLineIndex].id,
          quantity: currentLines[surchargeLineIndex].quantity,
        });
      }

      await applyCartLinesChange({
        type: 'addCartLine',
        merchandiseId: SURCHARGE_VARIANT_ID,
        quantity: 1,
        attributes: [
          { key: '_surcharge_amount', value: String(surchargeAmount) },
        ],
      });

      console.log('[surcharge] Added surcharge line:', surchargeAmount);
    };

    applyIfNeeded();
  }
);
