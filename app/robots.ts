import type { MetadataRoute } from 'next';
import { crawlOrigin } from '@/lib/site';

// /admin is private and /api is not a page, so neither should be crawled.
//
// /purchase is deliberately left crawlable. Those pages carry noindex, and a
// robots block would stop a crawler from ever reading that directive, which
// can leave a blocked URL sitting in the index with no snippet.
//
// /api/listings is re-allowed on purpose. The homepage renders its catalogue
// client-side from that route, and Googlebot obeys robots.txt for the fetches
// a page makes while rendering. Blocking it would leave the renderer with
// "Loading essays" and no listings on the one page Google already knows. The
// longer rule wins, so the rest of /api stays blocked.

export default function robots(): MetadataRoute.Robots {
  const origin = crawlOrigin();
  return {
    rules: { userAgent: '*', allow: ['/', '/api/listings'], disallow: ['/admin', '/api'] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
