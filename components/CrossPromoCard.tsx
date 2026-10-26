import styles from '@/app/guides/guides.module.css';
import { CROSS_PROMO_COPY, crossPromoUrl } from '@/lib/crossPromo';
import type { GuideSlug } from '@/lib/guides';

// The Fatimah's Guide card that closes every guide, under Admitfolio's own
// call to action. Deliberately lighter than that dark box so Admitfolio's ask
// stays the heavier one. `data-cross-promo-card` is what CrossPromoBanner
// watches to step aside while this card is on screen.
export function CrossPromoCard({ guide }: { guide: GuideSlug }) {
  return (
    <aside className={styles.crossPromo} data-cross-promo-card aria-label="Free call with Fatimah's Guide">
      <div>
        <span className={styles.eyebrow}>Fatimah&apos;s Guide</span>
        <h2>{CROSS_PROMO_COPY.guideHeading}</h2>
        <p>{CROSS_PROMO_COPY.guideBody}</p>
      </div>
      <a className={styles.crossPromoButton} href={crossPromoUrl('blog', guide)} target="_blank" rel="noopener">
        {CROSS_PROMO_COPY.button} →
      </a>
    </aside>
  );
}
