import type { Metadata } from 'next';
import { verifyAccessToken } from '@/lib/accessToken';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your essays · Admitfolio',
  robots: { index: false, follow: false },
};

const SIGNED_URL_TTL_S = 60 * 60;

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
  const paths = essays.filter((e) => e.pdfPath).map((e) => e.pdfPath as string);
  const { data: signed } = paths.length
    ? await supabaseAdmin.storage.from(ESSAYS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));

  return (
    <Shell>
      <h1>Your essays</h1>
      <p className="legal-date">{purchase.itemLabel || purchase.listing.school}</p>
      <p>
        Thanks for supporting a real student. These essays are for <b>inspiration and learning only</b>,
        never for copying or submitting as your own; see our <a href="/terms">Terms</a>.
      </p>
      <ul>
        {essays.map((e) => {
          const url = e.pdfPath ? urlByPath.get(e.pdfPath) : null;
          return (
            <li key={e.id}>
              {e.question || e.prompt}
              {' · '}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">Open PDF</a>
              ) : (
                <span>PDF unavailable, contact us</span>
              )}
            </li>
          );
        })}
      </ul>
      <p>
        Download links refresh each time you open this page, so bookmark <b>this page</b> (or keep your
        purchase email) rather than the PDF links themselves.
      </p>
    </Shell>
  );
}
