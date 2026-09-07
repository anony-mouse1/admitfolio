'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

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
        setError(message);
        onError(message);
        throw checkoutError;
      } finally {
        setLoading(false);
      }
    })();

    return requestRef.current;
  }, [listingId, deliveryEmail, onError, reportPaymentLoaded]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
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
      {!error && (
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
      {error && <div className="embedded-checkout-error" role="alert">{error}</div>}
    </div>
  );
}
