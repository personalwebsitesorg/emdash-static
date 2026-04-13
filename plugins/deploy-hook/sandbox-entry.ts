import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

var FALLBACK_THEMES = [
	{ label: "Professional", value: "professional" },
	{ label: "Editorial", value: "editorial" },
	{ label: "Minimal", value: "minimal" },
	{ label: "Bold", value: "bold" },
];

var GITHUB_THEMES_URL = "https://api.github.com/repos/personalwebsitesorg/emdash-static/contents/static/src/themes";

async function fetchThemes(ctx: PluginContext) {
	if (!ctx.http) return FALLBACK_THEMES;
	try {
		var res = await ctx.http.fetch(GITHUB_THEMES_URL, {
			headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "emdash-static" },
		});
		if (!res.ok) return FALLBACK_THEMES;
		var items = (await res.json()) as any[];
		var themes: { label: string; value: string }[] = [];
		for (var i = 0; i < items.length; i++) {
			if (items[i].type === "dir" && items[i].name !== "shared") {
				var name = items[i].name;
				themes.push({ label: name.charAt(0).toUpperCase() + name.slice(1), value: name });
			}
		}
		return themes.length > 0 ? themes : FALLBACK_THEMES;
	} catch (_e) {
		return FALLBACK_THEMES;
	}
}

async function buildAdminPage(ctx: PluginContext) {
	var hookUrl = "";
	var theme = "professional";
	var lastStatus = "";
	var lastBuild = "";

	try {
		hookUrl = (await ctx.kv.get("settings:hookUrl")) || "";
		theme = (await ctx.kv.get("settings:theme")) || "professional";
		lastStatus = (await ctx.kv.get("state:lastStatus")) || "";
		lastBuild = (await ctx.kv.get("state:lastBuild")) || "";
	} catch (_e) {}

	var themes = await fetchThemes(ctx);

	var blocks: unknown[] = [{ type: "header", text: "Static Site" }];

	if (!hookUrl) {
		blocks.push({
			type: "banner",
			title: "Deploy hook not configured",
			description: "Run setup.mjs or paste the deploy hook URL and pick a theme below.",
			variant: "default",
		});
		blocks.push({
			type: "form",
			block_id: "setup",
			fields: [
				{ type: "text_input", action_id: "hookUrl", label: "Deploy Hook URL", placeholder: "https://api.cloudflare.com/..." },
				{ type: "select", action_id: "theme", label: "Theme", options: themes, initial_value: theme },
			],
			submit: { label: "Save", action_id: "save_settings" },
		});
		return blocks;
	}

	// Status
	var fields: { label: string; value: string }[] = [
		{ label: "Status", value: lastStatus || "Ready" },
		{ label: "Theme", value: theme },
	];
	if (lastBuild) fields.push({ label: "Last Deploy", value: lastBuild });
	blocks.push({ type: "fields", fields: fields });

	// Deploy button
	blocks.push({ type: "context", text: "Build and deploy the static site with the " + theme + " theme." });
	blocks.push({
		type: "actions",
		elements: [
			{ type: "button", label: "Deploy", action_id: "deploy", style: "primary" },
		],
	});

	// Settings
	blocks.push({ type: "divider" });
	blocks.push({ type: "header", text: "Settings" });
	blocks.push({
		type: "form",
		block_id: "settings",
		fields: [
			{ type: "text_input", action_id: "hookUrl", label: "Deploy Hook URL", initial_value: hookUrl },
			{ type: "select", action_id: "theme", label: "Theme", options: themes, initial_value: theme },
		],
		submit: { label: "Update", action_id: "save_settings" },
	});

	return blocks;
}

async function doDeploy(ctx: PluginContext) {
	var hookUrl = (await ctx.kv.get("settings:hookUrl")) || "";
	var theme = (await ctx.kv.get("settings:theme")) || "professional";
	var cfToken = (await ctx.kv.get("settings:cfToken")) || "";

	if (!hookUrl) return { success: false, error: "No deploy hook URL" };
	if (!ctx.http) return { success: false, error: "Network not available" };

	try {
		// Update THEME env var on the trigger
		if (cfToken) {
			var triggerUrl = hookUrl.replace(/\/builds$/, "");
			await ctx.http.fetch(triggerUrl + "/environment_variables", {
				method: "PATCH",
				headers: { "Authorization": "Bearer " + cfToken, "Content-Type": "application/json" },
				body: JSON.stringify({ THEME: { is_secret: false, value: theme } }),
			});
		}

		// Trigger build
		var headers: Record<string, string> = { "Content-Type": "application/json" };
		if (cfToken) headers["Authorization"] = "Bearer " + cfToken;

		var res = await ctx.http.fetch(hookUrl, {
			method: "POST",
			headers: headers,
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
		var msg = err instanceof Error ? err.message : String(err);
		await ctx.kv.set("state:lastStatus", "deploy error: " + msg);
		return { success: false, error: msg };
	}
}

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
				};

				if (interaction.type === "page_load") {
					return { blocks: await buildAdminPage(ctx) };
				}

				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					var values = interaction.values || {};
					if (typeof values.hookUrl === "string" && values.hookUrl) await ctx.kv.set("settings:hookUrl", values.hookUrl);
					if (typeof values.theme === "string" && values.theme) await ctx.kv.set("settings:theme", values.theme);
					return {
						blocks: await buildAdminPage(ctx),
						toast: { message: "Settings saved", type: "success" },
					};
				}

				if (interaction.type === "block_action" && interaction.action_id === "deploy") {
					var result = await doDeploy(ctx);
					return {
						blocks: await buildAdminPage(ctx),
						toast: {
							message: result.success
								? "Build triggered! Deploying " + result.theme + " theme. Takes ~1 min."
								: "Deploy failed: " + result.error,
							type: result.success ? "success" : "error",
						},
					};
				}

				return { blocks: await buildAdminPage(ctx) };
			},
		},
	},
});
