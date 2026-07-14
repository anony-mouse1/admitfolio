import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { makeAccessToken } from '@/lib/accessToken';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Payment received · Admitfolio',
  robots: { index: false, follow: false },
};

// Stripe redirects here after payment. The webhook usually lands first and
// has already recorded the purchase; if it hasn't yet, the email arrives in
// a minute either way.
export default async function SuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const sid = String(searchParams?.session_id || '');
  const purchase = sid
    ? await prisma.purchase.findUnique({ where: { stripeSessionId: sid } })
    : null;

  return (
    <main className="legal-page">
      <header className="legal-head">
        <a className="legal-logo" href="/">admitfolio<span className="d"></span></a>
        <a className="legal-back" href="/">&larr; Back to admitfolio</a>
      </header>
      <h1>Payment received 🎉</h1>
      {purchase ? (
        <>
          <p>
            Your purchase of <b>{purchase.itemLabel || 'your essays'}</b> is confirmed. A receipt with
            your private reading link is on its way to <b>{purchase.buyerEmail}</b>.
          </p>
          <p>
            <a href={`/purchase/${makeAccessToken(purchase.id)}`}><b>Read your essays now &rarr;</b></a>
          </p>
        </>
      ) : (
        <p>
          Your payment went through. We&apos;re preparing your essays right now - a receipt with your
          private reading link will land in your inbox within a couple of minutes.
        </p>
      )}
      <p>
        Remember: essays on Admitfolio are for <b>inspiration and learning only</b>, never for copying;
        see our <a href="/terms">Terms</a>.
      </p>
    </main>
  );
}
