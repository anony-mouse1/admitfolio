import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service · Admitfolio',
  description: 'Admitfolio terms of service.',
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <a className="legal-logo" href="/">admitfolio<span className="d"></span></a>
        <a className="legal-back" href="/">&larr; Back to admitfolio</a>
      </header>

      <h1>Terms of Service</h1>
      <p className="legal-date">Coming soon</p>

      <p>
        We&rsquo;re finalizing our Terms of Service and will publish them here before essays go on sale. The
        short version of what they&rsquo;ll say: essays on Admitfolio are for inspiration and learning, never
        for copying or submitting as your own; sellers must be verified students listing their own work; and
        we review every listing before it goes live.
      </p>
      <p>
        Questions in the meantime? Reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and
        see our <a href="/privacy">Privacy Policy</a> for how we handle your information.
      </p>
    </main>
  );
}
