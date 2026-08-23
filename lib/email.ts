import {
  RESEND_API_KEY,
  FROM_EMAIL,
  ADMIN_NOTIFY_EMAILS,
  SALE_NOTIFY_EMAILS,
  SUPPORT_EMAIL,
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

// Notifies a seller that one of their essays sold. Payout onboarding is
// intentionally deferred until this first real sale, so sellers do no setup
// work before they have earned anything.
export async function sendSaleNotification(
  email: string,
  opts: {
    itemLabel: string;
    grossAmountCents: number;
    platformFeeCents: number;
    stripeProcessingFeeCents: number;
    sellerPayoutCents: number;
    firstSale: boolean;
  },
): Promise<SendResult> {
  const {
    itemLabel,
    grossAmountCents,
    platformFeeCents,
    stripeProcessingFeeCents,
    sellerPayoutCents,
    firstSale,
  } = opts;
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] sale notification for ${email}: ${itemLabel} ${money(grossAmountCents)} (payout ${money(sellerPayoutCents)})${firstSale ? ' FIRST SALE - Stripe payout setup action' : ''}`);
    return { ok: true, simulated: true };
  }
  const actionBox = firstSale
    ? `
      <div style="margin:18px 0;padding:14px 16px;background:#faf3f4;border:1px solid #e6c9ce;border-radius:12px">
        <div style="font-size:14px;font-weight:700;color:#7d1d2d">Congrats, you made your first sale!</div>
        <p style="color:#56524a;font-size:14px;line-height:1.6;margin:6px 0 0">
          Your payout is <b>${money(sellerPayoutCents)}</b>. Please set up your payout so Stripe
          can send your earnings to your bank. You only have to do this once.
        </p>
        <a href="https://admitfolio.com/?login=1&amp;payouts=setup" style="display:inline-block;margin-top:10px;background:#7d1d2d;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;padding:9px 18px">Set up my payout</a>
      </div>`
    : `
      <p style="color:#56524a;font-size:14px;line-height:1.6">
        Your earnings are recorded in your seller dashboard. Once payout setup is complete,
        Stripe sends them automatically to your bank.
      </p>`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">${firstSale ? 'Congrats, you made your first sale! 🎉' : 'You made a sale! 🎉'}</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        <b>${esc(itemLabel)}</b> just sold for <b>${money(grossAmountCents)}</b>.
      </p>
      <div style="margin:16px 0;border-top:1px solid #ebe6de;border-bottom:1px solid #ebe6de;padding:7px 0">
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Gross sales</span><b style="color:#1b1a17">${money(grossAmountCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Admitfolio fee (40%)</span><b style="color:#8a857b">−${money(platformFeeCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Stripe transaction fee</span><b style="color:#8a857b">−${money(stripeProcessingFeeCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0 7px;color:#1b1a17;font-size:15px"><strong>Your payout</strong><strong style="color:#7d1d2d">${money(sellerPayoutCents)}</strong></div>
      </div>
      ${actionBox}
      <p style="color:#8a857b;font-size:13px">See details anytime in your seller dashboard.</p>
    </div>`;
  const subject = firstSale
    ? 'Congrats, you made your first sale! Set up your payout'
    : `You made a sale: ${itemLabel}`;
  const text =
    `${itemLabel} just sold for ${money(grossAmountCents)}.\n\n` +
    `Gross sales: ${money(grossAmountCents)}\n` +
    `Admitfolio fee (40%): -${money(platformFeeCents)}\n` +
    `Stripe transaction fee: -${money(stripeProcessingFeeCents)}\n` +
    `Your payout: ${money(sellerPayoutCents)}\n\n` +
    (firstSale
      ? `Congrats, you made your first sale! Your payout is ${money(sellerPayoutCents)}. Please set up your payout so Stripe can send your earnings to your bank. You only have to do this once: https://admitfolio.com/?login=1&payouts=setup`
      : 'Your earnings are recorded in your seller dashboard. Once payout setup is complete, Stripe sends them automatically to your bank.');
  return send(email, subject, html, text, {
    from: SELLER_FROM,
    replyTo: SELLER_REPLY_TO,
  });
}

