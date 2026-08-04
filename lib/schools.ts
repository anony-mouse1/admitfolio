// School name -> logo domain + a short display label.
//
// Why this exists: `Listing.school` and `Listing.admitTags` are free text typed
// by sellers, so the same institution arrives under many spellings - "UC
// Berkeley", "University of California, Berkeley", "uc berkeley" and "Uc
// berkeley" are four distinct stored strings for one school, and there is a
// "University of Pennyslvania" typo in the data. Rather than migrate the rows
// (which would still not stop the next typo), resolve at render time.
//
// This is display-only. Nothing here decides pricing or eligibility - the
// pricing tiers in lib/pricing.ts do their own independent matching, and a miss
// here just means a card falls back to its monogram badge.

export type SchoolInfo = {
  /** Domain used for the favicon logo lookup. */
  domain: string;
  /** Compact label for logo chips, where the full legal name would not fit. */
  short: string;
};

type Entry = SchoolInfo & { keys: string[] };

// Matching is longest-key-wins (see schoolInfo), which is what keeps the
// overlapping names apart. The dangerous pairs, and why they resolve correctly:
//   "penn state" (10) beats "penn" (4)          -> Penn State, not UPenn
//   "boston college" vs "boston university"     -> no shared key
//   "washington university" vs "university of washington" -> word order differs
//   "georgia tech" vs "university of georgia"   -> no shared key
// So never add a bare "pennsylvania", "california", "washington" or "georgia".
const SCHOOLS: Entry[] = [
  // ── Ivies + peers ────────────────────────────────────────
  { domain: 'harvard.edu', short: 'Harvard', keys: ['harvard'] },
  { domain: 'yale.edu', short: 'Yale', keys: ['yale'] },
  { domain: 'princeton.edu', short: 'Princeton', keys: ['princeton'] },
  { domain: 'columbia.edu', short: 'Columbia', keys: ['columbia'] },
  { domain: 'brown.edu', short: 'Brown', keys: ['brown'] },
  { domain: 'dartmouth.edu', short: 'Dartmouth', keys: ['dartmouth'] },
  { domain: 'cornell.edu', short: 'Cornell', keys: ['cornell'] },
  // 'pennyslvania' is a real typo present in the listings table. A bare
  // 'pennsylvania' key is NOT safe here - it would swallow "Pennsylvania State".
  { domain: 'upenn.edu', short: 'UPenn', keys: ['university of pennsylvania', 'pennyslvania', 'upenn', 'u penn', 'wharton', 'penn'] },
  { domain: 'mit.edu', short: 'MIT', keys: ['mit', 'massachusetts institute'] },
  { domain: 'stanford.edu', short: 'Stanford', keys: ['stanford'] },
  { domain: 'caltech.edu', short: 'Caltech', keys: ['caltech', 'california institute of technology'] },
  { domain: 'uchicago.edu', short: 'UChicago', keys: ['uchicago', 'university of chicago'] },
  { domain: 'duke.edu', short: 'Duke', keys: ['duke'] },
  { domain: 'jhu.edu', short: 'Johns Hopkins', keys: ['johns hopkins', 'john hopkins', 'jhu'] },
  { domain: 'northwestern.edu', short: 'Northwestern', keys: ['northwestern'] },
  { domain: 'vanderbilt.edu', short: 'Vanderbilt', keys: ['vanderbilt', 'vandy'] },
  { domain: 'rice.edu', short: 'Rice', keys: ['rice'] },
  { domain: 'nd.edu', short: 'Notre Dame', keys: ['notre dame'] },
  { domain: 'wustl.edu', short: 'WashU', keys: ['washington university', 'washu', 'wustl'] },
  { domain: 'georgetown.edu', short: 'Georgetown', keys: ['georgetown'] },
  { domain: 'emory.edu', short: 'Emory', keys: ['emory'] },
  { domain: 'cmu.edu', short: 'Carnegie Mellon', keys: ['carnegie mellon', 'cmu'] },
  { domain: 'nyu.edu', short: 'NYU', keys: ['nyu', 'new york university'] },
  { domain: 'usc.edu', short: 'USC', keys: ['usc', 'university of southern california'] },
  { domain: 'tufts.edu', short: 'Tufts', keys: ['tufts'] },
  { domain: 'bc.edu', short: 'Boston College', keys: ['boston college'] },
  { domain: 'bu.edu', short: 'Boston University', keys: ['boston university'] },
  { domain: 'northeastern.edu', short: 'Northeastern', keys: ['northeastern'] },
  { domain: 'wfu.edu', short: 'Wake Forest', keys: ['wake forest'] },
  { domain: 'villanova.edu', short: 'Villanova', keys: ['villanova'] },
  { domain: 'tulane.edu', short: 'Tulane', keys: ['tulane'] },
  { domain: 'case.edu', short: 'Case Western', keys: ['case western'] },
  { domain: 'rochester.edu', short: 'Rochester', keys: ['university of rochester'] },
  { domain: 'lehigh.edu', short: 'Lehigh', keys: ['lehigh'] },
  { domain: 'rpi.edu', short: 'RPI', keys: ['rensselaer', 'rpi'] },
  { domain: 'miami.edu', short: 'Miami', keys: ['university of miami'] },
  { domain: 'pitt.edu', short: 'Pitt', keys: ['university of pittsburgh', 'pitt'] },

  // ── Liberal arts ─────────────────────────────────────────
  { domain: 'williams.edu', short: 'Williams', keys: ['williams college', 'williams'] },
  { domain: 'amherst.edu', short: 'Amherst', keys: ['amherst'] },
  { domain: 'pomona.edu', short: 'Pomona', keys: ['pomona'] },
  { domain: 'swarthmore.edu', short: 'Swarthmore', keys: ['swarthmore'] },
  { domain: 'bowdoin.edu', short: 'Bowdoin', keys: ['bowdoin'] },
  { domain: 'cmc.edu', short: 'Claremont McKenna', keys: ['claremont mckenna'] },
  { domain: 'middlebury.edu', short: 'Middlebury', keys: ['middlebury'] },
  { domain: 'wm.edu', short: 'William & Mary', keys: ['william and mary'] },

  // ── University of California ─────────────────────────────
  { domain: 'berkeley.edu', short: 'UC Berkeley', keys: ['uc berkeley', 'berkeley', 'cal berkeley'] },
  { domain: 'ucla.edu', short: 'UCLA', keys: ['ucla', 'uc los angeles'] },
  { domain: 'ucsd.edu', short: 'UC San Diego', keys: ['ucsd', 'uc san diego', 'california san diego'] },
  { domain: 'uci.edu', short: 'UC Irvine', keys: ['uci', 'uc irvine', 'california irvine'] },
  { domain: 'ucdavis.edu', short: 'UC Davis', keys: ['uc davis', 'california davis'] },
  { domain: 'ucsb.edu', short: 'UC Santa Barbara', keys: ['ucsb', 'uc santa barbara', 'california santa barbara'] },
  { domain: 'ucsc.edu', short: 'UC Santa Cruz', keys: ['ucsc', 'uc santa cruz', 'california santa cruz'] },
  { domain: 'ucr.edu', short: 'UC Riverside', keys: ['ucr', 'uc riverside', 'california riverside'] },
  { domain: 'ucmerced.edu', short: 'UC Merced', keys: ['uc merced', 'california merced'] },

  // ── Large publics ────────────────────────────────────────
  { domain: 'umich.edu', short: 'Michigan', keys: ['university of michigan', 'umich', 'ann arbor'] },
  { domain: 'msu.edu', short: 'Michigan State', keys: ['michigan state'] },
  { domain: 'unc.edu', short: 'UNC', keys: ['unc', 'university of north carolina', 'chapel hill'] },
  { domain: 'virginia.edu', short: 'UVA', keys: ['uva', 'university of virginia'] },
  // Campus qualifiers matter: a bare 'university of texas' key swallowed every
  // campus in the system and rendered them all as UT Austin, with UT Austin's
  // logo. Each campus is listed separately instead. Same for Illinois below.
  { domain: 'utexas.edu', short: 'UT Austin', keys: ['ut austin', 'texas at austin', 'university of texas at austin'] },
  { domain: 'utdallas.edu', short: 'UT Dallas', keys: ['utd', 'ut dallas', 'texas at dallas', 'university of texas at dallas'] },
  { domain: 'uta.edu', short: 'UT Arlington', keys: ['ut arlington', 'texas at arlington'] },
  { domain: 'utsa.edu', short: 'UT San Antonio', keys: ['utsa', 'ut san antonio', 'texas at san antonio'] },
  { domain: 'tamu.edu', short: 'Texas A&M', keys: ['texas a and m', 'tamu'] },
  { domain: 'wisc.edu', short: 'Wisconsin', keys: ['university of wisconsin', 'wisconsin madison', 'uw madison'] },
  { domain: 'illinois.edu', short: 'UIUC', keys: ['illinois urbana', 'uiuc'] },
  { domain: 'uic.edu', short: 'UI Chicago', keys: ['uic', 'illinois chicago', 'illinois at chicago'] },
  { domain: 'washington.edu', short: 'UW', keys: ['university of washington', 'uw seattle', 'washington seattle'] },
  { domain: 'gatech.edu', short: 'Georgia Tech', keys: ['georgia tech', 'georgia institute'] },
  { domain: 'uga.edu', short: 'UGA', keys: ['university of georgia', 'uga'] },
  { domain: 'purdue.edu', short: 'Purdue', keys: ['purdue'] },
  { domain: 'indiana.edu', short: 'Indiana', keys: ['indiana university', 'kelley school'] },
  { domain: 'osu.edu', short: 'Ohio State', keys: ['ohio state'] },
  { domain: 'psu.edu', short: 'Penn State', keys: ['penn state', 'pennsylvania state', 'schreyer'] },
  { domain: 'umd.edu', short: 'Maryland', keys: ['university of maryland', 'umd', 'college park'] },
  { domain: 'ufl.edu', short: 'Florida', keys: ['university of florida', 'ufl'] },
  { domain: 'rutgers.edu', short: 'Rutgers', keys: ['rutgers'] },
  { domain: 'asu.edu', short: 'ASU', keys: ['arizona state', 'asu'] },
  { domain: 'colorado.edu', short: 'CU Boulder', keys: ['cu boulder', 'colorado boulder'] },
  { domain: 'umn.edu', short: 'Minnesota', keys: ['university of minnesota', 'twin cities'] },
  { domain: 'temple.edu', short: 'Temple', keys: ['temple university'] },
  { domain: 'drexel.edu', short: 'Drexel', keys: ['drexel'] },
  { domain: 'stonybrook.edu', short: 'Stony Brook', keys: ['stony brook'] },
  { domain: 'binghamton.edu', short: 'Binghamton', keys: ['binghamton'] },
  { domain: 'sjsu.edu', short: 'San Jose State', keys: ['san jose state'] },
  { domain: 'calpoly.edu', short: 'Cal Poly', keys: ['cal poly'] },
  { domain: 'sdsu.edu', short: 'San Diego State', keys: ['san diego state'] },

  // ── Programs & scholarships that show up in admitTags ─────
  { domain: 'questbridge.org', short: 'QuestBridge', keys: ['questbridge'] },
  { domain: 'gatesscholarship.org', short: 'Gates', keys: ['gates scholarship', 'gates millennium'] },
];

