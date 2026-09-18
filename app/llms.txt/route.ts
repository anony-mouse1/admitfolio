import { COLLECTIONS_PATH, collectionPath, collections } from '@/lib/collections';
import { GUIDES_PATH, guidePath, guides } from '@/lib/guides';
import { crawlOrigin } from '@/lib/site';

// /llms.txt: what this site is, and where its readable pages are.
//
// A route rather than a file in public/, for the reason app/sitemap.ts is a
// route. The list of guides and the list of collections come from the same two
// registries the pages, the hub and the sitemap read, so this file cannot name
// a guide that does not exist or miss a collection that does. A static
// public/llms.txt would be a fourth hand-maintained copy of both lists, and
// would be wrong the first time either changed.
//
// It is force-static for the same reason robots.txt and sitemap.xml are: it
// depends on nothing but those registries and the origin. crawlOrigin() throws
// on a production deployment configured for any other origin, which fails the
// build and leaves the old site up rather than publishing a file full of
// preview URLs.
export const dynamic = 'force-static';

// The format is llms.txt: an H1 naming the site, a one-line summary as a
// blockquote, prose, then H2 sections of markdown links.
//
// What is deliberately not in here: any sentence that sells. No "real", no
// "verified", no claim about plagiarism, detection or originality, and no
// number of listings. A crawler is reading this to find out what the site is
// and which URLs are worth fetching, and the only thing a marketing line could
// add is a claim that has to stay true on every future crawl.
//
// The descriptions are the ones the site already shows: collection.dek is the
// sub-line under each collection's H1, and guide.description is the card copy
// on /guides. Nothing here is written twice.
export async function GET(): Promise<Response> {
  const origin = crawlOrigin();
  const url = (path: string) => `${origin}${path}`;

  const lines = [
    '# Admitfolio',
    '',
    '> A marketplace where students sell the college application essays they were admitted with.',
    '',
    'The unit of sale is a listing, not an essay. A listing is one student\'s essays',
    'for one application, sold together at a single price. Where known, a listing',
    'identifies the application; it also shows essay prompts and how many essays it holds.',
    '',
    'The home page renders its catalogue in the browser, so its HTML carries no',
    'listings. The pages below are server rendered and contain the text they describe.',
    '',
    '## Essay collections',
    '',
    `- [College essay collections](${url(COLLECTIONS_PATH)}): the index of the six collections below.`,
    ...collections.map((collection) => `- [${collection.name}](${url(collectionPath(collection.slug))}): ${collection.dek}`),
    '',
    '## Guides',
    '',
    `- [Essay guides](${url(GUIDES_PATH)}): the index of the articles below.`,
    ...guides.map((guide) => `- [${guide.title}](${url(guidePath(guide.slug))}): ${guide.description}`),
    '',
    '## About the site',
    '',
    `- [Privacy](${url('/privacy')})`,
    `- [Terms](${url('/terms')})`,
    '- Contact: hello@admitfolio.com',
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
