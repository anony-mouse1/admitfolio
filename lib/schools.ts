// Free-text school name -> logo domain + short label.
//
// Sellers type school names by hand, so the same institution arrives as
// "UC Berkeley", "University of California, Berkeley" and "Berkeley". This
// resolves all of them to one entry, which is what lets the browse card show a
// real logo and a short headline instead of the seller's raw text.
//
// Longest matching key wins. That is what keeps "Penn State" out of UPenn and
// "UT Dallas" out of "UT Austin": a short key can never beat a longer one that
// also matches.

export type School = {
  /** Domain used to fetch the institution's logo. */
  domain: string;
  /** Short display label, e.g. "UC Berkeley". */
  short: string;
  /** Normalised substrings that identify this school. Longest match wins. */
  keys: string[];
  /** Ambiguous short names that only match when they are the entire input. */
  exactKeys?: string[];
};

// 2026 U.S. News Best National Universities. Ties intentionally share a rank.
// Source: https://www.usnews.com/best-colleges/rankings/national-universities
// The public page uses this only for catalogue ordering. Price floors continue
// to use the broader, less volatile tiers in lib/pricing.ts.
const NATIONAL_UNIVERSITY_RANK_2026 = new Map<string, number>([
  ['princeton.edu', 1],
  ['mit.edu', 2],
  ['harvard.edu', 3],
  ['stanford.edu', 4], ['yale.edu', 4],
  ['uchicago.edu', 6],
  ['duke.edu', 7], ['jhu.edu', 7], ['northwestern.edu', 7], ['upenn.edu', 7],
  ['caltech.edu', 11],
  ['cornell.edu', 12],
  ['brown.edu', 13], ['dartmouth.edu', 13],
  ['columbia.edu', 15], ['berkeley.edu', 15],
  ['rice.edu', 17], ['ucla.edu', 17], ['vanderbilt.edu', 17],
  ['cmu.edu', 20], ['umich.edu', 20], ['nd.edu', 20], ['wustl.edu', 20],
  ['emory.edu', 24], ['georgetown.edu', 24],
  ['unc.edu', 26], ['virginia.edu', 26],
  ['usc.edu', 28],
  ['ucsd.edu', 29],
  ['ufl.edu', 30], ['utexas.edu', 30],
  ['gatech.edu', 32], ['nyu.edu', 32], ['ucdavis.edu', 32], ['uci.edu', 32],
  ['bc.edu', 36], ['tufts.edu', 36], ['illinois.edu', 36], ['wisc.edu', 36],
  ['ucsb.edu', 40],
  ['osu.edu', 41],
  ['bu.edu', 42], ['rutgers.edu', 42], ['umd.edu', 42], ['washington.edu', 42],
  ['lehigh.edu', 46], ['northeastern.edu', 46], ['purdue.edu', 46], ['uga.edu', 46], ['rochester.edu', 46],
]);

