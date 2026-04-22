#!/usr/bin/env node

/**
 * fetch-theme.mjs
 *
 * Downloads the selected theme's CSS from the emdash-themes repo at build time.
 * Only the theme named in the THEME env var is fetched, plus shared/base.css.
 *
 * Env:
 *   THEME — theme name (default: "professional")
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "personalwebsitesorg/emdash-themes";
const BRANCH = "main";
const FALLBACK_THEME = "professional";

const THEME = process.env.THEME || FALLBACK_THEME;
const STATIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = resolve(STATIC_DIR, "src/themes");

function raw(path) {
	return "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path;
}

async function download(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
	return await res.text();
}

async function writeFile(relPath, contents) {
	const out = resolve(THEMES_DIR, relPath);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, contents);
	console.log("  wrote " + relPath);
}

async function fetchTheme(name) {
	const css = await download(raw(name + "/styles/theme.css"));
	await writeFile(name + "/styles/theme.css", css);
}

async function main() {
	console.log("Fetching theme '" + THEME + "' from " + REPO + "...");

	const baseCss = await download(raw("shared/base.css"));
	await writeFile("shared/base.css", baseCss);

	try {
		await fetchTheme(THEME);
	} catch (err) {
		console.warn("  " + THEME + " not available (" + err.message + "), falling back to " + FALLBACK_THEME);
		if (THEME !== FALLBACK_THEME) await fetchTheme(FALLBACK_THEME);
	}

	console.log("Theme ready.");
}

main().catch((err) => {
	console.error("fetch-theme failed:", err.message);
	process.exit(1);
});
