# Gallery Upgrade — Implementation Plan (Handoff)

This document is a **complete, self-contained implementation plan** for upgrading the
photo gallery pages of this Jekyll (beautiful-jekyll) site. All product decisions are
already made — an implementing agent should **execute** this plan, not re-decide it.

> Do not change the decisions below without explicit user approval.

---

## 1. Goal & scope

Turn the two simple "stacked full-size images" gallery pages into real galleries with:

- Small pre-generated **thumbnails** (committed to the repo).
- **Masonry** layout (JS-based, row-major so ordering is preserved).
- **Lazy loading** of thumbnails.
- **Newest-first** ordering.
- A **PhotoSwipe** lightbox (click a thumbnail → full-res viewer with pinch-zoom).
- **Captions** shown on hover (overlay) and in the lightbox.
- Fully **data-driven** authoring: `.md` pages just call an include; a GitHub Actions
  workflow (Node + `sharp`) generates thumbnails and a data manifest automatically.

Explicit **non-goals**: infinite / endless scrolling (skip for now).

### Affected galleries
| Key | Page (source) | Image dir | Permalink |
|-----|---------------|-----------|-----------|
| `pilot` | `pilot/pilot.md` | `pilot/img/` | `/pilot/pilot/` |
| `klagifornia` | `klagifornia/klagifornia.md` | `klagifornia/img/` | `/klagifornia/klagifornia/` |

The solution must be **generic** — adding a third gallery later should only require a new
entry in the generator config + a new `.md` calling the include.

---

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Thumbnail storage | **Committed** to repo under `<gallery>/img/thumbs/`, with **orphan cleanup** |
| Layout | **JS masonry** (row-major; Masonry.js + imagesLoaded) |
| Lightbox | **PhotoSwipe v5** |
| Ordering | **Newest first**, by **EXIF `DateTimeOriginal`**, fallback → **git commit date**, fallback → build time |
| Captions | Shown **on hover** + in **lightbox** |
| Authoring | **Fully data-driven** (generated manifests in `_data/galleries/`) |
| Script runtime | **Node.js** using `sharp` |
| Commit style | Workflow commits **directly to `main`** (bot commit) |

---

## 3. Current state (before)

Each gallery page is a markdown file with front matter + a flat list of full-size images:

```markdown
---
layout: page
title: 🛩️ In The Air ✈️
...
---
![IMG_5312.JPG](img/IMG_5312.webp)
![NIPEL.jpg](img/NIPEL.webp)
...
```

All images are already `.webp`. There is an existing image-compression workflow
(`.github/workflows/image_compression.yml`) that runs on `**.webp` pushes and opens a PR,
and a CI build workflow (`.github/workflows/ci.yml`). The gallery uses no JS/CSS beyond the
theme.

---

## 4. Existing captions to migrate (DO NOT LOSE)

Captions currently live in the **markdown alt text**. A one-time migration must seed these
into the generated manifests. A caption is considered **real** (worth keeping) only if the
alt text is NOT filename-like.

**Filename-like heuristic (skip as caption):** alt matches `^IMG[_-]`, OR ends in
`.jpg/.jpeg/.png/.webp` (case-insensitive), OR equals the source filename stem.

### klagifornia (`klagifornia/img/`) — captions to seed
| Image file | Caption |
|------------|---------|
| `lake_mountains.webp` | `paddle with duck` |
| `paddle_01.webp` | `paddle` |
| `klagifornia_venice.webp` | `klagifornia-venice` |
| `paddle_duck.webp` | `paddle with duck` |
| `IMG_5727-EDIT.webp` | `Seespitz` |
| `0002DE62-69F5-4537-AFA1-3E7DDDC375EB.webp` | `Stift Viktring` |
| `IMG_5944.webp` | `Stift Viktring` |
| `IMG_6148.webp` | _(none — alt was `IMG_6148.JPG`)_ |
| `IMG_6143-EFFECTS.webp` | _(none — alt was `IMG_6143-EFFECTS.jpg`)_ |

### pilot (`pilot/img/`) — captions to seed
None. Every alt text in `pilot/pilot.md` is filename-like.

> The migration MUST be committed **before** (or in the same change as) the first generator
> run, because the generator preserves existing manifest captions but does not read markdown.
> Verify after the first CI run that the klagifornia captions above are still present.

---

## 5. Target architecture

```
Add/remove image in <gallery>/img/  ──push──▶  gallery_thumbnails.yml (Actions)
     │
     ├─ generate <gallery>/img/thumbs/<name>.webp  (sharp)
     ├─ read EXIF DateTimeOriginal + IPTC/XMP description
     ├─ merge into _data/galleries/<gallery>.yml   (preserve existing captions)
     ├─ delete orphan thumbs + orphan manifest entries
     └─ commit thumbs + manifests directly to main
                     │
                     ▼
              Jekyll build → _includes/gallery.html renders masonry + PhotoSwipe
```

