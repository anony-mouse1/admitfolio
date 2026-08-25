import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const importTypeScript = async (source) => {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};

const account = await importTypeScript(read('lib/sellerAccount.ts'));
assert.equal(account.normalizeSellerEmail('  Student@Berkeley.EDU  '), 'student@berkeley.edu');
assert.equal(account.sellerCodePurpose('signup'), 'signup');
assert.equal(account.sellerCodePurpose('reset'), 'reset');
assert.equal(account.sellerCodePurpose('listing'), null);
assert.match(account.passwordProblem('short'), /at least 8/i);
assert.match(account.passwordProblem('x'.repeat(129)), /128 characters/i);
assert.equal(account.passwordProblem('long-enough'), null);

const tokenSource = read('lib/emailToken.ts')
  .replace("import 'server-only';", '')
  .replace("import { SESSION_SECRET } from './config';", "const SESSION_SECRET = 'seller-auth-test-secret';");
const tokens = await importTypeScript(tokenSource);
const signupToken = tokens.makeEmailToken('Student@Berkeley.EDU', 'signup');
const resetToken = tokens.makeEmailToken('student@berkeley.edu', 'reset');
const verifiedSignup = tokens.verifyEmailToken(signupToken.token, 'signup');
assert.equal(verifiedSignup.email, 'student@berkeley.edu');
assert.equal(verifiedSignup.purpose, 'signup');
assert.equal(verifiedSignup.id, signupToken.tokenId);
assert.equal(tokens.verifyEmailToken(signupToken.token, 'reset'), null, 'signup proof must not authorize reset');
assert.equal(tokens.verifyEmailToken(resetToken.token, 'signup'), null, 'reset proof must not authorize signup');
assert.equal(tokens.verifyEmailToken(`${signupToken.token}broken`, 'signup'), null, 'tampered token must fail');

const sendCode = read('app/api/send-code/route.ts');
assert.match(sendCode, /purpose === 'signup' && seller/);
assert.match(sendCode, /ACCOUNT_EXISTS/);
assert.match(sendCode, /email: \{ equals: lower, mode: 'insensitive' \}/);
assert.ok(
  sendCode.indexOf("purpose === 'signup' && seller") < sendCode.indexOf('prisma.loginCode.upsert'),
  'existing accounts must be rejected before a signup code is stored or sent',
);

const verifyCode = read('app/api/verify-code/route.ts');
assert.match(verifyCode, /entry\.purpose !== purpose/);
assert.match(verifyCode, /makeEmailToken\(email, purpose\)/);
assert.match(verifyCode, /emailActionToken\.create/, 'verified actions must get a server-side nonce');
assert.match(verifyCode, /\$transaction/, 'code consumption and token creation must be atomic');
assert.match(verifyCode, /loginCode\.deleteMany/, 'one OTP may issue only one action token');

const signup = read('app/api/seller/signup/route.ts');
assert.match(signup, /verifyEmailToken\(body\?\.emailToken, 'signup'\)/);
assert.match(signup, /email: \{ equals: email, mode: 'insensitive' \}/);
assert.match(signup, /tx\.seller\.create/);
assert.match(signup, /emailActionToken\.updateMany/, 'signup must consume its token once');
assert.match(signup, /error\.code === 'P2002'/);
assert.doesNotMatch(signup, /prisma\.seller\.(?:upsert|update)/, 'signup must never mutate an existing seller');

const reset = read('app/api/reset-password/route.ts');
assert.match(reset, /verifyEmailToken\(body\?\.emailToken, 'reset'\)/);
assert.match(reset, /where: \{ id: seller\.id \}/, 'reset must update the exact case-insensitive match');
assert.match(reset, /emailActionToken\.updateMany/, 'reset must consume its token once');

const login = read('app/api/seller-login/route.ts');
assert.match(login, /email: \{ equals: email, mode: 'insensitive' \}/);

const submit = read('app/api/submit-listing/route.ts');
assert.match(submit, /const session = await currentSeller\(\)/);
assert.match(submit, /email: \{ equals: email, mode: 'insensitive' \}/);
assert.doesNotMatch(submit, /emailToken\?:|password\?:|verifyEmailToken|hashPassword|makeSession/);
assert.doesNotMatch(submit, /prisma\.seller\.(?:create|upsert|update)/, 'listing submission must not create or alter accounts');

const schema = read('prisma/schema.prisma');
assert.match(schema, /purpose\s+String\s+@default\("signup"\)/);
const migration = read('prisma/migrations/20260824090000_seller_signup_security/migration.sql');
assert.match(migration, /ADD COLUMN "purpose"/);
assert.match(migration, /GROUP BY LOWER\(TRIM\("email"\)\)/);
assert.match(migration, /SET "email" = LOWER\(TRIM\("email"\)\)/);
assert.match(migration, /UNIQUE INDEX "Seller_email_lower_key"[\s\S]*LOWER\("email"\)/);
assert.match(migration, /CREATE TABLE "EmailActionToken"/);

console.log('seller auth tests passed');
