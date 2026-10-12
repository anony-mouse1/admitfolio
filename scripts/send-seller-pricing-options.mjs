import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FROM = 'Fatimah from Admitfolio <hello@admitfolio.com>';
const REPLY_TO = 'hello@admitfolio.com';
const SUBJECT = 'We lowered your Admitfolio essay prices';
const DASHBOARD_URL = 'https://admitfolio.com/?utm_source=seller_email&utm_medium=email&utm_campaign=pricing_options';
const CAMPAIGN = 'admitfolio-seller-price-reduction-2026-10-11';
const BATCH_SIZE = 100;

const mode = process.argv.includes('--send')
  ? 'send'
  : process.argv.includes('--test')
    ? 'test'
    : 'dry-run';
const testArg = process.argv.find((arg) => arg.startsWith('--test-email='));
const testEmail = testArg?.slice('--test-email='.length).trim().toLowerCase();
const planArg = process.argv.find((arg) => arg.startsWith('--plan='));

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailSet(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function firstName(name) {
  const value = String(name || '').trim().split(/\s+/)[0];
  return value || 'there';
}

function listingLabel(listing) {
  const count = listing.essayCount;
  const packageName = `${count}-essay package`;
  return listing.targetSchool?.trim()
    ? `${listing.targetSchool.trim()} ${packageName}`
    : packageName;
}

function lines(recipient) {
  return recipient.listings.map((listing) => ({
    label: listingLabel(listing),
    oldPrice: listing.oldPrice,
    newPrice: listing.newPrice,
  }));
}

function textBody(recipient) {
  const suggestions = lines(recipient)
    .map((listing) => `• ${listing.label}: was $${listing.oldPrice}, now $${listing.newPrice}`)
    .join('\n');
  return `Hi ${firstName(recipient.name)},

We removed Admitfolio's school-based pricing minimum. In the meantime, we have significantly reduced prices across everyone's essays to make them more affordable and help sellers get more sales.

Your updated prices:

${suggestions}

We used the number of schools the application was accepted to when setting the temporary price, so listings with more admission results kept more of their premium.

You can:

• Keep the new lower price. No action is needed.
• Log in and choose a different price yourself.
• Reply “choose for me” and we will recommend the price we think gives you the best chance of a sale.
• Reply “take it down” and we will remove your listing.

Overall, we believe lower prices can be a win-win. More students may be able to purchase your essays, which can help you earn more over time through additional sales.

Review your price: ${DASHBOARD_URL}

Thank you for being part of Admitfolio!

Fatimah
Admitfolio
${REPLY_TO}`;
}

function htmlBody(recipient) {
  const suggestions = lines(recipient)
    .map((listing) => `<li style="margin-bottom:8px"><strong>${escapeHtml(listing.label)}</strong>: was $${listing.oldPrice}, now $${listing.newPrice}</li>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f5f1;color:#24211e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Keep your price, change it yourself, or ask us to choose for you.</div>
  <div style="max-width:620px;margin:0 auto;padding:30px 16px 48px">
    <div style="background:#fff;border:1px solid #ebe7e1;border-radius:16px;overflow:hidden">
      <div style="padding:24px 30px;border-bottom:1px solid #ebe7e1;font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:700">Admitfolio<span style="color:#7d1d2d">.</span></div>
      <div style="padding:32px 30px;color:#49443f;font-size:16px;line-height:1.65">
        <p style="margin:0 0 18px">Hi ${escapeHtml(firstName(recipient.name))},</p>
        <p style="margin:0 0 18px">We removed Admitfolio's school-based pricing minimum. In the meantime, we have significantly reduced prices across everyone's essays to make them more affordable and help sellers get more sales.</p>
        <p style="margin:0 0 10px">Your updated prices:</p>
        <ul style="margin:0 0 22px;padding-left:22px">${suggestions}</ul>
        <p style="margin:0 0 18px">We used the number of schools the application was accepted to when setting the temporary price, so listings with more admission results kept more of their premium.</p>
        <p style="margin:0 0 10px"><strong style="color:#24211e">You can:</strong></p>
        <ul style="margin:0 0 22px;padding-left:22px">
          <li style="margin-bottom:7px">Keep the new lower price. No action is needed.</li>
          <li style="margin-bottom:7px">Log in and choose a different price yourself.</li>
          <li style="margin-bottom:7px">Reply <strong>choose for me</strong> and we will recommend the price we think gives you the best chance of a sale.</li>
          <li>Reply <strong>take it down</strong> and we will remove your listing.</li>
        </ul>
        <p style="margin:0 0 24px">Overall, we believe lower prices can be a win-win. More students may be able to purchase your essays, which can help you earn more over time through additional sales.</p>
        <p style="margin:0 0 26px"><a href="${DASHBOARD_URL.replace(/&/g, '&amp;')}" style="display:inline-block;background:#7d1d2d;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:650">Review your price</a></p>
        <p style="margin:0">Thank you for being part of Admitfolio!</p>
        <p style="margin:18px 0 0">Fatimah<br>Admitfolio<br><a href="mailto:${REPLY_TO}" style="color:#7d1d2d">${REPLY_TO}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function message(recipient, to = recipient.email) {
  return {
    from: FROM,
    to,
    reply_to: REPLY_TO,
    subject: SUBJECT,
    html: htmlBody(recipient),
    text: textBody(recipient),
    tags: [
      { name: 'campaign', value: 'seller_price_reduction_2026_10_11' },
      { name: 'audience', value: 'admitfolio_sellers' },
    ],
  };
}

async function sendBatch(messages, batchIndex) {
  const recipientDigest = createHash('sha256')
    .update(messages.map((item) => item.to).join('\n'))
    .digest('hex')
    .slice(0, 16);
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${CAMPAIGN}-batch-${batchIndex + 1}-${recipientDigest}`,
    },
    body: JSON.stringify(messages),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Batch ${batchIndex + 1} failed (${response.status}): ${body}`);
  const parsed = JSON.parse(body);
  return { batch: batchIndex + 1, requested: messages.length, accepted: Array.isArray(parsed.data) ? parsed.data.length : 0 };
}

async function main() {
  if ((mode === 'send' || mode === 'test') && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is missing');
  if (!planArg) throw new Error('Pass the locked pricing plan with --plan=/absolute/path');
  const plan = JSON.parse(await readFile(resolve(planArg.slice('--plan='.length)), 'utf8'));
  if (!Array.isArray(plan.listings) || !plan.listings.length) throw new Error('The pricing plan is empty or invalid');
  const excluded = new Set([...emailSet(process.env.ADMIN_EMAILS), ...emailSet(process.env.TEST_EMAILS)]);
  const byEmail = new Map();
  for (const listing of plan.listings) {
    const email = String(listing.sellerEmail || '').trim().toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { email, name: listing.sellerName, listings: [] });
    byEmail.get(email).listings.push(listing);
  }
  const recipients = [...byEmail.values()]
    .sort((a, b) => a.email.localeCompare(b.email))
    .filter((seller) => validEmail(seller.email) && !excluded.has(seller.email));

  if (mode === 'dry-run') {
    const listingCount = recipients.reduce((total, recipient) => total + recipient.listings.length, 0);
    console.log(JSON.stringify({ mode, from: FROM, subject: SUBJECT, recipients: recipients.length, listings: listingCount, batches: Math.ceil(recipients.length / BATCH_SIZE) }, null, 2));
    return;
  }

  if (mode === 'test') {
    if (!testEmail || !validEmail(testEmail)) throw new Error('Pass a valid --test-email address');
    const sample = recipients[0] || { email: testEmail, name: 'Fatimah', listings: [{ targetSchool: 'Stanford', oldPrice: 56, newPrice: 25, essayCount: 3 }] };
    console.log(JSON.stringify({ campaign: CAMPAIGN, mode, results: [await sendBatch([message(sample, testEmail)], 0)] }, null, 2));
    return;
  }

  const batches = chunks(recipients.map((recipient) => message(recipient)), BATCH_SIZE);
  const results = [];
  for (let index = 0; index < batches.length; index += 1) results.push(await sendBatch(batches[index], index));
  console.log(JSON.stringify({ campaign: CAMPAIGN, mode, sentAt: new Date().toISOString(), recipientCount: recipients.length, results }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; });
