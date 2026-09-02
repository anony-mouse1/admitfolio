#!/usr/bin/env node

// Checks for the inline control panels (items 20 and 23) and the class-year
// refetch (item 22).
//
// The workspace is behind the seller login, so the panels themselves are
// asserted against the source. What runs in a browser is the public page, as a
// regression check that removing ListingCard and its CSS broke nothing, at both
// widths. The app URL must be localhost: Next's dev server serves
// /_next/static only to the origin it was started on.

import fs from 'node:fs';

function assert(condition, message) { if (!condition) throw new Error(message); }

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../components/seller/SellerApplicationsWorkspace.tsx', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../components/seller/ListingPricePanel.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

// Item 20: the outcome editor lives inside the card that opens it.
assert(/editingApplicationKey === application\.key \?/.test(workspace), 'the outcome editor must render inside its own application card');
assert(!/dash-application-editor/.test(page), 'the old out-of-workspace editor must be gone');
assert(!/dash-application-editor/.test(css), 'its orphaned styles must go too');
assert(/onCancelApplicationEdit\?\.\(\)/.test(workspace), 'the editor must offer a way out where it was opened');

// Item 23: the price panel opens under its own row, and Edit becomes Close.
assert(/activeListingId === listing\.id && onSaveListingPrice/.test(workspace), 'the price panel must render inside the listing row');
assert(/activeListingId === listing\.id \? 'Close'/.test(workspace), 'the button that opened the panel must close it');
assert(!/dash-listing-controls/.test(page), 'the old after-the-workspace card must be gone');
assert(!/dash-listing-controls/.test(css), 'its orphaned styles must go too');
assert(!/function ListingCard\(/.test(page), 'ListingCard is replaced by the inline panel and must not linger');

// The panel keeps what ListingCard used to show, and the batch 2 price rules.
assert(/listing\.sales/.test(panel) && /Added \{added\}/.test(panel), 'the panel must keep the sales count and added date');
assert(/Number\.isInteger\(amount\)/.test(panel), 'whole dollars only');
assert(/step=\{1\}/.test(panel), 'price inputs stay whole-dollar stepped');
assert(/listing\.priceFloor/.test(panel), 'the tier floor is resolved server-side and honoured here');

// Item 22: refetch, never patch by a key the save just invalidated.
const saveBody = page.slice(page.indexOf('async function saveApplicationOutcome'), page.indexOf('function editWorkspaceListing'));
assert(/reloadDashboardRef\.current\?\.\(\)/.test(saveBody), 'a saved class year must refetch the dashboard');
assert(!/application\.key === editingApplication\.key/.test(saveBody), 'it must not patch by the group key the save invalidated');

console.log('inline control checks passed');
