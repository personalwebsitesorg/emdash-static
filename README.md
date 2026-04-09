# emdash-static

One repo, two Cloudflare Workers per website. An [emdash](https://github.com/emdash-cms/emdash) CMS for content management and a static site builder with themes for the public-facing site.

## How it works

```
emdash CMS (Worker 1)          Static Site (Worker 2)
┌──────────────────┐            ┌──────────────────┐
│ Admin panel      │            │ Pre-built HTML    │
│ Content editing  │            │ Themed pages      │
│ R2 export        │   R2      │ No database       │
│ Deploy button    │──bucket──→│ Fast, global CDN  │
│ Theme picker     │            │                   │
└──────────────────┘            └──────────────────┘
```

1. Edit content in the CMS admin
2. Export to R2 (creates a JSON snapshot of all content)
3. Click Deploy with a theme — static site rebuilds from the R2 data

## What's in this repo

```
emdash-static/
├── setup.mjs              ← One command to create everything
├── plugins/
│   └── deploy-hook/       ← CMS plugin: Deploy button + theme picker
│       ├── index.ts
│       └── sandbox-entry.ts
└── static/                ← Static site builder
    ├── astro.config.mjs
    ├── scripts/
    │   └── fetch-snapshot.mjs
    └── src/
        ├── shared/        ← Data layer, Portable Text renderer
        └── themes/        ← professional, editorial, minimal, bold
```

The CMS is **not** in this repo — it's installed from npm (`emdash`). This repo has the static builder and the deploy-hook plugin that connects them.

## Create a new website

### Prerequisites

- Node.js 22+
- A Cloudflare account
- A Cloudflare API token with these permissions:
  - Account: D1 (Edit)
  - Account: Workers R2 Storage (Edit)
  - Account: Workers Scripts (Edit)
  - Account: Workers KV Storage (Edit)
  - Account: Workers Builds Configuration (Edit)
  - Account: Account Settings (Read)
  - User: Memberships (Read)

### Step 1: Clone this repo

```bash
git clone https://github.com/personalwebsitesorg/emdash-static.git my-site
cd my-site
```

### Step 2: Run setup

```bash
CLOUDFLARE_API_TOKEN=your_token SITE_NAME=my-blog THEME=bold node setup.mjs
```

Or run interactively (it will prompt for each value):

```bash
node setup.mjs
```

The setup script automatically:
1. Creates emdash CMS in `cms/` (installs from npm)
2. Adds the R2 export integration + deploy-hook plugin
3. Creates a D1 database
4. Creates an R2 bucket + enables public access
5. Deploys the CMS worker
6. Deploys the static site worker (placeholder)
7. Connects the static worker to this GitHub repo via Workers Builds
8. Sets build environment variables (THEME, SNAPSHOT_URL, R2_PUBLIC_URL)
9. Creates a build trigger + writes the deploy hook URL to the CMS

After setup, you get two workers:

```
CMS:    https://my-blog-cms.your-subdomain.workers.dev
Static: https://my-blog-static.your-subdomain.workers.dev
```

### Step 3: Add content

1. Go to the CMS admin: `https://my-blog-cms.your-subdomain.workers.dev/_emdash/admin`
2. Set up your admin account (first visit)
3. Create posts, pages, upload images

### Step 4: Export to R2

1. Go to `/_emdash/export` in the CMS admin
2. Click **Export to R2**
3. This uploads a JSON snapshot of all your content to R2

### Step 5: Deploy the static site

1. Go to **Plugins → Deploy** in the CMS admin
2. Pick a theme from the dropdown
3. Click **Deploy**
4. Workers Builds clones this repo, builds `static/` with your R2 data and chosen theme, deploys

The static site will be live at your static worker URL within ~1 minute.

## Day-to-day workflow

```
Edit content → Export to R2 → Click Deploy → Static site updates
```

That's it. The static site rebuilds from your R2 data every time you click Deploy.

## Themes

| Theme | Look |
|-------|------|
| **professional** | Warm corporate — amber accents, 3-column cards, sidebar |
| **editorial** | Literary magazine — serif headings, cream/crimson, single column |
| **minimal** | Swiss precision — black/white, flat list, maximum whitespace |
| **bold** | Dark aurora — gradients, glow effects, dark background |

Change the theme anytime from the Deploy plugin settings in the CMS admin.

## Making another website

Same repo, new site. Each site gets its own D1 database, R2 bucket, and two workers. The static builder code is shared.

```bash
# From a fresh clone of this repo:
CLOUDFLARE_API_TOKEN=your_token SITE_NAME=another-site THEME=editorial node setup.mjs
```

## Redeploying after code changes

If you update the themes or static builder code:

```bash
git add -A && git commit -m "update" && git push
```

Then click **Deploy** in the CMS admin — Workers Builds will pull the latest code.

## Project structure after setup

```
my-site/
├── setup.mjs
├── plugins/deploy-hook/
├── static/                     ← Static builder (shared via GitHub)
│   ├── src/themes/
│   ├── src/shared/
│   └── scripts/
├── cms/                        ← Created by setup (gitignored)
│   ├── astro.config.mjs
│   ├── wrangler.jsonc
│   ├── node_modules/
│   └── src/plugins/deploy-hook/
└── site.config.json            ← Created by setup (gitignored)
```

## Environment variables

Set in Workers Builds automatically by setup.mjs:

| Variable | Purpose |
|----------|---------|
| `THEME` | Which theme to build (updated when you change it in CMS) |
| `SNAPSHOT_URL` | R2 public URL to the exported JSON |
| `R2_PUBLIC_URL` | R2 public URL for media (images) |
| `CLOUDFLARE_ACCOUNT_ID` | For `wrangler deploy` |
| `CLOUDFLARE_API_TOKEN` | For `wrangler deploy` |
