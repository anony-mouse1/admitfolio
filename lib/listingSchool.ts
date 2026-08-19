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

export type ListingEssayIdentity = {
  prompt: string;
  question?: string | null;
};

export type ListingHeadlineInput = ListingSchoolInput & {
  applicationSystem?: string | null;
  essays?: ListingEssayIdentity[];
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

function essayIdentityText(essay: ListingEssayIdentity): string {
  return `${essay.prompt} ${essay.question || ''}`.toLowerCase();
}

// The old onboarding asked which schools the essays helped the seller get
// into, but did not record which one school the listing was written for. Those
// are different facts. This label remains useful for describing the contents,
// but it is not a college and must never be sent to the logo component.
export function legacyApplicationTitle(listing: ListingHeadlineInput): string {
  const applicationSystem = listing.applicationSystem?.trim().toLowerCase() || '';
  const essayTexts = (listing.essays || []).map(essayIdentityText);
  const hasUcEssay = essayTexts.some((text) =>
    /\buc\b|university of california|personal insight question|\bpiq\b/.test(text),
  );
  const hasCommonAppEssay = essayTexts.some((text) =>
    /common\s*app|personal statement/.test(text),
  );

  if (applicationSystem === 'uc' || (hasUcEssay && !hasCommonAppEssay)) {
    return 'UC Application';
  }
  if (!applicationSystem && hasUcEssay && hasCommonAppEssay) {
    return essayTexts.length === 1 ? 'College Essay' : 'College Application Essay Package';
  }
  if (applicationSystem === 'commonapp' || applicationSystem === 'common app' || hasCommonAppEssay) {
    return essayTexts.length === 1 ? 'Common App Personal Statement' : 'Common App Essay Package';
  }
  if (applicationSystem === 'coalition' || applicationSystem === 'coalition app') {
    return 'Coalition App Essay Package';
  }
  if (applicationSystem === 'mit') return 'MIT Application';
  return essayTexts.length === 1 ? 'College Essay' : 'College Essay Package';
}

export function listingHeadline(listing: ListingHeadlineInput): string {
  // Exact listing college first. If this is a genuinely general or ambiguous
  // legacy package, use the seller's current university. That always resolves
  // to a real college name and logo, unlike "Common App Essay Package".
  return catalogSchool(listing) || listing.school;
}
