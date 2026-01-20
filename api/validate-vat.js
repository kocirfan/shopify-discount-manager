// VIES VAT Validation API
// Avrupa Komisyonu'nun resmi VAT doğrulama servisi

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // VAT numarasını al (GET veya POST)
    const vatNumber = req.query.vat || req.body?.vat;

    if (!vatNumber) {
      return res.status(400).json({
        valid: false,
        error: 'VAT number is required'
      });
    }

    // VAT numarasını temizle
    const cleanVat = vatNumber.replace(/[\s.-]/g, '').toUpperCase();

    // Ülke kodu ve numara ayır
    const countryCode = cleanVat.substring(0, 2);
    const vatNumberOnly = cleanVat.substring(2);

    if (!countryCode || !vatNumberOnly) {
      return res.status(400).json({
        valid: false,
        error: 'Invalid VAT format. Use format: NL123456789B01'
      });
    }

    // VIES API'ye istek at
    const viesResponse = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          countryCode: countryCode,
          vatNumber: vatNumberOnly,
        }),
      }
    );

    if (!viesResponse.ok) {
      // VIES API'si bazen çalışmıyor - fallback olarak format kontrolü yap
      const formatValid = validateVATFormat(cleanVat);
      return res.status(200).json({
        valid: formatValid,
        viesAvailable: false,
        message: 'VIES service unavailable, format validation only',
        countryCode: countryCode,
        vatNumber: vatNumberOnly,
      });
    }

    const viesData = await viesResponse.json();

    return res.status(200).json({
      valid: viesData.valid === true,
      viesAvailable: true,
      countryCode: countryCode,
      vatNumber: vatNumberOnly,
      name: viesData.name || null,
      address: viesData.address || null,
      requestDate: viesData.requestDate || new Date().toISOString(),
    });

  } catch (error) {
    console.error('VAT validation error:', error);

    // Hata durumunda format kontrolü yap
    const vatNumber = req.query.vat || req.body?.vat;
    if (vatNumber) {
      const cleanVat = vatNumber.replace(/[\s.-]/g, '').toUpperCase();
      const formatValid = validateVATFormat(cleanVat);
      return res.status(200).json({
        valid: formatValid,
        viesAvailable: false,
        message: 'VIES service error, format validation only',
        error: error.message,
      });
    }

    return res.status(500).json({
      valid: false,
      error: 'Validation failed'
    });
  }
}

// Format doğrulama (VIES çalışmazsa fallback)
function validateVATFormat(vat) {
  const vatPatterns = {
    NL: /^NL\d{9}B\d{2}$/,           // Hollanda
    BE: /^BE[01]\d{9}$/,              // Belçika
    DE: /^DE\d{9}$/,                  // Almanya
    FR: /^FR[A-Z0-9]{2}\d{9}$/,       // Fransa
    GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, // İngiltere
    AT: /^ATU\d{8}$/,                 // Avusturya
    IT: /^IT\d{11}$/,                 // İtalya
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,  // İspanya
    PL: /^PL\d{10}$/,                 // Polonya
    PT: /^PT\d{9}$/,                  // Portekiz
  };

  const countryCode = vat.substring(0, 2);
  const pattern = vatPatterns[countryCode];

  if (!pattern) {
    return vat.length >= 8; // Bilinmeyen ülke - en az 8 karakter
  }

  return pattern.test(vat);
}
