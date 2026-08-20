'use client';

import { useCallback, useRef, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type EmbeddedListingCheckoutProps = {
  listingId: string;
  onError: (message: string) => void;
};

export default function EmbeddedListingCheckout({ listingId, onError }: EmbeddedListingCheckoutProps) {
  const requestRef = useRef<Promise<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchClientSecret = useCallback(() => {
    if (requestRef.current) return requestRef.current;

    requestRef.current = (async () => {
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          clientSecret?: string;
          error?: string;
        };
        if (!response.ok || !data.clientSecret) {
          throw new Error(data.error || 'Could not load secure checkout. Please try again.');
        }
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
  }, [listingId, onError]);

  if (!stripePromise) {
    return (
      <div className="embedded-checkout-error" role="alert">
        Payments need one final configuration step before this checkout can open.
      </div>
    );
  }

  return (
    <div className="embedded-checkout-wrap">
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