const SCHOOLS: School[] = [
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
  { domain: 'usc.edu', short: 'USC', keys: ['usc', 'university of southern california'], exactKeys: ['southern california'] },
  { domain: 'tufts.edu', short: 'Tufts', keys: ['tufts'] },
  { domain: 'bc.edu', short: 'Boston College', keys: ['boston college'] },
  { domain: 'bu.edu', short: 'Boston University', keys: ['boston university'] },
  { domain: 'northeastern.edu', short: 'Northeastern', keys: ['northeastern'] },
  { domain: 'wfu.edu', short: 'Wake Forest', keys: ['wake forest'] },
  { domain: 'villanova.edu', short: 'Villanova', keys: ['villanova'] },
  { domain: 'tulane.edu', short: 'Tulane', keys: ['tulane'] },
  { domain: 'case.edu', short: 'Case Western', keys: ['case western'] },
  { domain: 'rochester.edu', short: 'Rochester', keys: ['university of rochester'], exactKeys: ['rochester'] },
  { domain: 'lehigh.edu', short: 'Lehigh', keys: ['lehigh'] },
  { domain: 'rpi.edu', short: 'RPI', keys: ['rensselaer', 'rpi'] },
  { domain: 'miami.edu', short: 'Miami', keys: ['university of miami'], exactKeys: ['miami'] },
  { domain: 'pitt.edu', short: 'Pitt', keys: ['university of pittsburgh', 'pitt'], exactKeys: ['pittsburgh'] },

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
  { domain: 'umich.edu', short: 'Michigan (Ann Arbor)', keys: ['university of michigan', 'umich', 'ann arbor'], exactKeys: ['michigan'] },
  { domain: 'umdearborn.edu', short: 'Michigan-Dearborn', keys: ['university of michigan dearborn', 'um dearborn', 'michigan dearborn'] },
  { domain: 'umflint.edu', short: 'Michigan-Flint', keys: ['university of michigan flint', 'um flint', 'michigan flint'] },
  { domain: 'msu.edu', short: 'Michigan State', keys: ['michigan state'] },
  { domain: 'unc.edu', short: 'UNC Chapel Hill', keys: ['unc', 'university of north carolina', 'chapel hill'], exactKeys: ['north carolina'] },
  { domain: 'charlotte.edu', short: 'UNC Charlotte', keys: ['university of north carolina at charlotte', 'unc charlotte', 'north carolina at charlotte', 'north carolina charlotte'] },
  { domain: 'uncg.edu', short: 'UNC Greensboro', keys: ['university of north carolina at greensboro', 'unc greensboro', 'north carolina at greensboro', 'north carolina greensboro'] },
  { domain: 'uncw.edu', short: 'UNC Wilmington', keys: ['university of north carolina at wilmington', 'unc wilmington', 'north carolina at wilmington', 'north carolina wilmington'] },
  { domain: 'virginia.edu', short: 'UVA', keys: ['uva', 'university of virginia'], exactKeys: ['virginia'] },
  // Campus qualifiers matter: a bare 'university of texas' key swallowed every
  // campus in the system and rendered them all as UT Austin, with UT Austin's
  // logo. Each campus is listed separately instead. Same for Illinois below.
  { domain: 'utexas.edu', short: 'UT Austin', keys: ['ut austin', 'texas at austin', 'university of texas at austin'] },
  { domain: 'utdallas.edu', short: 'UT Dallas', keys: ['utd', 'ut dallas', 'texas at dallas', 'university of texas at dallas'] },
  { domain: 'uta.edu', short: 'UT Arlington', keys: ['ut arlington', 'texas at arlington'] },
  { domain: 'utsa.edu', short: 'UT San Antonio', keys: ['utsa', 'ut san antonio', 'texas at san antonio'] },
  { domain: 'utep.edu', short: 'UT El Paso', keys: ['utep', 'ut el paso', 'texas at el paso'] },
  { domain: 'utrgv.edu', short: 'UT Rio Grande Valley', keys: ['utrgv', 'ut rio grande valley', 'texas rio grande valley'] },
  { domain: 'uttyler.edu', short: 'UT Tyler', keys: ['ut tyler', 'texas at tyler'] },
  { domain: 'tamu.edu', short: 'Texas A&M', keys: ['texas a and m', 'tamu'] },
  { domain: 'wisc.edu', short: 'Wisconsin', keys: ['university of wisconsin', 'wisconsin madison', 'uw madison'], exactKeys: ['wisconsin'] },
  { domain: 'illinois.edu', short: 'UIUC', keys: ['illinois urbana', 'uiuc'] },
  { domain: 'uic.edu', short: 'UI Chicago', keys: ['uic', 'illinois chicago', 'illinois at chicago'] },
  { domain: 'washington.edu', short: 'University of Washington', keys: ['university of washington', 'uw seattle', 'washington seattle'], exactKeys: ['uw'] },
  { domain: 'gatech.edu', short: 'Georgia Tech', keys: ['georgia tech', 'georgia institute'] },
  { domain: 'uga.edu', short: 'UGA', keys: ['university of georgia', 'uga'] },
  { domain: 'purdue.edu', short: 'Purdue', keys: ['purdue'] },
  { domain: 'indiana.edu', short: 'Indiana', keys: ['indiana university', 'kelley school', 'iu kelley', 'iu bloomington'] },
  { domain: 'osu.edu', short: 'Ohio State', keys: ['ohio state'] },
  { domain: 'psu.edu', short: 'Penn State', keys: ['penn state', 'pennsylvania state', 'schreyer'] },
  { domain: 'umd.edu', short: 'Maryland', keys: ['university of maryland', 'umd', 'college park'], exactKeys: ['maryland'] },
  { domain: 'ufl.edu', short: 'Florida', keys: ['university of florida', 'uflorida', 'ufl'] },
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
  // ── Added from the live catalogue: names sellers typed that the table above
  //    did not resolve. Some keys are deliberate misspellings, because that is
  //    what is in the data.
  { domain: 'vt.edu', short: 'Virginia Tech', keys: ['virginia tech', 'virginia polytechnic'] },
  { domain: 'auburn.edu', short: 'Auburn', keys: ['auburn'] },
  { domain: 'sandiego.edu', short: 'University of San Diego', keys: ['university of san diego'] },
  { domain: 'ou.edu', short: 'Oklahoma', keys: ['university of oklahoma'] },
  { domain: 'okstate.edu', short: 'Oklahoma State', keys: ['oklahoma state'] },
  { domain: 'uh.edu', short: 'Houston', keys: ['university of houston'] },
  { domain: 'lmu.edu', short: 'LMU', keys: ['loyola marymount'] },
  { domain: 'scu.edu', short: 'Santa Clara', keys: ['santa clara'] },
  { domain: 'chapman.edu', short: 'Chapman', keys: ['chapman'] },
  { domain: 'fsu.edu', short: 'Florida State', keys: ['florida state'] },
  { domain: 'rit.edu', short: 'RIT', keys: ['rochester institute', 'rit'] },
  { domain: 'uark.edu', short: 'Arkansas', keys: ['university of arkansas'] },
  { domain: 'clemson.edu', short: 'Clemson', keys: ['clemson'] },
  { domain: 'bates.edu', short: 'Bates', keys: ['bates'] },
  { domain: 'syr.edu', short: 'Syracuse', keys: ['syracuse'] },
  { domain: 'sacredheart.edu', short: 'Sacred Heart', keys: ['sacred heart'] },
  { domain: 'iastate.edu', short: 'Iowa State', keys: ['iowa state'] },
  { domain: 'usfca.edu', short: 'USF', keys: ['university of san francisco'] },
  { domain: 'ucf.edu', short: 'UCF', keys: ['university of central florida', 'ucf'] },
  { domain: 'ncsu.edu', short: 'NC State', keys: ['north carolina state', 'nc state'] },
  { domain: 'wpi.edu', short: 'WPI', keys: ['worcester polytechnic', 'wpi'] },
  { domain: 'scad.edu', short: 'SCAD', keys: ['savannah college', 'scad'] },
  { domain: 'umb.edu', short: 'UMass Boston', keys: ['university of massachusetts boston', 'umass boston'] },
  { domain: 'baylor.edu', short: 'Baylor', keys: ['baylor'] },
  { domain: 'duq.edu', short: 'Duquesne', keys: ['duquesne'] },
  { domain: 'uri.edu', short: 'Rhode Island', keys: ['university of rhode island'] },
  { domain: 'udel.edu', short: 'Delaware', keys: ['university of delaware'] },
  { domain: 'kennesaw.edu', short: 'Kennesaw State', keys: ['kennesaw'] },
  { domain: 'gsu.edu', short: 'Georgia State', keys: ['georgia state', 'georgia state univeristy'] },
  { domain: 'westga.edu', short: 'West Georgia', keys: ['west georgia'] },
  { domain: 'iit.edu', short: 'Illinois Tech', keys: ['illinois institute of technology', 'illinois insitute of technology'] },
  { domain: 'wit.edu', short: 'Wentworth', keys: ['wentworth institute'] },
  { domain: 'ua.edu', short: 'Alabama', keys: ['university of alabama'] },
  { domain: 'pba.edu', short: 'Palm Beach Atlantic', keys: ['palm beach atlantic'] },
  { domain: 'pitt.edu', short: 'Pitt', keys: ['university of pittsburg'] },
  { domain: 'illinois.edu', short: 'UIUC', keys: ['university of illinous urbana champaign'] },
];

