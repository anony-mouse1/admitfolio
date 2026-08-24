export const SELLER_DRAFT_RETENTION_DAYS = 30;

export function sellerDraftRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - SELLER_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
