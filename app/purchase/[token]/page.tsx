import type { Metadata } from 'next';
import { verifyAccessToken } from '@/lib/accessToken';
import { prisma } from '@/lib/prisma';
import EssayReader from '@/components/EssayReader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your essays · Admitfolio',
  robots: { index: false, follow: false },
  // The access token is in this page's own URL, so never let it ride out in a
  // Referer header to anything this page loads or links to. Browsers default to
  // trimming the path cross-origin; this does not depend on that default.
  referrer: 'no-referrer',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <a className="legal-logo" href="/">admitfolio<span className="d"></span></a>
        <a className="legal-back" href="/">&larr; Back to admitfolio</a>
      </header>
      {children}
    </main>
  );
}

export default async function PurchasePage({ params }: { params: { token: string } }) {
  const verified = verifyAccessToken(params.token);
  const purchase = verified
    ? await prisma.purchase.findUnique({
        where: { id: verified.purchaseId },
        include: { listing: { include: { essays: { orderBy: { sortOrder: 'asc' } } } } },
      })
    : null;

  if (!purchase || !purchase.listing) {
    return (
      <Shell>
        <h1>Link not recognized</h1>
        <p>
          This reading link is invalid or has expired. Check that you opened the exact link from your
          purchase email, and if it still fails, reply to that email and we&apos;ll sort it out.
        </p>
      </Shell>
    );
  }

  const essays = purchase.listing.essays;

  return (
    <Shell>
      <h1>Your essays</h1>
      <p className="legal-date">{purchase.itemLabel || purchase.listing.school}</p>
      <p>
        Thanks for supporting a real student. These essays are for <b>inspiration and learning only</b>,
        never for copying or submitting as your own; see our <a href="/terms">Terms</a>.
      </p>
      <p>
        Each essay is watermarked with your email (<b>{purchase.buyerEmail}</b>) and opens here for
        reading. Reads are logged.
      </p>
      {essays.map((e) =>
        e.pdfPath ? (
          <EssayReader
            key={e.id}
            essayId={e.id}
            token={params.token}
            label={e.question || e.prompt}
          />
        ) : (
          <p key={e.id}>
            {e.question || e.prompt} · PDF unavailable, contact us
          </p>
        ),
      )}
      <p>
        Bookmark <b>this page</b> (or keep your purchase email) to come back to these essays.
      </p>
    </Shell>
  );
}
