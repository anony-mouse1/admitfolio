import type { Metadata } from 'next';
import { verifyAccessToken } from '@/lib/accessToken';
import { prisma } from '@/lib/prisma';
import EssayReader from '@/components/EssayReader';
import { ANONYMOUS_LABEL, buyerDisplayName } from '@/lib/anonymity';
import { listingHeadline, parseAdmitTags } from '@/lib/listingSchool';
import { makePurchaseFingerprint } from '@/lib/purchaseFingerprint';
import { SESSION_SECRET } from '@/lib/config';

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

export default async function PurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyAccessToken(token);
  const purchase = verified
    ? await prisma.purchase.findUnique({
        where: { id: verified.purchaseId },
        include: {
          listing: {
            include: {
              essays: { orderBy: { sortOrder: 'asc' } },
              // This page is the one surface reached only with a paid-for token,
              // so it is where "anonymous until bought" turns into a name.
              seller: { select: { name: true } },
            },
          },
        },
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
  const listingTitle = listingHeadline({
    school: purchase.listing.school,
    targetSchool: purchase.listing.targetSchool,
    admitTags: parseAdmitTags(purchase.listing.admitTags),
    applicationSystem: purchase.listing.applicationSystem,
    essays,
  });
  const listingLabel = `${listingTitle} · ${essays.length} essay${essays.length === 1 ? '' : 's'}`;
  // Named only if this seller's choice allows it after a sale. A seller who
  // picked "always anonymous" stays anonymous here too.
  const writtenBy = buyerDisplayName(purchase.listing.anonymity, purchase.listing.seller.name);
  const named = writtenBy !== ANONYMOUS_LABEL;
  const fingerprint = purchase.deliveryFingerprint ||
    makePurchaseFingerprint(purchase.id, purchase.buyerEmail, SESSION_SECRET);

  return (
    <Shell>
      <h1>Your essays</h1>
      <p className="legal-date">{listingLabel}</p>
      <p>
        Thanks for supporting a real student. These essays are for <b>inspiration and learning only</b>,
        never for copying or submitting as your own; see our <a href="/terms">Terms</a>.
      </p>
      {named && (
        <p>
          Written by <b>{writtenBy}</b>. They chose to share their name with buyers, so please keep it
          between you and them.
        </p>
      )}
      <p>
        Each essay is watermarked with your unique license code <b>{fingerprint}</b> and opens here
        for reading. Access is logged so redistributed copies can be traced without printing your
        email or IP in the document.
      </p>
      {essays.map((e) =>
        e.pdfPath ? (
          <EssayReader
            key={e.id}
            essayId={e.id}
            token={token}
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
