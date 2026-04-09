# EmDash Static Builder Theme Guide

This document is the exact handoff contract for new theme deliveries into `emdash-static-builder`.

It explains:

- how the static builder works
- what data comes from R2
- what data may or may not exist
- what must be styled (header, footer, all pages)
- how to design themes that consume data safely

---

## 1) How Static Builder Works (important)

1. The build reads a snapshot JSON from R2 (`SNAPSHOT_URL`).
2. Snapshot is saved into `generated/snapshot.json`.
3. Build also saves:
   - `generated/theme.json` (active theme name)
   - `generated/fonts.css`
   - `generated/font-preloads.json`
4. Astro builds one static site using theme folder selected by env `THEME`.

Theme switch is currently folder-based:

- `src/themes/professional`
- `src/themes/editorial`
- `src/themes/minimal`
- `src/themes/bold`

So for now, every new theme must be delivered as its own folder.

---

## 2) Required Theme Folder Structure

```txt
src/themes/<theme-name>/
  layouts/
    Base.astro
  pages/
    index.astro
    posts/index.astro
    posts/[slug].astro
    category/[slug].astro
    tag/[slug].astro
    [...slug].astro
    404.astro
    sitemap.xml.ts
    robots.txt.ts
    rss.xml.ts
  components/
    PostCard.astro
    Sidebar.astro
  styles/
    theme.css
```

You can add more components, but the above must exist.

---

## 3) What Data Comes From R2 Snapshot

The snapshot contains tables like:

- `ec_posts`
- `ec_pages`
- `media`
- `taxonomies`
- `content_taxonomies`
- `_emdash_menu_items`
- `options`
- plus metadata/config tables

### Full table -> field map (current snapshot schema)

Use this as the data reference when designing:

- `_emdash_collections`
  - `comments_auto_approve_users`, `comments_closed_after_days`, `comments_enabled`, `comments_moderation`, `created_at`, `description`, `has_seo`, `icon`, `id`, `label`, `label_singular`, `search_config`, `slug`, `source`, `supports`, `updated_at`, `url_pattern`
- `_emdash_fields`
  - `collection_id`, `column_type`, `created_at`, `default_value`, `id`, `label`, `options`, `required`, `searchable`, `slug`, `sort_order`, `translatable`, `type`, `unique`, `validation`, `widget`
- `_emdash_menu_items`
  - `created_at`, `css_classes`, `custom_url`, `id`, `label`, `menu_id`, `parent_id`, `reference_collection`, `reference_id`, `sort_order`, `target`, `title_attr`, `type`
- `_emdash_menus`
  - `created_at`, `id`, `label`, `name`, `updated_at`
- `_emdash_migrations`
  - `name`, `timestamp`
- `_emdash_sections`
  - `content`, `created_at`, `description`, `id`, `keywords`, `preview_media_id`, `slug`, `source`, `theme_id`, `title`, `updated_at`
- `_emdash_taxonomy_defs`
  - `collections`, `created_at`, `hierarchical`, `id`, `label`, `label_singular`, `name`
- `_emdash_widget_areas`
  - `created_at`, `description`, `id`, `label`, `name`
- `_emdash_widgets`
  - `area_id`, `component_id`, `component_props`, `content`, `created_at`, `id`, `menu_name`, `sort_order`, `title`, `type`
- `content_taxonomies`
  - `collection`, `entry_id`, `taxonomy_id`
- `ec_pages`
  - `author_id`, `content`, `created_at`, `deleted_at`, `draft_revision_id`, `excerpt`, `featured_image`, `id`, `live_revision_id`, `locale`, `primary_byline_id`, `published_at`, `scheduled_at`, `slug`, `status`, `title`, `translation_group`, `updated_at`, `version`
- `ec_posts`
  - `author_id`, `content`, `created_at`, `deleted_at`, `draft_revision_id`, `excerpt`, `featured_image`, `id`, `live_revision_id`, `locale`, `primary_byline_id`, `published_at`, `scheduled_at`, `slug`, `status`, `title`, `translation_group`, `updated_at`, `version`
- `media`
  - `alt`, `author_id`, `blurhash`, `caption`, `content_hash`, `created_at`, `dominant_color`, `filename`, `height`, `id`, `mime_type`, `size`, `status`, `storage_key`, `width`
- `options`
  - `name`, `value`
- `revisions`
  - `author_id`, `collection`, `created_at`, `data`, `entry_id`, `id`
- `taxonomies`
  - `data`, `id`, `label`, `name`, `parent_id`, `slug`

Treat this schema as evolving. Theme should never assume every field is present or non-empty.

### Post data that can exist

- `id`, `slug`, `title`
- `content` (portable blocks)
- `excerpt`
- `featured_image`
- `published_at`, `updated_at`
- `primary_byline_id`
- taxonomy relations (category/tag)
- SEO metadata
- reading time (derived)

### Page data that can exist