### Manifest schema (`_data/galleries/<gallery>.yml`)
A YAML **list**, written **newest-first** (generator sorts descending by date):

```yaml
- file: pilot-hallstatt.webp        # source filename (in <gallery>/img/)
  thumb: thumbs/pilot-hallstatt.webp # thumbnail path relative to <gallery>/img/
  width: 4032                        # ORIGINAL image width  (for PhotoSwipe)
  height: 3024                       # ORIGINAL image height (for PhotoSwipe)
  thumb_width: 600                   # thumbnail width  (for <img width> / no CLS)
  thumb_height: 450                  # thumbnail height (for <img height>)
  date: 2025-08-14T17:22:03          # ISO 8601; EXIF → git → build-time
  caption: "Hallstatt from 3,000 ft" # may be empty string
```

### Caption resolution order (per image, every run)
1. **Existing** manifest `caption` for that file, if non-empty → keep (user edits win).
2. Else embedded **IPTC/XMP Description** from the image, if present.
3. Else empty string `""`.

Only `caption` is preserved across runs. `thumb`, `width`, `height`, `thumb_width`,
`thumb_height`, `date`, and ordering are always recomputed.

---

## 6. Deliverables (files)

### New files
1. `scripts/gallery/package.json` — Node project, deps: `sharp`, `exifr`, `js-yaml`.
2. `scripts/gallery/generate.mjs` — the generator (spec in §7).
3. `scripts/gallery/galleries.json` — gallery config (list of `{ key, imageDir, thumbDir, manifest }`).
4. `.github/workflows/gallery_thumbnails.yml` — the workflow (spec in §8).
5. `_includes/gallery.html` — renders masonry grid + PhotoSwipe markup (spec in §9).
6. `assets/js/gallery.js` — Masonry + imagesLoaded + PhotoSwipe init (spec in §10).
7. `_data/galleries/pilot.yml` — generated (seed via first run).
8. `_data/galleries/klagifornia.yml` — generated, with migrated captions (§4).
9. `pilot/img/thumbs/` + `klagifornia/img/thumbs/` — generated thumbnails.
10. `.github/calibre/image-actions.yml` — ignore thumbs (or edit existing workflow; see §11).

### Edited files
- `pilot/pilot.md` — replace image list with `{% include gallery.html gallery="pilot" %}`.
- `klagifornia/klagifornia.md` — same with `gallery="klagifornia"`.
- `assets/css/custom.css` — masonry + hover-caption styles.
- `.github/workflows/image_compression.yml` — exclude `**/thumbs/**` (see §11).

---

## 7. Generator spec — `scripts/gallery/generate.mjs`

Runtime: Node 20+, ESM. Deps: `sharp`, `exifr`, `js-yaml`.

**Config** (`scripts/gallery/galleries.json`):
```json
[
  { "key": "pilot",       "imageDir": "pilot/img",       "manifest": "_data/galleries/pilot.yml" },
  { "key": "klagifornia", "imageDir": "klagifornia/img", "manifest": "_data/galleries/klagifornia.yml" }
]
```
Thumb dir is always `<imageDir>/thumbs`.

**Thumbnail settings:**
- Format: WebP, `quality: 72`, `effort: 4`.
- Resize `fit: "inside"`, longest edge **600px**, `withoutEnlargement: true`.
- **Strip metadata** from thumbs (default sharp behavior; do not pass `withMetadata`).
- Skip regeneration if thumb exists AND is newer than the source (mtime check) — but always
  (re)read source dimensions/EXIF for the manifest.

**Per gallery, algorithm:**
1. List source images in `imageDir` (top level only): extensions `.webp .jpg .jpeg .png`,
   **excluding** the `thumbs/` subdir. Case-insensitive.
2. Load existing manifest (if any) into a `Map<file, entry>`.
3. For each source image:
   - Read original `width`/`height` via `sharp(src).metadata()`.
   - Generate thumb → `thumbs/<basename>.webp`; capture `thumb_width`/`thumb_height` from
     the sharp output `info`.
   - Determine `date`:
     - EXIF `DateTimeOriginal` (via `exifr.parse`), else
     - git commit date: `git log -1 --format=%cI -- <path>` (requires full history — see §8), else
     - build time (`new Date()`).
   - Determine `caption` using resolution order in §5 (existing non-empty caption →
     IPTC/XMP `ImageDescription`/`Description`/`Caption` via `exifr`, → `""`).
   - Build the entry object.
