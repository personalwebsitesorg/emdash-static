/**
 * admin-inject — Astro integration.
 *
 * Injects a tiny client-side script into every page Astro builds. The script
 * runs in the browser, checks if we're on a /_emdash/admin/* page, and if so
 * appends a floating "Export to R2" button near the top-right — positioned
 * below emdash's native "View Site" button.
 *
 * This is a pluggable alternative to forking @emdash-cms/admin, because
 * emdash's plugin system has no way to add navigating sidebar items or top-
 * bar buttons. The script only touches document.body (never React's DOM
 * tree), so it's robust against emdash admin version changes.
 */

import type { AstroIntegration } from "astro";

const CLIENT_SCRIPT = `
(function () {
	if (!location.pathname.startsWith("/_emdash/admin")) return;
	if (document.getElementById("emdash-export-btn")) return;

	var btn = document.createElement("a");
	btn.id = "emdash-export-btn";
	btn.href = "/_emdash/export";
	btn.textContent = "Export to R2";
	btn.setAttribute("aria-label", "Export content to R2");
	btn.setAttribute(
		"style",
		[
			"position:fixed",
			"top:62px",
			"right:16px",
			"z-index:9999",
			"padding:6px 12px",
			"background:#fff",
			"color:#18181b",
			"border:1px solid #e4e4e7",
			"border-radius:6px",
			"font:500 13px/1.2 -apple-system,BlinkMacSystemFont,system-ui,sans-serif",
			"text-decoration:none",
			"box-shadow:0 1px 2px rgba(0,0,0,.04)",
			"cursor:pointer",
			"transition:background .12s ease",
		].join(";"),
	);

	// Dark-mode override: match emdash's dark palette when html.dark is set
	function applyDarkness() {
		var isDark =
			document.documentElement.classList.contains("dark") ||
			document.documentElement.getAttribute("data-theme") === "dark";
		if (isDark) {
			btn.style.background = "#18181b";
			btn.style.color = "#e4e4e7";
			btn.style.borderColor = "#27272a";
		} else {
			btn.style.background = "#fff";
			btn.style.color = "#18181b";
			btn.style.borderColor = "#e4e4e7";
		}
	}
	applyDarkness();

	var mo = new MutationObserver(applyDarkness);
	mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

	btn.onmouseenter = function () {
		btn.style.background = document.documentElement.classList.contains("dark") ? "#27272a" : "#f4f4f5";
	};
	btn.onmouseleave = applyDarkness;

	function mount() {
		if (document.body) document.body.appendChild(btn);
	}
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount);
	} else {
		mount();
	}
})();
`;

export function adminInject(): AstroIntegration {
	return {
		name: "emdash-static-admin-inject",
		hooks: {
			"astro:config:setup": ({ injectScript }) => {
				injectScript("page", CLIENT_SCRIPT);
			},
		},
	};
}