- `id`, `slug`, `title`
- `content`
- `excerpt`
- `featured_image`
- `published_at`, `updated_at`
- SEO metadata

### Site/global data that can exist

- site title, tagline, URL, title separator
- logo, favicon
- social links
- verification tags
- post/page settings
- menu items
- widget/section content

### Media data that can exist

- image URL source (rewritten to R2 public URL)
- alt
- width/height
- filename
- caption
- dominant color / blurhash (if present)

---

## 4) Missing Data Rules (must be flexible)

Theme must be robust if any optional data is missing.

### If data is missing, do this:

- no featured image -> show clean placeholder or no image block
- no excerpt -> hide excerpt area (do not leave ugly blank gap)
- no published date -> hide date row
- no byline -> hide author part
- no category/tag -> hide chips/links for that item
- no logo -> fallback to headshot or text brand
- no favicon -> do not break head/meta
- no CTA label/url -> hide CTA button
- no social links -> hide social row
- empty page content -> still render title/structure cleanly

No hardcoded personal content should be required for UI to look correct.

---

## 5) What You Must Design (all of it)

Each theme must provide complete visual treatment for:

- header
- hero
- category/filter chips
- post grid/cards
- post details page
- page content/prose
- sidebar
- footer
- responsive behavior (desktop/tablet/mobile)
- 404 styling

### Header must include styling for:

- brand block (logo/headshot/title/tagline)
- nav links + active state
- optional CTA
- mobile hamburger + mobile menu panel
- sticky behavior background/border

### Footer must include styling for:

- brand block
- explore links
- recent posts list
- social row
- copyright row

---

## 6) Required Class Hooks to Support

Please keep these classes implemented and styled:

- base/layout: `.skip-link`, `.container`, `.main-content`, `.section`
- header: `.site-header`, `.header-inner`, `.header-brand`, `.header-nav`, `.header-cta`, `.hamburger`, `.mobile-nav`
- hero: `.hero`, `.hero__title`, `.hero__tagline`, `.hero__body`, `.hero__actions`
- buttons: `.btn`, `.btn--primary`, `.btn--ghost`
- cards: `.post-grid`, `.post-grid--2col`, `.post-card`, `.post-card__image-wrap`, `.post-card__image`, `.post-card__body`, `.post-card__meta`, `.post-card__title`, `.post-card__excerpt`
- taxonomy UI: `.category-bar`, `.filter-bar`, `.category-chip`, `.filter-chip`
- article: `.layout-with-sidebar`, `.article-header`, `.article-category`, `.article-meta`, `.article-lead`, `.prose`
- sidebar: `.sidebar`, `.sidebar-section`, `.sidebar-heading`
- footer: `.site-footer`, `.footer-grid`, `.footer-brand-name`, `.footer-links`, `.footer-bottom`

You can add more classes. Do not remove support for the core ones.

---

## 7) Page Coverage That Must Work

Theme must fully support and style:

- `/`
- `/posts`
- `/posts/[slug]`
- `/category/[slug]`
- `/tag/[slug]`
- `/[...slug]` (CMS pages)
- `/404`
- `/sitemap.xml`
- `/robots.txt`
- `/rss.xml`

Do not remove SEO/canonical/OG/Twitter support from layout behavior.

---

## 8) Content Rendering Expectations

Portable content can include:

- paragraph text
- h1-h4 headings
- blockquotes
- bullets/numbered lists
- inline marks (`bold`, `italic`, `underline`, `code`, links)
- image blocks with caption/alignment

Theme must style all of these so content pages always look intentional.

---

## 9) Visual Density + Spacing Rules

Desktop should avoid oversized cards and too much dead space.

Expected:

- post grid supports denser desktop layouts (3 columns typical)
- can scale to 4 on very wide screens
- spacing feels balanced (not giant empty gaps)
- top hero area should not waste vertical space

---

## 10) Practical Examples (fallback behavior)

### Example A: post has no image

- card still shows title/meta/excerpt
- no broken image frame

### Example B: homepage has no CTA env values

- hero CTA button hidden
- layout still balanced

### Example C: page has empty content array

- page title + subtitle/excerpt still render
- no runtime error

### Example D: menu has only 2 links

- header spacing still looks designed
- mobile nav still works

---

## 11) Theme Quality Checklist

Before considering a theme complete:

1. Required theme files exist in the expected folder structure.
2. Header/footer/mobile nav are fully styled.
3. Missing data scenarios are handled cleanly.
4. All route types render correctly.
5. Responsive behavior works on desktop/tablet/mobile.
6. Typography + prose styles are complete.
7. Card density/spacing are visually balanced.

---

## 12) Current Architecture Gap vs Jonathan Repo

Your Jonathan repo uses shared markup + CSS variants.
This static builder uses separate theme folders.

So for now:

- do not provide only a variant CSS file
- design and package themes as full static-builder theme folders

Later we can refactor static-builder to shared-markup architecture to make future theme integration faster.

