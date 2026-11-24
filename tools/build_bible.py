#!/usr/bin/env python3
"""Build the local King James text and Treasury of Scripture Knowledge files.

Bible text: KJV.zip already in this project (Cambridge edition, public domain).
Cross-references: Treasury of Scripture Knowledge, public domain.
Transcription: JustVerses tskxref.txt dated 2011-06-28.
SHA-256 6741647c7ab23c3710d1f070a7413994d1059b64dc3e7fc13ebc50f281e35e54

Usage:
  python3 tools/build_bible.py --tsk /path/to/tskxref.txt
"""

import argparse
import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# name, testament, aliases. Order is the Protestant canon, matching KJV.zip.
BOOKS = [
    ("Genesis", "OT", ["genesis", "gen", "ge", "gn"]),
    ("Exodus", "OT", ["exodus", "exod", "exo", "ex"]),
    ("Leviticus", "OT", ["leviticus", "lev", "le", "lv"]),
    ("Numbers", "OT", ["numbers", "num", "nu", "nm"]),
    ("Deuteronomy", "OT", ["deuteronomy", "deut", "deu", "dt", "de"]),
    ("Joshua", "OT", ["joshua", "josh", "jos"]),
    ("Judges", "OT", ["judges", "judg", "jdg", "jg", "jud"]),
    ("Ruth", "OT", ["ruth", "ru"]),
    ("1 Samuel", "OT", ["1 samuel", "1samuel", "1 sam", "1sam", "1 sa", "1sa", "i samuel", "i sam", "first samuel"]),
    ("2 Samuel", "OT", ["2 samuel", "2samuel", "2 sam", "2sam", "2 sa", "2sa", "ii samuel", "ii sam", "second samuel"]),
    ("1 Kings", "OT", ["1 kings", "1kings", "1 ki", "1ki", "1 kgs", "i kings", "first kings"]),
    ("2 Kings", "OT", ["2 kings", "2kings", "2 ki", "2ki", "2 kgs", "ii kings", "second kings"]),
    ("1 Chronicles", "OT", ["1 chronicles", "1chronicles", "1 chr", "1chr", "1 ch", "1ch", "i chronicles", "first chronicles"]),
    ("2 Chronicles", "OT", ["2 chronicles", "2chronicles", "2 chr", "2chr", "2 ch", "2ch", "ii chronicles", "second chronicles"]),
    ("Ezra", "OT", ["ezra", "ezr"]),
    ("Nehemiah", "OT", ["nehemiah", "neh", "ne"]),
    ("Esther", "OT", ["esther", "esth", "es"]),
    ("Job", "OT", ["job"]),
    ("Psalms", "OT", ["psalms", "psalm", "psa", "psm", "pss", "ps"]),
    ("Proverbs", "OT", ["proverbs", "prov", "prv", "pr"]),
    ("Ecclesiastes", "OT", ["ecclesiastes", "eccles", "eccl", "ecc", "ec"]),
    ("Song of Solomon", "OT", ["song of solomon", "song of songs", "canticles", "song", "sos", "cant", "so"]),
    ("Isaiah", "OT", ["isaiah", "isa", "is"]),
    ("Jeremiah", "OT", ["jeremiah", "jer", "jr"]),
    ("Lamentations", "OT", ["lamentations", "lam", "la"]),
    ("Ezekiel", "OT", ["ezekiel", "ezek", "eze"]),
    ("Daniel", "OT", ["daniel", "dan", "da"]),
    ("Hosea", "OT", ["hosea", "hos", "ho"]),
    ("Joel", "OT", ["joel", "joe"]),
    ("Amos", "OT", ["amos", "am"]),
    ("Obadiah", "OT", ["obadiah", "obad", "ob"]),
    ("Jonah", "OT", ["jonah"]),
    ("Micah", "OT", ["micah", "mic"]),
    ("Nahum", "OT", ["nahum", "nah", "na"]),
    ("Habakkuk", "OT", ["habakkuk", "hab"]),
    ("Zephaniah", "OT", ["zephaniah", "zeph", "zep"]),
    ("Haggai", "OT", ["haggai", "hag"]),
    ("Zechariah", "OT", ["zechariah", "zech", "zec"]),
    ("Malachi", "OT", ["malachi", "mal"]),
    ("Matthew", "NT", ["matthew", "matt", "mt"]),
    ("Mark", "NT", ["mark", "mk", "mr"]),
    ("Luke", "NT", ["luke", "lk", "lu"]),
    ("John", "NT", ["john", "jhn", "joh", "jn"]),
    ("Acts", "NT", ["acts", "ac"]),
    ("Romans", "NT", ["romans", "rom", "ro"]),
    ("1 Corinthians", "NT", ["1 corinthians", "1corinthians", "1 cor", "1cor", "1 co", "1co", "i corinthians", "i cor", "first corinthians"]),
    ("2 Corinthians", "NT", ["2 corinthians", "2corinthians", "2 cor", "2cor", "2 co", "2co", "ii corinthians", "ii cor", "second corinthians"]),
    ("Galatians", "NT", ["galatians", "gal", "ga"]),
    ("Ephesians", "NT", ["ephesians", "eph"]),
    ("Philippians", "NT", ["philippians", "phil", "php"]),
    ("Colossians", "NT", ["colossians", "col"]),
    ("1 Thessalonians", "NT", ["1 thessalonians", "1thessalonians", "1 thess", "1thess", "1 th", "1th", "i thessalonians", "first thessalonians"]),
    ("2 Thessalonians", "NT", ["2 thessalonians", "2thessalonians", "2 thess", "2thess", "2 th", "2th", "ii thessalonians", "second thessalonians"]),
    ("1 Timothy", "NT", ["1 timothy", "1timothy", "1 tim", "1tim", "1 ti", "1ti", "i timothy", "first timothy"]),
    ("2 Timothy", "NT", ["2 timothy", "2timothy", "2 tim", "2tim", "2 ti", "2ti", "ii timothy", "second timothy"]),
    ("Titus", "NT", ["titus", "tit"]),
    ("Philemon", "NT", ["philemon", "philem", "phm"]),
    ("Hebrews", "NT", ["hebrews", "heb"]),
    ("James", "NT", ["james", "jas"]),
    ("1 Peter", "NT", ["1 peter", "1peter", "1 pet", "1pet", "1 pe", "1pe", "i peter", "first peter"]),
    ("2 Peter", "NT", ["2 peter", "2peter", "2 pet", "2pet", "2 pe", "2pe", "ii peter", "second peter"]),
    ("1 John", "NT", ["1 john", "1john", "1 jn", "1jn", "1 jo", "1jo", "i john", "first john"]),
    ("2 John", "NT", ["2 john", "2john", "2 jn", "2jn", "2 jo", "2jo", "ii john", "second john"]),
    ("3 John", "NT", ["3 john", "3john", "3 jn", "3jn", "3 jo", "3jo", "iii john", "third john"]),
    ("Jude", "NT", ["jude"]),
    ("Revelation", "NT", ["revelation", "revelations", "rev", "re"]),
]

