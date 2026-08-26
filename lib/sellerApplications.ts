import { catalogSchool } from './listingSchool';
import { sameSchool } from './schools';

export type SellerApplicationSchoolInput = {
  school: string;
  targetSchool?: string | null;
  admitTags: string[];
};

/**
 * The private seller workspace must group and mutate an application using the
 * same school fallback. Legacy listings can have no targetSchool and no single
 * unambiguous admit tag, so the seller's school is the application identity
 * already shown in their dashboard.
 */
export function sellerApplicationSchool(listing: SellerApplicationSchoolInput): string {
  return catalogSchool(listing) || listing.targetSchool?.trim() || listing.school.trim();
}

export function matchesSellerApplication(listing: SellerApplicationSchoolInput, school: string): boolean {
  return sameSchool(sellerApplicationSchool(listing), school);
}
