// Admitfolio — Google Apps Script webhook
// Pastes into the Apps Script editor tied to your Google Sheet.
//
// Setup:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Replace all existing code with this file's contents
//   3. Click Deploy → New deployment → Type: Web app
//      Execute as: Me  |  Who has access: Anyone
//   4. Click Deploy, copy the Web app URL
//   5. Set it as the SHEETS_WEBHOOK_URL env var when you start the server:
//      SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/XXXX/exec" node server.js
//
// The script appends one row per seller submission. Headers are added
// automatically the first time it runs.

const HEADERS = [
  'Submitted At',
  'Email',
  'University',
  'Name Visibility',
  'Application Type',
  'Admitted Schools',
  'Tier (chosen)',
  'Tier (suggested)',
  'Price Floor ($)',
  'Pricing Mode',
  'Price ($)',
  'Essay Count',
  'Essays (prompts & filenames)',
];

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Add header row once, on the very first submission.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.submittedAt  || new Date().toISOString(),
      data.email        || '',
      data.university   || '',
      data.anonMode     || '',
      data.applicationSystem || '',
      (data.admittedSchools || []).join(', '),
      data.tier          || '',
      data.tierSuggested || '',
      data.priceFloor    || '',
      data.pricingMode  || '',
      data.price        || '',
      data.essayCount   || 0,
      data.essays       || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('Admitfolio webhook error:', err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET handler returns a simple health-check so you can confirm the deployment
// is live before wiring up the server.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'admitly-sheets-webhook' }))
    .setMimeType(ContentService.MimeType.JSON);
}
