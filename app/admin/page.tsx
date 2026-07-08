'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from './admin.module.css';

type Essay = {
  id: string;
  prompt: string;
  question: string | null;
  price: number | null;
  wordCount: number | null;
  pdfPath: string | null;
  pdfUrl: string | null;
};
type Listing = {
  id: string;
  school: string;
  gradYear: string | null;
  major: string | null;
  admitTags: string[];
  anonymity: string;
  pricingMode: string;
  packagePrice: number | null;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string | null;
  createdAt: string;
  sellerEmail: string;
};
type ListingFull = Listing & { essays: Essay[] };

type Stage = 'loading' | 'email' | 'code' | 'console';
type Filter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminPage() {
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [listings, setListings] = useState<ListingFull[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  const loadListings = useCallback(async (): Promise<boolean> => {
    const r = await fetch('/api/admin/listings', { credentials: 'same-origin' });
    if (r.status === 401) return false;
    const data = await r.json().catch(() => ({ listings: [] }));
    setListings(data.listings || []);
    return true;
  }, []);

  // On mount, check whether we already have a valid admin session.
  useEffect(() => {
    loadListings().then((ok) => setStage(ok ? 'console' : 'email'));
  }, [loadListings]);

  async function sendCode() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || 'Could not send a code.');
        return;
      }
      setStage('code');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || 'That code is incorrect.');
        return;
      }
      if (!data.admin) {
        setErr('That email is verified but is not an admin.');
        return;
      }
      await loadListings();
      setStage('console');
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    let note: string | undefined;
    if (decision === 'rejected') {
      note = window.prompt('Optional note to the seller (why it was rejected):') || undefined;
    }
    await fetch('/api/admin/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, decision, note }),
    });
    await loadListings();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    setListings([]);
    setEmail('');
    setCode('');
    setStage('email');
  }

  const shown = listings.filter((l) => filter === 'all' || l.status === filter);

  return (
    <div className={styles.page}>
      {stage === 'console' ? (
        <>
          <header className={styles.header}>
            <div className={styles.logo}>
              admitfolio<b>.</b>
              <span className={`${styles.sub} ${styles.serif}`}>review console</span>
            </div>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={logout}>
              Log out
            </button>
          </header>
          <div className={styles.wrap}>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <span className={styles.count}>
                {shown.length} of {listings.length} submission{listings.length === 1 ? '' : 's'}
              </span>
            </div>

            {shown.length === 0 ? (
              <div className={styles.empty}>No submissions{filter === 'all' ? ' yet' : ` marked ${filter}`}.</div>
            ) : (
              shown.map((l) => (
                <div key={l.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div>
                      <h3 className={styles.serif}>
                        {l.school}
                        {l.gradYear ? ` · Class of ${l.gradYear}` : ''}
                      </h3>
                      <div className={styles.who}>
                        {l.sellerEmail}
                        {l.major ? ` · ${l.major}` : ''} · {l.anonymity}
                      </div>
                    </div>
                    <span className={`${styles.status} ${styles[l.status]}`}>{l.status}</span>
                  </div>

                  <div className={styles.meta}>
                    {l.admitTags.length > 0 && (
                      <span className={styles.tag}>
                        Admits: <b>{l.admitTags.join(', ')}</b>
                      </span>
                    )}
                    <span className={styles.tag}>
                      Pricing: <b>{l.pricingMode}</b>
                      {l.packagePrice != null ? ` ($${l.packagePrice})` : ''}
                    </span>
                    <span className={styles.tag}>
                      Submitted: <b>{new Date(l.createdAt).toLocaleDateString()}</b>
                    </span>
                  </div>

                  <div className={styles.essays}>
                    {l.essays.map((e) => (
                      <div key={e.id} className={styles.essayLine}>
                        <span>📄</span>
                        <span>
                          {e.question || e.prompt}
                          {e.price != null ? ` — $${e.price}` : ''}
                          {e.wordCount ? ` · ${e.wordCount} words` : ''}
                          {e.pdfUrl ? (
                            <>
                              {' · '}
                              <a href={e.pdfUrl} target="_blank" rel="noreferrer">
                                View PDF
                              </a>
                            </>
                          ) : (
                            ' · (no PDF uploaded)'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {l.adminNote && (
                    <div className={styles.who} style={{ marginTop: 10 }}>
                      Note: {l.adminNote}
                    </div>
                  )}

                  {l.status === 'pending' && (
                    <div className={styles.actions}>
                      <button className={styles.btn} onClick={() => decide(l.id, 'approved')}>
                        Approve
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnReject}`}
                        onClick={() => decide(l.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className={styles.gate}>
          <h1 className={styles.serif}>Review console</h1>
          {stage === 'loading' && <p>Checking your session…</p>}

          {stage === 'email' && (
            <>
              <p>Sign in with your admin email to review essay submissions.</p>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                spellCheck={false}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && sendCode()}
              />
              <div className={styles.err}>{err}</div>
              <button className={`${styles.btn} ${styles.full}`} disabled={busy || !email} onClick={sendCode}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </>
          )}

          {stage === 'code' && (
            <>
              <p>
                Enter the 6-digit code we sent to <b>{email}</b>.
              </p>
              <input
                className={styles.input}
                type="text"
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && verifyCode()}
              />
              <div className={styles.err}>{err}</div>
              <button className={`${styles.btn} ${styles.full}`} disabled={busy || !code} onClick={verifyCode}>
                {busy ? 'Verifying…' : 'Verify & enter'}
              </button>
              <button
                className={`${styles.btn} ${styles.btnGhost} ${styles.full}`}
                onClick={() => {
                  setStage('email');
                  setErr('');
                  setCode('');
                }}
              >
                ← Use a different email
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
