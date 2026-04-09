/**
 * Deploy Hook Plugin — Admin UI
 *
 * Theme picker + Export & Deploy button.
 * Exports content to R2, then triggers the static builder deploy hook
 * with the chosen theme. The deploy hook URL is pre-configured by setup.mjs.
 */

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

const THEMES = [
	{ label: "Professional", value: "professional" },
	{ label: "Editorial", value: "editorial" },
	{ label: "Minimal", value: "minimal" },
	{ label: "Bold", value: "bold" },
];

// ── Helpers ──

function randomKey() {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < 32; i++) result += chars[Math.floor(Math.random() * chars.length)];
	return result;
}

async function getSettings(ctx: PluginContext) {
	return {
		hookUrl: (await ctx.kv.get<string>("settings:hookUrl")) ?? "",
		theme: (await ctx.kv.get<string>("settings:theme")) ?? "professional",
		lastExport: (await ctx.kv.get<string>("state:lastExport")) ?? "",
		lastBuild: (await ctx.kv.get<string>("state:lastBuild")) ?? "",
		lastStatus: (await ctx.kv.get<string>("state:lastStatus")) ?? "",
	};
}

async function doExport(ctx: PluginContext): Promise<{ success: boolean; size?: number; error?: string }> {
	if (!ctx.http) return { success: false, error: "Network not available" };
	try {
		const key = randomKey();
		await ctx.kv.set("exportKey", key);
		const res = await ctx.http.fetch(ctx.url("/api/static-export"), {
			method: "POST",
			headers: { "X-Export-Key": key },
		});
		const data = (await res.json()) as any;
		if (res.ok && data.success) {
			await ctx.kv.set("state:lastExport", new Date().toISOString());
			return { success: true, size: data.size };
		}
		return { success: false, error: data.error || `HTTP ${res.status}` };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

async function triggerBuild(ctx: PluginContext, hookUrl: string, theme: string): Promise<{ success: boolean; error?: string }> {
	if (!hookUrl) return { success: false, error: "No deploy hook URL. Run setup.mjs first." };
	if (!ctx.http) return { success: false, error: "Network not available" };

	// First update the THEME env var on the trigger
	const cfToken = (await ctx.kv.get<string>("settings:cfToken")) ?? "";
	const triggerUrl = hookUrl.replace(/\/builds$/, "");

	if (cfToken) {
		try {
			await ctx.http.fetch(`${triggerUrl}/environment_variables`, {
				method: "PATCH",
				headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
				body: JSON.stringify({ THEME: { is_secret: false, value: theme } }),
			});
		} catch {}
	}

	// Trigger the build
	try {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (cfToken) headers["Authorization"] = `Bearer ${cfToken}`;

		const res = await ctx.http.fetch(hookUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({ branch: "main" }),
		});
		await ctx.kv.set("state:lastBuild", new Date().toISOString());
		await ctx.kv.set("state:lastStatus", res.ok ? `deployed (${theme})` : `failed (${res.status})`);
		return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await ctx.kv.set("state:lastStatus", `error: ${msg}`);
		return { success: false, error: msg };
	}
}

// ── Admin Page ──

async function buildPage(ctx: PluginContext) {
	const { hookUrl, theme, lastExport, lastBuild, lastStatus } = await getSettings(ctx);
	const blocks: unknown[] = [{ type: "header", text: "Static Site" }];

	if (!hookUrl) {
		blocks.push({
			type: "banner",
			title: "Deploy hook not configured",
			description: "Run setup.mjs to auto-configure, or paste the deploy hook URL below.",
			variant: "default",
		}, {
			type: "form", block_id: "setup",
			fields: [
				{ type: "text_input", action_id: "hookUrl", label: "Deploy Hook URL", placeholder: "https://api.cloudflare.com/..." },
				{ type: "select", action_id: "theme", label: "Theme", options: THEMES, initial_value: theme },
			],
			submit: { label: "Save", action_id: "save_settings" },
		});
		return blocks;
	}

	// Status
	blocks.push({
		type: "fields",
		fields: [
			{ label: "Status", value: lastStatus || "Ready" },
			{ label: "Theme", value: theme },
			...(lastExport ? [{ label: "Last Export", value: new Date(lastExport).toLocaleString() }] : []),
			...(lastBuild ? [{ label: "Last Deploy", value: new Date(lastBuild).toLocaleString() }] : []),
		],
	});

	// Buttons
	blocks.push(
		{ type: "context", text: `Export to R2 → rebuild static site with "${theme}" theme.` },
		{
			type: "actions",
			elements: [
				{ type: "button", label: "Export & Deploy", action_id: "export_and_deploy", style: "primary" },
				{ type: "button", label: "Export to R2", action_id: "export_only", style: "default" },
				{ type: "button", label: "Deploy Only", action_id: "deploy_only", style: "default" },
			],
		},
	);

	// Settings
	blocks.push(
		{ type: "divider" },
		{ type: "header", text: "Settings" },
		{
			type: "form", block_id: "settings",
			fields: [
				{ type: "text_input", action_id: "hookUrl", label: "Deploy Hook URL", initial_value: hookUrl },
				{ type: "select", action_id: "theme", label: "Theme", options: THEMES, initial_value: theme },
			],
			submit: { label: "Update", action_id: "save_settings" },
		},
	);

	return blocks;
}

// ── Plugin ──

export default definePlugin({
	routes: {
		admin: {
			handler: async (routeCtx: { input: unknown }, ctx: PluginContext) => {
				const i = routeCtx.input as { type: string; action_id?: string; values?: Record<string, unknown> };

				if (i.type === "page_load") return { blocks: await buildPage(ctx) };

				if (i.type === "form_submit" && i.action_id === "save_settings") {
					const v = i.values ?? {};
					if (typeof v.hookUrl === "string" && v.hookUrl) await ctx.kv.set("settings:hookUrl", v.hookUrl);
					if (typeof v.theme === "string" && v.theme) await ctx.kv.set("settings:theme", v.theme);
					return { blocks: await buildPage(ctx), toast: { message: "Settings saved", type: "success" } };
				}

				if (i.type === "block_action" && i.action_id === "export_and_deploy") {
					const exp = await doExport(ctx);
					if (!exp.success) return { blocks: await buildPage(ctx), toast: { message: `Export failed: ${exp.error}`, type: "error" } };

					const { hookUrl, theme } = await getSettings(ctx);
					const build = await triggerBuild(ctx, hookUrl, theme);
					const sizeKB = exp.size ? ` (${(exp.size / 1024).toFixed(1)} KB)` : "";
					return {
						blocks: await buildPage(ctx),
						toast: {
							message: build.success ? `Exported${sizeKB} → deploying "${theme}"` : `Exported, but deploy failed: ${build.error}`,
							type: build.success ? "success" : "error",
						},
					};
				}

				if (i.type === "block_action" && i.action_id === "export_only") {
					const r = await doExport(ctx);
					await ctx.kv.set("state:lastStatus", r.success ? `exported (${(r.size! / 1024).toFixed(1)} KB)` : `export failed`);
					return {
						blocks: await buildPage(ctx),
						toast: { message: r.success ? `Exported (${(r.size! / 1024).toFixed(1)} KB)` : `Failed: ${r.error}`, type: r.success ? "success" : "error" },
					};
				}

				if (i.type === "block_action" && i.action_id === "deploy_only") {
					const { hookUrl, theme } = await getSettings(ctx);
					const r = await triggerBuild(ctx, hookUrl, theme);
					return {
						blocks: await buildPage(ctx),
						toast: { message: r.success ? `Deploying "${theme}"` : `Failed: ${r.error}`, type: r.success ? "success" : "error" },
					};
				}

				return { blocks: await buildPage(ctx) };
			},
		},
	},
});
