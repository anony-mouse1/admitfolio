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
// paint with its header and its own Continue control. Stripe mounts inside the
// card that is already there, which is why nothing above it moves when the
// buyer continues.

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
  // The normalised address that has been committed on blur. It drives the
  // analytics event and enables the button below. It does NOT mount Stripe.
  const [confirmedEmail, setConfirmedEmail] = useState('');
  // The address Stripe is actually mounted for. Only a deliberate click sets
  // this.
  //
  // Mounting on blur created a real Checkout Session every time the field lost
  // focus with a valid address, and Stripe Link texts a verification code to
  // anyone whose number is on a Link account. A returning buyer was getting an
  // SMS for tabbing past the field, before deciding to buy. The live logs show
  // pairs of sessions seconds apart from typo corrections, which is also what
  // made the 8 per minute per IP throttle reachable in testing.
  const [mountedEmail, setMountedEmail] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Checkout Email Submitted has to stay comparable with the numbers measured
  // under the two-step flow, so it reports once per distinct address rather
  // than once per commit. Editing an address and going back to an earlier one
  // does not report it twice. This is unchanged by the move to a click.
  const reportedEmails = useRef<Set<string>>(new Set());

  // A new listing, or a reopen, always starts empty.
  // app/page.tsx used to do this inline in openBuy.
  useEffect(() => {
    if (!open) return;
    setError('');
    setDeliveryEmail('');
    setConfirmedEmail('');
    setMountedEmail('');
    reportedEmails.current.clear();
  }, [open, item.listingId]);

  // Commit, not "submit". Runs when the field loses focus or the buyer presses
  // Enter. Never on keystroke, because that would report a half-typed address.
  // Reports the event and nothing else: it creates no Stripe session.
  //
  // The value comes from the event, not from state. Closing over deliveryEmail
  // meant a blur arriving in the same tick as the value change, which is what
  // autofill and password managers do, read the previous value and committed
  // nothing.
  const commitDeliveryEmail = useCallback((raw: string): string => {
    const email = raw.trim().toLowerCase();
    // An empty field is someone who has not started, not someone who got it
    // wrong. Nagging on the blur of an untouched input is hostile.
    if (!email) {
      setError('');
      return '';
    }
    if (!emailRe.test(email)) {
      setError('Enter a valid delivery email.');
      return '';
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
    // An address that differs from the mounted one retires that mount, so the
    // buyer can never pay on a session built for an address the field has since
    // been edited past. They click again, which is one deliberate act per
    // session by construction.
    setMountedEmail((current) => (current && current !== email ? '' : current));
    return email;
  }, [item.school, item.price]);

  // The only thing that creates a Stripe Checkout Session. Reads the live input
  // rather than state, so "type then click" works without depending on blur
  // landing first.
  const startPayment = useCallback(() => {
    const raw = inputRef.current?.value ?? '';
    const email = commitDeliveryEmail(raw);
    if (!email) {
      // commitDeliveryEmail stays silent on an empty field because it also runs
      // on blur, and nagging an untouched input is hostile. A click is a
      // deliberate ask, so an empty field gets the same message a malformed one
      // does. Silence plus a moved cursor reads as a dead button.
      if (!raw.trim()) setError('Enter a valid delivery email.');
      inputRef.current?.focus();
      return;
    }
    setMountedEmail(email);
  }, [commitDeliveryEmail]);

  const proofPanel = (
    <>
      <h4 className="buy-proof-h">Before you pay, how this listing got here</h4>
      <ol className="buy-proof-list">
        <li>
          <div className="buy-proof-copy">
            <strong>The seller proved a college email</strong>
            <span>Accounts are made with a .edu address and confirmed by a code sent to it.</span>
          </div>
        </li>
        <li>
          <div className="buy-proof-copy">
            <strong>A review panel read the essays</strong>
            <span>Every submission is screened before anyone sees it. Anything the panel is unsure about is held back.</span>
          </div>
        </li>
        <li>
          <div className="buy-proof-copy">
            <strong>A person made the final call</strong>
            <span>No listing goes live on an automated decision alone. Someone approved this one by hand.</span>
          </div>
        </li>
        <li>
          <div className="buy-proof-copy">
            <strong>Your copy is yours</strong>
            <span>Every page carries a code tied to your purchase, so a leaked copy traces back.</span>
          </div>
        </li>
      </ol>
    </>
  );

  // One source of truth for validity, derived on every render from the live
  // field. The tick and the control's state both read this, so the signal and
  // the button can never disagree. Computing validity is not the same as acting
  // on it: nothing here reports an event or mounts anything.
  const emailIsValid = emailRe.test(deliveryEmail.trim().toLowerCase());

  const info = schoolInfo(item.school || '');
  const label = info ? info.short : (item.school || 'This listing');
  const essayCount = item.essayCount || 1;
  const mounted = Boolean(open && item.listingId && mountedEmail);

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
          </div>
          <div className="buy-order-price">{priceLabel(item.price)}</div>
        </div>
        {/* Same publicListingTitle string the card and the sheet show, at the
            same 120 character cap. Full width under the row rather than beside
            the badge: sharing that line box with the close button gutter made
            it wrap early and cost about 40px above the fold. */}
        {item.summary && <div className="buy-order-hook">{item.summary}</div>}
        {/* Desktop only. On a phone the same panel renders below the payment
            card instead, so it survives the Stripe mount. Two layouts, not one
            responsive rule. */}
        <div className="buy-proof buy-proof-desktop">{proofPanel}</div>
      </section>

      <section className="buy-payment">
        <div className="buy-email-field">
          <label htmlFor="deliveryEmail">Delivery email</label>
          <div className={`buy-email-input${emailIsValid ? ' ok' : ''}`}>
            <input
              id="deliveryEmail"
              type="email"
              maxLength={254}
              autoComplete="email"
              spellCheck={false}
              ref={inputRef}
              value={deliveryEmail}
              onChange={(event) => { setDeliveryEmail(event.target.value); setError(''); }}
              onBlur={(event) => commitDeliveryEmail(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); startPayment(); } }}
              placeholder="you@email.com"
            />
            {/* Decorative. The control's aria-disabled below carries the same
                state to a screen reader, and a tick that announced itself on
                every keystroke would be noise. */}
            {emailIsValid && <span className="buy-email-tick" aria-hidden="true">✓</span>}
          </div>
          <small>Where your reading link goes. Your card can use a different address.</small>
        </div>
        <div className={`field-error${error ? ' show' : ''}`}>{error || ''}</div>

        {/* Directly under the field, where the buyer's eye already is after
            typing. It used to sit inside the payment card, which meant looking
            away to a mostly empty panel to find the next step.
            aria-disabled rather than disabled: the state tracks the same
            validity the tick does, but the control still takes the click so an
            empty or malformed field is told why instead of going dead. */}
        {!mounted && (
          <button
            className="buy-start-payment"
            type="button"
            aria-disabled={!emailIsValid}
            onClick={startPayment}
          >
            Continue to payment
          </button>
        )}

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
                <small>{mounted ? 'Encrypted from end to end' : 'Card form opens here, you stay on this screen'}</small>
              </span>
            </div>
            <span className="buy-stripe-brand">Powered by Stripe</span>
          </div>
          <div className="buy-stripe-body">
            {mounted ? (
              <EmbeddedListingCheckout
                key={`${item.listingId}:${mountedEmail}`}
                listingId={item.listingId as string}
                deliveryEmail={mountedEmail}
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

        {/* Phone only, and deliberately outside the card so it survives the
            Stripe mount. Someone who commits an address and then hesitates at
            the card form is exactly who this is for. Desktop keeps its copy in
            the left column. */}
        <div className="buy-proof buy-proof-mobile">{proofPanel}</div>

        <ul className="buy-ticks">
          <li>Your reading link arrives by email in under a minute and works for a year.</li>
          <li>For inspiration only, never for copying.</li>
        </ul>
      </section>
    </div>
  </div>
  );
}
