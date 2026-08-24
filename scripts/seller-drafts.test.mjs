import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const helperSource = fs.readFileSync(new URL('../lib/sellerDraft.ts', import.meta.url), 'utf8');
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("from '@/lib/anonymity'", "from './anonymity.js'");
const anonymitySource = fs.readFileSync(new URL('../lib/anonymity.ts', import.meta.url), 'utf8');
const anonymityJs = ts.transpileModule(anonymitySource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const anonymityUrl = `data:text/javascript;base64,${Buffer.from(anonymityJs).toString('base64')}`;
const linked = helperJs.replace("from './anonymity.js'", `from '${anonymityUrl}'`);
const draft = await import(`data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`);

const state = draft.sanitizeSellerDraftState({
  currentUniversity: '  University of Washington  ',
  admits: ['Stanford', 'Stanford', 'UC Berkeley'],
  anonymity: 'firstName',
  packagePrice: '24.4',
  essays: [{ clientKey: 'essay-1', sourceEssayId: 'essay-original', sourceFileName: 'original.pdf', prompt: 'Why us?', question: 'A\nquestion', price: 8 }],
});
assert.equal(state.currentUniversity, 'University of Washington');
assert.deepEqual(state.admits, ['Stanford', 'UC Berkeley']);
assert.equal(state.anonymity, 'revealOnPurchase');
assert.equal(state.packagePrice, 24);
assert.equal(state.essays[0].question, 'A question');
assert.equal(state.essays[0].sourceEssayId, 'essay-original');
assert.equal(state.essays[0].sourceFileName, 'original.pdf');
assert.equal(draft.safeDraftStep(99), 8);
assert.equal(draft.safeDraftClientKey('../unsafe'), null);
assert.equal(draft.safeDraftClientKey('essay_1'), 'essay_1');

const collection = fs.readFileSync(new URL('../app/api/seller/drafts/route.ts', import.meta.url), 'utf8');
const item = fs.readFileSync(new URL('../app/api/seller/drafts/[id]/route.ts', import.meta.url), 'utf8');
assert.match(collection, /authenticatedSeller\(\)/, 'draft list/create must require seller auth');
assert.match(item, /sellerId:\s*seller\.id/, 'draft reads and writes must enforce ownership');
assert.match(item, /revision:\s*\{\s*increment:\s*1\s*\}/, 'autosave must increment the revision');
assert.match(item, /DRAFT_CONFLICT/, 'concurrent autosave must return a conflict');
assert.match(item, /status:\s*'abandoned'/, 'discard must be recoverable, not a permanent delete');

const assets = fs.readFileSync(new URL('../app/api/seller/drafts/[id]/assets/route.ts', import.meta.url), 'utf8');
assert.match(assets, /sellerId:\s*seller\.id, status:\s*'draft'/, 'asset upload must enforce draft ownership');
assert.match(assets, /drafts\/\$\{seller\.id\}\/\$\{draft\.id\}/, 'assets must use a private seller and draft path');
assert.match(assets, /createHash\('sha256'\)/, 'draft assets must record a content hash');
assert.match(assets, /draftId_kind_clientKey/, 'replacing one file row must be idempotent');
assert.doesNotMatch(assets, /return NextResponse\.json\(\{ ok: true, storagePath/, 'private storage paths must not be returned');

const finalize = fs.readFileSync(new URL('../app/api/seller/drafts/[id]/finalize/route.ts', import.meta.url), 'utf8');
assert.match(finalize, /status === 'submitted'.*finalizedListingId/s, 'finalize retries must return the existing listing');
assert.match(finalize, /status:\s*'finalizing'/, 'finalize must claim the draft before creating a listing');
assert.match(finalize, /status:\s*'submitted', finalizedListingId:/, 'finalize must persist its one listing result');
assert.match(finalize, /pdfPath:\s*essayFiles\[index\]!\.storagePath/, 'finalize must use staged or revision essay files');
assert.match(finalize, /draft\.sourceListing\?\.essays\.find/, 'revision finalization must preserve unchanged source assets');
assert.match(finalize, /sendSubmissionConfirmation/, 'email must run only after successful finalization');
assert.doesNotMatch(finalize.split('sendAdminSubmissionNotification')[0], /sendSubmissionConfirmation\(/, 'email cannot precede the transaction');

console.log('seller draft tests passed');
