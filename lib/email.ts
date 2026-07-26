import crypto from 'crypto';
import {
  RESEND_API_KEY,
  FROM_EMAIL,
  ADMIN_NOTIFY_EMAILS,
  SUPPORT_EMAIL,
  SITE_URL,
} from './config';

// Minimal Resend wrapper (ported from the prototype). Returns {ok, simulated?}.
// When no API key is configured, it logs the code to the server console instead
// of sending - handy for local development.

type SendResult = { ok: boolean; simulated?: boolean; status?: number; detail?: string };

// Seller-facing mail (submission confirmation, approve/reject) invites replies,
// so route them to the support inbox. We only put SUPPORT_EMAIL in the visible
// "from" when it's on our verified sending domain - sending "from" an
// unverified domain fails DKIM and tanks deliverability - otherwise we keep the
// system from and just set Reply-To, which is safe for any address.
const supportOnSendingDomain = /@admitfolio\.com$/i.test(SUPPORT_EMAIL);
const SELLER_FROM = supportOnSendingDomain ? `Admitfolio <${SUPPORT_EMAIL}>` : FROM_EMAIL;
const SELLER_REPLY_TO = SUPPORT_EMAIL || undefined;

const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

// Anything user-influenced (listing labels contain the seller-typed school
// name) must be escaped before it is interpolated into email HTML.
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const WINE = '#7d1d2d';
const INK = '#1b1a17';
const MUTED = '#56524a';
const FAINT = '#8a857b';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── Layout ────────────────────────────────────────────────────────────────
// Microsoft Defender (and Gmail, to a lesser degree) score bare HTML fragments
// as suspicious: genuine mail ships a complete document, and naked <div> soup
// looks like something a script assembled to slip past a filter. A new sending
// domain has no reputation to offset that, which is how our login codes ended
// up in Microsoft 365 quarantine flagged as high-probability phishing. Every
// message now goes through this shell, which gives us:
//   - a DOCTYPE and <html lang> so the parse is unambiguous
//   - <meta charset> + viewport + color-scheme, as real ESP templates have
//   - a <title> matching the subject (a mismatch is itself a phish signal)
//   - a hidden preheader so the inbox preview shows intent, not stray markup
//   - table-based layout, which Outlook's Word renderer handles correctly
//   - a footer naming the sender, the site, and why this mail arrived
// Filters weight clear provenance heavily, so the footer is not decoration.
function layout(opts: {
  title: string;
  preheader: string;
  heading: string;
  body: string;
  recipient: string;
  why: string;
}): string {
  const { title, preheader, heading, body, recipient, why } = opts;
  const support = SUPPORT_EMAIL || `hello@${SITE_HOST}`;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f4f1;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f4f1;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f4f1;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" border="0" style="width:440px;max-width:100%;background-color:#ffffff;border:1px solid #eae5df;border-radius:14px;">
<tr>
<td style="padding:28px 28px 8px 28px;font-family:${FONT};">
<a href="${SITE_URL}" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${INK};text-decoration:none;">admitfolio<span style="color:${WINE};">.</span></a>
</td>
</tr>
<tr>
<td style="padding:14px 28px 0 28px;font-family:${FONT};">
<h1 style="margin:0 0 10px 0;font-size:20px;line-height:1.3;font-weight:700;color:${INK};">${esc(heading)}</h1>
${body}
</td>
</tr>
<tr>
<td style="padding:22px 28px 26px 28px;font-family:${FONT};">
<hr style="border:0;border-top:1px solid #eae5df;margin:0 0 14px 0;" />
<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${FAINT};">
${esc(why)} This message was sent to ${esc(recipient)}.
</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${FAINT};">
Admitfolio &middot; <a href="${SITE_URL}" style="color:${FAINT};text-decoration:underline;">${esc(SITE_HOST)}</a>
&middot; Questions? Reply to this email or write to
<a href="mailto:${esc(support)}" style="color:${FAINT};text-decoration:underline;">${esc(support)}</a>.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

// Outlook ignores padding on bare anchors, so buttons are a one-cell table.
const button = (href: string, label: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
<tr><td align="center" bgcolor="${WINE}" style="border-radius:999px;">
<a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr>
</table>`;

const p = (inner: string, size = 15) =>
  `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${MUTED};">${inner}</p>`;

// The plain-text part carries the same provenance the HTML footer does -
// filters compare the two parts, and a thin text alternative next to a rich
// HTML body reads as evasion.
const textFooter = (why: string, recipient: string) =>
  `\n\n---\n${why} This message was sent to ${recipient}.\n` +
  `Admitfolio - ${SITE_URL}\n` +
  `Questions? Reply to this email or write to ${SUPPORT_EMAIL || `hello@${SITE_HOST}`}.`;

// ── Messages ──────────────────────────────────────────────────────────────

export async function sendLoginCode(email: string, code: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] login code for ${email} is ${code} (no RESEND_API_KEY set)`);
    return { ok: true, simulated: true };
  }
  const why = `You're receiving this because someone asked to sign in to Admitfolio at ${SITE_HOST} with this address.`;
  const body =
    p(`Use this code to finish signing in at <b>${esc(SITE_HOST)}</b>. It stays valid for 10 minutes.`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px 0;">
<tr><td style="padding:14px 20px;background-color:#faf3f4;border:1px solid #e6c9ce;border-radius:12px;font-family:${FONT};font-size:32px;font-weight:700;letter-spacing:0.18em;color:${WINE};">${esc(code)}</td></tr>
</table>` +
    p(
      "Admitfolio will never ask you for this code by phone, text, or reply. If you didn't try to sign in, you can safely ignore this email - the code expires on its own.",
      13,
    );
  const subject = 'Your Admitfolio sign-in code';
  const html = layout({
    title: subject,
    preheader: `Your sign-in code for ${SITE_HOST}. It stays valid for 10 minutes.`,
    heading: 'Your sign-in code',
    body,
    recipient: email,
    why,
  });
  // The code deliberately stays out of the subject line: a subject carrying a
  // short numeric secret is a pattern Microsoft's phishing model weights
  // heavily, and it also keeps the code off lock-screen notification previews.
  const text =
    `Your Admitfolio sign-in code is ${code}.\n\n` +
    `Use it to finish signing in at ${SITE_HOST}. It stays valid for 10 minutes.\n\n` +
    "Admitfolio will never ask you for this code by phone, text, or reply. If you didn't try to sign in, you can ignore this email." +
    textFooter(why, email);
  return send(email, subject, html, text);
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
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;">
<tr><td style="padding:14px 16px;background-color:#faf3f4;border:1px solid #e6c9ce;border-radius:12px;font-family:${FONT};">
<div style="font-size:14px;font-weight:700;color:${WINE};">Action item: add your PayPal email</div>
<p style="margin:6px 0 0 0;font-size:14px;line-height:1.6;color:${MUTED};">This was your first sale. Payouts go out <b>every two weeks</b> via PayPal. Sign in to your seller dashboard and add your PayPal email under <b>Your seller profile</b> so we know where to send your earnings.</p>
</td></tr>
</table>${button(`${SITE_URL}/?login=1`, 'Open seller dashboard')}`
    : p('Your share is paid out every two weeks via PayPal to the address on your seller profile.');
  const why = 'You are receiving this because you sell essays on Admitfolio.';
  const body =
    p(`<b>${esc(itemLabel)}</b> just sold for <b>$${amount}</b>. Your share: <b>$${net.toFixed(2)}</b>.`) +
    actionBox;
  const subject = firstSale
    ? 'Your first Admitfolio sale - one quick step needed'
    : `You made a sale: ${itemLabel}`;
  const html = layout({
    title: subject,
    preheader: `${itemLabel} sold for $${amount}. Your share: $${net.toFixed(2)}.`,
    heading: 'You made a sale',
    body,
    recipient: email,
    why,
  });
  const text =
    `${itemLabel} just sold for $${amount}. Your share: $${net.toFixed(2)}.\n\n` +
    (firstSale
      ? `This was your first sale. Payouts go out every two weeks via PayPal. Sign in to your seller dashboard (${SITE_URL}/?login=1) and add your PayPal email under "Your seller profile" so we know where to send your earnings.`
      : 'Your share is paid out every two weeks via PayPal to the address on your seller profile.') +
    textFooter(why, email);
  return send(email, subject, html, text, { from: SELLER_FROM, replyTo: SELLER_REPLY_TO });
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
  const why = 'You are receiving this because you are listed as an Admitfolio review admin.';
  const subject = `New submission${testTag}: ${school} (${essayLabel})`;
  const body =
    p(
      `<b>${esc(sellerEmail)}</b> submitted <b>${esc(essayLabel)}</b> from <b>${esc(school)}</b>.<br />Admits: ${esc(admitTags.join(', ') || 'none')}`,
    ) + button(`${SITE_URL}/admin`, 'Open review console');
  const text =
    `${sellerEmail} submitted ${essayLabel} from ${school}.\n` +
    `Admits: ${admitTags.join(', ') || 'none'}\n\n` +
    `Review it at ${SITE_URL}/admin`;
  const results = await Promise.all(
    admins.map((to) =>
      send(
        to,
        subject,
        layout({
          title: subject,
          preheader: `${sellerEmail} submitted ${essayLabel} from ${school}.`,
          heading: `New submission to review${testTag}`,
          body,
          recipient: to,
          why,
        }),
        text + textFooter(why, to),
      ),
    ),
  );
  const failed = results.find((r) => !r.ok);
  return failed ?? { ok: true };
}

// Instant "we got it" to the seller the moment they submit: sets expectations
// (2-3 business days to a decision) and invites questions, which reply to the
// support inbox. Their submission already succeeded - this is never fatal.
export async function sendSubmissionConfirmation(
  email: string,
  opts: { school: string; essayCount: number },
): Promise<SendResult> {
  const { school, essayCount } = opts;
  const essayLabel = `${essayCount} essay${essayCount === 1 ? '' : 's'}`;
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] submission confirmation for ${email}: ${essayLabel} from ${school} (reply-to ${SELLER_REPLY_TO ?? 'none'})`);
    return { ok: true, simulated: true };
  }
  const why = 'You are receiving this because you submitted essays to Admitfolio.';
  const subject = `We got your Admitfolio submission: ${school}`;
  const body =
    p(
      `Thanks - we've got your <b>${esc(essayLabel)}</b> from <b>${esc(school)}</b>. Our team reviews every submission by hand, and you'll hear back with a decision within <b>2-3 business days</b>.`,
    ) +
    p("Have a question in the meantime? Just reply to this email and it'll reach us directly.") +
    button(`${SITE_URL}/?login=1`, 'Open seller dashboard');
  const html = layout({
    title: subject,
    preheader: `We received your ${essayLabel} from ${school}. Decision in 2-3 business days.`,
    heading: 'Submission received',
    body,
    recipient: email,
    why,
  });
  const text =
    `Thanks - we've got your ${essayLabel} from ${school}.\n\n` +
    `Our team reviews every submission by hand, and you'll hear back with a decision within 2-3 business days.\n\n` +
    `Have a question in the meantime? Just reply to this email and it'll reach us directly.\n\n` +
    `Open your seller dashboard: ${SITE_URL}/?login=1` +
    textFooter(why, email);
  return send(email, subject, html, text, { from: SELLER_FROM, replyTo: SELLER_REPLY_TO });
}

// Tells a seller the outcome of admin review. Approval means their listing is
// live; rejection includes the admin's note verbatim so they know exactly what
// to fix. This is the seller's only signal that review happened.
export async function sendListingDecisionNotification(
  email: string,
  opts: { school: string; decision: 'approved' | 'rejected'; note?: string | null },
): Promise<SendResult> {
  const { school, decision, note } = opts;
  const approved = decision === 'approved';
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] listing ${decision} for ${email} (${school})${note ? ` note: ${note}` : ''}`);
    return { ok: true, simulated: true };
  }
  // The note is admin-authored free text - escape it before it hits the HTML,
  // and preserve the writer's line breaks in the rendered message.
  const noteBox = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;">
<tr><td style="padding:14px 16px;background-color:#faf3f4;border:1px solid #e6c9ce;border-radius:12px;font-family:${FONT};">
<div style="font-size:14px;font-weight:700;color:${WINE};">${approved ? 'A note from the review team' : 'What to fix'}</div>
<p style="margin:6px 0 0 0;font-size:14px;line-height:1.6;color:${MUTED};white-space:pre-wrap;">${esc(note)}</p>
</td></tr>
</table>`
    : '';
  const why = 'You are receiving this because you submitted essays to Admitfolio.';
  const bodyText = approved
    ? `Your listing from <b>${esc(school)}</b> passed review and is now live on Admitfolio. Buyers can find and purchase it.`
    : `Your submission from <b>${esc(school)}</b> wasn't approved this time. See the note below for what to change, then resubmit from your seller dashboard.`;
  const subject = approved
    ? `Your Admitfolio listing is live: ${school}`
    : `Your Admitfolio submission needs changes: ${school}`;
  const html = layout({
    title: subject,
    preheader: approved
      ? `Your ${school} listing passed review and is live.`
      : `Your ${school} submission needs a few changes.`,
    heading: approved ? 'Your listing is live' : 'Your submission needs changes',
    body: p(bodyText) + noteBox + button(`${SITE_URL}/?login=1`, 'Open seller dashboard'),
    recipient: email,
    why,
  });
  const plainBody = approved
    ? `Your listing from ${school} passed review and is now live on Admitfolio. Buyers can find and purchase it.`
    : `Your submission from ${school} wasn't approved this time. See the note below for what to change, then resubmit from your seller dashboard.`;
  const text =
    `${plainBody}\n\n` +
    (note ? `${approved ? 'Note from the review team' : 'What to fix'}:\n${note}\n\n` : '') +
    `Open your seller dashboard: ${SITE_URL}/?login=1` +
    textFooter(why, email);
  return send(email, subject, html, text, { from: SELLER_FROM, replyTo: SELLER_REPLY_TO });
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
  const why = 'You are receiving this because you bought essays on Admitfolio.';
  const subject = `Your Admitfolio purchase: ${itemLabel}`;
  const body =
    p(
      `Thanks for your purchase of <b>${esc(itemLabel)}</b> ($${amount}). Your private reading link is below - keep this email, the link is yours.`,
    ) +
    button(accessUrl, 'Read your essays') +
    p(
      'A note on how to use them: these essays are for inspiration and learning only. Submitting them (or close rewrites) as your own work violates our Terms of Service and can carry serious consequences, including rescinded admissions.',
      13,
    );
  const html = layout({
    title: subject,
    preheader: `Your private reading link for ${itemLabel} is inside.`,
    heading: 'Your essays are ready',
    body,
    recipient: email,
    why,
  });
  const text =
    `Thanks for your purchase of ${itemLabel} ($${amount}). Read your essays at your private link (keep this email, the link is yours):\n\n${accessUrl}\n\n` +
    'A note on how to use them: these essays are for inspiration and learning only. Submitting them (or close rewrites) as your own work violates our Terms of Service and can carry serious consequences, including rescinded admissions.' +
    textFooter(why, email);
  return send(email, subject, html, text);
}

// Every email includes a plain-text part alongside the HTML - HTML-only
// messages score noticeably worse with spam filters (university inboxes
// especially), and login codes have to land in the inbox.
async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  opts?: { from?: string; replyTo?: string },
): Promise<SendResult> {
  // Default every message to a monitored reply address. A sender that accepts
  // no replies is a negative reputation signal, and Microsoft in particular
  // checks whether the From domain actually receives mail.
  const replyTo = opts?.replyTo ?? SELLER_REPLY_TO;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts?.from || FROM_EMAIL,
        to,
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        headers: {
          // Unique per message so Gmail and Outlook never collapse two sign-in
          // codes into one thread and hide the newer one.
          'X-Entity-Ref-ID': crypto.randomUUID(),
        },
      }),
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
