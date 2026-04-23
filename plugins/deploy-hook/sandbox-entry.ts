import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

// ── Types ─────────────────────────────────────────────────────────
interface ThemeEntry {
	id: string;
	name?: string;
	description?: string;
	featured?: boolean;
}
interface ThemesManifest {
	version?: number;
	updatedAt?: string;
	themes?: ThemeEntry[];
}

const THEMES_REPO = "personalwebsitesorg/emdash-themes";
const THEMES_BRANCH = "main";
const MANIFEST_URL =
	"https://api.github.com/repos/" + THEMES_REPO + "/contents/themes.json?ref=" + THEMES_BRANCH;
const CARDS_PER_ROW = 3;

// ── Theme fetching (no cache; fresh every time) ──────────────────
async function fetchThemes(ctx: PluginContext): Promise<ThemeEntry[]> {
	if (!ctx.http) return [];

	try {
		var ghToken = (await ctx.kv.get("settings:githubToken")) || "";
		var headers: Record<string, string> = {
			"Accept": "application/vnd.github.v3.raw",
			"User-Agent": "emdash-static",
		};
		if (ghToken) headers["Authorization"] = "Bearer " + ghToken;

		var res = await ctx.http.fetch(MANIFEST_URL, { headers: headers });
		if (!res.ok) return [];

		var manifest = (await res.json()) as ThemesManifest;
		var rawThemes = Array.isArray(manifest?.themes) ? manifest.themes : [];

		var themes: ThemeEntry[] = [];
		for (var i = 0; i < rawThemes.length; i++) {
			var t = rawThemes[i];
			if (!t || typeof t.id !== "string" || !t.id) continue;
			themes.push({
				id: t.id,
				name: (typeof t.name === "string" && t.name) ? t.name : titleCase(t.id),
				description: typeof t.description === "string" ? t.description : "",
				featured: t.featured === true,
			});
		}
		return themes;
	} catch (_e) {
		return [];
	}
}

function titleCase(s: string): string {
	return s.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function byName(a: ThemeEntry, b: ThemeEntry): number {
	return (a.name || "").localeCompare(b.name || "");
}

function filterThemes(themes: ThemeEntry[], query: string): ThemeEntry[] {
	var q = query.trim().toLowerCase();
	if (!q) return themes;
	return themes.filter(function (t) {
		return (t.name || "").toLowerCase().indexOf(q) >= 0
			|| (t.description || "").toLowerCase().indexOf(q) >= 0
			|| (t.id || "").toLowerCase().indexOf(q) >= 0;
	});
}

function chunk<T>(items: T[], size: number): T[][] {
	var out: T[][] = [];
	for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

function themeCardColumn(theme: ThemeEntry, activeId: string): unknown[] {
	var isActive = theme.id === activeId;
	var titlePrefix = isActive ? "✓ " : (theme.featured ? "★ " : "");
	var suffix = isActive ? "  ·  Active" : "";
	return [
		{
			type: "banner",
			title: titlePrefix + (theme.name || theme.id) + suffix,
			description: theme.description || " ",
			variant: isActive ? "alert" : "default",
		},
		{
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "apply_theme",
					label: isActive ? "Active" : "Apply",
					style: isActive ? "secondary" : "primary",
					value: theme.id,
				},
			],
		},
	];
}

function renderGrid(
	blocks: unknown[],
	items: ThemeEntry[],
	activeId: string,
	perRow: number,
): void {
	var rows = chunk(items, perRow);
	for (var r = 0; r < rows.length; r++) {
		var row = rows[r];
		// Pad short final rows so columns align instead of stretching
		var columns: unknown[][] = row.map(function (t) { return themeCardColumn(t, activeId); });
		while (columns.length < perRow) columns.push([]);
		blocks.push({ type: "columns", columns: columns });
	}
}

