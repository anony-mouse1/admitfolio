'use client';

import styles from './admin.module.css';

/**
 * One confirmation for the console's outward-facing actions.
 *
 * Approving, rejecting and verifying all email a real seller and cannot be
 * taken back, so each states what it is about to do rather than asking whether
 * you are sure. Shaped like the support-view dialog above it: backdrop, the
 * payload doubling as the open flag in the caller, right-aligned actions.
 */
export default function ConfirmDialog({
  eyebrow,
  title,
  body,
  points,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={styles.supportModalBackdrop}
      role="presentation"
      onMouseDown={() => !busy && onCancel()}
    >
      <div
        className={styles.supportModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.confirmEyebrow}>{eyebrow}</div>
        <h2 id="admin-confirm-title">{title}</h2>
        <p>{body}</p>
        {points && points.length > 0 && (
          <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
        )}
        <div className={styles.supportModalActions}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`${styles.btn}${danger ? ` ${styles.btnReject}` : ''}`}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
