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
  appliedMajors: string | null;
  admitTags: string[];
  anonymity: string;
  pricingMode: string;
  packagePrice: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'removed'; // removed = seller take-down
  adminNote: string | null;
  sellerNote: string | null;
  createdAt: string;
  sellerEmail: string;
  isTest: boolean; // seller is an admin/test account - dummy data, not a real student
};
type ListingFull = Listing & { essays: Essay[] };

type Stage = 'loading' | 'email' | 'console';
type Filter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminPage() {
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  async function passwordLogin() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || 'Incorrect email or password.');
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
    setPassword('');
    setStage('email');
  }

  const shown = listings.filter((l) => filter === 'all' || l.status === filter);

  // Group by seller so it's obvious which submissions belong to the same
  // person (order of first appearance is preserved - newest sellers first).
  const sellerGroups: { email: string; isTest: boolean; items: ListingFull[] }[] = [];
  for (const l of shown) {
    const g = sellerGroups.find((s) => s.email === l.sellerEmail);
    if (g) g.items.push(l);
    else sellerGroups.push({ email: l.sellerEmail, isTest: l.isTest, items: [l] });
  }

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
              sellerGroups.map((g) => (
                <section key={g.email} className={styles.sellerGroup}>
                  <div className={styles.sellerHead}>
                    <span className={styles.sellerEmail}>
                      {g.isTest && <span className={styles.testBadge}>TEST</span>}
                      {g.email}
                    </span>
                    <span className={styles.sellerCounts}>
                      {g.items.length} listing{g.items.length === 1 ? '' : 's'} ·{' '}
                      {g.items.reduce((n, l) => n + l.essays.length, 0)} essay
                      {g.items.reduce((n, l) => n + l.essays.length, 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  {g.items.map((l) => (
                <div key={l.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div>
                      <h3 className={styles.serif}>
                        {l.school}
                        {l.gradYear ? ` · Class of ${l.gradYear}` : ''}
                      </h3>
                      <div className={styles.who}>
                        {l.major ? `${l.major} · ` : ''}{l.anonymity}
                      </div>
                    </div>
                    <span className={`${styles.status} ${styles[l.status] || styles.rejected}`}>{l.status}</span>
                  </div>

                  <div className={styles.meta}>
                    {l.admitTags.length > 0 && (
                      <span className={styles.tag}>
                        Admits: <b>{l.admitTags.join(', ')}</b>
                      </span>
                    )}
                    {l.appliedMajors && (
                      <span className={styles.tag}>
                        Applied in: <b>{l.appliedMajors}</b>
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
                          {e.price != null ? ` · $${e.price}` : ''}
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

                  {l.sellerNote && (
                    <div className={styles.who} style={{ marginTop: 10 }}>
                      Seller&apos;s note: <b>{l.sellerNote}</b>
                    </div>
                  )}

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
                  ))}
                </section>
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
              <p>Sign in with your admin email and password to review essay submissions.</p>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                spellCheck={false}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className={styles.input}
                type="password"
                placeholder="Password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && email && password && passwordLogin()}
              />
              <div className={styles.err}>{err}</div>
              <button
                className={`${styles.btn} ${styles.full}`}
                disabled={busy || !email || !password}
                onClick={passwordLogin}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
