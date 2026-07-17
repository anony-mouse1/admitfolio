import { RESEND_API_KEY, FROM_EMAIL, ADMIN_NOTIFY_EMAILS } from './config';

// Minimal Resend wrapper (ported from the prototype). Returns {ok, simulated?}.
// When no API key is configured, it logs the code to the server console instead
// of sending - handy for local development.

type SendResult = { ok: boolean; simulated?: boolean; status?: number; detail?: string };

const wineDot = '<span style="color:#7d1d2d">.</span>';

// Anything user-influenced (listing labels contain the seller-typed school
// name) must be escaped before it is interpolated into email HTML.
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function sendLoginCode(email: string, code: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] login code for ${email} is ${code} (no RESEND_API_KEY set)`);
    return { ok: true, simulated: true };
  }
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">Your verification code</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">Enter this code to continue. It expires in 10 minutes.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:.18em;margin:16px 0;color:#7d1d2d">${code}</div>
      <p style="color:#8a857b;font-size:13px">If you didn't request this, you can ignore this email.</p>
    </div>`;
  const text = `Your Admitfolio verification code is ${code}. Enter it to continue - it expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  return send(email, `Your Admitfolio verification code: ${code}`, html, text);
}

// Notifies a seller that one of their essays sold. The first sale carries an
// action item: add a PayPal email so biweekly payouts have somewhere to go.
export async function sendSaleNotification(
  email: string,
  opts: { itemLabel: string; amount: number; net: number; firstSale: boolean },
): Promise<SendResult> {
  const { itemLabel, amount, net, firstSale } = opts;
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] sale notification for ${email}: ${itemLabel} $${amount} (net $${net})${firstSale ? ' FIRST SALE - PayPal action item' : ''}`);
    return { ok: true, simulated: true };
  }
  const actionBox = firstSale
    ? `
      <div style="margin:18px 0;padding:14px 16px;background:#faf3f4;border:1px solid #e6c9ce;border-radius:12px">
        <div style="font-size:14px;font-weight:700;color:#7d1d2d">Action item: add your PayPal email</div>
        <p style="color:#56524a;font-size:14px;line-height:1.6;margin:6px 0 0">
          This was your first sale! Payouts go out <b>every two weeks</b> via PayPal.
          Log in to your seller dashboard and add your PayPal email under
          <b>Your seller profile</b> so we know where to send your earnings.
        </p>
        <a href="https://admitfolio.com/?login=1" style="display:inline-block;margin-top:10px;background:#7d1d2d;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;padding:9px 18px">Open seller login</a>
      </div>`
    : `
      <p style="color:#56524a;font-size:14px;line-height:1.6">
        Your share is paid out every two weeks via PayPal to the address on your seller profile.
      </p>`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">You made a sale! 🎉</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        <b>${esc(itemLabel)}</b> just sold for <b>$${amount}</b>.
        Your share: <b>$${net.toFixed(2)}</b>.
      </p>
      ${actionBox}
      <p style="color:#8a857b;font-size:13px">See details anytime in your seller dashboard.</p>
    </div>`;
  const subject = firstSale
    ? 'Your first Admitfolio sale! One quick action needed'
    : `You made a sale: ${itemLabel}`;
  const text =
    `${itemLabel} just sold for $${amount}. Your share: $${net.toFixed(2)}.\n\n` +
    (firstSale
      ? 'This was your first sale! Payouts go out every two weeks via PayPal. Log in to your seller dashboard (https://admitfolio.com/?login=1) and add your PayPal email under "Your seller profile" so we know where to send your earnings.'
      : 'Your share is paid out every two weeks via PayPal to the address on your seller profile.');
  return send(email, subject, html, text);
}

// Tells the admin(s) a new listing just landed in the review queue. Submissions
// only go live after manual review, so this is the signal to go approve them.
export async function sendAdminSubmissionNotification(opts: {
  school: string;
  sellerEmail: string;
  essayCount: number;
  admitTags: string[];
  isTest: boolean;
}): Promise<SendResult> {
  const { school, sellerEmail, essayCount, admitTags, isTest } = opts;
  const admins = ADMIN_NOTIFY_EMAILS;
  if (admins.length === 0) {
    console.warn('[email] new submission but no admin notify address configured - no one notified');
    return { ok: false, detail: 'ADMIN_NOTIFY_EMAILS/ADMIN_EMAILS not configured' };
  }
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] admin notification: ${sellerEmail} submitted ${essayCount} essay(s) from ${school}`);
    return { ok: true, simulated: true };
  }
  const testTag = isTest ? ' [test]' : '';
  const essayLabel = `${essayCount} essay${essayCount === 1 ? '' : 's'}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">New submission to review${testTag}</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        <b>${esc(sellerEmail)}</b> submitted <b>${essayLabel}</b> from <b>${esc(school)}</b>.<br>
        Admits: ${esc(admitTags.join(', ') || 'none')}
      </p>
      <a href="https://admitfolio.com/admin" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Open review console</a>
    </div>`;
  const text =
    `${sellerEmail} submitted ${essayLabel} from ${school}.\n` +
    `Admits: ${admitTags.join(', ') || 'none'}\n\n` +
    'Review it at https://admitfolio.com/admin';
  const results = await Promise.all(
    admins.map((to) => send(to, `New submission${testTag}: ${school} (${essayLabel})`, html, text)),
  );
  const failed = results.find((r) => !r.ok);
  return failed ?? { ok: true };
}

// Buyer receipt + delivery: the private access link is how they read the
// essays, so this email IS the product handoff.
export async function sendPurchaseReceipt(
  email: string,
  opts: { itemLabel: string; amount: number; accessUrl: string },
): Promise<SendResult> {
  const { itemLabel, amount, accessUrl } = opts;
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] purchase receipt for ${email}: ${itemLabel} $${amount} -> ${accessUrl}`);
    return { ok: true, simulated: true };
  }
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">Your essays are ready 🎉</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        Thanks for your purchase of <b>${esc(itemLabel)}</b> ($${amount}).
        Your private reading link is below - keep this email, the link is yours.
      </p>
      <a href="${accessUrl}" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Read your essays</a>
      <p style="color:#8a857b;font-size:13px;line-height:1.6">
        A note on how to use them: these essays are for inspiration and learning only.
        Submitting them (or close rewrites) as your own work violates our Terms of Service
        and can carry serious consequences, including rescinded admissions.
      </p>
    </div>`;
  const text =
    `Thanks for your purchase of ${itemLabel} ($${amount}). Read your essays at your private link (keep this email, the link is yours):\n\n${accessUrl}\n\n` +
    'A note on how to use them: these essays are for inspiration and learning only. Submitting them (or close rewrites) as your own work violates our Terms of Service and can carry serious consequences, including rescinded admissions.';
  return send(email, `Your Admitfolio purchase: ${itemLabel}`, html, text);
}

// Every email includes a plain-text part alongside the HTML - HTML-only
// messages score noticeably worse with spam filters (university inboxes
// especially), and login codes have to land in the inbox.
async function send(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return { ok: false, status: resp.status, detail };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
