import { RESEND_API_KEY, FROM_EMAIL } from './config';

// Minimal Resend wrapper (ported from the prototype). Returns {ok, simulated?}.
// When no API key is configured, it logs the code to the server console instead
// of sending — handy for local development.

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
