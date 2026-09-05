import { sameSchool } from './schools';
import { catalogSchool, parseAdmitTags } from './listingSchool';

// When the same PDF may appear in two of one seller's packages.
//
// One Common App personal statement is genuinely submitted to every school on
// the application, so a seller with a Harvard package and a Yale package has to
// put the same file in both. Blocking that outright forbids the ordinary shape
// of a college application.
//
// What must not happen is the same file appearing twice in packages for the
// SAME college, because a buyer comparing those two packages would pay twice
// for one essay. That is the case this still blocks.
//
// The rule is enforced from three routes (draft finalize, direct submit, and
// essay upload). It lives here so they cannot drift apart, which is exactly how
// the client and server came to disagree about attached files.

export type DuplicateListing = {
  targetSchool: string | null;
  /** Raw JSON as stored on Listing.admitTags. */
  admitTags: string;
};

/**
 * True when an existing listing holding the same file is for the same college
 * as the package being submitted, and the duplicate should therefore be
 * refused.
 *
 * School names are free text, so both sides resolve through lib/schools rather
 * than being compared as strings. That is what keeps "Penn State" separate from
 * "University of Pennsylvania".
 */
export function conflictsForSameSchool(
  existing: DuplicateListing,
  targetSchool: string | null,
): boolean {
  // An unresolvable college on the incoming side means we cannot show the two
  // packages are for different schools, so keep the older, stricter answer.
  if (!targetSchool || !targetSchool.trim()) return true;

  const admits = parseAdmitTags(existing.admitTags);
  const existingSchool = catalogSchool({
    school: '',
    targetSchool: existing.targetSchool,
    admitTags: admits,
  });
  if (existingSchool) return sameSchool(existingSchool, targetSchool);

  // A legacy listing claiming several admits has no single college. Treat it as
  // a conflict for any school it claims, which is the conservative reading and
  // matches how the one-package-per-school check already handles these rows.
  return admits.some((admit) => sameSchool(admit, targetSchool));
}

/** The first same-school conflict, or null when the reuse is legitimate. */
export function findSameSchoolConflict<T extends { listing: DuplicateListing }>(
  candidates: T[],
  targetSchool: string | null,
): T | null {
  return candidates.find((candidate) => conflictsForSameSchool(candidate.listing, targetSchool)) || null;
}
