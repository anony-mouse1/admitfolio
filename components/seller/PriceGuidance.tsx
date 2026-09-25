'use client';

import { useMemo } from 'react';
import { splitRevenueCents } from '@/lib/commerce';
import { checkPrice, MAX_PACKAGE_PRICE, MIN_PRICE, SELLER_SHARE_BPS } from '@/lib/pricing';
import { similarPriceRange, type PricedListing } from '@/lib/similarPrices';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * What a seller would earn at the price they are typing, and what similar live
 * listings charge. Shared by the sell wizard and the dashboard price editor so
 * the two can never disagree.
 *
 * Earnings come from splitRevenueCents, the same function checkout uses, so
 * they are the seller's share before Stripe's fee. The fee is only known once
 * Stripe reports it for a real charge, so it is described, never estimated.
 */
export default function PriceGuidance({
  price,
  essayCount,
  catalog,
  excludeListingId,
}: {
  /** The raw input value, exactly as typed. */
  price: string;
  essayCount: number;
  /** The public catalogue, or null while it has not loaded. */
  catalog: PricedListing[] | null;
  /** The listing being edited, so it is not compared with itself. */
  excludeListingId?: string;
}) {
  const check = checkPrice(price, 'package');
  const earningsCents = check.ok ? splitRevenueCents(check.price * 100).sellerEarningsCents : null;
  const range = useMemo(
    () => (catalog ? similarPriceRange(catalog, essayCount, excludeListingId) : null),
    [catalog, essayCount, excludeListingId],
  );
  const kind = `${excludeListingId ? 'Other live' : 'Live'} ${essayCount}-essay listings`;

  return (
    <>
      <div className={`price-earn${earningsCents == null ? ' empty' : ''}`} aria-live="polite">
        {earningsCents == null ? (
          <div className="price-earn-main">
            Enter a price from ${MIN_PRICE} to ${MAX_PACKAGE_PRICE} to see what you&apos;d earn.
          </div>
        ) : (
          <>
            <div className="price-earn-main">
              You&apos;d earn <b>{dollars(earningsCents)}</b> before Stripe&apos;s card fee, usually around 3% plus 30 cents.
            </div>
            <div className="price-earn-sub">That&apos;s your {SELLER_SHARE_BPS / 100}% share of each sale.</div>
          </>
        )}
      </div>
      {range && (
        <p className="price-market">
          {range.min == null || range.max == null ? (
            <>Not enough {kind.charAt(0).toLowerCase() + kind.slice(1)} yet to show a price range.</>
          ) : (
            <>
              {kind} are priced <b>${range.min} to ${range.max}</b>
              {range.middle && (
                <>, most between <b>${range.middle.low}</b> and <b>${range.middle.high}</b></>
              )}
              . <span className="price-market-count">({range.count} {range.count === 1 ? 'listing' : 'listings'})</span>
            </>
          )}
        </p>
      )}
    </>
  );
}
