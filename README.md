# OpenClaw SearXNG Plugin

Native OpenClaw plugin for web search through a local or self-hosted SearXNG instance.

It sends requests directly from OpenClaw to SearXNG over HTTP and returns normalized JSON results for the agent. No MCP server, no external search API provider, and no Brave API key are required.

## Features

- Adds the `searxng.search` tool to OpenClaw
- Works with local and remote SearXNG instances
- Returns compact structured JSON suitable for LLM use
- Supports `query`, `limit`, `categories`, `language`, `time_range`, and `safesearch`
- Encourages the agent to prefer SearXNG for web search instead of `web_search`

## Requirements

- OpenClaw `2026.3.x` or newer
- Node.js `18+`
- A running SearXNG instance, for example at `http://127.0.0.1:8080`

## Quick Start

Install the plugin from the repository directory:

```bash
openclaw plugins install ./openclaw-searxng-plugin
```

Enable the plugin and explicitly allow the tool in `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["searxng"],
    "entries": {
      "searxng": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8080"
        }
      }
    }
  },
  "tools": {
    "profile": "coding",
    "alsoAllow": ["searxng", "searxng.search"]
  }
}
```

Restart the OpenClaw gateway after installation or configuration changes.

## Run SearXNG with Docker

If you do not already have a SearXNG instance, you can run one locally with Docker Compose.

Create a directory for SearXNG, for example:

```bash
mkdir searxng-docker
cd searxng-docker
mkdir searxng valkey-data searxng-cache
```

Create `docker-compose.yml`:

```yaml
services:
  redis:
    image: docker.io/valkey/valkey:8-alpine
    container_name: searxng-redis
    command: valkey-server --save 30 1 --loglevel warning
    restart: unless-stopped
    volumes:
      - ./valkey-data:/data

  searxng:
    image: docker.io/searxng/searxng:latest
    container_name: searxng
    restart: unless-stopped
    depends_on:
      - redis
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./searxng:/etc/searxng:rw
      - ./searxng-cache:/var/cache/searxng:rw
    environment:
      - SEARXNG_BASE_URL=http://127.0.0.1:8080/
```

Create `searxng/settings.yml`:

```yaml
use_default_settings: true

search:
  formats:
    - html
    - json

server:
  secret_key: "replace-with-your-own-random-secret"
  limiter: false
  image_proxy: true

valkey:
  url: redis://redis:6379/0
```

Start the stack:

```bash
docker compose up -d
```

Verify that SearXNG responds on the default plugin URL:

```bash
curl "http://127.0.0.1:8080/search?q=test&format=json"
```

Notes:

- The plugin default URL is `http://127.0.0.1:8080`
- `json` must be enabled in `search.formats`, otherwise the plugin will not work
- Use your own random value for `server.secret_key`

## Configuration

### Environment Variable

| Variable | Description | Default |
| --- | --- | --- |
| `SEARXNG_BASE_URL` | Base URL of the SearXNG instance | `http://127.0.0.1:8080` |

### Plugin Config

Plugin configuration lives under `plugins.entries.searxng.config`:

```json
{
  "plugins": {
    "entries": {
      "searxng": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8080"
        }
      }
    }
  }
}
```

`baseUrl` overrides `SEARXNG_BASE_URL`.

## Tool Reference

### `searxng.search`

Search the web through SearXNG and return normalized JSON.

#### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | `string` | yes | Search query |
| `limit` | `number` | no | Maximum number of results, default `5`, max `20` |
| `categories` | `string[]` | no | SearXNG categories, for example `["general"]` |
| `language` | `string` | no | Language code such as `ru` or `en` |
| `time_range` | `string` | no | Time filter: `day`, `month`, `year` |
| `safesearch` | `number` | no | Safe search level: `0`, `1`, `2` |

#### Example Input

```json
{
  "query": "openclaw searxng",
  "limit": 5,
  "language": "ru"
}
```

#### Example Response

```json
{
  "query": "openclaw searxng",
  "engine": "searxng",
  "results": [
    {
      "title": "Result title",
      "url": "https://example.com/page",
      "content": "short snippet",
      "engine": "google",
      "score": 1.23
    }
  ],
  "number_of_results": 10
}
```

#### Error Response

```json
{
  "error": "SearXNG HTTP 503: Service Unavailable",
  "query": "openclaw searxng",
  "engine": "searxng",
  "results": [],
  "number_of_results": 0
}
```

## Verification

### 1. Check SearXNG Directly

```bash
curl "http://127.0.0.1:8080/search?q=test&format=json"
```

### 2. Check Plugin Discovery

```bash
openclaw plugins info searxng
```

Expected result: the plugin is loaded and exposes `searxng.search`.

### 3. Run the Smoke Test

```bash
node smoke-test.js
```

Example output:

```text
SearXNG smoke test
URL: http://127.0.0.1:8080/search?q=openclaw+searxng&format=json
OK: query=openclaw searxng, results=33
  [1] Openclaw with free local web search - SearXNG | ...
  [2] searxng-local skill by openclaw/skills - ...
```

### 4. Check OpenClaw Health

```bash
openclaw health
```

## How It Works

The plugin does not use `web_fetch`, `exec`, or any external search provider.

Instead, OpenClaw calls your SearXNG instance directly via Node.js `fetch`, which means:

- localhost deployments work
- self-hosted instances work
- no Brave Search API key is needed
- search stays within your OpenClaw plus SearXNG setup

## Limitations

- HTTP timeout: `10s`
- Maximum returned results: `20`
- The tool is registered as optional, so it must be explicitly allowed in OpenClaw tool policy

## Troubleshooting

### Agent Still Uses `web_search`

Make sure all of the following are true:

1. The plugin is enabled under `plugins.allow`
2. The tool is explicitly allowed via `tools.alsoAllow` or `tools.allow`
3. The gateway was restarted after config changes
4. You started a new session after changing tool availability

### SearXNG Runs on Another Host or Non-Default Port

Default SearXNG URL for this plugin is `http://127.0.0.1:8080`.

The examples below use `5000` only as a custom port example.

Use either config:

```json
{
  "plugins": {
    "entries": {
      "searxng": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:5000"
        }
      }
    }
  }
}
```

Or an environment variable:

```bash
set SEARXNG_BASE_URL=http://127.0.0.1:5000
```

### Search Fails

Check OpenClaw logs for messages like:

```text
searxng.search failed: <error message>
```

On Windows, logs are typically written to `%TEMP%\openclaw\`.
