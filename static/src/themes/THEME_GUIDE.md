# Theme Guide

Create a new theme by adding a folder under `src/themes/{your-theme}/styles/theme.css`. The theme is pure CSS — no HTML changes needed. All pages share the same markup; themes control appearance through CSS variables and class overrides.

## Quick Start

```
src/themes/my-theme/styles/theme.css
```

```css
@import "../../shared/fancy-base.css";

:root {
  --bg: #ffffff;
  --accent: #2563eb;
  --text: #1a1a2e;
}
```

That's a working theme. Everything else is optional refinement.

## How It Works

1. All themes import `shared/fancy-base.css` which provides base layout, typography, and component styles
2. Your theme overrides CSS variables in `:root` to change colors, fonts, spacing
3. Your theme adds class-level rules to restructure or hide components
4. The theme is loaded as a stylesheet at build time — no JS, no runtime cost

## CSS Variables Reference

### Colors

| Variable | Purpose | Default |
|---|---|---|
| `--bg` | Page background | `#0f1220` |
| `--bg-2` | Secondary background (cards, sections) | `#171d2f` |
| `--surface` | Card/surface background (semi-transparent) | `rgba(20,27,43,0.75)` |
| `--surface-strong` | Surface with higher opacity | `rgba(25,34,56,0.9)` |
| `--border` | Border color | `rgba(255,255,255,0.16)` |
| `--text` | Primary text | `#eef2ff` |
| `--text-muted` | Secondary text | `#b8c0df` |
| `--text-soft` | Tertiary/subtle text | `#95a0c8` |
| `--accent` | Primary accent (links, buttons, highlights) | `#7c9cff` |
| `--accent-2` | Secondary accent | `#3de2d1` |
| `--accent-3` | Tertiary accent | `#ff7a8b` |
| `--accent-text` | Text on accent backgrounds | `#f7faff` |

### Typography

| Variable | Purpose | Default |
|---|---|---|
| `--font` | Body font family | `"Manrope", sans-serif` |
| `--font-display` | Heading/display font | `"Manrope", sans-serif` |
| `--mono` | Monospace font (code, dates, labels) | `"JetBrains Mono", monospace` |

### Layout

| Variable | Purpose | Default |
|---|---|---|
| `--max-w` | Max container width | `1120px` |
| `--content-w` | Prose/article content width | `740px` |
| `--header-h` | Header height | `64px` |
| `--radius` | Large border radius | `20px` |
| `--radius-sm` | Small border radius | `12px` |
| `--post-columns` | Post grid columns | `3` |

### Hero Section

| Variable | Purpose | Default |
|---|---|---|
| `--hero-align` | Hero text alignment | `left` |
| `--hero-max` | Hero max width | `1040px` |
| `--hero-padding` | Hero section padding | `22px 30px` |
| `--hero-title-size` | Title font size (use clamp) | `clamp(1.8rem, 4.8vw, 3.1rem)` |
| `--hero-title-weight` | Title font weight | `800` |
| `--hero-title-gradient` | Title text gradient | `linear-gradient(...)` |
| `--hero-glow-1` | Background glow color 1 | `rgba(124,156,255,0.25)` |
| `--hero-glow-2` | Background glow color 2 | `rgba(61,226,209,0.2)` |

### Effects

| Variable | Purpose | Default |
|---|---|---|
| `--card-shadow` | Post card shadow | `0 1px 3px rgba(...)` |
| `--hover-shadow` | Card hover shadow | `0 8px 32px rgba(...)` |
| `--ease` | Animation easing | `cubic-bezier(0.4,0,0.2,1)` |

## Page Structure & CSS Classes

All pages use the same HTML. Themes style these classes. Every class is optional to override — the base CSS handles defaults.

### Layout Shell

```
body
  .skip-link                    — Accessibility "Skip to content" link
  .site-header                  — Sticky header bar
    .header-inner               — Header flex container
      .header-brand             — Logo + title link
        .header-logo            — Logo <img> (if site has logo)
        .header-headshot        — Avatar <img> (if no logo, has headshot)
        .header-brand-text
          .header-site-name     — Site title text
          .header-tagline       — Site tagline text
      .header-nav               — Desktop nav links
        a                       — Nav links
        a.nav-active            — Current page indicator
      .header-cta.desktop-only  — CTA button (if configured)
      .hamburger                — Mobile menu toggle button
    .mobile-nav                 — Mobile navigation panel
      .is-open                  — Open state modifier
  main.main-content
    slot (page content)
  .site-footer
    .footer-grid                — 3-column footer grid
      .footer-brand-col         — Left: brand + social
        .footer-logo-img        — Footer logo image
        .footer-brand-name      — Site title
        .footer-blurb           — Tagline or custom text
        .footer-social          — Social icon links
          a                     — Individual social link
      div                       — Middle: navigation
        .footer-heading         — Column title ("Explore")
        .footer-links           — Link list <ul>
          li > a                — Menu item links
      div                       — Right: recent posts
        .footer-heading         — Column title ("Recent")
        .footer-recent-item     — Recent post entry
          .footer-recent-title  — Post title link
          .footer-recent-date   — Post date (mono font)
    .footer-bottom              — Copyright bar
```

