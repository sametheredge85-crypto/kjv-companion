import { BOOKS } from './books.js';
import {
  buildHash,
  formatRef,
  formatTuple,
  parseHash,
  parseReference,
  quoteVerse,
  splitVerse,
} from './ref.js';
import { STOP, buildIndex, searchBible, wordsOf } from './search.js';

const LIBRARY_KEY = 'kjv-harmony-library';
const SIZE_KEY = 'kjv-harmony-size';

const main = document.getElementById('main');
const toastEl = document.getElementById('toast');
const queryInput = document.getElementById('q');

const bibleState = { data: null, promise: null };
const tskCache = new Map();
let indexPromise = null;
let renderToken = 0;
let toastTimer = 0;
let booted = false;

const session = {
  compare: {
    left: '',
    right: '',
    leftPassage: null,
    rightPassage: null,
  },
};

function loadLibrary() {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
    return {
      saved: Array.isArray(data.saved) ? data.saved : [],
      last: data.last || null,
      recent: Array.isArray(data.recent) ? data.recent : [],
    };
  } catch {
    return { saved: [], last: null, recent: [] };
  }
}

let library = loadLibrary();

function persist() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    toast('This phone could not store that note.');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightFragment(fragment, words) {
  let html = escapeHtml(fragment);
  const keys = [...new Set((words || []).filter((word) => word && !STOP.has(word)))]
    .sort((a, b) => b.length - a.length);
  for (const word of keys) {
    const pattern = new RegExp(`\\b(${escapeRegExp(word)}[A-Za-z']*)\\b`, 'gi');
    html = html.replace(pattern, '<mark>$1</mark>');
  }
  return html;
}

function richText(fragment, words) {
  return String(fragment).split(/(\[[^\]]+\])/g).map((part) => {
    if (part.startsWith('[')) {
      return `<span class="supplied">${highlightFragment(part, words)}</span>`;
    }
    return highlightFragment(part, words);
  }).join('');
}

function verseHtml(text, words) {
  const parts = splitVerse(text);
  let html = '';
  if (parts.title) html += `<span class="title-line">${richText(parts.title, words)}</span>`;
  html += richText(parts.body, words);
  if (parts.note) html += `<span class="note-line">${richText(parts.note, words)}</span>`;
  return html;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function loadBible() {
  if (bibleState.data) return Promise.resolve(bibleState.data);
  if (!bibleState.promise) {
    bibleState.promise = fetch('data/kjv.json')
      .then((response) => {
        if (!response.ok) throw new Error('Bible text did not load');
        return response.json();
      })
      .then((data) => {
        bibleState.data = data;
        return data;
      })
      .catch((error) => {
        bibleState.promise = null;
        throw error;
      });
  }
  return bibleState.promise;
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = loadBible().then((bible) => buildIndex(bible));
  }
  return indexPromise;
}

function loadTsk(bookIndex) {
  if (tskCache.has(bookIndex)) return Promise.resolve(tskCache.get(bookIndex));
  const url = `data/tsk/${bookIndex + 1}.json`;
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error('Cross-references did not load');
      return response.json();
    })
    .then((data) => {
      tskCache.set(bookIndex, data);
      return data;
    });
}

function findSaved(b, c, v) {
  return library.saved.find((item) => item.b === b && item.c === c && item.v === v);
}

function remember(bookIndex, chapter, verse) {
  library.last = { b: bookIndex, c: chapter - 1, v: verse - 1 };
  const key = `${bookIndex}.${chapter}.${verse}`;
  library.recent = [
    { b: bookIndex, c: chapter - 1, v: verse - 1 },
    ...library.recent.filter((item) => `${item.b}.${item.c + 1}.${item.v + 1}` !== key),
  ].slice(0, 6);
  persist();
}

function navigate(route) {
  const next = buildHash(route);
  if (location.hash === next) render();
  else location.hash = next;
}

