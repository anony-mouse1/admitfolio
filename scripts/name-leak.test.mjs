// node scripts/name-leak.test.mjs
//
// No database, no keys, no framework. Exits non-zero on a failure.
//
// The names below are invented. Do not paste a real seller's name into this
// file: it is committed, and the repository is public.

import { nameLeak } from './name-leak.mjs';

const CASES = [
  // [seller name, sentence, should it be rejected?]

  // The case this guard exists for.
  ['Jane Kaur', 'My name is Jane Kaur, and the first thing I remember is the smell of turmeric.', true],
  // Possessive and hyphenated forms still contain the name.
  ['Jane Kaur', 'Kaur’s Bakery sat on the corner of a street I never learned the name of.', true],
  ['Jane Kaur', 'I am Jane Kaur-Smith and I have never once been on time.', true],
  // Ordinary openings must survive, including third-person scene setting.
  ['Jane Kaur', 'The new student stumbled while the others moved in synchrony.', false],
  ['Jane Kaur', 'I was seven when I learned that a jar of pickles could start a war.', false],

  // A given name that is also an ordinary word: capitalised is rejected,
  // lower case is kept.
  ['Grace Okonkwo', 'Grace slammed the door and the whole house went quiet.', true],
  ['Grace Okonkwo', 'She moved with a grace that made the rest of us look like scaffolding.', false],
  ['Grace Okonkwo', 'My mother called me Okonkwo when she was angry.', true],
  ['May Chen', 'May had always been the loudest month in our house.', true],
  ['May Chen', 'I thought I may never understand why he left.', false],

  // The account has a straight apostrophe, the PDF has a curly one.
  ['Siobhan O\'Brien', 'The O’Brien name meant nothing outside our county.', true],
  ['Siobhan O\'Brien', 'The kettle screamed and nobody moved to lift it.', false],

  // One-word name: the full-name rule is the only one that can fire.
  ['Madonna', 'Madonna was not a name you gave a child in our town.', true],
  ['Madonna', 'The choir sang until the windows shook.', false],

  // Short surname, still matched.
  ['Li Wei', 'Wei taught me to fold the dumpling closed with one thumb.', true],

  // A middle initial is dropped, so the full-name rule misses and the surname
  // rule has to carry it.
  ['Jane J. Kaur', 'Jane J. Kaur, aged nine, decided she would never eat rice again.', true],

  // A name buried inside a longer word is not a match.
  ['Ana Mackaur', 'The mackaurel glittered in the bucket like wet coins.', false],

  // No name on the account.
  [null, 'A sentence with no seller name on file at all.', false],
  ['', 'An empty name must not reject everything.', false],
  ['  ', 'Whitespace only, same.', false],
];

let failed = 0;
for (const [name, sentence, want] of CASES) {
  const got = nameLeak(sentence, name);
  if (Boolean(got) !== want) {
    failed++;
    console.error(`FAIL  expected ${want ? 'reject' : 'keep'}, got ${got || 'keep'}`);
    console.error(`      name=${JSON.stringify(name)}  sentence=${JSON.stringify(sentence)}`);
  }
}

console.log(failed ? `${failed} of ${CASES.length} failed` : `${CASES.length} passed`);
process.exit(failed ? 1 : 0);
