'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import LogoBadge from '@/components/LogoBadge';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';
import { priceLabel, type CheckoutItem } from '@/lib/publicListing';
import { schoolColor, schoolInfo } from '@/lib/schools';

// The checkout overlay, lifted out of app/page.tsx so the collection pages can
// open it without sending the buyer to the homepage first.
//
// This is one implementation with two mounts, not a second copy of the payment
// path: the email step, its analytics event, the Stripe mount and every string
// in the dialog live here and nowhere else. What each page keeps is which
// listing is open and what its URL says, because those are the two things that
// genuinely differ. Checkout Started stays with the caller, which is the only
// place that knows whether this is a fresh click or a restore from the URL.
//
// ONE SCREEN. This used to be "Step 1 of 2 · Delivery" and "Step 2 of 2 ·
// Secure checkout", with an order panel roughly 750px tall above the field. On
// a 390px phone that put the submit button at y 847 in an 844px viewport, off
// the bottom of the screen, behind a restatement of the detail sheet the buyer
// had just read. Measured, not inferred. Since 7 Sep that step has taken 37
// unlock clicks down to 2 email submissions.
//
// So the order panel is one row, and the payment card is present from first
// paint with its header. Stripe mounts inside the card that is already there,
// which is why nothing above it moves when the address validates.

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
}: {
  open: boolean;
  item: Partial<CheckoutItem>;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  // The normalised address the Stripe session is built for. Empty until one
  // validates. This is what decides whether Stripe is mounted, and it is the
  // only thing that keys the mount, so the number of /api/checkout calls is the
  // number of DISTINCT valid addresses committed, never the number of blurs.
  // Refocusing, tabbing away, autocorrect and autofill all re-commit the same
  // normalised string and so cannot open a second session.
  const [confirmedEmail, setConfirmedEmail] = useState('');
  // Checkout Email Submitted has to stay comparable with the numbers measured
  // under the two-step flow, so it reports once per distinct address rather
  // than once per commit. Editing an address and going back to an earlier one
  // does not report it twice.
  const reportedEmails = useRef<Set<string>>(new Set());

  // A new listing, or a reopen, always starts empty.
  // app/page.tsx used to do this inline in openBuy.
  useEffect(() => {
    if (!open) return;
    setError('');
    setDeliveryEmail('');
    setConfirmedEmail('');
    reportedEmails.current.clear();
  }, [open, item.listingId]);

  // Commit, not "submit". There is no button to press: this runs when the field
  // loses focus or the buyer presses Enter. Never on keystroke, because that
  // would both report a half-typed address and open a Stripe session per pause.
  //
  // Reaching the Stripe form requires moving focus out of this input, which
  // fires blur, so the mounted session can never belong to an address the field
  // has since been edited past without the buyer seeing the error below.
  // The value comes from the event, not from state. Closing over deliveryEmail
  // meant a blur arriving in the same tick as the value change, which is what
  // autofill and password managers do, read the previous value and committed
  // nothing.
  const commitDeliveryEmail = useCallback((raw: string) => {
    const email = raw.trim().toLowerCase();
    // An empty field is someone who has not started, not someone who got it
    // wrong. Nagging on the blur of an untouched input is hostile.
    if (!email) {
      setError('');
      return;
    }
    if (!emailRe.test(email)) {
      setError('Enter a valid delivery email.');
      return;
    }
    setDeliveryEmail(email);
    setError('');
    // Same property shape as Checkout Started so the stages line up in Vercel.
    // Never the address itself. item is always complete while the modal is
    // open; the fallbacks only satisfy its Partial type.
    if (!reportedEmails.current.has(email)) {
      reportedEmails.current.add(email);
      trackConversion(ANALYTICS_EVENTS.checkoutEmailSubmitted, {
        school: item.school ?? '',
        value: item.price ?? 0,
      });
    }
    setConfirmedEmail(email);
  }, [item.school, item.price]);

  const info = schoolInfo(item.school || '');
  const label = info ? info.short : (item.school || 'This listing');
  const essayCount = item.essayCount || 1;
  const mounted = Boolean(open && item.listingId && confirmedEmail);

  return (
  <div className={`modal-overlay buy-overlay${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="buyTitle" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal buy-modal">
      <button className="modal-close mobile-page-close" aria-label="Back to essays" onClick={onClose}>
        <span className="mobile-page-close-icon" aria-hidden="true">&times;</span>
        <span className="mobile-page-back-label" aria-hidden="true">← Back</span>
      </button>
      <section className="buy-order">
        {/* The dialog still needs a name. It used to be an h3 the size of a
            billboard; the line itself is what the collapse removed, not the
            label a screen reader announces. */}
        <h3 id="buyTitle" className="sr-only">Unlock this listing</h3>
        <button className="buy-back" type="button" onClick={onClose}>← Back to listing</button>
        <div className="buy-order-row">
          <LogoBadge
            domain={info ? info.domain : undefined}
            letter={(label[0] || 'A').toUpperCase()}
            color={schoolColor(item.school || '')}
            school={item.school || ''}
            size={40}
            fontSize={17}
          />
          <div className="buy-order-main">
            <div className="buy-order-school">{label}</div>
            <div className="buy-order-meta">
              {essayCount} essay{essayCount === 1 ? '' : 's'} · one price for the {essayCount === 1 ? 'essay' : 'set'}
            </div>
            {/* Same publicListingTitle string the card and the sheet show, at
                the same 120 character cap. Two lines, clamped, because this is
                a reminder of what they picked rather than the pitch again. */}
            {item.summary && <div className="buy-order-hook">{item.summary}</div>}
          </div>
          <div className="buy-order-price">{priceLabel(item.price)}</div>
        </div>
      </section>

      <section className="buy-payment">
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
            onBlur={(event) => commitDeliveryEmail(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDeliveryEmail(event.currentTarget.value); } }}
            placeholder="you@email.com"
          />
          <small>Where your reading link goes. Your card can use a different address.</small>
        </div>
        <div className={`field-error${error ? ' show' : ''}`}>{error || ''}</div>

        <div className="buy-stripe-card">
          <div className="buy-stripe-head">
            <div className="buy-stripe-head-main">
              <span className="buy-stripe-shield" aria-hidden="true">✓</span>
              <span>
                <strong>Secure payment</strong>
                {/* This line is the whole promise that no second screen is
                    coming, so it says what the empty card is waiting for rather
                    than a generic reassurance. It swaps rather than stacking:
                    a second line would cost about 16px above the fold. */}
                <small>{mounted ? 'Encrypted from end to end' : 'Card form loads here once you add your email'}</small>
              </span>
            </div>
            <span className="buy-stripe-brand">Powered by Stripe</span>
          </div>
          <div className="buy-stripe-body">
            {mounted ? (
              <EmbeddedListingCheckout
                key={`${item.listingId}:${confirmedEmail}`}
                listingId={item.listingId as string}
                deliveryEmail={confirmedEmail}
                school={item.school ?? ''}
                price={item.price ?? 0}
                onError={setError}
              />
            ) : (
              // Decorative. The header small above carries the same message to
              // a screen reader, so announcing it twice would be noise.
              <div className="buy-stripe-idle" aria-hidden="true">
                <div className="buy-ghost-row"><i /><i /><i /></div>
                <div className="buy-ghost" />
                <div className="buy-ghost buy-ghost-short" />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  </div>
  );
}