// Gives the Admitfolio team a privacy-safe accounting snapshot after a sale
// has been delivered and its Stripe fee is final. Buyer and seller contact
// details are intentionally excluded.
export async function sendAdminSaleNotification(opts: {
  purchaseId: string;
  itemLabel: string;
  grossAmountCents: number;
  platformFeeCents: number;
  stripeProcessingFeeCents: number;
  sellerPayoutCents: number;
  soldAt: Date;
}): Promise<SendResult> {
  const {
    purchaseId,
    itemLabel,
    grossAmountCents,
    platformFeeCents,
    stripeProcessingFeeCents,
    sellerPayoutCents,
    soldAt,
  } = opts;
  const recipients = SALE_NOTIFY_EMAILS;
  if (recipients.length === 0) {
    console.warn('[email] completed sale but no sale notification address is configured');
    return { ok: false, detail: 'SALE_NOTIFY_EMAILS/SUPPORT_EMAIL not configured' };
  }

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const soldAtPacific = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(soldAt);
  const admitfolioRevenueCents = platformFeeCents;

  if (!RESEND_API_KEY) {
    console.log(
      `[email:dev] owner sale notification: ${itemLabel} ${money(grossAmountCents)} at ${soldAtPacific}`,
    );
    return { ok: true, simulated: true };
  }

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">New sale completed</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        <b>${esc(itemLabel)}</b> sold for <b>${money(grossAmountCents)}</b> on ${esc(soldAtPacific)}.
      </p>
      <div style="margin:16px 0;border-top:1px solid #ebe6de;border-bottom:1px solid #ebe6de;padding:7px 0">
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Gross sale</span><b style="color:#1b1a17">${money(grossAmountCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Admitfolio revenue</span><b style="color:#7d1d2d">${money(admitfolioRevenueCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;color:#56524a;font-size:14px"><span>Stripe fee</span><b style="color:#1b1a17">${money(stripeProcessingFeeCents)}</b></div>
        <div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0 7px;color:#1b1a17;font-size:15px"><strong>Seller payout</strong><strong>${money(sellerPayoutCents)}</strong></div>
      </div>
      <a href="https://admitfolio.com/admin" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Open Admitfolio admin</a>
    </div>`;
  const text =
    `${itemLabel} sold for ${money(grossAmountCents)} on ${soldAtPacific}.\n\n` +
    `Gross sale: ${money(grossAmountCents)}\n` +
    `Admitfolio revenue: ${money(admitfolioRevenueCents)}\n` +
    `Stripe fee: ${money(stripeProcessingFeeCents)}\n` +
    `Seller payout: ${money(sellerPayoutCents)}\n\n` +
    'Open Admitfolio admin: https://admitfolio.com/admin';
  const results = await Promise.all(
    recipients.map((to, index) =>
      send(to, `New Admitfolio sale: ${itemLabel} (${money(grossAmountCents)})`, html, text, {
        from: SELLER_FROM,
        replyTo: SELLER_REPLY_TO,
        idempotencyKey: `admin-sale/${purchaseId}/${index}`,
      }),
    ),
  );
  const failed = results.find((result) => !result.ok);
  return failed ?? { ok: true };
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
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">Submission received 🎉</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        Thanks - we've got your <b>${essayLabel}</b> from <b>${esc(school)}</b>.
        Our team reviews every submission by hand, and you'll hear back with a
        decision within <b>2-3 business days</b>.
      </p>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        Have a question in the meantime? Just reply to this email and it'll reach us directly.
      </p>
      <a href="https://admitfolio.com/?login=1" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Open seller dashboard</a>
    </div>`;
  const text =
    `Thanks - we've got your ${essayLabel} from ${school}.\n\n` +
    `Our team reviews every submission by hand, and you'll hear back with a decision within 2-3 business days.\n\n` +
    `Have a question in the meantime? Just reply to this email and it'll reach us directly.\n\n` +
    `Open your seller dashboard: https://admitfolio.com/?login=1`;
  return send(email, `We got your Admitfolio submission: ${school}`, html, text, {
    from: SELLER_FROM,
    replyTo: SELLER_REPLY_TO,
  });
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
    ? `
      <div style="margin:18px 0;padding:14px 16px;background:#faf3f4;border:1px solid #e6c9ce;border-radius:12px">
        <div style="font-size:14px;font-weight:700;color:#7d1d2d">${approved ? 'A note from the review team' : 'What to fix'}</div>
        <p style="color:#56524a;font-size:14px;line-height:1.6;margin:6px 0 0;white-space:pre-wrap">${esc(note)}</p>
      </div>`
    : '';
  const body = approved
    ? `Your listing from <b>${esc(school)}</b> passed review and is now live on Admitfolio. Buyers can find and purchase it.`
    : `Your submission from <b>${esc(school)}</b> wasn't approved this time. See the note below for what to change, then resubmit from your seller dashboard.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">${approved ? 'Your listing is live 🎉' : 'Your submission needs changes'}</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">${body}</p>
      ${noteBox}
      <a href="https://admitfolio.com/?login=1" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Open seller dashboard</a>
    </div>`;
  const textBody = approved
    ? `Your listing from ${school} passed review and is now live on Admitfolio. Buyers can find and purchase it.`
    : `Your submission from ${school} wasn't approved this time. See the note below for what to change, then resubmit from your seller dashboard.`;
  const text =
    `${textBody}\n\n` +
    (note ? `${approved ? 'Note from the review team' : 'What to fix'}:\n${note}\n\n` : '') +
    'Open your seller dashboard: https://admitfolio.com/?login=1';
  const subject = approved
    ? `Your Admitfolio listing is live: ${school}`
    : `Your Admitfolio submission needs changes: ${school}`;
  return send(email, subject, html, text, { from: SELLER_FROM, replyTo: SELLER_REPLY_TO });
}

// Buyer receipt + delivery: the private access link is how they read the
// essays, so this email IS the product handoff.
export async function sendPurchaseReceipt(
  email: string,
  opts: {
    itemLabel: string;
    accessUrl: string;
    fingerprint?: string;
    amount?: number;
    amountCents?: number;
  },
): Promise<SendResult> {
  const { itemLabel, accessUrl, fingerprint } = opts;
  const amountCents = opts.amountCents ?? Math.round((opts.amount ?? 0) * 100);
  const amountLabel = `$${(amountCents / 100).toFixed(2)}`;
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] purchase receipt for ${email}: ${itemLabel} ${amountLabel} -> ${accessUrl} (reply-to ${SELLER_REPLY_TO ?? 'none'})`);
    return { ok: true, simulated: true };
  }
  const licenseLine = fingerprint
    ? `<p style="color:#8a857b;font-size:13px;line-height:1.6">Your unique license code is <b>${esc(fingerprint)}</b>. It identifies your copy without printing your email or IP inside the essay.</p>`
    : '';
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">Your essays are ready 🎉</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        Thanks for your purchase of <b>${esc(itemLabel)}</b> (${amountLabel}).
        Your private reading link is below. Keep this email, the link is yours.
      </p>
      <a href="${accessUrl}" style="display:inline-block;margin:14px 0;background:#7d1d2d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 24px">Read your essays</a>
      ${licenseLine}
      <p style="color:#8a857b;font-size:13px;line-height:1.6">
        A note on how to use them: these essays are for inspiration and learning only.
        Submitting them (or close rewrites) as your own work violates our Terms of Service
        and can carry serious consequences, including rescinded admissions.
      </p>
    </div>`;
  const text =
    `Thanks for your purchase of ${itemLabel} (${amountLabel}). Read your essays at your private link (keep this email, the link is yours):\n\n${accessUrl}\n\n` +
    (fingerprint ? `Your unique license code is ${fingerprint}. It identifies your copy without printing your email or IP inside the essay.\n\n` : '') +
    'A note on how to use them: these essays are for inspiration and learning only. Submitting them (or close rewrites) as your own work violates our Terms of Service and can carry serious consequences, including rescinded admissions.';
  return send(email, `Your Admitfolio purchase: ${itemLabel}`, html, text, {
    from: SELLER_FROM,
    replyTo: SELLER_REPLY_TO,
    // If Resend accepts the message and the server dies before we mark the
    // Purchase delivered, the webhook retry reuses this key instead of sending
    // the buyer a second receipt.
    idempotencyKey: fingerprint ? `purchase-delivery/${fingerprint}` : undefined,
  });
}

// Every email includes a plain-text part alongside the HTML - HTML-only
// messages score noticeably worse with spam filters (university inboxes
// especially), and login codes have to land in the inbox.
async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  opts?: { from?: string; replyTo?: string; idempotencyKey?: string },
): Promise<SendResult> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: opts?.from || FROM_EMAIL,
        to,
        subject,
        html,
        text,
        ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
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
