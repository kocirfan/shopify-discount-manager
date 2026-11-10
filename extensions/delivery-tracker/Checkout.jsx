// ============================================================
// DELIVERY TRACKER — CHECKOUT UI (Preact + Polaris web components, 2026-07)
//
// Pickup seçildiğinde:
//  - "2% extra korting voor afhalen" bilgisi + afhaaldatum seçici gösterilir
//  - cart attribute `selected_delivery_type` = "pickup" | "shipping" yazılır
//    (pickup-order-discount function'ı teslimat seçimi yoksa bunu kullanır)
//  - seçilen tarih `pickup_delivery_date` attribute'üne yazılır
//
// 2025-10 öncesi `extension()` / `root.createComponent` API'si kaldırıldığı için
// bu sürüme taşındı; davranış aynıdır.
// ============================================================

import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

// Yerel saatle YYYY-MM-DD
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextWeekday(date) {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function isPickupSelected(groups) {
  const firstGroup = groups?.[0];
  const selected = firstGroup?.selectedDeliveryOption;
  if (!selected) return false;

  const fullOption = (firstGroup.deliveryOptions || []).find(
    (opt) => opt.handle === selected.handle,
  );
  const type = String(fullOption?.type || '').toLowerCase();
  if (type) return type === 'pickup';

  const title = String(fullOption?.title || selected.title || '').toLowerCase();
  const handle = String(fullOption?.handle || selected.handle || '').toLowerCase();
  return ['pickup', 'terheijdenseweg', 'afhalen'].some(
    (k) => title.includes(k) || handle.includes(k),
  );
}

function Extension() {
  // Signal: değer değiştikçe bileşen yeniden render edilir
  const isPickup = isPickupSelected(shopify.deliveryGroups.value);

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const maxDate = addDays(today, 30);

  const [selectedDate, setSelectedDate] = useState(formatDate(nextWeekday(tomorrow)));
  const lastDeliveryType = useRef(null);
  const lastSavedDate = useRef(null);
  const debounceTimer = useRef(null);

  // Yalnızca değer değişince attribute yaz — sonsuz döngüyü önler
  useEffect(() => {
    const deliveryType = isPickup ? 'pickup' : 'shipping';
    if (deliveryType === lastDeliveryType.current) return;
    lastDeliveryType.current = deliveryType;
    shopify.applyAttributeChange({
      type: 'updateAttribute',
      key: 'selected_delivery_type',
      value: deliveryType,
    });
  }, [isPickup]);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  function handleDateChange(event) {
    const date = event.currentTarget.value;
    setSelectedDate(date);
    if (!date || date === lastSavedDate.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      lastSavedDate.current = date;
      shopify.applyAttributeChange({
        type: 'updateAttribute',
        key: 'pickup_delivery_date',
        value: date,
      });
    }, 1500);
  }

  if (!isPickup) return null;

  return (
    <s-stack gap="base">
      <s-banner tone="success" heading="Pickup Korting!" />
      <s-text type="strong">2% extra korting voor afhalen!</s-text>
      <s-heading>Afhaaldatum</s-heading>
      <s-text color="subdued">Selecteer uw gewenste afhaaldatum</s-text>
      <s-date-picker
        type="single"
        value={selectedDate}
        onChange={handleDateChange}
        disallow={`--${formatDate(today)},${formatDate(addDays(maxDate, 1))}--`}
        disallowDays="saturday,sunday"
      />
    </s-stack>
  );
}
