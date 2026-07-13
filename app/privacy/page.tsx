import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy · Admitfolio',
  description: 'How Admitfolio collects, uses, and protects your information.',
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <a className="legal-logo" href="/">admitfolio<span className="d"></span></a>
        <a className="legal-back" href="/">&larr; Back to admitfolio</a>
      </header>

      <h1>Privacy Policy</h1>
      <p className="legal-date">Effective date: July 13, 2026</p>

      <p>
        Admitfolio (&ldquo;Admitfolio,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates admitfolio.com, a
        marketplace where verified college students share their real admissions essays and prospective
        applicants browse them for inspiration. This policy explains what information we collect, how we use
        it, and the choices you have. We keep it in plain language on purpose.
      </p>
      <p>
        If you have any questions, contact us at <Mail /> or through the contact page on our site.
      </p>

      <h2>1. Information we collect</h2>
      <h3>Information you give us</h3>
      <p><b>If you join the waitlist:</b> your email address.</p>
      <p>
        <b>If you sell essays:</b> we collect your school email address (used to verify current or recent
        enrollment via a one-time code), a password, the schools you were admitted to, the essays you upload
        as PDF files, your listing details (essay prompts, pricing, and an optional note to our review team),
        and your display preference (anonymous, first name only, or full name).
      </p>
      <p>
        <b>If you buy essays (when purchasing launches):</b> your email address and your order history.
        Payments will be processed by Stripe, a third-party payment processor. Card numbers and full payment
        details go directly to Stripe and are never stored on our servers. Stripe&rsquo;s handling of your
        information is described in Stripe&rsquo;s own privacy policy.
      </p>
      <p><b>If you contact us:</b> whatever you choose to include in your message.</p>
      <h3>Information collected automatically</h3>
      <p>
        We use Vercel Web Analytics and Speed Insights to understand site traffic and performance. These
        tools are designed to be privacy-friendly: they do not use cookies and do not track visitors across
        websites. Data is aggregated (for example, page views and country-level location) and visitor
        identifiers are anonymized and short-lived.
      </p>
      <p>
        Our hosting provider also keeps standard server logs (such as IP address, browser type, and pages
        requested) for security and debugging.
      </p>

      <h2>2. Cookies</h2>
      <p>
        We only use essential cookies: a session cookie that keeps you signed in to your seller account, and
        a similar cookie for our internal admin console. We do not use advertising or cross-site tracking
        cookies.
      </p>

      <h2>3. About the essays themselves</h2>
      <p>
        Admissions essays are personal by nature. They may describe your background, experiences, family,
        health, or other sensitive topics. Before you upload an essay, please understand:
      </p>
      <ul>
        <li>
          Every listing is reviewed by our team before it goes live. Our reviewers can see your essay, your
          name, your school email, and your note to the review team.
        </li>
        <li>
          You control how you appear to buyers: fully anonymous, first name only, or full name. We do not
          reveal more than the option you choose.
        </li>
        <li>
          Buyers who purchase your essay will be able to read its full contents, including any personal
          details you left in the text. We recommend removing anything you would not want a stranger to read.
        </li>
      </ul>

      <h2>4. How we use your information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Verify that sellers are current or recent college students</li>
        <li>Create and secure your account (passwords are stored hashed, never in plain text)</li>
        <li>Review, publish, and manage essay listings</li>
        <li>Process purchases and pay sellers their share (when purchasing launches)</li>
        <li>Send transactional emails such as verification codes and account notices (via Resend, our email provider)</li>
        <li>Let waitlist members know when essays go live</li>
        <li>Understand aggregate site usage and keep the site fast and secure</li>
        <li>Comply with legal obligations</li>
      </ul>
      <p>
        We do not sell your personal information, and we do not share it with third parties for their own
        advertising.
      </p>

      <h2>5. Who we share information with</h2>
      <p>We share information only with the service providers that make the site run:</p>
      <ul>
        <li>
          <b>Supabase</b> hosts our database and stores uploaded essay PDFs in a private storage bucket that
          is not publicly accessible
        </li>
        <li><b>Vercel</b> hosts the website and provides the cookieless analytics described above</li>
        <li><b>Resend</b> delivers our transactional emails, such as verification codes</li>
        <li><b>Stripe</b> will process payments when purchasing launches</li>
      </ul>
      <p>
        These providers process data on our behalf under their own security and privacy commitments. Beyond
        that, we only disclose personal information if required by law, to protect the rights and safety of
        our users or others, or as part of a business transaction such as a merger or acquisition (in which
        case this policy would continue to apply until updated).
      </p>

      <h2>6. Data retention</h2>
      <p>
        We keep your information for as long as your account is active or as needed to provide the service.
        If you delete your account or ask us to delete your data, we remove your personal information and
        uploaded essays within 30 days, except where we need to keep limited records for legal, tax, or
        fraud-prevention purposes. Waitlist emails are kept until you unsubscribe or the waitlist is retired.
      </p>

      <h2>7. Security</h2>
      <p>
        Essay files live in a private storage bucket, passwords are hashed, seller verification uses one-time
        codes that expire after use, and access to listings before publication is limited to our review team.
        No online service can promise perfect security, but we design with data protection in mind and limit
        what we collect in the first place.
      </p>

      <h2>8. Your choices and rights</h2>
      <p>You can:</p>
      <ul>
        <li><b>Access or update</b> your account information by signing in to your seller dashboard</li>
        <li><b>Unlist an essay</b> at any time from your dashboard</li>
        <li><b>Delete your account and data</b> by contacting us at the email above</li>
        <li><b>Unsubscribe</b> from waitlist emails using the link in any email we send</li>
      </ul>
      <p>
        Depending on where you live, you may have additional legal rights over your personal information,
        such as the right to know what we hold about you, to correct it, or to request deletion. To exercise
        any of these, email us and we will respond within the timeframe required by applicable law. We will
        never treat you differently for exercising a privacy right.
      </p>

      <h2>9. Children</h2>
      <p>
        Admitfolio is not directed to children under 13, and we do not knowingly collect personal information
        from anyone under 13. Selling on Admitfolio requires current or recent college enrollment. If you
        believe a child under 13 has provided us personal information, contact us and we will delete it.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        If we make meaningful changes to this policy, we will update the effective date above and, for
        significant changes, notify account holders by email. Continued use of the site after changes take
        effect means you accept the updated policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions, concerns, or requests: <Mail /> or the contact page at admitfolio.com.
      </p>
    </main>
  );
}
