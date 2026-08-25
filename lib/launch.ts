import 'server-only';

// NEXT_PUBLIC_LAUNCH controls the public UI, but launch state must also be
// enforced on the server. Otherwise a caller can skip the UI and use the
// catalog or checkout APIs directly.
export function marketplaceIsLaunched(): boolean {
  // Compute the key so Next does not replace the server-side read at build
  // time. This keeps the API gate tied to the deployment's current env value.
  const launchKey = ['NEXT', 'PUBLIC', 'LAUNCH'].join('_');
  return process.env[launchKey] === '1';
}
