// Admitfolio, minimal zero-dependency backend for .edu email verification.
//
// Run:
//   RESEND_API_KEY=re_xxx FROM_EMAIL="Admitfolio <onboarding@yourdomain.com>" node server.js
//
// Without a verified domain on Resend you can use the sandbox sender
// "onboarding@resend.dev", it only delivers to the email of the Resend
// account owner, which is perfect for testing with your own address.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Admitfolio <onboarding@resend.dev>';
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';
// Where review-by-email notifications go (you). Set ADMIN_EMAIL in .env.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
// Who can sign into the admin console. Admin access = "this verified email is
// one of these" — proven by the same email-code (OTP) flow sellers use, not a
// shared password. Comma-separated via ADMIN_EMAILS in .env. Empty by default:
// no one can enter the console until you configure it (never hard-code an inbox).
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);
// Secret used to sign the admin session cookie. Set a real random value via env
// in production; the stable default just keeps dev sessions alive across restarts.
const SESSION_SECRET = process.env.SESSION_SECRET || 'admitly-dev-session-secret-change-me';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // admin session lasts 30 days
const SESSION_COOKIE = 'admitly_session';
// DEV-ONLY: a fixed login code for local testing. When set, /api/send-code skips
// the real email and this code always verifies. Leave UNSET in production — a
// fixed code that anyone knows is a backdoor. Off by default (empty string).
const DEV_LOGIN_CODE = process.env.DEV_LOGIN_CODE || '';
const isAdminEmail = (e) => ADMIN_EMAILS.has(String(e).trim().toLowerCase());
// Base URL used to build the approve/reject links in review emails.
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8000}`;
const ESSAYS_DIR = path.join(__dirname, 'essays');   // uploaded PDFs live here (git-ignored)
const MAX_ESSAY_BYTES = 8 * 1024 * 1024;             // 8 MB per PDF
const CODE_TTL_MS = 10 * 60 * 1000;   // codes valid for 10 minutes
const MAX_ATTEMPTS = 5;

// email -> { code, expires, attempts }
const codes = new Map();

const eduRe = /^[^@\s]+@[^@\s]+\.edu$/i;
// Test allowlist, non-.edu addresses accepted for testing (Resend sandbox
// only delivers to the account owner's email). Set via TEST_EMAILS in .env,
// comma-separated. REMOVE this mechanism before launch.
const TEST_EMAILS = new Set(
  (process.env.TEST_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);
const emailAllowed = (e) => eduRe.test(e) || TEST_EMAILS.has(e.toLowerCase()) || isAdminEmail(e);
const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, maxBytes = 1e5) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > maxBytes) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function sendEmail(to, code) {
  if (!RESEND_API_KEY) {
    // No key configured, log to console so local testing still works.
    console.log(`\n[no RESEND_API_KEY] verification code for ${to}: ${code}\n`);
    return { ok: true, simulated: true };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your Admitfolio verification code: ${code}`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:32px;color:#1b1a17">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span></div>
          <p style="font-size:15px;line-height:1.6;color:#56524a;margin-top:24px">Enter this code to verify your student email and start selling your essays:</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:.18em;background:#f3f1ec;border-radius:14px;padding:18px;text-align:center;margin:18px 0">${code}</div>
          <p style="font-size:13px;color:#8a857b;line-height:1.6">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
        </div>`,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, detail };
  }
  return { ok: true };
}

// Emails the buyer their essay + receipt after checkout. Note: this only ever
// receives the email + essay info — card details are validated in the browser
// and never sent here. Swap in a real processor (Stripe, like Stan) before
// charging real cards.
async function sendPurchaseEmail(to, school, price) {
  if (!RESEND_API_KEY) {
    console.log(`\n[no RESEND_API_KEY] would email the ${school} essay to ${to}\n`);
    return { ok: true, simulated: true };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your Admitfolio essay${school ? ` — ${school}` : ''} is ready`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:32px;color:#1b1a17">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span></div>
          <p style="font-size:15px;line-height:1.6;color:#56524a;margin-top:24px">Thanks for your purchase! Your ${school || 'admit'} essay — with the full text, stats &amp; margin notes — is unlocked and ready to read.</p>
          <div style="background:#f3f1ec;border-radius:14px;padding:18px;margin:18px 0;font-size:14px;color:#56524a">
            <strong>${school || 'Admit essay'}</strong><br>
            Amount paid: ${price || '—'}
          </div>
          <p style="font-size:13px;color:#8a857b;line-height:1.6">This email is your receipt. Just reply if anything looks off.</p>
        </div>`,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, detail };
  }
  return { ok: true };
}

// "Log into your account" CTA button — the ?login=1 deep-link opens the site
// with the seller login popped up. `label` lets each email tailor the wording.
function loginButton(label) {
  return `
    <div style="margin:22px 0 6px">
      <a href="${BASE_URL}/?login=1" style="display:inline-block;background:#7d1d2d;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:999px">${label}</a>
    </div>`;
}

// Sent to the SELLER right after they submit — confirms it's received & under review.
async function sendSubmissionReceiptEmail(to, school) {
  if (!RESEND_API_KEY) {
    console.log(`\n[no RESEND_API_KEY] would email submission receipt to ${to}\n`);
    return { ok: true, simulated: true };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `We got your Admitfolio submission ✅`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:32px;color:#1b1a17">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span></div>
          <p style="font-size:15px;line-height:1.6;color:#56524a;margin-top:24px">Thanks for submitting your ${school || 'essay'} listing! Every essay is <b>manually reviewed</b> by our team to keep quality high. We'll email you as soon as it's approved — usually within 2 business days.</p>
          <p style="font-size:15px;line-height:1.6;color:#56524a">In the meantime, log into your account to track your listing's status.</p>
          ${loginButton('Log into your account')}
          <p style="font-size:13px;color:#8a857b;line-height:1.6">Questions? Just reply to this email.</p>
        </div>`,
    }),
  });
  if (!resp.ok) { const detail = await resp.text().catch(() => ''); return { ok: false, status: resp.status, detail }; }
  return { ok: true };
}