### Homepage (index.astro)

```
.container
  .hero                         — Hero section
    .hero-media                 — Background image (if homepage has featured image)
      .hero-media-card
        img                     — Full-bleed background image
    .home-hero                  — Hero content wrapper
      .hero-copy                — Text overlay
        h1.hero__title          — Site title (large)
        p.hero__tagline         — Tagline
        .hero__body             — Homepage content (Portable Text)
        .hero__actions          — CTA buttons
          a.btn.btn--primary    — Primary button
          a.btn.btn--ghost      — Ghost button
  .category-bar                 — Category filter chips (if categories exist)
    a.category-chip             — Single chip
    a.category-chip--active     — Active chip
  .section-header               — "Recent articles" header
    h2.section-title
      span.section-count        — Post count
    a.section-link              — "View all" link
  .post-grid                    — Post cards grid
    PostCard (see below)
```

### Post Card (PostCard.astro)

```
.post-card                      — Clickable card container
  .post-card__image-wrap        — Image area (aspect 16:10)
    img.post-card__image        — Featured image (if exists)
    .post-card__placeholder     — Gradient placeholder (if no image)
    span.post-card__badge       — Category badge overlay
  .post-card__body              — Text area
    .post-card__meta            — Date + reading time
      span                      — Date
      span.post-card__meta-dot  — Dot separator
      span                      — Reading time
    h3.post-card__title         — Post title link
    p.post-card__excerpt        — Excerpt (2-line clamp)
```

### Article Page (posts/[slug].astro)

```
.container
  .layout-with-sidebar          — 2-column grid (article + sidebar)
    article.prose               — Article content
      .article-header           — Meta section
        a.article-category      — Category link
        .article-meta           — Date, author, reading time
          time                  — Published date
          a                     — Author link
          span                  — Reading time
      h1                        — Article title
      p.article-lead            — Excerpt/lead paragraph
      figure.content-image      — Featured image
        img
      PortableText              — Article body content
    Sidebar (see below)
```

### Sidebar (Sidebar.astro)

```
.sidebar                        — Sticky sidebar container
  .sidebar-section              — Section block
    h3.sidebar-heading          — Section title
    .sidebar-categories         — Category list <ul>
      li > a                    — Category link with count
    .sidebar-recent-item        — Recent post
      .sidebar-recent-title     — Post title link
      .sidebar-recent-date      — Date (mono font)
    .sidebar-tags               — Tag flex container
      a.sidebar-tag             — Individual tag chip
```

### Generic Page ([...slug].astro)

```
.container.section
  article.prose
    h1                          — Page title
    figure.content-image        — Featured image (if exists)
      img
    PortableText                — Page body content
```

### Posts List (posts/index.astro)

```
.container
  h1.page-title                 — "Articles" heading
  p.page-subtitle               — Subtitle
  .filter-bar                   — Category/tag filter chips
    a.filter-chip               — Filter option
    a.filter-chip.active        — Active filter
  .post-grid                    — Post cards grid
```

### Category/Tag Pages

```
.container
  .section-heading              — Large heading section
    h1                          — Category/tag name
    p                           — Description
  .post-grid                    — Filtered post cards
```

## Article Content Classes (Portable Text)

The `.prose` class wraps all article/page content. These classes appear inside it:

| Class | Element | Purpose |
|---|---|---|
| `.prose h1`-`.prose h4` | Headings | Sized headings with font-display |
| `.prose p` | Paragraphs | Body text with line-height 1.7 |
| `.prose a` | Links | Accent colored with underline offset |
| `.prose strong` | Bold | White/bright text |
| `.prose blockquote` | Quotes | Left border, italic, muted |
| `.prose code` | Inline code | Mono font, accent-2 color |
| `.prose ul`, `.prose ol` | Lists | Indented with styled markers |
| `.prose figure` | Images | Full-width with rounded corners |
| `.prose figcaption` | Captions | Small muted text |
| `.content-image` | Image wrapper | Margin and border radius |
| `.content-image--wide` | Wide image | Breaks out of content width |

## Data Available to Templates

Themes don't access data directly — they style the HTML that templates render. But understanding what data exists helps you know what elements will be present.