// Canonical labels for seller-facing school pickers. Sellers can still enter a
// school that is not here, but common ambiguous systems (UNC, Michigan, UT)
// appear as distinct campuses instead of one unqualified free-text value.
export const SCHOOL_OPTIONS = [...new Set(
  SCHOOLS
    .filter((school) => !['questbridge.org', 'gatesscholarship.org'].includes(school.domain))
    .map((school) => school.short),
)].sort((a, b) => a.localeCompare(b));

/**
 * Lowercase, strip punctuation, and pad with spaces so that `includes(' key ')`
 * matches on whole words only. Without the padding, "penn" would match inside
 * "pennsylvania".
 */
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

/** Resolve a free-text school name, or null when nothing matches. */
export function schoolInfo(name: string | null | undefined): { domain: string; short: string } | null {
  if (!name) return null;
  const haystack = normalize(name);
  let best: School | null = null;
  let bestLen = 0;
  for (const school of SCHOOLS) {
    if (school.exactKeys?.some((key) => haystack === ' ' + key + ' ')) {
      return { domain: school.domain, short: school.short };
    }
    for (const key of school.keys) {
      if (key.length > bestLen && haystack.includes(' ' + key + ' ')) {
        best = school;
        bestLen = key.length;
      }
    }
  }
  return best ? { domain: best.domain, short: best.short } : null;
}

