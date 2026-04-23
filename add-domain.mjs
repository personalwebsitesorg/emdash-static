#!/usr/bin/env node

/**
 * add-domain.mjs
 *
 * Attach a custom domain to an existing site's CMS and/or static worker.
 * Additive: existing domains are preserved, so login still works on old URLs.
 *
 * When a CMS domain is added, also updates `emdash:site_url` in D1 so that
 * outbound invite / magic-link emails use the new domain.
 *
 * Requires no local `cms/` folder — reads everything from the Cloudflare API.
 *
 * Usage:
 *   node add-domain.mjs <siteName> [flags]
 *     (prompts for Cloudflare API Token; or set CLOUDFLARE_API_TOKEN)
 *
 * Flags:
 *   --cms=<hostname>        Attach hostname to <siteName>-cms
 *   --static=<hostname>     Attach hostname to <siteName>-static
 *   --no-email-url          Don't update emdash:site_url when adding CMS domain
 *
 * Examples:
 *   node add-domain.mjs jonathanwegener --cms=edit.jonathanwegener.com
 *   node add-domain.mjs jonathanwegener --static=jonathanwegener.com
 *   node add-domain.mjs jonathanwegener --cms=edit.foo.com --static=foo.com
 */

import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const siteName = args.find((a) => !a.startsWith("--"));
const flagMap = Object.fromEntries(
	args.filter((a) => a.startsWith("--")).map((a) => {
		const [k, v = "true"] = a.replace(/^--/, "").split("=");
		return [k, v];
	}),
);

if (!siteName) {
	console.error("  Usage: node add-domain.mjs <siteName> [--cms=host] [--static=host]");
	process.exit(1);
}

const cmsDomain = (flagMap.cms || "").trim().toLowerCase();
const staticDomain = (flagMap.static || "").trim().toLowerCase();
const skipEmailUrl = flagMap["no-email-url"] === "true";

if (!cmsDomain && !staticDomain) {
	console.error("  At least one of --cms=<host> or --static=<host> is required.");
	process.exit(1);
}

let apiToken = "";

async function main() {
	apiToken = process.env.CLOUDFLARE_API_TOKEN || await ask("Cloudflare API Token: ");
	if (!apiToken) {
		console.error("  Token is required.");
		process.exit(1);
	}
	const accountId = await fetchAccountId();
	if (!accountId) {
		console.error("  Could not resolve account ID. Check your token.");
		process.exit(1);
	}
	console.log("  Site: " + siteName + "  (account " + accountId + ")");

	if (staticDomain) await attach(accountId, staticDomain, siteName + "-static", "static");
	if (cmsDomain) {
		await attach(accountId, cmsDomain, siteName + "-cms", "cms");
		if (!skipEmailUrl) await setEmailUrl(accountId, siteName, cmsDomain);
	}

	console.log("\n  Done.");
	if (staticDomain) console.log("    Static: https://" + staticDomain);
	if (cmsDomain) console.log("    CMS:    https://" + cmsDomain + "/_emdash/admin");
}

async function attach(accountId, hostname, service, label) {
	console.log("\n  [" + label + "] " + hostname + " → " + service);

	const zoneId = await resolveZoneId(hostname);
	if (!zoneId) {
		console.log("         No matching zone found in this Cloudflare account.");
		console.log("         Add a zone (Websites → Add a site) whose apex is a suffix of " + hostname + ", then re-run.");
		return;
	}

	try {
		await cf("/accounts/" + accountId + "/workers/domains", "PUT", {
			zone_id: zoneId,
			hostname: hostname,
			service: service,
			environment: "production",
		});
		console.log("         Attached: https://" + hostname);
	} catch (err) {
		console.log("         Failed: " + err.message);
	}
}

async function resolveZoneId(hostname) {
	const res = await cf("/zones?per_page=500", "GET");
	const zones = res.result || [];
	const match = zones
		.filter((z) => hostname === z.name || hostname.endsWith("." + z.name))
		.sort((a, b) => b.name.length - a.name.length)[0];
	return match?.id || "";
}

async function setEmailUrl(accountId, siteName, cmsDomain) {
	const d1 = await findD1(accountId, siteName);
	if (!d1) {
		console.log("         D1 not found for " + siteName + " — skipping emdash:site_url update.");
		return;
	}
	const url = "https://" + cmsDomain;
	const sql =
		'CREATE TABLE IF NOT EXISTS "options" ("name" text primary key, "value" text not null); ' +
		"INSERT OR REPLACE INTO options (name, value) VALUES ('emdash:site_url', '" + JSON.stringify(url) + "')";
	try {
		await cf("/accounts/" + accountId + "/d1/database/" + d1 + "/query", "POST", { sql });
		console.log("         emdash:site_url → " + url);
	} catch (err) {
		console.log("         Could not update emdash:site_url: " + err.message);
	}
}

async function findD1(accountId, siteName) {
	for (const name of [siteName + "-db", siteName + "-cms"]) {
		try {
			const res = await cf("/accounts/" + accountId + "/d1/database?name=" + name, "GET");
			if (res.result?.[0]?.uuid) return res.result[0].uuid;
		} catch {}
	}
	return "";
}

async function fetchAccountId() {
	try {
		const res = await cf("/accounts?per_page=1", "GET");
		return res.result?.[0]?.id || "";
	} catch {
		return "";
	}
}

function ask(q) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((r) => rl.question("  " + q, (a) => { rl.close(); r(a.trim()); }));
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

main().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});
