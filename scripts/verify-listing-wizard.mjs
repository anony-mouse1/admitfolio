#!/usr/bin/env node

// Checks for the listing-wizard fixes.
//
// The wizard sits behind the seller login, so almost all of this is asserted
// against the source rather than driven in a browser. Getting a real session
// would mean authenticating against the production database, which this work is
// not allowed to do. The one thing that is checked live is that the public page
// still renders clean after the changes.

import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

// The wizard opens on a stated target, never on "whichever draft is newest".
assert(/type SellWizardTarget =/.test(page), 'the wizard must take an explicit target');
// Only as prose in the comment that records why it went, never as code.
assert(!/preferredDraftId\s*[=),]/.test(page), 'the guessy preferredDraftId argument must be gone');
assert(!/data\.drafts\?\.\[0\]/.test(page.slice(page.indexOf('openSellFromDashboard'))), 'the wizard must not fall back to the most recent draft');
assert(/\{ mode: 'new', prefillSchool:/.test(page), 'the add buttons must ask for a new listing');
assert(/\{ mode: 'resume', draftId: resumableDraft\.id \}/.test(page), 'the resume banner must resume the draft it is describing');

// The step is chosen before the modal is shown, so step 1 never flashes.
const openBody = page.slice(page.indexOf('async function openSellFromDashboard'), page.indexOf('const emailAllowed'));
assert(openBody.indexOf('setSellStep(4)') < openBody.indexOf('setSellOpen(true)'), 'the step must be set before the wizard is shown, or it opens on the signed-out pane');
assert(/setSellStep\(1\);\n    setEduEmail/.test(page), 'fullResetSell must reset the step too');

// The wizard layers over the dashboard rather than tearing it down.
const openBodyFull = page.slice(page.indexOf('async function openSellFromDashboard'), page.indexOf('const emailAllowed'));
assert(!/setDashOpen\(false\)/.test(openBodyFull), 'opening the wizard must leave the dashboard exactly as it was');
assert(/over-dash/.test(page), 'the wizard must be lifted above the dashboard when launched from it');
assert(/if \(cameFromDashboard\) \{/.test(page), 'closing the wizard must reload the dashboard behind it');
assert(/reloadDashboardRef\.current\?\.\(\)/.test(page), 'closing must refetch, or the resume banner and listings stay stale');
// The refresh must not blank the dashboard first. Clearing state belongs to
// opening from cold, not to coming back from the wizard.
const loadBody = page.slice(page.indexOf('const loadDashboardData = useCallback'), page.indexOf('const openDashboard = useCallback'));
for (const clear of ['setListings([])', 'setSellerApplications([])', 'setDashLoading(true)', 'setResumableDraft(null)']) {
  assert(!loadBody.includes(clear), `the in-place refresh must not ${clear}, or the dashboard empties on every exit`);
}
assert(/setResumableDraft\(d\.drafts\?\.\[0\] \?\? null\)/.test(page), 'a refresh must clear the resume banner when the draft is gone, not only set it');
assert(/setCameFromDashboard\(true\)/.test(page) && /setCameFromDashboard\(false\)/.test(page), 'the dashboard-origin flag must be both set and cleared');

// Escape closes the wizard before the dashboard underneath it.
const escBody = page.slice(page.indexOf('Escape closes the top-most overlay'), page.indexOf('Scroll-reveal animations'));
assert(escBody.indexOf('else if (sellOpen)') < escBody.indexOf('else if (dashOpen)'), 'Escape must close the wizard before the dashboard it sits on');

// Step 4 is the first pane for a dashboard seller, so Back must not walk into
// the signup steps behind it.
assert(/cameFromDashboard \? \(\s*<button className="modal-back" onClick=\{closeSell\}/.test(page), 'from the dashboard, Back on step 4 must leave the wizard, not step into signup');
const stepFourBack = page.slice(page.indexOf('onClick={handleUniNext}'), page.indexOf('Step 5: listing builder'));
assert(/setSellStep\(3\)/.test(stepFourBack), 'the signup entry path must keep its Back to the password step');
assert(stepFourBack.indexOf('cameFromDashboard') < stepFourBack.indexOf('setSellStep(3)'), 'the dashboard case must be handled before the signup fallback');

// Take down is one way, so it asks first and the question sits above everything.
assert(/const \[confirmTakedown, setConfirmTakedown\]/.test(page), 'take down must be confirmed before it runs');
assert(/onTakeDownListing=\{requestTakedown\}/.test(page), 'the workspace take down must go through the confirmation');
const escBody2 = page.slice(page.indexOf('Escape closes the top-most overlay'), page.indexOf('Scroll-reveal animations'));
assert(escBody2.indexOf('if (confirmTakedown)') < escBody2.indexOf('else if (matcherOpen)'), 'Escape must answer the confirmation before closing anything under it');
// Anchored on the scroll-lock line rather than its ending, so adding another
// confirmation to it does not read as take down having left it.
const lockLine = page.split('\n').find((line) => line.includes('const anyOpen ='));
assert(lockLine && lockLine.includes('confirmTakedown !== null'), 'the confirmation must join the body scroll lock');

// A failed drafts fetch reports, it does not invent a replacement draft.
assert(!/catch \{\n      await createSellerDraft/.test(page), 'a failed drafts fetch must not silently create a new draft');
assert(/That saved draft is no longer available/.test(page), 'a missing draft must say so');

// Client and server agree on what counts as an attached file.
assert(/const usesStagedAssets = Boolean\(activeDraftId\)/.test(page), 'validation must know which submit path will run');
assert(!/rows\.some\(\(r\) => !r\.file && !r\.assetId && !r\.sourceEssayId\)/.test(page), 'a browser File alone must not satisfy the draft submit path');
assert(/did not upload\. Please choose the file again\./.test(page), 'a failed staging upload must be surfaced');
assert((page.match(/did not upload\. Please choose the file again\./g) || []).length === 2, 'both essay and proof uploads must surface a staging failure');


console.log('listing wizard checks passed');
