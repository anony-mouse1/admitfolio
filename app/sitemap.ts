import type { MetadataRoute } from 'next';
import { GUIDES_PATH, guidePath, guides } from '@/lib/guides';
import { crawlOrigin } from '@/lib/site';

// Every page a search engine should index, and nothing else.
//
// Left out on purpose: /purchase/[token] and /purchase/success are noindex,
// /admin is private, and /api is not a page. The guides come from the registry
// in lib/guides.ts, the same list the blog index renders and the articles take
// their canonical URLs from, so the sitemap cannot list an article that does
// not exist or miss one that does. Newest guide first, as on the index.
//
// lastModified is set only where a real date exists: each article declares
// its own, and the index moves when its newest article does. The homepage,
// privacy and terms carry no date rather than a build timestamp that would
// tell Google every page changed on every deploy. No priority or
// changeFrequency: Google ignores both, and there is nothing true to put there.

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = crawlOrigin();
  const newestGuideChange = guides.map((guide) => guide.modified).sort().at(-1);
  return [
    { url: `${origin}/` },
    { url: `${origin}${GUIDES_PATH}`, lastModified: newestGuideChange },
    ...guides.map((guide) => ({ url: `${origin}${guidePath(guide.slug)}`, lastModified: guide.modified })),
    { url: `${origin}/privacy` },
    { url: `${origin}/terms` },
  ];
}