// Notifies a seller when you approve or reject their listing.
async function sendDecisionEmail(to, school, approved, note) {
  const subject = approved
    ? `Your Admitfolio listing is approved 🎉`
    : `An update on your Admitfolio listing`;
  const body = approved
    ? `Good news — your ${school || 'essay'} listing passed review and is now live on Admitfolio. Buyers can find it right away. We'll email you the moment it makes its first sale.`
    : `Thanks for submitting your ${school || 'essay'} listing. After review, we're not able to publish it as-is${note ? `: ${note}` : '.'} You're welcome to make changes and resubmit anytime.`;
  const cta = approved
    ? loginButton('Log in to view your listing')
    : loginButton('Log in to edit & resubmit');
  if (!RESEND_API_KEY) {
    console.log(`\n[no RESEND_API_KEY] would email ${approved ? 'APPROVAL' : 'rejection'} to ${to}\n`);
    return { ok: true, simulated: true };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:32px;color:#1b1a17">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span></div>
          <p style="font-size:15px;line-height:1.6;color:#56524a;margin-top:24px">${body}</p>
          ${cta}
          <p style="font-size:13px;color:#8a857b;line-height:1.6">Questions? Just reply to this email.</p>
        </div>`,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, detail };
  }
  return { ok: true };
}

// Emails YOU (ADMIN_EMAIL) when a new listing arrives: the essay PDF(s) are
// attached so you can read on your phone, plus one-tap approve/reject links.
async function sendReviewEmail(rec, pdfs) {
  const schools = (rec.admittedSchools || []).join(', ') || rec.university || 'a seller';
  const approveUrl = `${BASE_URL}/review?id=${rec.id}&token=${rec.reviewToken}&decision=approve`;
  const rejectUrl  = `${BASE_URL}/review?id=${rec.id}&token=${rec.reviewToken}&decision=reject`;
  if (!RESEND_API_KEY) {
    console.log(`\n[no RESEND_API_KEY] new submission ${rec.id} from ${rec.email}\n  approve: ${approveUrl}\n  reject:  ${rejectUrl}\n`);
    return { ok: true, simulated: true };
  }
  const attachments = (pdfs || []).map((p, i) => ({ filename: `essay-${i + 1}.pdf`, content: p.toString('base64') }));
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `📥 New essay submission — ${schools}`,
      attachments,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#1b1a17">
          <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span> <span style="color:#8a857b;font-size:13px;font-weight:600">new submission</span></div>
          <table style="width:100%;font-size:14px;color:#56524a;margin-top:20px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#8a857b">Seller</td><td style="padding:4px 0"><b>${rec.email || '—'}</b></td></tr>
            <tr><td style="padding:4px 0;color:#8a857b">Currently at</td><td style="padding:4px 0">${rec.university || '—'}</td></tr>
            <tr><td style="padding:4px 0;color:#8a857b">Admits</td><td style="padding:4px 0">${schools}</td></tr>
            <tr><td style="padding:4px 0;color:#8a857b">Tier / price</td><td style="padding:4px 0">${rec.tier || '—'} · ${rec.pricingMode === 'Separate' ? 'per-essay' : '$' + (rec.price || '—')}</td></tr>
            <tr><td style="padding:4px 0;color:#8a857b">Application</td><td style="padding:4px 0">${rec.applicationSystem || '—'}</td></tr>
            <tr><td style="padding:4px 0;color:#8a857b">Name shown</td><td style="padding:4px 0">${rec.anonMode || '—'}</td></tr>
          </table>
          <p style="font-size:13px;color:#8a857b;margin:14px 0 4px">${(rec.files || []).length} essay PDF(s) attached below. Review, then:</p>
          <div style="margin:20px 0">
            <a href="${approveUrl}" style="display:inline-block;background:#7d1d2d;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;margin-right:10px">✓ Approve &amp; notify seller</a>
            <a href="${rejectUrl}" style="display:inline-block;background:#fff;color:#c0392b;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;border:1px solid #e7c9c5">✕ Reject</a>
          </div>
          <p style="font-size:12px;color:#b8b3aa;line-height:1.5">For a rejection note, use the console at ${BASE_URL}/admin instead.</p>
        </div>`,
    }),
  });
  if (!resp.ok) { const detail = await resp.text().catch(() => ''); return { ok: false, status: resp.status, detail }; }
  return { ok: true };
}

