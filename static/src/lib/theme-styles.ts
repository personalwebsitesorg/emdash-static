const themeFiles = import.meta.glob("../themes/*/styles/theme.css", {
	query: "?url",
	import: "default",
}) as Record<string, () => Promise<string>>;

const DEFAULT_THEME = "professional";

export function resolveTheme(theme: string | null | undefined): string {
	return theme && themeFiles[`../themes/${theme}/styles/theme.css`] ? theme : DEFAULT_THEME;
}

export async function getThemeStylesheetHref(theme: string | null | undefined): Promise<string> {
	const resolved = resolveTheme(theme);
	const loader = themeFiles[`../themes/${resolved}/styles/theme.css`];
	if (loader) return await loader();
	return "";
}
