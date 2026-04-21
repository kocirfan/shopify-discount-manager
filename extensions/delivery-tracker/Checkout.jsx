import {
  extension,
  BlockStack,
  Text,
  DatePicker,
  Banner,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.pickup-location-list.render-after',
  (root, { applyAttributeChange }) => {
    console.log('[DELIVERY TRACKER] ✅ Pickup extension başlatıldı');

    let selectedDate = null;

    // Pickup seçildiğinde bu target render edilir — direkt UI göster
    const container = root.createComponent(BlockStack, { spacing: 'base' });

    const discountBanner = root.createComponent(Banner, {
      status: 'success',
      title: 'Pickup Korting!'
    });

    const discountText = root.createComponent(Text, {
      size: 'medium',
      emphasis: 'bold'
    }, '2% extra korting voor afhalen!');

    const dateHeading = root.createComponent(Text, {
      size: 'base',
      emphasis: 'bold'
    }, 'Afhaaldatum');

    const dateDescription = root.createComponent(Text, {
      size: 'small',
      appearance: 'subdued'
    }, 'Selecteer uw gewenste afhaaldatum');

    // Tarih hesaplama
    const today = new Date();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Bugün ve önceki günleri devre dışı bırak
    const disabledDates = [];
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 90);
    while (pastDate <= today) {
      disabledDates.push(pastDate.toISOString().split('T')[0]);
      pastDate.setDate(pastDate.getDate() + 1);
    }

    // Hafta sonlarını devre dışı bırak
    const checkDate = new Date(tomorrow);
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    while (checkDate <= endDate) {
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        disabledDates.push(checkDate.toISOString().split('T')[0]);
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    // İlk seçilebilir iş günü
    const getNextWeekday = (date) => {
      const nextDay = new Date(date);
      while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
        nextDay.setDate(nextDay.getDate() + 1);
      }
      return nextDay.toISOString().split('T')[0];
    };

    const defaultDate = getNextWeekday(tomorrow);

    const datePicker = root.createComponent(DatePicker, {
      selected: defaultDate,
      disabled: disabledDates,
      disableDatesAfter: maxDate,
      disableDatesBefore: minDate,
      onChange: async (date) => {
        selectedDate = date;
        console.log('[DELIVERY TRACKER] 📅 Tarih seçildi:', date);
        try {
          await applyAttributeChange({
            type: 'updateAttribute',
            key: 'pickup_delivery_date',
            value: date
          });
          // Pickup olduğunu da kaydet
          await applyAttributeChange({
            type: 'updateAttribute',
            key: 'selected_delivery_type',
            value: 'pickup'
          });
        } catch (error) {
          console.error('[DELIVERY TRACKER] ❌ Hata:', error);
        }
      }
    });

    container.appendChild(discountBanner);
    container.appendChild(discountText);
    container.appendChild(dateHeading);
    container.appendChild(dateDescription);
    container.appendChild(datePicker);
    root.appendChild(container);

    // Pickup seçildiğini hemen kaydet
    applyAttributeChange({
      type: 'updateAttribute',
      key: 'selected_delivery_type',
      value: 'pickup'
    }).catch(err => {
      console.error('[DELIVERY TRACKER] ❌ Attribute hatası:', err);
    });

    console.log('[DELIVERY TRACKER] 🎉 Pickup UI gösterildi');
  }
);
