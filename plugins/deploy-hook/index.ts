import type { PluginDescriptor } from "emdash";

export function deployHookPlugin(): PluginDescriptor {
	return {
		id: "deploy-hook",
		version: "1.0.0",
		format: "standard",
		entrypoint: "@local/deploy-hook-sandbox",
		capabilities: ["network:fetch:any"],
		adminPages: [{ path: "/deploy", label: "Deploy", icon: "rocket" }],
	};
}
