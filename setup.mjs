#!/usr/bin/env node

/**
 * emdash-static setup
 *
 * One command to create a full website:
 * 1. Install emdash CMS from npm
 * 2. Add R2 export + deploy-hook plugin
 * 3. Create D1, R2, enable R2 public access
 * 4. Deploy CMS worker
 * 5. Deploy static worker (placeholder)
 * 6. Connect static worker to GitHub via Workers Builds
 * 7. Write deploy hook URL + theme to CMS database
 *
 * Usage:
 *   node setup.mjs
 *   CLOUDFLARE_API_TOKEN=xxx SITE_NAME=my-blog THEME=bold node setup.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, readdirSync } from "node:fs";
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
	console.log("  Account: " + accountId);

	const siteName = (process.env.SITE_NAME || await ask("Site name: ", "my-site")).toLowerCase();

	// Read available themes from local static/src/themes directory
	var availableThemes = [];
	if (existsSync("static/src/themes")) {
		var themeEntries = readdirSync("static/src/themes", { withFileTypes: true });
		for (var i = 0; i < themeEntries.length; i++) {
			if (themeEntries[i].isDirectory() && themeEntries[i].name !== "shared") {
				availableThemes.push(themeEntries[i].name);
			}
		}
	}
	if (availableThemes.length === 0) availableThemes = ["professional", "editorial", "minimal", "bold"];

	const theme = process.env.THEME || await ask("Theme (" + availableThemes.join("/") + "): ", availableThemes[0]);

	const config = { apiToken, accountId, siteName, theme, d1Id: "", r2PublicUrl: "", subdomain: "", triggerUrl: "" };

	// Get workers subdomain
	try {
		const res = await cf("/accounts/" + accountId + "/workers/subdomain", apiToken);
		config.subdomain = res.result?.subdomain || "";
	} catch {}

	// ── Step 1: Create emdash CMS from latest ──
	console.log("\n  [1/7] Installing emdash CMS (latest)...");
	if (!existsSync("cms/package.json")) {
		var created = false;
		// Try automated create-emdash (uses expect to answer interactive prompts)
		try {
			var expectScript = [
				'set timeout 120',
				'spawn npx --yes create-emdash@latest cms',
				'expect "Project name?"',
				'send "' + siteName + '-cms\\r"',
				'expect "deploy?"',
				'send "\\r"',
				'expect "template?"',
				'send "\\r"',
				'expect "package manager?"',
				'send "\\033\\[B\\r"',
				'expect "dependencies?"',
				'send "\\r"',
				'expect eof',
			].join("\n");
			execSync("expect -c '" + expectScript.replace(/'/g, "'\\''") + "'", { stdio: "pipe", timeout: 180000 });
			if (existsSync("cms/package.json")) {
				// Remove monorepo artifact
				try { execSync("rm -f cms/pnpm-workspace.yaml", { stdio: "pipe" }); } catch {}
				created = true;
				console.log("         Created via create-emdash (latest)");
			}
		} catch {}

		// Fallback: download template directly via giget
		if (!created) {
			try {
				execSync("npx --yes giget@latest github:emdash-cms/templates/blog-cloudflare cms", { stdio: "pipe" });
				try { execSync("rm -f cms/pnpm-workspace.yaml", { stdio: "pipe" }); } catch {}
				created = true;
				console.log("         Downloaded blog-cloudflare template");
			} catch {}
		}

		// Final fallback: manual scaffold
		if (!created) {
			console.log("         Scaffolding manually...");
			scaffoldCms(siteName);
		}
		console.log("         Created cms/");
	} else {
		console.log("         cms/ already exists, skipping");
	}

	// ── Step 2: Add plugins ──
	console.log("  [2/7] Adding R2 export + deploy hook...");

	// Install emdash-static-export
	const pkg = JSON.parse(readFileSync("cms/package.json", "utf8"));
	if (!pkg.dependencies?.["emdash-static-export"]) {
		execSync("pnpm add emdash-static-export@github:personalwebsitesorg/emdash-static-export", {
			cwd: resolve("cms"), stdio: "pipe",
		});
	}

	// Copy deploy-hook plugin
	mkdirSync("cms/src/plugins/deploy-hook", { recursive: true });
	cpSync("plugins/deploy-hook/index.ts", "cms/src/plugins/deploy-hook/index.ts");
	cpSync("plugins/deploy-hook/sandbox-entry.ts", "cms/src/plugins/deploy-hook/sandbox-entry.ts");

	// Copy resend email plugin
	mkdirSync("cms/src/plugins/resend", { recursive: true });
	cpSync("plugins/resend/index.ts", "cms/src/plugins/resend/index.ts");
	cpSync("plugins/resend/sandbox-entry.ts", "cms/src/plugins/resend/sandbox-entry.ts");

	// Rewrite astro.config.mjs
	writeAstroConfig();
	console.log("         Done");

	// ── Step 3: Create Cloudflare resources ──
	console.log("  [3/7] Creating Cloudflare resources...");

	// D1
	try {
		const res = await cf("/accounts/" + accountId + "/d1/database", apiToken, "POST", { name: siteName + "-db" });
		config.d1Id = res.result?.uuid || "";
		console.log("         D1: " + siteName + "-db (" + config.d1Id + ")");
	} catch {
		try {
			const res = await cf("/accounts/" + accountId + "/d1/database?name=" + siteName + "-db", apiToken);
			config.d1Id = res.result?.[0]?.uuid || "";
			console.log("         D1: " + siteName + "-db (" + config.d1Id + ") — existed");
		} catch {}
	}

	// R2
	try {
		await cf("/accounts/" + accountId + "/r2/buckets", apiToken, "POST", { name: siteName + "-media" });
		console.log("         R2: " + siteName + "-media");
	} catch {
		console.log("         R2: " + siteName + "-media — existed");
	}

	// Enable R2 public access
	try {
		const res = await cf("/accounts/" + accountId + "/r2/buckets/" + siteName + "-media/domains/managed", apiToken, "PUT", { enabled: true });
		config.r2PublicUrl = "https://" + (res.result?.domain || "");
		console.log("         R2 public: " + config.r2PublicUrl);
	} catch {
		try {
			const res = await cf("/accounts/" + accountId + "/r2/buckets/" + siteName + "-media/domains/managed", apiToken);
			if (res.result?.domain) config.r2PublicUrl = "https://" + res.result.domain;
		} catch {}
	}

	// ── Step 4: Write configs ──
	console.log("  [4/7] Writing configs...");
	writeCmsWrangler(config);
	writeStaticWrangler(config);
	writeStaticEnv(config);
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, "\t") + "\n");

	const cfEnv = { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId };

	// ── Step 5: Deploy CMS ──
	console.log("  [5/7] Deploying CMS worker...\n");
	try {
		execSync("pnpm install", { cwd: resolve("cms"), stdio: "inherit", env: cfEnv });
		execSync("pnpm run deploy", { cwd: resolve("cms"), stdio: "inherit", env: cfEnv });
	} catch {
		console.error("\n  CMS deploy failed.");
		process.exit(1);
	}

	// ── Step 6: Deploy static (placeholder) ──
	console.log("\n  [6/7] Deploying static worker...\n");
	const distDir = join(resolve("static"), "dist");
	mkdirSync(distDir, { recursive: true });
	writeFileSync(join(distDir, "index.html"),
		"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + siteName + "</title>" +
		"<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f1117;color:#e4e4e7}" +
		".card{text-align:center;max-width:480px;padding:40px}h1{font-size:24px;margin-bottom:12px}p{color:#a1a1aa;line-height:1.6}</style>" +
		"</head><body><div class=\"card\"><h1>" + siteName + "</h1>" +
		"<p>Static site ready. Add content in the CMS, export to R2, then deploy.</p></div></body></html>");
	writeFileSync(join(distDir, "404.html"),
		"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>404</title>" +
		"<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f1117;color:#e4e4e7}</style>" +
		"</head><body><h1>404 — Not Found</h1></body></html>");

	try {
		execSync("npm install", { cwd: resolve("static"), stdio: "inherit", env: cfEnv });
		execSync("npx wrangler deploy", { cwd: resolve("static"), stdio: "inherit", env: cfEnv });
	} catch {
		console.error("\n  Static deploy failed.");
		process.exit(1);
	}

	// ── Step 7: Connect Workers Builds + write deploy hook to D1 ──
	console.log("\n  [7/7] Setting up Workers Builds...");

	// Get static worker tag
	var workerTag = "";
	try {
		const res = await cf("/accounts/" + accountId + "/workers/scripts", apiToken);
		for (const w of res.result || []) {
			if (w.id === siteName + "-static") { workerTag = w.tag; break; }
		}
	} catch {}

	if (workerTag) {
		// Get token ID for build token
		var tokenId = "";
		try {
			const res = await cf("/user/tokens/verify", apiToken);
			tokenId = res.result?.id || "";
		} catch {}

		// Repo connection
		var repoConnId = "";
		try {
			const res = await cf("/accounts/" + accountId + "/builds/repos/connections", apiToken, "PUT", {
				provider_type: "github",
				provider_account_id: "271307252",
				provider_account_name: "personalwebsitesorg",
				repo_id: "1206270984",
				repo_name: "emdash-static",
			});
			repoConnId = res.result?.repo_connection_uuid || "";
			console.log("         Repo connected");
		} catch {
			// Already connected — try to find it
			console.log("         Repo connection exists");
			// Use the existing one
			repoConnId = repoConnId || "existing";
		}

		// Build token
		var buildTokenId = "";
		try {
			const res = await cf("/accounts/" + accountId + "/builds/tokens", apiToken, "POST", {
				build_token_name: siteName + "-deploy",
				build_token_secret: apiToken,
				cloudflare_token_id: tokenId,
			});
			buildTokenId = res.result?.build_token_uuid || "";
			console.log("         Build token created");
		} catch {
			// Try to find existing
			try {
				const res = await cf("/accounts/" + accountId + "/builds/tokens", apiToken);
				for (const t of res.result || []) {
					if (t.build_token_name === siteName + "-deploy") { buildTokenId = t.build_token_uuid; break; }
				}
				if (!buildTokenId && res.result?.length) buildTokenId = res.result[0].build_token_uuid;
			} catch {}
			console.log("         Build token: " + (buildTokenId ? "found" : "failed"));
		}

		// Create trigger
		var triggerId = "";
		if (repoConnId && buildTokenId) {
			try {
				const res = await cf("/accounts/" + accountId + "/builds/triggers", apiToken, "POST", {
					external_script_id: workerTag,
					repo_connection_uuid: repoConnId,
					build_token_uuid: buildTokenId,
					trigger_name: siteName + "-static",
					build_command: "npm install && npm run build",
					deploy_command: "npx wrangler deploy",
					root_directory: "static",
					branch_includes: ["main"],
					path_includes: ["*"],
				});
				triggerId = res.result?.trigger_uuid || "";
				console.log("         Build trigger created");
			} catch (err) {
				// May already exist — find it
				try {
					const res = await cf("/accounts/" + accountId + "/builds/workers/" + workerTag + "/triggers", apiToken);
					if (res.result?.length) triggerId = res.result[0].trigger_uuid;
				} catch {}
				console.log("         Build trigger: " + (triggerId ? "found existing" : "failed: " + err.message));
			}
		}

		// Set env vars on trigger
		if (triggerId) {
			try {
				await cf("/accounts/" + accountId + "/builds/triggers/" + triggerId + "/environment_variables", apiToken, "PATCH", {
					THEME: { is_secret: false, value: theme },
					SNAPSHOT_URL: { is_secret: false, value: config.r2PublicUrl + "/exports/site-export.json" },
					R2_PUBLIC_URL: { is_secret: false, value: config.r2PublicUrl },
					CLOUDFLARE_ACCOUNT_ID: { is_secret: true, value: accountId },
					CLOUDFLARE_API_TOKEN: { is_secret: true, value: apiToken },
				});
				console.log("         Env vars set");
			} catch {}

			// Build the trigger URL
			config.triggerUrl = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/builds/triggers/" + triggerId + "/builds";
		}

		// Write deploy hook URL to CMS D1
		if (config.triggerUrl && config.d1Id) {
			try {
				// Create options table if it doesn't exist yet (migrations may not have run)
				await cf("/accounts/" + accountId + "/d1/database/" + config.d1Id + "/query", apiToken, "POST", {
					sql: 'CREATE TABLE IF NOT EXISTS "options" ("name" text primary key, "value" text not null)',
				});
				var hookJson = JSON.stringify(config.triggerUrl);
				var themeJson = JSON.stringify(theme);
				var tokenJson = JSON.stringify(apiToken);
				await cf("/accounts/" + accountId + "/d1/database/" + config.d1Id + "/query", apiToken, "POST", {
					sql: "INSERT OR REPLACE INTO options (name, value) VALUES " +
						"('plugin:deploy-hook:settings:hookUrl', '" + hookJson + "'), " +
						"('plugin:deploy-hook:settings:theme', '" + themeJson + "'), " +
						"('plugin:deploy-hook:settings:cfToken', '" + tokenJson + "')",
				});
				console.log("         Deploy hook written to CMS database");
			} catch (err) {
				console.log("         Could not write to D1: " + err.message);
			}
		}
	} else {
		console.log("         Could not find static worker tag — configure Workers Builds manually");
	}

	// Save final config
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, "\t") + "\n");

	// ── Done ──
	const cmsUrl = "https://" + siteName + "-cms." + config.subdomain + ".workers.dev";
	const staticUrl = "https://" + siteName + "-static." + config.subdomain + ".workers.dev";

	console.log("\n  ════════════════════════════════════════════════");
	console.log("  Done! Both workers deployed.");
	console.log("  ════════════════════════════════════════════════");
	console.log("");
	console.log("  CMS admin:   " + cmsUrl + "/_emdash/admin");
	console.log("  R2 export:   " + cmsUrl + "/_emdash/export");
	console.log("  Deploy page: " + cmsUrl + "/_emdash/admin → Plugins → Deploy");
	console.log("  Static site: " + staticUrl);
	console.log("");
	console.log("  Workflow:");
	console.log("  1. Add content in CMS admin");
	console.log("  2. Go to /_emdash/export → click Export to R2");
	console.log("  3. Go to Plugins → Deploy → click Deploy");
	console.log("  4. Static site rebuilds with your content + theme");
	console.log("");
}

// ── Scaffold CMS ──

function scaffoldCms(siteName) {
	mkdirSync("cms/src/pages", { recursive: true });
	writeFileSync("cms/package.json", JSON.stringify({
		name: siteName + "-cms",
		private: true,
		type: "module",
		scripts: { dev: "astro dev", build: "astro build", deploy: "astro build && wrangler deploy" },
		dependencies: {
			"@astrojs/cloudflare": "latest",
			"@astrojs/react": "latest",
			"@emdash-cms/cloudflare": "latest",
			"@emdash-cms/plugin-forms": "latest",
			"@emdash-cms/plugin-webhook-notifier": "latest",
			astro: "latest",
			emdash: "latest",
			react: "^19.2.4",
			"react-dom": "^19.2.4",
		},
		devDependencies: { "@astrojs/check": "^0.9.7", wrangler: "^4.81.0" },
		emdash: { label: "Blog", seed: "seed/seed.json" },
	}, null, "\t") + "\n");
	writeFileSync("cms/tsconfig.json", JSON.stringify({ extends: "astro/tsconfigs/strict" }, null, "\t") + "\n");
}

// ── Write astro.config.mjs ──

function writeAstroConfig() {
	var config = readFileSync("cms/astro.config.mjs", "utf8");
	var original = config;
	var errors = [];

	// 1. Add imports after emdash import
	var anchor1 = 'import emdash from "emdash/astro";';
	if (config.indexOf(anchor1) !== -1) {
		config = config.replace(anchor1, anchor1 + "\n" +
			'import { deployHookPlugin } from "./src/plugins/deploy-hook/index.ts";\n' +
			'import { emdashResend } from "./src/plugins/resend/index.ts";\n' +
			'import { staticExport } from "emdash-static-export";');
	} else {
		errors.push("Could not find emdash import");
	}

	// 2. Add vite alias after adapter: cloudflare()
	var anchor2 = "adapter: cloudflare(),";
	if (config.indexOf(anchor2) !== -1) {
		config = config.replace(anchor2, anchor2 + "\n" +
			"\tvite: {\n" +
			"\t\tresolve: {\n" +
			'\t\t\tdedupe: ["emdash"],\n' +
			"\t\t\talias: {\n" +
			'\t\t\t\t"@local/deploy-hook-sandbox": new URL("./src/plugins/deploy-hook/sandbox-entry.ts", import.meta.url).pathname,\n' +
			'\t\t\t\t"@local/resend-sandbox": new URL("./src/plugins/resend/sandbox-entry.ts", import.meta.url).pathname,\n' +
			"\t\t\t},\n" +
			"\t\t},\n" +
			"\t},");
	} else {
		errors.push("Could not find adapter line");
	}

	// 3. Add deployHookPlugin to plugins array
	var anchor3 = "plugins: [formsPlugin()]";
	if (config.indexOf(anchor3) !== -1) {
		config = config.replace(anchor3, "plugins: [formsPlugin(), deployHookPlugin(), emdashResend()]");
	} else {
		errors.push("Could not find plugins array");
	}

	// 4. Add staticExport() after emdash closing inside integrations
	var anchor4 = "marketplace: \"https://marketplace.emdashcms.com\",\n\t\t}),";
	if (config.indexOf(anchor4) !== -1) {
		config = config.replace(anchor4, anchor4 + "\n\t\tstaticExport(),");
	} else {
		errors.push("Could not find emdash closing to add staticExport");
	}

	if (errors.length > 0) {
		console.log("  WARNING: Config injection issues: " + errors.join(", "));
		console.log("  Saving original as cms/astro.config.original.mjs");
		writeFileSync("cms/astro.config.original.mjs", original);
	}

	writeFileSync("cms/astro.config.mjs", config);
}

// ── Write wrangler configs ──

function writeCmsWrangler(c) {
	writeFileSync("cms/wrangler.jsonc", '{\n' +
		'\t"$schema": "node_modules/wrangler/config-schema.json",\n' +
		'\t"name": "' + c.siteName + '-cms",\n' +
		'\t"account_id": "' + c.accountId + '",\n' +
		'\t"compatibility_date": "2026-04-06",\n' +
		'\t"compatibility_flags": ["nodejs_compat"],\n' +
		'\t"assets": { "directory": "./dist" },\n' +
		'\t"d1_databases": [{\n' +
		'\t\t"binding": "DB",\n' +
		'\t\t"database_name": "' + c.siteName + '-db",\n' +
		'\t\t"database_id": "' + (c.d1Id || "local") + '"\n' +
		'\t}],\n' +
		'\t"r2_buckets": [{\n' +
		'\t\t"binding": "MEDIA",\n' +
		'\t\t"bucket_name": "' + c.siteName + '-media"\n' +
		'\t}],\n' +
		'\t"observability": { "enabled": true },\n' +
		'\t"worker_loaders": [{ "binding": "LOADER" }]\n' +
		'}\n');
}

function writeStaticWrangler(c) {
	writeFileSync("static/wrangler.jsonc", '{\n' +
		'\t"$schema": "node_modules/wrangler/config-schema.json",\n' +
		'\t"name": "' + c.siteName + '-static",\n' +
		'\t"account_id": "' + c.accountId + '",\n' +
		'\t"compatibility_date": "2026-04-06",\n' +
		'\t"assets": { "directory": "./dist", "not_found_handling": "404-page" },\n' +
		'\t"observability": { "enabled": true }\n' +
		'}\n');
}

function writeStaticEnv(c) {
	writeFileSync("static/.env", "THEME=" + c.theme + "\n" +
		(c.r2PublicUrl ? "SNAPSHOT_URL=" + c.r2PublicUrl + "/exports/site-export.json\n" : "# SNAPSHOT_URL=\n") +
		(c.r2PublicUrl ? "R2_PUBLIC_URL=" + c.r2PublicUrl + "\n" : "# R2_PUBLIC_URL=\n"));
}

// ── Cloudflare API ──

async function cf(path, token, method, body) {
	method = method || "GET";
	const opts = {
		method: method,
		headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
	};
	if (body) opts.body = JSON.stringify(body);
	const res = await fetch("https://api.cloudflare.com/client/v4" + path, opts);
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

function ask(q, def) {
	def = def || "";
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise(function (r) {
		rl.question("  " + q + (def ? "(" + def + ") " : ""), function (a) { rl.close(); r(a.trim() || def); });
	});
}

main().catch(function (err) { console.error("Error:", err.message); process.exit(1); });
