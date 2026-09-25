'use client';

import { useState } from 'react';
import styles from './SellerApplicationsWorkspace.module.css';
import type { SellerApplicationListing } from './sellerApplicationsCore';
import PriceGuidance from './PriceGuidance';
import { checkPrice, MAX_ESSAY_PRICE, MAX_PACKAGE_PRICE, MIN_PRICE } from '@/lib/pricing';
import type { PricedListing } from '@/lib/similarPrices';

export type ListingPriceSave = {
  listingId: string;
  packagePrice?: number;
  essayPrices?: Record<string, number>;
};

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
  catalogPrices = null,
}: {
  listing: SellerApplicationListing;
  onClose: () => void;
  onSave: (payload: ListingPriceSave) => Promise<string | null>;
  /** The public catalogue, for the similar-listings range. Null until loaded. */
  catalogPrices?: PricedListing[] | null;
}) {
  const isPackage = listing.pricingMode === 'package';
  const max = isPackage ? MAX_PACKAGE_PRICE : MAX_ESSAY_PRICE;
  const [pkgInput, setPkgInput] = useState(listing.packagePrice != null ? String(listing.packagePrice) : '');
  const [essayInputs, setEssayInputs] = useState<Record<string, string>>(
    Object.fromEntries(listing.essays.map((essay) => [essay.id, essay.price != null ? String(essay.price) : ''])),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // A package price is checked as it is typed, like the sell wizard. Per-essay
  // rows are checked on save, where the failing row is named by its message.
  const typedCheck = isPackage && pkgInput.trim() !== '' ? checkPrice(pkgInput, 'package') : null;
  const shownError = error || (typedCheck && !typedCheck.ok ? typedCheck.error : '');

  // The same rule the server applies, so a refusal shows here before a request.
  async function save() {
    const payload: ListingPriceSave = { listingId: listing.id };
    if (isPackage) {
      const check = checkPrice(pkgInput, 'package');
      if (!check.ok) { setError(check.error); return; }
      payload.packagePrice = check.price;
    } else {
      const prices: Record<string, number> = {};
      for (const essay of listing.essays) {
        const check = checkPrice(essayInputs[essay.id] || '', 'essay');
        if (!check.ok) { setError(check.error); return; }
        prices[essay.id] = check.price;
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
            min={MIN_PRICE}
            max={max}
            step={1}
            inputMode="numeric"
            value={pkgInput}
            aria-invalid={shownError ? true : undefined}
            aria-label="Package price in dollars"
            onChange={(event) => { setPkgInput(event.target.value); setError(''); }}
          />
          <span>{`$${MIN_PRICE} to $${max}, whole dollars`}</span>
        </div>
      ) : (
        listing.essays.map((essay) => (
          <div className={styles.priceRow} key={essay.id}>
            <input
              type="number"
              min={MIN_PRICE}
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

      {shownError && <div className={styles.panelError} role="alert">{shownError}</div>}

      {/* Package listings only: per-essay listings cannot be bought, so
          neither what they earn nor a package price range applies to them. */}
      {isPackage && (
        <PriceGuidance
          price={pkgInput}
          essayCount={listing.essays.length}
          catalog={catalogPrices}
          excludeListingId={listing.id}
        />
      )}

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