/** Exact 2026 National Universities rank, or null outside the published top 50. */
export function nationalUniversityRank(name: string | null | undefined): number | null {
  const info = schoolInfo(name);
  if (!info) return null;
  return NATIONAL_UNIVERSITY_RANK_2026.get(info.domain) ?? null;
}

// Words that stay lowercase unless they lead: "University of Michigan", not
// "University Of Michigan".
const MINOR = new Set(['of', 'at', 'the', 'and', 'in', 'for', 'a', 'de', 'del', 'la']);

/**
 * Title-case a seller-typed name without touching anything already capitalised,
 * so "UCLA" and "MIT" survive intact and "uc berkeley" becomes "Uc Berkeley"
 * only when the table has no entry for it.
 */
export function titleCase(s: string): string {
  let seenWord = false;
  return s
    .split(/(\s+|-|\/)/)
    .map(function (part) {
      if (/^(\s+|-|\/)$/.test(part) || !part) return part;
      const lead = !seenWord;
      seenWord = true;
      const m = part.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’.]*)(.*)$/);
      if (!m) return part;
      const pre = m[1], word = m[2], post = m[3];
      if (!/^[a-z][a-z'’.]*$/.test(word)) return part;
      if (!lead && MINOR.has(word)) return part;
      return pre + word.charAt(0).toUpperCase() + word.slice(1) + post;
    })
    .join('');
}

/**
 * The label to show for a school: the table's short form when known, otherwise
 * the seller's own text tidied up. Never returns empty.
 */
export function schoolShortName(name: string): string {
  const info = schoolInfo(name);
  if (info) return info.short;
  const cleaned = String(name).replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
  return cleaned ? titleCase(cleaned) : name;
}

/**
 * Do two seller-typed names mean the same institution? Used to tell whether the
 * school a seller attends is also one of the schools they got into, without
 * caring how they spelled it either time.
 */
export function sameSchool(a: string, b: string): boolean {
  const ia = schoolInfo(a);
  const ib = schoolInfo(b);
  if (ia && ib) return ia.domain === ib.domain;
  return normalize(a) === normalize(b);
}

// Fallback monogram colours, used when a school has no logo. Hash rather than
// random so the same school is always the same colour.
const BADGE_COLORS = ['#7d1d2d', '#00356B', '#1D4F91', '#365314', '#7c2d12', '#4a1d6b'];

export function schoolColor(name: string): string {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}
