/**
 * OpenClaw SearXNG Plugin
 * Web search via local SearXNG HTTP API.
 * Env: SEARXNG_BASE_URL (default http://127.0.0.1:8080)
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const HTTP_TIMEOUT_MS = 10_000;
const SEARXNG_AGENT_GUIDANCE = [
  "For web search and fresh/current information, prefer the `searxng.search` tool.",
  "Do not fall back to the built-in `web_search` tool when `searxng.search` is available, because `web_search` may require a Brave API key.",
  "Use `searxng.search` for docs, news, factual lookup, and general internet research.",
].join(" ");

/**
 * Resolve SearXNG base URL from env and plugin config.
 */
function resolveBaseUrl(pluginConfig) {
  const envUrl = process.env.SEARXNG_BASE_URL?.trim();
  const configUrl = pluginConfig?.baseUrl?.trim();
  return configUrl || envUrl || DEFAULT_BASE_URL;
}

/**
 * Build search URL with query params.
 */
function buildSearchUrl(baseUrl, params) {
  const url = new URL("/search", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  if (params.limit != null && params.limit > 0) {
    url.searchParams.set("pageno", "1");
    // SearXNG returns ~10 per page; we slice after
  }
  if (params.categories?.length) {
    url.searchParams.set("categories", Array.isArray(params.categories)
      ? params.categories.join(",")
      : String(params.categories));
  }
  if (params.language) {
    url.searchParams.set("language", params.language);
  }
  if (params.time_range) {
    url.searchParams.set("time_range", params.time_range);
  }
  if (params.safesearch != null && params.safesearch !== "") {
    url.searchParams.set("safesearch", String(params.safesearch));
  }
  return url.toString();
}

/**
 * Normalize SearXNG result item to compact format for LLM.
 */
function normalizeResult(item) {
  return {
    title: item.title ?? null,
    url: item.url ?? null,
    content: item.content ?? null,
    engine: item.engine ?? null,
    score: item.score ?? null,
  };
}

/**
 * Normalize full SearXNG JSON response.
 */
function normalizeResponse(raw, query, limit) {
  const results = Array.isArray(raw.results) ? raw.results : [];
  const sliced = limit > 0 ? results.slice(0, limit) : results;
  return {
    query: query || raw.query || "",
    engine: "searxng",
    results: sliced.map(normalizeResult),
    number_of_results: raw.number_of_results ?? sliced.length,
  };
}

/**
 * Execute search and return normalized JSON.
 */
async function doSearch(baseUrl, params, signal) {
  const url = buildSearchUrl(baseUrl, params);
  const res = await fetch(url, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`SearXNG HTTP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error("SearXNG returned empty response");
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("SearXNG returned invalid JSON");
  }

  if (json == null || typeof json !== "object") {
    throw new Error("SearXNG returned non-object response");
  }

  const limit = Math.min(Math.max(0, Number(params.limit) || 5), 20);
  return normalizeResponse(json, params.query, limit);
}

export default function register(api) {
  api.on("before_prompt_build", async () => ({
    prependSystemContext: SEARXNG_AGENT_GUIDANCE,
  }));

  api.registerTool(
    {
      name: "searxng.search",
      label: "SearXNG Search",
      description:
        "Search the web via local SearXNG. Returns structured JSON with title, url, content, engine. Use for finding current info, docs, news.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Search query (required)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 5, max 20)",
            default: 5,
          },
          categories: {
            type: "array",
            items: { type: "string" },
            description: "SearXNG categories, e.g. ['general']",
          },
          language: {
            type: "string",
            description: "Language code, e.g. 'ru', 'en'",
          },
          time_range: {
            type: "string",
            description: "Time filter: day, month, year",
          },
          safesearch: {
            type: "number",
            description: "Safe search: 0=off, 1=moderate, 2=strict",
          },
        },
        required: ["query"],
      },
      execute: async (toolCallId, params) => {
        const baseUrl = resolveBaseUrl(api.pluginConfig);
        const query = params?.query?.trim();
        if (!query) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "query is required",
                  query: "",
                  engine: "searxng",
                  results: [],
                  number_of_results: 0,
                }),
              },
            ],
          };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        try {
          const out = await doSearch(baseUrl, {
            query,
            limit: params?.limit ?? 5,
            categories: params?.categories,
            language: params?.language,
            time_range: params?.time_range,
            safesearch: params?.safesearch,
          }, controller.signal);

          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 0) }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          api.logger?.warn?.("searxng.search failed:", msg);
          const errorPayload = {
            error: msg,
            query,
            engine: "searxng",
            results: [],
            number_of_results: 0,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(errorPayload) }],
          };
        } finally {
          clearTimeout(timeout);
        }
      },
    },
    { optional: true },
  );
}
