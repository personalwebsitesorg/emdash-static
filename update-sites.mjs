#!/usr/bin/env node

/**
 * update-sites.mjs
 *
 * Batch-upgrade the CMS worker for many sites to the latest emdash release.
 * For each site in the input file:
 *   1. Look up the site's existing D1 / R2 / KV / custom-domain from CF.
 *   2. Fresh-scaffold a CMS in a tempdir using `create-emdash` (latest).
 *   3. Copy local plugins (deploy-hook, resend) and root redirect page.
 *   4. Write wrangler.jsonc bound to the EXISTING resources.
 *   5. Install deps and deploy.
 *
 * User-specific data is preserved because:
 *   - D1 is reused (not recreated). All rows (users, posts, options,
 *     plugin:deploy-hook:settings:*, emdash:site_url, etc.) stay intact.
 *   - R2 bucket is reused — media is untouched.
 *   - Custom-domain bindings on the worker are preserved by Cloudflare.
 *   - Workers Build triggers are preserved.
 *   - Static worker is NOT redeployed — it auto-rebuilds on push to
 *     the emdash-static repo.
 *
 * Usage:
 *   node update-sites.mjs <sites.txt>
 *     (prompts for Cloudflare API Token; or set CLOUDFLARE_API_TOKEN)
 *
 * sites.txt format (one site name per line; blanks and `#` comments OK):
 *   jonathanwegener
 *   adambuice
 *   # paused — edwindorsey
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

let apiToken = "";

const sitesFile = process.argv[2];
if (!sitesFile) {
	console.error("  Usage: node update-sites.mjs <sites.txt>");
	process.exit(1);
}
if (!existsSync(sitesFile)) {
	console.error("  File not found: " + sitesFile);
	process.exit(1);
}

const siteNames = readFileSync(sitesFile, "utf8")
	.split("\n")
	.map((l) => l.replace(/#.*$/, "").trim())
	.filter((l) => l.length > 0);

if (siteNames.length === 0) {
	console.error("  No sites listed in " + sitesFile);
	process.exit(1);
}

async function main() {
	apiToken = process.env.CLOUDFLARE_API_TOKEN || await ask("Cloudflare API Token: ");
	if (!apiToken) {
		console.error("  Token is required.");
		process.exit(1);
	}

	const accountId = await fetchAccountId();
	if (!accountId) {
		console.error("  Could not resolve account ID.");
		process.exit(1);
	}
	console.log("\n  Account: " + accountId);
	console.log("  Sites:   " + siteNames.join(", ") + "\n");

	const results = [];
	for (const siteName of siteNames) {
		console.log("━".repeat(60));
		console.log("  " + siteName);
		console.log("━".repeat(60));
		try {
			await updateSite(accountId, siteName);
			results.push({ siteName, status: "ok" });
		} catch (err) {
			console.error("  FAILED: " + err.message);
			results.push({ siteName, status: "failed", error: err.message });
		}
		console.log("");
	}

	console.log("━".repeat(60));
	console.log("  Summary");
	console.log("━".repeat(60));
	for (const r of results) {
		console.log("  " + (r.status === "ok" ? "✓" : "✗") + "  " + r.siteName + (r.error ? "  — " + r.error : ""));
	}
}

async function updateSite(accountId, siteName) {
	// 1. Resolve infrastructure
	const d1 = await findD1(accountId, siteName);
	if (!d1) throw new Error("D1 database not found (looked for " + siteName + "-db)");
	console.log("    D1:   " + d1.name + " (" + d1.uuid + ")");

	const r2 = await findR2(accountId, siteName);
	if (!r2) throw new Error("R2 bucket not found (looked for " + siteName + "-media)");
	console.log("    R2:   " + r2);

	const kv = await findKV(accountId, siteName);
	console.log("    KV:   " + (kv ? kv.title + " (" + kv.id + ")" : "(none — will be created on deploy)"));

	// 2. Prepare a fresh working directory
	const workDir = resolve(tmpdir(), "emdash-update-" + siteName + "-" + Date.now());
	mkdirSync(workDir, { recursive: true });
	console.log("    Work: " + workDir);

	try {
		// 3. Scaffold CMS from latest emdash
		console.log("    Scaffolding CMS...");
		scaffoldCms(workDir, siteName);

		// 4. Pin emdash deps to latest (same logic as setup.mjs)
		pinLatestDeps(workDir);

		// 5. Copy plugins + root redirect from the local repo
		console.log("    Adding plugins + redirect page...");
		injectLocalPieces(workDir);

		// 6. Write wrangler.jsonc bound to EXISTING resources
		writeWrangler(workDir, {
			siteName,
			accountId,
			d1Id: d1.uuid,
			d1Name: d1.name,
			r2Bucket: r2,
		});

		// 7. Install + deploy
		console.log("    Installing deps...");
		execSync("pnpm install", {
			cwd: resolve(workDir, "cms"),
			stdio: "inherit",
			env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId },
		});
		console.log("    Deploying CMS...");
		execSync("pnpm run deploy", {
			cwd: resolve(workDir, "cms"),
			stdio: "inherit",
			env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId },
		});
	} finally {
		try { rmSync(workDir, { recursive: true, force: true }); } catch {}
	}
}

function scaffoldCms(workDir, siteName) {
	const cmsDir = resolve(workDir, "cms");
	const expectScript = [
		"set timeout 180",
		"spawn npx --yes create-emdash@latest cms",
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
		"expect eof",
	].join("\n");
	execSync("expect -c '" + expectScript.replace(/'/g, "'\\''") + "'", {
		cwd: workDir,
		stdio: "pipe",
		timeout: 240000,
	});
	if (!existsSync(resolve(cmsDir, "package.json"))) {
		throw new Error("create-emdash did not produce cms/package.json");
	}
	try { rmSync(resolve(cmsDir, "pnpm-workspace.yaml"), { force: true }); } catch {}
}

function pinLatestDeps(workDir) {
	const pkgPath = resolve(workDir, "cms/package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	const names = ["emdash", "@emdash-cms/cloudflare", "@emdash-cms/plugin-forms", "@emdash-cms/plugin-webhook-notifier"];
	let changed = false;
	for (const name of names) {
		if (!pkg.dependencies?.[name]) continue;
		try {
			const v = execSync("npm view " + name + " version", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
			if (v && pkg.dependencies[name] !== v) {
				pkg.dependencies[name] = v;
				changed = true;
				console.log("    " + name + " → " + v);
			}
		} catch {}
	}
	if (changed) writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
}

function injectLocalPieces(workDir) {
	const cmsDir = resolve(workDir, "cms");

	// Install emdash-static-export
	const pkg = JSON.parse(readFileSync(resolve(cmsDir, "package.json"), "utf8"));
	if (!pkg.dependencies?.["emdash-static-export"]) {
		execSync("pnpm add emdash-static-export@github:personalwebsitesorg/emdash-static-export", {
			cwd: cmsDir, stdio: "pipe",
		});
	}

	// Copy plugins from local repo
	for (const plugin of ["deploy-hook", "resend"]) {
		mkdirSync(resolve(cmsDir, "src/plugins", plugin), { recursive: true });
		cpSync(resolve(SCRIPT_DIR, "plugins", plugin, "index.ts"), resolve(cmsDir, "src/plugins", plugin, "index.ts"));
		cpSync(resolve(SCRIPT_DIR, "plugins", plugin, "sandbox-entry.ts"), resolve(cmsDir, "src/plugins", plugin, "sandbox-entry.ts"));
	}

	// Copy admin-inject Astro integration (no sandbox-entry)
	mkdirSync(resolve(cmsDir, "src/plugins/admin-inject"), { recursive: true });
	cpSync(resolve(SCRIPT_DIR, "plugins/admin-inject/index.ts"), resolve(cmsDir, "src/plugins/admin-inject/index.ts"));

	// Root redirect
	mkdirSync(resolve(cmsDir, "src/pages"), { recursive: true });
	writeFileSync(
		resolve(cmsDir, "src/pages/index.astro"),
		"---\nreturn Astro.redirect(\"/_emdash/admin\", 302);\n---\n",
	);

	// Rewrite astro.config.mjs — same logic as setup.mjs
	const astroPath = resolve(cmsDir, "astro.config.mjs");
	let config = readFileSync(astroPath, "utf8");

	const anchor1 = 'import emdash from "emdash/astro";';
	if (config.includes(anchor1)) {
		config = config.replace(
			anchor1,
			anchor1 + "\n" +
				'import { deployHookPlugin } from "./src/plugins/deploy-hook/index.ts";\n' +
				'import { emdashResend } from "./src/plugins/resend/index.ts";\n' +
				'import { adminInject } from "./src/plugins/admin-inject/index.ts";\n' +
				'import { staticExport } from "emdash-static-export";',
		);
	}

	const anchor2 = "adapter: cloudflare(),";
	if (config.includes(anchor2)) {
		config = config.replace(
			anchor2,
			anchor2 + "\n" +
				"\tvite: {\n" +
				"\t\tresolve: {\n" +
				'\t\t\tdedupe: ["emdash"],\n' +
				"\t\t\talias: {\n" +
				'\t\t\t\t"@local/deploy-hook-sandbox": new URL("./src/plugins/deploy-hook/sandbox-entry.ts", import.meta.url).pathname,\n' +
				'\t\t\t\t"@local/resend-sandbox": new URL("./src/plugins/resend/sandbox-entry.ts", import.meta.url).pathname,\n' +
				"\t\t\t},\n" +
				"\t\t},\n" +
				"\t},",
		);
	}

	const anchor3 = "plugins: [formsPlugin()]";
	if (config.includes(anchor3)) {
		config = config.replace(anchor3, "plugins: [formsPlugin(), deployHookPlugin(), emdashResend()]");
	}

	// Remove the marketplace config (hides Themes + Marketplace sidebar items)
	// and inject staticExport() after the emdash() integration closes.
	const anchor4 = "marketplace: \"https://marketplace.emdashcms.com\",\n\t\t}),";
	if (config.includes(anchor4)) {
		config = config.replace(anchor4, "}),\n\t\tstaticExport(),\n\t\tadminInject(),");
	}

	writeFileSync(astroPath, config);
}

function writeWrangler(workDir, c) {
	writeFileSync(
		resolve(workDir, "cms/wrangler.jsonc"),
		'{\n' +
		'\t"$schema": "node_modules/wrangler/config-schema.json",\n' +
		'\t"name": "' + c.siteName + '-cms",\n' +
		'\t"account_id": "' + c.accountId + '",\n' +
		'\t"compatibility_date": "2026-04-06",\n' +
		'\t"compatibility_flags": ["nodejs_compat"],\n' +
		'\t"assets": { "directory": "./dist" },\n' +
		'\t"d1_databases": [{\n' +
		'\t\t"binding": "DB",\n' +
		'\t\t"database_name": "' + c.d1Name + '",\n' +
		'\t\t"database_id": "' + c.d1Id + '"\n' +
		'\t}],\n' +
		'\t"r2_buckets": [{\n' +
		'\t\t"binding": "MEDIA",\n' +
		'\t\t"bucket_name": "' + c.r2Bucket + '"\n' +
		'\t}],\n' +
		'\t"observability": { "enabled": true },\n' +
		'\t"worker_loaders": [{ "binding": "LOADER" }]\n' +
		'}\n',
	);
}

async function findD1(accountId, siteName) {
	for (const name of [siteName + "-db", siteName + "-cms"]) {
		try {
			const res = await cf("/accounts/" + accountId + "/d1/database?name=" + name);
			const hit = res.result?.[0];
			if (hit?.uuid) return { name: hit.name, uuid: hit.uuid };
		} catch {}
	}
	return null;
}

async function findR2(accountId, siteName) {
	const want = siteName + "-media";
	try {
		const res = await cf("/accounts/" + accountId + "/r2/buckets");
		const hit = res.result?.buckets?.find((b) => b.name === want);
		return hit?.name || null;
	} catch {
		return null;
	}
}

async function findKV(accountId, siteName) {
	const want = siteName + "-cms-session";
	try {
		const res = await cf("/accounts/" + accountId + "/storage/kv/namespaces?per_page=100");
		const hit = res.result?.find((n) => n.title === want);
		return hit || null;
	} catch {
		return null;
	}
}

async function fetchAccountId() {
	try {
		const res = await cf("/accounts?per_page=1");
		return res.result?.[0]?.id || "";
	} catch {
		return "";
	}
}

async function cf(path, method = "GET", body) {
	const opts = {
		method,
		headers: { Authorization: "Bearer " + apiToken, "Content-Type": "application/json" },
	};
	if (body) opts.body = JSON.stringify(body);
	const res = await fetch("https://api.cloudflare.com/client/v4" + path, opts);
	const json = await res.json();
	if (!json.success && json.errors?.length) throw new Error(json.errors[0].message);
	return json;
}

function ask(q) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((r) => rl.question("  " + q, (a) => { rl.close(); r(a.trim()); }));
}

main().catch((err) => {
	console.error("\nError:", err.message);
	process.exit(1);
});