// ── Admin page ────────────────────────────────────────────────────
async function buildAdminPage(ctx: PluginContext, query: string): Promise<unknown[]> {
	var hookUrl = "";
	var activeTheme = "";
	var lastStatus = "";
	var lastBuild = "";

	try {
		hookUrl = (await ctx.kv.get("settings:hookUrl")) || "";
		activeTheme = (await ctx.kv.get("settings:theme")) || "";
		lastStatus = (await ctx.kv.get("state:lastStatus")) || "";
		lastBuild = (await ctx.kv.get("state:lastBuild")) || "";
	} catch (_e) {}

	var all = await fetchThemes(ctx);
	all.sort(byName);
	var featured = all.filter(function (t) { return t.featured; });
	var rest = all.filter(function (t) { return !t.featured; });
	var visibleFeatured = filterThemes(featured, query);
	var visibleRest = filterThemes(rest, query);
	var visibleCount = visibleFeatured.length + visibleRest.length;

	var knownIds: Record<string, boolean> = {};
	for (var i = 0; i < all.length; i++) knownIds[all[i].id] = true;
	var isOrphan = activeTheme && !knownIds[activeTheme];

	var blocks: unknown[] = [
		{ type: "header", text: "Themes & Deploy" },
	];

	// ── Top action bar: Status fields + big Deploy button ──
	var statusFields: Array<{ label: string; value: string }> = [
		{ label: "Active theme", value: activeTheme || "(none picked)" },
		{ label: "Status", value: lastStatus || "Ready" },
	];
	if (lastBuild) statusFields.push({ label: "Last deploy", value: lastBuild });
	blocks.push({ type: "fields", fields: statusFields });

	blocks.push({
		type: "actions",
		elements: [
			{ type: "button", action_id: "deploy", label: "Deploy now", style: "primary" },
		],
	});
	blocks.push({
		type: "context",
		text: activeTheme && !isOrphan
			? "Publishes the static site using the '" + activeTheme + "' theme. Takes ~1 minute."
			: "Pick a theme below to enable Deploy.",
	});

	// ── Warning banners ──
	if (!hookUrl) {
		blocks.push({
			type: "banner",
			title: "Deploy hook not configured",
			description: "Paste the deploy hook URL in Settings below, or re-run setup.mjs.",
			variant: "default",
		});
	}
	if (isOrphan) {
		blocks.push({
			type: "banner",
			title: "Active theme not found",
			description: "Theme '" + activeTheme + "' isn't in themes.json. Pick another before deploying.",
			variant: "alert",
		});
	}

	// ── Themes gallery ──
	blocks.push({ type: "divider" });
	blocks.push({ type: "header", text: "Pick a theme" });
	blocks.push({ type: "context", text: "Click Apply on a card to set the theme. It takes effect on the next Deploy." });

	// Search form
	blocks.push({
		type: "form",
		block_id: "search",
		fields: [
			{
				type: "text_input",
				action_id: "query",
				label: "Search",
				placeholder: "Filter by name or description, then press Enter",
				initial_value: query,
			},
		],
		submit: { label: "Filter", action_id: "filter_themes" },
	});

	if (visibleCount === 0) {
		blocks.push({
			type: "context",
			text: query
				? "No themes match '" + query + "'."
				: "No themes available. Check your GITHUB_TOKEN in D1 options.",
		});
	} else {
		if (visibleFeatured.length > 0) {
			blocks.push({ type: "context", text: "★ Featured" });
			renderGrid(blocks, visibleFeatured, activeTheme, CARDS_PER_ROW);
		}
		if (visibleRest.length > 0) {
			if (visibleFeatured.length > 0) blocks.push({ type: "context", text: "All themes" });
			renderGrid(blocks, visibleRest, activeTheme, CARDS_PER_ROW);
		}
	}

	// ── Settings section ──
	blocks.push({ type: "divider" });
	blocks.push({ type: "header", text: "Settings" });
	blocks.push({
		type: "form",
		block_id: "settings",
		fields: [
			{ type: "text_input", action_id: "hookUrl", label: "Deploy Hook URL", initial_value: hookUrl },
		],
		submit: { label: "Save", action_id: "save_settings" },
	});

	return blocks;
}

