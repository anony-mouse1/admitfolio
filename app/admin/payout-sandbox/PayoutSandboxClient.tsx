'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './payoutSandbox.module.css';

type SandboxStatus = {
  configured: boolean;
  state: 'setup_required' | 'verification_in_progress' | 'ready' | 'restricted';
  transfers?: string;
  payouts?: string;
  accountId?: string;
  saleCreated?: boolean;
  transferCreated?: boolean;
  paymentIntentId?: string | null;
  transferId?: string | null;
  grossCents: number;
  platformCents: number;
  sellerCents: number;
  error?: string;
};

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const stateCopy = {
  setup_required: {
    label: 'Setup needed',
    title: 'You made your first sale',
    body: 'Your earnings are waiting. Connect with Stripe to add your identity and bank details.',
  },
  verification_in_progress: {
    label: 'Verification in progress',
    title: 'Stripe is checking your details',
    body: 'Return to Stripe if more information is needed, then refresh this page.',
  },
  ready: {
    label: 'Connected',
    title: 'Payout setup complete',
    body: 'This test seller can now receive transfers through Stripe.',
  },
  restricted: {
    label: 'Action needed',
    title: 'Stripe needs more information',
    body: 'Open Stripe again to see the missing or restricted information.',
  },
} as const;

const PREVIEW_STATUS: SandboxStatus = {
  configured: true,
  state: 'setup_required',
  grossCents: 18_400,
  platformCents: 7_360,
  sellerCents: 11_040,
  saleCreated: false,
  transferCreated: false,
};

