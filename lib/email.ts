import { RESEND_API_KEY, FROM_EMAIL, ADMIN_EMAIL } from './config';

// Minimal Resend wrapper (ported from the prototype). Returns {ok, simulated?}.
// When no API key is configured, it logs the code to the server console instead
// of sending - handy for local development.

type SendResult = { ok: boolean; simulated?: boolean; status?: number; detail?: string };

const wineDot = '<span style="color:#7d1d2d">.</span>';

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
  return send(email, `Your Admitfolio verification code: ${code}`, html);
}

// Heads-up to the site owner whenever a seller submits a new listing.
export async function sendSubmissionNotification(info: {
  sellerEmail: string;
  school: string;
  essayCount: number;
  listingId: string;
}): Promise<SendResult> {
  const summary = `${info.school} — ${info.essayCount} essay${info.essayCount === 1 ? '' : 's'}`;
  if (!RESEND_API_KEY) {
    console.log(
      `[email:dev] new submission from ${info.sellerEmail} (${summary}) - would notify ${ADMIN_EMAIL} (no RESEND_API_KEY set)`,
    );
    return { ok: true, simulated: true };
  }
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1b1a17">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio${wineDot}</div>
      <h2 style="margin:22px 0 6px">New essay submission</h2>
      <p style="color:#56524a;font-size:15px;line-height:1.6">
        A seller just submitted a listing that's waiting for review.
      </p>
      <table style="font-size:14px;line-height:1.8;color:#1b1a17">
        <tr><td style="color:#8a857b;padding-right:12px">Seller</td><td>${escapeHtml(info.sellerEmail)}</td></tr>
        <tr><td style="color:#8a857b;padding-right:12px">School</td><td>${escapeHtml(info.school)}</td></tr>
        <tr><td style="color:#8a857b;padding-right:12px">Essays</td><td>${info.essayCount}</td></tr>
        <tr><td style="color:#8a857b;padding-right:12px">Listing</td><td>${escapeHtml(info.listingId)}</td></tr>
      </table>
      <p style="color:#8a857b;font-size:13px;margin-top:16px">Open the admin console to review it.</p>
    </div>`;
  return send(ADMIN_EMAIL, `New essay submission: ${summary}`, html);
}

// Seller emails and school names are user input - keep them inert in HTML email.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
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