function setTab(name) {
  document.body.dataset.view = name || 'page';
  document.querySelectorAll('.tabbar button').forEach((button) => {
    const on = Boolean(name) && button.dataset.go === name;
    button.classList.toggle('active', on);
    if (on) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function reflectQuery(text) {
  if (document.activeElement !== queryInput) queryInput.value = text;
}

function loadingHtml(text) {
  return `<p class="lede">${escapeHtml(text)}</p>`;
}

function messageHtml(text, retry) {
  return `<div class="message"><p>${escapeHtml(text)}</p>${retry ? '<p><button type="button" data-act="retry">Try again</button></p>' : ''}</div>`;
}

function homeHtml() {
  const examples = [
    ['John 3:16', 'A single verse'],
    ['Genesis 1', 'A whole chapter'],
    ['Psalms 23', 'A psalm'],
    ['1 Corinthians 2', 'A chapter in the letters'],
  ];
  const recent = library.recent.slice(0, 4).map((item) => {
    const ref = formatRef(item.b, item.c + 1, item.v + 1, item.v + 1);
    return `<button type="button" class="choice" data-act="goto" data-ref="${escapeHtml(ref)}"><strong>${escapeHtml(ref)}</strong><span>Open again</span></button>`;
  }).join('');
  return `
    <h1>Read the King James Bible</h1>
    <p class="lede">Look up a verse, search a word, and read related scriptures beside it.</p>
    <div class="stack">
      ${examples.map(([ref, hint]) => `<button type="button" class="choice" data-act="goto" data-ref="${escapeHtml(ref)}"><strong>${escapeHtml(ref)}</strong><span>${escapeHtml(hint)}</span></button>`).join('')}
      <button type="button" class="choice" data-act="books"><strong>Choose a book</strong><span>All 66 books, Old Testament and New Testament</span></button>
    </div>
    ${recent ? `<h2>Opened lately</h2><div class="stack">${recent}</div>` : ''}
    <p class="quiet">Words the translators supplied are shown in [brackets]. Tap a verse to copy it, save it, or open related verses.</p>
  `;
}

function booksHtml() {
  const group = (testament, label) => {
    const items = BOOKS.map((book, index) => ({ book, index }))
      .filter((item) => item.book.testament === testament)
      .map((item) => `<button type="button" class="choice" data-act="chapters" data-b="${item.index}"><strong>${escapeHtml(item.book.name)}</strong><span>${item.book.chapters} chapters</span></button>`)
      .join('');
    return `<h2>${label}</h2><div class="stack">${items}</div>`;
  };
  return `<h1>Books</h1>${group('OT', 'Old Testament')}${group('NT', 'New Testament')}`;
}

function chaptersHtml(bookIndex) {
  const book = BOOKS[bookIndex];
  const buttons = Array.from({ length: book.chapters }, (_, i) => {
    const chapter = i + 1;
    return `<button type="button" data-act="open-chapter" data-b="${bookIndex}" data-ch="${chapter}">${chapter}</button>`;
  }).join('');
  return `
    <h1>${escapeHtml(book.name)}</h1>
    <p class="quiet">${book.chapters} chapters. Choose one.</p>
    <div class="chapters">${buttons}</div>
    <p><button type="button" class="linkish" data-act="books">All books</button></p>
  `;
}

function shiftChapter(bookIndex, chapter, delta) {
  let b = bookIndex;
  let c = chapter + delta;
  if (c < 1) {
    b -= 1;
    if (b < 0) return null;
    c = BOOKS[b].chapters;
  } else if (c > BOOKS[b].chapters) {
    b += 1;
    if (b >= BOOKS.length) return null;
    c = 1;
  }
  return { b, c };
}

function chapterHtml(bible, bookIndex, chapter, start, end) {
  const verses = bible[bookIndex][chapter - 1];
  const prev = shiftChapter(bookIndex, chapter, -1);
  const next = shiftChapter(bookIndex, chapter, 1);
  const head = `
    <div class="passage-head">
      <button type="button" data-act="shift" data-b="${bookIndex}" data-ch="${chapter}" data-delta="-1" ${prev ? '' : 'disabled'}>Prev</button>
      <button type="button" class="where" data-act="chapters" data-b="${bookIndex}">${escapeHtml(BOOKS[bookIndex].name)} ${chapter}</button>
      <button type="button" data-act="shift" data-b="${bookIndex}" data-ch="${chapter}" data-delta="1" ${next ? '' : 'disabled'}>Next</button>
    </div>`;
  const items = verses.map((text, index) => {
    const verse = index + 1;
    const on = start && verse >= start && verse <= (end || start);
    const saved = findSaved(bookIndex, chapter - 1, index);
    return `
      <li class="verse${on ? ' target' : ''}" id="v${verse}">
        <div class="num">${verse}</div>
        <div>
          <button type="button" class="verse-text" data-act="toggle">${verseHtml(text)}</button>
          <div class="actions">
            <button type="button" data-act="copy" data-b="${bookIndex}" data-ch="${chapter}" data-v="${verse}">Copy</button>
            <button type="button" data-act="save" data-b="${bookIndex}" data-ch="${chapter}" data-v="${verse}">${saved ? 'Remove' : 'Save'}</button>
            <button type="button" data-act="harmony" data-b="${bookIndex}" data-ch="${chapter}" data-v="${verse}">Harmony</button>
            <button type="button" data-act="compare" data-b="${bookIndex}" data-ch="${chapter}" data-v="${verse}">Compare</button>
            <textarea data-note="1" data-b="${bookIndex}" data-ch="${chapter}" data-v="${verse}" placeholder="Write a note. It stays on this phone.">${saved ? escapeHtml(saved.note || '') : ''}</textarea>
          </div>
        </div>
      </li>`;
  }).join('');
  const tail = `
    <div class="chapter-jump">
      <button type="button" data-act="shift" data-b="${bookIndex}" data-ch="${chapter}" data-delta="-1" ${prev ? '' : 'disabled'}>Prev</button>
      <button type="button" data-act="copy-range" data-b="${bookIndex}" data-ch="${chapter}" data-v="${start || 1}" data-end="${end || verses.length}">Copy passage</button>
      <button type="button" data-act="shift" data-b="${bookIndex}" data-ch="${chapter}" data-delta="1" ${next ? '' : 'disabled'}>Next</button>
    </div>`;
  return `${head}<ol class="verses">${items}</ol>${tail}`;
}

function verseAt(bible, bookIndex, chapter, verse) {
  const chapterText = bible[bookIndex] && bible[bookIndex][chapter - 1];
  if (!chapterText || verse < 1 || verse > chapterText.length) return null;
  return chapterText[verse - 1];
}

function copyRange(bible, bookIndex, chapter, start, end) {
  const lines = [];
  for (let verse = start; verse <= end; verse += 1) {
    const text = verseAt(bible, bookIndex, chapter, verse);
    if (!text) break;
    lines.push(versePlain(text));
  }
  if (lines.length === 1) return quoteVerse(lines[0], formatRef(bookIndex, chapter, start, start));
  const numbered = lines.map((line, index) => `${start + index} ${line}`).join(' ');
  return `"${numbered}" (${formatRef(bookIndex, chapter, start, start + lines.length - 1)})`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Copied');
}

function refsFor(entry) {
  if (!entry) return [];
  return entry;
}

function harmonyCard(bible, ref) {
  const book = ref[0];
  const chapter = ref[1];
  const verse = ref[2];
  let endChapter = chapter;
  let endVerse = ref[3];
  if (ref.length === 5) {
    endChapter = ref[3];
    endVerse = ref[4];
  }
  if (!verseAt(bible, book, chapter, verse)) return '';
  const label = formatTuple(ref);
  const texts = [];
  if (endChapter !== chapter) {
    texts.push({ n: verse, text: verseAt(bible, book, chapter, verse) });
  } else {
    const last = Math.min(endVerse, verse + 2);
    for (let n = verse; n <= last; n += 1) {
      const text = verseAt(bible, book, chapter, n);
      if (text) texts.push({ n, text });
    }
  }
  const more = endChapter !== chapter || endVerse > verse + 2;
  const body = texts.map((item) => `<p>${texts.length > 1 ? `<span class="vn">${item.n}</span>` : ''}${verseHtml(item.text)}</p>`).join('');
  const moreButton = more
    ? `<button type="button" class="linkish" data-act="open-read" data-b="${book}" data-ch="${chapter}" data-v="${verse}" data-end="${endChapter === chapter ? endVerse : verse}">Read ${escapeHtml(label)}</button>`
    : '';
  return `
    <article class="xref">
      <button type="button" class="xref-ref" data-act="open-read" data-b="${book}" data-ch="${chapter}" data-v="${verse}" data-end="${endChapter === chapter ? endVerse : verse}">${escapeHtml(label)}</button>
      ${body}
      ${moreButton}
      <button type="button" class="linkish" data-act="harmony" data-b="${book}" data-ch="${chapter}" data-v="${verse}">Related verses</button>
    </article>`;
}

function aboutHtml() {
  const size = localStorage.getItem(SIZE_KEY) || 'md';
  const pressed = (name) => (size === name ? 'true' : 'false');
  return `
    <h1>About this Bible</h1>
    <p class="lede">KJV Harmony is a King James Bible for reading and study. It keeps the text on this phone after the first load.</p>
    <p>Type a verse, such as John 3:16. Type a word to search. Tap a verse to copy it, save it, or open Harmony. Harmony places cross-references from the Treasury of Scripture Knowledge beside the verse, so one scripture can be read next to another. Compare shows two passages at the same time.</p>
    <p>Words the translators supplied are printed in [brackets] and in italics. Psalm titles and the short notes at the end of some letters are shown in italics as well.</p>
    <h2>Text size</h2>
    <div class="sizes">
      <button type="button" data-act="size" data-size="sm" aria-pressed="${pressed('sm')}" aria-label="Smaller text">A</button>
      <button type="button" data-act="size" data-size="md" aria-pressed="${pressed('md')}" aria-label="Text size" style="font-size:1.25rem">A</button>
      <button type="button" data-act="size" data-size="lg" aria-pressed="${pressed('lg')}" aria-label="Larger text" style="font-size:1.55rem">A</button>
    </div>
    <h2>On an iPhone</h2>
    <p>Open this page in Safari. Tap the Share button, then tap Add to Home Screen. After the Bible has loaded once, you can read it without a connection. Saved verses and notes stay on this phone. They are not sent anywhere.</p>
    <p class="quiet">Text: King James Version, Cambridge edition, public domain. Cross-references: Treasury of Scripture Knowledge, public domain.</p>
  `;
}

function savedHtml(bible) {
  if (!library.saved.length) {
    return `<h1>Saved</h1><p class="lede">No verses saved yet.</p><p>Open a verse and tap Save. Notes stay on this phone.</p>`;
  }
  const cards = library.saved.map((item) => {
    const text = bible ? verseAt(bible, item.b, item.c + 1, item.v + 1) : '';
    const ref = formatRef(item.b, item.c + 1, item.v + 1, item.v + 1);
    return `
      <article class="saved-card">
        <button type="button" class="xref-ref" data-act="open-read" data-b="${item.b}" data-ch="${item.c + 1}" data-v="${item.v + 1}" data-end="${item.v + 1}">${escapeHtml(ref)}</button>
        <p>${text ? verseHtml(text) : ''}</p>
        ${item.note ? `<p class="quiet">${escapeHtml(item.note)}</p>` : ''}
        <div class="row">
          <button type="button" data-act="copy" data-b="${item.b}" data-ch="${item.c + 1}" data-v="${item.v + 1}">Copy</button>
          <button type="button" data-act="harmony" data-b="${item.b}" data-ch="${item.c + 1}" data-v="${item.v + 1}">Harmony</button>
          <button type="button" data-act="remove" data-b="${item.b}" data-ch="${item.c + 1}" data-v="${item.v + 1}">Remove</button>
        </div>
      </article>`;
  }).join('');
  return `<h1>Saved</h1>${cards}`;
}

function searchHtml(result, query) {
  if (result.error === 'common') {
    return `<h1>Search</h1><div class="message"><p>That word is in too many verses to search by itself. Add another word.</p></div>`;
  }
  if (!result.hits.length) {
    return `<h1>Search</h1><div class="message"><p>No verse contains "${escapeHtml(query)}".</p></div>`;
  }
  const words = wordsOf(query);
  const cards = result.hits.map((hit) => {
    const ref = formatRef(hit.b, hit.c + 1, hit.v + 1, hit.v + 1);
    return `<button type="button" class="hit" data-act="open-read" data-b="${hit.b}" data-ch="${hit.c + 1}" data-v="${hit.v + 1}" data-end="${hit.v + 1}"><b>${escapeHtml(ref)}</b><p>${verseHtml(hit.text, words)}</p></button>`;
  }).join('');
  const count = result.capped
    ? 'Showing the first 200 verses. Add another word to narrow the list.'
    : `${result.hits.length} ${result.hits.length === 1 ? 'verse' : 'verses'}`;
  return `<h1>Search</h1><p class="quiet">${escapeHtml(count)}</p>${cards}`;
}

function comparePane(which, label) {
  const text = session.compare[which] || '';
  const passage = session.compare[which === 'left' ? 'leftPassage' : 'rightPassage'];
  let body = '<p class="quiet">Type a reference, such as John 3:16.</p>';
  if (passage && passage.html) body = passage.html;
  if (passage && passage.error) body = `<div class="message"><p>${escapeHtml(passage.error)}</p></div>`;
  return `
    <section class="compare-pane">
      <h2>${label}</h2>
      <form class="pane-form" data-panel="${which}">
        <label class="sr-only" for="cmp-${which}">${label} reference</label>
        <input id="cmp-${which}" value="${escapeHtml(text)}" placeholder="John 3:16" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button type="submit">Show</button>
      </form>
      <button type="button" class="linkish" data-act="use-reading" data-panel="${which}">Use the passage I am reading</button>
      <div class="pane-body" data-pane-body="${which}">${body}</div>
    </section>`;
}

function compareHtml() {
  return `<h1>Compare</h1><div class="compare-grid">${comparePane('left', 'First passage')}${comparePane('right', 'Second passage')}</div>`;
}

function passageBlock(bible, parsed) {
  const verses = bible[parsed.bookIndex][parsed.chapter - 1];
  if (!verses) return { error: 'That chapter is not in this book.' };
  const start = parsed.start || 1;
  const end = parsed.end || (parsed.start ? parsed.start : verses.length);
  if (start > verses.length || end > verses.length) {
    return { error: `${BOOKS[parsed.bookIndex].name} ${parsed.chapter} has ${verses.length} verses.` };
  }
  const html = [];
  for (let verse = start; verse <= end; verse += 1) {
    html.push(`<p class="compare-verse"><span class="vn">${verse}</span>${verseHtml(verses[verse - 1])}</p>`);
  }
  return {
    html: `<h3 class="anchor-label">${escapeHtml(formatRef(parsed.bookIndex, parsed.chapter, parsed.start, parsed.end || parsed.start))}</h3>${html.join('')}`,
  };
}

async function render() {
  const token = ++renderToken;
  const route = parseHash(location.hash);
  const tab = route.view === 'search' ? 'search'
    : route.view === 'harmony' ? 'harmony'
      : route.view === 'compare' ? 'compare'
        : route.view === 'saved' ? 'saved'
          : route.view === 'about' ? ''
            : 'read';
  setTab(tab);
  if (!['read', 'harmony', 'search'].includes(route.view)) reflectQuery('');

  if (route.message) toast(route.message);

  if (route.view === 'home') {
    document.title = 'KJV Harmony';
    main.innerHTML = homeHtml();
    return;
  }
  if (route.view === 'books') {
    document.title = 'Books | KJV Harmony';
    main.innerHTML = booksHtml();
    window.scrollTo(0, 0);
    return;
  }
  if (route.view === 'chapters') {
    document.title = `${BOOKS[route.bookIndex].name} | KJV Harmony`;
    main.innerHTML = chaptersHtml(route.bookIndex);
    window.scrollTo(0, 0);
    return;
  }
  if (route.view === 'about') {
    document.title = 'About | KJV Harmony';
    main.innerHTML = aboutHtml();
    window.scrollTo(0, 0);
    return;
  }
  if (route.view === 'compare') {
    document.title = 'Compare | KJV Harmony';
    main.innerHTML = compareHtml();
    return;
  }
  if (route.view === 'saved') {
    document.title = 'Saved | KJV Harmony';
    main.innerHTML = loadingHtml('Opening saved verses...');
    try {
      const bible = await loadBible();
      if (token !== renderToken) return;
      main.innerHTML = savedHtml(bible);
    } catch {
      if (token !== renderToken) return;
      main.innerHTML = savedHtml(null) + messageHtml('The Bible text did not load. Check your connection and try again.', true);
    }
    return;
  }
  if (route.view === 'search') {
    document.title = 'Search | KJV Harmony';
    reflectQuery(route.q || '');
    if (!route.q) {
      main.innerHTML = `<h1>Search</h1><p class="lede">Type a word or a phrase in the box above.</p>`;
      return;
    }
    main.innerHTML = loadingHtml('Searching the Bible...');
    try {
      const [bible, index] = await Promise.all([loadBible(), loadIndex()]);
      if (token !== renderToken) return;
      const result = searchBible(bible, index, route.q);
      main.innerHTML = searchHtml(result, route.q);
      window.scrollTo(0, 0);
    } catch {
      if (token !== renderToken) return;
      main.innerHTML = messageHtml('The Bible text did not load. Check your connection and try again.', true);
    }
    return;
  }

  if (route.view === 'read' || route.view === 'harmony') {
    const label = formatRef(
      route.bookIndex,
      route.chapter,
      route.view === 'harmony' ? route.verse : route.start,
      route.view === 'harmony' ? route.verse : route.end
    );
    document.title = `${label} | KJV Harmony`;
    reflectQuery(label);
    main.innerHTML = loadingHtml('Opening the Bible...');
    try {
      const bible = await loadBible();
      if (token !== renderToken) return;
      const verses = bible[route.bookIndex][route.chapter - 1];
      if (route.view === 'read') {
        const start = route.start;
        const end = route.end || route.start;
        if (start && (start > verses.length || end > verses.length)) {
          main.innerHTML = messageHtml(`${BOOKS[route.bookIndex].name} ${route.chapter} has ${verses.length} verses.`);
          return;
        }
        main.innerHTML = chapterHtml(bible, route.bookIndex, route.chapter, start, end);
        remember(route.bookIndex, route.chapter, start || 1);
        const target = document.getElementById(`v${start || 1}`);
        if (start && target) target.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
        return;
      }

      const verse = route.verse;
      if (verse > verses.length) {
        main.innerHTML = messageHtml(`${BOOKS[route.bookIndex].name} ${route.chapter} has ${verses.length} verses.`);
        return;
      }
      const text = verses[verse - 1];
      let groups = [];
      let tskError = '';
      try {
        const tsk = await loadTsk(route.bookIndex);
        if (token !== renderToken) return;
        groups = refsFor(tsk[`${route.chapter}.${verse}`]) || [];
      } catch {
        tskError = 'The cross-references did not load. Check your connection and try again.';
      }
      const groupHtml = groups.map((group, groupIndex) => {
        const anchor = group[0].length > 72 ? 'This verse' : group[0];
        const cards = group[1].map((ref, refIndex) => {
          const hidden = refIndex >= 8 ? ' hidden' : '';
          return `<div${hidden}>${harmonyCard(bible, ref)}</div>`;
        }).join('');
        const extra = group[1].length > 8
          ? `<button type="button" data-act="expand">Show the rest (${group[1].length - 8} more)</button>`
          : '';
        return `<section class="panel xref-group"><h2>Related to "${escapeHtml(anchor)}"</h2>${cards}${extra}</section>`;
      }).join('');
      const empty = !groups.length && !tskError
        ? '<div class="message"><p>The Treasury of Scripture Knowledge lists no cross-references for this verse.</p></div>'
        : '';
      main.innerHTML = `
        <div class="panel">
          <p class="anchor-label">${escapeHtml(label)}</p>
          <div class="anchor-verse">${verseHtml(text)}</div>
          <div class="row">
            <button type="button" data-act="open-read" data-b="${route.bookIndex}" data-ch="${route.chapter}" data-v="${verse}" data-end="${verse}">Read in ${escapeHtml(BOOKS[route.bookIndex].name)} ${route.chapter}</button>
            <button type="button" data-act="copy" data-b="${route.bookIndex}" data-ch="${route.chapter}" data-v="${verse}">Copy</button>
            <button type="button" data-act="compare" data-b="${route.bookIndex}" data-ch="${route.chapter}" data-v="${verse}">Compare</button>
          </div>
        </div>
        ${tskError ? messageHtml(tskError, true) : ''}
        ${empty}
        ${groupHtml}`;
      remember(route.bookIndex, route.chapter, verse);
      window.scrollTo(0, 0);
    } catch {
      if (token !== renderToken) return;
      main.innerHTML = messageHtml('The Bible text did not load. Check your connection and try again.', true);
    }
  }
}

function currentReadingRef() {
  if (!library.last) return '';
  return formatRef(library.last.b, library.last.c + 1, library.last.v + 1, library.last.v + 1);
}

function paintCompare(which) {
  const key = which === 'left' ? 'leftPassage' : 'rightPassage';
  const pane = document.querySelector(`[data-pane-body="${which}"]`);
  if (!pane) return false;
  const passage = session.compare[key];
  if (!passage) pane.innerHTML = '<p class="quiet">Type a reference, such as John 3:16.</p>';
  else if (passage.error) pane.innerHTML = `<div class="message"><p>${escapeHtml(passage.error)}</p></div>`;
  else pane.innerHTML = passage.html;
  return true;
}

async function showCompare(which, raw) {
  session.compare[which] = raw;
  const key = which === 'left' ? 'leftPassage' : 'rightPassage';
  const parsed = parseReference(raw);
  if (!parsed) {
    session.compare[key] = { error: 'Type a verse such as John 3:16 or Psalm 23.' };
  } else if (parsed.error === 'chapter') {
    session.compare[key] = { error: `${BOOKS[parsed.bookIndex].name} has ${BOOKS[parsed.bookIndex].chapters} chapters.` };
  } else {
    if (parsed.wholeBook) parsed.chapter = 1;
    try {
      const bible = await loadBible();
      session.compare[key] = passageBlock(bible, parsed);
    } catch {
      session.compare[key] = { error: 'The Bible text did not load. Check your connection and try again.' };
    }
  }
  if (parseHash(location.hash).view !== 'compare') return;
  if (!paintCompare(which)) main.innerHTML = compareHtml();
}

async function onLookup(event) {
  event.preventDefault();
  const raw = queryInput.value.trim();
  if (!raw) {
    navigate({ view: 'home' });
    return;
  }
  const parsed = parseReference(raw);
  if (parsed && parsed.error === 'chapter') {
    toast(`${BOOKS[parsed.bookIndex].name} has ${BOOKS[parsed.bookIndex].chapters} chapters.`);
    return;
  }
  if (parsed && parsed.error === 'range') {
    toast('That verse range is not valid.');
    return;
  }
  if (parsed) {
    queryInput.blur();
    if (parsed.wholeBook) {
      navigate({ view: 'read', bookIndex: parsed.bookIndex, chapter: 1 });
      return;
    }
    navigate({
      view: 'read',
      bookIndex: parsed.bookIndex,
      chapter: parsed.chapter,
      start: parsed.start,
      end: parsed.end || parsed.start,
    });
    return;
  }
  queryInput.blur();
  navigate({ view: 'search', q: raw });
}

async function onMainClick(event) {
  const button = event.target.closest('[data-act]');
  if (!button || button.disabled) return;
  const act = button.dataset.act;

  if (act === 'toggle') {
    const verse = button.closest('.verse');
    const wasOpen = verse.classList.contains('open');
    document.querySelectorAll('.verse.open').forEach((el) => el.classList.remove('open'));
    if (!wasOpen) verse.classList.add('open');
    return;
  }
  if (act === 'expand') {
    const group = button.closest('.xref-group');
    group.querySelectorAll('[hidden]').forEach((el) => { el.hidden = false; });
    button.remove();
    return;
  }
  if (act === 'books') {
    navigate({ view: 'books' });
    return;
  }
  if (act === 'chapters') {
    navigate({ view: 'chapters', bookIndex: Number(button.dataset.b) });
    return;
  }
  if (act === 'open-chapter') {
    navigate({ view: 'read', bookIndex: Number(button.dataset.b), chapter: Number(button.dataset.ch) });
    return;
  }
  if (act === 'goto') {
    queryInput.value = button.dataset.ref;
    onLookup({ preventDefault() {} });
    return;
  }
  if (act === 'shift') {
    const moved = shiftChapter(Number(button.dataset.b), Number(button.dataset.ch), Number(button.dataset.delta));
    if (moved) navigate({ view: 'read', bookIndex: moved.b, chapter: moved.c });
    return;
  }
  if (act === 'retry') {
    bibleState.promise = null;
    indexPromise = null;
    render();
    return;
  }
  if (act === 'size') {
    const size = button.dataset.size;
    localStorage.setItem(SIZE_KEY, size);
    applySize();
    render();
    return;
  }
  if (act === 'open-read') {
    navigate({
      view: 'read',
      bookIndex: Number(button.dataset.b),
      chapter: Number(button.dataset.ch),
      start: Number(button.dataset.v),
      end: Number(button.dataset.end || button.dataset.v),
    });
    return;
  }
  if (act === 'harmony') {
    navigate({
      view: 'harmony',
      bookIndex: Number(button.dataset.b),
      chapter: Number(button.dataset.ch),
      verse: Number(button.dataset.v),
    });
    return;
  }
  if (act === 'compare') {
    const ref = formatRef(Number(button.dataset.b), Number(button.dataset.ch), Number(button.dataset.v), Number(button.dataset.v));
    session.compare.left = ref;
    session.compare.leftPassage = null;
    navigate({ view: 'compare' });
    showCompare('left', ref);
    return;
  }
  if (act === 'use-reading') {
    const ref = currentReadingRef();
    if (!ref) {
      toast('Open a passage first.');
      return;
    }
    showCompare(button.dataset.panel, ref);
    return;
  }
  if (act === 'copy' || act === 'copy-range') {
    const bible = bibleState.data;
    if (!bible) return;
    const book = Number(button.dataset.b);
    const chapter = Number(button.dataset.ch);
    const start = Number(button.dataset.v);
    const end = Number(button.dataset.end || button.dataset.v);
    const text = act === 'copy'
      ? quoteVerse(verseAt(bible, book, chapter, start), formatRef(book, chapter, start, start))
      : copyRange(bible, book, chapter, start, end);
    copyText(text);
    return;
  }
  if (act === 'save') {
    const book = Number(button.dataset.b);
    const chapter = Number(button.dataset.ch);
    const verse = Number(button.dataset.v);
    const existing = findSaved(book, chapter - 1, verse - 1);
    const noteBox = button.closest('.actions') && button.closest('.actions').querySelector('textarea');
    if (existing) {
      library.saved = library.saved.filter((item) => item !== existing);
      button.textContent = 'Save';
      if (noteBox) noteBox.value = '';
      toast('Removed');
    } else {
      const note = noteBox ? noteBox.value : '';
      library.saved.unshift({ b: book, c: chapter - 1, v: verse - 1, note, at: Date.now() });
      button.textContent = 'Remove';
      toast('Saved on this phone');
    }
    persist();
    return;
  }
  if (act === 'remove') {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.textContent = 'Remove this?';
      return;
    }
    const book = Number(button.dataset.b);
    const chapter = Number(button.dataset.ch);
    const verse = Number(button.dataset.v);
    library.saved = library.saved.filter((item) => !(item.b === book && item.c === chapter - 1 && item.v === verse - 1));
    persist();
    render();
  }
}

function onMainInput(event) {
  const box = event.target;
  if (!box.dataset.note) return;
  const book = Number(box.dataset.b);
  const chapter = Number(box.dataset.ch);
  const verse = Number(box.dataset.v);
  let item = findSaved(book, chapter - 1, verse - 1);
  if (!item) {
    item = { b: book, c: chapter - 1, v: verse - 1, note: '', at: Date.now() };
    library.saved.unshift(item);
    const saveButton = box.closest('.actions').querySelector('[data-act="save"]');
    if (saveButton) saveButton.textContent = 'Remove';
  }
  item.note = box.value;
  item.at = Date.now();
  persist();
}

function onMainSubmit(event) {
  const form = event.target;
  if (!form.dataset || !form.dataset.panel) return;
  event.preventDefault();
  const input = form.querySelector('input');
  showCompare(form.dataset.panel, input.value.trim());
}

function applySize() {
  const size = localStorage.getItem(SIZE_KEY) || 'md';
  document.documentElement.classList.remove('size-sm', 'size-lg');
  document.body.classList.remove('size-sm', 'size-lg');
  if (size === 'sm' || size === 'lg') {
    document.documentElement.classList.add(`size-${size}`);
    document.body.classList.add(`size-${size}`);
  }
}

function boot() {
  applySize();
  loadBible().catch(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const hash = location.hash;
  if (!booted && (hash === '' || hash === '#' || hash === '#/')) {
    booted = true;
    if (library.last) {
      const last = library.last;
      location.replace(buildHash({
        view: 'read',
        bookIndex: last.b,
        chapter: last.c + 1,
        start: last.v + 1,
        end: last.v + 1,
      }));
      return;
    }
  }
  booted = true;
  render();
}

document.getElementById('lookup-form').addEventListener('submit', onLookup);
document.getElementById('home-btn').addEventListener('click', () => navigate({ view: 'home' }));
document.getElementById('about-btn').addEventListener('click', () => navigate({ view: 'about' }));
document.querySelector('.tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-go]');
  if (!button) return;
  const go = button.dataset.go;
  if (go === 'read') {
    if (library.last) {
      const last = library.last;
      navigate({ view: 'read', bookIndex: last.b, chapter: last.c + 1, start: last.v + 1, end: last.v + 1 });
    } else navigate({ view: 'home' });
    return;
  }
  if (go === 'search') {
    navigate({ view: 'search', q: '' });
    queryInput.focus();
    return;
  }
  if (go === 'harmony') {
    if (library.last) {
      const last = library.last;
      navigate({ view: 'harmony', bookIndex: last.b, chapter: last.c + 1, verse: last.v + 1 });
    } else {
      toast('Open a verse first.');
      navigate({ view: 'home' });
    }
    return;
  }
  navigate({ view: go });
});
main.addEventListener('click', onMainClick);
main.addEventListener('input', onMainInput);
main.addEventListener('submit', onMainSubmit);
window.addEventListener('hashchange', () => render());

boot();
