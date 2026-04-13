import type { PluginDescriptor } from "emdash";

export function emdashResend(): PluginDescriptor {
	return {
		id: "emdash-resend",
		version: "0.1.0",
		capabilities: ["email:provide", "network:fetch"],
		allowedHosts: ["api.resend.com"],
		entrypoint: "@local/resend-sandbox",
		format: "standard",
		adminPages: [{ path: "/settings", label: "Resend", icon: "email" }],
	};
}