// --- Listing storage helpers (listings.json is the source of truth) ---
const LISTINGS_FILE = path.join(__dirname, 'listings.json');
function readListings() {
  try { const l = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); return Array.isArray(l) ? l : []; }
  catch { return []; }
}
function writeListings(list) {
  try { fs.writeFileSync(LISTINGS_FILE, JSON.stringify(list, null, 2)); return true; }
  catch (e) { console.error('[listing] write failed', e); return false; }
}
// --- Admin session (stateless, HMAC-signed cookie) ---
// The cookie is `base64url(JSON{email,exp}).hmacSHA256`. It's issued only after
// an admin email verifies a 6-digit code, and trusted only while the signature
// checks out, it hasn't expired, and the email is still an admin.
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function signSession(payloadB64) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
}
function makeSession(email) {
  const payload = b64url(JSON.stringify({ email: String(email).toLowerCase(), exp: Date.now() + SESSION_TTL_MS }));
  return `${payload}.${signSession(payload)}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = signSession(payload);
  // Constant-time compare; guard against length mismatch (timingSafeEqual throws otherwise).
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
  if (!isAdminEmail(data.email)) return null;
  return data.email;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  const secure = /^https:/i.test(BASE_URL) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
}
function clearSessionCookie(res) {
  const secure = /^https:/i.test(BASE_URL) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}
// Admin auth — a valid signed session cookie for an admin email.
function isAdmin(req) {
  return !!verifySession(parseCookies(req)[SESSION_COOKIE]);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };

const server = http.createServer(async (req, res) => {
  // --- API ---
  if (req.method === 'POST' && req.url === '/api/send-code') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const email = String(body.email || '').trim();
    if (!emailAllowed(email)) return json(res, 400, { error: 'Please enter a valid .edu email address.' });

    const code = DEV_LOGIN_CODE || sixDigits();
    codes.set(email.toLowerCase(), { code, expires: Date.now() + CODE_TTL_MS, attempts: 0 });
    if (DEV_LOGIN_CODE) {
      console.log(`[dev] DEV_LOGIN_CODE active — code for ${email} is ${DEV_LOGIN_CODE} (no email sent)`);
      return json(res, 200, { ok: true, simulated: true, dev: true });
    }
    const result = await sendEmail(email, code);
    if (!result.ok) {
      console.error('Resend error', result.status, result.detail);
      return json(res, 502, { error: 'Could not send the email right now. Please try again.' });
    }
    return json(res, 200, { ok: true, simulated: !!result.simulated });
  }

  if (req.method === 'POST' && req.url === '/api/notify') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const email = String(body.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });

    const file = path.join(__dirname, 'waitlist.json');
    let list = [];
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no file yet */ }
    if (!Array.isArray(list)) list = [];
    const already = list.some(e => (e.email || '').toLowerCase() === email.toLowerCase());
    if (!already) {
      list.push({ email, at: new Date().toISOString() });
      try { fs.writeFileSync(file, JSON.stringify(list, null, 2)); }
      catch (e) { console.error('waitlist write failed', e); return json(res, 500, { error: 'Could not save right now. Please try again.' }); }
    }
    console.log(`[waitlist] ${email}${already ? ' (already on list)' : ''} — ${list.length} total`);
    return json(res, 200, { ok: true, already });
  }

  if (req.method === 'POST' && req.url === '/api/verify-code') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const entry = codes.get(email);
    if (!entry) return json(res, 400, { error: 'Request a new code first.' });
    if (Date.now() > entry.expires) { codes.delete(email); return json(res, 400, { error: 'That code expired, request a new one.' }); }
    if (entry.attempts >= MAX_ATTEMPTS) { codes.delete(email); return json(res, 429, { error: 'Too many attempts, request a new code.' }); }
    entry.attempts++;
    if (code !== entry.code) return json(res, 400, { error: 'That code is incorrect.' });
    codes.delete(email);
    // Admin emails get a 30-day signed session cookie; everyone else just verifies.
    if (isAdminEmail(email)) { setSessionCookie(res, makeSession(email)); return json(res, 200, { ok: true, admin: true }); }
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && req.url === '/api/purchase') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const email = String(body.email || '').trim();
    const school = String(body.school || 'this essay').trim();
    const price = String(body.price || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });

    const result = await sendPurchaseEmail(email, school, price);
    if (!result.ok) {
      console.error('Resend error', result.status, result.detail);
      return json(res, 502, { error: 'Could not email the essay right now. Please try again.' });
    }
    console.log(`[purchase] ${school} (${price || 'n/a'}) → ${email}`);
    return json(res, 200, { ok: true, simulated: !!result.simulated });
  }

  if (req.method === 'POST' && req.url === '/api/submit-listing') {
    let body;
    try { body = await readBody(req, MAX_ESSAY_BYTES * 6 + 5e5); } catch { return json(res, 400, { error: 'Submission too large. Please keep each PDF under 8 MB.' }); }

    // Assign an id + review status, stamp server-side time.
    const id = 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    body.id = id;
    body.status = 'pending';          // pending → approved / rejected
    body.submittedAt = new Date().toISOString();
    body.reviewedAt = null;
    body.reviewToken = crypto.randomBytes(16).toString('hex');  // authorizes email approve/reject links

    // Decode + store each uploaded PDF (sent as base64 data by the browser).
    // Files live in essays/<id>/ and are only served to the admin console.
    body.files = [];
    const pdfBuffers = [];
    const uploads = Array.isArray(body.uploads) ? body.uploads : [];
    if (uploads.length) {
      const dir = path.join(ESSAYS_DIR, id);
      try {
        fs.mkdirSync(dir, { recursive: true });
        uploads.forEach((u, i) => {
          const b64 = String(u.data || '').replace(/^data:[^,]*,/, '');
          const buf = Buffer.from(b64, 'base64');
          if (!buf.length || buf.length > MAX_ESSAY_BYTES) return;
          const fname = `essay-${i + 1}.pdf`;
          fs.writeFileSync(path.join(dir, fname), buf);
          body.files.push({ n: i + 1, name: u.name || fname, stored: fname });
          pdfBuffers.push(buf);
        });
      } catch (e) { console.error('[listing] essay save failed', e); }
    }
    delete body.uploads;   // don't keep the base64 blobs in listings.json

    const list = readListings();
    list.push(body);
    writeListings(list);
    console.log(`[listing] saved ${id} from ${body.email || 'unknown'} (${body.files.length} PDF${body.files.length === 1 ? '' : 's'}) — status pending`);

    // Email you the submission + PDFs + approve/reject links (never blocks the response).
    sendReviewEmail(body, pdfBuffers)
      .then(r => console.log(`[review] notify ${r.ok ? (r.simulated ? 'simulated' : 'sent') : 'FAILED'} for ${id}`))
      .catch(e => console.error('[review] notify error', e.message));
    // Email the SELLER a "we got it, it's under review" receipt.
    const sellerSchool = (body.admittedSchools && body.admittedSchools[0]) || body.university || '';
    sendSubmissionReceiptEmail(body.email, sellerSchool)
      .then(r => console.log(`[receipt] seller ${r.ok ? (r.simulated ? 'simulated' : 'sent') : 'FAILED'} for ${id}`))
      .catch(e => console.error('[receipt] error', e.message));

    // Forward metadata to Google Sheets too, if a webhook is configured.
    // (PDFs are never sent to Sheets — only to the local admin console.)
    if (SHEETS_WEBHOOK_URL) {
      try {
        const { files, ...meta } = body;
        const resp = await fetch(SHEETS_WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(meta), redirect: 'follow',
        });
        console.log(`[listing] Sheets save status ${resp.status} for ${body.email || 'unknown'}`);
      } catch (e) { console.error('[listing] Sheets webhook failed:', e.message); }
    }
    return json(res, 200, { ok: true, saved: true, id });
  }

  // ===== Admin review console API (session-cookie–gated) =====
  {
    const url = new URL(req.url, 'http://localhost');

    // Ends the admin session by clearing the cookie.
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/admin/listings' && req.method === 'GET') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized.' });
      return json(res, 200, { ok: true, listings: readListings() });
    }

    // Streams an uploaded PDF to the admin console (auth via session cookie).
    if (url.pathname === '/api/admin/essay' && req.method === 'GET') {
      if (!isAdmin(req)) { res.writeHead(401); return res.end('Unauthorized'); }
      const id = (url.searchParams.get('id') || '').replace(/[^A-Za-z0-9]/g, '');
      const n  = (url.searchParams.get('n')  || '').replace(/[^0-9]/g, '');
      const filePath = path.join(ESSAYS_DIR, id, `essay-${n}.pdf`);
      if (!filePath.startsWith(ESSAYS_DIR) || !fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline' });
      return res.end(fs.readFileSync(filePath));
    }

    if (url.pathname === '/api/admin/decision' && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized.' });
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
      const { id, decision, note } = body;
      if (decision !== 'approve' && decision !== 'reject') return json(res, 400, { error: 'decision must be approve or reject.' });
      const list = readListings();
      const rec = list.find(r => r.id === id);
      if (!rec) return json(res, 404, { error: 'Listing not found.' });
      rec.status = decision === 'approve' ? 'approved' : 'rejected';
      rec.reviewedAt = new Date().toISOString();
      if (note) rec.reviewNote = note;
      writeListings(list);
      const school = (rec.admittedSchools && rec.admittedSchools[0]) || rec.university || '';
      const mail = await sendDecisionEmail(rec.email, school, decision === 'approve', note);
      console.log(`[admin] ${id} → ${rec.status}; email ${mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'FAILED'} to ${rec.email}`);
      return json(res, 200, { ok: true, status: rec.status, emailed: mail.ok, emailSimulated: !!mail.simulated });
    }
  }

  // ===== One-tap approve/reject from the review email (token-authed) =====
  if (req.url.split('?')[0] === '/review' && req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const decision = url.searchParams.get('decision');
    const page = (title, msg, color) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:14vh auto;text-align:center;padding:32px;color:#1b1a17"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">admitfolio<span style="color:#7d1d2d">.</span></div><h2 style="color:${color};margin:22px 0 8px">${title}</h2><p style="color:#56524a;font-size:15px;line-height:1.6">${msg}</p><a href="${BASE_URL}/admin" style="display:inline-block;margin-top:16px;color:#7d1d2d;font-weight:700;text-decoration:none">Open the full review console →</a></div>`;
    const list = readListings();
    const rec = list.find(r => r.id === id);
    if (!rec || !token || token !== rec.reviewToken) {
      res.writeHead(rec ? 403 : 404, { 'Content-Type': 'text/html' });
      return res.end(page('Link invalid', 'This review link is invalid or has expired.', '#c0392b'));
    }
    if (decision !== 'approve' && decision !== 'reject') {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      return res.end(page('Invalid action', 'Use the Approve or Reject button from the email.', '#c0392b'));
    }
    if (rec.status !== 'pending') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page('Already reviewed', `This listing was already <b>${rec.status}</b>.`, '#8a6d00'));
    }
    rec.status = decision === 'approve' ? 'approved' : 'rejected';
    rec.reviewedAt = new Date().toISOString();
    writeListings(list);
    const school = (rec.admittedSchools && rec.admittedSchools[0]) || rec.university || '';
    const mail = await sendDecisionEmail(rec.email, school, decision === 'approve');
    console.log(`[review] ${id} → ${rec.status} via email link; seller email ${mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'FAILED'}`);
    const approved = decision === 'approve';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(page(
      approved ? 'Approved ✓' : 'Rejected',
      `${rec.email} has been notified that their listing was ${approved ? 'approved and is now live' : 'not accepted'}.`,
      approved ? '#1c7c43' : '#c0392b'
    ));
  }

  // --- Static files ---
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/admin') urlPath = '/admin.html';
  const filePath = path.join(__dirname, path.normalize(urlPath));
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end('Forbidden'); }

  // Only serve known web assets, and never expose secrets, server code, raw
  // submission data, or the essays folder. Everything else 404s.
  const base = path.basename(filePath);
  const ext = path.extname(filePath);
  const ALLOWED_EXT = new Set(['.html', '.js', '.css', '.png', '.svg', '.ico', '.jpg', '.jpeg', '.woff', '.woff2']);
  const BLOCKED = new Set(['server.js', 'sheets-webhook.gs', 'listings.json', 'waitlist.json', 'package.json', 'package-lock.json']);
  const inEssays = filePath === ESSAYS_DIR || filePath.startsWith(ESSAYS_DIR + path.sep);
  if (base.startsWith('.') || BLOCKED.has(base) || inEssays || !ALLOWED_EXT.has(ext)) {
    res.writeHead(404); return res.end('Not found');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, max-age=0', // always serve fresh during development
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Admitfolio running at http://127.0.0.1:${PORT}`);
  console.log(RESEND_API_KEY ? 'Email: Resend (live)' : 'Email: NOT configured, codes will print to this console');
});
