export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "20px", fontFamily: "system-ui" }}>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: January 6, 2026</em></p>

      <h2>1. Introduction</h2>
      <p>
        This Privacy Policy describes how Delivery Discount Manager ("we", "our", or "us") collects,
        uses, and shares information when you use our Shopify app.
      </p>

      <h2>2. Information We Collect</h2>
      <h3>2.1 Store Information</h3>
      <p>When you install our app, we collect:</p>
      <ul>
        <li>Shop domain and name</li>
        <li>Shop owner email</li>
        <li>Delivery method settings configured in the app</li>
      </ul>

      <h3>2.2 Customer Information</h3>
      <p>
        We do NOT store any customer personal information. The app only processes
        order information in real-time during checkout to calculate discounts.
      </p>

      <h2>3. How We Use Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide and maintain the app functionality</li>
        <li>Calculate delivery-based discounts during checkout</li>
        <li>Communicate with you about the app</li>
      </ul>

      <h2>4. Data Storage</h2>
      <p>
        Delivery discount settings are stored as Shopify metafields in your shop.
        We do not store this data on external servers.
      </p>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell, trade, or otherwise transfer your information to third parties.
        We only share data as required by law or to protect our rights.
      </p>

      <h2>6. GDPR Compliance</h2>
      <p>
        We comply with GDPR requirements. You have the right to:
      </p>
      <ul>
        <li>Access your data</li>
        <li>Correct your data</li>
        <li>Delete your data</li>
        <li>Object to data processing</li>
      </ul>

      <h2>7. Data Deletion</h2>
      <p>
        When you uninstall the app, all metafields are automatically removed by Shopify.
        If you request data deletion, we will delete all associated data within 48 hours.
      </p>

      <h2>8. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at:{" "}
        <a href="mailto:support@example.com">support@example.com</a>
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of
        any changes by posting the new Privacy Policy on this page.
      </p>
    </div>
  );
}