export default function PayoutSandboxClient({ preview = false }: { preview?: boolean }) {
  const [status, setStatus] = useState<SandboxStatus | null>(preview ? PREVIEW_STATUS : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (preview) {
      setStatus(PREVIEW_STATUS);
      return;
    }
    setError('');
    const response = await fetch('/api/admin/payout-sandbox/status', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load the payout sandbox.');
    setStatus(body);
  }, [preview]);

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [refresh]);

  async function post(path: string, action: string) {
    setBusy(action);
    setError('');
    try {
      const response = await fetch(path, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'This test step did not finish.');
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This test step did not finish.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function openStripe() {
    if (preview) return;
    const body = await post('/api/admin/payout-sandbox/start', 'stripe');
    if (body?.url) window.location.assign(body.url);
  }

  async function simulateSale() {
    if (preview) return;
    const body = await post('/api/admin/payout-sandbox/simulate-sale', 'sale');
    if (body) await refresh();
  }

  async function reset() {
    if (preview) return;
    const body = await post('/api/admin/payout-sandbox/reset', 'reset');
    if (body) await refresh();
  }

  const copy = stateCopy[status?.state || 'setup_required'];
  const canTransfer = status?.state === 'ready';

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <a href="/admin" className={styles.back}>← Admin</a>
        <div className={styles.brand}>ADMITFOLIO</div>
        <span className={styles.sandboxBadge}>{preview ? 'Visual preview' : 'Stripe test mode'}</span>
      </nav>

      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>ADMIN-ONLY PAYOUT SANDBOX</p>
          <h1>Act as Ritvik</h1>
          <p>
            This mirrors the seller payout flow with synthetic data. Nothing here changes Ritvik’s
            profile, his real sale, the production database, or live Stripe balances.
          </p>
        </div>
        <button className={styles.reset} onClick={reset} disabled={busy !== null || preview}>Start fresh</button>
      </section>

      {!status && !error ? <div className={styles.loading}>Loading the test seller…</div> : null}

      {status ? (
        <div className={styles.layout}>
          <section className={styles.dashboard}>
            <header className={styles.sellerHeader}>
              <div>
                <p className={styles.sellerLabel}>SELLER VIEW</p>
                <h2>Welcome back, Ritvik</h2>
              </div>
              <span className={`${styles.status} ${styles[status.state]}`}>{copy.label}</span>
            </header>

            <div className={styles.stats}>
              <article><span>Total net earnings</span><strong>{money(status.sellerCents)}</strong><small>After Admitfolio fee</small></article>
              <article><span>Pending payout</span><strong>{status.transferCreated ? '$0.00' : money(status.sellerCents)}</strong><small>{status.transferCreated ? 'Sent to Stripe' : copy.label}</small></article>
              <article><span>Total sales</span><strong>1</strong><small>Stanford essay package</small></article>
            </div>

            <article className={styles.actionCard}>
              <div className={styles.actionIcon} aria-hidden="true">{status.state === 'ready' ? '✓' : '1'}</div>
              <div className={styles.actionText}>
                <p>{status.state === 'ready' ? 'YOUR FIRST PAYOUT' : 'YOUR FIRST SALE'}</p>
                <h3>{copy.title}</h3>
                <span>{copy.body}</span>
              </div>
              <button className={styles.primary} onClick={openStripe} disabled={busy !== null || !status.configured || preview}>
                {busy === 'stripe' ? 'Opening…' : status.accountId ? 'Continue in Stripe' : 'Set up my payout'}
              </button>
            </article>

            {!status.configured ? (
              <p className={styles.configError}>
                Add a Stripe test key as STRIPE_SANDBOX_SECRET_KEY before using this on the live site.
              </p>
            ) : null}
            {error ? <p className={styles.configError}>{error}</p> : null}

            <article className={styles.breakdown}>
              <p className={styles.sellerLabel}>SALE BREAKDOWN</p>
              <div><span>Gross sale</span><strong>{money(status.grossCents)}</strong></div>
              <div><span>Admitfolio fee (40%)</span><strong>−{money(status.platformCents)}</strong></div>
              <div className={styles.total}><span>Your earnings (60%)</span><strong>{money(status.sellerCents)}</strong></div>
            </article>
          </section>

          <aside className={styles.lab}>
            <p className={styles.eyebrow}>CODEX DEBUG PANEL</p>
            <h2>Test the whole path</h2>
            <ol className={styles.steps}>
              <li className={status.accountId ? styles.done : ''}><span>1</span><div><strong>Create test connected account</strong><small>Created when you open Stripe.</small></div></li>
              <li className={status.state === 'ready' ? styles.done : ''}><span>2</span><div><strong>Complete Stripe onboarding</strong><small>Use fictional test identity and bank details.</small></div></li>
              <li className={status.saleCreated ? styles.done : ''}><span>3</span><div><strong>Create a fake $184 sale</strong><small>No card is charged. Stripe stays in test mode.</small></div></li>
              <li className={status.transferCreated ? styles.done : ''}><span>4</span><div><strong>Transfer $110.40</strong><small>Runs only after the account is ready.</small></div></li>
            </ol>

            <button
              className={styles.secondary}
              onClick={simulateSale}
              disabled={busy !== null || !status.accountId || !status.configured || preview}
            >
              {busy === 'sale'
                ? 'Running test…'
                : status.transferCreated
                  ? 'Test payout complete'
                  : status.saleCreated && canTransfer
                    ? 'Complete test transfer'
                    : status.saleCreated
                      ? 'Fake sale created'
                      : 'Create fake sale'}
            </button>
            <button className={styles.refresh} onClick={() => refresh().catch((err) => setError(err.message))} disabled={busy !== null || preview}>
              Refresh Stripe status
            </button>

            <div className={styles.details}>
              <div><span>Transfers capability</span><code>{status.transfers || 'not requested'}</code></div>
              <div><span>Bank payouts capability</span><code>{status.payouts || 'not requested'}</code></div>
              <div><span>Test account</span><code>{status.accountId || 'not created'}</code></div>
              <div><span>Test payment</span><code>{status.paymentIntentId || 'not created'}</code></div>
              <div><span>Test transfer</span><code>{status.transferId || 'not created'}</code></div>
            </div>

            <div className={styles.help}>
              <strong>What to enter in Stripe</strong>
              <p>Use fictional information only. Stripe marks the page as test mode and accepts its standard test bank details.</p>
              <a href="https://docs.stripe.com/connect/testing" target="_blank" rel="noreferrer">Open Stripe’s test guide ↗</a>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
