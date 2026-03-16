#!/usr/bin/env node
/**
 * Smoke test: проверка HTTP API SearXNG напрямую.
 * Запуск: node smoke-test.js
 * Требует: SearXNG на http://127.0.0.1:8080
 */
const baseUrl = process.env.SEARXNG_BASE_URL || "http://127.0.0.1:8080";
const url = `${baseUrl.replace(/\/$/, "")}/search?q=openclaw+searxng&format=json`;

async function main() {
  console.log("SearXNG smoke test");
  console.log("URL:", url);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    const results = json.results || [];
    console.log("OK: query=%s, results=%d", json.query, results.length);
    results.slice(0, 2).forEach((r, i) => {
      console.log("  [%d] %s", i + 1, r.title || r.url || "(no title)");
    });
  } catch (err) {
    console.error("FAIL:", err.message);
    process.exit(1);
  }
}

main();