// ── Deploy action ─────────────────────────────────────────────────
async function doDeploy(ctx: PluginContext): Promise<{ success: boolean; theme?: string; error?: string }> {
	var hookUrl = (await ctx.kv.get("settings:hookUrl")) || "";
	var theme = (await ctx.kv.get("settings:theme")) || "";
	var cfToken = (await ctx.kv.get("settings:cfToken")) || "";

	if (!hookUrl) return { success: false, error: "No deploy hook URL configured" };
	if (!theme) return { success: false, error: "Pick a theme first" };
	if (!ctx.http) return { success: false, error: "Network not available" };

	// Orphan guard
	var themes = await fetchThemes(ctx);
	if (themes.length > 0) {
		var found = false;
		for (var i = 0; i < themes.length; i++) {
			if (themes[i].id === theme) { found = true; break; }
		}
		if (!found) {
			return { success: false, error: "Theme '" + theme + "' isn't in themes.json anymore — pick another." };
		}
	}

	try {
		// THEME env var on the build trigger — abort if PATCH fails
		if (cfToken) {
			var triggerUrl = hookUrl.replace(/\/builds$/, "");
			var patchRes = await ctx.http.fetch(triggerUrl + "/environment_variables", {
				method: "PATCH",
				headers: { "Authorization": "Bearer " + cfToken, "Content-Type": "application/json" },
				body: JSON.stringify({ THEME: { is_secret: false, value: theme } }),
			});
			if (!patchRes.ok) {
				var msg = "Could not update THEME env var (HTTP " + patchRes.status + ")";
				await ctx.kv.set("state:lastStatus", "aborted: " + msg);
				return { success: false, error: msg };
			}
		}

		// Trigger the build
		var reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
		if (cfToken) reqHeaders["Authorization"] = "Bearer " + cfToken;

		var res = await ctx.http.fetch(hookUrl, {
			method: "POST",
			headers: reqHeaders,
			body: JSON.stringify({ branch: "main" }),
		});

		await ctx.kv.set("state:lastBuild", new Date().toISOString());

		if (res.ok) {
			await ctx.kv.set("state:lastStatus", "deploying (" + theme + ")...");
			return { success: true, theme: theme };
		}
		await ctx.kv.set("state:lastStatus", "deploy failed (HTTP " + res.status + ")");
		return { success: false, error: "HTTP " + res.status };
	} catch (err) {
		var errMsg = err instanceof Error ? err.message : String(err);
		await ctx.kv.set("state:lastStatus", "deploy error: " + errMsg);
		return { success: false, error: errMsg };
	}
}

// ── Plugin export ─────────────────────────────────────────────────
export default definePlugin({
	routes: {
		admin: {
			handler: async (
				routeCtx: { input: unknown; request: { url: string } },
				ctx: PluginContext,
			) => {
				var interaction = routeCtx.input as {
					type: string;
					action_id?: string;
					values?: Record<string, unknown>;
					value?: unknown;
				};

				if (interaction.type === "page_load") {
					return { blocks: await buildAdminPage(ctx, "") };
				}

				if (interaction.type === "form_submit" && interaction.action_id === "filter_themes") {
					var q = typeof interaction.values?.query === "string" ? interaction.values.query : "";
					return { blocks: await buildAdminPage(ctx, q) };
				}

				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					var values = interaction.values || {};
					if (typeof values.hookUrl === "string" && values.hookUrl) {
						await ctx.kv.set("settings:hookUrl", values.hookUrl);
					}
					return {
						blocks: await buildAdminPage(ctx, ""),
						toast: { message: "Settings saved", type: "success" },
					};
				}

				if (interaction.type === "block_action" && interaction.action_id === "apply_theme") {
					var id = typeof interaction.value === "string" ? interaction.value : "";
					if (id) {
						await ctx.kv.set("settings:theme", id);
						return {
							blocks: await buildAdminPage(ctx, ""),
							toast: { message: "Applied '" + id + "'. Click Deploy to publish.", type: "success" },
						};
					}
				}

				if (interaction.type === "block_action" && interaction.action_id === "deploy") {
					var result = await doDeploy(ctx);
					return {
						blocks: await buildAdminPage(ctx, ""),
						toast: {
							message: result.success
								? "Build triggered with '" + result.theme + "' theme. Takes ~1 min."
								: "Deploy failed: " + result.error,
							type: result.success ? "success" : "error",
						},
					};
				}

				return { blocks: await buildAdminPage(ctx, "") };
			},
		},
	},
});