/** Lowercase, strip punctuation, pad with spaces so keys match on word bounds. */
function normalize(name: string): string {
  return (
    ' ' +
    String(name)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() +
    ' '
  );
}

/**
 * Resolve a free-text school name to a logo domain and short label.
 * Longest matching key wins, which is what keeps "Penn State" from resolving
 * to UPenn. Returns null when nothing matches - callers fall back to the
 * monogram badge rather than showing a wrong logo.
 */
export function schoolInfo(name: string | null | undefined): SchoolInfo | null {
  if (!name) return null;
  const haystack = normalize(name);
  let best: Entry | null = null;
  let bestLen = 0;
  for (const school of SCHOOLS) {
    for (const key of school.keys) {
      if (key.length > bestLen && haystack.includes(` ${key} `)) {
        best = school;
        bestLen = key.length;
      }
    }
  }
  return best ? { domain: best.domain, short: best.short } : null;
}

/** Short label for chips: the canonical name when known, else the seller's own
 *  text, cleaned but NOT reworded.
 *
 *  Deliberately does not strip "University of" any more. Doing so turned
 *  "University of California" into the bare word "California", which reads as a
 *  different (and non-existent) institution. Truncating an honest name is fine;
 *  rewriting it into a wrong one is not. Long names are ellipsised in CSS. */
