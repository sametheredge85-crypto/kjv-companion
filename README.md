# KJV Harmony Companion

> *"The scripture cannot be broken."* — John 10:35

A free, open-source Progressive Web App (PWA) for preachers, teachers, and believers who want to study the King James Bible the right way — **whole context, whole counsel of God, line upon line, precept upon precept.**

---

## 🌐 Live App

**[Open the App → https://sametheredge85-crypto.github.io/Kjv-companion/](https://sametheredge85-crypto.github.io/Kjv-companion/)**

You can also **install it like an app** on your phone:
- **iPhone/iPad:** Open in Safari → tap the Share button (square with arrow) → tap "Add to Home Screen"
- **Android:** Open in Chrome → tap the three-dot menu → tap "Add to Home Screen" or "Install App"

Once installed, it works **offline** — no internet needed after the first load.

---

## 📖 What This Tool Does

This companion answers one question above all others: **"What does the whole Bible say about this?"**

It is built on the conviction that **no verse should ever be read alone**. John 3:16, for example, is not just a single sentence — it is the heart of John 3:1-21, which is a passage about sovereign new birth. Reading it in its full context, and alongside the whole canon of Scripture, is what this tool does for you.

### Core Features

| Feature | Description |
|---|---|
| 🔍 **Harmony Explorer** | Enter any verse or topic — get the verse text, full chapter context, 4-6 cross-references, gentle insights, and everyday application |
| 📚 **Annex Library** | 7 pre-loaded core harmony topics (Faith, Election, Warfare, Trials, etc.) + your own saved teachings |
| 📝 **Sermon Builder** | Build a full sermon outline with title, scripture text, 3 points, introduction and conclusion — then copy it to paste anywhere |
| ⚖️ **Harmony Gate** | Submit a new teaching or sermon outline — it must pass checks for whole-context citation and cross-references before being saved |
| ✅ **Self-Audit Tool** | A 10-point preacher's checklist drawn from Scripture to help you examine your own teaching |
| 💾 **Saved Privately** | Everything you save (sermons, teachings) stays on YOUR device — never shared or uploaded |

---

## 📖 Verses Currently in the Database

1. **John 3:16** — Full context of John 3:1-21 (assurance text, not isolated invitation)
2. **Ephesians 2:8-9** — Grace through faith, from Ephesians 2:1-10
3. **Romans 8:28** — The Golden Chain of Salvation (Romans 8:26-39)
4. **John 10:27-28** — The security of the sheep (John 10:1-30)
5. **Psalm 23** — The Shepherd Psalm in full
6. **Isaiah 53:5** — The Suffering Servant (Isaiah 53:1-12)
7. **Acts 2:38** — Peter's Pentecost sermon (Acts 2:14-41)
8. **John 6:37** — The Bread of Life discourse (John 6:35-51)
9. **Hebrews 11:1** — The Faith Chapter (Hebrews 11:1-40)
10. **2 Thessalonians 2:13** — Election and sanctification
11. **Psalm 73:26** — Trials, frailty, and God's keeping power

You can also search by **topic**: `grace`, `election`, `faith`, `comfort`, `trials`, `atonement`, `sovereignty`, `new birth`, and more.

---

## ⚖️ The Harmony Gate

When you submit a new harmony teaching, it must pass these checks:

1. ✅ Teaching has a title
2. ✅ Primary verse reference is provided
3. ✅ Surrounding context is described (not an isolated verse)
4. ✅ At least two cross-references are cited with chapter:verse references
5. ✅ Teaching notes are provided

This ensures that everything in the library is consistent with the whole counsel of God.

---

## 🛠️ For Developers — How to Add More Verses

Open `index.html` and find the `kjvData` object (around line 340). Add a new entry like this:

```javascript
"romans 5:8": {
    verse: "But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us. — Romans 5:8",
    context: "Romans 5:1-11 — Paul has just established justification by faith (ch.3-4)...",
    harmony: [
        "Isaiah 53:5 — He was wounded for our transgressions...",
        "1 Peter 2:24 — Who his own self bare our sins in his own body on the tree.",
        // add 2-5 cross-references
    ],
    insights: "God's love is not a response to our goodness...",
    application: "Rest today in the love that was demonstrated at Calvary...",
    tags: ["love", "atonement", "grace", "cross"]
}
```

The search engine will automatically find this verse by reference, partial reference, or by any of its tags.

---

## 🚀 Deploying on GitHub Pages

1. Go to your repository **Settings**
2. Click **Pages** in the left sidebar
3. Under "Source", select **Deploy from a branch**
4. Select the `main` branch (or whichever branch has your files), folder `/` (root)
5. Click Save
6. Your app will be live at `https://YOUR-USERNAME.github.io/Kjv-companion/`

---

## 📁 Repository File Guide

| File | Purpose |
|---|---|
| `index.html` | The complete app — all HTML, CSS, and JavaScript in one file |
| `manifest.json` | PWA manifest — makes the app installable on phones |
| `sw.js` | Service worker — enables offline use after first load |
| `README.md` | This documentation file |

The other files in this repository (PDFs, images, text files) are source materials and sermon drafts. They are not part of the live web app but are preserved here for reference.

---

## 🙏 About This Project

This tool was built for **Rev. Sam**, a 67-year-old KJV preacher who wanted a reliable, honest Bible harmony tool that:

- Never isolates a verse from its context
- Is consistent with the whole canon of Scripture
- Works on any phone, tablet, or computer — even without internet
- Is simple enough for anyone to use
- Gives answers a 12-year-old could understand, without dumbing down the truth

*"All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness: That the man of God may be perfect, throughly furnished unto all good works."* — 2 Timothy 3:16-17

---

## License

This project is open source and free for all to use, share, and build upon.