ABBREV = {}
for i, (name, _testament, aliases) in enumerate(BOOKS):
    for alias in aliases:
        ABBREV.setdefault(alias.replace(" ", ""), alias.replace(" ", ""))
# TSK uses the short forms below. Map them onto book indexes.
TSK_ABBREV = {
    "ge": 0, "ex": 1, "le": 2, "nu": 3, "de": 4, "jos": 5, "jud": 6, "ru": 7,
    "1sa": 8, "2sa": 9, "1ki": 10, "2ki": 11, "1ch": 12, "2ch": 13, "ezr": 14,
    "ne": 15, "es": 16, "job": 17, "ps": 18, "pr": 19, "ec": 20, "so": 21,
    "isa": 22, "jer": 23, "la": 24, "eze": 25, "da": 26, "ho": 27, "joe": 28,
    "am": 29, "ob": 30, "jon": 31, "mic": 32, "na": 33, "hab": 34, "zep": 35,
    "hag": 36, "zec": 37, "mal": 38, "mt": 39, "mr": 40, "lu": 41, "joh": 42,
    "ac": 43, "ro": 44, "1co": 45, "2co": 46, "ga": 47, "eph": 48, "php": 49,
    "col": 50, "1th": 51, "2th": 52, "1ti": 53, "2ti": 54, "tit": 55, "phm": 56,
    "heb": 57, "jas": 58, "1pe": 59, "2pe": 60, "1jo": 61, "2jo": 62, "3jo": 63,
    "jude": 64, "re": 65,
    # A handful of rows use these spellings.
    "exe": 1, "sa": None,
}

SKIP_TOKENS = {"it is:", "size=", "so in:"}