4. **Orphan cleanup:**
   - Delete any file in `thumbs/` whose corresponding source no longer exists.
   - Drop manifest entries whose `file` no longer exists.
5. Sort entries by `date` **descending** (newest first). Tie-break by filename descending.
6. Write manifest YAML (stable key order matching §5 schema) via `js-yaml`.
7. Log a summary (added / updated / removed counts) per gallery.

**Determinism:** Running twice with no image changes must produce **no diff** (idempotent).
This is critical to avoid empty bot commits.

**CLI:** `node scripts/gallery/generate.mjs` processes all galleries. Non-zero exit on error.

---

## 8. Workflow spec — `.github/workflows/gallery_thumbnails.yml`

```yaml
name: Generate Gallery Thumbnails
on:
  workflow_dispatch:
  push:
    branches: [ main, master ]
    paths:
      - 'pilot/img/**'
      - 'klagifornia/img/**'
      - '!**/img/thumbs/**'          # ignore our own generated output (prevents loop)
      - 'scripts/gallery/**'
concurrency:
  group: gallery-thumbnails
  cancel-in-progress: false
permissions:
  contents: write
jobs:
  thumbnails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0            # full history so git-commit-date fallback works
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scripts/gallery/package-lock.json
      - run: npm ci
        working-directory: scripts/gallery
      - run: node scripts/gallery/generate.mjs
      - name: Commit generated thumbnails & manifests
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add '**/img/thumbs/**' _data/galleries
          if git diff --cached --quiet; then
            echo "No gallery changes to commit."
          else
            git commit -m "chore(gallery): regenerate thumbnails & manifests [skip ci]"
            git push
          fi
```

**Loop-prevention notes:**
- The `!**/img/thumbs/**` path filter means the bot's thumbnail commit does not re-trigger
  this workflow. Manifest commits under `_data/**` also don't match the trigger paths.
- `[skip ci]` also prevents the `ci.yml` build from double-running on the bot commit
  (verify this is acceptable; Pages will still deploy on the next normal push, or trigger a
  manual deploy — see §12).

---

## 9. Include spec — `_includes/gallery.html`

Parameters:
- `gallery` (required): manifest key, e.g. `"pilot"`. Looks up `site.data.galleries[include.gallery]`.
- `path` (optional): image base URL; default `/{{ include.gallery }}/img`.

Rendering rules:
- Wrap in `<div class="pswp-gallery masonry-grid" id="gallery-{{ include.gallery }}">`.
- Include a `<div class="masonry-sizer"></div>` sizer element for Masonry column width.
- For each item (already newest-first from the manifest), render a link:
  ```html
  <a class="masonry-item"
     href="{{ base }}/{{ item.file }}"
     data-pswp-width="{{ item.width }}"
     data-pswp-height="{{ item.height }}"
     target="_blank" rel="noopener">
    <img src="{{ base }}/{{ item.thumb }}"
         width="{{ item.thumb_width }}" height="{{ item.thumb_height }}"
         loading="lazy" decoding="async"
         alt="{{ item.caption | default: item.file }}">
    {% if item.caption and item.caption != '' %}
      <span class="masonry-caption">{{ item.caption }}</span>
      <span class="pswp-caption-content" hidden>{{ item.caption }}</span>
    {% endif %}
  </a>
  ```
  Use `{{ '/...' | relative_url }}` for URLs so `baseurl` (CI preview) works.
