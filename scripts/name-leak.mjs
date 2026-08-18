// Does this sentence contain the seller's own name?
//
// Split out of scripts/extract-opening-lines.mjs so it can be tested without a
// database or a Supabase key: that script connects to the live database at
// import time, so anything left inside it can only be exercised against
// production. Run the tests with `node scripts/name-leak.test.mjs`.

// Returns the reason a line must be rejected, or null to keep it.
//
// The caller rejects the name for EVERY seller, not only the anonymous ones.
// Anonymity is per listing and the seller can change it whenever they like, but
// `Listing.openingLine` is written once and never re-extracted, so a line that
// is safe on a `full` listing today becomes a leak the moment that listing is
// switched to anonymous.
//
// Deliberately over-eager. A given name like Grace, Hope or May is also an
// ordinary word, and this will throw away the occasional good line because of
// it. Rejecting a good line costs one card its hook and it falls back to a
// blank, which is what that card shows today anyway. Letting one through puts a
// real name on the public site.
//
// It only knows the name on the account. A nickname, or a sibling or friend
// named in the prose, still gets through, so a human still reads the dry run.
export function nameLeak(sentence, sellerName) {
  if (!sellerName) return null;
  // Letters, apostrophes and hyphens only: "Jane J. Kaur" -> Jane, Kaur.
  const parts = String(sellerName)
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z'’-]/g, ''))
    .filter((p) => p.length >= 2);
  if (!parts.length) return null;

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // These PDFs mix straight and curly apostrophes, so O'Brien has to match both.
  const pat = (p) => esc(p).replace(/['’]/g, "['’]");
  // Boundary is "not a letter" rather than \b, so the possessive and the
  // hyphenated form still match: Kaur's and Kaur-Smith both contain Kaur. It
  // still refuses a name buried inside a longer word, so "mackaurel" is safe.
  const bounded = (body, flags) => new RegExp(`(^|[^A-Za-z])${body}([^A-Za-z]|$)`, flags);

  if (bounded(parts.map(pat).join('\\s+'), 'i').test(sentence)) return 'full-name';
  // A surname is distinctive enough to match whatever its case.
  if (parts.length > 1 && bounded(pat(parts[parts.length - 1]), 'i').test(sentence)) return 'surname';
  // Given names match only where they are capitalised, i.e. used as a proper
  // noun. "she showed grace under pressure" survives, "Grace slammed the door"
  // does not. A sentence that merely opens with the word is rejected too, which
  // is the over-eagerness described above.
  for (const p of parts.slice(0, -1)) {
    if (bounded(pat(p[0].toUpperCase() + p.slice(1)), '').test(sentence)) return 'given-name';
  }
  return null;
}
