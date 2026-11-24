// Word index and search over the bundled King James text.

export const STOP = new Set(
  'a am an and are art as at be because been being but by can could did do doth dost down even for from had hath have he her him his i if in into is it its let may me might my no nor not of on or our out over said saith say saying shall shalt she should so than that the thee their them then there therefore these they this those thou through thus thy to under unto up upon us was we were what when where which who whom whose will wilt with would ye yet you your'.split(' ')
);

export function wordsOf(text) {
  const plain = String(text || '').replace(/[<>\[\]]/g, '').toLowerCase().replace(/[\u2019]/g, "'");
  return plain.match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

export function pack(book, chapter, verse) {
  return (book << 16) | (chapter << 8) | verse;
}

export function unpack(id) {
  return { b: id >> 16, c: (id >> 8) & 255, v: id & 255 };
}

export function buildIndex(bible) {
  const index = new Map();
  for (let b = 0; b < bible.length; b += 1) {
    const book = bible[b];
    for (let c = 0; c < book.length; c += 1) {
      const chapter = book[c];
      for (let v = 0; v < chapter.length; v += 1) {
        const id = pack(b, c, v);
        const seen = new Set(wordsOf(chapter[v]));
        for (const word of seen) {
          if (STOP.has(word)) continue;
          let postings = index.get(word);
          if (!postings) {
            postings = [];
            index.set(word, postings);
          }
          postings.push(id);
        }
      }
    }
  }
  return index;
}

function containsSequence(words, phrase) {
  if (!phrase.length || phrase.length > words.length) return false;
  outer: for (let i = 0; i <= words.length - phrase.length; i += 1) {
    for (let j = 0; j < phrase.length; j += 1) {
      if (words[i + j] !== phrase[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function searchBible(bible, index, query, limit = 200) {
  const phrase = wordsOf(query);
  if (!phrase.length) return { error: 'empty', hits: [] };
  const content = phrase.filter((word) => !STOP.has(word));
  if (!content.length) return { error: 'common', hits: [] };

  let ids = [];
  if (content.length === 1) {
    const word = content[0];
    ids = (index.get(word) || []).slice();
    if (word.length >= 4) {
      for (const [key, postings] of index) {
        if (key !== word && key.startsWith(word)) ids.push(...postings);
      }
    }
  } else {
    const lists = content.map((word) => index.get(word) || []);
    if (lists.some((list) => list.length === 0)) {
      return { error: null, hits: [], capped: false };
    }
    lists.sort((a, b) => a.length - b.length);
    const [first, ...rest] = lists;
    const sets = rest.map((list) => new Set(list));
    ids = first.filter((id) => sets.every((set) => set.has(id)));
  }

  const hits = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const { b, c, v } = unpack(id);
    const text = bible[b][c][v];
    const verseWords = wordsOf(text);
    const exact = containsSequence(verseWords, phrase);
    if (!exact) {
      if (!(content.length === 1 && content[0].length >= 4 && verseWords.some((word) => word.startsWith(content[0])))) {
        continue;
      }
    }
    hits.push({ b, c, v, text });
    if (hits.length >= limit) break;
  }
  return { error: null, hits, capped: hits.length >= limit };
}
