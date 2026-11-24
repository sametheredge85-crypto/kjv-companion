import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOOKS } from './books.js';
import { buildHash, formatRef, parseHash, parseReference, quoteVerse, versePlain } from './ref.js';
import { buildIndex, searchBible } from './search.js';

const bible = JSON.parse(readFileSync(new URL('../data/kjv.json', import.meta.url), 'utf8'));

test('book table matches the bundled text', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(bible.length, 66);
  assert.equal(bible.reduce((sum, book) => sum + book.reduce((n, chapter) => n + chapter.length, 0), 0), 31102);
  BOOKS.forEach((book, index) => {
    assert.equal(book.chapters, bible[index].length, book.name);
  });
});

test('spot-check verses stay exact', () => {
  assert.equal(
    bible[0][1][6],
    'And the LORD God formed man [of] the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.'
  );
  assert.equal(
    bible[42][2][15],
    'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
  );
  assert.equal(
    bible[45][1][13],
    'But the natural man receiveth not the things of the Spirit of God: for they are foolishness unto him: neither can he know [them], because they are spiritually discerned.'
  );
  assert.equal(
    bible[45][1][12],
    "Which things also we speak, not in the words which man's wisdom teacheth, but which the Holy Ghost teacheth; comparing spiritual things with spiritual."
  );
  assert.equal(bible[18][22][0], '<<A Psalm of David.>> The LORD [is] my shepherd; I shall not want.');
  assert.equal(
    bible[1][31][31],
    'Yet now, if thou wilt forgive their sin—; and if not, blot me, I pray thee, out of thy book which thou hast written.'
  );
});

test('parse common references', () => {
  const john = parseReference('John 3:16');
  assert.equal(john.bookIndex, 42);
  assert.equal(john.chapter, 3);
  assert.equal(john.start, 16);
  assert.equal(john.end, 16);

  assert.deepEqual(
    [parseReference('jn 3.16').chapter, parseReference('jn 3.16').start],
    [3, 16]
  );
  assert.equal(parseReference('1 Cor 2:14').bookIndex, 45);
  assert.equal(parseReference('I Corinthians 2:14').bookIndex, 45);
  assert.equal(parseReference('1cor 2:14').start, 14);
  assert.equal(parseReference('Psalm 23').chapter, 23);
  assert.equal(parseReference('Ps 23:1-6').end, 6);
  assert.equal(parseReference('Song of Solomon 2:1').bookIndex, 21);
  assert.equal(parseReference('song of songs 2:1').bookIndex, 21);
  assert.equal(parseReference('Gen 2:7').bookIndex, 0);
  assert.equal(parseReference('3 John 4').chapter, 1);
  assert.equal(parseReference('3 John 4').start, 4);
  assert.equal(parseReference('Jude 24').start, 24);
  assert.equal(parseReference('3 John 1:4').start, 4);
  assert.equal(parseReference('John 3:16-18').end, 18);
  assert.equal(parseReference('  john   3 : 16  ').start, 16);
  assert.equal(parseReference('Isa 9:6').bookIndex, 22);
  assert.equal(parseReference('John 99').error, 'chapter');
  assert.equal(parseReference('heaven and the earth'), null);
  assert.equal(parseReference('John').wholeBook, true);
});

test('hash round trip and quoted copy', () => {
  const route = { view: 'read', bookIndex: 45, chapter: 2, start: 14, end: 14 };
  const hash = buildHash(route);
  assert.equal(parseHash(hash).bookIndex, 45);
  assert.equal(parseHash(hash).start, 14);
  assert.equal(parseHash(buildHash({ view: 'read', bookIndex: 42, chapter: 3, start: 16, end: 18 })).end, 18);
  assert.equal(parseHash(buildHash({ view: 'harmony', bookIndex: 42, chapter: 3, verse: 16 })).view, 'harmony');
  assert.equal(parseHash(buildHash({ view: 'search', q: 'only begotten' })).q, 'only begotten');

  const quoted = quoteVerse(bible[42][2][15], formatRef(42, 3, 16, 16));
  assert.equal(
    quoted,
    '"For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." (John 3:16)'
  );
  assert.equal(
    versePlain(bible[18][22][0]),
    'A Psalm of David. The LORD [is] my shepherd; I shall not want.'
  );
  assert.equal(quoteVerse(bible[0][1][6], 'Genesis 2:7').includes('[of]'), true);
  assert.equal(quoteVerse(bible[45][1][13], '1 Corinthians 2:14').includes('[them]'), true);
});

test('search finds words, phrases, and supplied words', () => {
  const index = buildIndex(bible);
  const begotten = searchBible(bible, index, 'only begotten');
  assert.ok(begotten.hits.some((hit) => hit.b === 42 && hit.c === 2 && hit.v === 15));

  const shepherd = searchBible(bible, index, 'shepherd');
  assert.ok(shepherd.hits.some((hit) => hit.b === 18 && hit.c === 22 && hit.v === 0));

  const land = searchBible(bible, index, 'dry land');
  assert.ok(land.hits.some((hit) => hit.text.includes('[land]')));

  const quickened = searchBible(bible, index, 'quickened');
  assert.ok(quickened.hits.some((hit) => hit.text.toLowerCase().includes('quickened')));

  const common = searchBible(bible, index, 'the');
  assert.equal(common.error, 'common');

  const spirit = searchBible(bible, index, 'spirit of God');
  assert.ok(spirit.hits.some((hit) => hit.b === 45 && hit.c === 1 && hit.v === 13));
});
