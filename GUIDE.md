# How to Make a New Website

## Prerequisites

- Node.js 22+
- pnpm (`corepack enable` to activate)
- A Cloudflare API token (see "Create a Token" below)

## Create a Token

Go to https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom Token

Add these permissions:

| Scope   | Resource                       | Permission |
|---------|-------------------------------|------------|
| Account | D1                            | Edit       |
| Account | Workers R2 Storage            | Edit       |
| Account | Workers Scripts               | Edit       |
| Account | Workers KV Storage            | Edit       |
| Account | Workers Builds Configuration  | Edit       |
| Account | Account Settings              | Read       |
| User    | Memberships                   | Read       |

Save the token.

## Make a Website

### Step 1: Clone the repo

```bash
git clone https://github.com/personalwebsitesorg/emdash-static.git my-blog
cd my-blog
```

### Step 2: Run setup

```bash
CLOUDFLARE_API_TOKEN=your_token_here SITE_NAME=my-blog THEME=bold node setup.mjs
```

Or run without env vars and it will ask you:

```bash
node setup.mjs
```

Setup takes about 2 minutes. It:

1. Downloads the latest emdash blog template
2. Adds R2 export + deploy hook plugin
3. Creates D1 database + R2 bucket + enables R2 public URL
4. Deploys CMS worker
5. Deploys static site worker (placeholder)
6. Connects static worker to this GitHub repo via Workers Builds
7. Writes the deploy hook URL to the CMS database

When done, you get:

```
CMS admin:   https://my-blog-cms.your-subdomain.workers.dev/_emdash/admin
Static site: https://my-blog-static.your-subdomain.workers.dev
```

### Step 3: Set up your admin account

Go to the CMS admin URL. You'll see the setup page. Create your admin account with a passkey.

### Step 4: Add content

In the CMS admin:

- **Posts** → New Post → write content, add featured image, publish
- **Pages** → New Page → about page, contact page, etc
- **Media** → upload images
- **Menus** → set up navigation
- **Settings** → site title, tagline, logo, favicon

### Step 5: Export to R2

Go to `/_emdash/export` in the CMS admin. Click **Export to R2**.

This creates a JSON snapshot of all your content and uploads it to your R2 bucket.

### Step 6: Deploy the static site

Go to **Plugins → Deploy** in the CMS admin.

- The deploy hook URL and theme should already be filled in (set by setup)
- Pick a different theme if you want (professional, editorial, minimal, bold)
- Click **Deploy**

Workers Builds will:
1. Clone the repo
2. Go to `static/` folder
3. Fetch your JSON from R2
4. Build HTML with the chosen theme
5. Deploy to the static worker

Takes about 1 minute. Your static site is live.

## Day-to-Day Workflow

```
Edit content → Export to R2 → Click Deploy
```

That's it. Three steps every time you update content.

## Available Themes

| Theme          | Look                                              |
|----------------|--------------------------------------------------|
| professional   | Warm corporate — amber accents, 3-column cards    |
| editorial      | Literary magazine — serif, cream/crimson           |
| minimal        | Swiss precision — black/white, flat list           |
| bold           | Dark aurora — gradients, glow effects              |

Change the theme anytime from the Deploy plugin settings.

## Make Another Website

Same steps. Each site is independent — its own D1, R2, and two workers.

```bash
git clone https://github.com/personalwebsitesorg/emdash-static.git another-site
cd another-site
CLOUDFLARE_API_TOKEN=your_token SITE_NAME=another-site THEME=editorial node setup.mjs
```

All sites share the same repo code (static builder + themes). Only the data and theme choice differ.

## Updating Themes

If you or your team updates the themes in the `static/` folder:

```bash
git add -A && git commit -m "update themes" && git push
```

Then click **Deploy** in any site's CMS admin. Workers Builds pulls the latest code.

## Troubleshooting

### CMS shows 500 error

Visit `/_emdash/admin` — the first visit triggers database migrations. Refresh after a few seconds.

### Deploy plugin shows "Deploy hook not configured"

Setup may not have written the hook URL to D1. Check `site.config.json` for the `triggerUrl` value and paste it in the plugin settings manually.

### Static site shows "Coming Soon"

You haven't deployed yet. Add content, export to R2, then click Deploy.

### Deploy fails in Workers Builds

Check the build logs in Cloudflare Dashboard → Workers & Pages → your static worker → Builds. Common issues:
- Missing `SNAPSHOT_URL` — R2 export hasn't been done yet
- Build timeout — try again, Workers Builds has cold start delays

### R2 export fails

Make sure the R2 bucket exists and the CMS worker has the MEDIA binding. Check `cms/wrangler.jsonc`.

## Files Reference

```
my-blog/
├── setup.mjs              ← Run once to create everything
├── site.config.json        ← Created by setup (gitignored)
├── plugins/
│   └── deploy-hook/        ← Deploy button + theme picker plugin
├── static/                 ← Static site builder (shared code)
│   ├── src/themes/         ← 4 themes
│   ├── src/shared/         ← Data layer
│   └── scripts/            ← Fetch snapshot from R2
└── cms/                    ← Created by setup (gitignored)
    ├── astro.config.mjs    ← Patched with our plugins
    ├── wrangler.jsonc       ← D1 + R2 + worker_loaders
    └── src/                ← emdash template pages
```
