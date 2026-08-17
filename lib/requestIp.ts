import { isIP } from 'node:net';

type HeaderReader = Pick<Headers, 'get'>;

function cleanIp(value: string): string | null {
  let candidate = value.split(',')[0]?.trim() || '';
  if (!candidate || candidate.toLowerCase() === 'unknown') return null;

  // Proxies sometimes append a port. IPv6 with a port is bracketed, while a
  // bare IPv6 address contains several colons and must be left alone.
  const bracketed = candidate.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketed) candidate = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  }

  // IPv4-mapped IPv6 is the same address for our audit purposes.
  if (candidate.toLowerCase().startsWith('::ffff:')) candidate = candidate.slice(7);
  return isIP(candidate) ? candidate : null;
}

// Prefer hosting-provider headers over the generic x-forwarded-for chain. On
// Vercel these are rewritten at the edge; a caller-controlled leftmost value
// must not win when a trusted edge value is available.
export function clientIpFromHeaders(headers: HeaderReader): string | null {
  for (const name of [
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
  ]) {
    const raw = headers.get(name);
    if (!raw) continue;
    const ip = cleanIp(raw);
    if (ip) return ip;
  }
  return null;
}