def load_kjv(zip_path):
    with zipfile.ZipFile(zip_path) as zf:
        raw = zf.read("KJV.csv").decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(raw)))
    books = [[[] for _ in range(0)] for _ in range(66)]
    # chapters are appended in order
    chapter_lists = [[] for _ in range(66)]
    current = [(0, 0) for _ in range(66)]
    for row in rows:
        bi = int(row["Book Number"]) - 1
        ch = int(row["Chapter"])
        vs = int(row["Verse"])
        text = row["Text"]
        if text is None:
            raise SystemExit(f"Missing text at book {bi+1} {ch}:{vs}")
        if ch != current[bi][0]:
            if ch != current[bi][0] + 1:
                raise SystemExit(f"Chapter gap in {BOOKS[bi][0]}: {current[bi][0]} -> {ch}")
            chapter_lists[bi].append([])
            current[bi] = (ch, 0)
        if vs != current[bi][1] + 1:
            raise SystemExit(f"Verse gap in {BOOKS[bi][0]} {ch}: expected {current[bi][1]+1} got {vs}")
        chapter_lists[bi][-1].append(text)
        current[bi] = (ch, vs)
    return chapter_lists


def verse_count(chapters, bi, ch):
    if ch < 1 or ch > len(chapters[bi]):
        return 0
    return len(chapters[bi][ch - 1])


def parse_verse_list(spec):
    spec = spec.replace(" ", "")
    out = []
    for part in spec.split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
            if end < start:
                start, end = end, start
            out.append((start, end))
        else:
            v = int(part)
            out.append((v, v))
    return out


def parse_token(tok, chapters):
    tok = tok.strip().lower()
    tok = re.sub(r"\s+", " ", tok)
    tok = re.sub(r"\s*,\s*", ",", tok)
    if not tok or tok in SKIP_TOKENS:
        return []
    if tok.startswith("exe "):
        tok = "ex " + tok[4:]

    glued = re.match(r"^([1-3]?[a-z]+)(\d+)_(\d+)$", tok)
    if glued:
        abbr, ch, vs = glued.group(1), int(glued.group(2)), int(glued.group(3))
        bi = TSK_ABBREV.get(abbr)
        if bi is None:
            return None
        if verse_count(chapters, bi, ch) < vs or vs < 1:
            return None
        return [(bi, ch, vs, vs)]

    cross = re.match(r"^([1-3]?[a-z]+)\s+(\d+),(\d+)-(\d+):(\d+)$", tok)
    if cross:
        abbr = cross.group(1)
        bi = TSK_ABBREV.get(abbr)
        if bi is None:
            return None
        ch, vs, end_ch, end_vs = (int(cross.group(i)) for i in range(2, 6))
        if verse_count(chapters, bi, ch) < vs or vs < 1:
            return None
        if verse_count(chapters, bi, end_ch) < end_vs or end_vs < 1:
            return None
        return [(bi, ch, vs, end_ch, end_vs)]

    normal = re.match(r"^([1-3]?[a-z]+)\s+(\d+):([0-9,\-]+)$", tok)
    if not normal:
        return None
    abbr = normal.group(1)
    bi = TSK_ABBREV.get(abbr)
    if bi is None:
        return None
    ch = int(normal.group(2))
    try:
        spans = parse_verse_list(normal.group(3))
    except ValueError:
        return None
    limit = verse_count(chapters, bi, ch)
    refs = []
    for start, end in spans:
        if start < 1 or end > limit:
            return None
        refs.append((bi, ch, start, end))
    return refs


def load_tsk(path, chapters):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    grouped = defaultdict(list)  # (book, ch, vs) -> list of (sort, anchor, refs)
    dropped = []
    kept = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != 6:
            dropped.append(line[:80])
            continue
        try:
            bi = int(parts[0]) - 1
            ch = int(parts[1])
            vs = int(parts[2])
            sort = int(parts[3])
        except ValueError:
            dropped.append(line[:80])
            continue
        if bi < 0 or bi > 65:
            continue
        if verse_count(chapters, bi, ch) < vs:
            dropped.append(line[:80])
            continue
        anchor = parts[4].strip()
        refs = []
        bad = False
        for tok in parts[5].split(";"):
            parsed = parse_token(tok, chapters)
            if parsed is None:
                bad = True
                if len(dropped) < 40:
                    dropped.append(tok.strip())
                continue
            for ref in parsed:
                # Skip a reference that is only the verse itself.
                if len(ref) == 4 and ref[0] == bi and ref[1] == ch and ref[2] == vs and ref[3] == vs:
                    continue
                refs.append(ref)
        if bad and not refs:
            continue
        if not refs or not anchor:
            continue
        grouped[(bi, ch, vs)].append((sort, anchor, refs))
        kept += len(refs)
    return grouped, kept, dropped


def compact_ref(ref):
    if len(ref) == 5:
        bi, ch, vs, end_ch, end_vs = ref
        if end_ch == ch:
            return [bi, ch, vs, end_vs]
        return [bi, ch, vs, end_ch, end_vs]
    bi, ch, vs, end = ref
    return [bi, ch, vs, end]