export function schoolShortName(name: string): string {
  const info = schoolInfo(name);
  if (info) return info.short;
  const cleaned = String(name).replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
  return cleaned ? titleCase(cleaned) : name;
}

// Case-fix per WORD, not per string. Judging the whole string meant one stray
// capital ("santa clara University") protected the rest of it from being fixed.
//
// A word is only rewritten when it is entirely lowercase. That leaves acronyms
// (UCLA, MIT, RISD, SUNY) and internal capitals (McGill, DePaul) untouched,
// since neither is all-lowercase. Small words stay lowercase unless they lead.
const MINOR = new Set(['of', 'at', 'the', 'and', 'in', 'for', 'a', 'de', 'del', 'la']);
function titleCase(s: string): string {
  let seenWord = false;
  return s
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (/^(\s+|-|\/)$/.test(part) || !part) return part;
      const lead = !seenWord;
      seenWord = true;
      // Split off surrounding punctuation so a trailing comma doesn't stop the
      // word being recognised - "university," was being left lowercase.
      const m = part.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’.]*)(.*)$/);
      if (!m) return part;
      const [, pre, word, post] = m;
      if (!/^[a-z][a-z'’.]*$/.test(word)) return part; // acronym or already cased
      if (!lead && MINOR.has(word)) return part;
      return pre + word.charAt(0).toUpperCase() + word.slice(1) + post;
    })
    .join('');
}
