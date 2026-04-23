import type { PluginDescriptor } from "emdash";

export function deployHookPlugin(): PluginDescriptor {
	return {
		id: "deploy-hook",
		version: "2.0.0",
		format: "standard",
		entrypoint: "@local/deploy-hook-sandbox",
		capabilities: ["network:fetch:any"],
		adminPages: [{ path: "/themes", label: "Themes & Deploy", icon: "palette" }],
	};
}
