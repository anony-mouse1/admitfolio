// One source of truth for the college a listing belongs under.
//
// Listing.school is the university the seller currently attends. It is profile
// context and is intentionally NOT the catalogue title. New listings carry an
// explicit targetSchool. A legacy listing with exactly one claimed admit is
// unambiguous; a legacy listing with several admits is not. Never guess from
// the first item in that list, because its order did not mean "these essays are
// for this school."

export type ListingSchoolInput = {
  school: string;
  targetSchool?: string | null;
  admitTags: string[];
};

export function parseAdmitTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function catalogSchool(listing: ListingSchoolInput): string | null {
  const explicit = listing.targetSchool?.trim();
  if (explicit) return explicit;
  return listing.admitTags.length === 1 ? listing.admitTags[0].trim() || null : null;
}

export function needsTargetSchoolReview(listing: ListingSchoolInput): boolean {
  return catalogSchool(listing) === null;
}
