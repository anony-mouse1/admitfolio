import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service · Admitfolio',
  description: 'The terms that govern your use of Admitfolio.',
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <a className="legal-logo" href="/">admitfolio<span className="d"></span></a>
        <a className="legal-back" href="/">&larr; Back to admitfolio</a>
      </header>

      <h1>Terms of Service</h1>
      <p className="legal-date">Effective date: July 13, 2026</p>

      <p>
        Welcome to Admitfolio. These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and
        Admitfolio (&ldquo;Admitfolio,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) and govern your use of
        admitfolio.com and the services we offer there (the &ldquo;Service&rdquo;). By creating an account,
        joining the waitlist, listing an essay, making a purchase, or simply using the site, you agree to
        these Terms and to our <a href="/privacy">Privacy Policy</a>.
      </p>
      <p>
        If you have questions, contact us at <Mail /> or through the contact page on our site.
      </p>

      <h2>1. What Admitfolio is</h2>
      <p>
        Admitfolio is a marketplace where verified college students (&ldquo;Sellers&rdquo;) list their real
        admissions essays, and prospective applicants (&ldquo;Buyers&rdquo;) can browse and purchase access
        to them <b>for inspiration and learning only</b>. Admitfolio is a platform, not a party to the
        exchange of ideas between Sellers and Buyers, and we are not an admissions consultancy, essay
        writing service, or agent of any university.
      </p>

      <h2>2. Who can use Admitfolio</h2>
      <ul>
        <li>
          You must be at least 13 years old to use the Service. If you are under 18, you may only use the
          Service with the consent of a parent or legal guardian.
        </li>
        <li>
          To sell, you must be at least 18 years old, be a current or recent college student, and verify a
          school email address we support (such as a .edu address) using the one-time code we send you.
        </li>
        <li>
          You are responsible for your account: keep your password secure, keep your information accurate,
          and do not share or transfer your account. Tell us right away if you suspect unauthorized use.
        </li>
      </ul>

      <h2>3. Academic integrity comes first</h2>
      <p>
        This section overrides everything else. Essays on Admitfolio exist to show what successful essays
        look like: their structure, voice, and approach. They are <b>not</b> for copying.
      </p>
      <p>You may not:</p>
      <ul>
        <li>
          Submit any essay purchased or viewed on Admitfolio, in whole or in part, as your own work in any
          application, class, or other setting
        </li>
        <li>Paraphrase or lightly rewrite a purchased essay and submit it as your own</li>
        <li>Use the Service to violate any school&rsquo;s honor code or admissions policies</li>
      </ul>
      <p>
        Doing any of these violates these Terms, and we may terminate your account without refund. It can
        also carry serious real-world consequences, including rescinded admissions. Universities
        increasingly use plagiarism and similarity detection on application essays. Please treat the essays
        as what they are: examples, not templates.
      </p>

      <h2>4. Rules for Sellers</h2>
      <p>
        <b>Truthful listings.</b> Every essay you list must be your own original work, actually submitted by
        you in a real application. The schools, prompts, and admission outcomes you report must be accurate.
        One listing corresponds to one application.
      </p>
      <p>
        <b>Review before publication.</b> Every listing is reviewed by our team before it goes live. We may
        approve, reject, or request changes to any listing at our discretion, and we may remove a published
        listing at any time (for example, if we learn a listing is inaccurate or infringing).
      </p>
      <p>
        <b>Pricing.</b> Prices are subject to minimum price floors that we set based on the schools
        involved. We may adjust floor levels over time; changes will not reduce your agreed share of past
        sales.
      </p>
      <p>
        <b>Identity display.</b> You choose how you appear to Buyers: anonymous, first name only, or full
        name. Regardless of your choice, our review team can see your full details, as described in our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>
      <p>
        <b>Getting paid.</b> When purchasing launches, revenue from each sale is split approximately 70/30
        in the Seller&rsquo;s favor. Payouts will be made through a third-party payment processor after a
        purchase clears, subject to any payout schedule, minimum amounts, and verification requirements
        described in your seller dashboard. You are responsible for any taxes on your earnings.
      </p>
      <p>
        <b>What you promise us.</b> By listing an essay, you represent that you wrote it, that you have the
        right to license it, that it does not infringe anyone else&rsquo;s rights, and that it does not
        contain another person&rsquo;s private information shared without their consent.
      </p>

      <h2>5. Who owns the essays</h2>
      <p>
        <b>Sellers keep their copyright.</b> Listing an essay on Admitfolio does not transfer ownership.
        Instead, by listing, you grant Admitfolio a non-exclusive, worldwide license to host, store,
        reproduce, display, excerpt, and market your essay for the purpose of operating and promoting the
        Service, and to deliver it to Buyers who purchase access. You can unlist an essay at any time, which
        ends new sales; Buyers who already purchased access keep the limited license described below.
      </p>
      <p>
        <b>Buyers get a limited license, not ownership.</b> Purchasing an essay gives you a personal,
        non-transferable, non-exclusive license to read it for your own inspiration and education. You may
        not copy, share, publish, resell, distribute, or create derivative works from any essay, and you may
        not submit it as your own work anywhere (see Section 3). The same essay may be purchased by multiple
        Buyers.
      </p>

      <h2>6. Payments and refunds</h2>
      <p>Purchasing is not yet live; this section applies once it launches.</p>
      <p>
        Payments will be processed by Stripe or another third-party payment processor. We never store your
        full card details.
      </p>
      <p>
        Because essays are digital content delivered instantly, <b>all sales are final</b>, with one
        exception: if an essay materially differs from its listing (for example, it is for a different
        school or a different prompt than advertised), report it to us within <b>7 days</b> of purchase and
        we will investigate. If we confirm the listing was misrepresented, we will refund you and take
        action on the listing. We may also issue refunds at our own discretion in other cases, but are not
        obligated to.
      </p>

      <h2>7. What you may not do</h2>
      <p>You may not:</p>
      <ul>
        <li>Upload an essay you did not write, or misstate schools, prompts, or admission results</li>
        <li>
          Create accounts with false information, use another person&rsquo;s school email, or circumvent
          verification
        </li>
        <li>Scrape, harvest, or bulk-download essays or any other content from the Service</li>
        <li>Share your purchased essays or account access with others</li>
        <li>Attempt to contact Sellers or Buyers off-platform to circumvent the marketplace</li>
        <li>
          Interfere with the Service&rsquo;s operation, probe or test its security without permission, or
          use it to send spam
        </li>
        <li>Use the Service for anything unlawful</li>
      </ul>

      <h2>8. Copyright complaints</h2>
      <p>
        If you believe content on Admitfolio infringes your copyright, email us at <Mail /> with the details
        required by the Digital Millennium Copyright Act (DMCA): identification of the work, the infringing
        material&rsquo;s location, your contact information, a good-faith statement, and your signature. We
        will remove infringing material and may terminate repeat infringers&rsquo; accounts.
      </p>

      <h2>9. Termination</h2>
      <p>
        You can stop using the Service or ask us to delete your account at any time. We may suspend or
        terminate your account if you violate these Terms, especially Sections 3, 4, and 7, or if we
        reasonably believe your use poses a risk to the Service or its users. If we terminate your account
        for violations, unpaid amounts owed to you may be withheld where the violation relates to the sales
        in question. Sections that by their nature should survive termination (including licenses already
        granted to Buyers, ownership, disclaimers, and limitation of liability) survive.
      </p>

      <h2>10. Disclaimers</h2>
      <ul>
        <li>
          <b>No admissions outcomes are promised.</b> Essays are examples of what worked for one person
          once. Reading them does not guarantee any admission result, and we make no promises about
          outcomes.
        </li>
        <li>
          <b>We are not affiliated with any university.</b> School names appear only to identify where
          essays were submitted.
        </li>
        <li>
          <b>Listings are Seller-provided.</b> We review listings before publication, but we cannot
          independently verify every claim, and we are not responsible for a Seller&rsquo;s misstatements
          beyond the refund remedy in Section 6.
        </li>
        <li>
          The Service is provided <b>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</b> without
          warranties of any kind, express or implied, including merchantability, fitness for a particular
          purpose, and non-infringement.
        </li>
      </ul>

      <h2>11. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Admitfolio will not be liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from
        your use of the Service. Our total liability for any claim arising out of these Terms or the Service
        is limited to the greater of $100 or the amount you paid us in the 12 months before the claim arose.
        Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        If your violation of these Terms (for example, listing an essay you did not write) leads to a claim
        against Admitfolio by someone else, you agree to cover the reasonable costs and damages we incur as
        a result.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the State of California, without regard to its
        conflict-of-law rules. Before filing any claim, you agree to contact us first and give us 30 days to
        try to resolve the issue informally. Any dispute that cannot be resolved informally will be brought
        in the state or federal courts located in California, and both parties consent to their
        jurisdiction. You may also have rights in small claims court in your own jurisdiction.
      </p>

      <h2>14. Changes to these Terms</h2>
      <p>
        We may update these Terms as the Service evolves (for example, when purchasing launches). If we make
        material changes, we will update the effective date above and notify account holders by email.
        Continued use of the Service after changes take effect means you accept the updated Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms: <Mail /> or the contact page at admitfolio.com.
      </p>
    </main>
  );
}
