#!/usr/bin/env node
/**
 * Sync WordPress site → emdash CMS using the CMS REST API.
 * Uses proper CMS endpoints for media upload, content update, settings, menus.
 * No direct D1/R2 access — everything goes through the CMS.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

// ── Config ──
const CMS_URL = "https://davidlkirkpatrick-cms.personalwebsites.workers.dev";
const WP_URL = "https://davidlkirkpatrick.com";
const TMP = "/tmp/wp-sync";
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// API token — will be set after creation
let API_TOKEN = process.env.CMS_TOKEN || "";

// ── CMS API helpers ──

async function cms(method, path, body) {
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "X-EmDash-Request": "1",
    },
  };
  if (body && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const resp = await fetch(`${CMS_URL}${path}`, opts);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!resp.ok) {
    console.log(`  API ${resp.status}: ${method} ${path}`);
    if (typeof data === "object") console.log(`  Error:`, JSON.stringify(data).slice(0, 200));
    return null;
  }
  return data;
}

async function downloadFile(url) {
  const resp = await fetch(url);
  if (!resp.ok) { console.log(`  Download failed ${resp.status}: ${url}`); return null; }
  return Buffer.from(await resp.arrayBuffer());
}

// ── Step 0: Check we have a token ──
if (!API_TOKEN) {
  console.log("ERROR: Set CMS_TOKEN environment variable.");
  console.log("Create one in the CMS admin: Settings > API Tokens");
  console.log("Or go to: " + CMS_URL + "/_emdash/admin/settings");
  console.log("\nThen run: CMS_TOKEN=ec_pat_xxx node sync-wp-to-cms.mjs");
  process.exit(1);
}

// Verify token works
const me = await cms("GET", "/_emdash/api/auth/me");
if (!me) {
  console.log("ERROR: API token is invalid or expired.");
  process.exit(1);
}
console.log(`Authenticated as: ${me.email || me.name || "admin"}\n`);

// ── Step 1: Update site settings ──
console.log("=== Step 1: Updating site settings ===");

const settingsResult = await cms("POST", "/_emdash/api/settings", {
  title: "David Kirkpatrick",
  tagline: "Founder of Reading 4 Results",
  social: {
    twitter: "https://x.com/davidreadfast",
    instagram: "https://www.instagram.com/davidreadsfast/",
    linkedin: "https://www.linkedin.com/in/davidkirk95/",
  },
  postsPerPage: 10,
  seo: {
    titleSeparator: " | ",
  },
});
console.log(settingsResult ? "  Settings updated" : "  Settings update failed");

// ── Step 2: Upload all WordPress media via CMS API ──
console.log("\n=== Step 2: Uploading WordPress media ===");

// WordPress media → CMS media ID map
const wpMediaToCmsId = new Map();

const wpMediaItems = [
  { wpId: 1091, url: `${WP_URL}/wp-content/uploads/sites/55/2025/07/THeme-7.png`, filename: "THeme-7.png", mime: "image/png", w: 1920, h: 1080 },
  { wpId: 1201, url: `${WP_URL}/wp-content/uploads/sites/55/2026/03/reading-like-food-1-scaled.jpg`, filename: "reading-like-food-1.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1191, url: `${WP_URL}/wp-content/uploads/sites/55/2026/01/davidkirkpatrickarticle.png`, filename: "davidkirkpatrickarticle.png", mime: "image/png", w: 554, h: 509 },
  { wpId: 1179, url: `${WP_URL}/wp-content/uploads/sites/55/2026/01/12-week-year.webp`, filename: "12-week-year.webp", mime: "image/webp", w: 300, h: 450 },
  { wpId: 1126, url: `${WP_URL}/wp-content/uploads/sites/55/2025/10/audiobook-e1760570098465.jpg`, filename: "audiobook.jpg", mime: "image/jpeg", w: 427, h: 350 },
  { wpId: 1118, url: `${WP_URL}/wp-content/uploads/sites/55/2025/10/Books-scaled.jpg`, filename: "books-must-read.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1111, url: `${WP_URL}/wp-content/uploads/sites/55/2025/09/Niki-scaled.jpg`, filename: "niki.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1099, url: `${WP_URL}/wp-content/uploads/sites/55/2025/08/Books-scaled.jpg`, filename: "books-earlier.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1094, url: `${WP_URL}/wp-content/uploads/sites/55/2025/07/Robert-G-scaled.jpg`, filename: "robert-greene.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1088, url: `${WP_URL}/wp-content/uploads/sites/55/2025/07/Psych-books-scaled.jpg`, filename: "psych-books.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1076, url: `${WP_URL}/wp-content/uploads/sites/55/2025/07/5Books-scaled.jpg`, filename: "5-business-books.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1069, url: `${WP_URL}/wp-content/uploads/sites/55/2025/06/Power-Readers-scaled.jpg`, filename: "power-readers.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 1008, url: `${WP_URL}/wp-content/uploads/sites/55/2025/06/7-Laws-scaled.jpg`, filename: "7-laws.jpg", mime: "image/jpeg", w: 2560, h: 1920 },
  { wpId: 988, url: `${WP_URL}/wp-content/uploads/sites/55/2025/05/Speed-reading-techniques.jpg`, filename: "speed-reading-techniques.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 978, url: `${WP_URL}/wp-content/uploads/sites/55/2025/04/One-Percent-Readers.jpg`, filename: "one-percent-readers.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 969, url: `${WP_URL}/wp-content/uploads/sites/55/2025/04/Podcast-DAVID.jpg`, filename: "podcast-david.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 963, url: `${WP_URL}/wp-content/uploads/sites/55/2025/04/Speed-Reading-mini-course.jpg`, filename: "speed-reading-mini-course.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 953, url: `${WP_URL}/wp-content/uploads/sites/55/2025/03/Photographic-memory.jpg`, filename: "photographic-memory.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 939, url: `${WP_URL}/wp-content/uploads/sites/55/2025/03/Stress.jpg`, filename: "stress.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 934, url: `${WP_URL}/wp-content/uploads/sites/55/2025/03/Comprehension-blockers.jpg`, filename: "comprehension-blockers.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 916, url: `${WP_URL}/wp-content/uploads/sites/55/2024/12/scam.jpg`, filename: "scam.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 909, url: `${WP_URL}/wp-content/uploads/sites/55/2024/12/Speedreading.jpg`, filename: "speedreading.jpg", mime: "image/jpeg", w: 800, h: 600 },
  { wpId: 860, url: `${WP_URL}/wp-content/uploads/sites/55/2024/11/DavidKHeadshots.jpg`, filename: "headshots.jpg", mime: "image/jpeg", w: 800, h: 600 },
];

for (const m of wpMediaItems) {
  console.log(`  Uploading: ${m.filename}...`);
  const buf = await downloadFile(m.url);
  if (!buf) continue;

  // Use direct multipart upload to CMS
  const localPath = `${TMP}/${m.filename}`;
  writeFileSync(localPath, buf);

  const form = new FormData();
  const blob = new Blob([buf], { type: m.mime });
  form.append("file", blob, m.filename);
  form.append("width", String(m.w));
  form.append("height", String(m.h));

  const result = await cms("POST", "/_emdash/api/media", form);
  if (result && result.item) {
    wpMediaToCmsId.set(m.wpId, result.item.id);
    console.log(`    OK → ${result.item.id} (${result.item.storageKey || "uploaded"})`);
  } else if (result && result.data && result.data.item) {
    wpMediaToCmsId.set(m.wpId, result.data.item.id);
    console.log(`    OK → ${result.data.item.id}`);
  } else {
    console.log(`    FAILED`);
  }

  try { unlinkSync(localPath); } catch {}
}

console.log(`\n  Uploaded ${wpMediaToCmsId.size} / ${wpMediaItems.length} media items`);

// ── Step 3: Update post featured images ──
console.log("\n=== Step 3: Updating post featured images ===");

// Post slug → WP media ID
const postFeaturedMedia = {
  "treat-reading-like-food": 1201,
  "ai-powered-party-planning": 1191,
  "reimagine-your-year-the-power-of-12-week-cycles-2": 1179,
  "audiobook-addiction": 1126,
  "your-must-read-book-list": 1118,
  "nikis-3-powerful-reading-hacks": 1111,
  "books-i-wish-i-read-earlier-in-life": 1099,
  "5-best-human-psychology-books": 1088,
  "robert-greene": 1094,
  "power-readers": 1069,
  "sharpen-the-saw": 1008,
  "speed-reading-techniques": 988,
  "one-percent-readers": 978,
  "genius-at-work-podcast": 969,
  "speed-reading-mini-course": 963,
  "5-business-books": 1076,
  "speed-reading-tips": 909,
  "speed-reading-scam": 916,
  "less-stressed": 939,
  "master-your-memory": 953,
  "comprehension-blockers": 934,
  "headshots": 860,
};

// First get all posts to find their CMS IDs
const postsResp = await cms("GET", "/_emdash/api/content/posts?limit=100");
const posts = postsResp?.data?.items || postsResp?.items || [];
console.log(`  Found ${posts.length} posts in CMS`);

for (const post of posts) {
  const slug = post.slug || post.data?.slug;
  const postId = post.id;
  const wpMediaId = postFeaturedMedia[slug];

  if (!wpMediaId) continue;

  const cmsMediaId = wpMediaToCmsId.get(wpMediaId);
  if (!cmsMediaId) {
    console.log(`  SKIP ${slug}: no CMS media for WP ${wpMediaId}`);
    continue;
  }

  // Get the media item to build the featured_image URL
  const mediaItem = await cms("GET", `/_emdash/api/media/${cmsMediaId}`);
  const media = mediaItem?.data?.item || mediaItem?.item || mediaItem;
  if (!media || !media.id) {
    console.log(`  SKIP ${slug}: couldn't fetch media ${cmsMediaId}`);
    continue;
  }

  // Get current post to get _rev
  const postResp = await cms("GET", `/_emdash/api/content/posts/${postId}`);
  const rev = postResp?.data?._rev || postResp?._rev;

  // Build the featured_image URL that the CMS stores
  const mediaUrl = `${CMS_URL}/_emdash/api/media/file/${media.storageKey || media.storage_key}`;

  const updateResult = await cms("PUT", `/_emdash/api/content/posts/${postId}`, {
    data: {
      featured_image: mediaUrl,
    },
    _rev: rev,
  });

  if (updateResult) {
    console.log(`  Updated: ${slug}`);
  } else {
    console.log(`  FAILED: ${slug}`);
  }
}

// ── Step 4: Update home page featured image (hero) ──
console.log("\n=== Step 4: Setting homepage hero image ===");

const pagesResp = await cms("GET", "/_emdash/api/content/pages?limit=100");
const pages = pagesResp?.data?.items || pagesResp?.items || [];
console.log(`  Found ${pages.length} pages in CMS`);

// Find the homepage — could be slug "home" or "david-kirkpatrick-photos-bio-website"
const homePage = pages.find(p =>
  p.slug === "home" ||
  p.slug === "david-kirkpatrick-photos-bio-website" ||
  (p.data?.title || p.title || "").toLowerCase().includes("david kirkpatrick")
);

if (homePage) {
  const heroMediaId = wpMediaToCmsId.get(1091); // THeme-7.png
  if (heroMediaId) {
    const heroMedia = await cms("GET", `/_emdash/api/media/${heroMediaId}`);
    const hm = heroMedia?.data?.item || heroMedia?.item || heroMedia;
    const pageResp = await cms("GET", `/_emdash/api/content/pages/${homePage.id}`);
    const rev = pageResp?.data?._rev || pageResp?._rev;

    const heroUrl = `${CMS_URL}/_emdash/api/media/file/${hm.storageKey || hm.storage_key}`;
    const result = await cms("PUT", `/_emdash/api/content/pages/${homePage.id}`, {
      data: { featured_image: heroUrl },
      _rev: rev,
    });
    console.log(result ? `  Set hero on: ${homePage.slug}` : "  FAILED to set hero");
  }
} else {
  console.log("  No homepage found");
}

// ── Step 5: Update menu ──
console.log("\n=== Step 5: Updating navigation menu ===");

// Get existing menu
const menusResp = await cms("GET", "/_emdash/api/menus");
const menus = menusResp?.data?.items || menusResp?.items || [];
console.log(`  Found ${menus.length} menus`);

let mainMenu = menus.find(m => m.name === "main" || m.name === "primary");
if (!mainMenu) {
  // Create main menu
  const created = await cms("POST", "/_emdash/api/menus", { name: "main", label: "Main" });
  mainMenu = created?.data || created;
  console.log("  Created 'main' menu");
}

if (mainMenu) {
  const menuName = mainMenu.name;

  // Get existing items to delete them
  const menuResp = await cms("GET", `/_emdash/api/menus/${menuName}`);
  const existingItems = menuResp?.data?.items || menuResp?.items || [];

  // Delete existing items
  for (const item of existingItems) {
    await cms("DELETE", `/_emdash/api/menus/${menuName}/items?id=${item.id}`);
  }
  console.log(`  Cleared ${existingItems.length} existing items`);

  // Find page IDs for reference-based menu items
  const aboutPage = pages.find(p => p.slug === "about");
  const contactPage = pages.find(p => p.slug === "contact");

  // Add new items matching WordPress nav
  const menuItems = [
    aboutPage
      ? { type: "page", label: "Start Here", referenceCollection: "pages", referenceId: aboutPage.id, sortOrder: 0 }
      : { type: "custom", label: "Start Here", customUrl: "/about", sortOrder: 0 },
    { type: "custom", label: "Articles", customUrl: "/posts", sortOrder: 1 },
    contactPage
      ? { type: "page", label: "Contact", referenceCollection: "pages", referenceId: contactPage.id, sortOrder: 2 }
      : { type: "custom", label: "Contact", customUrl: "/contact", sortOrder: 2 },
  ];

  for (const item of menuItems) {
    const result = await cms("POST", `/_emdash/api/menus/${menuName}/items`, item);
    console.log(result ? `  Added: ${item.label}` : `  FAILED: ${item.label}`);
  }
}

// ── Done ──
console.log("\n=== DONE ===");
console.log("All data synced through the CMS API.");
console.log("Now go to the CMS, do Export to R2, then click Deploy.");
console.log(`CMS: ${CMS_URL}/_emdash/admin/plugins/deploy-hook/deploy`);
