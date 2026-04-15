import type { APIRoute } from "astro";
import { generateRssFeed } from "@site/snapshot";

export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, "") || "";
  return new Response(generateRssFeed(base), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
