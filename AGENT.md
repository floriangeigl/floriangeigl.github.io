# AGENT.md

## Project Overview

This is the source for **geigl.online**, a personal website built with [Jekyll](https://jekyllrb.com/) using the [Beautiful Jekyll](https://beautifuljekyll.com/) theme (v6.0.1). It is hosted via GitHub Pages at `https://geigl.online`.

## Tech Stack

- **Static site generator:** Jekyll (≥ 3.9.3)
- **Theme:** Beautiful Jekyll (gem-based, see `beautiful-jekyll-theme.gemspec`)
- **Markup:** Markdown (Kramdown with GFM input)
- **Syntax highlighting:** Rouge
- **CSS:** Bootstrap + custom CSS (`assets/css/custom.css`)
- **Analytics:** Google Analytics (gtag)
- **Ruby dependencies:** managed via Bundler (`Gemfile` → `gemspec`)

## Repository Structure

```
_config.yml          # Site-wide Jekyll configuration (title, navbar, colours, analytics, etc.)
index.html           # Homepage (layout: page)
_layouts/            # HTML layout templates (base, default, home, page, post, minimal)
_includes/           # Reusable HTML partials (header, footer, nav, analytics, comments, etc.)
_posts/              # Blog posts (Markdown, named YYYY-MM-DD-title.md)
_data/               # Data files (ui-text.yml)
assets/
  css/               # Stylesheets (beautifuljekyll.css, custom.css, bootstrap-social.css, etc.)
  js/                # JavaScript (beautifuljekyll.js, staticman.js)
  img/               # Images and static media
  data/              # JSON data (searchcorpus.json)
klagifornia/         # Standalone page with its own images
pilot/               # Standalone page with its own images
meditate_app*.md     # Pages for the Meditation & Breathwork Garmin app
```

## Local Development

### Prerequisites

- Ruby (with Bundler)

### Setup & Serve

```sh
bundle install
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`.

### Build Only

```sh
bundle exec jekyll build
```

Output goes to `_site/` (gitignored).

## Key Configuration

All site-wide settings live in `_config.yml`:

- **`title`** / **`author`** / **`url`** — basic site identity
- **`navbar-links`** — navigation bar structure
- **`avatar`** — navbar profile image
- **`page-col`, `navbar-col`, `footer-col`, etc.** — colour theming
- **`site-css`** — additional CSS files loaded on every page (currently includes `custom.css`)
- **`gtag`** — Google Analytics measurement ID
- **`defaults`** — YAML front-matter defaults for posts and pages
- **`plugins`** — `jekyll-paginate`, `jekyll-sitemap`
- **`timezone`** — `Europe/Vienna`
- **`permalink`** — `/:year-:month-:day-:title/`

## Adding Content

### New Blog Post

1. Create a file in `_posts/` named `YYYY-MM-DD-title.md`.
2. Include YAML front matter (see `_posts/2025-03-03-post.md.example` for a template):
   ```yaml
   ---
   layout: post
   title: "Post Title"
   subtitle: "Optional subtitle"
   tags: [tag1, tag2]
   comments: true
   ---
   ```
3. Write content in Markdown (Kramdown/GFM). MathJax is available when `mathjax: true` is set.

### New Standalone Page

Create a Markdown file at the repo root or in a subfolder with `layout: page` front matter. Add a link in `_config.yml` under `navbar-links` to include it in navigation.

## Styling

- Theme styles: `assets/css/beautifuljekyll.css`
- Custom overrides: `assets/css/custom.css` — loaded after theme CSS via `site-css` in `_config.yml`
- Avoid editing theme CSS directly; prefer adding rules to `custom.css`.

## Deployment

The site is deployed automatically via **GitHub Pages**. Pushing to the default branch triggers the `pages-build-deployment` GitHub Actions workflow. The custom domain `geigl.online` is configured via the `CNAME` file.

## Cloudflare Configuration

The site is proxied through **Cloudflare** (DNS, CDN, and redirect rules). Key settings:

### Canonical Host & HTTPS Redirect Rule

A single **Redirect Rule** (highest priority) canonicalises all traffic to `https://geigl.online`:

- **Name:** Canonicalize host + https
- **When (Expression):** `(http.request.scheme eq "http") or (http.host eq "www.geigl.online")`
- **Then (Dynamic redirect):** `concat("https://geigl.online", http.request.uri.path)`
- **Status:** 301

This ensures:
- `http://geigl.online/…` → `https://geigl.online/…`
- `http://www.geigl.online/…` → `https://geigl.online/…`
- `https://www.geigl.online/…` → `https://geigl.online/…`

> **Important:** The dynamic redirect target must include the `/` between the host and the URI path variable. Using `concat("https://geigl.online", http.request.uri.path)` is correct because `http.request.uri.path` starts with `/`. A target like `"https://geigl.online" + $1` (without separator) can produce broken URLs like `https://geigl.onlineklagifornia/…`.

### SSL/TLS

- **Mode:** Full (strict)
- **Always Use HTTPS:** enabled (belt-and-suspenders alongside the redirect rule)

## SEO & Indexing

### Sitemap

- Generated automatically by the `jekyll-sitemap` plugin.
- Served at `https://geigl.online/sitemap.xml`.
- Referenced from `robots.txt` at the repo root.
- All sitemap entries use canonical trailing-slash URLs.

### Permalinks

Every content page has an explicit `permalink:` in its front matter ending with a trailing slash (e.g. `permalink: /meditate_app/`). This prevents Jekyll from generating `.html` files that GitHub Pages then 301-redirects to the "pretty" URL, which causes Google Search Console to report "Page with redirect".

### Canonical Tags & Structured Data

- `_includes/head.html` emits `<link rel="canonical">` and `<meta property="og:url">` on every page, computed from `site.url` + `page.url`. This always resolves to `https://geigl.online/…`.
- The homepage includes a `ProfilePage` + `Person` JSON-LD block (driven by `schema_*` front-matter fields in `index.html`), which helps Google associate the site with the person entity and the correct profile image.
- All pages have `share-title` and `share-description` front-matter for explicit control over `<title>`, `og:title`, and `meta description`.

### Robots Meta

- `<meta name="robots" content="index, follow, max-image-preview:large">` is set globally in `_includes/head.html` to allow large image previews in search results.

### Google Search Console Notes

- **"Seiten mit Weiterleitung" (Page with redirect):** These are informational, not errors. They mean Google crawled a non-trailing-slash or http/www URL, got a 301, and correctly followed it. The *target* URL is what gets indexed. These entries fade over time as Google stops re-discovering the old variants.
- **"Duplikat – Google hat eine andere Seite als kanonische Seite bestimmt":** Same root cause — Google saw the http/www variant, got a 301, and chose the HTTPS non-www target as canonical. Expected behaviour.
- After any redirect/canonical changes, re-submit `https://geigl.online/sitemap.xml` and use URL Inspection → "Request indexing" on the canonical URLs.

## Coding Conventions

- Use Markdown for content pages; HTML only in layouts/includes.
- Keep images in `assets/img/` or in a page-specific `img/` subfolder.
- Front matter should always include `layout` and `title`.
- Use `.webp` format for images where possible.
- Permalinks are date-based: `/:year-:month-:day-:title/`.
