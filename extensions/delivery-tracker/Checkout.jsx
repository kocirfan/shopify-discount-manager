import {
  extension,
  BlockStack,
  Text,
  DatePicker,
  Banner,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.pickup-location-list.render-after',
  (root, api) => {
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

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];
    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const disabledDates = [];
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 90);
    while (pastDate <= today) {
      disabledDates.push(pastDate.toISOString().split('T')[0]);
      pastDate.setDate(pastDate.getDate() + 1);
    }
    const checkDate = new Date(tomorrow);
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    while (checkDate <= endDate) {
      if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
        disabledDates.push(checkDate.toISOString().split('T')[0]);
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    const getNextWeekday = (date) => {
      const d = new Date(date);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    };

    const datePicker = root.createComponent(DatePicker, {
      selected: getNextWeekday(tomorrow),
      disabled: disabledDates,
      disableDatesAfter: maxDate,
      disableDatesBefore: minDate,
      onChange: (date) => {
        if (api.applyAttributeChange) {
          api.applyAttributeChange({
            type: 'updateAttribute',
            key: 'pickup_delivery_date',
            value: date
          });
        }
      }
    });

    container.appendChild(discountBanner);
    container.appendChild(discountText);
    container.appendChild(dateHeading);
    container.appendChild(dateDescription);
    container.appendChild(datePicker);
    root.appendChild(container);
  }
);
