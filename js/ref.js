// Reference parsing and verse text helpers. No network, no DOM.

import { BOOKS } from './books.js';

const ALIASES = [];
BOOKS.forEach((book, index) => {
  for (const alias of book.aliases) {
    ALIASES.push({ alias, index });
  }
});
ALIASES.sort((a, b) => b.alias.length - a.alias.length);

export function normalizeQuery(input) {
  let text = String(input || '').trim().toLowerCase();
  text = text.replace(/[\u2013\u2014]/g, '-');
  text = text.replace(/(\d)\s*\.\s*(\d)/g, '$1:$2');
  text = text.replace(/\./g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export function parseReference(input) {
  const text = normalizeQuery(input);
  if (!text) return null;

  for (const { alias, index } of ALIASES) {
    let rest = null;
    if (text === alias) {
      return { bookIndex: index, chapter: 1, start: null, end: null, wholeBook: true };
    }
    if (text.startsWith(alias + ' ')) {
      rest = text.slice(alias.length).trim();
    } else {
      continue;
    }

    const match = rest.match(/^(\d+)\s*(?::\s*(\d+)\s*(?:-\s*(\d+))?)?$/);
    if (!match) continue;

    let chapter = Number(match[1]);
    let start = match[2] ? Number(match[2]) : null;
    let end = match[3] ? Number(match[3]) : start;
    if (chapter < 1 || (start !== null && start < 1)) {
      return { error: 'verse', bookIndex: index, chapter };
    }
    if (start !== null && end < start) {
      return { error: 'range', bookIndex: index, chapter };
    }
    // Books with one chapter are often cited as "Jude 3" or "3 John 4".
    if (BOOKS[index].chapters === 1 && start === null && chapter > 1) {
      start = chapter;
      end = chapter;
      chapter = 1;
    }
    if (chapter > BOOKS[index].chapters) {
      return { error: 'chapter', bookIndex: index, chapter };
    }
    return { bookIndex: index, chapter, start, end, wholeBook: false };
  }
  return null;
}

export function formatRef(bookIndex, chapter, start, end) {
  const name = BOOKS[bookIndex].name;
  if (!chapter) return name;
  if (!start) return `${name} ${chapter}`;
  if (!end || end === start) return `${name} ${chapter}:${start}`;
  return `${name} ${chapter}:${start}-${end}`;
}

export function formatTuple(ref) {
  if (!ref) return '';
  if (ref.length === 5) {
    const [book, chapter, verse, endChapter, endVerse] = ref;
    if (endChapter === chapter) return formatRef(book, chapter, verse, endVerse);
    return `${BOOKS[book].name} ${chapter}:${verse} to ${endChapter}:${endVerse}`;
  }
  const [book, chapter, verse, endVerse] = ref;
  return formatRef(book, chapter, verse, endVerse);
}

export function splitVerse(text) {
  let body = String(text || '');
  let title = '';
  let note = '';
  const start = body.match(/^<<([^>]*)>>\s*/);
  if (start) {
    title = start[1];
    body = body.slice(start[0].length);
  }
  const end = body.match(/\s*<<([^>]*)>>\s*$/);
  if (end) {
    note = end[1];
    body = body.slice(0, end.index).trimEnd();
  }
  return { title, body, note };
}

export function versePlain(text) {
  const parts = splitVerse(text);
  return [parts.title, parts.body, parts.note].filter(Boolean).join(' ');
}

export function quoteVerse(text, reference) {
  return `"${versePlain(text)}" (${reference})`;
}

export function buildHash(route) {
  if (!route || route.view === 'home') return '#/';
  if (route.view === 'saved') return '#/saved';
  if (route.view === 'about') return '#/about';
  if (route.view === 'compare') return '#/compare';
  if (route.view === 'books') return '#/books';
  if (route.view === 'chapters') return `#/books/${route.bookIndex + 1}`;
  if (route.view === 'search') return `#/search/${encodeURIComponent(route.q || '')}`;
  const name = encodeURIComponent(BOOKS[route.bookIndex].name);
  if (route.view === 'harmony') {
    return `#/harmony/${name}/${route.chapter}/${route.verse}`;
  }
  let hash = `#/read/${name}/${route.chapter}`;
  if (route.start) {
    hash += `/${route.start}`;
    if (route.end && route.end !== route.start) hash += `-${route.end}`;
  }
  return hash;
}

export function parseHash(hash) {
  let parts;
  try {
    const raw = String(hash || '').replace(/^#/, '');
    parts = raw.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { view: 'home' };
  }
  if (parts.length === 0) return { view: 'home' };
  const head = parts[0];
  if (head === 'saved') return { view: 'saved' };
  if (head === 'about') return { view: 'about' };
  if (head === 'compare') return { view: 'compare' };
  if (head === 'books') {
    if (parts[1]) {
      const number = Number(parts[1]);
      if (number >= 1 && number <= BOOKS.length) return { view: 'chapters', bookIndex: number - 1 };
    }
    return { view: 'books' };
  }
  if (head === 'search') return { view: 'search', q: parts.slice(1).join('/') };
  if (head === 'read' || head === 'harmony') {
    const bookIndex = BOOKS.findIndex((book) => book.name.toLowerCase() === String(parts[1] || '').toLowerCase());
    if (bookIndex < 0) return { view: 'home', message: 'That book is not in this Bible.' };
    const chapter = Number(parts[2]);
    if (!chapter) return { view: 'chapters', bookIndex };
    if (chapter < 1 || chapter > BOOKS[bookIndex].chapters) {
      return { view: 'home', message: `${BOOKS[bookIndex].name} has ${BOOKS[bookIndex].chapters} chapters.` };
    }
    let start = null;
    let end = null;
    if (parts[3]) {
      const match = String(parts[3]).match(/^(\d+)(?:-(\d+))?$/);
      if (!match) return { view: 'home', message: 'That verse reference is not valid.' };
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : start;
      if (end < start) return { view: 'home', message: 'That verse range is not valid.' };
    }
    if (head === 'harmony') {
      return { view: 'harmony', bookIndex, chapter, verse: start || 1 };
    }
    return { view: 'read', bookIndex, chapter, start, end: end || start };
  }
  return { view: 'home' };
}
