import { extension } from '@shopify/ui-extensions/checkout';

const SURCHARGE_VARIANT_ID = 'gid://shopify/ProductVariant/61571547791690';
const SETTINGS_NAMESPACE = 'extra_surcharge';
const SETTINGS_KEY = 'settings';

export default extension(
  'purchase.checkout.actions.render-before',
  async (root, { lines, applyCartLinesChange, query }) => {
    console.log('[SurchargeApplier] extension started');

    let isProcessing = false;
    let settings = null;

    // Ayarları bir kez yükle
    const loadSettings = async () => {
      const result = await query(`{
        shop {
          metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${SETTINGS_KEY}") {
            value
          }
        }
      }`);
      console.log('[SurchargeApplier] query result:', JSON.stringify(result));
      const json = result?.data?.shop?.metafield?.value;
      if (!json) return null;
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    };

    const syncSurcharge = async (currentLines) => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        if (!settings) {
          settings = await loadSettings();
        }
        console.log('[SurchargeApplier] settings:', JSON.stringify(settings));

        if (!settings?.enabled || !settings?.percentage || settings.percentage <= 0) {
          // Surcharge devre dışı — varsa kaldır
          const existing = currentLines.find(l => l.merchandise.id === SURCHARGE_VARIANT_ID);
          if (existing) {
            await applyCartLinesChange({ type: 'removeCartLine', id: existing.id, quantity: existing.quantity });
            console.log('[SurchargeApplier] removed surcharge (disabled)');
          }
          return;
        }

        // Sepet toplamı (surcharge hariç)
        const cartTotal = currentLines.reduce((sum, line) => {
          if (line.merchandise.id === SURCHARGE_VARIANT_ID) return sum;
          return sum + parseFloat(line.cost?.totalAmount?.amount || '0');
        }, 0);

        console.log('[SurchargeApplier] cartTotal:', cartTotal, 'rate:', settings.percentage);

        const surchargeAmount = parseFloat((cartTotal * settings.percentage / 100).toFixed(2));
        const existing = currentLines.find(l => l.merchandise.id === SURCHARGE_VARIANT_ID);

        if (cartTotal <= 0 || surchargeAmount <= 0) {
          if (existing) {
            await applyCartLinesChange({ type: 'removeCartLine', id: existing.id, quantity: existing.quantity });
          }
          return;
        }

        // Mevcut surcharge'ı kaldır, yenisini ekle
        if (existing) {
          await applyCartLinesChange({ type: 'removeCartLine', id: existing.id, quantity: existing.quantity });
        }
        const addResult = await applyCartLinesChange({
          type: 'addCartLine',
          merchandiseId: SURCHARGE_VARIANT_ID,
          quantity: 1,
          attributes: [{ key: '_surcharge_amount', value: String(surchargeAmount) }],
        });
        console.log('[SurchargeApplier] addCartLine result:', JSON.stringify(addResult));
      } catch (err) {
        console.error('[SurchargeApplier] error:', err?.message || err);
      } finally {
        isProcessing = false;
      }
    };

    // lines değiştikçe sync et
    lines.subscribe((currentLines) => {
      console.log('[SurchargeApplier] lines changed, count:', currentLines.length);
      syncSurcharge(currentLines);
    });

    // İlk yükleme
    syncSurcharge(lines.current);
  }
);