- At the end of the include, load assets **once** (guard with a capture/flag so multiple
  includes on one page don't double-load):
  - PhotoSwipe (ESM) + Masonry + imagesLoaded from CDN (pinned versions, `defer`/module).
  - `assets/js/gallery.js` as `type="module"`.

---

## 10. Front-end JS spec — `assets/js/gallery.js`

- For each `.masonry-grid`:
  - Initialize **Masonry** with `itemSelector: '.masonry-item'`,
    `columnWidth: '.masonry-sizer'`, `percentPosition: true`, `gutter` from CSS.
  - Use **imagesLoaded** to re-layout as thumbnails load (progress + done).
- Initialize **PhotoSwipe** (`PhotoSwipeLightbox`) once per `.pswp-gallery`:
  - `children: 'a.masonry-item'`, `pswpModule` from CDN.
  - Register a **caption UI** element that reads `.pswp-caption-content` from the active slide.
- All third-party libs pinned (suggested): `masonry-layout@4.2.2`, `imagesloaded@5.0.0`,
  `photoswipe@5.4.4`. Confirm latest stable at implementation time.
- Guard everything so it runs only when a gallery exists on the page.

---

## 11. Conflict guard — image compression workflow

The existing `.github/workflows/image_compression.yml` triggers on `**.webp` and would try to
recompress committed thumbnails (churn / competing commits). Prevent this **both** ways:

1. Add path exclusions to that workflow's `push.paths`:
   ```yaml
   paths:
     - '**.jpg'
     - '**.jpeg'
     - '**.png'
     - '**.webp'
     - '!**/img/thumbs/**'
   ```
2. Add a calibre ignore config `.github/calibre/image-actions.yml`:
   ```yaml
   ignorePaths:
     - '**/img/thumbs/**'
   ```

Thumbs are already produced at `quality: 72`, so they should not need further compression.

---

## 12. Deployment note (confirm, do not assume)

`ci.yml` builds Jekyll and runs `actions/upload-pages-artifact` but has **no**
`actions/deploy-pages` step, so it's unclear whether the live site deploys from this artifact
or from a branch via classic Pages. **This gallery works regardless** — thumbnails, JS, and
CSS are all static; no non-whitelisted Jekyll plugins are used. Action item for the
implementer: confirm the deploy path and ensure a normal (non-`[skip ci]`) commit or manual
Pages deploy publishes the new assets. If deployment relies on `ci.yml`, consider whether the
`[skip ci]` on the bot commit needs a follow-up trigger.

---

## 13. `.md` page changes

Replace the stacked image lists (keep front matter) with a single include. Example
`pilot/pilot.md`:

```markdown
---
layout: page
title: 🛩️ In The Air ✈️
subtitle: Some Impressions
permalink: /pilot/pilot/
share-title: In The Air | Private Pilot Photos | Florian Geigl
share-description: Flight impressions and photos from Florian Geigl — private pilot based in Klagenfurt, Austria.
---

{% include gallery.html gallery="pilot" %}
```

Do the same for `klagifornia/klagifornia.md` with `gallery="klagifornia"`.

---

## 14. Step-by-step execution order

1. Create `scripts/gallery/` (`package.json`, `generate.mjs`, `galleries.json`); run
   `npm install` to produce `package-lock.json`. Commit lockfile.
2. **Seed captions manually** into `_data/galleries/klagifornia.yml` and `pilot.yml` using
   §4 (or run the generator locally, then hand-add the klagifornia captions before first
   push). Verify the migration table is fully represented.
3. Run `node scripts/gallery/generate.mjs` locally → produces thumbs + manifests. Confirm
   idempotency (run twice → no diff).
4. Add `_includes/gallery.html`, `assets/js/gallery.js`, CSS in `assets/css/custom.css`.
5. Update `pilot/pilot.md` and `klagifornia/klagifornia.md` to use the include.
6. Add `.github/workflows/gallery_thumbnails.yml`.
7. Apply compression-workflow guards (§11).
8. Build locally (`bundle exec jekyll serve`) and validate (§15).
9. Commit + push everything to `main`. Confirm the workflow runs, is idempotent (no empty
   commit loop), and the live pages render.

---

## 15. Acceptance criteria / validation

- [ ] Both gallery pages render a **masonry grid of thumbnails**, newest photo top-left.
- [ ] Thumbnails are **small** (longest edge 600px) and **lazy-loaded** (`loading="lazy"`).
- [ ] Clicking a thumbnail opens **PhotoSwipe** with the full-res image, pinch/zoom, swipe.
- [ ] Captions appear **on hover** (overlay) and **in the lightbox**.
- [ ] The **klagifornia captions from §4 are present** and correct (migration succeeded).
- [ ] No layout shift while thumbnails load (width/height set from `thumb_width/height`).
- [ ] Removing a source image + re-running the workflow deletes its thumb **and** manifest
      entry (orphan cleanup verified).
- [ ] Running the generator twice with no changes yields **no git diff** (idempotent; no
      commit loop).
- [ ] The image-compression workflow no longer touches `**/img/thumbs/**`.
- [ ] Adding a brand-new gallery requires only a `galleries.json` entry + a new `.md`.

---

## 16. Edge cases & notes

- **Non-webp sources:** generator supports jpg/png too, but current galleries are all webp.
- **EXIF missing:** fall back to git commit date (needs `fetch-depth: 0`), then build time.
- **Duplicate captions** (e.g. two "Stift Viktring") are allowed and expected.
- **Special filenames:** `0002DE62-…-3E7DDDC375EB.webp` must round-trip correctly (it has its
  caption in §4).
- **Accessibility:** `alt` = caption when present, else the filename; never empty.
- **`klagifornia-venice` / `paddle_01`** captions are migrated verbatim; the user may later
  refine wording/capitalization — that's a manual manifest edit and will be preserved.
