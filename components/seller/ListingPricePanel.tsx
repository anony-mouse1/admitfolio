'use client';

import { useState } from 'react';
import styles from './SellerApplicationsWorkspace.module.css';
import type { SellerApplicationListing } from './sellerApplicationsCore';

export type ListingPriceSave = {
  listingId: string;
  packagePrice?: number;
  essayPrices?: Record<string, number>;
};

// Whole dollars, matching the Int columns behind packagePrice and Essay.price.
const MAX_PACKAGE_PRICE = 399;
const MAX_ESSAY_PRICE = 99;
const WHOLE_DOLLARS = 'Whole dollars only, no cents.';

/**
 * The price editor for one listing, rendered inside the row it belongs to.
 *
 * It used to be part of a card that rendered after the entire workspace, so
 * pressing Edit appeared to do nothing: the controls existed, far below the
 * button, with no scroll into view.
 */
export default function ListingPricePanel({
  listing,
  onClose,
  onSave,
}: {
  listing: SellerApplicationListing;
  onClose: () => void;
  onSave: (payload: ListingPriceSave) => Promise<string | null>;
}) {
  const isPackage = listing.pricingMode === 'package';
  const max = isPackage ? MAX_PACKAGE_PRICE : MAX_ESSAY_PRICE;
  const [pkgInput, setPkgInput] = useState(listing.packagePrice != null ? String(listing.packagePrice) : '');
  const [essayInputs, setEssayInputs] = useState<Record<string, string>>(
    Object.fromEntries(listing.essays.map((essay) => [essay.id, essay.price != null ? String(essay.price) : ''])),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function priceProblem(value: string): string | null {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount < listing.priceFloor) return `Minimum for your tier is $${listing.priceFloor}.`;
    if (!Number.isInteger(amount)) return `${WHOLE_DOLLARS} Round to the nearest dollar.`;
    if (amount > max) return `The most you can charge is $${max}.`;
    return null;
  }

  async function save() {
    const payload: ListingPriceSave = { listingId: listing.id };
    if (isPackage) {
      const problem = priceProblem(pkgInput);
      if (problem) { setError(problem); return; }
      payload.packagePrice = parseFloat(pkgInput);
    } else {
      const prices: Record<string, number> = {};
      for (const essay of listing.essays) {
        const problem = priceProblem(essayInputs[essay.id] || '');
        if (problem) { setError(problem); return; }
        prices[essay.id] = parseFloat(essayInputs[essay.id]);
      }
      payload.essayPrices = prices;
    }
    setError('');
    setSaving(true);
    const failure = await onSave(payload);
    setSaving(false);
    if (failure) setError(failure);
    else onClose();
  }

  const added = new Date(listing.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className={styles.listingPanel} aria-label={`${listing.title} controls`}>
      <div className={styles.panelHead}>
        <strong>{isPackage ? 'Package price' : 'Price each essay'}</strong>
        <span>
          {listing.sales} {listing.sales === 1 ? 'sale' : 'sales'} · Added {added}
        </span>
      </div>

      {isPackage ? (
        <div className={styles.priceRow}>
          <input
            type="number"
            min={listing.priceFloor}
            max={max}
            step={1}
            value={pkgInput}
            aria-label="Package price in dollars"
            onChange={(event) => { setPkgInput(event.target.value); setError(''); }}
          />
          <span>{`$${listing.priceFloor} to $${max}, whole dollars`}</span>
        </div>
      ) : (
        listing.essays.map((essay) => (
          <div className={styles.priceRow} key={essay.id}>
            <input
              type="number"
              min={listing.priceFloor}
              max={max}
              step={1}
              value={essayInputs[essay.id] || ''}
              aria-label={`Price for ${essay.label} in dollars`}
              onChange={(event) => {
                setEssayInputs((prev) => ({ ...prev, [essay.id]: event.target.value }));
                setError('');
              }}
            />
            <span>{essay.label.slice(0, 48)}</span>
          </div>
        ))
      )}

      {error && <div className={styles.panelError} role="alert">{error}</div>}

      <div className={styles.panelActions}>
        <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save price'}
        </button>
        <button className={styles.secondaryButton} type="button" disabled={saving} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
