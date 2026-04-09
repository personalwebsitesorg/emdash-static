#!/usr/bin/env node

/**
 * emdash-static setup
 *
 * One command to:
 * 1. Install emdash CMS (from npm, user picks template)
 * 2. Add static-export + deploy-hook plugin
 * 3. Create D1 database + R2 bucket
 * 4. Deploy CMS worker
 * 5. Deploy static builder worker
 * 6. Print URLs — done
 *
 * Usage:
 *   node setup.mjs
 *   CLOUDFLARE_API_TOKEN=xxx SITE_NAME=my-blog THEME=bold node setup.mjs
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";

const CONFIG_FILE = "site.config.json";

async function main() {
	console.log("\n  ╔══════════════════════════════╗");
	console.log("  ║   emdash-static setup        ║");
	console.log("  ╚══════════════════════════════╝\n");

	// ── Gather config ──
	const apiToken = process.env.CLOUDFLARE_API_TOKEN || await ask("Cloudflare API Token: ");
	const accountId = await fetchAccountId(apiToken);
	if (!accountId) { console.error("  Could not get account ID. Check your token."); process.exit(1); }
	console.log(`  Account: ${accountId}`);

	const siteName = process.env.SITE_NAME || await ask("Site name: ", "my-site");
	const theme = process.env.THEME || await ask("Theme (professional/editorial/minimal/bold): ", "professional");
	const template = process.env.TEMPLATE || await ask("EmDash template (blog/marketing/portfolio): ", "blog");

	const config = { apiToken, accountId, siteName, theme, template, d1Id: "", r2PublicUrl: "", subdomain: "" };

	// Get workers subdomain
	try {
		const res = await cf(`/accounts/${accountId}/workers/subdomain`, apiToken);
		config.subdomain = res.result?.subdomain || "";
	} catch {}

	// ── Step 1: Create emdash CMS ──
	console.log("\n  [1/6] Installing emdash CMS...");
	if (!existsSync("cms/package.json")) {
		scaffoldCms(siteName);
		console.log("         Created cms/");
	} else {
		console.log("         cms/ already exists, skipping");
	}

	// ── Step 2: Add static-export + deploy-hook ──
	console.log("  [2/6] Adding R2 export + deploy hook...");

	// Install emdash-static-export
	if (existsSync("cms/package.json")) {
		const pkg = JSON.parse(readFileSync("cms/package.json", "utf8"));
		if (!pkg.dependencies?.["emdash-static-export"]) {
			execSync("npm install emdash-static-export@github:personalwebsitesorg/emdash-static-export", {
				cwd: resolve("cms"), stdio: "pipe",
			});
		}
	}

	// Copy deploy-hook plugin
	mkdirSync("cms/src/plugins/deploy-hook", { recursive: true });
	cpSync("plugins/deploy-hook/index.ts", "cms/src/plugins/deploy-hook/index.ts");
	cpSync("plugins/deploy-hook/sandbox-entry.ts", "cms/src/plugins/deploy-hook/sandbox-entry.ts");

	// Rewrite astro.config.mjs
	writeAstroConfig();
	console.log("         Done");

	// ── Step 3: Create Cloudflare resources ──
	console.log("  [3/6] Creating Cloudflare resources...");

	// D1
	try {
		const res = await cf(`/accounts/${accountId}/d1/database`, apiToken, "POST", { name: `${siteName}-db` });
		config.d1Id = res.result?.uuid || "";
		console.log(`         D1: ${siteName}-db (${config.d1Id})`);
	} catch {
		// Already exists — find it
		try {
			const res = await cf(`/accounts/${accountId}/d1/database?name=${siteName}-db`, apiToken);
			config.d1Id = res.result?.[0]?.uuid || "";
			console.log(`         D1: ${siteName}-db (${config.d1Id}) — already existed`);
		} catch {}
	}

	// R2
	try {
		await cf(`/accounts/${accountId}/r2/buckets`, apiToken, "POST", { name: `${siteName}-media` });
		console.log(`         R2: ${siteName}-media`);
	} catch {
		console.log(`         R2: ${siteName}-media — already existed`);
	}

	// Check R2 public access
	try {
		const res = await cf(`/accounts/${accountId}/r2/buckets/${siteName}-media`, apiToken);
		if (res.result?.public_access?.enabled) {
			config.r2PublicUrl = res.result.public_access.url || "";
		}
	} catch {}

	if (!config.r2PublicUrl) {
		console.log("\n  ⚠  R2 public access not enabled yet.");
		console.log(`     Go to: Cloudflare Dashboard → R2 → ${siteName}-media → Settings → Public access → Enable`);
		console.log("     Then re-run setup or update static/.env manually.\n");
	}

	// ── Step 4: Write wrangler configs ──
	console.log("  [4/6] Writing configs...");
	writeCmsWrangler(config);
	writeStaticWrangler(config);
	writeStaticEnv(config);

	// Save config
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, "\t") + "\n");

	// ── Step 5: Install deps + Deploy CMS ──
	console.log("  [5/6] Deploying CMS worker...");
	const cfEnv = {
		...process.env,
		CLOUDFLARE_API_TOKEN: apiToken,
		CLOUDFLARE_ACCOUNT_ID: accountId,
	};

	try {
		execSync("npm install", { cwd: resolve("cms"), stdio: "inherit", env: cfEnv });
		execSync("npm run deploy", { cwd: resolve("cms"), stdio: "inherit", env: cfEnv });
	} catch (err) {
		console.error("  CMS deploy failed.");
		process.exit(1);
	}

	// ── Step 6: Deploy static worker ──
	console.log("\n  [6/6] Deploying static worker...");

	// First deploy: no R2 data yet, deploy a placeholder page
	// After user adds content + clicks "Export & Deploy", the real site builds
	const staticDir = resolve("static");
	const distDir = join(staticDir, "dist");
	mkdirSync(distDir, { recursive: true });
	writeFileSync(join(distDir, "index.html"),
		`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Coming Soon</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f1117;color:#e4e4e7}
.card{text-align:center;max-width:480px;padding:40px}h1{font-size:24px;margin-bottom:12px}p{color:#a1a1aa;line-height:1.6}</style>
</head><body><div class="card"><h1>${config.siteName}</h1>
<p>Static site is ready. Go to the CMS admin, add content, then click Export &amp; Deploy.</p>
</div></body></html>`);
	writeFileSync(join(distDir, "404.html"),
		`<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f1117;color:#e4e4e7}</style>
</head><body><h1>404 — Not Found</h1></body></html>`);

	try {
		execSync("npm install", { cwd: staticDir, stdio: "inherit", env: cfEnv });
		execSync("npx wrangler deploy", { cwd: staticDir, stdio: "inherit", env: cfEnv });
	} catch (err) {
		console.error("  Static deploy failed.");
		process.exit(1);
	}

	// ── Done ──
	const cmsUrl = `https://${siteName}-cms.${config.subdomain}.workers.dev`;
	const staticUrl = `https://${siteName}-static.${config.subdomain}.workers.dev`;

	console.log(`
  ════════════════════════════════════════════════
  Done! Both workers deployed.
  ════════════════════════════════════════════════

  CMS admin:   ${cmsUrl}/_emdash/admin
  Static site: ${staticUrl}

  What to do now:
  1. Go to the CMS admin
  2. Create some content (posts, pages, images)
  3. Go to Plugins → Deploy
  4. Pick a theme → click "Export & Deploy"
  5. Your static site is live!

  ${!config.r2PublicUrl ? "⚠  Remember to enable R2 public access first!\n" : ""}
  Config saved to site.config.json
`);
}

// ── Scaffold CMS manually (fallback) ──

function scaffoldCms(siteName) {
	mkdirSync("cms/src/pages", { recursive: true });
	writeFileSync("cms/package.json", JSON.stringify({
		name: `${siteName}-cms`,
		private: true,
		type: "module",
		scripts: { dev: "astro dev", build: "astro build", deploy: "astro build && wrangler deploy" },
		dependencies: {
			"@astrojs/cloudflare": "^13.1.6",
			"@astrojs/react": "^5.0.0",
			"@emdash-cms/cloudflare": "^0.0.3",
			"@emdash-cms/plugin-forms": "^0.0.3",
			astro: "^6.1.2",
			emdash: "^0.0.3",
			react: "^19.2.4",
			"react-dom": "^19.2.4",
		},
		devDependencies: { wrangler: "^4.81.0" },
	}, null, "\t") + "\n");
	writeFileSync("cms/tsconfig.json", JSON.stringify({ extends: "astro/tsconfigs/strict" }, null, "\t") + "\n");
}

// ── Write astro.config.mjs ──

function writeAstroConfig() {
	writeFileSync("cms/astro.config.mjs", `import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { deployHookPlugin } from "./src/plugins/deploy-hook/index.ts";
import { staticExport } from "emdash-static-export";

export default defineConfig({
\toutput: "server",
\tadapter: cloudflare(),
\tvite: {
\t\tresolve: {
\t\t\tdedupe: ["emdash"],
\t\t\talias: {
\t\t\t\t"@local/deploy-hook-sandbox": new URL("./src/plugins/deploy-hook/sandbox-entry.ts", import.meta.url).pathname,
\t\t\t},
\t\t},
\t},
\tintegrations: [
\t\treact(),
\t\temdash({
\t\t\tdatabase: d1({ binding: "DB", session: "auto" }),
\t\t\tstorage: r2({ binding: "MEDIA" }),
\t\t\tplugins: [formsPlugin(), deployHookPlugin()],
\t\t}),
\t\tstaticExport(),
\t],
\tdevToolbar: { enabled: false },
});
`);
}

// ── Write wrangler configs ──

function writeCmsWrangler(c) {
	writeFileSync("cms/wrangler.jsonc", `{
\t"$schema": "node_modules/wrangler/config-schema.json",
\t"name": "${c.siteName}-cms",
\t"account_id": "${c.accountId}",
\t"compatibility_date": "2026-04-06",
\t"compatibility_flags": ["nodejs_compat"],
\t"assets": { "directory": "./dist" },
\t"d1_databases": [{
\t\t"binding": "DB",
\t\t"database_name": "${c.siteName}-db",
\t\t"database_id": "${c.d1Id || "local"}"
\t}],
\t"r2_buckets": [{
\t\t"binding": "MEDIA",
\t\t"bucket_name": "${c.siteName}-media"
\t}],
\t"observability": { "enabled": true }
}
`);
}

function writeStaticWrangler(c) {
	writeFileSync("static/wrangler.jsonc", `{
\t"$schema": "node_modules/wrangler/config-schema.json",
\t"name": "${c.siteName}-static",
\t"account_id": "${c.accountId}",
\t"compatibility_date": "2026-04-06",
\t"assets": { "directory": "./dist", "not_found_handling": "404-page" },
\t"observability": { "enabled": true }
}
`);
}

function writeStaticEnv(c) {
	writeFileSync("static/.env", [
		`THEME=${c.theme}`,
		c.r2PublicUrl ? `SNAPSHOT_URL=${c.r2PublicUrl}/exports/site-export.json` : "# SNAPSHOT_URL=https://pub-xxx.r2.dev/exports/site-export.json",
		c.r2PublicUrl ? `R2_PUBLIC_URL=${c.r2PublicUrl}` : "# R2_PUBLIC_URL=https://pub-xxx.r2.dev",
	].join("\n") + "\n");
}

// ── Cloudflare API ──

async function cf(path, token, method = "GET", body = null) {
	const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const json = await res.json();
	if (!json.success && json.errors?.length) throw new Error(json.errors[0].message);
	return json;
}

async function fetchAccountId(token) {
	try {
		const res = await cf("/accounts?per_page=1", token);
		return res.result?.[0]?.id || "";
	} catch { return ""; }
}

function ask(q, def = "") {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise(r => {
		rl.question(`  ${q}${def ? `(${def}) ` : ""}`, a => { rl.close(); r(a.trim() || def); });
	});
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
