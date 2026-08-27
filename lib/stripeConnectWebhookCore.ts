import type Stripe from 'stripe';

export type ParsedConnectWebhook =
  | { kind: 'account'; accountId: string | null }
  | { kind: 'payout'; accountId: string | null; event: Stripe.Event }
  | { kind: 'ignored'; eventType: string };

export function parseConnectWebhook(
  stripe: Stripe,
  raw: string,
  signature: string,
  secrets: { v2: string; snapshot: string },
  isBankPayoutEvent: (eventType: string) => boolean,
): ParsedConnectWebhook {
  const object = (JSON.parse(raw) as { object?: unknown }).object;
  if (object === 'v2.core.event') {
    if (!secrets.v2) throw new Error('Connect v2 webhook is not configured.');
    const notification = stripe.parseEventNotification(raw, signature, secrets.v2);
    if (!notification.type.startsWith('v2.core.account')) {
      return { kind: 'ignored', eventType: notification.type };
    }
    return {
      kind: 'account',
      accountId: 'related_object' in notification
        ? notification.related_object?.id || null
        : null,
    };
  }

  // Keep the original secret as a fallback so deployments remain compatible
  // with installations that still use one snapshot destination only.
  const snapshotSecret = secrets.snapshot || secrets.v2;
  if (!snapshotSecret) throw new Error('Connect snapshot webhook is not configured.');
  const event = stripe.webhooks.constructEvent(raw, signature, snapshotSecret);
  if (isBankPayoutEvent(event.type)) {
    return { kind: 'payout', accountId: event.account || null, event };
  }
  if (event.type !== 'account.updated') {
    return { kind: 'ignored', eventType: event.type };
  }
  return {
    kind: 'account',
    accountId: event.account || (event.data.object as { id?: string }).id || null,
  };
}
