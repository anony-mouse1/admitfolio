'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';
import { priceLabel, type CheckoutItem } from '@/lib/publicListing';

// The checkout overlay, lifted out of app/page.tsx so the collection pages can
// open it without sending the buyer to the homepage first.
//
// This is one implementation with two mounts, not a second copy of the payment
// path: the email step, its analytics event, the Stripe mount and every string
// in the dialog live here and nowhere else. What each page keeps is which
// listing is open and what its URL says, because those are the two things that
// genuinely differ. Checkout Started stays with the caller, which is the only
// place that knows whether this is a fresh click or a restore from the URL.

// components/EmbeddedListingCheckout calls loadStripe at module scope, so a
// static import pulls Stripe.js into every page that can reach checkout. That
// was fine when only the homepage could, and is not fine now that six pages
// built for search traffic can. Loading it with the dialog keeps js.stripe.com
// off a page nobody has tried to buy from yet.
const EmbeddedListingCheckout = dynamic(() => import('@/components/EmbeddedListingCheckout'), { ssr: false });

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ListingCheckout({
  open,
  item,
  onClose,
  returnTo = 'listing',
}: {
  open: boolean;
  item: Partial<CheckoutItem>;
  onClose: () => void;
  /**
   * Where closing this dialog actually lands, so the control can say so. The
   * two mounts have different stacks: on a collection page checkout is only
   * reachable from the open sheet, so closing always returns to the listing,
   * while the homepage also opens it straight from a card, where no sheet was
   * ever opened and closing returns to the catalogue. The caller owns its own
   * history, so it is the only thing that knows which of the two this is.
   */
  returnTo?: 'listing' | 'browse';
}) {
  const [error, setError] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  // A new listing, or a reopen, always starts at step 1 with an empty field.
  // app/page.tsx used to do this inline in openBuy.
  useEffect(() => {
    if (!open) return;
    setError('');
    setDeliveryEmail('');
    setEmailConfirmed(false);
  }, [open, item.listingId]);

  function confirmDeliveryEmail() {
    const email = deliveryEmail.trim().toLowerCase();
    if (!emailRe.test(email)) {
      setError('Enter a valid delivery email.');
      return;
    }
    setDeliveryEmail(email);
    setError('');
    // Same property shape as Checkout Started so the stages line up in Vercel.
    // Never the address itself. item is always complete while the modal is
    // open; the fallbacks only satisfy its Partial type.
    trackConversion(ANALYTICS_EVENTS.checkoutEmailSubmitted, {
      school: item.school ?? '',
      value: item.price ?? 0,
    });
    setEmailConfirmed(true);
  }

  // Every string in this dialog lives here, so the two mounts cannot drift.
  const backLabel = returnTo === 'listing' ? 'Back to listing' : 'Back to essays';

  return (
  <div className={`modal-overlay buy-overlay${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="buyTitle" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal buy-modal">
      <button className="modal-close mobile-page-close" aria-label={backLabel} onClick={onClose}>
        <span className="mobile-page-close-icon" aria-hidden="true">&times;</span>
        <span className="mobile-page-back-label" aria-hidden="true">← Back</span>
      </button>
      <section className="buy-order">
        <div className="buy-order-logo"><span>admitfolio</span><i /></div>
        <button className="buy-back" type="button" onClick={onClose}>&larr; {backLabel}</button>
        <div className="modal-eyebrow">Checkout · No account needed</div>
        <h3 id="buyTitle">Unlock this listing</h3>
        <p className="buy-intro">Read the full listing immediately after checkout.</p>
        <div className="buy-summary">
          <div className="buy-summary-essay">
            <div className="buy-summary-school">{item.school || 'This listing'}</div>
            <div className="buy-summary-hook">
              {item.summary || `${item.essayCount || 1} essay${(item.essayCount || 1) === 1 ? '' : 's'} from a verified admit.`}
            </div>
          </div>
          <div className="buy-summary-price">{priceLabel(item.price)}</div>
        </div>
        <div className="buy-total"><span>Total</span><i /><strong>{priceLabel(item.price)}</strong></div>
        <div className="buy-delivery">
          <div><b>✓</b><span>Instant private access after payment</span></div>
          <div><b>✓</b><span>Secure reading link sent to your email</span></div>
          <div><b>✓</b><span>For inspiration only, never for copying</span></div>
        </div>
      </section>

      <section className="buy-payment">
        {!emailConfirmed ? (
          <>
            <div className="modal-eyebrow">Step 1 of 2 · Delivery</div>
            <h4>Where should we send your essays?</h4>
            <p>Confirm the email for your private reading link. Your card or Link account can use a different email.</p>
            <div className="buy-email-field">
              <label htmlFor="deliveryEmail">Delivery email</label>
              <input
                id="deliveryEmail"
                type="email"
                maxLength={254}
                autoComplete="email"
                spellCheck={false}
                value={deliveryEmail}
                onChange={(event) => { setDeliveryEmail(event.target.value); setError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') confirmDeliveryEmail(); }}
                placeholder="you@email.com"
              />
              <small>We will send the receipt and reading link to this exact address.</small>
            </div>
            <div className={`field-error${error ? ' show' : ''}`}>{error || ''}</div>
            <button className="buy-email-continue" type="button" onClick={confirmDeliveryEmail}>
              Continue to secure payment
            </button>
            <div className="buy-secure">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
              Card details are still handled securely by Stripe
            </div>
          </>
        ) : (
          <>
            <div className="modal-eyebrow">Step 2 of 2 · Secure checkout</div>
            <h4>Pay without leaving Admitfolio</h4>
            <p>Stripe shows Link, Apple Pay, or card when each option is available on your device.</p>
            <div className="buy-email-confirmed">
              <span>Delivery to <b>{deliveryEmail}</b></span>
              <button type="button" onClick={() => { setEmailConfirmed(false); setError(''); }}>Change</button>
            </div>
            <div className={`field-error${error ? ' show' : ''}`}>{error || ''}</div>
            <div className="buy-stripe-card">
              <div className="buy-stripe-head">
                <div className="buy-stripe-head-main">
                  <span className="buy-stripe-shield" aria-hidden="true">✓</span>
                  <span><strong>Secure payment</strong><small>Encrypted from end to end</small></span>
                </div>
                <span className="buy-stripe-brand">Powered by Stripe</span>
              </div>
              {open && item.listingId && (
                <EmbeddedListingCheckout
                  key={`${item.listingId}:${deliveryEmail}`}
                  listingId={item.listingId}
                  deliveryEmail={deliveryEmail}
                  school={item.school ?? ''}
                  price={item.price ?? 0}
                  onError={setError}
                />
              )}
            </div>
            <div className="buy-secure">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
              Payments handled by Stripe · Card details never touch our servers
            </div>
          </>
        )}
      </section>
    </div>
  </div>
  );
}