def write_books_js(chapters, path):
    lines = [
        "// Generated by tools/build_bible.py. Do not edit by hand.",
        "// Book names follow the bundled King James text.",
        "export const BOOKS = [",
    ]
    for i, ((name, testament, aliases), chs) in enumerate(zip(BOOKS, chapters)):
        alias_json = json.dumps(aliases, ensure_ascii=False)
        lines.append(
            f"  {{ name: {json.dumps(name)}, testament: {json.dumps(testament)}, chapters: {len(chs)}, aliases: {alias_json} }},"
        )
    lines.append("];")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default=str(ROOT / "KJV.zip"))
    parser.add_argument("--tsk", required=True)
    args = parser.parse_args()

    chapters = load_kjv(args.zip)
    total = sum(len(v) for book in chapters for v in book)
    if len(chapters) != 66 or total != 31102:
        raise SystemExit(f"Unexpected Bible shape: {len(chapters)} books, {total} verses")

    checks = {
        (0, 2, 7): "And the LORD God formed man [of] the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.",
        (18, 23, 1): "<<A Psalm of David.>> The LORD [is] my shepherd; I shall not want.",
        (42, 3, 16): "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
        (45, 2, 13): "Which things also we speak, not in the words which man's wisdom teacheth, but which the Holy Ghost teacheth; comparing spiritual things with spiritual.",
        (45, 2, 14): "But the natural man receiveth not the things of the Spirit of God: for they are foolishness unto him: neither can he know [them], because they are spiritually discerned.",
        (22, 9, 6): "For unto us a child is born, unto us a son is given: and the government shall be upon his shoulder: and his name shall be called Wonderful, Counseller, The mighty God, The everlasting Father, The Prince of Peace.",
    }
    for (bi, ch, vs), expected in checks.items():
        got = chapters[bi][ch - 1][vs - 1]
        if got != expected:
            raise SystemExit(f"Text mismatch {BOOKS[bi][0]} {ch}:{vs}\nGOT {got}\nEXP {expected}")

    if len(chapters[42]) != 21 or len(chapters[42][2]) != 36:
        raise SystemExit("John chapter shape is unexpected")
    if len(chapters[18]) != 150 or len(chapters[18][118]) != 176:
        raise SystemExit("Psalms shape is unexpected")

    odd = []
    for bi, book in enumerate(chapters):
        for ch, verses in enumerate(book, start=1):
            for vs, text in enumerate(verses, start=1):
                if not text or "\n" in text or "\ufffd" in text:
                    odd.append((BOOKS[bi][0], ch, vs))
    if odd:
        raise SystemExit(f"Empty or broken verses: {odd[:10]}")

    grouped, kept, dropped = load_tsk(args.tsk, chapters)

    tsk_dir = ROOT / "data" / "tsk"
    tsk_dir.mkdir(parents=True, exist_ok=True)
    for old in tsk_dir.glob("*.json"):
        old.unlink()

    for bi in range(66):
        by_verse = {}
        for (book_i, ch, vs), groups in grouped.items():
            if book_i != bi:
                continue
            groups.sort(key=lambda item: item[0])
            merged = []
            for _sort, anchor, refs in groups:
                compact = [compact_ref(r) for r in refs]
                if merged and merged[-1][0] == anchor:
                    seen = {tuple(r) for r in merged[-1][1]}
                    for ref in compact:
                        if tuple(ref) not in seen:
                            merged[-1][1].append(ref)
                            seen.add(tuple(ref))
                else:
                    merged.append([anchor, compact])
            by_verse[f"{ch}.{vs}"] = merged
        (tsk_dir / f"{bi + 1}.json").write_text(
            json.dumps(by_verse, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    kjv_path = ROOT / "data" / "kjv.json"
    kjv_path.write_text(json.dumps(chapters, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_books_js(chapters, ROOT / "js" / "books.js")

    john = json.loads((tsk_dir / "43.json").read_text(encoding="utf-8"))
    groups = john.get("3.16")
    if not groups:
        raise SystemExit("John 3:16 has no cross-references")
    flat = [ref for _anchor, refs in groups for ref in refs]
    has_1john = any(len(r) == 4 and r[0] == 61 and r[1] == 4 and r[2] <= 9 <= r[3] for r in flat)
    if not has_1john:
        raise SystemExit(f"John 3:16 missing 1 John 4: {groups}")

    print(f"verses {total}")
    print(f"tsk refs kept {kept}")
    print(f"tsk verses {len(grouped)}")
    print(f"dropped samples {len(dropped)}")
    for item in dropped[:25]:
        print(" drop:", item)
    print("kjv bytes", kjv_path.stat().st_size)
    print("tsk bytes", sum(p.stat().st_size for p in tsk_dir.glob('*.json')))


if __name__ == "__main__":
    main()