### Always Present
- Site title and tagline (header + footer)
- Navigation menu items (header + footer)
- Copyright text (footer)
- Recent posts list (footer)
- Post cards with title, date, excerpt

### Conditionally Present (style with care)
- **Site logo** — `.header-logo` only renders if logo is set in CMS
- **Site headshot** — `.header-headshot` only renders if headshot URL is set
- **Header tagline** — `.header-tagline` only renders if tagline exists
- **CTA button** — `.header-cta` only renders if CTA label + URL are configured
- **Hero background image** — `.hero-media` only renders if homepage has a featured image
- **Hero body text** — `.hero__body` only renders if homepage has content
- **Category bar** — `.category-bar` only renders if categories exist
- **Post card image** — `.post-card__image` only renders if post has featured image; `.post-card__placeholder` renders otherwise
- **Post card badge** — `.post-card__badge` only renders if post has categories
- **Sidebar** — `.sidebar` rendered on article pages
- **Social links** — `.footer-social` only renders if social links exist in CMS settings
- **Footer logo** — `.footer-logo-img` only renders if logo is set
- **Article author** — author link only renders if post has bylines
- **SEO meta** — handled in `<head>`, not styled

## Common Theme Patterns

### Dark Theme
```css
:root {
  --bg: #0a0a0a;
  --bg-2: #141414;
  --surface: rgba(255,255,255,0.04);
  --border: rgba(255,255,255,0.1);
  --text: #f0f0f0;
  --text-muted: #a0a0a0;
  --text-soft: #707070;
}

/* Footer is already dark in base — match it or differentiate */
.site-footer { background: #050505; }
```

### Light Theme
```css
:root {
  --bg: #ffffff;
  --bg-2: #f8f8f8;
  --surface: rgba(0,0,0,0.03);
  --border: rgba(0,0,0,0.08);
  --text: #1a1a1a;
  --text-muted: #666666;
  --text-soft: #999999;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

/* Light footer needs explicit dark background + light text */
.site-footer { background: #1a1a1a; }
.site-footer .footer-brand-name,
.site-footer .footer-recent-title,
.site-footer .footer-recent-title a { color: #ffffff; }
.site-footer .footer-heading { color: rgba(255,255,255,0.4); }
.site-footer .footer-blurb,
.site-footer .footer-links a,
.site-footer .footer-social a { color: rgba(255,255,255,0.6); }
.site-footer .footer-links a:hover,
.site-footer .footer-social a:hover,
.site-footer .footer-recent-title a:hover { color: #ffffff; }
.site-footer .footer-recent-date { color: rgba(255,255,255,0.35); }
.site-footer .footer-bottom { color: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.08); }
.site-footer .footer-social a { border-color: rgba(255,255,255,0.15); }
```

### Single-Column Posts (no images)
```css
:root { --post-columns: 1; }
.post-card__image-wrap { display: none; }
```

### Full-Screen Hero with Background Image
```css
.hero {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  color: #ffffff;
  background: #000000;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.2));
  z-index: 1;
}

.hero .hero-media {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero .hero-media-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero .hero-copy {
  position: relative;
  z-index: 2;
}

.hero__title { color: #ffffff; }
```

### Hide Sidebar
```css
.layout-with-sidebar {
  grid-template-columns: 1fr;
}
.sidebar { display: none; }
```

### Fixed/Transparent Header
```css
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: transparent;
}

/* Add padding to body so content isn't hidden under header */
body { padding-top: var(--header-h); }
```

### Custom Fonts

Import fonts and override the variables:

```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');

:root {
  --font-display: "Playfair Display", serif;
}
```

Or use local font files placed in your theme folder.

## Checklist for New Themes

- [ ] Import base: `@import "../../shared/fancy-base.css";`
- [ ] Set color palette (at minimum: `--bg`, `--text`, `--accent`)
- [ ] Test with dark AND light footer background
- [ ] Test with and without: site logo, hero image, social links, categories, sidebar
- [ ] Test mobile (hamburger menu, single column, touch targets)
- [ ] Test with 0 posts, 1 post, and 20+ posts
- [ ] Test pages with long content and short content
- [ ] Test post cards with and without featured images
- [ ] Ensure sufficient color contrast (WCAG AA: 4.5:1 for text)

## Existing Themes for Reference

| Theme | Style | Key Decisions |
|---|---|---|
| `professional` | Dark, modern | Default base colors, 3-col grid, gradient title |
| `editorial` | Warm, classic | Serif headings, beige background, 1-col grid, no sidebar |
| `minimal` | Light, clean | No post images, 1-col grid, left-aligned hero |
| `bold` | Dark, elegant | Serif headings, custom shadows, bordered hero |
| `theme-7` | White, luxury | Full-screen hero, fixed transparent header, dark footer |
