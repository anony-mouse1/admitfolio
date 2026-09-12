'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

// Stripe.js allows exactly ONE Embedded Checkout object per page, and
// `destroy()` returns void rather than a promise, so the teardown cannot be
// awaited by anyone: not by us and not by @stripe/react-stripe-js.
//
// That is the whole of the "multiple Embedded Checkout objects" bug.
// EmbeddedCheckoutProvider's cleanup calls destroy() and React mounts the
// replacement in the SAME commit, so the new createEmbeddedCheckoutPage lands
// while the previous object is still tearing down. Stripe throws
// IntegrationError, and because the throw happens inside the library's own
// promise chain, which has no catch, nothing reaches our error state: the card
// sits on "Loading secure checkout" for ever with nothing shown.
//
// Every remount path arrives at the same place, so they are not separate bugs:
//   - the buyer edits the address, so the listingId:email key changes
//   - the modal is closed and reopened
//   - browser Back leaves checkout and the buyer returns
//   - the listing changes under an open dialog (the homepage URL sync)
//   - React StrictMode double invokes effects in development
//
// So this owns the lifecycle instead of patching each path. One module scoped
// queue serialises every create and destroy on the page, a create can never
// overlap a teardown, and every failure is caught and surfaced rather than
// left hanging.
let liveCheckout: StripeEmbeddedCheckout | null = null;
let queue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  // The queue has to survive a failed job, or one error would wedge checkout
  // for the rest of the page's life.
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function releaseSlot(): Promise<void> {
  if (!liveCheckout) return;
  try {
    liveCheckout.destroy();
  } catch {
    // Already destroyed. Releasing the slot is the only thing that matters.
  }
  liveCheckout = null;
  // destroy() is void and Stripe removes its iframe asynchronously, so yield a
  // macrotask before anyone is allowed to create the next one.
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

type EmbeddedListingCheckoutProps = {
  listingId: string;
  deliveryEmail: string;
  // Analytics only: the same short school name and dollar price that Checkout
  // Started sent, so the payment stage groups with it in Vercel.
  school: string;
  price: number;
  onError: (message: string) => void;
};

export default function EmbeddedListingCheckout({
  listingId,
  deliveryEmail,
  school,
  price,
  onError,
}: EmbeddedListingCheckoutProps) {
  const requestRef = useRef<Promise<string> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Set when /api/checkout itself fails, so the mount handler below does not
  // replace a real message ("Too many attempts. Please wait a minute.") with a
  // generic one.
  const apiErrorRef = useRef('');
  // The payment stage needs two things that arrive in either order: Stripe's
  // iframe inside the wrapper, and a client secret back from /api/checkout.
  // Stripe.js attaches the iframe within milliseconds of initialising, before
  // the POST returns, so the iframe alone would count sessions that never
  // existed. The secret alone would count buyers whose Stripe.js never loaded.
  // Report once, when both are true. A failed POST never sets `secret`, so it
  // never fires. Stripe's own onAnalyticsEvent callback would report this
  // directly, but that is a private preview this account is not enrolled in.
  const paymentStage = useRef({ secret: false, frame: false, reported: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reportPaymentLoaded = useCallback(() => {
    const stage = paymentStage.current;
    if (stage.reported || !stage.secret || !stage.frame) return;
    stage.reported = true;
    trackConversion(ANALYTICS_EVENTS.checkoutPaymentLoaded, { school, value: price });
  }, [school, price]);

  const fetchClientSecret = useCallback(() => {
    if (requestRef.current) return requestRef.current;

    requestRef.current = (async () => {
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, deliveryEmail }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          clientSecret?: string;
          error?: string;
        };
        if (!response.ok || !data.clientSecret) {
          throw new Error(data.error || 'Could not load secure checkout. Please try again.');
        }
        paymentStage.current.secret = true;
        reportPaymentLoaded();
        return data.clientSecret;
      } catch (checkoutError) {
        const message = checkoutError instanceof Error
          ? checkoutError.message
          : 'Could not load secure checkout. Please try again.';
        apiErrorRef.current = message;
        setError(message);
        onError(message);
        throw checkoutError;
      } finally {
        setLoading(false);
      }
    })();

    return requestRef.current;
  }, [listingId, deliveryEmail, onError, reportPaymentLoaded]);

  // Read through a ref so a change of callback identity can never remount
  // Stripe. A new session needs a new component instance, and the caller
  // already guarantees that by keying this on listingId and the address.
  const fetchRef = useRef(fetchClientSecret);
  fetchRef.current = fetchClientSecret;

  useEffect(() => {
    if (!stripePromise) return undefined;
    let cancelled = false;

    runExclusive(async () => {
      await releaseSlot();
      if (cancelled) return;
      const stripe = await stripePromise;
      if (!stripe || cancelled) return;
      const instance = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: () => fetchRef.current(),
      });
      const host = hostRef.current;
      if (cancelled || !host) {
        instance.destroy();
        return;
      }
      liveCheckout = instance;
      instance.mount(host);
    }).catch((mountError: unknown) => {
      if (cancelled) return;
      // The API message, when there is one, is the useful one. An
      // IntegrationError is for us, not for the buyer.
      console.error('embedded checkout mount failed:', mountError);
      if (apiErrorRef.current) {
        setLoading(false);
        return;
      }
      const message = 'Could not load secure checkout. Please try again.';
      setError(message);
      onError(message);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      runExclusive(releaseSlot);
    };
    // A new session requires a new component instance, so this runs once per
    // instance by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const observer = new MutationObserver(() => {
      if (!wrap.querySelector('iframe')) return;
      observer.disconnect();
      paymentStage.current.frame = true;
      reportPaymentLoaded();
    });
    observer.observe(wrap, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [reportPaymentLoaded]);

  if (!stripePromise) {
    return (
      <div className="embedded-checkout-error" role="alert">
        Payments need one final configuration step before this checkout can open.
      </div>
    );
  }

  return (
    <div className="embedded-checkout-wrap" ref={wrapRef}>
      {loading && !error && (
        <div className="embedded-checkout-loading" role="status">
          <span aria-hidden="true" />
          Loading secure checkout…
        </div>
      )}
      {/* Always rendered. Unmounting the host while Stripe still owns the node
          is what turns a recoverable error into a broken iframe. */}
      <div className="embedded-checkout-host" ref={hostRef} />
      {error && <div className="embedded-checkout-error" role="alert">{error}</div>}
    </div>
  );
}
