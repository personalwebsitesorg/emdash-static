import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

async function buildSettingsPage(ctx: PluginContext) {
	var hasKey = false;
	var fromAddress = "";

	try {
		hasKey = !!(await ctx.kv.get("settings:apiKey"));
		fromAddress = (await ctx.kv.get("settings:fromAddress")) || "";
	} catch (_e) {}

	var blocks: unknown[] = [{ type: "header", text: "Resend Email" }];

	if (hasKey) {
		blocks.push({
			type: "banner",
			title: "Email configured",
			description: "Resend is active. Magic links and invites will be sent via Resend.",
			variant: "default",
		});
	} else {
		blocks.push({
			type: "banner",
			title: "Setup required",
			description: "Enter your Resend API key to enable email (magic links, invites). Get a key at resend.com/api-keys",
			variant: "default",
		});
	}

	blocks.push({
		type: "form",
		block_id: "settings",
		fields: [
			{
				type: "text_input",
				action_id: "apiKey",
				label: "Resend API Key",
				placeholder: "re_...",
				initial_value: hasKey ? "********" : "",
			},
			{
				type: "text_input",
				action_id: "fromAddress",
				label: "From Address",
				placeholder: "EmDash <hello@yourdomain.com>",
				initial_value: fromAddress,
			},
		],
		submit: { label: "Save", action_id: "save_settings" },
	});

	return blocks;
}

export default definePlugin({
	hooks: {
		"email:deliver": {
			handler: async (event: any, ctx: PluginContext) => {
				if (!ctx.http) {
					throw new Error("Network not available");
				}

				var apiKey = (await ctx.kv.get("settings:apiKey")) || "";
				var fromAddress = (await ctx.kv.get("settings:fromAddress")) || "";

				if (!apiKey || !fromAddress) {
					throw new Error("Resend not configured. Go to Plugins → Resend to set API key and From address.");
				}

				var message = event.message;

				var res = await ctx.http.fetch("https://api.resend.com/emails", {
					method: "POST",
					headers: {
						"Authorization": "Bearer " + apiKey,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						from: fromAddress,
						to: message.to,
						subject: message.subject,
						text: message.text,
						html: message.html,
					}),
				});

				if (!res.ok) {
					var errText = await res.text();
					throw new Error("Resend API error " + res.status + ": " + errText);
				}

				ctx.log.info("Email sent via Resend to " + message.to);
			},
		},
	},

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
					return { blocks: await buildSettingsPage(ctx) };
				}

				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					var values = interaction.values || {};
					if (typeof values.apiKey === "string" && values.apiKey && values.apiKey !== "********") {
						await ctx.kv.set("settings:apiKey", values.apiKey);
					}
					if (typeof values.fromAddress === "string" && values.fromAddress) {
						if (values.fromAddress.indexOf("@") === -1) {
							return {
								blocks: await buildSettingsPage(ctx),
								toast: { message: "Invalid From Address (must contain @)", type: "error" },
							};
						}
						await ctx.kv.set("settings:fromAddress", values.fromAddress);
					}
					return {
						blocks: await buildSettingsPage(ctx),
						toast: { message: "Resend settings saved", type: "success" },
					};
				}

				return { blocks: await buildSettingsPage(ctx) };
			},
		},
	},
});
