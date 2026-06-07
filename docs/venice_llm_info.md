# Introduction

> **Status: HISTORICAL (2026-06-05 alignment snapshot).**  
> Not imported or referenced by current application code.  
> The canonical machine-readable reference for image generation, seed ranges, aspect/quality/variant constraints, etc. is `docs/Venice_swagger_api.yaml` (consumed by `src/config/image-model-capabilities.ts` and `src/utils/payloadBuilders.ts`).  
> This file is superseded and retained only for historical provenance. See `CHANGELOG.md` (entry adding the two reference files) and `docs/summary_of_work.md` (HYG-003). Last meaningful use: early model-capability and payload work.

Source: https://docs.venice.ai/api-reference/api-spec

Reference documentation for the Venice API

The Venice API offers HTTP-based REST and streaming interfaces for building AI applications with uncensored models and private inference. You can create with text generation, image creation, embeddings, and more, all without restrictive content policies. Integration examples and SDKs are available in the [documentation](/overview/getting-started). Our API reference is also available as a [OpenAPI YAML spec.](https://api.venice.ai/doc/api/swagger.yaml)

## Authentication

The Venice API uses API keys for authentication. Create and manage your API keys in your [API settings](https://venice.ai/settings/api).

All API requests require HTTP Bearer authentication:

```
Authorization: Bearer VENICE_API_KEY
```

<Note>
  Your API key is a secret. Do not share it or expose it in any client-side code.
</Note>

## OpenAI Compatibility

Venice's API implements the OpenAI API specification, ensuring compatibility with existing OpenAI clients and tools. This allows you to integrate with Venice using the familiar OpenAI interface while accessing Venice's unique features and uncensored models.

### Setup

Configure your client to use Venice's base URL (`https://api.venice.ai/api/v1`) and make your first request:

<CodeGroup>
  ```bash curl theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "venice-uncensored",
      "messages": [{"role": "user", "content": "Hello!"}]
    }'
  ```

  ```javascript JavaScript theme={"system"}
  import OpenAI from "openai";

  const client = new OpenAI({
    apiKey: process.env.VENICE_API_KEY,
    baseURL: "https://api.venice.ai/api/v1",
  });

  const response = await client.chat.completions.create({
    model: "venice-uncensored",
    messages: [{ role: "user", content: "Hello!" }]
  });

  console.log(response.choices[0].message.content);
  ```

  ```python Python theme={"system"}
  import os
  from openai import OpenAI

  client = OpenAI(
      api_key=os.environ.get("VENICE_API_KEY"),
      base_url="https://api.venice.ai/api/v1"
  )

  response = client.chat.completions.create(
      model="venice-uncensored",
      messages=[{"role": "user", "content": "Hello!"}]
  )

  print(response.choices[0].message.content)
  ```
</CodeGroup>

## Venice-Specific Features

### System Prompts

Venice provides default system prompts designed to ensure uncensored and natural model responses. You have two options for handling system prompts:

1. **Default Behavior**: Your system prompts are appended to Venice's defaults
2. **Custom Behavior**: Disable Venice's system prompts entirely

#### Disabling Venice System Prompts

Use the `venice_parameters` option to remove Venice's default system prompts:

<CodeGroup>
  ```bash curl theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "venice-uncensored",
      "messages": [
        {"role": "system", "content": "Your custom system prompt"},
        {"role": "user", "content": "Why is the sky blue?"}
      ],
      "venice_parameters": {
        "include_venice_system_prompt": false
      }
    }'
  ```

  ```javascript JavaScript theme={"system"}
  const completion = await client.chat.completions.create({
    model: "venice-uncensored",
    messages: [
      {
        role: "system",
        content: "Your custom system prompt",
      },
      {
        role: "user",
        content: "Why is the sky blue?",
      },
    ],
    venice_parameters: {
      include_venice_system_prompt: false,
    },
  });
  ```

  ```python Python theme={"system"}
  response = client.chat.completions.create(
      model="venice-uncensored",
      messages=[
          {"role": "system", "content": "Your custom system prompt"},
          {"role": "user", "content": "Why is the sky blue?"}
      ],
      extra_body={
          "venice_parameters": {
              "include_venice_system_prompt": False
          }
      }
  )
  ```
</CodeGroup>

### Venice Parameters

The `venice_parameters` object allows you to access Venice-specific features not available in the standard OpenAI API:

| Parameter                            | Type    | Description                                                                                                                                                                                                                                                                                                                                  | Default |
| ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `character_slug`                     | string  | The character slug of a public Venice character (discoverable as "Public ID" on the published character page)                                                                                                                                                                                                                                | -       |
| `strip_thinking_response`            | boolean | Strip `<think></think>` blocks from the response (models using legacy `<think>` tag format). See [Reasoning Models](/overview/guides/reasoning-models).                                                                                                                                                                                      | `false` |
| `disable_thinking`                   | boolean | On supported reasoning models, disable thinking and strip the `<think></think>` blocks from the response                                                                                                                                                                                                                                     | `false` |
| `enable_web_search`                  | string  | Enable web search for this request (`off`, `on`, `auto` - auto enables based on model's discretion)<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping).                                                                                                                                   | `off`   |
| `enable_web_scraping`                | boolean | Enable web scraping of up to 5 URLs detected in the user message. Scraped content augments responses and bypasses web search. Only successfully scraped URLs are billed.<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping).                                                              | `false` |
| `enable_x_search`                    | boolean | Enable xAI's native search (web + X/Twitter) for supported Grok models (e.g., `grok-4-20-beta`). Provides higher quality search results by using xAI's search infrastructure. When enabled, Venice's standard web search is bypassed.<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping). | `false` |
| `enable_web_citations`               | boolean | When web search is enabled, request that the LLM cite its sources using `[REF]0[/REF]` format                                                                                                                                                                                                                                                | `false` |
| `include_search_results_in_stream`   | boolean | Experimental: Include search results in the stream as the first emitted chunk                                                                                                                                                                                                                                                                | `false` |
| `return_search_results_as_documents` | boolean | Surface search results in an OpenAI-compatible tool call named `venice_web_search_documents` for LangChain integration                                                                                                                                                                                                                       | `false` |
| `include_venice_system_prompt`       | boolean | Whether to include Venice's default system prompts alongside specified system prompts                                                                                                                                                                                                                                                        | `true`  |

<Note>
  These parameters can also be specified as model suffixes appended to the model name (e.g., `llama-3.3-70b:enable_web_search=auto`). See [Model Feature Suffixes](/api-reference/endpoint/chat/model_feature_suffix) for details.
</Note>

### Prompt Caching

Venice supports prompt caching on select models to reduce latency and costs for repeated content. For supported models, Venice automatically caches system prompts—no code changes required. You can also manually mark content for caching using the `cache_control` property on message content.

| Parameter          | Type   | Description                                                                                                                                                                                          |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt_cache_key` | string | Optional routing hint to improve cache hit rates. When supplied, Venice routes requests to the same backend infrastructure, increasing the likelihood of cache hits across multi-turn conversations. |

See [Prompt Caching](/overview/guides/prompt-caching) for details on how caching works, billing, and best practices.

## Response Headers Reference

All Venice API responses include HTTP headers that provide metadata about the request, rate limits, model information, and account balance. In addition to error codes returned from API responses, you can inspect these headers to get the unique ID of a particular API request, monitor rate limiting, and track your account balance.

Venice recommends logging request IDs (`CF-RAY` header) in production deployments for more efficient troubleshooting with our support team, should the need arise.

The table below provides a comprehensive reference of all headers you may encounter:

| Header                                      | Type   | Purpose                                                                               | When Returned                                   |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Standard HTTP Headers**                   |        |                                                                                       |                                                 |
| `Content-Type`                              | string | MIME type of the response body (`application/json`, `text/csv`, `image/png`, etc.)    | Always                                          |
| `Content-Encoding`                          | string | Encoding used to compress the response body (`gzip`, `br`)                            | When client sends `Accept-Encoding` header      |
| `Content-Disposition`                       | string | How content should be displayed (e.g., `attachment; filename=export.csv`)             | When downloading files or exports               |
| `Date`                                      | string | RFC 7231 formatted timestamp when the response was generated                          | Always                                          |
| **Request Identification**                  |        |                                                                                       |                                                 |
| `CF-RAY`                                    | string | Unique identifier for this API request, used for troubleshooting and support requests | Always                                          |
| `x-venice-version`                          | string | Current version/revision of the Venice API service (e.g., `20250828.222653`)          | Always                                          |
| `x-venice-timestamp`                        | string | Server timestamp when the request was processed (ISO 8601 format)                     | When timestamp tracking is enabled              |
| `x-venice-host-name`                        | string | Hostname of the server that processed the request                                     | Error responses and debugging scenarios         |
| **Model Information**                       |        |                                                                                       |                                                 |
| `x-venice-model-id`                         | string | Unique identifier of the AI model used for the request (e.g., `venice-01-lite`)       | Inference endpoints using AI models             |
| `x-venice-model-name`                       | string | Friendly/display name of the AI model used (e.g., `Venice Lite`)                      | Inference endpoints using AI models             |
| `x-venice-model-router`                     | string | Router/backend service that handled the model inference                               | Inference endpoints when routing info available |
| `x-venice-model-deprecation-warning`        | string | Warning message for models scheduled for deprecation                                  | When using a deprecated model                   |
| `x-venice-model-deprecation-date`           | string | Date when the model will be deprecated (ISO 8601 date)                                | When using a deprecated model                   |
| **Rate Limiting Information**               |        |                                                                                       |                                                 |
| `x-ratelimit-limit-requests`                | number | Maximum number of requests allowed in the current time window                         | All authenticated requests                      |
| `x-ratelimit-remaining-requests`            | number | Number of requests remaining in the current time window                               | All authenticated requests                      |
| `x-ratelimit-reset-requests`                | number | Unix timestamp when the request rate limit resets                                     | All authenticated requests                      |
| `x-ratelimit-limit-tokens`                  | number | Maximum number of tokens (prompt + completion) allowed in the time window             | All authenticated requests                      |
| `x-ratelimit-remaining-tokens`              | number | Number of tokens remaining in the current time window                                 | All authenticated requests                      |
| `x-ratelimit-reset-tokens`                  | number | Duration in seconds until the token rate limit resets                                 | All authenticated requests                      |
| `x-ratelimit-type`                          | string | Type of rate limit applied (`user`, `api_key`, `global`)                              | When rate limiting is enforced                  |
| **Pagination Headers**                      |        |                                                                                       |                                                 |
| `x-pagination-limit`                        | number | Number of items per page                                                              | Paginated endpoints                             |
| `x-pagination-page`                         | number | Current page number (1-based)                                                         | Paginated endpoints                             |
| `x-pagination-total`                        | number | Total number of items across all pages                                                | Paginated endpoints                             |
| `x-pagination-total-pages`                  | number | Total number of pages                                                                 | Paginated endpoints                             |
| **Account Balance Information**             |        |                                                                                       |                                                 |
| `x-venice-balance-diem`                     | string | Your DIEM token balance before the request was processed                              | All authenticated requests                      |
| `x-venice-balance-usd`                      | string | Your USD credit balance before the request was processed                              | All authenticated requests                      |
| **Content Safety Headers**                  |        |                                                                                       |                                                 |
| `x-venice-is-blurred`                       | string | Indicates if generated image was blurred due to content policies (`true`/`false`)     | Image generation with Safe Venice enabled       |
| `x-venice-is-content-violation`             | string | Indicates if content violates Venice's content policies (`true`/`false`)              | Content generation endpoints                    |
| `x-venice-is-adult-model-content-violation` | string | Indicates if content violates adult model content policies (`true`/`false`)           | Image generation endpoints                      |
| `x-venice-contains-minor`                   | string | Indicates if image contains minors (`true`/`false`)                                   | Image analysis endpoints with age detection     |
| **Client Information**                      |        |                                                                                       |                                                 |
| `x-venice-middleface-version`               | string | Version of the Venice middleface client                                               | Requests from Venice middleface clients         |
| `x-venice-mobile-version`                   | string | Version of the Venice mobile app client                                               | Requests from mobile applications               |
| `x-venice-request-timestamp-ms`             | number | Client-provided request timestamp in milliseconds                                     | When client provides timestamp in request       |
| `x-venice-control-instance`                 | string | Control instance identifier for debugging                                             | Image generation endpoints for debugging        |
| **Authentication Headers**                  |        |                                                                                       |                                                 |
| `x-auth-refreshed`                          | string | Indicates authentication token was refreshed during request (`true`/`false`)          | When authentication tokens are auto-refreshed   |
| `x-retry-count`                             | number | Number of retry attempts for the request                                              | When request retries occur                      |

### Important Notes

* **Header Name Case**: HTTP headers are case-insensitive, but Venice uses lowercase with hyphens for consistency
* **String Values**: Boolean values in headers are returned as strings (`"true"` or `"false"`)
* **Numeric Values**: Large numbers and balance values may be returned as strings to prevent precision loss
* **Optional Headers**: Not all headers are returned in every response; presence depends on the endpoint and request context
* **Compression**: Use `Accept-Encoding: gzip, br` in requests to receive compressed responses where supported

### Example: Accessing Response Headers

```javascript theme={"system"}
// After making an API request, access headers from the response object
const requestId = response.headers.get('CF-RAY');
const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
const usdBalance = response.headers.get('x-venice-balance-usd');

// Check for model deprecation warnings
const deprecationWarning = response.headers.get('x-venice-model-deprecation-warning');
if (deprecationWarning) {
  console.warn(`Model Deprecation: ${deprecationWarning}`);
}
```

## Best Practices

1. **Rate Limiting**: Monitor `x-ratelimit-remaining-requests` and `x-ratelimit-remaining-tokens` headers and implement exponential backoff
2. **Balance Monitoring**: Track `x-venice-balance-usd` and `x-venice-balance-diem` headers to avoid service interruptions
3. **System Prompts**: Test with and without Venice's system prompts to find the best fit for your use case
4. **API Keys**: Keep your API keys secure and rotate them regularly
5. **Request Logging**: Log `CF-RAY` header values for troubleshooting with support
6. **Model Deprecation**: Check for `x-venice-model-deprecation-warning` headers when using models

## Differences from OpenAI's API

While Venice maintains high compatibility with the OpenAI API specification, there are some key differences:

1. **venice\_parameters**: Additional configurations like `enable_web_search`, `character_slug`, and `strip_thinking_response` for extended functionality
2. **System Prompts**: Venice appends your system prompts to defaults that optimize for uncensored responses (disable with `include_venice_system_prompt: false`)
3. **Model Ecosystem**: Venice offers its own [model lineup](/overview/models) including uncensored and reasoning models - use Venice model IDs rather than OpenAI mappings
4. **Response Headers**: Unique headers for balance tracking (`x-venice-balance-usd`, `x-venice-balance-diem`), model deprecation warnings, and content safety flags
5. **Content Policies**: More permissive policies with dedicated uncensored models and optional content filtering

## API Stability

Venice maintains backward compatibility for v1 endpoints and parameters. For model lifecycle policy, deprecation notices, and migration guidance, see [Deprecations](/overview/deprecations).

## OpenAPI Specification & Raw Data

For programmatic access to Venice API docs and data — including use with RAG (Retrieval-Augmented Generation) — the following resources are available:

* [OpenAPI Spec (YAML)](https://api.venice.ai/doc/api/swagger.yaml) — the full API specification in YAML format
* [API Docs Source](https://github.com/veniceai/api-docs/archive/refs/heads/main.zip) — all documentation pages (`.mdx` format) as a downloadable archive

***

<sub>Request fields not listed in this documentation may be passed through but are not validated or guaranteed to work.</sub>


# Create API Key
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/create

POST /api_keys
Create a new API key.



# Delete API Key
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/delete

DELETE /api_keys
Delete an API key.



# Generate API Key with Web3 Wallet
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/generate_web3_key/get

GET /api_keys/generate_web3_key
Returns the token required to generate an API key via a wallet.

## Autonomous Agent API Key Creation

Please see [this guide](/overview/guides/generating-api-key-agent) on how to use this endpoint.

***


# Generate API Key with Web3 Wallet
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/generate_web3_key/post

POST /api_keys/generate_web3_key
Authenticates a wallet holding sVVV and creates an API key.

## Autonomous Agent API Key Creation

Please see [this guide](/overview/guides/generating-api-key-agent) on how to use this endpoint.

***


# Get API Key Details
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/get

GET /api_keys/{id}
Return details about a specific API key, including rate limits and balance data.



# List API Keys
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/list

GET /api_keys
Return a list of API keys.



# Rate Limit Logs
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/rate_limit_logs

GET /api_keys/rate_limits/log
Returns the last 50 rate limits that the account exceeded.

## Experimental Endpoint

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-b1bd9f3e-507b-46c5-ad35-be7419ea5ad3?action=share\&creator=38652128\&ctx=documentation\&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041).


# Rate Limits and Balances
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/rate_limits

GET /api_keys/rate_limits
Return details about user balances and rate limits.



# Update API Key
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/update

PATCH /api_keys
Update an existing API key. The description, expiration date, and consumption limits can be updated.



# Complete Audio
Source: https://docs.venice.ai/api-reference/endpoint/audio/complete

POST /audio/complete
Mark an audio generation request as complete and clean up the generated media from storage. Call this after you have successfully downloaded the audio if you did not set delete_media_on_completion in the retrieve request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Call this endpoint after you have successfully downloaded generated audio when you want Venice to clean up stored media associated with the request.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-93377fa7-eef6-4239-a7e1-80bffc5fcb0e?action=share\&source=copy-link\&creator=48156591).

***


# Queue Audio Generation
Source: https://docs.venice.ai/api-reference/endpoint/audio/queue

POST /audio/queue
Queue a new audio generation request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Call `/audio/quote` to estimate cost, then poll `/audio/retrieve` with the returned `queue_id` until the generation finishes. If you keep generated media after retrieval, call `/audio/complete` once you have downloaded it.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-93377fa7-eef6-4239-a7e1-80bffc5fcb0e?action=share\&source=copy-link\&creator=48156591).

***


# Quote Audio Generation
Source: https://docs.venice.ai/api-reference/endpoint/audio/quote

POST /audio/quote
Get a price quote for audio generation with the specified parameters.

Use this endpoint before `/audio/queue` to estimate the USD cost of an audio generation request for the selected model and parameters.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-93377fa7-eef6-4239-a7e1-80bffc5fcb0e?action=share\&source=copy-link\&creator=48156591).

***


# Retrieve Audio
Source: https://docs.venice.ai/api-reference/endpoint/audio/retrieve

POST /audio/retrieve
Retrieve the status or result of an audio generation request. If the audio is still being generated, returns processing status with estimated time. If complete, returns the audio data.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Use the `queue_id` returned by `/audio/queue` to check generation status. When the request completes, this endpoint returns the generated audio data.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-93377fa7-eef6-4239-a7e1-80bffc5fcb0e?action=share\&source=copy-link\&creator=48156591).

***


# Speech API (Beta)
Source: https://docs.venice.ai/api-reference/endpoint/audio/speech

POST /audio/speech
Converts text to speech using various voice models and formats.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Transcriptions API (Beta)
Source: https://docs.venice.ai/api-reference/endpoint/audio/transcriptions

POST /audio/transcriptions
Transcribes audio into the input language.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Web Scrape
Source: https://docs.venice.ai/api-reference/endpoint/augment/scrape

POST /augment/scrape
Scrape a web page and return its content as markdown. Supports most public web pages; some sites (e.g. X/Twitter, Reddit) that block automated access are rejected immediately.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Warning>This is an experimental API. The request and response format may change without notice.</Warning>

Send a publicly accessible URL in the `url` field. The API returns the page content as **markdown**.

The scraper first tries the target site's native markdown support (via [Cloudflare Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)), then falls back to a headless browser extraction. Some sites that block automated access (e.g. X/Twitter, Reddit) are rejected immediately with a `400` error.

**Pricing:** \$0.01 per request.

### Example (cURL)

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/augment/scrape \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

***


# Web Search
Source: https://docs.venice.ai/api-reference/endpoint/augment/search

POST /augment/search
Search the web and return results directly. Returns structured search results including titles, URLs, content snippets, and dates.

**Search providers:**
- `brave` (default) — Brave Search with Zero Data Retention (ZDR). Search queries are never stored or logged by the search provider.
- `google` — Google Search with anonymized queries. Searches are proxied through Venice's infrastructure so that your identity is not associated with the search request sent to Google. Venice does not store or log search queries.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Warning>This is an experimental API. The request and response format may change without notice.</Warning>

Send a search query in the `query` field. The API returns structured results including titles, URLs, content snippets, and dates.

**Search providers:**

* `brave` (default) — Brave Search with Zero Data Retention (ZDR). Search queries are never stored or logged by the search provider.
* `google` — Google Search with anonymized queries. Searches are proxied through Venice's infrastructure so that your identity is not associated with the search request sent to Google. Venice does not store or log search queries.

**Pricing:** \$0.01 per request.

### Example (cURL)

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/augment/search \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "latest news about AI"}'
```

***


# Text Parser
Source: https://docs.venice.ai/api-reference/endpoint/augment/text-parser

POST /augment/text-parser
Extracts text from a document file. Supports PDF, DOCX, XLSX, and plain text formats. Upload a file via multipart/form-data.

**Privacy:** Text parsing runs entirely in-memory on Venice's infrastructure with zero data retention. Documents are processed and immediately discarded — no content is stored or logged.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Warning>This is an experimental API. The request and response format may change without notice.</Warning>

Upload a document file via multipart/form-data using the `file` field. Supported formats include **PDF**, **DOCX**, **XLSX**, and **plain text** files (up to 25MB).

Set `response_format` to `json` (default) for structured output with extracted text and token count, or `text` for the raw extracted text.

**Privacy:** Text parsing runs entirely in-memory on Venice's infrastructure with zero data retention. Your documents are processed and immediately discarded — no content is stored or logged.

**Pricing:** \$0.01 per request.

### Example (cURL)

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/augment/text-parser \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -F "file=@document.pdf" \
  -F "response_format=json"
```

***


# Billing Balance
Source: https://docs.venice.ai/api-reference/endpoint/billing/balance

GET /billing/balance
Get current balance information for the authenticated user. Returns remaining DIEM/USD balances and total DIEM epoch allocation for calculating usage percentage.



# Billing Usage API (Beta)
Source: https://docs.venice.ai/api-reference/endpoint/billing/usage

GET /billing/usage
Get paginated billing usage data for the authenticated user. NOTE: This is a beta endpoint and may be subject to change.

Exports usage data for a user. Descriptions of response fields can be found below:

* **timestamp**: The timestamp the billing usage entry was created
* **sku**: The product associated with the billing usage entry
* **pricePerUnitUsd**: The price per unit in USD
* **unit**: The number of units consumed
* **amount**: The total amount charged for the billing usage entry
* **currency**: The currency charged for the billing usage entry
* **notes**: Notes about the billing usage entry
* **inferenceDetails.requestId**: The request ID associated with the inference
* **inferenceDetails.inferenceExecutionTime**: Time taken for inference execution in milliseconds
* **inferenceDetails.promptTokens**: Number of tokens requested in the prompt. Only present for LLM usage.
* **inferenceDetails.completionTokens**: Number of tokens used in the completion. Only present for LLM usage.


# Billing Usage Analytics (Beta)
Source: https://docs.venice.ai/api-reference/endpoint/billing/usage-analytics

GET /billing/usage-analytics
**Beta**: This endpoint is currently in beta and may be unstable. Request/response schemas and behavior may change without notice.

Get aggregated usage analytics for the authenticated user with breakdowns by date, model, and API key. This endpoint provides summary views of your API usage, ideal for dashboards and usage monitoring. Data is cached for 10 minutes.

<Warning>
  This is a beta endpoint and may be unstable or change without notice.
</Warning>

Get aggregated usage analytics for the authenticated user, with breakdowns by date, model, and API key. This endpoint provides summary views of your API usage data for building dashboards and monitoring consumption. Data is cached for 10 minutes.

## Query Parameters

You can specify the time period for analytics using either:

* **lookback**: A relative period like "7d" (7 days), "30d" (30 days), up to "90d" (90 days)
* **startDate** and **endDate**: A custom date range in `YYYY-MM-DD` format. Both are required if either is provided.

If no parameters are specified, the default lookback period is 7 days.

## Response Fields

### lookback

The lookback period used for the query. Either in "Nd" format (e.g., "7d") or "startDate:endDate" format.

### byDate

Daily usage totals for the requested period.

* **date**: The date in `YYYY-MM-DD` format
* **USD**: Total usage in USD for that day
* **DIEM**: Total usage in DIEM for that day

### byModel

Usage breakdown by model, sorted by total spend (highest first).

* **modelName**: Display name of the model (e.g., "Llama 3.3 70B")
* **unitType**: Type of units consumed (tokens, images, chars, minutes, seconds)
* **modelType**: Type of model (LLM, IMAGE, TTS, ASR, VIDEO), or null
* **totalUsd**: Total USD spent on this model
* **totalDiem**: Total DIEM spent on this model
* **totalUnits**: Total units consumed for this model
* **breakdown**: Array of usage breakdowns by type (only present if multiple types). Each entry contains:
  * **type**: Token type (e.g., "Input", "Output", "Cache Read", "Cache Write")
  * **usd**: USD amount for this breakdown
  * **diem**: DIEM amount for this breakdown
  * **units**: Number of units for this breakdown

### byModelDaily

Daily chart data for top 8 models. Each entry contains a "date" (timestamp) plus model names as keys with DIEM usage values.

### topModels

Array of the top 8 model names by usage, for chart legends.

### byKey

Usage breakdown by API key, sorted by total spend (highest first).

* **apiKeyId**: The API key ID, or null if usage was from the web app
* **description**: API key description or "Web App"
* **totalUsd**: Total USD spent via this key
* **totalDiem**: Total DIEM spent via this key
* **totalUnits**: Total units consumed via this key

### byKeyDaily

Daily chart data for top 8 API keys. Each entry contains a "date" (timestamp) plus key descriptions as keys with DIEM usage values.

### topKeyNames

Array of the top 8 API key descriptions by usage, for chart legends.

## Example Usage

```bash theme={"system"}
# Get usage analytics for the past 7 days (default)
curl -X GET "https://api.venice.ai/api/v1/billing/usage-analytics" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get usage analytics for the past 30 days
curl -X GET "https://api.venice.ai/api/v1/billing/usage-analytics?lookback=30d" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get usage analytics for a specific date range
curl -X GET "https://api.venice.ai/api/v1/billing/usage-analytics?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_API_KEY"
```


# Get Character
Source: https://docs.venice.ai/api-reference/endpoint/characters/get

GET /characters/{slug}
This is a preview API and may change. Returns a single character by its slug.

## Experimental Endpoint

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/062d2eda-cd10-4f2f-83b4-083178d85fc5/request/38652128-8cca56f0-e7b7-4afa-855a-c41f9a6d53e2?action=share\&source=copy-link\&creator=48156591\&ctx=documentation).


# List Characters
Source: https://docs.venice.ai/api-reference/endpoint/characters/list

GET /characters
This is a preview API and may change. Returns a list of characters supported in the API, with filtering by search, tags, categories, model, and sort options.

## Experimental Endpoint

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-b1bd9f3e-507b-46c5-ad35-be7419ea5ad3?action=share\&creator=38652128\&ctx=documentation\&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041).


# List Character Reviews
Source: https://docs.venice.ai/api-reference/endpoint/characters/reviews

GET /characters/{slug}/reviews
This is a preview API and may change. Returns paginated public reviews for a single character.

## Experimental Endpoint

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

## What this returns

This endpoint returns paginated public reviews for a single character.

* Use the `slug` path parameter to identify the character.
* Use `page` and `pageSize` query parameters to paginate through reviews.
* Pagination metadata is returned both in the response body and in the `x-pagination-*` response headers.


# Chat Completions
Source: https://docs.venice.ai/api-reference/endpoint/chat/completions

POST /chat/completions
Run text inference based on the supplied parameters. Supports multimodal inputs including text, images (image_url), audio (input_audio), and video (video_url) for compatible models. Long running requests should use the streaming API by setting stream=true in your request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-5a71391b-5dd8-4fe8-80be-197a958907fe?action=share\&creator=38652128\&ctx=documentation\&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041).

***


# Model Feature Suffix
Source: https://docs.venice.ai/api-reference/endpoint/chat/model_feature_suffix



Venice supports additional capabilities within it's models that can be powered by the `venice_parameters` input on the chat completions endpoint.

In certain circumstances, you may be using a client that does not let you modify the request body. For those platforms, you can utilize Venice's Model Feature Suffix offering to pass flags in via the model ID.

## Syntax

The Model Feature Suffix follows this pattern:

```
<model_id>:<parameter>=<value>
```

For multiple parameters, chain them with `&`:

```
<model_id>:<parameter1>=<value1>&<parameter2>=<value2>&<parameter3>=<value3>
```

## Examples

### To Set Web Search to Auto

```
default:enable_web_search=auto
```

### To Enable Web Search and Disable System Prompt

```
default:enable_web_search=on&include_venice_system_prompt=false
```

### To Enable Web Search and Add Citations to the Response

```
default:enable_web_search=on&enable_web_citations=true
```

### To Enable Web Search with Full Page Scraping

```
default:enable_web_search=on&enable_web_scraping=true
```

### To Use a Character

```
default:character_slug=alan-watts
```

### To Hide Thinking Blocks on a Reasoning Model Response

```
qwen3-4b:strip_thinking_response=true
```

### To Disable Thinking on Supported Reasoning Models

Certain reasoning models (like Qwen 3) support disabling the thinking process. You can activate using the suffix below:

```
qwen3-4b:disable_thinking=true
```

### To Add Web Search Results to a Streaming Response

This will enable web search, add citations to the response body and include the search results in the stream as the final response message.

You can see an example of this in our [Postman Collection here](https://www.postman.com/veniceai/workspace/venice-ai-workspace/request/38652128-ceef3395-451c-4391-bc7e-a40377e0357b?action=share\&source=copy-link\&creator=38652128\&active-environment=ef110f4e-d3e1-43b5-8029-4d6877e62041).

```
qwen3-4b:enable_web_search=on&enable_web_citations=true&include_search_results_in_stream=true
```

## Postman Example

You can view an example of this feature in our [Postman Collection here](https://www.postman.com/veniceai/workspace/venice-ai-workspace/request/38652128-857f29ff-ee70-4c7c-beba-ef884bdc93be?action=share\&creator=38652128\&ctx=documentation\&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041).


# Crypto Networks
Source: https://docs.venice.ai/api-reference/endpoint/crypto/networks

GET /crypto/rpc/networks
Returns the alphabetically sorted list of network slugs supported by the Venice crypto RPC proxy.

This endpoint is **public** — no authentication required. Use it to discover which `:network` values are valid for `POST /api/v1/crypto/rpc/{network}`.

Returns the alphabetically sorted list of network slugs supported by the Venice crypto RPC proxy. Use this to discover which `:network` values are valid for `POST /crypto/rpc/{network}`.

This endpoint is **public** — no API key or wallet authentication required.

## Response shape

```json theme={"system"}
{
  "networks": [
    "arbitrum-mainnet",
    "arbitrum-sepolia",
    "avalanche-fuji",
    "avalanche-mainnet",
    "base-mainnet",
    "base-sepolia",
    "bsc-mainnet",
    "bsc-testnet",
    "ethereum-holesky",
    "ethereum-mainnet",
    "ethereum-sepolia",
    "linea-mainnet",
    "linea-sepolia",
    "optimism-mainnet",
    "optimism-sepolia",
    "polygon-amoy",
    "polygon-mainnet",
    "starknet-mainnet",
    "starknet-sepolia",
    "zksync-mainnet",
    "zksync-sepolia"
  ]
}
```

The list is authoritative — if a slug isn't here, the proxy endpoint returns `400 Unsupported RPC network`.


# Crypto RPC
Source: https://docs.venice.ai/api-reference/endpoint/crypto/rpc

POST /crypto/rpc/{network}
Proxy a JSON-RPC request to a supported blockchain node and bill per credit.

## Request shapes
- **Single request**: a JSON-RPC 2.0 object (`{ "jsonrpc":"2.0", "method":"…", "params":[…], "id":1 }`).
- **Batch**: an array of up to 100 JSON-RPC 2.0 objects. If any item references an unsupported method, the entire batch is rejected with 400 and the offending methods are listed.

## Supported methods
Methods are classified into three pricing tiers:
- **Standard (1×)**: `eth_call`, `eth_getBalance`, `eth_blockNumber`, `eth_sendRawTransaction`, `eth_getLogs`, `net_version`, `web3_clientVersion`, ERC-4337 bundler methods (`eth_sendUserOperation`, etc.), and chain-family extensions (`zks_*`, `linea_*`, `bor_*`, `starknet_*`).
- **Advanced (2×)**: `trace_*`, `debug_*`, `txpool_inspect`, `txpool_status`, `arbtrace_*`.
- **Large (4×)**: `trace_replayBlockTransactions`, `trace_replayTransaction`, `txpool_content`, `arbtrace_replay*`.

Stateful filter methods (`eth_newFilter`, `eth_getFilterChanges`, `eth_uninstallFilter`, etc.) are **not supported** — they break on a load-balanced HTTP proxy because filter state is pinned to a single upstream backend. Use `eth_getLogs` instead.

WebSocket-only methods (`eth_subscribe`, `eth_unsubscribe`) return 400 because this proxy is HTTP-only.

## Pricing
Credits consumed per call = `baseCredits[chain] × methodTier`. `baseCredits` is 20 for most EVM chains (Ethereum, Base, Optimism, Arbitrum, Polygon, Linea, Avalanche, BSC, Blast) and Starknet; 30 for zkSync Era. The USD price per credit is `~7e-7` — a single standard EVM call costs ≈ $0.000014 and a large trace-replay costs ≈ $0.000056.

Per-request errors at the JSON-RPC layer (HTTP 200 with an `error` field in a response item) are billed at 5 credits instead of the full method tier — a small concession for methods not supported on a given chain or bad-parameter responses.

## Rate limits
Two caps apply per caller:
- **Requests per minute**: 100 on the paid tier, 1000 on the staff tier.
- **Credits per rolling 24 hours**: 10,000,000 on the paid tier, 100,000,000 on the staff tier.
When either cap is exceeded, the request returns 429 with a `customMessage` identifying which cap tripped. The per-minute cap also sets the `X-RateLimit-*` response headers.

## Idempotency
Set the `Idempotency-Key` request header to any string matching `[A-Za-z0-9_-]{1,255}` to enable safe retries. The response is cached for 24 hours keyed on `(user, idempotency-key)`; replaying the same key with the same body returns the cached response with `Idempotent-Replayed: true`. Reusing the same key with a different body returns 400 to prevent silent corruption.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Forward a JSON-RPC 2.0 request (single or batch) to a supported blockchain node. Supports both API key and x402 wallet authentication. Billing is per credit and denominated in your Venice balance — one credential, one invoice, every chain below.

## Authentication

This endpoint supports two authentication methods:

* **API Key**: Standard Bearer token authentication via the `Authorization: Bearer <key>` header.
* **x402 Wallet**: Pay-as-you-go with USDC credits from your Ethereum wallet — no Venice account required. See the [x402 guide](/overview/guides/x402-venice-api) for setup.

Both methods share the same rate limits and billing (Venice credits).

## Supported networks

See [`GET /crypto/rpc/networks`](/api-reference/endpoint/crypto/networks) for the live, authoritative list. Current coverage:

| Family            | Mainnet             | Testnets                               |
| ----------------- | ------------------- | -------------------------------------- |
| Ethereum          | `ethereum-mainnet`  | `ethereum-sepolia`, `ethereum-holesky` |
| Polygon           | `polygon-mainnet`   | `polygon-amoy`                         |
| Arbitrum          | `arbitrum-mainnet`  | `arbitrum-sepolia`                     |
| Optimism          | `optimism-mainnet`  | `optimism-sepolia`                     |
| Base              | `base-mainnet`      | `base-sepolia`                         |
| Linea             | `linea-mainnet`     | `linea-sepolia`                        |
| Avalanche C-Chain | `avalanche-mainnet` | `avalanche-fuji`                       |
| BNB Smart Chain   | `bsc-mainnet`       | `bsc-testnet`                          |
| Blast             | `blast-mainnet`     | `blast-sepolia`                        |
| zkSync Era        | `zksync-mainnet`    | `zksync-sepolia`                       |
| Starknet          | `starknet-mainnet`  | `starknet-sepolia`                     |

## Request shapes

### Single request

```json theme={"system"}
{
  "jsonrpc": "2.0",
  "method": "eth_chainId",
  "params": [],
  "id": 1
}
```

### Batch request

An array of up to **100** JSON-RPC 2.0 objects. Each item is validated independently; if any method is unsupported, the entire batch is rejected with `400` and every offending method name is listed in the error message.

```json theme={"system"}
[
  { "jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1 },
  { "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 2 }
]
```

## Supported methods and pricing tiers

Methods are classified into three credit tiers. Credits consumed per call = `baseCredits[chain] × methodTier`.

| Tier         | Multiplier | Example methods                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard** | 1×         | `eth_call`, `eth_getBalance`, `eth_blockNumber`, `eth_sendRawTransaction`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_estimateGas`, `net_version`, `web3_clientVersion`, ERC-4337 bundler methods (`eth_sendUserOperation`, `eth_estimateUserOperationGas`, etc.), chain-family extensions (`zks_*`, `linea_*`, `bor_*`, `starknet_*`) |
| **Advanced** | 2×         | `trace_block`, `trace_call`, `trace_transaction`, `debug_traceCall`, `debug_traceTransaction`, `debug_traceBlockByHash`, `txpool_inspect`, `txpool_status`, `arbtrace_*`                                                                                                                                                                     |
| **Large**    | 4×         | `trace_replayBlockTransactions`, `trace_replayTransaction`, `txpool_content`, `arbtrace_replayTransaction`, `arbtrace_replayBlockTransactions`                                                                                                                                                                                               |

### Base credits per chain

| baseCredits | Chains                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| **20**      | Ethereum + all EVM L2s above (Base, Optimism, Arbitrum, Polygon, Linea, Avalanche, BSC, Blast) and Starknet |
| **30**      | zkSync Era                                                                                                  |

### Cost examples

At Venice's `~$6.25 × 10⁻⁷` per credit:

| Call                                            | Credits | USD cost    |
| ----------------------------------------------- | ------- | ----------- |
| `eth_call` on Ethereum (20 × 1×)                | 20      | \$0.0000125 |
| `trace_transaction` on Ethereum (20 × 2×)       | 40      | \$0.0000250 |
| `trace_replayTransaction` on Ethereum (20 × 4×) | 80      | \$0.0000500 |
| `eth_call` on zkSync (30 × 1×)                  | 30      | \$0.0000188 |

### Not supported

* **WebSocket-only methods** (`eth_subscribe`, `eth_unsubscribe`) — this proxy is HTTP-only. Poll instead, or upgrade to a direct WebSocket provider.
* **Stateful filter methods** (`eth_newFilter`, `eth_getFilterChanges`, `eth_getFilterLogs`, `eth_uninstallFilter`, `eth_newBlockFilter`, `eth_newPendingTransactionFilter`) — filter state is pinned to a single upstream backend and silently breaks on a load-balanced HTTP proxy. Use `eth_getLogs` (stateless) instead.
* **Miner / key-holding methods** (`eth_sign`, `eth_accounts`, `eth_mining`, `eth_hashrate`, `eth_getWork`, `eth_submitWork`) — hosted provider endpoints don't hold user private keys, so these always error. Sign transactions client-side and submit via `eth_sendRawTransaction`.
* **Unmapped methods** — anything not explicitly allowlisted returns `400`. Contact support to request additions.

## Per-item batch billing

Even when the HTTP response is `200`, individual batch items can come back with a JSON-RPC `error` field (for example, a bad-params error or a method not supported on the target chain). Venice bills these items at **5 credits each** rather than the full method tier — a small concession for normal "exploring the API" mistakes.

```json theme={"system"}
// Batch request:
[
  { "jsonrpc": "2.0", "method": "eth_chainId",   "params": [],         "id": 1 },
  { "jsonrpc": "2.0", "method": "eth_getBalance","params": ["bad"],    "id": 2 }
]

// Response (HTTP 200, X-Venice-RPC-Credits: 25):
[
  { "jsonrpc": "2.0", "id": 1, "result": "0x1" },
  { "jsonrpc": "2.0", "id": 2, "error": { "code": -32602, "message": "invalid params" } }
]
```

The first item (success) bills 20 credits, the second (RPC-level error) bills 5, sum `= 25`.

## Rate limits

Per-minute request cap per authenticated caller:

| Tier     | Requests/minute |
| -------- | --------------- |
| Standard | 100             |
| Staff    | 1,000           |

When the cap is exceeded the endpoint returns `429` with a `customMessage` and standard `X-RateLimit-*` response headers.

## Idempotency

Set the `Idempotency-Key` request header to any string matching `[A-Za-z0-9_-]{1,255}` to enable safe retries. The response is cached for 24 hours keyed on `(user, idempotency-key)`:

* Replaying the **same key with the same body** returns the cached response and an `Idempotent-Replayed: true` response header. The upstream is not touched and no new credits are charged.
* Replaying the **same key with a different body** returns `400` to prevent silent state corruption. Pick a fresh key for distinct requests.

## Response headers

| Header                                                              | Description                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `X-Venice-RPC-Credits`                                              | Credits charged for this request. On batch requests, this is the sum across items.   |
| `X-Venice-RPC-Cost-USD`                                             | Dollar cost to 8 decimal places. Equal to `X-Venice-RPC-Credits × price per credit`. |
| `X-Request-ID`                                                      | 32-character correlation ID. Include in any support correspondence.                  |
| `Idempotent-Replayed`                                               | Present with value `"true"` when the response came from the idempotency cache.       |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` | Set only on 429 responses.                                                           |

## Forensic logging for transaction relays

Every call to `eth_sendRawTransaction` is logged server-side with the tx hash (keccak256 of the raw bytes), the network slug, the request ID, and the calling user ID. We do **not** retain the signed payload itself — the hash is recoverable from the on-chain receipt. This audit trail exists so that if a customer's API key is compromised and used to relay illicit transactions through our infrastructure, we can correlate on-chain activity back to the responsible account.

## Example

```bash theme={"system"}
curl https://api.venice.ai/api/v1/crypto/rpc/ethereum-mainnet \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_chainId",
    "params": [],
    "id": 1
  }'
```

```json theme={"system"}
{ "jsonrpc": "2.0", "id": 1, "result": "0x1" }
```

Response headers: `X-Venice-RPC-Credits: 20`, `X-Venice-RPC-Cost-USD: 0.00001250`, `X-Request-ID: <nanoid>`.

## Postman collection

A ready-to-import Postman collection with 27 example requests (discovery, standard/advanced/large calls, multi-chain, batching, idempotency, error cases) is available in our public workspace:

**[Venice Crypto RPC — Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-2cf5a817-41cd-438b-ad37-5d07c3f13005?action=share\&creator=48156591\&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041)**

Set the `apiKey` collection variable to your Venice API key and start sending requests immediately.


# Generate Embeddings
Source: https://docs.venice.ai/api-reference/endpoint/embeddings/generate

POST /embeddings
Create embeddings for the supplied input.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Background Remove
Source: https://docs.venice.ai/api-reference/endpoint/image/background-remove

POST /image/background-remove
Remove the background from an image using AI. The image can be provided either as a multipart form-data file upload, as a base64-encoded string in a JSON request, or as an image URL. Returns a PNG image with transparent background.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Edit (aka Inpaint)
Source: https://docs.venice.ai/api-reference/endpoint/image/edit

POST /image/edit
Edit or modify an image based on the supplied prompt. The image can be provided either as a multipart form-data file upload or as a base64-encoded string in a JSON request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

<Info>
  **Pricing:** Image editing/inpainting pricing varies by model. The default model (`qwen-edit`) is **\$0.04 per edit**. See the [Models endpoint](/api-reference/endpoint/models/list) for all available inpaint models and their pricing.
</Info>

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-2d156cd6-a9bc-4586-8a8b-98e4b5c4435d?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***

<Warning>
  The default model (`qwen-edit`) blocks requests that try to generate explicit sexual imagery, sexualize minors, or depict real-world violence. Other models may have different content policies.
</Warning>


# Generate Images
Source: https://docs.venice.ai/api-reference/endpoint/image/generate

POST /image/generate
Generate an image based on input parameters

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

## Resolution Options

Some models support higher resolution outputs with resolution-based pricing. Pass the `resolution` parameter in your request:

```json theme={"system"}
{
  "model": "nano-banana-pro",
  "prompt": "a serene canal in venice at sunset",
  "resolution": "2K"
}
```

See the [Image Models](/models/image) page for available resolutions and pricing per model.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-0adc004d-2edf-4b88-a3bb-0f868c791c9c?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# Generate Images (OpenAI Compatible API)
Source: https://docs.venice.ai/api-reference/endpoint/image/generations

POST /images/generations
Generate an image based on input parameters using an OpenAI compatible endpoint. This endpoint does not support the full feature set of the Venice Image Generation endpoint, but is compatible with the existing OpenAI endpoint.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Multi-Edit Image
Source: https://docs.venice.ai/api-reference/endpoint/image/multi-edit

POST /image/multi-edit
Edit or modify an image using up to three layered inputs (base image plus masks/overlays).

**Supported input formats by Content-Type:**

- **multipart/form-data**: Only file uploads are supported. Send images as form file fields.

- **application/json**: Base64 strings and URLs are supported:
  - Raw base64 string: `"iVBORw0KGgoAAAANSUhEUgAA..."`
  - Data URL: `"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."`
  - HTTP/HTTPS URL: `"https://example.com/image.png"`


**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.



# Image Styles
Source: https://docs.venice.ai/api-reference/endpoint/image/styles

GET /image/styles
List available image styles that can be used with the generate API.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-04b32328-197f-4548-b15e-79d4ab0728b1?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# Upscale and Enhance
Source: https://docs.venice.ai/api-reference/endpoint/image/upscale

POST /image/upscale
Upscale or enhance an image based on the supplied parameters. Using a scale of 1 with enhance enabled will only run the enhancer. The image can be provided either as a multipart form-data file upload or as a base64-encoded string in a JSON request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-8c268e3a-614f-4e49-9816-e4b8d1597818?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# Compatibility Mapping
Source: https://docs.venice.ai/api-reference/endpoint/models/compatibility_mapping

GET /models/compatibility_mapping
Returns a list of model compatibility mappings and the associated model.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-59dfa959-7038-4cd8-b8ba-80cf09f2f026?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# List Models
Source: https://docs.venice.ai/api-reference/endpoint/models/list

GET /models
Returns a list of available models supported by the Venice.ai API across text, image, audio, video, and related inference types.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-59dfa959-7038-4cd8-b8ba-80cf09f2f026?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# Traits
Source: https://docs.venice.ai/api-reference/endpoint/models/traits

GET /models/traits
Returns a list of model traits and the associated model.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-59dfa959-7038-4cd8-b8ba-80cf09f2f026?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


# Complete Video
Source: https://docs.venice.ai/api-reference/endpoint/video/complete

POST /video/complete
Delete a video generation request from storage after it has been successfully downloaded. Videos can be automatically deleted after retrieval by setting the `delete_media_on_completion` flag to true when calling the retrieve API.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

***


# Queue Video Generation
Source: https://docs.venice.ai/api-reference/endpoint/video/queue

POST /video/queue
Queue a new video generation request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Call `/video/quote` to get a price estimate, then poll `/video/retrieve` with the returned `queue_id` until complete.

### Video upscaling

For the `topaz-video-upscale` model, use `upscale_factor` (1, 2, or 4) instead of `resolution`, and provide a `video_url`. Duration and FPS are detected automatically from the video file. See the [Video Upscaling Guide](/overview/guides/video-upscaling) for full details and examples.

***


# Quote Video Generation
Source: https://docs.venice.ai/api-reference/endpoint/video/quote

POST /video/quote
Quote a video generation request based on pricing inputs (model, duration, resolution, aspect_ratio, audio). Returns the price in USD.

***


# Retrieve Video
Source: https://docs.venice.ai/api-reference/endpoint/video/retrieve

POST /video/retrieve
Retrieve a video generation result. Returns the video file if completed, or a status if the request is still processing.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

***


# Video Transcriptions API (Beta)
Source: https://docs.venice.ai/api-reference/endpoint/video/transcriptions

POST /video/transcriptions
Transcribes video audio from a public URL.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Send a publicly accessible video URL in `url`. Optionally set `response_format` to `json` (default) or `text` depending on whether you want structured output or plain transcript text.

***


# X402 Balance
Source: https://docs.venice.ai/api-reference/endpoint/x402/balance

GET /x402/balance/{walletAddress}
Get the x402 credit balance for a wallet address. Requires Sign-in-with-x authentication (via SIWE) for the same wallet.



# X402 Top Up
Source: https://docs.venice.ai/api-reference/endpoint/x402/top-up

POST /x402/top-up
Top up your Venice credit balance using an `X-402-Payment` header. If the header is missing, the endpoint returns payment requirements.

This is the primary x402 payment endpoint. All inference endpoints (chat, image, audio, video) consume from the credit balance you establish here.



# X402 Transactions
Source: https://docs.venice.ai/api-reference/endpoint/x402/transactions

GET /x402/transactions/{walletAddress}
Get paginated x402 transaction history for a wallet address. Requires Sign-in-with-x authentication for the same wallet.



# Error Codes
Source: https://docs.venice.ai/api-reference/error-codes

Predictable error codes for the Venice API

When an error occurs in the API, we return a consistent error response format that includes an error code, HTTP status code, and a descriptive message. This reference lists all possible error codes that you might encounter while using our API, along with their corresponding HTTP status codes and messages.

| Error Code                           | HTTP Status | Message                                                                                                                                      | Log Level |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `AUTHENTICATION_FAILED`              | 401         | Authentication failed                                                                                                                        | -         |
| `AUTHENTICATION_FAILED_INACTIVE_KEY` | 401         | Authentication failed - Pro subscription is inactive. Please upgrade your subscription to continue using the API.                            | -         |
| `INVALID_API_KEY`                    | 401         | Invalid API key provided                                                                                                                     | -         |
| `INSUFFICIENT_BALANCE`               | 402         | Insufficient USD or Diem balance to complete request. Visit [https://venice.ai/settings/api](https://venice.ai/settings/api) to add credits. | -         |
| `UNAUTHORIZED`                       | 403         | Unauthorized access                                                                                                                          | -         |
| `INVALID_REQUEST`                    | 400         | Invalid request parameters                                                                                                                   | -         |
| `INVALID_MODEL`                      | 400         | Invalid model specified                                                                                                                      | -         |
| `CHARACTER_NOT_FOUND`                | 404         | No character could be found from the provided character\_slug                                                                                | -         |
| `INVALID_CONTENT_TYPE`               | 415         | Invalid content type                                                                                                                         | -         |
| `INVALID_FILE_SIZE`                  | 413         | File size exceeds maximum limit                                                                                                              | -         |
| `INVALID_IMAGE_FORMAT`               | 400         | Invalid image format                                                                                                                         | -         |
| `CORRUPTED_IMAGE`                    | 400         | The image file is corrupted or unreadable                                                                                                    | -         |
| `RATE_LIMIT_EXCEEDED`                | 429         | Rate limit exceeded                                                                                                                          | -         |
| `MODEL_NOT_FOUND`                    | 404         | Specified model not found                                                                                                                    | -         |
| `INFERENCE_FAILED`                   | 500         | Inference processing failed                                                                                                                  | error     |
| `UPSCALE_FAILED`                     | 500         | Image upscaling failed                                                                                                                       | error     |
| `UNKNOWN_ERROR`                      | 500         | An unknown error occurred                                                                                                                    | error     |


# Rate Limits
Source: https://docs.venice.ai/api-reference/rate-limiting

Request and token rate limits for the Venice API.

Rate limits vary by model and tier. You can check your exact limits anytime:

<CardGroup>
  <Card title="View Your Limits" icon="gauge-high" href="/api-reference/endpoint/api_keys/rate_limits?playground=open">
    Interactive playground
  </Card>

  <Card title="Rate Limit Logs" icon="clock-rotate-left" href="/api-reference/endpoint/api_keys/rate_limit_logs?playground=open">
    See which requests hit limits
  </Card>
</CardGroup>

```bash theme={"system"}
curl https://api.venice.ai/api/v1/api_keys/rate_limits \
  -H "Authorization: Bearer $VENICE_API_KEY"
```

## Default Limits

### Text Models

Text models are grouped into tiers based on size. Each model card on the [Models page](/models/text) displays its tier badge.

| Tier | Requests/min | Tokens/min |
| :--- | -----------: | ---------: |
| XS   |          500 |  1,000,000 |
| S    |           75 |    750,000 |
| M    |           50 |    750,000 |
| L    |           20 |    500,000 |

<Accordion title="Which models are in each tier?">
  **XS** `qwen3-4b` `llama-3.2-3b`

  **S** `mistral-31-24b` `venice-uncensored`

  **M** `llama-3.3-70b` `qwen3-next-80b` `google-gemma-3-27b-it`

  **L** `qwen3-235b-a22b-instruct-2507` `qwen3-235b-a22b-thinking-2507` `deepseek-ai-DeepSeek-R1` `grok-41-fast` `kimi-k2-thinking` `gemini-3-pro-preview` `hermes-3-llama-3.1-405b` `qwen3-coder-480b-a35b-instruct` `zai-org-glm-4.7` `openai-gpt-oss-120b`
</Accordion>

### Other Models

| Type             | Requests/min |
| :--------------- | -----------: |
| Image            |           20 |
| Audio            |           60 |
| Embedding        |          500 |
| Video (queue)    |           40 |
| Video (retrieve) |          120 |

## Handling Errors

Failed requests (500, 503, 429) should be retried with exponential backoff.

For 429 errors specifically, check the `x-ratelimit-reset-requests` header for the exact Unix timestamp when you can retry. Most HTTP libraries have built-in retry mechanisms that handle this automatically.

### Abuse Protection

If you generate more than 20 failed requests in 30 seconds, the API will block further requests for 30 seconds:

```
Too many failed attempts (> 20) resulting in a non-success status code. Please wait 30s and try again.
```

## Response Headers

Every response includes these headers:

| Header                           | Description                            |
| :------------------------------- | :------------------------------------- |
| `x-ratelimit-limit-requests`     | Max requests allowed in current window |
| `x-ratelimit-remaining-requests` | Requests remaining in current window   |
| `x-ratelimit-reset-requests`     | Unix timestamp when window resets      |
| `x-ratelimit-limit-tokens`       | Max tokens allowed per minute          |
| `x-ratelimit-remaining-tokens`   | Tokens remaining in current minute     |
| `x-ratelimit-reset-tokens`       | Seconds until token limit resets       |

## Partner Tier

Partners get significantly higher rate limits:

| Tier | Requests/min | Tokens/min |
| :--- | -----------: | ---------: |
| XS   |          500 |  2,000,000 |
| S    |          150 |  1,500,000 |
| M    |          100 |  1,500,000 |
| L    |           60 |  1,000,000 |

| Type      | Requests/min |
| :-------- | -----------: |
| Image     |           60 |
| Audio     |          120 |
| Embedding |          500 |

If you're consistently hitting your rate limits and your usage patterns show **sustained demand over time**, reach out to discuss partner access: [api@venice.ai](mailto:api@venice.ai).

Partner tier limits can be adjusted based on your specific needs.


# Embedding Models
Source: https://docs.venice.ai/models/embeddings

Text embeddings for semantic search and retrieval

<div>Loading models...</div>

***

<Note>
  See the [Embeddings API](/api-reference/endpoint/embeddings/generate) for usage examples.
</Note>


# Image Models
Source: https://docs.venice.ai/models/image

Image generation, upscaling, and editing models

<div>Loading models...</div>

***

## Model Types

* **Generation:** Create images from text prompts
* **Upscale:** Enhance image resolution and quality
* **Edit:** Modify existing images with inpainting

<Note>
  See the [Image Generate API](/api-reference/endpoint/image/generate) for text-to-image, [Upscale API](/api-reference/endpoint/image/upscale) for enhancement, and [Edit API](/api-reference/endpoint/image/edit) for inpainting.
</Note>


# Music & Sound Effects Models
Source: https://docs.venice.ai/models/music

AI-powered music generation, song creation, and sound effects synthesis

<div>Loading models...</div>

## Model Categories

**Song Generation:** Create full songs with optional lyrics and vocal support

* ACE-Step 1.5, ElevenLabs Music, MiniMax Music 2.0

**Music & Sound Effects:** Generate instrumental music or sound effects from text prompts

* Stable Audio 2.5

**Sound Effects:** Synthesize audio effects and ambient sounds from text prompts

* ElevenLabs Sound Effects, MMAudio V2

<Tip>
  ElevenLabs Music is the only model that supports `force_instrumental` to generate music without vocals.
</Tip>

<Note>
  Audio generation uses an async queue system. See the [Audio Queue API](/api-reference/endpoint/audio/queue) to start generation and [Audio Retrieve API](/api-reference/endpoint/audio/retrieve) to fetch results.
</Note>

## Pricing

Pricing varies by model:

* **Per-generation:** Fixed price per audio clip (MiniMax Music 2.0, Stable Audio 2.5)
* **Duration-tiered:** Price scales with duration tier (ElevenLabs Music, ACE-Step 1.5)
* **Per-second:** Price based on output duration (ElevenLabs Sound Effects, MMAudio V2)

For exact quotes before generation, use the [Audio Quote API](/api-reference/endpoint/audio/quote).

### Duration-Tiered Pricing

Models with duration-tiered pricing accept any `duration_seconds` within the model's `min_duration`–`max_duration` range. The price is determined by which tier the requested duration falls into. Tier ranges are returned in the `/models` response under `pricing.durations`, with `min_seconds` and `max_seconds` for each tier.

For example, ElevenLabs Music accepts 3–600 seconds (up to 10 minutes) at \$0.75 per minute, rounded up to the nearest minute:

| Duration Range | Tier Key | Base Price |
| -------------- | -------- | ---------- |
| 3–60s          | `60`     | \$0.75     |
| 61–120s        | `120`    | \$1.50     |
| 121–180s       | `180`    | \$2.25     |
| 181–240s       | `240`    | \$3.00     |
| 241–300s       | `300`    | \$3.75     |
| 301–360s       | `360`    | \$4.50     |
| 361–420s       | `420`    | \$5.25     |
| 421–480s       | `480`    | \$6.00     |
| 481–540s       | `540`    | \$6.75     |
| 541–600s       | `600`    | \$7.50     |

These are base prices before markup. Use the [Audio Quote API](/api-reference/endpoint/audio/quote) to get the exact price you will be charged.

## Key Parameters

| Parameter            | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `prompt`             | Text description of the audio to generate                                     |
| `lyrics_prompt`      | Song lyrics for vocal models (required when model has `lyrics_required=true`) |
| `duration_seconds`   | Output length in seconds                                                      |
| `force_instrumental` | Generate without vocals (where supported)                                     |


# Models
Source: https://docs.venice.ai/models/overview

Explore all available models on the Venice API

<div>Loading models...</div>


# Speech-to-Text Models
Source: https://docs.venice.ai/models/speech-to-text

Speech recognition models for transcribing audio to text

<div>Loading models...</div>

***

## Usage

Speech-to-text models transcribe spoken audio into written text. They are accessed via the [Audio Transcriptions API](/api-reference/endpoint/audio/transcriptions).

### Supported audio formats

`mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `flac`, `ogg`

### Response formats

| Format         | Description                                               |
| -------------- | --------------------------------------------------------- |
| `json`         | Default. Returns `{ "text": "..." }`.                     |
| `text`         | Plain transcribed text.                                   |
| `srt`          | SubRip subtitle format with timestamps.                   |
| `vtt`          | WebVTT subtitle format with timestamps.                   |
| `verbose_json` | Full response with segment-level timestamps and metadata. |

<Note>
  Pricing is billed per second of input audio. See the [Audio Transcriptions API](/api-reference/endpoint/audio/transcriptions) for request examples and parameter details.
</Note>


# Text Models
Source: https://docs.venice.ai/models/text

Chat, reasoning, and code generation models

<div>Loading models...</div>

***

## Capabilities

* **Function Calling:** Let the model invoke tools and external APIs
* **Reasoning:** Extended thinking for complex problem-solving
* **Vision:** Analyze images alongside text prompts
* **Code:** Optimized for code generation and understanding

<Note>
  See the [Chat Completions API](/api-reference/endpoint/chat/completions) for usage examples.
</Note>


# Text-to-Speech Models
Source: https://docs.venice.ai/models/text-to-speech

Text-to-speech models with multilingual voice support

<div>Loading models...</div>

***

## Voice catalog

Voices are **model-specific**. The `voice` you pass must come from the catalog
of the `model` you selected. Pick a model below to browse its voices.

<div>Loading voices...</div>

<Note>
  Voice IDs are case-sensitive and **only valid for the matching `model`**. Pass
  both fields together in your request payload. See the
  [Audio Speech API](/api-reference/endpoint/audio/speech) for examples.
</Note>

### Example request

```bash theme={"system"}
curl https://api.venice.ai/api/v1/audio/speech \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-kokoro",
    "voice": "af_sky",
    "input": "Hello from Venice."
  }' \
  --output speech.mp3
```

To switch models, change **both** `model` and `voice` to a pair from the
selected model above.


# Video Models
Source: https://docs.venice.ai/models/video

Text-to-video, image-to-video generation, and video upscaling

<div>Loading models...</div>

## Model Types

**Text to Video:** Generate videos from text prompts

**Image to Video:** Animate static images into video clips

**Video Upscaling:** Enhance existing videos to higher resolutions using AI-powered upscaling. See the [Video Upscaling Guide](/overview/guides/video-upscaling) for details.

<Note>
  Video generation and upscaling use an async queue system. See the [Video Queue API](/api-reference/endpoint/video/queue) to start generation and [Video Retrieve API](/api-reference/endpoint/video/retrieve) to fetch results.
</Note>

## Pricing

Adjust the dropdowns to see how duration, resolution, and audio affect the price. Models marked **FIXED** have a flat rate.

For exact quotes before generation, use the [Video Quote API](/api-reference/endpoint/video/quote).


# Venice API
Source: https://docs.venice.ai/overview/about-venice



Build AI with no data retention, permissionless access, and compute you permanently own.

<CardGroup>
  <Card title="Start Building" href="/overview/getting-started" icon="rocket">
    Make your first request in minutes.
  </Card>

  <Card title="View Models" href="/overview/models" icon="database">
    Compare capabilities, context, and base models.
  </Card>

  <Card title="API Reference" href="/api-reference" icon="rectangle-code">
    Endpoints, payloads, and examples.
  </Card>
</CardGroup>

## OpenAI Compatibility

Use your existing OpenAI code with just a base URL change.

<CodeGroup>
  ```python Python theme={"system"}
  import openai

  client = openai.OpenAI(
      api_key="your-api-key",
      base_url="https://api.venice.ai/api/v1"
  )

  response = client.chat.completions.create(
      model="venice-uncensored-1-2",
      messages=[{"role": "user", "content": "Hello World!"}]
  )

  print(response.choices[0].message.content)
  ```

  ```ts TypeScript theme={"system"}
  import OpenAI from "openai";

  const openai = new OpenAI({
    apiKey: process.env.VENICE_API_KEY!,
    baseURL: "https://api.venice.ai/api/v1",
  });

  const completion = await openai.chat.completions.create({
    model: "venice-uncensored-1-2",
    messages: [{ role: "user", content: "Hello World!" }],
  });

  console.log(completion.choices[0].message.content);
  ```

  ```bash Curl theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "venice-uncensored-1-2",
      "messages": [{"role": "user", "content": "Hello World!"}]
    }'
  ```

  ```go Go theme={"system"}
  package main

  import (
      "context"
      "fmt"
      "os"
      "github.com/openai/openai-go"
  )

  func main() {
      client, err := openai.NewClient(os.Getenv("VENICE_API_KEY"))
      if err != nil {
          fmt.Printf("Error creating client: %v\n", err)
          return
      }
      
      client.BaseURL = "https://api.venice.ai/api/v1"
      
      resp, err := client.CreateChatCompletion(
          context.Background(),
          openai.ChatCompletionRequest{
              Model: "venice-uncensored-1-2",
              Messages: []openai.ChatCompletionMessage{
                  {
                      Role:    openai.ChatMessageRoleUser,
                      Content: "Hello World!",
                  },
              },
          },
      )
      
      if err != nil {
          fmt.Printf("Error: %v\n", err)
          return
      }
      
      fmt.Println(resp.Choices[0].Message.Content)
  }
  ```

  ```php PHP theme={"system"}
  <?php

  require_once 'vendor/autoload.php';

  use OpenAI\Client;

  $client = OpenAI::client('your-api-key');
  $client->setBaseUrl('https://api.venice.ai/api/v1');

  $response = $client->chat()->create([
      'model' => 'venice-uncensored',
      'messages' => [
          [
              'role' => 'user',
              'content' => 'Hello World!'
          ]
      ]
  ]);

  echo $response->choices[0]->message->content;
  ```

  ```csharp C# theme={"system"}
  using OpenAI;

  var client = new OpenAIClient("your-api-key");
  client.BaseUrl = "https://api.venice.ai/api/v1";

  var chatCompletion = await client.GetChatCompletionsAsync(new ChatCompletionOptions
  {
      Model = "venice-uncensored-1-2",
      Messages = { new ChatMessage(ChatRole.User, "Hello World!") }
  });

  Console.WriteLine(chatCompletion.Value.Choices[0].Message.Content);
  ```

  ```java Java theme={"system"}
  import com.openai.OpenAI;
  import com.openai.OpenAIHttpException;
  import com.openai.core.ApiError;
  import com.openai.types.chat.ChatCompletionRequest;
  import com.openai.types.chat.ChatCompletionResponse;
  import com.openai.types.chat.ChatMessage;

  public class Main {
      public static void main(String[] args) {
          OpenAI client = OpenAI.builder()
              .apiKey(System.getenv("VENICE_API_KEY"))
              .baseUrl("https://api.venice.ai/api/v1")
              .build();

          try {
              ChatCompletionResponse response = client.chatCompletions().create(
                  ChatCompletionRequest.builder()
                      .model("venice-uncensored-1-2")
                      .messages(ChatMessage.of("Hello World!"))
                      .build()
              );
              
              System.out.println(response.choices().get(0).message().content());
          } catch (OpenAIHttpException e) {
              System.err.println("Error: " + e.getMessage());
          }
      }
  }
  ```

  ```swift Swift theme={"system"}
  import OpenAI

  let client = OpenAI(apiToken: "your-api-key")
  client.baseURL = "https://api.venice.ai/api/v1"

  Task {
      do {
          let response = try await client.chats.create(
              model: "venice-uncensored-1-2",
              messages: [.init(role: .user, content: "Hello World!")]
          )
          
          print(response.choices[0].message.content ?? "")
      } catch {
          print("Error: \(error)")
      }
  }
  ```
</CodeGroup>

## Build with Venice APIs

Access chat, image generation (generate/upscale/edit), audio (TTS), and characters.

<CardGroup>
  <Card title="Chat Completions" href="/api-reference/endpoint/chat/completions" icon="message">
    **Text + reasoning**

    Vision, tool use, streaming
  </Card>

  <Card title="Image Generation" href="/api-reference/endpoint/image/generations" icon="image">
    **Generate, upscale, and edit**

    Models for styles, quality, and uncensored
  </Card>

  <Card title="Audio Synthesis" href="/api-reference/endpoint/audio/speech" icon="headphones">
    **Text → speech**

    50+ multilingual voices
  </Card>

  <Card title="AI Characters" href="/api-reference/endpoint/characters/list" icon="user">
    **Characters API**

    Create, list, and chat with personas
  </Card>
</CardGroup>

[View all API endpoints →](/api-reference)

## Popular Models

Copy a Model ID and use it as `model` in your requests.

<Card title="GLM 5.1" icon="brain">
  Flagship model for deep reasoning and production agents.

  Model ID: `zai-org-glm-5.1`
  Base: GLM 5.1
  Context: 200k • Modalities: Text → Text

  **Use cases**

  * Agent planning and tool use
  * Complex code & system design
  * Long‑context reasoning

  ```json theme={"system"}
  {"model":"zai-org-glm-5.1","messages":[{"role":"user","content":"Plan a zero‑downtime DB migration in 3 steps"}]}
  ```
</Card>

<CardGroup>
  <Card title="Venice Uncensored 1.2" icon="shield">
    **Unfiltered generation**

    Model ID: `venice-uncensored-1-2`

    Base model: Venice Uncensored 1.2

    Context: 128k • Best for: uncensored creative, red‑team testing

    ```json theme={"system"}
    {"model":"venice-uncensored-1-2","messages":[{"role":"user","content":"Write an unfiltered analysis of content moderation policies"}]}
    ```
  </Card>

  <Card title="Mistral 3.1 24B" icon="eye">
    **Vision + tools**

    Model ID: `mistral-31-24b`

    Base model: Mistral 3.1 24B

    Context: 131k • Supports: Vision, Function calling, image analysis

    ```json theme={"system"}
    {"model":"mistral-31-24b","messages":[{"role":"user","content":"Describe this image"}]}
    ```
  </Card>

  <Card title="Qwen 3.5 9B" icon="bolt">
    **Fast and cost‑efficient**

    Model ID: `qwen3-5-9b`

    Base model: Qwen 3.5 9B

    Context: 256k • Best for: chatbots, classification, light reasoning

    ```json theme={"system"}
    {"model":"qwen3-5-9b","messages":[{"role":"user","content":"Summarize:"}]}
    ```
  </Card>

  <Card title="Nano Banana Pro" icon="image">
    **Image generation**

    Model ID: `nano-banana-pro`

    Base model: Nano Banana Pro

    Best for: Text‑to‑image, photorealism, product shots, light upscaling

    ```json theme={"system"}
    {"model":"nano-banana-pro","prompt":"a serene canal in venice at sunset"}
    ```
  </Card>
</CardGroup>

[View all models →](/overview/models)

## Extend models with built‑in tools

Toggle on compatible models using `venice_parameters` or model suffixes

<CardGroup>
  <Card title="Web Search" icon="globe" />

  <Card title="Reasoning" icon="brain" />

  <Card title="Vision" icon="eye" />

  <Card title="Tool Calling" icon="link" />
</CardGroup>

<Accordion title="Web Search Code Samples">
  Enable real-time web search with citations on **all text models**. Get up-to-date information from the internet and include source citations in responses. Works with any Venice text model.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "zai-org-glm-5.1",
        "messages": [{"role": "user", "content": "What are the latest developments in AI?"}],
        "venice_parameters": {
          "enable_web_search": "auto"
        }
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const openai = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const completion = await openai.chat.completions.create({
      model: "zai-org-glm-5.1",
      messages: [{ role: "user", content: "What are the latest developments in AI?" }],
      // @ts-ignore - Venice-specific parameter
      venice_parameters: {
        enable_web_search: "auto"
      }
    });

    console.log(completion.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import openai

    client = openai.OpenAI(
        api_key="your-api-key",
        base_url="https://api.venice.ai/api/v1"
    )

    response = client.chat.completions.create(
        model="zai-org-glm-5-1",
        messages=[{"role": "user", "content": "What are the latest developments in AI?"}],
            extra_body={
            "venice_parameters": {
                "enable_web_search": "auto"
            }
        }
    )

    print(response.choices[0].message.content)
    ```

    ```go Go theme={"system"}
    package main

    import (
        "context"
        "fmt"
        "os"
        "github.com/openai/openai-go"
    )

    func main() {
        client, err := openai.NewClient(os.Getenv("VENICE_API_KEY"))
        if err != nil {
            fmt.Printf("Error creating client: %v\n", err)
            return
        }
        
        client.BaseURL = "https://api.venice.ai/api/v1"
        
        // Note: Go client doesn't support venice_parameters directly
        // Use model suffix approach instead
        resp, err := client.CreateChatCompletion(
            context.Background(),
            openai.ChatCompletionRequest{
                Model: "zai-org-glm-5-1:enable_web_search=on&enable_web_citations=true",
                Messages: []openai.ChatCompletionMessage{
                    {
                        Role:    openai.ChatMessageRoleUser,
                        Content: "What are the latest developments in AI?",
                    },
                },
            },
        )
        
        if err != nil {
            fmt.Printf("Error: %v\n", err)
            return
        }
        
        fmt.Println(resp.Choices[0].Message.Content)
    }
    ```

    ```php PHP theme={"system"}
    <?php

    require_once 'vendor/autoload.php';

    use OpenAI\Client;

    $client = OpenAI::client('your-api-key');
    $client->setBaseUrl('https://api.venice.ai/api/v1');

    $response = $client->chat()->create([
        'model' => 'zai-org-glm-5-1:enable_web_search=on&enable_web_citations=true',
        'messages' => [
            [
                'role' => 'user',
                'content' => 'What are the latest developments in AI?'
            ]
        ]
    ]);

    echo $response->choices[0]->message->content;
    ```

    ```csharp C# theme={"system"}
    using OpenAI;

    var client = new OpenAIClient("your-api-key");
    client.BaseUrl = "https://api.venice.ai/api/v1";

    var chatCompletion = await client.GetChatCompletionsAsync(new ChatCompletionOptions
    {
        Model = "zai-org-glm-5-1:enable_web_search=on&enable_web_citations=true",
        Messages = { new ChatMessage(ChatRole.User, "What are the latest developments in AI?") }
    });

    Console.WriteLine(chatCompletion.Value.Choices[0].Message.Content);
    ```

    ```java Java theme={"system"}
    import com.openai.OpenAI;
    import com.openai.OpenAIHttpException;
    import com.openai.core.ApiError;
    import com.openai.types.chat.ChatCompletionRequest;
    import com.openai.types.chat.ChatCompletionResponse;
    import com.openai.types.chat.ChatMessage;

    public class Main {
        public static void main(String[] args) {
            OpenAI client = OpenAI.builder()
                .apiKey(System.getenv("VENICE_API_KEY"))
                .baseUrl("https://api.venice.ai/api/v1")
                .build();

            try {
                ChatCompletionResponse response = client.chatCompletions().create(
                    ChatCompletionRequest.builder()
                        .model("zai-org-glm-5-1:enable_web_search=on&enable_web_citations=true")
                        .messages(ChatMessage.of("What are the latest developments in AI?"))
                        .build()
                );
                
                System.out.println(response.choices().get(0).message().content());
            } catch (OpenAIHttpException e) {
                System.err.println("Error: " + e.getMessage());
            }
        }
    }
    ```

    ```bash Model Suffix theme={"system"}
    # Alternative approach: append parameters directly to model ID
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "zai-org-glm-5-1:enable_web_search=on&enable_web_citations=true",
        "messages": [{"role": "user", "content": "What are the latest developments in AI?"}]
      }'
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Reasoning Mode Code Samples">
  Advanced step-by-step reasoning with visible thinking process. Available on **reasoning models**: `qwen3-4b`, `deepseek-ai-DeepSeek-R1`. Shows detailed problem-solving steps in `<think>` tags.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "qwen3-4b",
        "messages": [{"role": "user", "content": "Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?"}],
        "venice_parameters": {
          "strip_thinking_response": false
        }
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const openai = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const completion = await openai.chat.completions.create({
      model: "qwen3-4b",
      messages: [{ role: "user", content: "Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?" }],
      // @ts-ignore - Venice-specific parameter
      venice_parameters: {
        strip_thinking_response: false
      }
    });

    console.log(completion.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import openai

    client = openai.OpenAI(
        api_key="your-api-key",
        base_url="https://api.venice.ai/api/v1"
    )

    response = client.chat.completions.create(
        model="qwen3-4b",
        messages=[{"role": "user", "content": "Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?"}],
        extra_body={
            "venice_parameters": {
                "strip_thinking_response": False
            }
        }
    )

    print(response.choices[0].message.content)
    ```

    ```go Go theme={"system"}
    package main

    import (
        "context"
        "fmt"
        "os"
        "github.com/openai/openai-go"
    )

    func main() {
        client, err := openai.NewClient(os.Getenv("VENICE_API_KEY"))
        if err != nil {
            fmt.Printf("Error creating client: %v\n", err)
            return
        }
        
        client.BaseURL = "https://api.venice.ai/api/v1"
        
        resp, err := client.CreateChatCompletion(
            context.Background(),
            openai.ChatCompletionRequest{
                Model: "qwen3-4b",
                Messages: []openai.ChatCompletionMessage{
                    {
                        Role:    openai.ChatMessageRoleUser,
                        Content: "Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?",
                    },
                },
            },
        )
        
        if err != nil {
            fmt.Printf("Error: %v\n", err)
            return
        }
        
        fmt.Println(resp.Choices[0].Message.Content)
    }
    ```

    ```php PHP theme={"system"}
    <?php

    require_once 'vendor/autoload.php';

    use OpenAI\Client;

    $client = OpenAI::client('your-api-key');
    $client->setBaseUrl('https://api.venice.ai/api/v1');

    $response = $client->chat()->create([
        'model' => 'qwen3-4b',
        'messages' => [
            [
                'role' => 'user',
                'content' => 'Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?'
            ]
        ]
    ]);

    echo $response->choices[0]->message->content;
    ```

    ```csharp C# theme={"system"}
    using OpenAI;

    var client = new OpenAIClient("your-api-key");
    client.BaseUrl = "https://api.venice.ai/api/v1";

    var chatCompletion = await client.GetChatCompletionsAsync(new ChatCompletionOptions
    {
        Model = "qwen3-4b",
        Messages = { new ChatMessage(ChatRole.User, "Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?") }
    });

    Console.WriteLine(chatCompletion.Value.Choices[0].Message.Content);
    ```

    ```java Java theme={"system"}
    import com.openai.OpenAI;
    import com.openai.OpenAIHttpException;
    import com.openai.core.ApiError;
    import com.openai.types.chat.ChatCompletionRequest;
    import com.openai.types.chat.ChatCompletionResponse;
    import com.openai.types.chat.ChatMessage;

    public class Main {
        public static void main(String[] args) {
            OpenAI client = OpenAI.builder()
                .apiKey(System.getenv("VENICE_API_KEY"))
                .baseUrl("https://api.venice.ai/api/v1")
                .build();

            try {
                ChatCompletionResponse response = client.chatCompletions().create(
                    ChatCompletionRequest.builder()
                        .model("qwen3-4b")
                        .messages(ChatMessage.of("Solve: If x + 2y = 10 and 3x - y = 5, what are x and y?"))
                        .build()
                );
                
                System.out.println(response.choices().get(0).message().content());
            } catch (OpenAIHttpException e) {
                System.err.println("Error: " + e.getMessage());
            }
        }
    }
    ```

    ```bash Model Suffix theme={"system"}
    # Alternative approach: append parameters directly to model ID
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "qwen3-4b:strip_thinking_response=true",
        "messages": [{"role": "user", "content": "Solve this math problem"}]
      }'
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Vision Processing Code Samples">
  Image understanding and multimodal analysis. Available on **vision models**: `qwen3-vl-235b-a22b`. Upload images via base64 data URIs or URLs for analysis, description, and reasoning.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "qwen3-vl-235b-a22b",
        "messages": [
          {
            "role": "user",
            "content": [
              {"type": "text", "text": "What do you see in this image?"},
              {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
            ]
          }
        ]
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const openai = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const completion = await openai.chat.completions.create({
      model: "qwen3-vl-235b-a22b",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What do you see in this image?" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
          ]
        }
      ]
    });

    console.log(completion.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import openai

    client = openai.OpenAI(
        api_key="your-api-key",
        base_url="https://api.venice.ai/api/v1"
    )

    response = client.chat.completions.create(
        model="qwen3-vl-235b-a22b",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What do you see in this image?"},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
                ]
            }
        ]
    )

    print(response.choices[0].message.content)
    ```

    ```go Go theme={"system"}
    package main

    import (
        "context"
        "fmt"
        "os"
        "github.com/openai/openai-go"
    )

    func main() {
        client, err := openai.NewClient(os.Getenv("VENICE_API_KEY"))
        if err != nil {
            fmt.Printf("Error creating client: %v\n", err)
            return
        }
        
        client.BaseURL = "https://api.venice.ai/api/v1"
        
        resp, err := client.CreateChatCompletion(
            context.Background(),
            openai.ChatCompletionRequest{
                Model: "qwen3-vl-235b-a22b",
                Messages: []openai.ChatCompletionMessage{
                    {
                        Role: openai.ChatMessageRoleUser,
                        Content: []openai.ChatCompletionContentPart{
                            {Type: "text", Text: "What do you see in this image?"},
                            {Type: "image_url", ImageURL: &openai.ChatCompletionContentPartImageURL{URL: "data:image/jpeg;base64,..."}},
                        },
                    },
                },
            },
        )
        
        if err != nil {
            fmt.Printf("Error: %v\n", err)
            return
        }
        
        fmt.Println(resp.Choices[0].Message.Content)
    }
    ```

    ```php PHP theme={"system"}
    <?php

    require_once 'vendor/autoload.php';

    use OpenAI\Client;

    $client = OpenAI::client('your-api-key');
    $client->setBaseUrl('https://api.venice.ai/api/v1');

    $response = $client->chat()->create([
        'model' => 'qwen3-vl-235b-a22b',
        'messages' => [
            [
                'role' => 'user',
                'content' => [
                    ['type' => 'text', 'text' => 'What do you see in this image?'],
                    ['type' => 'image_url', 'image_url' => ['url' => 'data:image/jpeg;base64,...']]
                ]
            ]
        ]
    ]);

    echo $response->choices[0]->message->content;
    ```

    ```csharp C# theme={"system"}
    using OpenAI;

    var client = new OpenAIClient("your-api-key");
    client.BaseUrl = "https://api.venice.ai/api/v1";

    var chatCompletion = await client.GetChatCompletionsAsync(new ChatCompletionOptions
    {
        Model = "qwen3-vl-235b-a22b",
        Messages = { 
            new ChatMessage(ChatRole.User, [
                ChatMessageContentPart.CreateTextPart("What do you see in this image?"),
                ChatMessageContentPart.CreateImagePart(new Uri("data:image/jpeg;base64,..."))
            ])
        }
    });

    Console.WriteLine(chatCompletion.Value.Choices[0].Message.Content);
    ```

    ```java Java theme={"system"}
    import com.openai.OpenAI;
    import com.openai.OpenAIHttpException;
    import com.openai.core.ApiError;
    import com.openai.types.chat.*;

    public class Main {
        public static void main(String[] args) {
            OpenAI client = OpenAI.builder()
                .apiKey(System.getenv("VENICE_API_KEY"))
                .baseUrl("https://api.venice.ai/api/v1")
                .build();

            try {
                ChatCompletionResponse response = client.chatCompletions().create(
                    ChatCompletionRequest.builder()
                        .model("qwen3-vl-235b-a22b")
                        .messages(ChatMessage.builder()
                            .role(ChatMessage.Role.USER)
                            .content(ChatMessage.Content.ofMultiple(
                                ChatMessage.ContentPart.text("What do you see in this image?"),
                                ChatMessage.ContentPart.imageUrl("data:image/jpeg;base64,...")
                            ))
                            .build())
                        .build()
                );
                
                System.out.println(response.choices().get(0).message().content());
            } catch (OpenAIHttpException e) {
                System.err.println("Error: " + e.getMessage());
            }
        }
    }
    ```

    ```bash Model Suffix theme={"system"}
    # Alternative approach: append parameters directly to model ID
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "mistral-31-24b:enable_web_search=auto",
        "messages": [
          {
            "role": "user",
            "content": [
              {"type": "text", "text": "What do you see in this image and find similar examples online?"},
              {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
            ]
          }
        ]
      }'
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Tool Calling Code Samples">
  Tool use and external API integration. Available on **function calling models**: `zai-org-glm-5-1`, `qwen3-4b`, `mistral-31-24b`, `llama-3.2-3b`, `zai-org-glm-5-1`. Define tools for the model to call external APIs, databases, or custom functions.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "zai-org-glm-5-1",
        "messages": [{"role": "user", "content": "What is the weather like in New York?"}],
        "tools": [
          {
            "type": "function",
            "function": {
              "name": "get_weather",
              "description": "Get current weather for a location",
              "parameters": {
                "type": "object",
                "properties": {
                  "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
              }
            }
          }
        ]
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const openai = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const completion = await openai.chat.completions.create({
      model: "zai-org-glm-5-1",
      messages: [{ role: "user", content: "What is the weather like in New York?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" }
              },
              required: ["location"]
            }
          }
        }
      ]
    });

    console.log(completion.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import openai

    client = openai.OpenAI(
        api_key="your-api-key",
        base_url="https://api.venice.ai/api/v1"
    )

    response = client.chat.completions.create(
        model="zai-org-glm-5-1",
        messages=[{"role": "user", "content": "What is the weather like in New York?"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get current weather for a location",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City name"}
                        },
                        "required": ["location"]
                    }
                }
            }
        ]
    )

    print(response.choices[0].message.content)
    ```

    ```go Go theme={"system"}
    package main

    import (
        "context"
        "fmt"
        "os"
        "github.com/openai/openai-go"
    )

    func main() {
        client, err := openai.NewClient(os.Getenv("VENICE_API_KEY"))
        if err != nil {
            fmt.Printf("Error creating client: %v\n", err)
            return
        }
        
        client.BaseURL = "https://api.venice.ai/api/v1"
        
        resp, err := client.CreateChatCompletion(
            context.Background(),
            openai.ChatCompletionRequest{
                Model: "zai-org-glm-5-1",
                Messages: []openai.ChatCompletionMessage{
                    {
                        Role:    openai.ChatMessageRoleUser,
                        Content: "What is the weather like in New York?",
                    },
                },
                Tools: []openai.ChatCompletionTool{
                    {
                        Type: openai.ChatCompletionToolTypeFunction,
                        Function: &openai.FunctionDefinition{
                            Name:        "get_weather",
                            Description: "Get current weather for a location",
                            Parameters: map[string]interface{}{
                                "type": "object",
                                "properties": map[string]interface{}{
                                    "location": map[string]interface{}{
                                        "type":        "string",
                                        "description": "City name",
                                    },
                                },
                                "required": []string{"location"},
                            },
                        },
                    },
                },
            },
        )
        
        if err != nil {
            fmt.Printf("Error: %v\n", err)
            return
        }
        
        fmt.Println(resp.Choices[0].Message.Content)
    }
    ```

    ```php PHP theme={"system"}
    <?php

    require_once 'vendor/autoload.php';

    use OpenAI\Client;

    $client = OpenAI::client('your-api-key');
    $client->setBaseUrl('https://api.venice.ai/api/v1');

    $response = $client->chat()->create([
        'model' => 'zai-org-glm-5-1',
        'messages' => [
            [
                'role' => 'user',
                'content' => 'What is the weather like in New York?'
            ]
        ],
        'tools' => [
            [
                'type' => 'function',
                'function' => [
                    'name' => 'get_weather',
                    'description' => 'Get current weather for a location',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'location' => [
                                'type' => 'string',
                                'description' => 'City name'
                            ]
                        ],
                        'required' => ['location']
                    ]
                ]
            ]
        ]
    ]);

    echo $response->choices[0]->message->content;
    ```

    ```csharp C# theme={"system"}
    using OpenAI;

    var client = new OpenAIClient("your-api-key");
    client.BaseUrl = "https://api.venice.ai/api/v1";

    var chatCompletion = await client.GetChatCompletionsAsync(new ChatCompletionOptions
    {
        Model = "zai-org-glm-5-1",
        Messages = { new ChatMessage(ChatRole.User, "What is the weather like in New York?") },
        Tools = {
            ChatTool.CreateFunctionTool(
                functionName: "get_weather",
                functionDescription: "Get current weather for a location",
                functionParameters: BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City name"
                        }
                    },
                    "required": ["location"]
                }
                """)
            )
        }
    });

    Console.WriteLine(chatCompletion.Value.Choices[0].Message.Content);
    ```

    ```java Java theme={"system"}
    import com.openai.OpenAI;
    import com.openai.OpenAIHttpException;
    import com.openai.core.ApiError;
    import com.openai.types.chat.*;

    public class Main {
        public static void main(String[] args) {
            OpenAI client = OpenAI.builder()
                .apiKey(System.getenv("VENICE_API_KEY"))
                .baseUrl("https://api.venice.ai/api/v1")
                .build();

            try {
                ChatCompletionResponse response = client.chatCompletions().create(
                    ChatCompletionRequest.builder()
                        .model("zai-org-glm-5-1")
                        .messages(ChatMessage.of("What is the weather like in New York?"))
                        .tools(ChatCompletionTool.builder()
                            .type(ChatCompletionToolType.FUNCTION)
                            .function(FunctionDefinition.builder()
                                .name("get_weather")
                                .description("Get current weather for a location")
                                .parameters(FunctionParameters.builder()
                                    .putProperty("location", FunctionParameters.Property.builder()
                                        .type("string")
                                        .description("City name")
                                        .build())
                                    .required("location")
                                    .build())
                                .build())
                            .build())
                        .build()
                );
                
                System.out.println(response.choices().get(0).message().content());
            } catch (OpenAIHttpException e) {
                System.err.println("Error: " + e.getMessage());
            }
        }
    }
    ```

    ```bash Model Suffix theme={"system"}
    # Alternative approach: append parameters directly to model ID
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "zai-org-glm-5-1:enable_web_search=auto",
        "messages": [{"role": "user", "content": "What is the weather like in New York?"}],
        "tools": [
          {
            "type": "function",
            "function": {
              "name": "get_weather",
              "description": "Get current weather for a location",
              "parameters": {
                "type": "object",
                "properties": {
                  "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
              }
            }
          }
        ]
      }'
    ```
  </CodeGroup>
</Accordion>

### Available Parameters

| Parameter                      | Options             | Description                             |
| ------------------------------ | ------------------- | --------------------------------------- |
| `enable_web_search`            | `off`, `on`, `auto` | Enable real-time web search             |
| `enable_web_scraping`          | `true`, `false`     | Scrape URLs detected in user message    |
| `enable_web_citations`         | `true`, `false`     | Include citations in web search results |
| `strip_thinking_response`      | `true`, `false`     | Hide reasoning steps from response      |
| `disable_thinking`             | `true`, `false`     | Disable reasoning mode entirely         |
| `include_venice_system_prompt` | `true`, `false`     | Include Venice system prompts           |
| `character_slug`               | string              | Use a specific AI character             |

[View all parameters →](/api-reference/api-spec#venice-parameters)

## Pricing Options

<CardGroup>
  <Card title="Pro subscription" href="https://venice.ai/chat" icon="star">
    **\$10 in free credits**

    One‑time credit when you upgrade
  </Card>

  <Card title="Buy DIEM" href="https://venice.ai/token" icon="coins">
    **Permanent access**

    Stake DIEM for daily compute allocation
  </Card>

  <Card title="Pay-as-you-go (USD)" href="/overview/pricing" icon="credit-card">
    **USD payments**

    Fund your account in USD and pay per usage
  </Card>
</CardGroup>

## Start building today

Get your API key and make your first request.

<CardGroup>
  <Card title="Getting Started" href="/overview/getting-started" icon="rocket">
    Step-by-step guide to your first API call
  </Card>

  <Card title="API Reference" href="/api-reference" icon="rectangle-code">
    Complete API documentation and endpoints
  </Card>

  <Card title="Postman Collection" href="/overview/guides/postman" icon="play">
    Ready-to-use API examples and testing
  </Card>

  <Card title="AI Agents" href="/overview/guides/ai-agents" icon="robot">
    Build with Eliza and other agent frameworks
  </Card>
</CardGroup>

<Warning>
  Venice's API is rapidly evolving. Join our [Discord](https://discord.gg/askvenice) to provide feedback and request new features. Your input shapes our development roadmap.
</Warning>

***

These docs are open source and can be contributed to on [Github](https://github.com/veniceai/api-docs). For additional guidance, see our blog post: ["How to use Venice API"](https://venice.ai/blog/how-to-use-venice-api)


# Beta Models
Source: https://docs.venice.ai/overview/beta-models

Beta models available for testing and evaluation on the Venice API

We sometimes release models in beta to gather feedback and confirm their performance before a full production rollout. Beta models are available to all users but are **not recommended for production use**.

Beta status does not guarantee promotion to production. A beta model may be removed if it is too costly to run, performs poorly at scale, or raises safety concerns. Beta models can change without notice and may have limited documentation or support. Models that prove stable, broadly useful, and aligned with our standards are promoted to general availability.

## Important Considerations

When using beta models, keep in mind:

* May be changed or removed at any time without the standard deprecation notice period
* Not suitable for production applications or critical workflows
* May have inconsistent performance, availability, or behavior
* Limited or no migration support if removed
* Best used for testing, evaluation, and experimental projects

For production applications, we recommend using the stable models from our [main model lineup](/models/overview).

## Current Beta Models

The following models are currently available in beta.

<div />

### Checking Beta Status via the API

You can check if a model is in beta by calling the [List Models](/api-reference/endpoint/models/list) endpoint. Beta models include a `betaModel` field set to `true` in their `model_spec`:

```json theme={"system"}
{
  "id": "some-beta-model",
  "model_spec": {
    "name": "Some Beta Model",
    "betaModel": true,
    "privacy": "private"
  },
  "type": "text",
  "object": "model",
  "owned_by": "venice.ai"
}
```

You can check `if (model.model_spec.betaModel)` to identify beta models and warn users or handle them differently in your application.

## Join the Alpha Testing Program

Want to help shape Venice's future models and features? Join our alpha testing program to get early access to new models before they're released publicly, provide feedback that influences development, and help us validate performance at scale.

[Learn how to join the alpha testing group](https://venice.ai/faqs#how-do-i-join-the-beta-testing-group)


# Deprecations
Source: https://docs.venice.ai/overview/deprecations

Model inclusion and lifecycle policy and deprecations for the Venice API

The Venice API exists to give developers unrestricted private access to production-grade models free from hidden filters or black-box decisions.

As models improve, we occasionally retire older ones in favor of smarter, faster, or more capable alternatives. We design these transitions to be predictable and low‑friction.

## Model Deprecations

We know deprecations can be disruptive. That’s why we aim to deprecate only when necessary, and we design features like traits and Venice-branded models to minimize disruption.

We may deprecate a model when:

* A newer model offers a clear improvement for the same use case
* The model no longer meets our standards for performance or reliability
* It sees consistently low usage, and continuing to support it would fragment the experience for everyone else

## Deprecation Process

When a model meets deprecation criteria, we announce the change with 30–60 days' notice. Deprecation notices are published via the [changelog](https://featurebase.venice.ai/changelog) and our [Discord server](https://discord.gg/askvenice). When you call a deprecated model during the notice period, the API response will include a deprecation warning.

During the notice period, the model remains available, though in some cases we may reduce infrastructure capacity. We always provide a recommended replacement, and when needed, offer migration guidance to help the transition.

After the sunset date, requests to the model will automatically route to a model of similar processing power at the same or lower price. If routing is not possible for technical or safety reasons, the API will return a 410 Gone response. If a deprecated model was selected via a trait (such as `default_code`, `default_vision`, or `fastest`) that trait will be reassigned to a compatible replacement.

We never remove models silently or alter behavior without versioning. You’ll always know what’s running and how to prepare for what’s next.

<Note>
  Performance-only upgrades: We may roll out improvements that preserve model behavior while improving performance, latency, or cost efficiency. These updates are backward-compatible and require no customer action.
</Note>

See the [Model Deprecation Tracker](#model-deprecation-tracker) below. For earlier announcements, consult the [changelog](https://featurebase.venice.ai/changelog) and our [Discord server](https://discord.gg/askvenice).

## How models are selected for the Venice API

We carefully select which models to make available based on performance, reliability, and real-world developer needs. To be included, a model must demonstrate strong performance, behave consistently under OpenAI-compatible endpoints, and offer a clear improvement over at least one of the models we already support.

Models we're evaluating may first be released in [beta](/overview/beta-models) to gather feedback and validate performance at scale.

We don’t expose models that are redundant, unproven, or not ready for consistent production use. Our goal is to keep the Venice API clean, capable, and optimized for what developers actually build.

Learn more in [Model Deprecations](/overview/deprecations#model-deprecations) and <a href="/overview/models">Current Model List</a>.

## Versioning and Aliases

All Venice models are identified by a unique, permanent ID. For example:

`venice-uncensored`
`zai-org-glm-4.7`
`llama-3.3-70b`
`qwen3-vl-235b-a22b`

Model IDs are stable. If there's a breaking change, we will release a new model ID (for example, add a version like v2). If there are no breaking changes, we may update the existing model and will communicate significant changes.

To provide flexibility, Venice also maintains symbolic aliases, implemented through traits, that point to the recommended default model for a given task:

<div />

Traits offer a stable abstraction for selecting models while giving Venice the flexibility to improve the underlying implementation. Developers who prefer automatic access to the latest recommended models can rely on trait-based aliases.

For applications that require strict consistency and predictable behavior, we recommend referencing fixed model IDs.

## Feedback

You can submit your feedback or request through our [Featurebase portal](https://featurebase.venice.ai). We maintain a public [changelog](https://featurebase.venice.ai/changelog), roadmap tracker, and transparent rationale for adding, upgrading, or removing models, and we encourage continuous community participation.

## Model Deprecation Tracker

The following models are scheduled for deprecation or have been recently deprecated. We recommend migrating to suggested replacements before the removal date. Models remain listed for 30 days after their removal date.

<div />

### Checking Deprecation Status via the API

You can check if a model is scheduled for retirement by calling the [List Models](/api-reference/endpoint/models/list) endpoint. Models with a retirement date include a `deprecation` object in their `model_spec`:

```json theme={"system"}
{
  "id": "some-model-id",
  "model_spec": {
    "name": "Some Model",
    "privacy": "private",
    "deprecation": {
      "date": "2025-03-01T00:00:00.000Z"
    }
  },
  "type": "text",
  "object": "model",
  "owned_by": "venice.ai"
}
```

The `deprecation` object only appears when a model is scheduled for retirement. You can check `if (model.model_spec.deprecation)` to know if a model is being retired, and use the ISO 8601 date to warn users or plan migrations.


# Getting Started
Source: https://docs.venice.ai/overview/getting-started



Get up and running with the Venice API in minutes. Generate an API key, make your first request, and start building.

## Quickstart

<Steps>
  <Step title="Get your API key">
    Head to your [Venice API Settings](https://venice.ai/settings/api) and generate a new API key.

    For a detailed walkthrough with screenshots, check out the [API Key guide](/overview/guides/generating-api-key).
  </Step>

  <Step title="Set up your API key">
    Add your API key to your environment. You can export it in your shell:

    ```bash theme={"system"}
    export VENICE_API_KEY='your-api-key-here'
    ```

    Or add it to a `.env` file in your project:

    ```bash theme={"system"}
    VENICE_API_KEY=your-api-key-here
    ```
  </Step>

  <Step title="Install the SDK">
    Venice is OpenAI-compatible, so you can use the OpenAI SDK. If you prefer to use cURL or raw HTTP requests, you can skip this step.

    <CodeGroup>
      ```bash Python theme={"system"}
      pip install openai
      ```

      ```bash Node.js theme={"system"}
      npm install openai
      ```
    </CodeGroup>
  </Step>

  <Step title="Send your first request">
    <CodeGroup>
      ```python Python theme={"system"}
      import os
      from openai import OpenAI

      client = OpenAI(
          api_key=os.getenv("VENICE_API_KEY"),
          base_url="https://api.venice.ai/api/v1"
      )

      completion = client.chat.completions.create(
          model="zai-org-glm-5",
          messages=[
              {"role": "system", "content": "You are a helpful AI assistant"},
              {"role": "user", "content": "Why is privacy important?"}
          ]
      )

      print(completion.choices[0].message.content)
      ```

      ```javascript Node.js theme={"system"}
      import OpenAI from 'openai';

      const client = new OpenAI({
          apiKey: process.env.VENICE_API_KEY,
          baseURL: 'https://api.venice.ai/api/v1'
      });

      const completion = await client.chat.completions.create({
          model: 'zai-org-glm-5',
          messages: [
              { role: 'system', content: 'You are a helpful AI assistant' },
              { role: 'user', content: 'Why is privacy important?' }
          ]
      });

      console.log(completion.choices[0].message.content);
      ```

      ```bash cURL theme={"system"}
      curl https://api.venice.ai/api/v1/chat/completions \
        -H "Authorization: Bearer $VENICE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "model": "zai-org-glm-5",
          "messages": [
            {"role": "system", "content": "You are a helpful AI assistant"},
            {"role": "user", "content": "Why is privacy important?"}
          ]
        }'
      ```
    </CodeGroup>

    **Message roles:**

    * `system` - Instructions for how the model should behave
    * `user` - Your prompts or questions
    * `assistant` - Previous model responses (for multi-turn conversations)
    * `tool` - Function calling results (when using tools)
  </Step>

  <Step title="Choose your model (optional)">
    Venice has multiple models for different use cases. Popular choices:

    * `zai-org-glm-5` - Default model for most use cases
    * `kimi-k2-5` - Strong reasoning for more complex tasks
    * `qwen3-vl-235b-a22b` - Vision support
    * `venice-uncensored` - No content filtering

    <Card title="View All Models" icon="database" href="/overview/models">
      Browse the complete list of models with pricing, capabilities, and context limits
    </Card>
  </Step>

  <Step title="Use Venice Parameters">
    You can choose to enable Venice-specific features like web search using `venice_parameters`:

    <CodeGroup>
      ```python Python theme={"system"}
      import os
      from openai import OpenAI

      client = OpenAI(
          api_key=os.environ.get("VENICE_API_KEY"),
          base_url="https://api.venice.ai/api/v1"
      )

      completion = client.chat.completions.create(
          model="zai-org-glm-5",
          messages=[
              {"role": "user", "content": "What are the latest developments in AI?"}
          ],
          extra_body={
              "venice_parameters": {
                  "enable_web_search": "auto",
                  "include_venice_system_prompt": True
              }
          }
      )

      print(completion.choices[0].message.content)
      ```

      ```javascript Node.js theme={"system"}
      import OpenAI from 'openai';

      const client = new OpenAI({
          apiKey: process.env.VENICE_API_KEY,
          baseURL: 'https://api.venice.ai/api/v1'
      });

      const completion = await client.chat.completions.create({
          model: 'zai-org-glm-5',
          messages: [
              { role: 'user', content: 'What are the latest developments in AI?' }
          ],
          venice_parameters: {
              enable_web_search: 'auto',
              include_venice_system_prompt: true
          }
      });

      console.log(completion.choices[0].message.content);
      ```

      ```bash cURL theme={"system"}
      curl https://api.venice.ai/api/v1/chat/completions \
        -H "Authorization: Bearer $VENICE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "model": "zai-org-glm-5",
          "messages": [
            {"role": "user", "content": "What are the latest developments in AI?"}
          ],
          "venice_parameters": {
            "enable_web_search": "auto",
            "include_venice_system_prompt": true
          }
        }'
      ```
    </CodeGroup>

    See all [available parameters](https://docs.venice.ai/api-reference/api-spec#venice-parameters).
  </Step>

  <Step title="Enable streaming (optional)">
    Stream responses in real-time using `stream=True`:

    <CodeGroup>
      ```python Python theme={"system"}
      import os
      from openai import OpenAI

      client = OpenAI(
          api_key=os.environ.get("VENICE_API_KEY"),
          base_url="https://api.venice.ai/api/v1"
      )

      stream = client.chat.completions.create(
          model="zai-org-glm-5",
          messages=[{"role": "user", "content": "Write a short story about AI"}],
          stream=True
      )

      for chunk in stream:
          if chunk.choices and chunk.choices[0].delta.content is not None:
              print(chunk.choices[0].delta.content, end="")
      ```

      ```javascript Node.js theme={"system"}
      import OpenAI from 'openai';

      const client = new OpenAI({
          apiKey: process.env.VENICE_API_KEY,
          baseURL: 'https://api.venice.ai/api/v1'
      });

      const stream = await client.chat.completions.create({
          model: 'zai-org-glm-5',
          messages: [{ role: 'user', content: 'Write a short story about AI' }],
          stream: true
      });

      for await (const chunk of stream) {
          if (chunk.choices && chunk.choices[0]?.delta?.content) {
              process.stdout.write(chunk.choices[0].delta.content);
          }
      }
      ```

      ```bash cURL theme={"system"}
      curl https://api.venice.ai/api/v1/chat/completions \
        -H "Authorization: Bearer $VENICE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "model": "zai-org-glm-5",
          "messages": [
            {"role": "user", "content": "Write a short story about AI"}
          ],
          "stream": true
        }'
      ```
    </CodeGroup>
  </Step>

  <Step title="Customize response behavior (optional)">
    Control how the model responds with parameters like temperature, max tokens, and more:

    <CodeGroup>
      ```python Python theme={"system"}
      import os
      from openai import OpenAI

      client = OpenAI(
          api_key=os.environ.get("VENICE_API_KEY"),
          base_url="https://api.venice.ai/api/v1"
      )

      completion = client.chat.completions.create(
          model="zai-org-glm-5",
          messages=[
              {"role": "system", "content": "You are a creative storyteller"},
              {"role": "user", "content": "Tell me a creative story"}
          ],
          temperature=0.8,
          max_tokens=500,
          top_p=0.9,
          frequency_penalty=0.5,
          presence_penalty=0.5,
          extra_body={
              "venice_parameters": {
                  "include_venice_system_prompt": False
              }
          }
      )

      print(completion.choices[0].message.content)
      ```

      ```javascript Node.js theme={"system"}
      import OpenAI from 'openai';

      const client = new OpenAI({
          apiKey: process.env.VENICE_API_KEY,
          baseURL: 'https://api.venice.ai/api/v1'
      });

      const completion = await client.chat.completions.create({
          model: 'zai-org-glm-5',
          messages: [
              { role: 'system', content: 'You are a creative storyteller' },
              { role: 'user', content: 'Tell me a creative story' }
          ],
          temperature: 0.8,
          max_tokens: 500,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
          venice_parameters: {
              include_venice_system_prompt: false
          }
      });

      console.log(completion.choices[0].message.content);
      ```

      ```bash cURL theme={"system"}
      curl https://api.venice.ai/api/v1/chat/completions \
        -H "Authorization: Bearer $VENICE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "model": "zai-org-glm-5",
          "messages": [
            {"role": "system", "content": "You are a creative storyteller"},
            {"role": "user", "content": "Tell me a creative story"}
          ],
          "temperature": 0.8,
          "max_tokens": 500,
          "top_p": 0.9,
          "frequency_penalty": 0.5,
          "presence_penalty": 0.5,
          "stream": false,
          "venice_parameters": {
            "include_venice_system_prompt": false
          }
        }'
      ```
    </CodeGroup>

    Check out the [Chat Completions docs](/api-reference/endpoint/chat/completions) for more information on all supported parameters.
  </Step>
</Steps>

***

## More Capabilities

### Image Generation

Create images from text prompts using diffusion models:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests

  url = "https://api.venice.ai/api/v1/image/generate"

  payload = {
      "model": "venice-sd35",
      "prompt": "A cyberpunk city with neon lights and rain",
      "width": 1024,
      "height": 1024,
      "format": "webp"
  }

  headers = {
      "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
      "Content-Type": "application/json"
  }

  response = requests.post(url, json=payload, headers=headers)

  print(response.json())
  ```

  ```javascript Node.js theme={"system"}
  const url = 'https://api.venice.ai/api/v1/image/generate';

  const options = {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          model: 'venice-sd35',
          prompt: 'A cyberpunk city with neon lights and rain',
          width: 1024,
          height: 1024,
          format: 'webp'
      })
  };

  try {
      const response = await fetch(url, options);
      const data = await response.json();
      console.log(data);
  } catch (error) {
      console.error(error);
  }
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/image/generate \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "venice-sd35",
      "prompt": "A cyberpunk city with neon lights and rain",
      "width": 1024,
      "height": 1024
    }'
  ```
</CodeGroup>

**Note:** The response returns base64-encoded images in the `images` array. Decode the base64 string to save or display the image.

**Popular Image Models:**

* `qwen-image` - Highest quality image generation
* `venice-sd35` - Default choice, works with all features
* `hidream` - Fast generation for production use

<Card title="View All Image Models" icon="image" href="/overview/models#image-models">
  See all available image models with pricing and capabilities
</Card>

For more advanced parameter options like `cfg_scale`, `negative_prompt`, `style_preset`, `seed`, `variants`, and more, check out the [Images API Reference](/api-reference/endpoint/image/generate).

### Image Editing

Modify existing images with AI-powered inpainting using the Qwen-Image model:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests
  import base64

  url = "https://api.venice.ai/api/v1/image/edit"

  with open("image.jpg", "rb") as f:
      image_base64 = base64.b64encode(f.read()).decode('utf-8')

  payload = {
      "prompt": "Colorize",
      "image": image_base64
  }

  headers = {
      "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
      "Content-Type": "application/json"
  }

  response = requests.post(url, json=payload, headers=headers)

  with open("edited_image.png", "wb") as f:
      f.write(response.content)
  ```

  ```javascript Node.js theme={"system"}
  import fs from 'fs';

  const imageBuffer = fs.readFileSync('image.jpg');
  const imageBase64 = imageBuffer.toString('base64');

  const options = {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          prompt: 'Colorize',
          image: imageBase64
      })
  };

  const response = await fetch('https://api.venice.ai/api/v1/image/edit', options);
  const imageData = await response.arrayBuffer();
  fs.writeFileSync('edited_image.png', Buffer.from(imageData));
  ```

  ```bash cURL theme={"system"}
  curl --request POST \
    --url https://api.venice.ai/api/v1/image/edit \
    --header "Authorization: Bearer $VENICE_API_KEY" \
    --header "Content-Type: application/json" \
    --data '{
      "prompt": "Colorize",
      "image": "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAAIGNIUk0A..."
    }'
  ```
</CodeGroup>

**Note:** The image editor uses the Qwen-Image model and is an experimental endpoint. Send the input image as a base64-encoded string, and the API returns the edited image as binary data.

See the [Image Edit API](/api-reference/endpoint/image/edit) for all parameters.

### Image Upscaling

Enhance and upscale images to higher resolutions:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests
  import base64

  url = "https://api.venice.ai/api/v1/image/upscale"

  with open("image.jpg", "rb") as f:
      image_base64 = base64.b64encode(f.read()).decode('utf-8')

  payload = {
      "image": image_base64,
      "scale": 2
  }

  headers = {
      "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
      "Content-Type": "application/json"
  }

  response = requests.post(url, json=payload, headers=headers)

  with open("upscaled_image.png", "wb") as f:
      f.write(response.content)
  ```

  ```javascript Node.js theme={"system"}
  import fs from 'fs';

  const imageBuffer = fs.readFileSync('image.jpg');
  const imageBase64 = imageBuffer.toString('base64');

  const options = {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          image: imageBase64,
          scale: 2
      })
  };

  const response = await fetch('https://api.venice.ai/api/v1/image/upscale', options);
  const imageData = await response.arrayBuffer();
  fs.writeFileSync('upscaled_image.png', Buffer.from(imageData));
  ```

  ```bash cURL theme={"system"}
  curl --request POST \
    --url https://api.venice.ai/api/v1/image/upscale \
    --header "Authorization: Bearer $VENICE_API_KEY" \
    --header "Content-Type: application/json" \
    --data '{
      "image": "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAAIGNIUk0A...",
      "scale": 2
    }'
  ```
</CodeGroup>

**Note:** Send the input image as a base64-encoded string, and the API returns the upscaled image as binary data.

See the [Image Upscale API](/api-reference/endpoint/image/upscale) for all parameters.

### Text-to-Speech

Convert text to audio with 50+ multilingual voices:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests

  response = requests.post(
      "https://api.venice.ai/api/v1/audio/speech",
      headers={
          "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
          "Content-Type": "application/json"
      },
      json={
          "input": "Hello, welcome to Venice Voice.",
          "model": "tts-kokoro",
          "voice": "af_sky"
      }
  )

  with open("speech.mp3", "wb") as f:
      f.write(response.content)
  ```

  ```javascript Node.js theme={"system"}
  import fs from 'fs';

  const response = await fetch('https://api.venice.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          input: 'Hello, welcome to Venice Voice.',
          model: 'tts-kokoro',
          voice: 'af_sky'
      })
  });

  const audioBuffer = await response.arrayBuffer();
  fs.writeFileSync('speech.mp3', Buffer.from(audioBuffer));
  ```

  ```bash cURL theme={"system"}
  curl --request POST \
    --url https://api.venice.ai/api/v1/audio/speech \
    --header "Authorization: Bearer $VENICE_API_KEY" \
    --header "Content-Type: application/json" \
    --data '{
      "input": "Hello, welcome to Venice Voice.",
      "model": "tts-kokoro",
      "voice": "af_sky"
    }' \
    --output speech.mp3
  ```
</CodeGroup>

The `tts-kokoro` model supports 50+ multilingual voices including `af_sky`, `af_nova`, `am_liam`, `bf_emma`, `zf_xiaobei`, and `jm_kumo`.

See the [TTS API](/api-reference/endpoint/audio/speech) for all voice options.

### Speech-to-Text

Transcribe audio files to text:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests

  url = "https://api.venice.ai/api/v1/audio/transcriptions"

  with open("audio.mp3", "rb") as f:
      response = requests.post(
          url,
          headers={"Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}"},
          files={"file": f},
          data={
              "model": "nvidia/parakeet-tdt-0.6b-v3",
              "response_format": "json"
          }
      )

  print(response.json())
  ```

  ```javascript Node.js theme={"system"}
  import fs from 'fs';
  import FormData from 'form-data';

  const form = new FormData();
  form.append('file', fs.createReadStream('audio.mp3'));
  form.append('model', 'nvidia/parakeet-tdt-0.6b-v3');
  form.append('response_format', 'json');

  const response = await fetch('https://api.venice.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          ...form.getHeaders()
      },
      body: form
  });

  const data = await response.json();
  console.log(data);
  ```

  ```bash cURL theme={"system"}
  curl --request POST \
    --url https://api.venice.ai/api/v1/audio/transcriptions \
    --header "Authorization: Bearer $VENICE_API_KEY" \
    --form file=@audio.mp3 \
    --form model=nvidia/parakeet-tdt-0.6b-v3 \
    --form response_format=json
  ```
</CodeGroup>

Supported formats: WAV, FLAC, MP3, M4A, AAC, MP4. Enable `timestamps=true` to get word-level timing data.

See the [Transcriptions API](/api-reference/endpoint/audio/transcriptions) for all options.

### Embeddings

Generate vector embeddings for semantic search, RAG, and recommendations:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import requests

  url = "https://api.venice.ai/api/v1/embeddings"

  payload = {
      "model": "text-embedding-bge-m3",
      "input": "Privacy-first AI infrastructure for semantic search",
      "encoding_format": "float"
  }

  headers = {
      "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
      "Content-Type": "application/json"
  }

  response = requests.post(url, json=payload, headers=headers)

  print(response.json())
  ```

  ```javascript Node.js theme={"system"}
  const url = 'https://api.venice.ai/api/v1/embeddings';

  const options = {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          model: 'text-embedding-bge-m3',
          input: 'Privacy-first AI infrastructure for semantic search',
          encoding_format: 'float'
      })
  };

  try {
      const response = await fetch(url, options);
      const data = await response.json();
      console.log(data);
  } catch (error) {
      console.error(error);
  }
  ```

  ```bash cURL theme={"system"}
  curl --request POST \
    --url https://api.venice.ai/api/v1/embeddings \
    --header "Authorization: Bearer $VENICE_API_KEY" \
    --header "Content-Type: application/json" \
    --data '{
      "model": "text-embedding-bge-m3",
      "input": "Privacy-first AI infrastructure for semantic search",
      "encoding_format": "float"
    }'
  ```
</CodeGroup>

See the [Embeddings API](/api-reference/endpoint/embeddings/generate) for batch processing and advanced options.

### Vision (Multimodal)

Analyze images alongside text using vision-capable models like `qwen3-vl-235b-a22b`:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  from openai import OpenAI

  client = OpenAI(
      api_key=os.getenv("VENICE_API_KEY"),
      base_url="https://api.venice.ai/api/v1"
  )

  response = client.chat.completions.create(
      model="qwen3-vl-235b-a22b",
      messages=[
          {
              "role": "user",
              "content": [
                  {"type": "text", "text": "What is in this image?"},
                  {
                      "type": "image_url",
                      "image_url": {"url": "https://www.gstatic.com/webp/gallery/1.jpg"}
                  }
              ]
          }
      ]
  )

  print(response.choices[0].message.content)
  ```

  ```javascript Node.js theme={"system"}
  import OpenAI from 'openai';

  const client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY,
      baseURL: 'https://api.venice.ai/api/v1'
  });

  const response = await client.chat.completions.create({
      model: 'qwen3-vl-235b-a22b',
      messages: [
          {
              role: 'user',
              content: [
                  { type: 'text', text: 'What is in this image?' },
                  {
                      type: 'image_url',
                      image_url: { url: 'https://www.gstatic.com/webp/gallery/1.jpg' }
                  }
              ]
          }
      ]
  });

  console.log(response.choices[0].message.content);
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen3-vl-235b-a22b",
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "What is in this image?"
            },
            {
              "type": "image_url",
              "image_url": {
                "url": "https://www.gstatic.com/webp/gallery/1.jpg"
              }
            }
          ]
        }
      ]
    }'
  ```
</CodeGroup>

### Function Calling

Define functions that models can call to interact with external tools and APIs:

<CodeGroup>
  ```python Python theme={"system"}
  import os
  from openai import OpenAI

  client = OpenAI(
      api_key=os.getenv("VENICE_API_KEY"),
      base_url="https://api.venice.ai/api/v1"
  )

  tools = [
      {
          "type": "function",
          "function": {
              "name": "get_weather",
              "description": "Get the current weather in a location",
              "parameters": {
                  "type": "object",
                  "properties": {
                      "location": {
                          "type": "string",
                          "description": "The city and state"
                      }
                  },
                  "required": ["location"]
              }
          }
      }
  ]

  response = client.chat.completions.create(
      model="zai-org-glm-5",
      messages=[{"role": "user", "content": "What's the weather in San Francisco?"}],
      tools=tools
  )

  print(response.choices[0].message)
  ```

  ```javascript Node.js theme={"system"}
  import OpenAI from 'openai';

  const client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY,
      baseURL: 'https://api.venice.ai/api/v1'
  });

  const tools = [
      {
          type: 'function',
          function: {
              name: 'get_weather',
              description: 'Get the current weather in a location',
              parameters: {
                  type: 'object',
                  properties: {
                      location: {
                          type: 'string',
                          description: 'The city and state'
                      }
                  },
                  required: ['location']
              }
          }
      }
  ];

  const response = await client.chat.completions.create({
      model: 'zai-org-glm-5',
      messages: [{ role: 'user', content: "What's the weather in San Francisco?" }],
      tools: tools
  });

  console.log(response.choices[0].message);
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "zai-org-glm-5",
      "messages": [
        {
          "role": "user",
          "content": "What'\''s the weather in San Francisco?"
        }
      ],
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "get_weather",
            "description": "Get the current weather in a location",
            "parameters": {
              "type": "object",
              "properties": {
                "location": {
                  "type": "string",
                  "description": "The city and state"
                }
              },
              "required": ["location"]
            }
          }
        }
      ]
    }'
  ```
</CodeGroup>

***

## Next Steps

Now that you've made your first requests, explore more of what Venice API has to offer:

<CardGroup>
  <Card title="Browse Models" icon="database" href="/overview/models">
    Compare all available models with their capabilities, pricing, and context limits
  </Card>

  <Card title="API Reference" icon="code" href="/api-reference/api-spec">
    Explore detailed API documentation with all endpoints and parameters
  </Card>

  <Card title="Structured Responses" icon="brackets-curly" href="/overview/guides/structured-responses">
    Learn how to get JSON responses with guaranteed schemas
  </Card>

  <Card title="AI Agents Guide" icon="robot" href="/overview/guides/ai-agents">
    Build autonomous AI agents with Venice API and frameworks like Eliza
  </Card>
</CardGroup>

### Additional Resources

<CardGroup>
  <Card title="Rate Limiting" icon="gauge" href="/api-reference/rate-limiting">
    Understand rate limits and best practices for production usage
  </Card>

  <Card title="Error Codes" icon="triangle-exclamation" href="/api-reference/error-codes">
    Reference for handling API errors and troubleshooting issues
  </Card>

  <Card title="Postman Collection" icon="bolt" href="/overview/guides/postman">
    Import our complete Postman collection for easy testing
  </Card>

  <Card title="Privacy & Security" icon="shield" href="/overview/privacy">
    Learn about Venice's privacy-first architecture and data handling
  </Card>
</CardGroup>

***

## Need Help?

* **Discord Community**: Join our [Discord server](https://discord.gg/askvenice) for support and discussions
* **Documentation**: Browse our [complete API reference](/api-reference/api-spec)
* **Status Page**: Check service status at [veniceai-status.com](https://veniceai-status.com)
* **Twitter**: Follow [@AskVenice](https://x.com/AskVenice) for updates

<Resources />


# AI Agents
Source: https://docs.venice.ai/overview/guides/ai-agents

Venice is supported with the following AI Agent communities.

* [Coinbase Agentkit](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit)

* [Eliza](https://github.com/ai16z/eliza) - Venice support introduced via this [PR](https://github.com/ai16z/eliza/pull/1008).

* [OpenClaw](https://docs.openclaw.ai/providers/venice) - Open source AI assistant with Venice API integration for easy AI-powered conversations. See the [OpenClaw Venice Provider Guide](https://docs.openclaw.ai/providers/venice) for setup instructions.

## Eliza Instructions

To setup Eliza with Venice, follow these instructions. A full blog post with more detail can be found [here](https://venice.ai/blog/how-to-build-a-social-media-ai-agent-with-elizaos-venice-api).

* Clone the Eliza repository:

```bash theme={"system"}
# Clone the repository
git clone https://github.com/ai16z/eliza.git
```

* Copy `.env.example` to `.env`

* Update `.env` specifying your `VENICE_API_KEY`, and model selections for  `SMALL_VENICE_MODEL`, `MEDIUM_VENICE_MODEL`, `LARGE_VENICE_MODEL`, `IMAGE_VENICE_MODEL`, instructions on generating your key can be found [here](/overview/guides/generating-api-key).

* Create a new character in the `/characters/` folder with a filename similar to  `your_character.character.json`to specify the character profile, tools/functions, and Venice.ai as the model provider:

```typescript theme={"system"}
   modelProvider: "venice"
```

* Build the repo:

```bash theme={"system"}
pnpm i
pnpm build
pnpm start
```

* Start your character

```bash theme={"system"}
pnpm start --characters="characters/<your_character>.character.json"
```

* Start the local UI to chat with the agent

<img alt="" />


# Claude Code
Source: https://docs.venice.ai/overview/guides/claude-code

Use Claude Code CLI with Venice AI's Claude models

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is Anthropic's CLI tool for agentic coding. This guide shows you how to run it through Venice AI for pay-per-token access to Claude Opus 4.5/4.6 and Sonnet 4.5/4.6.

<CardGroup>
  <Card title="Pay Per Token" icon="coins">
    No subscription. Pay only for what you use
  </Card>

  <Card title="Claude Models" icon="microchip">
    Access Opus 4.5/4.6 and Sonnet 4.5/4.6 through Venice
  </Card>

  <Card title="Prompt Caching" icon="bolt">
    Venice caching works alongside Claude Code
  </Card>
</CardGroup>

## Why You Need a Router

Claude Code connects directly to Anthropic's API by default. To use it with Venice, you need [claude-code-router](https://github.com/musistudio/claude-code-router), an open-source local proxy that:

<Steps>
  <Step title="Intercepts" icon="hand">
    Catches Claude Code's outgoing requests before they reach Anthropic
  </Step>

  <Step title="Transforms" icon="arrows-rotate">
    Converts request format and maps model IDs (e.g., `claude-opus-4-5`)
  </Step>

  <Step title="Redirects" icon="route">
    Forwards requests to Venice at `api.venice.ai/api/v1/chat/completions`
  </Step>
</Steps>

***

## Prerequisites

<CardGroup>
  <Card title="Venice Account" icon="user" href="https://venice.ai/settings/api">
    With API credits
  </Card>

  <Card title="Node.js" icon="node-js" href="https://nodejs.org/">
    v18 or higher
  </Card>

  <Card title="Claude Code" icon="terminal" href="https://docs.anthropic.com/en/docs/claude-code">
    Installed via npm
  </Card>
</CardGroup>

***

## Setup

<Steps>
  <Step title="Install Claude Code">
    If you haven't already, install Anthropic's Claude Code CLI:

    ```bash theme={"system"}
    npm install -g @anthropic-ai/claude-code
    ```
  </Step>

  <Step title="Install the Router">
    ```bash theme={"system"}
    npm install -g @musistudio/claude-code-router
    ```
  </Step>

  <Step title="Get Your API Key">
    Generate a key from [venice.ai/settings/api](https://venice.ai/settings/api). You'll paste it directly in the config file in the next step.
  </Step>

  <Step title="Create Configuration">
    Create the config directory:

    ```bash theme={"system"}
    mkdir -p ~/.claude-code-router
    ```

    Then create `~/.claude-code-router/config.json` with your preferred editor:

    ```bash theme={"system"}
    # Using nano
    nano ~/.claude-code-router/config.json

    # Or using VS Code
    code ~/.claude-code-router/config.json
    ```

    Paste the following configuration:

    ```json theme={"system"}
    {
      "APIKEY": "",
      "LOG": true,
      "LOG_LEVEL": "info",
      "API_TIMEOUT_MS": 600000,
      "HOST": "127.0.0.1",
      "Providers": [
        {
          "name": "venice",
          "api_base_url": "https://api.venice.ai/api/v1/chat/completions",
          "api_key": "your-venice-api-key-here",
          "models": [
            "claude-opus-4-5",
            "claude-sonnet-4-5",
            "claude-opus-4-6",
            "claude-opus-4-6-fast",
            "claude-sonnet-4-6"
          ],
          "transformer": {
            "use": ["anthropic"]
          }
        }
      ],
      "Router": {
        "default": "venice,claude-opus-4-5",
        "think": "venice,claude-opus-4-5",
        "background": "venice,claude-opus-4-5",
        "longContext": "venice,claude-opus-4-5",
        "longContextThreshold": 100000
      }
    }
    ```

    <Note>
      If you modify `config.json` while the router is running, restart it with `ccr restart` to apply changes.
    </Note>
  </Step>

  <Step title="Launch">
    Start the router, then Claude Code:

    ```bash theme={"system"}
    ccr start
    ccr code
    ```

    Or use the activation method:

    ```bash theme={"system"}
    eval "$(ccr activate)" && claude
    ```
  </Step>
</Steps>

***

## Supported Models

| Model                | Venice ID              | Best For                             |
| -------------------- | ---------------------- | ------------------------------------ |
| Claude Opus 4.5      | `claude-opus-4-5`      | Complex reasoning, large refactors   |
| Claude Sonnet 4.5    | `claude-sonnet-4-5`    | Fast iteration, everyday coding      |
| Claude Opus 4.6      | `claude-opus-4-6`      | Complex reasoning, large refactors   |
| Claude Opus 4.6 Fast | `claude-opus-4-6-fast` | Complex reasoning with lower latency |
| Claude Sonnet 4.6    | `claude-sonnet-4-6`    | Fast iteration, everyday coding      |

<Info>
  Claude Code is optimized for Claude models. While other models available through Venice (GPT, DeepSeek, Grok, etc.) may work, we cannot guarantee an equivalent experience since Claude Code relies on Claude-specific features like extended thinking. For other models, consider using Venice's [standard API](/api-reference/endpoint/chat/completions).
</Info>

***

## Router Features

The router provides several useful features beyond basic routing:

<AccordionGroup>
  <Accordion title="Switch models on the fly">
    Use the `/model` command inside Claude Code to switch models without restarting:

    ```
    /model venice,claude-sonnet-4-5
    ```

    Useful when you want Opus for complex tasks and Sonnet for quick iterations.
  </Accordion>

  <Accordion title="Visual configuration with UI mode">
    Prefer a GUI? Launch the web-based config editor:

    ```bash theme={"system"}
    ccr ui
    ```

    This opens a browser interface for editing your `config.json` without touching the file directly.
  </Accordion>

  <Accordion title="Router scenarios explained">
    The `Router` config section controls which model handles different task types:

    | Scenario      | When it's used                                     |
    | ------------- | -------------------------------------------------- |
    | `default`     | General requests                                   |
    | `think`       | Reasoning-heavy tasks (Plan Mode)                  |
    | `background`  | Background operations                              |
    | `longContext` | When context exceeds `longContextThreshold` tokens |

    You can route different scenarios to different models. For example, use Sonnet for background tasks to save costs.
  </Accordion>

  <Accordion title="Debugging with logs">
    If something isn't working, check the logs:

    ```bash theme={"system"}
    # Server logs (HTTP, API calls)
    ~/.claude-code-router/logs/ccr-*.log

    # Application logs (routing decisions)
    ~/.claude-code-router/claude-code-router.log
    ```

    Set `"LOG_LEVEL": "debug"` in your config for more verbose output.
  </Accordion>
</AccordionGroup>

***

## Caching Behavior

Venice [prompt caching](/overview/guides/prompt-caching) works alongside Claude Code's native cache markers. Venice automatically detects when Claude Code sends `cache_control` fields and adjusts its caching strategy accordingly.

| Scenario                      | Cache TTL | Who Controls         |
| ----------------------------- | --------- | -------------------- |
| Default (recommended)         | 5 minutes | Claude Code + Venice |
| With `cleancache` transformer | 1 hour    | Venice only          |

<AccordionGroup>
  <Accordion title="When NOT to use cleancache (most users)">
    The default configuration lets both systems cooperate:

    * Claude Code sends its native `cache_control` markers
    * Venice adds caching around them with a 5-minute TTL
    * Both systems share the 4-block cache limit

    This works well for active coding sessions where you're making frequent requests.
  </Accordion>

  <Accordion title="When to use cleancache">
    Add `cleancache` to the transformer if you:

    * Are hitting the 4-block cache limit errors
    * Experience strange caching behavior
    * Prefer Venice's 1-hour TTL for longer sessions

    ```json theme={"system"}
    "transformer": {
      "use": ["anthropic", "cleancache"]
    }
    ```

    This strips Claude Code's cache markers, giving Venice full control with a longer TTL.
  </Accordion>
</AccordionGroup>

***

## Resources

<CardGroup>
  <Card title="Venice API Docs" icon="book" href="/api-reference/api-spec">
    Full API reference
  </Card>

  <Card title="claude-code-router" icon="github" href="https://github.com/musistudio/claude-code-router">
    Source code and issues
  </Card>
</CardGroup>


# Codex CLI
Source: https://docs.venice.ai/overview/guides/codex-cli

Use OpenAI Codex CLI with Venice AI models through a local config.toml file

This guide shows how to run OpenAI Codex CLI with Venice using Codex's official config paths: `~/.codex/config.toml` (user-level) or `.codex/config.toml` (project-level).

<CardGroup>
  <Card title="Simple Setup" icon="gear">
    One config file in your project
  </Card>

  <Card title="OpenAI Compatible" icon="plug">
    Uses Venice's OpenAI-compatible API
  </Card>

  <Card title="Model Flexibility" icon="microchip">
    Swap in any supported Venice text model
  </Card>
</CardGroup>

***

## Prerequisites

* A Venice API key from [venice.ai/settings/api](https://venice.ai/settings/api)
* Codex CLI installed and working on your machine

***

## Setup

<Steps>
  <Step title="Create the project config path">
    From your project root:

    ```bash theme={"system"}
    mkdir -p .codex
    ```
  </Step>

  <Step title="Create .codex/config.toml">
    Create the file and paste the configuration below:

    ```toml theme={"system"}
    #:schema https://developers.openai.com/codex/config-schema.json

    model = "openai-gpt-54" # use any Venice model
    model_provider = "venice"
    model_reasoning_effort = "high"
    personality = "pragmatic"
    sandbox_mode = "workspace-write"

    [model_providers.venice]
    name = "Venice"
    base_url = "https://api.venice.ai/api/v1/"
    experimental_bearer_token = "YOUR VENICE API KEY"
    wire_api = "responses"
    ```
  </Step>

  <Step title="Replace the two placeholders">
    Update:

    * `model` with the Venice model ID you want to use
    * `experimental_bearer_token` with your real Venice API key

    You can browse available model IDs in the [text model catalog](/models/text).
  </Step>

  <Step title="Run Codex CLI normally">
    Start Codex CLI from the same project. It will load `.codex/config.toml` (for trusted projects) and route requests through Venice.
  </Step>
</Steps>

***

## Official Codex Config Locations

* **User defaults**: `~/.codex/config.toml`
* **Project overrides**: `.codex/config.toml` (loaded only for trusted projects)

If you want Venice settings to apply everywhere, put the same config in `~/.codex/config.toml`.

***

## Configuration Precedence (Highest First)

1. CLI flags and `--config` overrides
2. Profile values (`--profile <name>`)
3. Project config layers (`.codex/config.toml`, closest directory wins)
4. User config (`~/.codex/config.toml`)
5. System config (`/etc/codex/config.toml`, Unix)
6. Built-in defaults

***

## Notes

* Keep your API key private and never commit real keys to git.
* Codex ignores project `.codex/` config when a project is marked untrusted.
* If you switch models, only update the `model` field.
* The `wire_api = "responses"` setting is required for this provider setup.

***

## Resources

<CardGroup>
  <Card title="Venice API Reference" icon="book" href="/api-reference/api-spec">
    Full endpoint and parameter docs
  </Card>

  <Card title="Venice Text Models" icon="list" href="/models/text">
    Available model IDs
  </Card>
</CardGroup>


# CrewAI Integration
Source: https://docs.venice.ai/overview/guides/crewai

Build multi-agent AI systems with Venice AI and CrewAI

[CrewAI](https://www.crewai.com/) enables you to build autonomous multi-agent systems where specialized AI agents collaborate on complex tasks. Venice AI works as a drop-in LLM provider thanks to OpenAI compatibility.

## Setup

```bash theme={"system"}
pip install crewai crewai-tools
```

## Basic Configuration

Configure Venice as CrewAI's LLM provider using the OpenAI-compatible interface:

```python theme={"system"}
import os

os.environ["OPENAI_API_KEY"] = "your-venice-api-key"
os.environ["OPENAI_API_BASE"] = "https://api.venice.ai/api/v1"
os.environ["OPENAI_MODEL_NAME"] = "venice-uncensored"
```

Or configure per-agent with the LLM object:

```python theme={"system"}
from crewai import LLM

venice_llm = LLM(
    model="openai/venice-uncensored",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    temperature=0.7,
)

# For complex reasoning tasks
venice_flagship = LLM(
    model="openai/zai-org-glm-5-1",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    temperature=0.3,
)
```

## Your First Crew

Create a simple research crew with two agents:

```python theme={"system"}
from crewai import Agent, Task, Crew

# Agent 1: Researcher
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find comprehensive, accurate information on the given topic",
    backstory="You are an expert researcher with a keen eye for detail. "
              "You excel at finding and synthesizing information from multiple sources.",
    llm=venice_flagship,
    verbose=True,
)

# Agent 2: Writer
writer = Agent(
    role="Content Strategist",
    goal="Create engaging, well-structured content from research findings",
    backstory="You are a skilled writer who transforms complex research "
              "into clear, compelling content that readers love.",
    llm=venice_llm,
    verbose=True,
)

# Task 1: Research
research_task = Task(
    description="Research the topic: {topic}. "
                "Find key facts, recent developments, and expert opinions. "
                "Provide a structured summary with sources.",
    expected_output="A detailed research summary with key findings, "
                    "organized by subtopic, with at least 5 key points.",
    agent=researcher,
)

# Task 2: Write article
write_task = Task(
    description="Using the research provided, write a compelling blog post "
                "about {topic}. Include an introduction, main sections, and conclusion.",
    expected_output="A well-written blog post of 500-800 words with clear sections.",
    agent=writer,
    context=[research_task],  # Uses output from research_task
)

# Create and run the crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "The future of privacy-preserving AI"})
print(result)
```

## Multi-Agent Product Analysis Crew

A more complex example with specialized agents:

```python theme={"system"}
from crewai import Agent, Task, Crew, Process

# Different models for different agent capabilities
fast_llm = LLM(model="openai/qwen3-5-9b", api_key="your-key", base_url="https://api.venice.ai/api/v1")
smart_llm = LLM(model="openai/zai-org-glm-5-1", api_key="your-key", base_url="https://api.venice.ai/api/v1")
uncensored_llm = LLM(model="openai/venice-uncensored-1-2", api_key="your-key", base_url="https://api.venice.ai/api/v1")

# Market Analyst - needs intelligence
market_analyst = Agent(
    role="Market Research Analyst",
    goal="Analyze market trends and competitive landscape",
    backstory="You are a veteran market analyst with 15 years of experience "
              "in tech markets. You provide unbiased, data-driven insights.",
    llm=smart_llm,
    verbose=True,
)

# Red Team - benefits from uncensored thinking
red_team = Agent(
    role="Red Team Critic",
    goal="Find weaknesses, risks, and potential failures in business strategies",
    backstory="You are a brutally honest critic who stress-tests ideas. "
              "You find every possible flaw and risk, no matter how uncomfortable.",
    llm=uncensored_llm,  # Uncensored for honest criticism
    verbose=True,
)

# Strategist - needs reasoning
strategist = Agent(
    role="Business Strategist",
    goal="Synthesize analysis into actionable strategy recommendations",
    backstory="You are a McKinsey-trained strategist who creates clear, "
              "actionable plans from complex analyses.",
    llm=smart_llm,
    verbose=True,
)

# Tasks
market_task = Task(
    description="Analyze the market opportunity for: {product_idea}. "
                "Cover market size, competitors, trends, and target audience.",
    expected_output="Structured market analysis with TAM/SAM/SOM estimates, "
                    "top 5 competitors, and 3 key market trends.",
    agent=market_analyst,
)

critique_task = Task(
    description="Critically evaluate this product idea and market analysis. "
                "Find every weakness, risk, and potential failure mode. Be brutally honest.",
    expected_output="A list of at least 5 critical risks, 3 potential failure modes, "
                    "and honest assessment of whether this idea will succeed.",
    agent=red_team,
    context=[market_task],
)

strategy_task = Task(
    description="Based on the market analysis and red team critique, "
                "create a go-to-market strategy that addresses the identified risks.",
    expected_output="A clear go-to-market strategy with: positioning statement, "
                    "3 key differentiators, launch timeline, and risk mitigations.",
    agent=strategist,
    context=[market_task, critique_task],
)

crew = Crew(
    agents=[market_analyst, red_team, strategist],
    tasks=[market_task, critique_task, strategy_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff(inputs={
    "product_idea": "A privacy-first AI coding assistant that runs on Venice API"
})
print(result)
```

## Using Tools

Enhance agents with web search and other tools:

<Note>
  `SerperDevTool` requires a `SERPER_API_KEY` environment variable from [serper.dev](https://serper.dev). As an alternative, you can use Venice's built-in web search by passing `venice_parameters: {"enable_web_search": "auto"}` via `model_kwargs` — no extra API key needed. See the LangChain guide's [Web Search Integration](/overview/guides/langchain#web-search-integration) for an example.
</Note>

```python theme={"system"}
from crewai_tools import SerperDevTool, WebsiteSearchTool
from crewai import Agent, Task, Crew

# Web search tool (requires SERPER_API_KEY env var)
search_tool = SerperDevTool()

researcher = Agent(
    role="Web Researcher",
    goal="Find the latest information on any topic",
    backstory="You are an expert web researcher.",
    llm=venice_flagship,
    tools=[search_tool],
    verbose=True,
)

task = Task(
    description="Research the latest developments in {topic} from the past week.",
    expected_output="A summary of 5 recent developments with dates and sources.",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task], verbose=True)
result = crew.kickoff(inputs={"topic": "decentralized AI"})
```

## Model Selection Guide for CrewAI

Choose the right Venice model for each agent role:

| Agent Role                     | Recommended Model                                    | Why                                                        |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------- |
| Complex reasoning / Strategy   | `zai-org-glm-5-1`                                    | Best private reasoning model                               |
| Uncensored analysis / Red team | `venice-uncensored-1-2`                              | No content filtering                                       |
| High-volume / Fast tasks       | `qwen3-5-9b`                                         | Cheapest at $0.10/1M input tokens & $0.15/1M output tokens |
| Code generation agents         | `qwen3-coder-480b-a35b-instruct`                     | Optimized for code                                         |
| Vision/multimodal tasks        | `qwen3-vl-235b-a22b`                                 | Advanced vision understanding                              |
| Budget-conscious teams         | `qwen3-5-9b` (fast) + `venice-uncensored-1-2` (main) | Low cost combination                                       |

## Cost Optimization Tips

1. **Use cheaper models for simpler agents**: Not every agent needs a flagship model. Use `qwen3-4b` for formatting, summarizing, or simple extraction.

2. **Use `venice-uncensored` for creative/critical roles**: It's fast, cheap, and won't refuse uncomfortable analyses.

3. **Reserve flagship models for reasoning**: Use `zai-org-glm-5-1` only for agents that need complex reasoning or reliable function calling.

4. **Limit max iterations**: Set `max_iter` on agents to prevent runaway token usage:
   ```python theme={"system"}
   agent = Agent(role="...", goal="...", backstory="...", llm=venice_llm, max_iter=5)
   ```

## Privacy Advantage

Venice's privacy guarantees make it ideal for CrewAI use cases involving:

* **Confidential business strategy** — Zero data retention means your competitive analysis stays private
* **Sensitive data processing** — Private models never log or store your data
* **Red team exercises** — Uncensored models give honest feedback without content filtering

<CardGroup>
  <Card title="CrewAI Docs" icon="book" href="https://docs.crewai.com/">
    Official CrewAI documentation
  </Card>

  <Card title="Venice Models" icon="database" href="/models/overview">
    Browse all Venice models
  </Card>
</CardGroup>


# Crypto RPC for Agents
Source: https://docs.venice.ai/overview/guides/crypto-rpc-agents

Give your AI agent inference and on-chain access through one Venice credential

Venice gives your agent both inference (230+ models) and blockchain access (10 EVM chains plus Starknet) through a single credential. Your agent can think, sign, and send transactions without juggling separate accounts for inference and RPC providers.

<CardGroup>
  <Card title="One credential, two superpowers" icon="key">
    A single API key (or wallet) for both LLM inference and JSON-RPC calls.
  </Card>

  <Card title="11 chains supported" icon="link">
    Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, Avalanche, BSC, Blast, zkSync Era, and Starknet (mainnet plus testnets).
  </Card>

  <Card title="Stake VVV for headless funding" icon="coins">
    Stake VVV on Base to earn daily DIEM, the only fully headless funding path for a minted API key. USD and crypto top-ups are also available through the dashboard.
  </Card>

  <Card title="Keyless auth via x402" icon="wallet">
    Agents can authenticate with a wallet signature and pay in USDC on Base.
  </Card>
</CardGroup>

## Why Venice for on-chain agents?

| Capability         | What your agent gets                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Inference**      | 230+ text, image, video, audio, and embedding models through one OpenAI-compatible endpoint |
| **Crypto RPC**     | JSON-RPC 2.0 proxy to 10 EVM chains plus Starknet (mainnet and testnets)                    |
| **Authentication** | Standard API key or x402 wallet auth (no Venice account required)                           |
| **Funding**        | Autonomous: VVV staking for daily DIEM. Browser: USD or crypto top-ups via the dashboard    |
| **Batching**       | Up to 100 JSON-RPC calls per request, multi-chain in parallel                               |
| **Idempotency**    | Safe retries with `Idempotency-Key` header                                                  |

## Authentication

Pick the auth method that matches how your agent runs.

| Method          | Best for                                         | How it works                                                                                                                                     |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API key**     | Server-side agents, fixed deployments            | `Authorization: Bearer <key>` header. Get a key at [venice.ai/settings/api](https://venice.ai/settings/api).                                     |
| **x402 wallet** | Autonomous, crypto-native, or short-lived agents | Wallet signs a SIWE message, pays per request in USDC on Base. No Venice account needed. See the [x402 guide](/overview/guides/x402-venice-api). |

Both methods share the same rate limits and billing in Venice credits.

<Tip>
  Truly autonomous agents can mint their own API key by staking VVV on Base. See [Autonomous Agent API Key Creation](/overview/guides/generating-api-key-agent).
</Tip>

## Crypto RPC quickstart

Send any JSON-RPC 2.0 method to `POST /crypto/rpc/{network}`.

```bash theme={"system"}
curl https://api.venice.ai/api/v1/crypto/rpc/ethereum-mainnet \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_chainId",
    "params": [],
    "id": 1
  }'
```

Response:

```json theme={"system"}
{ "jsonrpc": "2.0", "id": 1, "result": "0x1" }
```

Response headers include `X-Venice-RPC-Credits` (credits charged), `X-Venice-RPC-Cost-USD` (dollar cost), and `X-Request-ID` (correlation ID).

### Supported networks

| Family            | Mainnet             | Testnets                               |
| ----------------- | ------------------- | -------------------------------------- |
| Ethereum          | `ethereum-mainnet`  | `ethereum-sepolia`, `ethereum-holesky` |
| Base              | `base-mainnet`      | `base-sepolia`                         |
| Arbitrum          | `arbitrum-mainnet`  | `arbitrum-sepolia`                     |
| Optimism          | `optimism-mainnet`  | `optimism-sepolia`                     |
| Polygon           | `polygon-mainnet`   | `polygon-amoy`                         |
| Linea             | `linea-mainnet`     | `linea-sepolia`                        |
| Avalanche C-Chain | `avalanche-mainnet` | `avalanche-fuji`                       |
| BNB Smart Chain   | `bsc-mainnet`       | `bsc-testnet`                          |
| Blast             | `blast-mainnet`     | `blast-sepolia`                        |
| zkSync Era        | `zksync-mainnet`    | `zksync-sepolia`                       |
| Starknet          | `starknet-mainnet`  | `starknet-sepolia`                     |

Use [`GET /crypto/rpc/networks`](/api-reference/endpoint/crypto/networks) for the live, authoritative list.

### Method tiers

Methods are grouped into three credit tiers. Total cost = `baseCredits[chain] × methodTier`.

| Tier         | Multiplier | Examples                                                                                                                                 |
| ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard** | 1x         | `eth_call`, `eth_getBalance`, `eth_blockNumber`, `eth_sendRawTransaction`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_estimateGas` |
| **Advanced** | 2x         | `trace_block`, `trace_call`, `trace_transaction`, `debug_traceCall`, `debug_traceTransaction`                                            |
| **Large**    | 4x         | `trace_replayBlockTransactions`, `trace_replayTransaction`, `txpool_content`                                                             |

Full list and pricing detail in the [Crypto RPC API reference](/api-reference/endpoint/crypto/rpc).

## Agent recipes

Common patterns for AI agents that need to read and write on-chain.

### Read a wallet's native balance

```bash theme={"system"}
curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_getBalance",
    "params": ["0xYourWalletAddress", "latest"],
    "id": 1
  }'
```

### Read ERC-20 token balance

Call the `balanceOf(address)` selector with `eth_call`. The `data` field is the 4-byte selector (`0x70a08231`) followed by the wallet address left-padded to 32 bytes. Easiest to let a library encode it:

```typescript theme={"system"}
import { encodeFunctionData, parseAbi } from 'viem'

const data = encodeFunctionData({
  abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
  args: ['0xWalletAddress'],
})

const response = await fetch('https://api.venice.ai/api/v1/crypto/rpc/base-mainnet', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{ to: '0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf', data }, 'latest'],
    id: 1,
  }),
})
```

The contract address above is VVV on Base. Swap it for any ERC-20 contract.

### Send a signed transaction (full lifecycle)

Venice never holds your private keys. The agent gathers tx parameters via RPC reads, signs locally with a library like [viem](https://viem.sh) or [ethers](https://docs.ethers.org), then relays the raw hex through Venice.

<Steps>
  <Step title="Get the next nonce">
    ```bash theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["0xAgentWallet","pending"],"id":1}'
    ```

    Use `"pending"` so back-to-back sends don't collide.
  </Step>

  <Step title="Get gas price">
    ```bash theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}'
    ```

    For EIP-1559 chains, prefer `eth_feeHistory` to compute `maxFeePerGas` and `maxPriorityFeePerGas`.
  </Step>

  <Step title="Estimate gas">
    ```bash theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_estimateGas","params":[{"from":"0xAgentWallet","to":"0xRecipient","value":"0x0","data":"0x..."}],"id":1}'
    ```
  </Step>

  <Step title="Sign locally">
    ```typescript theme={"system"}
    import { privateKeyToAccount } from 'viem/accounts'
    import { base } from 'viem/chains'

    const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY)

    const signed = await account.signTransaction({
      chainId: base.id,
      nonce,                  // from step 1
      gas,                    // from step 3
      maxFeePerGas,           // from step 2 (fee history)
      maxPriorityFeePerGas,   // from step 2 (fee history)
      to: '0xRecipient',
      value: 0n,
      data: '0x...',
    })
    ```
  </Step>

  <Step title="Submit through Venice">
    ```bash theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Idempotency-Key: agent-tx-<id>" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xSignedHex"],"id":1}'
    ```

    Always set `Idempotency-Key` on relays so a network blip can't double-broadcast.
  </Step>

  <Step title="Poll for receipt">
    ```bash theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0xTxHash"],"id":1}'
    ```

    Poll every few seconds until `result` is non-null. Check `result.status` (`"0x1"` = success).
  </Step>
</Steps>

<Note>
  Every `eth_sendRawTransaction` call is logged server-side with the tx hash, network, request ID, and calling user ID. The signed payload itself is not retained. This audit trail exists so compromised keys used for illicit relays can be traced back to the responsible account.
</Note>

### Batch multiple calls (multi-chain portfolio check)

Send up to 100 JSON-RPC objects in one request. Each is validated and billed independently.

```bash theme={"system"}
curl https://api.venice.ai/api/v1/crypto/rpc/ethereum-mainnet \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    { "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1 },
    { "jsonrpc": "2.0", "method": "eth_getBalance", "params": ["0xWallet", "latest"], "id": 2 },
    { "jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 3 }
  ]'
```

For multi-chain reads (one call per chain), issue parallel requests to different `{network}` endpoints.

### Safe retries with idempotency

Set the `Idempotency-Key` header to any string matching `[A-Za-z0-9_-]{1,255}`. Venice caches the response for 24 hours keyed on `(user, key)`. Replays return the cached result with `Idempotent-Replayed: true` and charge nothing.

```bash theme={"system"}
curl https://api.venice.ai/api/v1/crypto/rpc/base-mainnet \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Idempotency-Key: agent-tx-2026-04-21-001" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_sendRawTransaction",
    "params": ["0xSignedRawTxHex"],
    "id": 1
  }'
```

This is critical for transaction relays where a network blip could otherwise cause your agent to broadcast the same tx twice.

## Funding the agent's API key

Once the agent has a Venice API key, it needs spendable balance on the underlying account before paid endpoints will accept the key. There are two ways to put balance there:

| Path                                       | Autonomous?  | How it works                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DIEM from VVV staking**                  | Yes          | Stake VVV in the [Venice Staking Smart Contract](https://basescan.org/address/0x321b7ff75154472B18EDb199033fF4D116F340Ff#code) on Base. The wallet's daily DIEM allocation is proportional to its share of the staking pool. The account needs at least 0.1 DIEM accrued before any DIEM is spendable. DIEM refreshes at 00:00 UTC. To grow daily spend, stake more VVV. |
| **USD or crypto top-up via the dashboard** | No (browser) | Sign into [venice.ai](https://venice.ai) with the same wallet (Sign-In-With-Ethereum), then add credits in Settings, API. Both Stripe (card) and Coinbase (crypto) live behind that page and require a browser. Credits never expire.                                                                                                                                    |

For an agent that runs unattended, **DIEM via VVV staking is the only fully headless funding path for a minted API key today**. If the agent's daily spend exceeds its DIEM allocation, the realistic options are: stake more VVV, or have an operator sign in and top up in USD or crypto.

### Autonomous VVV staking and key generation

A truly autonomous agent can manage its own VVV wallet on Base, stake it, and mint its own Venice API key with no human in the loop. The full flow:

<Steps>
  <Step title="Acquire VVV and ETH for gas">
    Send VVV to the agent's wallet (or have the agent swap on [Aerodrome](https://aerodrome.finance) or [Uniswap](https://app.uniswap.org)), plus a small amount of ETH on Base for the two staking transactions.
  </Step>

  <Step title="Stake VVV">
    `approve` the staking contract on the VVV token, then `stake(amount)` on `0x321b7ff75154472B18EDb199033fF4D116F340Ff`. The wallet's sVVV balance updates atomically with the stake.
  </Step>

  <Step title="Mint an API key">
    `GET /api/v1/api_keys/generate_web3_key` returns a JWT that expires 15 minutes after issuance. Sign the raw token with the staking wallet, then `POST` the address, signature, and token back. Venice returns an API key bound to the user account derived from that wallet.
  </Step>
</Steps>

Minting only requires a non-zero sVVV balance, so 1 staked VVV is enough to receive a key. **Spending** with the key is a separate question, governed by the funding table above.

See [Autonomous Agent API Key Creation](/overview/guides/generating-api-key-agent) for the complete walkthrough with code and the full error reference.

## x402 wallet auth in 30 seconds

If your agent already has a Base wallet, skip the API key entirely. The [`venice-x402-client`](https://github.com/veniceai/x402-client) SDK handles SIWE signing, top-ups, and balance tracking.

```bash theme={"system"}
npm install venice-x402-client
```

```typescript theme={"system"}
import { VeniceClient } from 'venice-x402-client'

const venice = new VeniceClient(process.env.WALLET_KEY)

await venice.topUp(10) // skip if the wallet already has balance

const response = await venice.chat({
  model: 'kimi-k2-6',
  messages: [{ role: 'user', content: 'What is the latest block on Base?' }]
})
```

The same wallet auth works against `/crypto/rpc/{network}` for blockchain reads and writes. Full protocol details in the [x402 guide](/overview/guides/x402-venice-api).

## Pricing

Crypto RPC is billed in Venice credits. Each response includes `X-Venice-RPC-Credits` (credits charged) and `X-Venice-RPC-Cost-USD` (dollar cost) so your agent can track spend per request.

### Base credits per chain

| Base credits | Chains                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| **20**       | Ethereum, Base, Optimism, Arbitrum, Polygon, Linea, Avalanche, BSC, Blast, Starknet |
| **30**       | zkSync Era                                                                          |

### Cost examples

Observed pricing for standard, advanced, and large method tiers:

| Call                                            | Credits | USD cost      |
| ----------------------------------------------- | ------- | ------------- |
| `eth_call` on Ethereum (20 × 1x)                | 20      | \~\$0.0000140 |
| `trace_transaction` on Ethereum (20 × 2x)       | 40      | \~\$0.0000280 |
| `trace_replayTransaction` on Ethereum (20 × 4x) | 80      | \~\$0.0000560 |
| `eth_call` on zkSync (30 × 1x)                  | 30      | \~\$0.0000210 |

Always trust the `X-Venice-RPC-Cost-USD` response header for the authoritative cost. Errored items in batch requests are billed at a flat 5 credits each.

### Rate limits

| Tier     | Requests per minute |
| -------- | ------------------- |
| Standard | 100                 |
| Staff    | 1,000               |

When exceeded, the endpoint returns `429` with standard `X-RateLimit-*` response headers.

## Error handling

Common HTTP responses your agent should handle:

| Status | Meaning                                                                                                                                    | What to do                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Unsupported or unmapped JSON-RPC method, or malformed batch                                                                                | Verify the method against the [allowlist](/api-reference/endpoint/crypto/rpc). The error body names the offending method.                                                                                                                |
| `400`  | Replay of an `Idempotency-Key` with a different body                                                                                       | Use a fresh key for distinct requests.                                                                                                                                                                                                   |
| `402`  | No auth header at all (response body includes `authOptions` listing both supported auth paths), or out of credits with a valid auth header | If no auth: attach `Authorization: Bearer ...` or the x402 `X-Sign-In-With-X` header. If out of credits: with a Bearer key, fund the account (DIEM, USD, or dashboard top-up); with x402 auth, call `POST /api/v1/x402/top-up` directly. |
| `429`  | Rate limit hit (100 req/min standard, 1,000 req/min staff)                                                                                 | Honor `X-RateLimit-Reset` and back off. Batch up to 100 calls per request to amortize the limit.                                                                                                                                         |
| `5xx`  | Upstream RPC node hiccup                                                                                                                   | Retry with the same `Idempotency-Key` to avoid double-charging.                                                                                                                                                                          |

Per-item batch errors (e.g. invalid params on one of N calls) come back inside a `200 OK` response with a JSON-RPC `error` field on the offending item. Those items are billed at a flat 5 credits each.

## Not supported

These categories of methods are intentionally rejected:

* **WebSocket-only** (`eth_subscribe`, `eth_unsubscribe`): the proxy is HTTP-only. Poll instead.
* **Stateful filters** (`eth_newFilter`, `eth_getFilterChanges`, etc.): filter state is pinned to a single backend and breaks on a load-balanced proxy. Use `eth_getLogs` instead.
* **Key-holding methods** (`eth_sign`, `eth_accounts`, `eth_mining`): hosted providers don't hold user keys. Sign client-side and submit via `eth_sendRawTransaction`.
* **Unmapped methods**: anything not allowlisted returns `400`. Contact support to request additions.

## Resources

<CardGroup>
  <Card title="Crypto RPC API Reference" icon="code" href="/api-reference/endpoint/crypto/rpc">
    Full method list, pricing, and response headers
  </Card>

  <Card title="Supported Networks" icon="link" href="/api-reference/endpoint/crypto/networks">
    Live list of supported network slugs
  </Card>

  <Card title="x402 Wallet Auth" icon="wallet" href="/overview/guides/x402-venice-api">
    Authenticate and pay with a Base wallet
  </Card>

  <Card title="Autonomous Agent API Key" icon="robot" href="/overview/guides/generating-api-key-agent">
    Mint your own key by staking VVV
  </Card>

  <Card title="Postman Collection" icon="play" href="https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-2cf5a817-41cd-438b-ad37-5d07c3f13005?action=share&creator=48156591&active-environment=38652128-ef110f4e-d3e1-43b5-8029-4d6877e62041">
    27 ready-to-run Crypto RPC examples
  </Card>

  <Card title="Pricing" icon="coins" href="/overview/pricing">
    DIEM, credit pricing, and payment options
  </Card>
</CardGroup>


# Cursor IDE
Source: https://docs.venice.ai/overview/guides/cursor

Use Venice AI models in Cursor IDE with the venice- model prefix

[Cursor](https://www.cursor.com/) is an AI-powered code editor. You can use it with Venice AI for private, uncensored access to a wide range of models.

<CardGroup>
  <Card title="Pay Per Token" icon="coins">
    No subscription. Pay only for what you use
  </Card>

  <Card title="All Models" icon="microchip">
    Access Claude, GPT, DeepSeek, Llama, and more
  </Card>

  <Card title="OpenAI Compatible" icon="plug">
    Works via Venice's OpenAI-compatible API
  </Card>
</CardGroup>

***

## Setup

<Steps>
  <Step title="Get Your API Key">
    Generate a key from [venice.ai/settings/api](https://venice.ai/settings/api).
  </Step>

  <Step title="Configure Cursor">
    Open **Cursor Settings** (gear icon), scroll to **Models** and click **Add Model**.

    Under **OpenAI Compatible**, enter:

    * **Override OpenAI Base URL**: `https://api.venice.ai/api/v1`
    * **OpenAI API Key**: Your Venice API key
  </Step>

  <Step title="Add Models">
    In the model name field, type the Venice model ID and press Enter. Add each model you want to use. For example:

    * `minimax-m25`
    * `kimi-k2-5`
    * `venice-claude-opus-4-6` (see [prefix note below](#the-venice--model-prefix))

    See the [model catalog](/models/text) for all available model IDs.
  </Step>

  <Step title="Select and Verify">
    Open a new chat and use the **model selector at the bottom of the chat** to pick one of the Venice models you just added. Send a test message. If you get a response, you're all set.
  </Step>
</Steps>

***

## The `venice-` Model Prefix

<Warning>
  **Claude models require the `venice-` prefix when used in Cursor.**

  Cursor rewrites requests for `claude-*` models into Anthropic's native format, which is incompatible with Venice. Prefixing the model ID with `venice-` prevents this rewrite. Venice strips the prefix automatically.
</Warning>

| Model                | Standard ID            | Cursor ID                     |
| -------------------- | ---------------------- | ----------------------------- |
| Claude Opus 4.6      | `claude-opus-4-6`      | `venice-claude-opus-4-6`      |
| Claude Opus 4.6 Fast | `claude-opus-4-6-fast` | `venice-claude-opus-4-6-fast` |
| Claude Sonnet 4.6    | `claude-sonnet-4-6`    | `venice-claude-sonnet-4-6`    |
| Claude Opus 4.5      | `claude-opus-4-5`      | `venice-claude-opus-4-5`      |
| Claude Sonnet 4.5    | `claude-sonnet-4-5`    | `venice-claude-sonnet-4-5`    |

<Info>
  Non-Claude models (e.g. `minimax-m25`, `kimi-k2-5`, `zai-org-glm-5`) are **not affected** and work without the prefix. The `venice-` prefix is safe to use on any model since Venice always strips it, but it is only required for Claude models in Cursor.
</Info>

***

## Resources

<CardGroup>
  <Card title="Venice API Docs" icon="book" href="/api-reference/api-spec">
    Full API reference
  </Card>

  <Card title="Model Catalog" icon="list" href="/models/text">
    Browse available models
  </Card>
</CardGroup>


# Generating an API Key
Source: https://docs.venice.ai/overview/guides/generating-api-key



Venice's API is protected via API keys. To begin using the Venice API, you'll first need to generate a new key. Follow these steps to get started.

<Steps>
  <Step title="Visit the API Settings Page">
    To get to the API settings page, by visiting [https://venice.ai/settings/api](https://venice.ai/settings/api). This page is accessible by clicking "API" in the left hand toolbar, or by clicking “API” within your user settings.

    Within this dashboard, you're able to view your Diem and USD balances, your API Tier, your API Usage, and your API Keys.

    <Frame>
      <img alt="API Overview" />
    </Frame>
  </Step>

  <Step title="Click Generate New API Key">
    Scroll down the dashboard and select "Generate New API Key". You'll be presented with a list of options.

    * **Description:** This is used to name your API key

    * **API Key Type:**

      * “Admin” keys have the ability to delete or generate additional API keys programmatically.

      * “Inference Only” keys are only permitted to run inference.

    * **Expires at:** You can choose to set an expiration date for the API key after which it will cease to function. By default, a date will not be set, and the key will work in perpetuity.

    * **Epoch Consumption Limits:** This allows you to create limits for API usage from the individual API key. You can choose to limit the Diem or USD amount allowable within a given epoch (24hrs).

    <Frame>
      <img alt="Generate New API Key" />
    </Frame>
  </Step>

  <Step title="Generate the key">
    Clicking Generate will show you the API key.

    <Warning>
      **Important:** This key is only shown once. Make sure to copy it and store it in a safe place. If you lose it, you'll need to delete it and create a new one.
    </Warning>

    <Frame>
      <img alt="Your API Key" />
    </Frame>
  </Step>
</Steps>


# Autonomous Agent API Key Creation
Source: https://docs.venice.ai/overview/guides/generating-api-key-agent



An AI agent that controls a wallet on Base can mint its own Venice API key with no human in the loop. The agent acquires VVV, stakes it, signs a short-lived validation token issued by Venice, and posts the signed token back to receive a fresh API key tied to the staking wallet.

This guide walks through the full flow end to end and covers the funding options for actually paying for inference once the key is minted.

## Prerequisites

* An EVM wallet on Base controlled by the agent (private key in an env var or secret manager).
* A small amount of ETH on Base for gas (staking is two transactions: `approve` then `stake`).
* Any non-zero amount of VVV to stake. The minting endpoint requires only that the wallet has a non-zero sVVV balance, so 1 VVV is enough to mint a key. See [Paying for inference](#paying-for-inference) for what you need to actually call paid endpoints.

<Tip>
  Use a dedicated agent wallet rather than a treasury wallet. The wallet's private key signs every Venice token request, so its blast radius should be small.
</Tip>

## Steps

<Steps>
  <Step title="Acquire VVV">
    Send VVV to the agent's wallet, or have the agent swap on a DEX such as [Aerodrome](https://aerodrome.finance/swap?from=eth\&to=0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf\&chain0=8453\&chain1=8453) or [Uniswap](https://app.uniswap.org/swap?chain=base\&inputCurrency=NATIVE\&outputCurrency=0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf).

    VVV token contract on Base: `0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf`
  </Step>

  <Step title="Stake VVV with Venice">
    Stake the VVV in the [Venice Staking Smart Contract](https://basescan.org/address/0x321b7ff75154472b18edb199033ff4d116f340ff#code) at `0x321b7ff75154472B18EDb199033fF4D116F340Ff`. This is two transactions:

    1. `approve(spender, amount)` on the VVV token, where `spender` is the staking contract.
    2. `stake(amount)` on the staking contract.

    <Frame>
      <img alt="Smart Contract Staking" />
    </Frame>

    When the second transaction confirms, the wallet's VVV balance decreases and its sVVV balance increases by the same amount. The minting endpoint reads the sVVV balance to confirm the wallet is staked.
  </Step>

  <Step title="Request a validation token">
    Call `GET /api/v1/api_keys/generate_web3_key` to get a short-lived token signed by Venice. The endpoint is unauthenticated.

    ```bash theme={"system"}
    curl --request GET \
      --url https://api.venice.ai/api/v1/api_keys/generate_web3_key
    ```

    The response contains a `token` field. The token expires 15 minutes after issuance, so sign and submit it well before then.
  </Step>

  <Step title="Sign the token with the staking wallet">
    Sign the raw token string with the wallet that holds the staked VVV. This is a standard `personal_sign` over the token bytes. Both `ethers.Wallet.signMessage(token)` and `viem`'s `account.signMessage({ message: token })` produce the correct signature.
  </Step>

  <Step title="Mint the API key">
    `POST` the address, signature, and token to the same endpoint, along with the type of key you want.

    ```bash theme={"system"}
    curl --request POST \
      --url https://api.venice.ai/api/v1/api_keys/generate_web3_key \
      --header 'Content-Type: application/json' \
      --data '{
        "address": "<wallet address>",
        "signature": "<signed token>",
        "token": "<unsigned token>",
        "apiKeyType": "INFERENCE",
        "description": "Agent key minted on <date>"
      }'
    ```

    Required fields: `address`, `signature`, `token`, `apiKeyType` (`INFERENCE` or `ADMIN`).

    Optional fields: `description`, `expiresAt`, `consumptionLimit` (caps total spend on this key, denominated in `usd`, `vcu`, or `diem`).

    On success the response contains the minted `apiKey` string. Store it in the agent's secret store and use it as a normal Bearer token (`Authorization: Bearer <key>`).
  </Step>
</Steps>

## End-to-end example

The example below uses a real wallet from an environment variable rather than a randomly generated one. A random wallet has no staked VVV and the mint will be rejected with the `Wallet has no staked VVV on Base` error.

```typescript theme={"system"}
import { ethers } from "ethers"

const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!)
const address = wallet.address

const tokenResponse = await fetch("https://api.venice.ai/api/v1/api_keys/generate_web3_key")
const { data: { token } } = await tokenResponse.json()

const signature = await wallet.signMessage(token)

const mintResponse = await fetch("https://api.venice.ai/api/v1/api_keys/generate_web3_key", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    address,
    signature,
    token,
    apiKeyType: "INFERENCE",
    description: "Agent key",
  }),
})

const result = await mintResponse.json()
if (!mintResponse.ok) {
  throw new Error(`Mint failed: ${result.error}`)
}

console.log("Minted key:", result.data.apiKey)
```

## Error reference

The endpoint returns specific, actionable error messages. Map these in the agent so it can decide whether to retry, request a new token, or stop.

| Status | Error message contains              | What it means                                                            | What to do                                                                      |
| ------ | ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `400`  | `Invalid wallet address`            | The `address` field is not a valid EVM address.                          | Fix the address and resubmit.                                                   |
| `400`  | `JWT has expired`                   | The validation token expired before you signed and submitted it.         | Request a new token, sign it, and submit immediately.                           |
| `400`  | `JWT signature is invalid`          | The token was not signed by Venice (likely tampered with or fabricated). | Always use a fresh token from the `GET` endpoint.                               |
| `400`  | `JWT claims are invalid`            | The token's issuer or audience does not match what Venice expects.       | Use the unmodified token returned by the `GET` endpoint.                        |
| `400`  | `JWT is malformed`                  | The submitted `token` is not a JWT.                                      | Ensure you are sending the exact `token` string returned by the `GET` endpoint. |
| `400`  | `Wallet signature does not match`   | The `signature` does not match the `address` for the given `token`.      | Sign the raw token bytes with the wallet that owns `address`.                   |
| `400`  | `Could not verify wallet signature` | RPC call to verify the signature failed (transient).                     | Retry with backoff.                                                             |
| `400`  | `Wallet has no staked VVV on Base`  | The wallet has zero sVVV balance.                                        | Stake VVV first, then retry.                                                    |

## Paying for inference

Minting a key and being able to call paid endpoints with it are two separate things. A freshly minted key authenticates correctly but cannot call paid endpoints (such as `/chat/completions`) until the wallet's account has a spendable balance.

The minted key can spend from the user account in this priority order: DIEM, then bundled credits, then USD.

| Funding source                   | Autonomous?  | How                                                                                                                                                                                                                                                |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DIEM from VVV staking**        | Yes          | The wallet's daily DIEM allocation is proportional to its share of the staking pool. The account needs at least 0.1 staked DIEM for any DIEM to be spendable. Larger stakes earn proportionally more daily DIEM, refreshed each epoch (00:00 UTC). |
| **USD via Stripe**               | No (browser) | Sign into venice.ai with the same wallet (Sign-In-With-Ethereum). The dashboard finds the existing user record. Add credits in Settings, API.                                                                                                      |
| **Coinbase crypto subscription** | No (browser) | Same wallet sign-in, then subscribe through the dashboard. The flow redirects to Coinbase Commerce for the actual payment, so it cannot be driven from a script.                                                                                   |
| **Coinbase onramp**              | No (browser) | Same wallet sign-in, then use the onramp widget in the dashboard. Hosted on Coinbase's UI.                                                                                                                                                         |

If the agent needs a fully crypto-native, headless funding path, the cleanest options are:

1. **Stake more VVV** so the daily DIEM allocation covers the agent's spend. The minted key picks this up automatically.
2. **Use the [x402 wallet flow](/overview/guides/x402-venice-api) instead of the API key.** With x402 the agent signs a SIWE message per request, tops up directly with USDC on Base via `POST /api/v1/x402/top-up`, and pays per request. The x402 USDC balance is wallet-bound, not user-bound, so it does not show up as balance for the minted Bearer key, but it does let the same wallet pay for inference programmatically.

## Related resources

<CardGroup>
  <Card title="Crypto and Agents" icon="link" href="/overview/guides/crypto-rpc-agents">
    Use Venice as both the model provider and the blockchain RPC layer for autonomous agents.
  </Card>

  <Card title="x402 Wallet Authentication" icon="wallet" href="/overview/guides/x402-venice-api">
    Pay per request with USDC on Base, no API key required.
  </Card>

  <Card title="Generate Web3 API Key Endpoint" icon="code" href="/api-reference/endpoint/api_keys/generate_web3_key/post">
    Endpoint reference for the mint endpoint.
  </Card>

  <Card title="Standard API Key Guide" icon="key" href="/overview/guides/generating-api-key">
    For users who prefer to mint a key from the dashboard.
  </Card>
</CardGroup>


# Hermes Agent
Source: https://docs.venice.ai/overview/guides/hermes-agent

Use Venice AI as your model provider in Hermes Agent

[Hermes Agent](https://hermes-agent.nousresearch.com) is an open-source, self-hosted AI agent built by [Nous Research](https://nousresearch.com). It features persistent memory, autonomous skill creation, and a built-in learning loop that gets more capable the longer it runs. Point it at the Venice API and your agent gets access to 230+ models and tools across text, image, video, audio, embeddings, and more.

<Card title="Hermes Agent Docs" icon="arrow-up-right-from-square" href="https://hermes-agent.nousresearch.com/docs/">
  Full documentation, provider setup, and configuration options on the official Hermes Agent docs.
</Card>

## Why Venice + Hermes Agent?

The Venice API gives your Hermes Agent access to the full Venice platform through a single OpenAI-compatible endpoint.

| Capability        | What you get                                                     |
| ----------------- | ---------------------------------------------------------------- |
| **Text and chat** | Private and anonymized models (GLM, Qwen, Claude, GPT, and more) |
| **Image**         | Generation, editing, upscaling, and background removal           |
| **Video**         | Generation and transcription                                     |
| **Audio**         | Speech synthesis (TTS), music generation, and speech-to-text     |
| **Embeddings**    | Vector embeddings for RAG and semantic search                    |
| **Tools**         | Web scraping, web search, text parsing, and crypto RPC           |

<CardGroup>
  <Card title="Private Inference" icon="shield-halved">
    Zero data retention. Prompts are never stored or logged
  </Card>

  <Card title="Persistent Memory" icon="brain">
    Hermes remembers context across sessions and restarts
  </Card>

  <Card title="15+ Platforms" icon="comments">
    Reach your agent on Telegram, Discord, Slack, WhatsApp, and more
  </Card>
</CardGroup>

## Setup

### 1. Install Hermes Agent

<Tabs>
  <Tab title="macOS / Linux">
    ```bash theme={"system"}
    curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
    ```
  </Tab>

  <Tab title="WSL2 (Windows)">
    Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) first, then run the same command:

    ```bash theme={"system"}
    curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
    ```
  </Tab>
</Tabs>

After installation, reload your shell:

```bash theme={"system"}
source ~/.zshrc   # or: source ~/.bashrc
```

### 2. Configure Venice as your provider

Run the model setup wizard:

```bash theme={"system"}
hermes model
```

Select **Custom endpoint (self-hosted / VLLM / etc.)** and enter the following when prompted:

| Field            | Value                          |
| ---------------- | ------------------------------ |
| **API base URL** | `https://api.venice.ai/api/v1` |
| **API key**      | Your Venice API key            |
| **Model name**   | A Venice model ID (see below)  |

Get an API key from [venice.ai/settings/api](https://venice.ai/settings/api) if you don't have one yet.

<Tip>
  You can also configure Venice directly in `~/.hermes/config.yaml`:

  ```yaml theme={"system"}
  model:
    default: zai-org-glm-5
    provider: custom
    base_url: https://api.venice.ai/api/v1
    api_key: ${VENICE_API_KEY}
  ```

  And set the key in `~/.hermes/.env`:

  ```bash theme={"system"}
  VENICE_API_KEY=your-key-here
  ```
</Tip>

### 3. Pick a model

When the wizard asks for a model, choose one based on your use case:

| Use case   | Model                   | Privacy    |
| ---------- | ----------------------- | ---------- |
| General    | `zai-org-glm-5`         | Private    |
| Reasoning  | `kimi-k2-6`             | Private    |
| Coding     | `claude-opus-4-7`       | Anonymized |
| Vision     | `z-ai-glm-5v-turbo`     | Anonymized |
| Uncensored | `venice-uncensored-1-2` | Private    |

Change your model anytime with no restart needed:

```bash theme={"system"}
hermes model              # full wizard
```

Or switch mid-session:

```text theme={"system"}
/model custom:claude-opus-4-7
```

### 4. Start chatting

Open the classic CLI or the modern TUI:

```bash theme={"system"}
hermes            # classic CLI
hermes --tui      # modern TUI (recommended)
```

Try a prompt to verify everything works:

```text theme={"system"}
Summarize this repo in 5 bullets and tell me what the main entrypoint is.
```

## Connect messaging platforms

Once the CLI works, connect your messaging apps through the gateway:

```bash theme={"system"}
hermes gateway setup
```

This walks you through connecting Telegram, Discord, Slack, WhatsApp, Signal, and other platforms. Your agent becomes reachable from any connected channel, all powered by Venice.

```bash theme={"system"}
hermes gateway      # start the messaging gateway
```

## Privacy modes

Venice models in Hermes Agent follow the same [privacy tiers](/overview/privacy) as the Venice API:

* **Private** models (GLM, Qwen, DeepSeek, Llama, Venice Uncensored) run on Venice's GPU fleet. Prompts are never stored or logged.
* **Anonymized** models (Claude, GPT, Gemini, Grok) are proxied through Venice with all identifying information stripped. The third-party provider sees Venice as the customer, not you.

## Venice API skills

Hermes Agent has a built-in skills system compatible with the [Agent Skills](https://github.com/veniceai/skills) format. Venice publishes official skills that teach your agent how to use every Venice endpoint (chat, image generation, video, audio, embeddings, augment tools, and more).

Install Venice skills directly from GitHub:

```bash theme={"system"}
hermes skills install veniceai/skills
```

Or search for individual skills:

```bash theme={"system"}
hermes skills search venice
```

Hermes will discover each skill by its `SKILL.md` frontmatter and load it on demand.

## Key commands

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `hermes`            | Start chatting                    |
| `hermes model`      | Change provider or model          |
| `hermes tools`      | Configure which tools are enabled |
| `hermes gateway`    | Start the messaging gateway       |
| `hermes --continue` | Resume your last session          |
| `hermes doctor`     | Diagnose issues                   |
| `hermes update`     | Update to the latest version      |

## Resources

<CardGroup>
  <Card title="Hermes Agent Docs" icon="book" href="https://hermes-agent.nousresearch.com/docs/">
    Official documentation
  </Card>

  <Card title="GitHub" icon="github" href="https://github.com/NousResearch/hermes-agent">
    Source code and releases
  </Card>

  <Card title="Venice Model Catalog" icon="list" href="/models/text">
    Browse available models
  </Card>

  <Card title="Venice Privacy" icon="shield-halved" href="/overview/privacy">
    How Venice protects your data
  </Card>
</CardGroup>


# Image Editing
Source: https://docs.venice.ai/overview/guides/image-editing

Edit, inpaint, composite, and remove backgrounds from images using Venice's synchronous image APIs

Image editing on Venice is synchronous. Send your source image to `/image/edit` or `/image/multi-edit` and the edited result comes back in the same response as a PNG file. For cutouts, `/image/background-remove` returns a transparent PNG.

<Warning>
  The image edit endpoints are experimental and model-specific behavior may change over time.
</Warning>

## Endpoints

| Endpoint                        | Purpose                             | Best for                                                |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `POST /image/edit`              | Edit a single image with a prompt   | General edits and prompt-driven inpainting              |
| `POST /image/multi-edit`        | Edit using 1-3 layered images       | More controlled edits with masks or overlays            |
| `POST /image/background-remove` | Remove the background from an image | Transparent cutouts for products, portraits, and assets |

## When to use which endpoint

* Use `/image/edit` when you have one source image and want to change, remove, or restyle part of it with a prompt.
* Use `/image/multi-edit` when you need extra control from masks, overlays, or reference layers.
* Use `/image/background-remove` when you only want a clean foreground subject with transparency.

<Note>
  For inpainting, use `/image/edit` or `/image/multi-edit`. The old `inpaint` parameter on `/image/generate` is deprecated.
</Note>

## Step 1: Edit a single image

Single-image edit is the simplest inpainting flow. Send one image plus a short prompt such as "remove the sign", "change the sky to sunrise", or "replace the background with a studio backdrop".

**Request:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/image/edit
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "qwen-edit",
  "prompt": "Replace the cloudy sky with a warm sunrise while preserving the buildings and canal",
  "image": "https://example.com/venice-canal.jpg"
}
```

**Response (200):**
The response body is raw `image/png` binary data. Save it directly to a file.

<CodeGroup>
  ```python Python theme={"system"}
  import base64
  import os
  import requests

  with open("input.jpg", "rb") as f:
      image_base64 = base64.b64encode(f.read()).decode("utf-8")

  response = requests.post(
      "https://api.venice.ai/api/v1/image/edit",
      headers={
          "Authorization": f"Bearer {os.environ['VENICE_API_KEY']}",
          "Content-Type": "application/json",
      },
      json={
          "model": "qwen-edit",
          "prompt": "Remove the tourist crowd from the square and keep the architecture intact",
          "image": image_base64,
      },
  )

  with open("edited.png", "wb") as f:
      f.write(response.content)
  ```

  ```javascript Node.js theme={"system"}
  import fs from "fs";

  const imageBase64 = fs.readFileSync("input.jpg").toString("base64");

  const response = await fetch("https://api.venice.ai/api/v1/image/edit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-edit",
      prompt: "Remove the tourist crowd from the square and keep the architecture intact",
      image: imageBase64,
    }),
  });

  const editedImage = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync("edited.png", editedImage);
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/image/edit \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -o edited.png \
    -d '{
      "model": "qwen-edit",
      "prompt": "Colorize this black and white portrait naturally",
      "image": "https://example.com/portrait-bw.jpg"
    }'
  ```
</CodeGroup>

## Step 2: Use multi-edit for masks or layered inpainting

`/image/multi-edit` accepts up to three images. The first image is the base image. The remaining images are treated as edit layers or masks, which gives you more control than prompt-only editing.

This is the better choice when you want to:

* target a specific region with a mask
* combine an existing composition with an overlay
* constrain the edit more tightly than a single-image prompt can

**JSON request:**

```json theme={"system"}
{
  "modelId": "qwen-edit",
  "prompt": "Replace the blank billboard area with a glowing Venice film festival poster while preserving lighting and perspective",
  "images": [
    "https://example.com/street-scene.png",
    "https://example.com/billboard-mask.png"
  ]
}
```

**Multipart request:**

```bash theme={"system"}
curl https://api.venice.ai/api/v1/image/multi-edit \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -F "modelId=qwen-edit" \
  -F "prompt=Replace the blank billboard area with a glowing Venice film festival poster while preserving lighting and perspective" \
  -F "images=@street-scene.png" \
  -F "images=@billboard-mask.png" \
  -o multi-edited.png
```

Like `/image/edit`, the response body is raw `image/png` data.

<Note>
  `/image/multi-edit` currently uses the `modelId` field rather than `model` in the request schema.
</Note>

***

## Inpainting tips

Prompt-based inpainting works best when the instruction is short and local:

* `remove the tree`
* `change the sky to sunset`
* `replace the logo with a blank sign`
* `restore the torn corner of the photo`

For broader scene changes, describe what should stay the same:

```text theme={"system"}
Replace the background with a modern photo studio backdrop while preserving the subject pose, facial features, and clothing.
```

If the edit keeps affecting the wrong area, switch from `/image/edit` to `/image/multi-edit` and provide a mask or overlay layer.

***

## Step 3: Remove the background

Use `/image/background-remove` when you want the foreground subject isolated on a transparent background. This endpoint returns a PNG with alpha transparency.

**Using an image URL:**

```bash theme={"system"}
curl https://api.venice.ai/api/v1/image/background-remove \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -o cutout.png \
  -d '{
    "image_url": "https://example.com/product-photo.jpg"
  }'
```

**Using a local file upload:**

```bash theme={"system"}
curl https://api.venice.ai/api/v1/image/background-remove \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -F "image=@product-photo.jpg" \
  -o cutout.png
```

Use background removal for:

* ecommerce product photos
* profile photos and portraits
* assets you plan to place over a new background

***

## Request Parameters

### `/image/edit`

| Parameter      | Type                        | Required   | Default       | Description                             |
| -------------- | --------------------------- | ---------- | ------------- | --------------------------------------- |
| `image`        | file, base64 string, or URL | Yes        | -             | Source image to edit                    |
| `prompt`       | string                      | Yes        | -             | Text instructions for the edit          |
| `model`        | string                      | No         | `qwen-edit`   | Edit model ID                           |
| `aspect_ratio` | string                      | No         | model default | Output ratio for models that support it |
| `modelId`      | string                      | Deprecated | -             | Deprecated alias for `model`            |

### `/image/multi-edit`

| Parameter | Type                                        | Required | Default     | Description                                                      |
| --------- | ------------------------------------------- | -------- | ----------- | ---------------------------------------------------------------- |
| `images`  | array of 1-3 files, base64 strings, or URLs | Yes      | -           | First image is the base image; the rest are edit layers or masks |
| `prompt`  | string                                      | Yes      | -           | Text instructions for how to combine or edit the layers          |
| `modelId` | string                                      | No       | `qwen-edit` | Edit model ID                                                    |

### `/image/background-remove`

| Parameter   | Type                  | Required                      | Description                 |
| ----------- | --------------------- | ----------------------------- | --------------------------- |
| `image`     | file or base64 string | One of `image` or `image_url` | Source image to cut out     |
| `image_url` | string                | One of `image` or `image_url` | Public image URL to cut out |

***

## Supported input formats

| Endpoint                   | JSON input             | Multipart input | Output      |
| -------------------------- | ---------------------- | --------------- | ----------- |
| `/image/edit`              | Base64 string or URL   | File upload     | `image/png` |
| `/image/multi-edit`        | Base64 strings or URLs | File uploads    | `image/png` |
| `/image/background-remove` | Base64 string or URL   | File upload     | `image/png` |

For edit endpoints, image dimensions must be at least `65536` pixels and no more than `33177600` pixels. Uploaded files must be under `25MB`.

***

## Models and pricing

The default edit model is `qwen-edit`, priced at **\$0.04 per edit**. Other edit-capable models may have different pricing and constraints.

See:

* [Image pricing](/overview/pricing)
* [Models API](/api-reference/endpoint/models/list) with `type=inpaint`

***

## Errors

| Status | Meaning                                 | Action                                                                  |
| ------ | --------------------------------------- | ----------------------------------------------------------------------- |
| `400`  | Invalid request parameters              | Check image count, field names, and input format                        |
| `401`  | Authentication failed                   | Check your API key                                                      |
| `402`  | Insufficient balance                    | Add credits at [venice.ai/settings/api](https://venice.ai/settings/api) |
| `415`  | Invalid content type                    | Use JSON or multipart form-data correctly                               |
| `429`  | Rate limit exceeded or model overloaded | Retry with backoff; check `Retry-After` header                          |
| `500`  | Inference processing failed             | Retry the request                                                       |
| `503`  | Model at capacity                       | Retry after a short delay                                               |

<Note>
  Some edit models have stricter content policies than image generation models. For example, `qwen-edit` blocks requests involving explicit sexual imagery, sexualized minors, or real-world violence.
</Note>

***

## Related Workflows

* Use [Image Generation](/overview/guides/image-generation) when you're starting from text instead of an existing image.
* Use [Image Models](/models/image) to compare generation, edit, and enhancement model families.
* Use [Image Edit API](/api-reference/endpoint/image/edit), [Multi-Edit API](/api-reference/endpoint/image/multi-edit), and [Background Remove API](/api-reference/endpoint/image/background-remove) for full schema details.


# Image Generation
Source: https://docs.venice.ai/overview/guides/image-generation

Generate images from text prompts using Venice's native image API or the OpenAI-compatible images endpoint

Image generation on Venice is synchronous. Send a prompt to `/image/generate` and receive your image in the same response, either as base64 inside JSON or as raw binary when `return_binary` is `true`.

## Endpoints

| Endpoint                   | Purpose                                | When to use                                           |
| -------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `POST /image/generate`     | Native Venice image generation API     | Use this for full feature support                     |
| `GET /image/styles`        | List available style presets           | Use this before sending `style_preset`                |
| `POST /images/generations` | OpenAI-compatible image generation API | Use this when migrating existing OpenAI image clients |

## Step 1: Send a generation request

**Request:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/image/generate
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "qwen-image-2",
  "prompt": "A cinematic photo of a gondola passing through a narrow Venice canal at blue hour, warm window lights reflecting on the water",
  "negative_prompt": "blurry, low quality, distorted anatomy, text, watermark",
  "width": 1024,
  "height": 1024,
  "format": "webp"
}
```

**Response (200):**

```json theme={"system"}
{
  "id": "generate-image-1234567890",
  "images": [
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoQABAAPm..."
  ],
  "timing": {
    "inferenceDuration": 1840,
    "inferencePreprocessingTime": 22,
    "inferenceQueueTime": 31,
    "total": 1893
  }
}
```

The `images` array contains base64-encoded image data. Decode the first item to save or display it. `timing.total` is the full request duration in milliseconds.

## Step 2: Decode and save the image

<CodeGroup>
  ```python Python theme={"system"}
  import base64
  import os
  import requests

  response = requests.post(
      "https://api.venice.ai/api/v1/image/generate",
      headers={
          "Authorization": f"Bearer {os.environ['VENICE_API_KEY']}",
          "Content-Type": "application/json",
      },
      json={
          "model": "qwen-image-2",
          "prompt": "A cinematic photo of a gondola passing through a narrow Venice canal at blue hour, warm window lights reflecting on the water",
          "width": 1024,
          "height": 1024,
          "format": "webp",
      },
  )

  data = response.json()
  image_bytes = base64.b64decode(data["images"][0])

  with open("output.webp", "wb") as f:
      f.write(image_bytes)

  print(f"Saved image from request {data['id']}")
  ```

  ```javascript Node.js theme={"system"}
  import fs from "fs";

  const response = await fetch("https://api.venice.ai/api/v1/image/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-image-2",
      prompt: "A cinematic photo of a gondola passing through a narrow Venice canal at blue hour, warm window lights reflecting on the water",
      width: 1024,
      height: 1024,
      format: "webp",
    }),
  });

  const data = await response.json();
  const imageBuffer = Buffer.from(data.images[0], "base64");
  fs.writeFileSync("output.webp", imageBuffer);

  console.log(`Saved image from request ${data.id}`);
  ```
</CodeGroup>

## Step 3: Return binary instead of JSON (optional)

If you want the response body to be the image file itself, set `return_binary: true`. This is useful when you want to stream or save the image directly without base64 decoding.

```bash theme={"system"}
curl https://api.venice.ai/api/v1/image/generate \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -o output.png \
  -d '{
    "model": "qwen-image-2",
    "prompt": "Minimalist poster of a moonlit Venetian bridge in deep blue tones",
    "format": "png",
    "return_binary": true
  }'
```

When `return_binary` is `true`, the response body is raw `image/jpeg`, `image/png`, or `image/webp` data based on the `format` you requested.

<Note>
  `variants` is only supported when `return_binary` is `false`.
</Note>

***

## Step 4: List available image styles (optional)

If you want to use `style_preset`, first fetch the available styles from `/image/styles`:

```bash theme={"system"}
curl https://api.venice.ai/api/v1/image/styles \
  -H "Authorization: Bearer $VENICE_API_KEY"
```

**Response (200):**

```json theme={"system"}
[
  "3D Model",
  "Analog Film",
  "Anime",
  "Cinematic",
  "Digital Art"
]
```

Then pass one of those values into your generation request:

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "A futuristic Venice skyline at sunrise",
  "style_preset": "Cinematic"
}
```

Use the styles endpoint when you want exact preset names instead of guessing them.

***

## Request Parameters

| Parameter           | Type    | Required    | Default         | Description                                                                    |
| ------------------- | ------- | ----------- | --------------- | ------------------------------------------------------------------------------ |
| `model`             | string  | Yes         | -               | Model ID to use for generation                                                 |
| `prompt`            | string  | Yes         | -               | What to generate                                                               |
| `negative_prompt`   | string  | No          | -               | What to avoid in the image                                                     |
| `width`             | integer | No          | `1024`          | Output width in pixels                                                         |
| `height`            | integer | No          | `1024`          | Output height in pixels                                                        |
| `format`            | string  | No          | `webp`          | Output format: `jpeg`, `png`, or `webp`                                        |
| `variants`          | integer | No          | `1`             | Number of images to generate (`1`-`4`), only when `return_binary` is `false`   |
| `return_binary`     | boolean | No          | `false`         | Return raw image bytes instead of base64 JSON                                  |
| `safe_mode`         | boolean | No          | `true`          | Blur adult content when enabled                                                |
| `seed`              | integer | No          | random          | Reuse the same seed for more consistent iterations                             |
| `cfg_scale`         | number  | No          | model-dependent | Higher values push the model to follow the prompt more closely                 |
| `style_preset`      | string  | No          | -               | Apply a preset style from [Image Styles](/api-reference/endpoint/image/styles) |
| `aspect_ratio`      | string  | Conditional | -               | Used by models that support ratio-based sizing                                 |
| `resolution`        | string  | Conditional | -               | Used by models that support resolution tiers such as `1K`, `2K`, or `4K`       |
| `enable_web_search` | boolean | Conditional | `false`         | Allows supported models to use current web information; adds extra cost        |

Validation is model-specific. Check [Image Models](/models/image) and the [Models API](/api-reference/endpoint/models/list) before relying on a parameter across multiple models.

***

## Model-specific options

### High-resolution generation

Some image models support `aspect_ratio` and `resolution` instead of simple `width` and `height`. For example:

```json theme={"system"}
{
  "model": "nano-banana-2",
  "prompt": "Editorial product photo of a luxury watch on black marble, dramatic studio lighting",
  "aspect_ratio": "16:9",
  "resolution": "2K"
}
```

Use [Image Models](/models/image) to see which models support higher resolutions and how they are priced.

### Style presets

If the selected model supports it, `style_preset` lets you steer the output without rewriting your whole prompt. You can fetch valid preset names from [Image Styles](/api-reference/endpoint/image/styles):

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "A futuristic Venice skyline at sunrise",
  "style_preset": "3D Model"
}
```

See [Image Styles](/api-reference/endpoint/image/styles) for the current style list.

***

## OpenAI-compatible endpoint

If you're already using OpenAI image SDKs or existing DALL-E integrations, Venice also supports `POST /images/generations`. It offers a simpler request format, but fewer features than the native Venice endpoint.

**Request:**

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "A clean isometric illustration of an AI control room",
  "size": "1024x1024",
  "response_format": "b64_json"
}
```

Use the OpenAI-compatible route for faster migrations. Use `/image/generate` when you need Venice-specific options such as `cfg_scale`, `style_preset`, `variants`, or binary responses.

***

## Prompting tips

1. Start with the subject, then add medium, lighting, composition, and mood.
2. Put must-avoid details in `negative_prompt` instead of overloading the main prompt.
3. Reuse `seed` when iterating so you can compare prompt changes without fully changing the composition.
4. Keep sizing model-aware. Some models work best with `width`/`height`, while others expect `aspect_ratio` and `resolution`.
5. Use `variants` during exploration, then switch back to a single output once you've locked in the direction.

***

## Errors

| Status | Meaning                                                      | Action                                                                  |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `400`  | Invalid request parameters                                   | Check field names, types, and model-specific constraints                |
| `401`  | Authentication failed or model requires a higher access tier | Check your API key and model access                                     |
| `402`  | Insufficient balance                                         | Add credits at [venice.ai/settings/api](https://venice.ai/settings/api) |
| `415`  | Invalid content type                                         | Send JSON with `Content-Type: application/json`                         |
| `429`  | Rate limit exceeded or model overloaded                      | Retry with backoff; check `Retry-After` header                          |
| `500`  | Inference processing failed                                  | Retry the request                                                       |
| `503`  | Model at capacity                                            | Retry after a short delay                                               |

<Note>
  When Safe Venice is enabled, inspect response headers such as `x-venice-is-blurred` and `x-venice-is-content-violation` if you need to detect moderation outcomes programmatically.
</Note>

***

## Available Models

See [Image Models](/models/image) for the current model list, pricing, and feature support.


# Additional Integrations
Source: https://docs.venice.ai/overview/guides/integrations

Third-party tools and community projects with Venice AI integrations.

[How to use Venice API](https://venice.ai/blog/how-to-use-venice-api) reference guide.

<Note>
  Several integrations have their own dedicated guides — see [AI Agents](/overview/guides/ai-agents), [OpenClaw](/overview/guides/openclaw-bot), [NanoClaw](/overview/guides/nanoclaw-venice), [Cursor](/overview/guides/cursor), [Claude Code](/overview/guides/claude-code), and [Codex CLI](/overview/guides/codex-cli).
</Note>

## Venice Confirmed Integrations

* Coding

  * [Cline](https://venice.ai/blog/how-to-use-the-venice-api-with-cline-in-vscode-a-developers-guide) (VSC Extension)

  * [ROO Code](https://venice.ai/blog/how-to-use-the-roo-ai-coding-assistant-in-private-with-venice-api-a-quick-guide) (VSC Extension)

  * [VOID IDE](https://venice.ai/blog/how-to-use-open-source-ai-code-editor-void-in-private-with-venice-api)

* Assistants

  * [Brave Leo Browser](https://venice.ai/blog/how-to-use-brave-leo-ai-with-venice-api-a-privacy-first-browser-ai-assistant)

## Community Confirmed

These integrations have been confirmed by the community. Venice is in the process of confirming these integrations and creating how-to guides for each of the following:

* Agents/Bots

  * [Venice AI Discord Bot](https://bobbiebeach.space/blog/venice-ai-discord-bot-full-setup-guide-features/)

  * [JanitorAI](https://janitorai.com/)

* Coding

  * [Aider](https://github.com/Aider-AI/aider), AI pair programming in your terminal

  * [Alexcodes.app](https://alexcodes.app/)

* Assistants

  * [Jan - Local AI Assistant](https://github.com/janhq/jan)

  * [llm-venice](https://github.com/ar-jan/llm-venice)

  * [unOfficial PHP SDK for Venice](https://github.com/georgeglarson/venice-ai-php)

  * [Msty](https://msty.app)

  * [Open WebUI](https://github.com/open-webui/open-webui)

  * [Librechat](https://www.librechat.ai/)

  * [ScreenSnapAI](https://screensnap.ai/)


# LangChain Integration
Source: https://docs.venice.ai/overview/guides/langchain

Use Venice AI with LangChain for chains, agents, and RAG pipelines

Venice AI works seamlessly with [LangChain](https://python.langchain.com/) thanks to full OpenAI SDK compatibility. Build chains, agents, and RAG pipelines with Venice's privacy-first infrastructure.

## Setup

```bash theme={"system"}
pip install langchain langchain-openai openai
```

## Chat Models

Use `ChatOpenAI` with Venice's base URL:

```python theme={"system"}
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="venice-uncensored-1-2",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    temperature=0.7,
)

response = llm.invoke("Explain privacy-preserving AI in 2 sentences.")
print(response.content)
```

## Streaming

```python theme={"system"}
for chunk in llm.stream("Write a haiku about decentralization."):
    print(chunk.content, end="", flush=True)
```

## Embeddings

```python theme={"system"}
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(
    model="text-embedding-bge-m3",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    check_embedding_ctx_length=False,  # Required for Venice
)

vectors = embeddings.embed_documents([
    "Venice AI provides private inference.",
    "No data is retained after processing.",
])
print(f"Embedding dimension: {len(vectors[0])}")
```

## Chains

### Simple Chain with Prompt Template

```python theme={"system"}
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a {role}. Answer concisely."),
    ("user", "{question}"),
])

chain = prompt | llm
response = chain.invoke({"role": "privacy expert", "question": "Why does zero data retention matter?"})
print(response.content)
```

### Sequential Chain

```python theme={"system"}
from langchain_core.output_parsers import StrOutputParser

# Chain 1: Generate a topic summary
summarizer = ChatPromptTemplate.from_messages([
    ("user", "Summarize this topic in 3 bullet points: {topic}")
]) | llm | StrOutputParser()

# Chain 2: Generate questions from summary
questioner = ChatPromptTemplate.from_messages([
    ("user", "Based on this summary, generate 3 thought-provoking questions:\n{summary}")
]) | llm | StrOutputParser()

# Compose
summary = summarizer.invoke({"topic": "decentralized AI inference"})
questions = questioner.invoke({"summary": summary})
print(questions)
```

## RAG Pipeline

Build a retrieval-augmented generation pipeline with Venice:

```python theme={"system"}
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# Initialize Venice models
llm = ChatOpenAI(
    model="zai-org-glm-5-1",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-bge-m3",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    check_embedding_ctx_length=False,
)

# Load and split documents
documents = [
    "Venice AI provides private, uncensored AI inference with zero data retention.",
    "The Venice API is OpenAI-compatible, supporting chat completions, images, audio, video, and embeddings.",
    "Venice supports function calling, structured outputs, web search, and reasoning models.",
    "Privacy levels include Private (zero retention) and Anonymized (third-party processed).",
]

# Create vector store
vectorstore = FAISS.from_texts(documents, embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

# RAG prompt
rag_prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer the question based only on the following context:\n\n{context}"),
    ("user", "{question}"),
])

# RAG chain
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | rag_prompt
    | llm
    | StrOutputParser()
)

answer = rag_chain.invoke("What privacy levels does Venice offer?")
print(answer)
```

## Function Calling with Agents

```python theme={"system"}
from langchain_core.tools import tool
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

# Use a function-calling capable model
llm = ChatOpenAI(
    model="zai-org-glm-5-1",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
)

@tool
def get_venice_model_price(model_id: str) -> str:
    """Get the pricing for a Venice AI model."""
    prices = {
        "venice-uncensored-1-2": "Input: $0.20/1M, Output: $0.90/1M",
        "zai-org-glm-5-1": "Input: $1.75/1M, Output: $5.50/1M",
        "qwen3-5-9b": "Input: $0.10/1M, Output: $0.15/1M",
    }
    return prices.get(model_id, f"Model {model_id} not found in price list.")

prompt = ChatPromptTemplate.from_messages([
    ("system", "You help users find the right Venice AI model. Use tools when needed."),
    ("placeholder", "{chat_history}"),
    ("user", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, [get_venice_model_price], prompt)
executor = AgentExecutor(agent=agent, tools=[get_venice_model_price], verbose=True)

result = executor.invoke({"input": "What's the cheapest Venice text model?", "chat_history": []})
print(result["output"])
```

## Structured Output

```python theme={"system"}
from pydantic import BaseModel, Field

class MovieReview(BaseModel):
    title: str = Field(description="Movie title")
    rating: float = Field(description="Rating out of 10")
    summary: str = Field(description="One-sentence summary")

structured_llm = llm.with_structured_output(MovieReview)
review = structured_llm.invoke("Review the movie Inception")
print(f"{review.title}: {review.rating}/10 — {review.summary}")
```

## Web Search Integration

Use Venice's built-in web search via `venice_parameters`:

```python theme={"system"}
from langchain_openai import ChatOpenAI

llm_with_search = ChatOpenAI(
    model="venice-uncensored",
    api_key="your-venice-api-key",
    base_url="https://api.venice.ai/api/v1",
    extra_body={
        "venice_parameters": {
            "enable_web_search": "auto"
        }
    }
)

response = llm_with_search.invoke("What are the latest developments in AI this week?")
print(response.content)
```

Or pass it per-request:

```python theme={"system"}
response = llm.invoke(
    "What are the latest developments in AI this week?",
    extra_body={"venice_parameters": {"enable_web_search": "auto"}}
)
```

## Recommended Models for LangChain

| Use Case             | Model                            | Why                           |
| -------------------- | -------------------------------- | ----------------------------- |
| General chains       | `venice-uncensored`              | Fast, cheap, uncensored       |
| Complex reasoning    | `zai-org-glm-5-1`                | Best private flagship model   |
| Function calling     | `zai-org-glm-5-1`                | Reliable tool use             |
| Vision + text        | `qwen3-vl-235b-a22b`             | Advanced vision understanding |
| Code generation      | `qwen3-coder-480b-a35b-instruct` | Optimized for code            |
| Embeddings (RAG)     | `text-embedding-bge-m3`          | Private embeddings            |
| Budget / high-volume | `qwen3-5-9b`                     | \$0.10/1M input               |

<Card title="View All Models" icon="database" href="/models/overview">
  Browse all Venice models with pricing and capabilities
</Card>


# NanoClaw
Source: https://docs.venice.ai/overview/guides/nanoclaw-venice

Run a personal AI assistant on WhatsApp and Telegram powered by Venice AI

[NanoClaw](https://github.com/qwibitai/nanoclaw) is a lightweight, self-hosted AI assistant that runs on WhatsApp and Telegram. This fork adds Venice AI support so everything runs privately without an Anthropic subscription.

<CardGroup>
  <Card title="Pay Per Token" icon="coins">
    No subscription. Pay only for what you use
  </Card>

  <Card title="Private Inference" icon="shield-halved">
    Zero data retention on Venice servers
  </Card>

  <Card title="Docker Isolation" icon="cube">
    Each chat runs in its own secure container
  </Card>
</CardGroup>

***

## Why Venice AI?

[Venice](https://venice.ai) is a privacy-first AI platform. They [don't store or log any prompts or responses](https://venice.ai/privacy) on their servers — your conversations exist only on your device. Requests are encrypted end-to-end through their proxy to decentralized GPU providers, with zero data retention. This means your AI assistant conversations stay private, even from Venice themselves.

Venice provides anonymized access to frontier models (Claude Opus, Claude Sonnet) and fully private access to open-source models (GLM, Qwen) through a single API — switch between them anytime.

|                          | **Venice AI**                                                                                           | **Traditional AI providers**                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Data retention**       | None — zero logs                                                                                        | Yes                                            |
| **Prompt privacy**       | Encrypted, never stored                                                                                 | Stored on provider servers                     |
| **Open-source models**   | Yes (GLM, Qwen, and others)                                                                             | No                                             |
| **Frontier models**      | Claude, GPT, and others — anonymously                                                                   | Only through direct subscriptions              |
| **Pricing**              | Pay-per-token, no subscription. Or stake [DIEM](https://venice.ai/lp/diem) for daily refreshing credits | \$20–200/mo subscriptions or pay-per-token API |
| **Uncensored inference** | Yes (open-source models)                                                                                | No                                             |

***

## Why NanoClaw?

NanoClaw is a clean, minimal alternative to larger platforms like OpenClaw. It's designed for one person running one bot.

|                         | **NanoClaw (Venice)**                                     | **OpenClaw**                                   |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| **Codebase**            | \~2,000 lines, handful of files                           | \~500,000 lines, 53 config files               |
| **Dependencies**        | \~15 packages                                             | 70+ packages                                   |
| **Security model**      | OS-level Docker container isolation                       | Application-level allowlists and pairing codes |
| **Per-group isolation** | Each group gets its own container, filesystem, and memory | Shared process, shared memory                  |
| **Setup**               | One wizard (`/setup`), \~10 minutes                       | Manual multi-step configuration                |
| **AI provider**         | Venice AI (private, no subscription)                      | Anthropic (requires API key or subscription)   |
| **Customization**       | Edit the code directly — it's small enough to read        | Config files and plugins                       |
| **Target user**         | One person, one bot                                       | Multi-user platform                            |

***

## What You Get

* Personal AI assistant on **Telegram** and/or **WhatsApp**
* Powered by **Venice AI** — no Anthropic account needed
* Bot runs in an **isolated Docker container** (sandboxed, can't access your system)
* **Model switching** — tell the bot "switch to zai-org-glm-5" or "use opus" anytime
* **Scheduled tasks** — set reminders, recurring tasks
* **Web search and browsing** built in
* **Markdown formatting** in Telegram messages

***

## Prerequisites

<CardGroup>
  <Card title="Node.js 20+" icon="node-js" href="https://nodejs.org/">
    Check with `node --version`
  </Card>

  <Card title="Docker" icon="docker" href="https://docker.com/products/docker-desktop">
    Install and open once so it's running
  </Card>

  <Card title="Claude Code CLI" icon="terminal" href="https://claude.ai/download">
    Check with `claude --version`
  </Card>

  <Card title="Venice API Key" icon="key" href="https://venice.ai/settings/api">
    Generate from your Venice account
  </Card>
</CardGroup>

**For Telegram** (recommended for first-time users):

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Save the token BotFather gives you (looks like `123456789:ABCdef...`)

<Warning>
  **For WhatsApp — use a virtual number, NOT your personal one:**

  NanoClaw connects as a linked device on your WhatsApp number. That means **the agent can see every message coming in and going out** — all your personal conversations, group chats, photos, everything. Your phone still works normally, but the bot has full visibility into your entire WhatsApp account.

  **Use a virtual phone number instead.** These apps give you a second number that you can dedicate entirely to the bot:

  | App                                      | Price    | Notes                                                        |
  | ---------------------------------------- | -------- | ------------------------------------------------------------ |
  | [Hushed](https://hushed.com)             | \~\$5/mo | Reliable, works well for WhatsApp verification               |
  | [Burner](https://www.burnerapp.com)      | \~\$5/mo | Similar to Hushed, disposable numbers                        |
  | [Google Voice](https://voice.google.com) | Free     | US-only, may not work for WhatsApp verification in all cases |

  **How to set it up:**

  1. Get a virtual number from one of the apps above
  2. Install WhatsApp on a second device (old phone, tablet, or emulator) using that virtual number
  3. During NanoClaw setup, scan the QR code with that second device — not your personal phone
</Warning>

***

## Setup

The setup takes about 10 minutes. You only need **one Terminal window**.

<Steps>
  <Step title="Clone and Install">
    Open Terminal and run:

    ```bash theme={"system"}
    git clone https://github.com/lorenzovenice/nanoclaw-venice.git
    cd nanoclaw-venice
    npm install
    ```

    Wait for `npm install` to finish with no errors.
  </Step>

  <Step title="Launch Claude Code with Venice">
    Replace `your-key` with your Venice API key and run:

    ```bash theme={"system"}
    VENICE_API_KEY=your-key npm run venice
    ```

    This starts the Venice proxy and launches Claude Code through it in a single command.

    <Note>
      Claude Code defaults to **GLM 5** (`zai-org-glm-5`) to keep setup costs low. After setup, type `/model` inside Claude Code to switch to `claude-sonnet-4-6` or `claude-opus-4-6` for best performance.
    </Note>

    If prompted "Do you want to use this API key?" — select **Yes**.
  </Step>

  <Step title="Run the Setup Wizard">
    In your Claude Code terminal, type:

    ```
    /setup
    ```

    The wizard walks you through:

    1. **Bootstrap** — checks Node.js and dependencies
    2. **Venice API key** — validates and saves your key
    3. **Channel choice** — pick WhatsApp, Telegram, or both
    4. **Container build** — builds the Docker container (takes a few minutes first time)
    5. **WhatsApp auth** — scan QR code with your phone (if applicable)
    6. **Telegram setup** — send a message to your bot so it detects your chat
    7. **Trigger word** — prefix that activates the bot (default: `@Andy`)
    8. **Mount directories** — pick "No" for now (you can add file access later)
    9. **Start services** — NanoClaw and the Venice proxy both start as background services

    The setup wizard installs two background services:

    * **NanoClaw** — the bot itself
    * **Venice proxy** — a small local server (localhost:4001) that translates between Claude Code and Venice AI

    Both start automatically on boot and restart themselves if they crash.

    <Note>
      If the wizard stops between steps, type "continue" or "next step" to nudge it forward.
    </Note>
  </Step>

  <Step title="Start Chatting">
    Once setup is complete, open your chat (Telegram or WhatsApp) and send:

    ```
    @Andy hello, are you there?
    ```

    The bot should respond within seconds. In your main channel, you can type normally without the `@Andy` prefix.

    **You can now close the terminal window.** Everything runs as background services and starts automatically when your computer boots.
  </Step>
</Steps>

***

## How It Works

There are two layers to NanoClaw:

| Layer               | What It Does                                                 |
| ------------------- | ------------------------------------------------------------ |
| **Claude Code CLI** | Admin tool for setup, debugging, and customization           |
| **The Bot**         | AI in your chat, running inside an isolated Docker container |

To open Claude Code anytime:

```bash theme={"system"}
cd nanoclaw-venice
ANTHROPIC_BASE_URL=http://localhost:4001 ANTHROPIC_API_KEY=venice-proxy claude
```

Use it to run `/setup`, `/debug`, `/customize`, or make changes to the bot's behavior.

***

## Models

| Context         | Default Model           | How to Switch                                          |
| --------------- | ----------------------- | ------------------------------------------------------ |
| Bot (in chat)   | `claude-sonnet-4-6`     | Tell the bot: "switch to opus" or "use zai-org-glm-5"  |
| Claude Code CLI | `zai-org-glm-5` (GLM 5) | Use `/model` in Claude Code or `claude --model <name>` |

<Tip>
  The CLI defaults to GLM 5 to keep setup costs low. After setup, switch to `claude-sonnet-4-6` or `claude-opus-4-6` for best performance.
</Tip>

See the [model catalog](/models/text) for all available Venice models.

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="The proxy isn't running">
    The Venice proxy runs as a background service and restarts itself automatically. If it's not working:

    **macOS:**

    ```bash theme={"system"}
    # Check if it's running
    launchctl list | grep venice-proxy

    # Restart it
    launchctl kickstart -k gui/$(id -u)/com.nanoclaw.venice-proxy

    # Check logs
    tail -f ~/nanoclaw-venice/logs/venice-proxy.log
    ```

    **Linux:**

    ```bash theme={"system"}
    # Check if it's running
    systemctl --user status nanoclaw-venice-proxy

    # Restart it
    systemctl --user restart nanoclaw-venice-proxy

    # Check logs
    tail -f ~/nanoclaw-venice/logs/venice-proxy.log
    ```
  </Accordion>

  <Accordion title="Claude Code shows 403 error or 'Please run /login'">
    This means Claude Code can't connect to the Venice proxy.

    1. **Check the proxy is running.** See the troubleshooting step above.
    2. **Make sure you're in the right folder.** Always `cd nanoclaw-venice` first.
    3. **Start fresh:** Close all terminals and run:
       ```bash theme={"system"}
       cd nanoclaw-venice
       ANTHROPIC_BASE_URL=http://localhost:4001 ANTHROPIC_API_KEY=venice-proxy claude
       ```
  </Accordion>

  <Accordion title="Model errors ('model does not exist')">
    Restart the proxy and the bot:

    **macOS:**

    ```bash theme={"system"}
    # Restart proxy
    launchctl kickstart -k gui/$(id -u)/com.nanoclaw.venice-proxy

    # Restart bot
    launchctl kickstart -k gui/$(id -u)/com.nanoclaw
    ```

    **Linux:**

    ```bash theme={"system"}
    # Restart proxy
    systemctl --user restart nanoclaw-venice-proxy

    # Restart bot
    systemctl --user restart nanoclaw
    ```

    Check available models at the [model catalog](/models/text).
  </Accordion>

  <Accordion title="Bot doesn't respond to messages">
    Work through these steps in order:

    1. **Check your trigger word.** Make sure you're using the right prefix (e.g., `@Andy hello`).
    2. **Check Docker is running.** Run `docker info` — if it errors, open Docker Desktop.
    3. **Check the proxy is running.** See "The proxy isn't running" above.
    4. **Check logs:** `tail -f logs/nanoclaw.log` in the project folder.
    5. **Check container logs.** Open the `nanoclaw-venice/groups/main/logs/` folder. Open the most recent file that starts with `container-`.
    6. **Restart everything:** Restart both proxy and bot (see above).
  </Accordion>

  <Accordion title="Container build fails during setup">
    Make sure Docker Desktop is open and running. Wait 10 seconds for Docker to fully start, then type `continue` in the wizard to retry.
  </Accordion>

  <Accordion title="WhatsApp disconnected">
    Your WhatsApp session can expire. To reconnect:

    ```bash theme={"system"}
    cd nanoclaw-venice
    npm run auth
    ```

    Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device), then restart the bot:

    * macOS: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
    * Linux: `systemctl --user restart nanoclaw`
  </Accordion>
</AccordionGroup>

***

## Advanced

<AccordionGroup>
  <Accordion title="Give the bot access to files on your computer">
    By default, the bot is completely walled off from your computer — it can only see its own memory and conversation history.

    * **During setup:** When asked about directory access, choose "Yes"
    * **After setup:** Run `/customize` in Claude Code
  </Accordion>

  <Accordion title="Manually start/stop the bot">
    NanoClaw runs two background services that start automatically on boot.

    **macOS:**

    | Action        | Command                                                                   |
    | ------------- | ------------------------------------------------------------------------- |
    | Start bot     | `launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist`                |
    | Stop bot      | `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`              |
    | Restart bot   | `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`                        |
    | Start proxy   | `launchctl load ~/Library/LaunchAgents/com.nanoclaw.venice-proxy.plist`   |
    | Stop proxy    | `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.venice-proxy.plist` |
    | Restart proxy | `launchctl kickstart -k gui/$(id -u)/com.nanoclaw.venice-proxy`           |

    **Linux:**

    | Action        | Command                                          |
    | ------------- | ------------------------------------------------ |
    | Start bot     | `systemctl --user start nanoclaw`                |
    | Stop bot      | `systemctl --user stop nanoclaw`                 |
    | Restart bot   | `systemctl --user restart nanoclaw`              |
    | Start proxy   | `systemctl --user start nanoclaw-venice-proxy`   |
    | Stop proxy    | `systemctl --user stop nanoclaw-venice-proxy`    |
    | Restart proxy | `systemctl --user restart nanoclaw-venice-proxy` |
  </Accordion>

  <Accordion title="Using Claude Code through Venice (no bot)">
    If you just want Claude Code with Venice and don't need WhatsApp/Telegram, the proxy service needs to be running. If you've already run `/setup`, it's already running as a background service.

    ```bash theme={"system"}
    cd nanoclaw-venice
    ANTHROPIC_BASE_URL=http://localhost:4001 ANTHROPIC_API_KEY=venice-proxy claude
    ```

    **Tip:** Add this to your `~/.zshrc` (or `~/.bashrc`) so you can quickly switch any terminal to Venice:

    ```bash theme={"system"}
    alias venice='export ANTHROPIC_BASE_URL=http://localhost:4001 && export ANTHROPIC_API_KEY=venice-proxy && echo "Using Venice API"'
    alias anthropic='unset ANTHROPIC_BASE_URL && unset ANTHROPIC_API_KEY && echo "Using Anthropic API"'
    ```

    Then just type `venice` in any terminal before running `claude` to use Venice, or `anthropic` to switch back.
  </Accordion>

  <Accordion title="Running multiple bots">
    You can run multiple NanoClaw bots on the same machine (e.g., one for personal use and one for a team). Just clone the repo into a different folder and run setup again. Note: they share the same Docker image, so rebuilding one affects all of them.
  </Accordion>

  <Accordion title="Developer commands">
    For people who want to modify NanoClaw's code:

    ```bash theme={"system"}
    npm run dev          # Start proxy + NanoClaw with hot reload
    npm run proxy        # Start just the Venice proxy
    npm run build        # Compile TypeScript
    npm test             # Run tests
    ./container/build.sh # Rebuild agent container
    ```
  </Accordion>
</AccordionGroup>

***

## Architecture

```
You (WhatsApp/Telegram)
        ↓
   NanoClaw (Node.js)
        ↓
   Docker Container (isolated sandbox)
        ↓
   Venice Proxy (localhost:4001)
        ↓
   api.venice.ai (private inference)
```

| File                       | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `proxy/venice-proxy.ts`    | Translates Anthropic format to OpenAI format for Venice |
| `src/index.ts`             | Main orchestrator — message loop, agent invocation      |
| `src/channels/whatsapp.ts` | WhatsApp connection via baileys                         |
| `src/channels/telegram.ts` | Telegram bot via grammy                                 |
| `src/container-runner.ts`  | Spawns isolated agent containers                        |

***

## FAQ

<AccordionGroup>
  <Accordion title="Why do I need a proxy?">
    The Claude Agent SDK speaks Anthropic's message format. Venice speaks OpenAI's format. The proxy translates between them so everything works without modifying the SDK.
  </Accordion>

  <Accordion title="Can I use open-source models?">
    Yes. Venice hosts many models. Tell the bot "switch to zai-org-glm-5" or any Venice model ID. See the [model catalog](/models/text).
  </Accordion>

  <Accordion title="Is it secure?">
    Agents run in Docker containers with real OS-level isolation. The Venice API key is passed via stdin, never written to disk inside containers. Each group gets its own isolated environment.
  </Accordion>

  <Accordion title="Do I need an Anthropic subscription?">
    No. Everything runs through Venice AI. You only need a Venice API key.
  </Accordion>

  <Accordion title="Can I use this on a server?">
    Yes. It works on any Linux machine with Docker. Use the systemd service for auto-start on boot.
  </Accordion>
</AccordionGroup>

***

## Resources

<CardGroup>
  <Card title="NanoClaw Venice Repo" icon="github" href="https://github.com/lorenzovenice/nanoclaw-venice">
    Source code and full README
  </Card>

  <Card title="Original NanoClaw" icon="github" href="https://github.com/qwibitai/nanoclaw">
    Upstream project by qwibitai
  </Card>

  <Card title="Venice Model Catalog" icon="list" href="/models/text">
    Browse available models
  </Card>

  <Card title="Venice Privacy" icon="shield-halved" href="/overview/privacy">
    How Venice protects your data
  </Card>
</CardGroup>


# Migrate from OpenAI
Source: https://docs.venice.ai/overview/guides/openai-migration

Switch from OpenAI to Venice AI in minutes — same SDK, more privacy, uncensored

Venice AI is a **drop-in replacement** for OpenAI. Same SDK, same code — just change two lines. Get privacy-first inference, uncensored models, and competitive pricing.

## The 2-Line Migration

### Python

```python theme={"system"}
# Before (OpenAI)
from openai import OpenAI
client = OpenAI()

# After (Venice) — change api_key and base_url
from openai import OpenAI
client = OpenAI(
    api_key="your-venice-api-key",          # ← Change 1
    base_url="https://api.venice.ai/api/v1"  # ← Change 2
)
```

### Node.js

```javascript theme={"system"}
// Before (OpenAI)
import OpenAI from 'openai';
const client = new OpenAI();

// After (Venice)
import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: 'your-venice-api-key',
  baseURL: 'https://api.venice.ai/api/v1',
});
```

### cURL

```bash theme={"system"}
# Before
curl https://api.openai.com/v1/chat/completions ...

# After — just change the URL and key
curl https://api.venice.ai/api/v1/chat/completions ...
```

### Environment Variables

```bash theme={"system"}
# Before
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1

# After
OPENAI_API_KEY=your-venice-api-key
OPENAI_BASE_URL=https://api.venice.ai/api/v1
```

<Tip>
  Many libraries and tools read `OPENAI_API_KEY` and `OPENAI_BASE_URL` automatically. Just updating these env vars may be all you need.
</Tip>

## Model Mapping

| OpenAI Model           | Venice Equivalent                              | Type       | Pricing (Input/Output per 1M) |
| ---------------------- | ---------------------------------------------- | ---------- | ----------------------------- |
| gpt-4o                 | `zai-org-glm-4.7` (Private)                    | Text       | $0.55 / $2.65                 |
| gpt-4o                 | `openai-gpt-52` (Anonymized)                   | Text       | $2.19 / $17.50                |
| gpt-4o-mini            | `qwen3-4b`                                     | Text       | $0.05 / $0.15                 |
| gpt-4-turbo            | `mistral-31-24b`                               | Text       | $0.50 / $2.00                 |
| o1 / o3                | `qwen3-235b-a22b-thinking-2507` (Private)      | Reasoning  | $0.45 / $3.50                 |
| o1 / o3                | `grok-41-fast` (Anonymized)                    | Reasoning  | $0.50 / $1.25                 |
| gpt-4-vision           | `mistral-31-24b` or `qwen3-vl-235b-a22b`       | Vision     | $0.50 / $2.00                 |
| text-embedding-3-small | `text-embedding-bge-m3`                        | Embeddings | $0.15 / $0.60                 |
| dall-e-3               | `qwen-image` (Private, \$0.01) or `flux-2-pro` | Image      | From \$0.01                   |
| whisper                | `nvidia/parakeet-tdt-0.6b-v3`                  | STT        | \$0.0001/sec                  |
| tts-1                  | `tts-kokoro`                                   | TTS        | \$3.50/1M chars               |

## Feature Compatibility

| Feature           | OpenAI | Venice | Notes                                         |
| ----------------- | ------ | ------ | --------------------------------------------- |
| Chat Completions  | ✅      | ✅      | Fully compatible                              |
| Streaming         | ✅      | ✅      | SSE format identical                          |
| Function Calling  | ✅      | ✅      | Same `tools` parameter                        |
| Structured Output | ✅      | ✅      | Same `response_format`                        |
| Vision            | ✅      | ✅      | Same content array format                     |
| Embeddings        | ✅      | ✅      | Same API                                      |
| Image Generation  | ✅      | ✅      | OpenAI-compatible via `/images/generations`\* |
| TTS               | ✅      | ✅      | Compatible                                    |
| STT               | ✅      | ✅      | Compatible                                    |
| Assistants API    | ✅      | ❌      | Use Characters or Minds instead               |
| Batch API         | ✅      | ❌      | Not yet available                             |
| Fine-tuning       | ✅      | ❌      | Not available                                 |

\*Venice also provides an OpenAI-compatible endpoint at `POST /images/generations` for easier migration from DALL-E. For Venice's native image API with additional options, see [Image Generate](/api-reference/endpoint/image/generate).

## Venice-Only Features

Venice offers capabilities OpenAI doesn't:

### 1. Built-in Web Search

```python theme={"system"}
response = client.chat.completions.create(
    model="venice-uncensored",
    messages=[{"role": "user", "content": "Latest AI news today"}],
    extra_body={
        "venice_parameters": {
            "enable_web_search": "auto"
        }
    }
)
```

### 2. Web Scraping

```python theme={"system"}
response = client.chat.completions.create(
    model="venice-uncensored",
    messages=[{"role": "user", "content": "Summarize https://example.com/article"}],
    extra_body={
        "venice_parameters": {
            "enable_web_scraping": True
        }
    }
)
```

### 3. Characters (AI Personas)

```python theme={"system"}
response = client.chat.completions.create(
    model="venice-uncensored",
    messages=[{"role": "user", "content": "Tell me about yourself"}],
    extra_body={
        "venice_parameters": {
            "character_slug": "venice-ai"
        }
    }
)
```

### 4. Uncensored Models

Venice's private models have no content filtering, making them suitable for:

* Creative writing without guardrails
* Security research and red teaming
* Honest analysis without refusal patterns
* Medical/legal information without disclaimers

### 5. Video Generation

```python theme={"system"}
# Queue a video generation job
import requests

response = requests.post(
    "https://api.venice.ai/api/v1/video/queue",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    json={
        "model": "wan-2.6-text-to-video",
        "prompt": "A serene lake at sunset with gentle waves",
        "resolution": "720p",
        "duration": 5,
    }
)
job_id = response.json()["id"]
```

## Why Migrate?

### Privacy

* **Zero data retention** on private models — your prompts are never stored
* **No training on your data** — ever
* OpenAI retains data for 30 days and may use it for safety research

### Cost

* Private models are **often cheaper** than OpenAI equivalents
* `qwen3-4b` at \$0.05/1M input is 10x cheaper than gpt-4o-mini
* `venice-uncensored` at $0.20/1M input vs gpt-4o at $2.50/1M

### Freedom

* **No content filtering** on uncensored models
* No account suspensions for controversial use cases
* Web3-native with crypto payment options
* DIEM staking for daily credits

### Model Diversity

* Access to models from multiple providers (Qwen, Llama, Mistral, Gemma, Claude, GPT, Grok, etc.)
* Switch between private and anonymized models per request
* New models added regularly

## Framework Migration

Most AI frameworks work with Venice by changing the base URL:

| Framework     | Change Required                     |
| ------------- | ----------------------------------- |
| LangChain     | `base_url` in `ChatOpenAI`          |
| Vercel AI SDK | `baseURL` in `createOpenAI`         |
| CrewAI        | `OPENAI_API_BASE` env var           |
| LlamaIndex    | `api_base` in `OpenAI`              |
| AutoGen       | `base_url` in config                |
| Haystack      | `api_base_url` in `OpenAIGenerator` |
| Claude Code   | `--api-base` flag or env var        |
| Cursor        | Custom API endpoint in settings     |
| Continue.dev  | `apiBase` in config.json            |

<Card title="Get Your API Key" icon="key" href="https://venice.ai/settings/api">
  Generate a Venice API key and start migrating in minutes
</Card>


# OpenClaw
Source: https://docs.venice.ai/overview/guides/openclaw-bot

Use Venice AI as your model provider in OpenClaw

[OpenClaw](https://openclaw.ai) is an open-source, self-hosted AI gateway that connects messaging platforms (WhatsApp, Telegram, Discord, iMessage, Slack) to AI models. Venice AI is available as a built-in provider, giving you access to private and uncensored models from any connected channel.

<Card title="Official Venice Provider Guide" icon="arrow-up-right-from-square" href="https://docs.openclaw.ai/providers/venice">
  Full setup instructions, model list, and configuration options on the OpenClaw docs.
</Card>

## Setup

### 1. Install OpenClaw

<Tabs>
  <Tab title="macOS / Linux">
    ```bash theme={"system"}
    curl -fsSL https://openclaw.ai/install.sh | bash
    ```
  </Tab>

  <Tab title="Windows">
    ```powershell theme={"system"}
    iwr -useb https://openclaw.ai/install.ps1 | iex
    ```
  </Tab>

  <Tab title="npm">
    ```bash theme={"system"}
    npm install -g openclaw@latest
    ```
  </Tab>
</Tabs>

### 2. Run the onboarding wizard

```bash theme={"system"}
openclaw onboard
```

The wizard will walk you through setup. When prompted, select **Venice AI** as your provider from the list, then paste your API key. Get one from [venice.ai/settings/api](https://venice.ai/settings/api) if you don't have one yet.

### 3. Pick a model

During onboarding, OpenClaw shows all available Venice models. Some recommendations:

| Use case   | Model                       | Privacy    |
| ---------- | --------------------------- | ---------- |
| General    | `venice/zai-org-glm-5`      | Private    |
| Reasoning  | `venice/kimi-k2-5`          | Private    |
| Coding     | `venice/claude-opus-4-6`    | Anonymized |
| Vision     | `venice/qwen3-vl-235b-a22b` | Private    |
| Uncensored | `venice/venice-uncensored`  | Private    |

Change your default model anytime:

```bash theme={"system"}
openclaw models set venice/zai-org-glm-5
```

List all available models:

```bash theme={"system"}
openclaw models list | grep venice
```

### 4. Start chatting

Open the terminal UI:

```bash theme={"system"}
openclaw tui
```

Or the web dashboard:

```bash theme={"system"}
openclaw dashboard
```

Or connect a messaging channel (WhatsApp, Telegram, Discord, etc.):

```bash theme={"system"}
openclaw channels login
openclaw gateway
```

## Privacy modes

Venice models in OpenClaw follow the same [privacy tiers](/overview/privacy) as the Venice API:

* **Private** models (GLM, Qwen, DeepSeek, Llama, Venice Uncensored) run on Venice's GPU fleet. Prompts are never stored or logged.
* **Anonymized** models (Claude, GPT, Gemini, Grok) are proxied through Venice with all identifying information stripped. The third-party provider sees Venice as the customer, not you.

## Image and video generation

Install the Venice AI Media skill for image and video generation:

```bash theme={"system"}
openclaw skills install nhannah/venice-ai-media
```

## Resources

<CardGroup>
  <Card title="OpenClaw Docs" icon="book" href="https://docs.openclaw.ai/">
    Official documentation
  </Card>

  <Card title="Venice Provider Guide" icon="puzzle-piece" href="https://docs.openclaw.ai/providers/venice">
    Full Venice setup reference
  </Card>
</CardGroup>


# Using Postman
Source: https://docs.venice.ai/overview/guides/postman



## Overview

Venice provides a comprehensive Postman collection that allows developers to explore and test the full capabilities of our API. This collection includes pre-configured requests, examples, and environment variables to help you get started quickly with Venice's AI services.

## Accessing the Collection

Our official Postman collection is available in the Venice AI Workspace:

* [Venice AI Postman Workspace](https://www.postman.com/veniceai/workspace/venice-ai-workspace)
* [Venice AI Postman Examples](https://postman.venice.ai/)

## Collection Features

* **Ready-to-Use Requests**: Pre-configured API calls for all Venice endpoints
* **Environment Templates**: Properly structured environment variables
* **Request Examples**: Real-world usage examples for each endpoint
* **Response Samples**: Example responses to help you understand the API's output
* **Documentation**: Inline documentation for each request

## Getting Started

<Steps>
  <Step title="Fork the Collection">
    * Navigate to the Venice AI Workspace
    * Click "Fork" to create your own copy of the collection
    * Choose your workspace destination
  </Step>

  <Step title="Set Up Your Environment">
    * Create a new environment in Postman
    * Add your Venice API key
    * Configure the base URL: `https://api.venice.ai/api/v1`
  </Step>

  <Step title="Make Your First Request">
    * Select any request from the collection
    * Ensure your environment is selected
    * Click "Send" to test the API
  </Step>
</Steps>

## Available Endpoints

The collection includes examples for all Venice API endpoints:

* Text Generation
* Image Generation
* Model Information
* Image Upscaling
* System Prompt Configuration

## Best Practices

* Keep your API key secure and never share it
* Use environment variables for sensitive information
* Test responses in the Postman console before implementation
* Review the example responses for expected data structures

<Note>*Note: The Postman collection is regularly updated to reflect the latest API changes and features.*</Note>


# Prompt Caching
Source: https://docs.venice.ai/overview/guides/prompt-caching

Reduce costs and latency by caching repeated prompt content

Prompt caching stores processed input tokens so subsequent requests with identical prefixes can reuse them instead of reprocessing. This reduces latency (up to 80% for long prompts) and costs (up to 90% discount on cached tokens).

Venice handles caching automatically for supported models, but understanding how each provider implements caching helps you maximize cache hit rates and minimize costs.

## How Caching Works

Caching operates on **prefix matching**: the system stores processed tokens and reuses them when subsequent requests start with the same content.

Consider a chatbot with a 2,000-token system prompt:

<Steps>
  <Step title="Request 1">
    System prompt (2,000 tokens) + user message (50 tokens)

    **Processed**: 2,050 tokens · **From cache**: 0 tokens

    Prefix written to cache.
  </Step>

  <Step title="Request 2">
    System prompt (2,000 tokens) + user message (80 tokens)

    **Processed**: 80 tokens · **From cache**: 2,000 tokens
  </Step>

  <Step title="Request 3">
    System prompt (2,000 tokens) + user message (120 tokens)

    **Processed**: 120 tokens · **From cache**: 2,000 tokens
  </Step>
</Steps>

**Total without caching**: 2,050 + 2,080 + 2,120 = 6,250 tokens at full price

**Total with caching**: 2,050 + 80 + 120 = 2,250 tokens at full price, 4,000 tokens at discounted rate

<Warning>
  Caching only works on the **prefix**. Any change to the beginning of your prompt invalidates the cache for everything that follows. Always put static content (system prompt, documents, examples) before dynamic content (user messages).
</Warning>

## Supported Models and Pricing

<div>Loading...</div>

<Note>
  Claude Opus 4.5 charges a **premium rate** for cache writes (\$7.50/1M tokens vs \$6.00 for regular input). The first request populating the cache costs more, but subsequent cache hits save 90%. Other models don't charge extra for cache writes.
</Note>

## Provider-Specific Behavior

Venice normalizes caching across providers. For most models, caching is automatic. Just send your requests and check the response for cache statistics. **Claude** requires explicit cache markers at the protocol level, but Venice adds these automatically for system prompts and conversation history.

Caching behavior is ultimately controlled by each provider and may change, so check provider docs for the latest details.

| Model           | Provider  | Min Tokens | Cache Lifetime | Write Cost | Read Discount | Explicit Markers |
| --------------- | --------- | ---------- | -------------- | ---------- | ------------- | ---------------- |
| Claude Opus 4.5 | Anthropic | \~4,000    | 5 min          | +25%       | 90%           | Required         |
| GPT-5.2         | OpenAI    | 1,024      | 5-10 min       | None       | 90%           | Not needed       |
| Gemini          | Google    | \~1,024    | 1 hour         | None       | 75-90%        | Not needed       |
| Grok            | xAI       | \~1,024    | 5 min          | None       | 75-88%        | Not needed       |
| DeepSeek        | DeepSeek  | \~1,024    | 5 min          | None       | 50%           | Not needed       |
| MiniMax         | MiniMax   | \~1,024    | 5 min          | None       | 90%           | Not needed       |
| Kimi            | Moonshot  | \~1,024    | 5 min          | None       | 50%           | Not needed       |

### Claude Opus 4.5 (Anthropic)

Claude requires explicit cache breakpoints at the protocol level. Venice handles this automatically:

* **System prompts** are cached automatically
* **Conversation history** is cached by placing a breakpoint on the second-to-last user message

This means your conversation history is read from cache, and only the latest turn is processed as new input:

| Turn | Prompt Tokens | Cache Read | Cache Write | Savings      |
| ---- | ------------- | ---------- | ----------- | ------------ |
| 1    | 10,979        | 0          | 10,938      | First write  |
| 2    | 11,031        | 10,938     | 31          | 99.7% cached |
| 3    | 11,062        | 10,969     | 52          | 99.5% cached |

**Additional details:**

* **Up to 4 breakpoints per request**: The system uses the longest matching prefix
* **Cache key is byte-exact**: Whitespace changes, different image encodings, or reordered tools break cache hits
* **Cache-aware rate limits**: Cached tokens don't count against your ITPM limit, enabling higher effective throughput
* **25% write premium**: First request costs more, but 90% savings on subsequent reads

#### Manual cache control

For special cases like caching a large document on the first turn, you can add explicit breakpoints:

```json theme={"system"}
{
  "messages": [
    {
      "role": "system",
      "content": [{
        "type": "text",
        "text": "You are a legal assistant...",
        "cache_control": { "type": "ephemeral" }
      }]
    },
    {
      "role": "user", 
      "content": [{
        "type": "text",
        "text": "[Long contract document...]",
        "cache_control": { "type": "ephemeral" }
      }]
    },
    { "role": "assistant", "content": "I've reviewed the contract." },
    { "role": "user", "content": "What are the termination clauses?" }
  ]
}
```

This ensures both the system prompt and document are cached from the first request. For typical conversations, you don't need manual markers.

### All Other Models

Caching is **automatic**. No special parameters needed. Just ensure your prompts exceed \~1,024 tokens and use `prompt_cache_key` for consistent routing.

## Request Parameters

| Parameter          | Type   | Models | Description                                                                                                         |
| ------------------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `prompt_cache_key` | string | All    | Routing hint for cache affinity. Requests with the same key are more likely to hit the same server with warm cache. |
| `cache_control`    | object | Claude | Marks content blocks for caching. See Claude Opus 4.5 section.                                                      |

### prompt\_cache\_key

For conversations or agentic workflows, use a consistent `prompt_cache_key` to improve cache hit rates:

```json theme={"system"}
{
  "model": "claude-opus-4-5",
  "prompt_cache_key": "session-abc-123",
  "messages": [...]
}
```

This routes requests to servers likely to have your context already cached. Use a session ID, conversation ID, or user ID as the key.

## Response Fields

The response `usage` object includes cache statistics:

```json theme={"system"}
{
  "usage": {
    "prompt_tokens": 5500,
    "completion_tokens": 200,
    "total_tokens": 5700,
    "prompt_tokens_details": {
      "cached_tokens": 5000,
      "cache_creation_input_tokens": 0
    }
  }
}
```

| Field                                               | Description                                           |
| --------------------------------------------------- | ----------------------------------------------------- |
| `prompt_tokens`                                     | Total input tokens in the request                     |
| `prompt_tokens_details.cached_tokens`               | Tokens served from cache (billed at discounted rate)  |
| `prompt_tokens_details.cache_creation_input_tokens` | Tokens written to cache (may incur premium on Claude) |

**Billing breakdown** (using Claude Opus 4.5 as example):

* 5000 cached tokens × \$0.60/1M = \$0.003
* 500 uncached tokens × \$6.00/1M = \$0.003
* Total: \$0.006 (vs \$0.033 without caching, 82% savings)

## Best Practices

### Structure prompts for caching

Place static content at the beginning, dynamic content at the end.

**Good structure**

| Position | Content             | Cached? |
| -------- | ------------------- | ------- |
| 1        | System instructions | Yes     |
| 2        | Reference documents | Yes     |
| 3        | Few-shot examples   | Yes     |
| 4        | User query          | No      |

**Bad structure**

| Position | Content             | Cached?                           |
| -------- | ------------------- | --------------------------------- |
| 1        | Current timestamp   | No (invalidates everything after) |
| 2        | System instructions | No                                |
| 3        | User query          | No                                |

### Keep prefixes byte-identical

Cache keys are computed from exact byte sequences. Even trivial differences break cache hits:

* Different whitespace or newlines
* Timestamps or request IDs in prompts
* Randomized few-shot example ordering
* Different formatting of the same content

### Meet minimum token thresholds

If your prompts are below the minimum (typically 1,024 tokens), caching won't activate. For small prompts, consider:

* Adding more context or examples to reach the threshold
* Bundling multiple small requests into batched prompts
* Accepting that caching won't apply for simple queries

### Use prompt\_cache\_key for conversations

For ongoing conversations, set a consistent `prompt_cache_key`:

```json theme={"system"}
// Turn 1
{ "prompt_cache_key": "conv-xyz", "messages": [...] }

// Turn 2
{ "prompt_cache_key": "conv-xyz", "messages": [...] }

// Turn 3
{ "prompt_cache_key": "conv-xyz", "messages": [...] }
```

This improves the likelihood that all turns hit the same server with warm cache.

### Monitor cache performance

Track these metrics:

* **Cache hit rate**: `cached_tokens / prompt_tokens`
* **Cost savings**: Compare actual cost vs. uncached cost
* **Latency reduction**: Time-to-first-token with vs. without cache hits

If `cached_tokens` is consistently 0:

1. Prompts may be below minimum token threshold
2. Prompts may be changing between requests
3. Requests may be hitting different servers (use `prompt_cache_key`)
4. Cache may have expired (requests too infrequent)

### Consider cache economics

**Claude Opus 4.5 cache write premium**: First request costs 25% more, but 90% savings on subsequent reads.

| Scenario                           | Cache write premium worth it?   |
| ---------------------------------- | ------------------------------- |
| 1 request with this prompt         | No (pay 25% more, no benefit)   |
| 2+ requests with same prefix       | Yes (break even at 2nd request) |
| Rapidly changing prompts           | No (constant write costs)       |
| Stable system prompt, many queries | Yes (amortized over many reads) |

## Cache Lifetime

Caches expire after a period of inactivity (typically 5-10 minutes). This means:

| Traffic pattern                     | Caching benefit                       |
| ----------------------------------- | ------------------------------------- |
| Continuous requests (\< 5 min gaps) | High: cache stays warm                |
| Bursty traffic (gaps > 10 min)      | Limited: cache expires between bursts |
| Sporadic requests (hours apart)     | None: cache always cold               |

## Caching with Tools and Functions

Function definitions can be cached along with system prompts:

```json theme={"system"}
{
  "model": "claude-opus-4-5",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_database",
        "description": "Search the product database",
        "parameters": { ... }
      }
    }
  ],
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a shopping assistant...",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    },
    ...
  ]
}
```

The tool definitions become part of the cached prefix. If you have many tools, this can significantly reduce per-request costs.

## Caching with Images and Documents

For vision models, images can be included in cached content:

```json theme={"system"}
{
  "model": "claude-opus-4-5",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": { "url": "data:image/png;base64,..." }
        },
        {
          "type": "text",
          "text": "This is the floor plan. I'll ask several questions about it.",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    },
    {
      "role": "assistant",
      "content": "I can see the floor plan. What would you like to know?"
    },
    {
      "role": "user",
      "content": "How many bedrooms are there?"
    }
  ]
}
```

The image and initial context are cached, so follow-up questions about the same image don't re-process it.

## Troubleshooting

<Accordion title="cached_tokens is always 0">
  | Cause             | Solution                                                          |
  | ----------------- | ----------------------------------------------------------------- |
  | Prompt too short  | Ensure prompt exceeds \~1,024 tokens (4,000 for Claude)           |
  | Prefix changed    | Check for dynamic content at the start of your prompt             |
  | First request     | Expected: first request writes to cache, subsequent requests read |
  | Cache expired     | Reduce time between requests to under 5 minutes                   |
  | Different servers | Add `prompt_cache_key` to route requests consistently             |
</Accordion>

<Accordion title="cache_creation_input_tokens on every request">
  | Cause                  | Solution                                                                 |
  | ---------------------- | ------------------------------------------------------------------------ |
  | Prompt changing        | Remove timestamps, request IDs, or other dynamic content from the prefix |
  | Missing cache\_control | For Claude, ensure `cache_control` marker is present on content blocks   |
  | Below threshold        | Prompts under minimum token count don't trigger caching                  |
  | Single user message    | Expected for first turn. Cache grows with conversation history.          |
</Accordion>

<Accordion title="Higher costs than expected">
  | Cause                | Solution                                                                   |
  | -------------------- | -------------------------------------------------------------------------- |
  | Cache write premium  | Claude charges 25% more for writes. Only worth it if you reuse the prompt. |
  | Low reuse            | If each prompt is unique, you pay write costs without read benefits        |
  | Bad prompt structure | Move dynamic content to the end so the prefix stays stable                 |
</Accordion>


# Reasoning Models
Source: https://docs.venice.ai/overview/guides/reasoning-models

Using reasoning models with visible thinking in the Venice API

Some models think out loud before answering. They work through problems step by step, then give you a final answer. This makes them stronger at math, code, and logic-heavy tasks.

<div />

See the full list of models, pricing and context limits on the [Models page](/overview/models). Not all reasoning models support the [`reasoning_effort`](#reasoning-effort) parameter. See [model support](#model-support) for details.

## Reading the output

Reasoning models return their thinking in a separate `reasoning_content` field, keeping `content` clean:

<CodeGroup>
  ```python Python theme={"system"}
  response = client.chat.completions.create(
      model="zai-org-glm-5-1",
      messages=[{"role": "user", "content": "What is 15% of 240?"}]
  )

  thinking = response.choices[0].message.reasoning_content
  answer = response.choices[0].message.content
  ```

  ```javascript Node.js theme={"system"}
  const response = await client.chat.completions.create({
      model: "zai-org-glm-5-1",
      messages: [{ role: "user", content: "What is 15% of 240?" }]
  });

  const thinking = response.choices[0].message.reasoning_content;
  const answer = response.choices[0].message.content;
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "zai-org-glm-5-1",
      "messages": [{"role": "user", "content": "What is 15% of 240?"}]
    }'
  ```
</CodeGroup>

<Info>
  Some providers (Anthropic, Google, OpenAI, Qwen) return encrypted or summarized reasoning tokens. When this happens, `reasoning_content` contains a `"[Some reasoning content is encrypted]"` placeholder.
</Info>

### Streaming

When streaming, `reasoning_content` arrives in the delta before the final answer:

<CodeGroup>
  ```python Python theme={"system"}
  stream = client.chat.completions.create(
      model="zai-org-glm-5-1",
      messages=[{"role": "user", "content": "Explain photosynthesis"}],
      stream=True
  )

  for chunk in stream:
      if chunk.choices:
          delta = chunk.choices[0].delta
          if delta.reasoning_content:
              print(delta.reasoning_content, end="")
          if delta.content:
              print(delta.content, end="")
  ```

  ```javascript Node.js theme={"system"}
  const stream = await client.chat.completions.create({
      model: "zai-org-glm-5-1",
      messages: [{ role: "user", content: "Explain photosynthesis" }],
      stream: true
  });

  for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta) {
          const delta = chunk.choices[0].delta;
          if (delta.reasoning_content) process.stdout.write(delta.reasoning_content);
          if (delta.content) process.stdout.write(delta.content);
      }
  }
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "zai-org-glm-5-1",
      "messages": [{"role": "user", "content": "Explain photosynthesis"}],
      "stream": true
    }'
  ```
</CodeGroup>

## Reasoning effort

The `reasoning_effort` parameter controls how much thinking a model does before responding. Higher effort means deeper reasoning but more tokens and latency.

### Accepted values

| Value     | Description                                |
| --------- | ------------------------------------------ |
| `none`    | Disables reasoning entirely                |
| `minimal` | Basic reasoning with minimal effort        |
| `low`     | Light reasoning for simple problems        |
| `medium`  | Balanced reasoning for moderate complexity |
| `high`    | Deep reasoning for complex problems        |
| `xhigh`   | Extra-high reasoning depth                 |
| `max`     | Maximum reasoning capability               |

<Warning>
  Not all models support all values. Venice does **not** auto-map to the nearest supported level. Unsupported values return a 400 error from the upstream provider. For example, sending `xhigh` to Claude or `max` to GPT-5.2 will fail.

  When in doubt, use `low`, `medium`, or `high`. These are the most widely supported values.
</Warning>

### Model support

#### OpenAI

| Model                        | Supported values                         |
| ---------------------------- | ---------------------------------------- |
| GPT-5.2                      | `none`, `low`, `medium`, `high`, `xhigh` |
| GPT-5.2 Codex, GPT-5.3 Codex | `low`, `medium`, `high`, `xhigh`         |

#### Anthropic

| Model                                   | Supported values               |
| --------------------------------------- | ------------------------------ |
| Claude Opus 4.6, Opus 4.6 Fast          | `low`, `medium`, `high`, `max` |
| Claude Opus 4.5, Sonnet 4.5, Sonnet 4.6 | `low`, `medium`, `high`        |

#### Google

| Model                  | Supported values                   |
| ---------------------- | ---------------------------------- |
| Gemini 3 Pro Preview   | `low`, `high`                      |
| Gemini 3.1 Pro Preview | `low`, `medium`, `high`            |
| Gemini 3 Flash Preview | `minimal`, `low`, `medium`, `high` |

#### xAI

Grok models (Grok 4.1 Fast, Grok Code Fast) do **not** support `reasoning_effort`. Specifying it will result in an error.

#### Other models

| Model                                       | Supported values                          |
| ------------------------------------------- | ----------------------------------------- |
| Qwen 3 235B A22B Thinking, Qwen 3.5 35B A3B | `low`, `medium`, `high`                   |
| Kimi K2.5                                   | `low`, `medium`, `high`                   |
| MiniMax M2.5, M2.1                          | `low`, `medium`, `high`                   |
| GLM 5.1 series                              | Built-in reasoning only, not configurable |
| DeepSeek R1                                 | Built-in reasoning only, not configurable |

### Usage

Pass `reasoning_effort` as a top-level parameter or use the nested `reasoning.effort` format:

<CodeGroup>
  ```python Python theme={"system"}
  response = client.chat.completions.create(
      model="minimax-m25",
      messages=[{"role": "user", "content": "Prove that there are infinitely many primes"}],
      extra_body={"reasoning": {"effort": "high"}}
  )
  ```

  ```javascript Node.js theme={"system"}
  const response = await client.chat.completions.create({
      model: "minimax-m25",
      messages: [{ role: "user", content: "Prove that there are infinitely many primes" }],
      reasoning: { effort: "high" }
  });
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "minimax-m25",
      "messages": [{"role": "user", "content": "Prove that there are infinitely many primes"}],
      "reasoning": {"effort": "high"}
    }'
  ```
</CodeGroup>

The flat format `"reasoning_effort": "high"` is also accepted.

## Disabling reasoning

There are two ways to disable reasoning:

| Method                     | Syntax                            | How it works                                                                                             |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `reasoning.enabled: false` | `"reasoning": {"enabled": false}` | Venice-level toggle that prevents reasoning parameters from being sent to the provider. **Recommended.** |
| `reasoning.effort: "none"` | `"reasoning": {"effort": "none"}` | Passed to the provider, which decides how to handle it. Only supported by some models (e.g. GPT-5.x).    |

For models that support it, `reasoning.enabled: false` is the more reliable option:

| Model                                        | Can disable?                          |
| -------------------------------------------- | ------------------------------------- |
| GPT-5.2                                      | Yes                                   |
| GPT-5.2 Codex, GPT-5.3 Codex                 | Yes (but `none` effort not supported) |
| Qwen 3 235B A22B Thinking, Qwen 3.5 35B A3B  | Yes                                   |
| GLM 5.1 series                               | Yes                                   |
| Claude Opus 4.5/4.6/4.6 Fast, Sonnet 4.5/4.6 | No (always reasons)                   |
| Gemini 3 Pro, 3.1 Pro, 3 Flash               | No (always reasons)                   |
| DeepSeek R1                                  | No (always reasons)                   |

<CodeGroup>
  ```python Python theme={"system"}
  response = client.chat.completions.create(
      model="openai-gpt-52",
      messages=[{"role": "user", "content": "What's the capital of France?"}],
      extra_body={"reasoning": {"enabled": False}}
  )
  ```

  ```javascript Node.js theme={"system"}
  const response = await client.chat.completions.create({
      model: "openai-gpt-52",
      messages: [{ role: "user", content: "What's the capital of France?" }],
      reasoning: { enabled: false }
  });
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "openai-gpt-52",
      "messages": [{"role": "user", "content": "What is the capital of France?"}],
      "reasoning": {"enabled": false}
    }'
  ```
</CodeGroup>

## Capability discovery

Check what a model supports via the [`/v1/models`](/api-reference/endpoint/models/list) endpoint:

| Field                     | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `supportsReasoning`       | Model has reasoning capability (chain-of-thought)                   |
| `supportsReasoningEffort` | Model accepts the `reasoning_effort` / `reasoning.effort` parameter |

## Best practices

* Default to `medium` for general use
* Use `high` or `xhigh` for complex tasks (math, code, analysis)
* Use `low` for latency-sensitive applications
* Use `reasoning.enabled: false` or set effort to `none` to disable reasoning
* When in doubt, use `low`, `medium`, or `high`. These are the most widely supported values


# Reference to Video
Source: https://docs.venice.ai/overview/guides/reference-to-video

Create consistent AI videos with character elements, scene references, and multi-shot control using Kling O3 and Grok Imagine R2V

Reference to Video lets you lock in the appearance of characters, objects, and scenes so your AI-generated videos stay visually consistent. Instead of hoping the model interprets your prompt correctly, you provide visual anchors — reference images that tell the model exactly what your subject looks like.

This feature is available on **Kling O3** and **Grok Imagine R2V** models in the [Venice Video Studio](https://venice.ai/video). Each model family uses a different approach to reference images — see the model-specific sections below.

## When to use Reference to Video

Use Reference to Video when you need:

* **Character consistency** — the same person or character across multiple shots
* **Product accuracy** — a real product that must look identical to the original
* **Scene continuity** — a specific environment or background across generations
* **Multi-character scenes** — multiple distinct characters interacting without blending

For simple text-to-video or image-to-video where consistency isn't critical, the standard models work well without references.

## Available models

| Model                     | Approach                | Best for                                                     |
| ------------------------- | ----------------------- | ------------------------------------------------------------ |
| **Kling O3 Pro R2V**      | Elements + scene images | Complex multi-character scenes with precise identity control |
| **Kling O3 Standard R2V** | Elements + scene images | Faster iteration on element-based scenes                     |
| **Grok Imagine R2V**      | Flat reference images   | Quick reference-driven generation with up to 7 images        |

**Kling O3** uses a structured approach with Elements (character identity anchors with frontal + reference images) and Scene Images. **Grok Imagine R2V** takes a simpler approach — you upload reference images directly and reference them in your prompt with `@Image1`, `@Image2`, etc.

***

## Kling O3 Reference to Video

### Core concepts

Kling O3 Reference to Video uses three types of visual input that work together:

| Input                      | Required                    | Purpose                               | How to reference in prompt     |
| -------------------------- | --------------------------- | ------------------------------------- | ------------------------------ |
| **Elements**               | At least one visual input\* | Lock a character or object's identity | `@Element1`, `@Element2`, etc. |
| **Scene Reference Images** | At least one visual input\* | Set the environment, style, and mood  | `@Image1`, `@Image2`, etc.     |
| **Start Frame**            | At least one visual input\* | Control the first frame of the video  | N/A (set via upload)           |
| **End Frame**              | No                          | Control the last frame of the video   | N/A (set via upload)           |

\*At least one of: start frame, elements, or scene reference images is required.

### Elements

An Element is a character or object you want to keep visually stable throughout the video. Each element consists of:

* **Frontal Image** (required per element) — a clear, front-facing photo of the subject. This is the primary identity anchor. Think of it as the "passport photo" of your character or product.
* **Reference Images** (1–3, optional) — additional angles of the same subject (side view, 45-degree angle, back). These help the model understand the subject in 3D space. If not provided, the frontal image is automatically used as the reference.

You can add up to **7 elements** per generation (limited by combined total). Reference them in your prompt using `@Element1`, `@Element2`, etc.

### Scene Reference Images

Scene references define the "stage" where the action takes place. They influence:

* Lighting and color palette
* Architecture and environment details
* Overall visual style and mood

You can add up to **4 scene images**. Reference them as `@Image1`, `@Image2`, etc. in your prompt.

### Limitations

The total number of images across all input types is limited:

| Limit                                                                   | Value                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Minimum required**                                                    | At least 1 visual input (start frame, element, or scene image) |
| **Combined total** (first frame + last frame + elements + scene images) | **7 maximum**                                                  |
| Elements (without start/end frame)                                      | 7 maximum                                                      |
| Elements (with start or end frame)                                      | 3 maximum                                                      |
| Scene reference images                                                  | 4 maximum                                                      |
| Reference images per element                                            | 1–3                                                            |

**Example scenarios:**

* 7 elements + 0 scene images = 7 ✓ (no frames)
* 5 elements + 2 scene images = 7 ✓ (no frames)
* First frame (1) + 3 elements + 3 scene images = 7 ✓
* First frame (1) + last frame (1) + 3 elements + 2 scene images = 7 ✓
* First frame (1) + 4 elements = ✗ (max 3 elements with frame)
* First frame (1) + last frame (1) + 4 elements = ✗ (max 3 elements with frames)

<Note>
  Each element requires a **frontal image**. If you don't provide reference images for an element, the frontal image is automatically used as the reference.
</Note>

### Multi-shot mode

Multi-shot lets you break a single generation into multiple scenes, each with its own prompt and duration. Elements and scene references carry across all shots, maintaining consistency. The total duration across all shots cannot exceed **15 seconds**.

***

### Step-by-step guide (Video Studio)

#### 1. Open Video Studio and select the model

Go to [venice.ai/video](https://venice.ai/video). In the Model Browser on the left, select one of the **Kling O3 Reference to Video** models:

* **Kling O3 Pro R2V** — higher quality, longer generation time (\~6 min)
* **Kling O3 Standard R2V** — faster, more cost-effective for iteration

#### 2. Add Visual Inputs (at least one required)

You must provide **at least one visual input** to generate a video: a start frame, an element, or a scene reference image. In the Input Panel, you'll see the **Elements** section. Click **Add Element** to create an element for characters or objects you want to keep visually consistent.

For each element:

1. Click the **Frontal** tile to upload a clear, front-facing image of your character or object
2. Optionally click **Add** under **Reference Images** to upload additional angles (1–3)

Repeat for additional characters or objects (up to 7 elements total, or 3 if using start/end frames).

<Warning>
  The combined total of first frame, last frame, elements, and scene images cannot exceed **7**. See [Limitations](#limitations) for details.
</Warning>

<Tip>
  **Best reference images:** Use well-lit photos with a clean background. Provide front, side, and 45-degree angle views for the strongest identity lock. Make sure all reference images share the same visual style (don't mix photorealistic and anime).
</Tip>

#### 3. Add Scene Reference Images (optional)

Below the Elements section, you'll see **Scene Reference Images**. Upload images that define the environment you want — a specific location, lighting setup, or art style.

These are tagged automatically as `@Image1`, `@Image2`, etc.

#### 4. Upload a Start Frame (optional)

If you want to control the exact first frame of your video, switch to the **Image** input type and upload a start frame. You can also optionally set an end frame.

#### 5. Write your prompt

In the prompt field, describe the action you want while referencing your elements and scene images using the `@` tags:

```
@Element1 walks through the streets of @Image1, looking up at the buildings.
The camera slowly tracks from behind, revealing the city skyline.
```

For **multi-character scenes**:

```
@Element1 and @Element2 enter the cafe in @Image1 from opposite sides.
@Element1 waves and walks toward @Element2, who is sitting at a corner table.
```

#### 6. Configure settings

Open **Video Settings** to adjust:

| Setting        | Options         | Default |
| -------------- | --------------- | ------- |
| Duration       | 3s – 15s        | 5s      |
| Aspect Ratio   | 16:9, 9:16, 1:1 | 16:9    |
| Generate Audio | On/Off          | Off     |

<Note>
  Audio generation adds native sound effects, dialogue, and ambient audio synchronized to the video. It increases cost by \~25%.
</Note>

#### 7. Generate

Click **Generate Video**. Kling O3 typically takes 4–6 minutes depending on the model tier and duration. You can queue multiple generations and browse results in the Video Gallery.

***

### Multi-shot storyboarding

For narrative sequences, use multi-shot mode to define separate scenes within a single generation.

1. In the prompt area, click **Add Shot** to create additional shots
2. Write a separate prompt for each shot
3. Set the duration for each shot (3–15s each, total ≤ 15s)

Elements and scene references persist across all shots automatically:

```
Shot 1 (5s): @Element1 stands at the edge of @Image1, looking out at the horizon.
Slow camera push forward.

Shot 2 (5s): Close-up of @Element1's face as they turn toward the camera.
Soft natural lighting, shallow depth of field.

Shot 3 (5s): @Element1 walks away from camera into the distance.
Wide cinematic shot, golden hour lighting.
```

<Warning>
  Multi-shot total duration cannot exceed 15 seconds. For example, three 5-second shots = 15s maximum.
</Warning>

***

### Prompting tips

#### Structure your prompt

Follow this pattern for reliable results:

```
[subject with @Element tag] + [action] + [environment with @Image tag] + [camera movement] + [lighting/style]
```

**Example:**

```
@Element1 hops happily across the candy ground of @Image1, stops to look at a
giant lollipop, tilts its head curiously. Cinematic tracking shot, soft warm lighting.
```

#### Keep prompts 50–150 words

Shorter prompts lack detail. Longer prompts introduce contradictions. Aim for the sweet spot.

#### Use simple camera language

The model responds best to straightforward camera directions:

| Use                         | Avoid                                           |
| --------------------------- | ----------------------------------------------- |
| `slow camera push forward`  | `dolly zoom with rack focus transition`         |
| `tracking shot from behind` | `complex handheld parallax movement`            |
| `close-up`                  | `extreme macro with tilt-shift bokeh`           |
| `wide cinematic shot`       | `anamorphic ultra-wide establishing crane shot` |

#### Use consistent vocabulary

If you describe a character wearing "a red jacket" in one prompt, don't switch to "crimson coat" in the next. The model treats different words as different intent.

#### Place camera instructions early

Put the camera direction near the beginning of the prompt for more reliable results:

```
Cinematic tracking shot of @Element1 walking through @Image1, leaves
blowing in the wind, golden afternoon light.
```

***

### Kling O3 Pricing

Kling O3 Reference to Video models use duration-based pricing:

| Model                 | Per second (no audio) | Per second (with audio) |
| --------------------- | --------------------- | ----------------------- |
| Kling O3 Pro R2V      | \$0.112               | \$0.140                 |
| Kling O3 Standard R2V | \$0.112               | \$0.140                 |

**Example:** A 10-second video with audio = 10 × $0.14 = **$1.40\*\*

Use the [Video Quote API](https://docs.venice.ai/api-reference/endpoint/video/quote) for exact pricing before generation.

***

### Kling O3 API usage

Kling O3 Reference to Video is also available via the Venice API. See the [Video Queue API](https://docs.venice.ai/api-reference/endpoint/video/queue) for full details.

#### Python

```python theme={"system"}
import requests

response = requests.post(
    "https://api.venice.ai/api/v1/video/queue",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "kling-o3-pro-reference-to-video",
        "prompt": "@Element1 walks through @Image1, camera tracking from behind",
        "duration": "8",
        "aspect_ratio": "16:9",
        "audio": True,
        "elements": [
            {
                "frontal_image_url": "https://example.com/character-front.jpg",
                "reference_image_urls": [
                    "https://example.com/character-side.jpg",
                    "https://example.com/character-angle.jpg"
                ]
            }
        ],
        "image_urls": [
            "https://example.com/scene-background.jpg"
        ]
    }
)

queue_id = response.json()["id"]
```

#### Node.js

```javascript theme={"system"}
const response = await fetch("https://api.venice.ai/api/v1/video/queue", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "kling-o3-pro-reference-to-video",
    prompt: "@Element1 walks through @Image1, camera tracking from behind",
    duration: "8",
    aspect_ratio: "16:9",
    audio: true,
    elements: [
      {
        frontal_image_url: "https://example.com/character-front.jpg",
        reference_image_urls: [
          "https://example.com/character-side.jpg",
          "https://example.com/character-angle.jpg"
        ]
      }
    ],
    image_urls: [
      "https://example.com/scene-background.jpg"
    ]
  })
});

const { id: queueId } = await response.json();
```

#### cURL

```bash theme={"system"}
curl https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-o3-pro-reference-to-video",
    "prompt": "@Element1 walks through @Image1, camera tracking from behind",
    "duration": "8",
    "aspect_ratio": "16:9",
    "audio": true,
    "elements": [
      {
        "frontal_image_url": "https://example.com/character-front.jpg",
        "reference_image_urls": [
          "https://example.com/character-side.jpg",
          "https://example.com/character-angle.jpg"
        ]
      }
    ],
    "image_urls": [
      "https://example.com/scene-background.jpg"
    ]
  }'
```

#### Element schema

Each element in the `elements` array accepts:

| Field                  | Type      | Required | Description                                                                          |
| ---------------------- | --------- | -------- | ------------------------------------------------------------------------------------ |
| `frontal_image_url`    | string    | **Yes**  | Clear front-facing image URL                                                         |
| `reference_image_urls` | string\[] | No       | Additional angle URLs (1–3). If omitted, the frontal image is used as the reference. |

<Note>
  The API also supports `video_url` for video-based elements, but this is not currently available in the Video Studio UI.
</Note>

***

### Kling O3 Troubleshooting

| Problem                                           | Likely cause                                  | Fix                                                                                 |
| ------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Generate button is disabled                       | No visual inputs provided                     | Add at least one visual input: start frame, element, or scene reference image       |
| "Number of images exceeds the limit" error        | Too many combined inputs                      | Total of first frame + last frame + elements + scene images must be ≤ 7             |
| Character face changes between shots              | Different or missing frontal image            | Use the same frontal image consistently, keep description identical                 |
| Camera movement feels random                      | Multiple or conflicting camera instructions   | Use a single camera instruction, place it early in the prompt                       |
| Style shifts between generations                  | Inconsistent scene references or mixed styles | Reuse the same scene images, keep style keywords consistent                         |
| Elements blend together in multi-character scenes | Vague spatial instructions                    | Be explicit about each element's position: "foreground left", "entering from right" |
| Background looks distorted                        | Cluttered or complex scene reference image    | Use clean, high-quality scene reference images                                      |
| Motion looks unnatural                            | Too many actions in one prompt                | Simplify the action, use shorter duration, one action per shot                      |

<Tip>
  Test with a 3–5 second clip before committing to longer durations. Shorter clips maintain better consistency and let you iterate faster.
</Tip>

***

## Grok Imagine Reference to Video

Grok Imagine R2V takes a simpler approach than Kling O3. Instead of structured Elements with frontal/reference image separation, you upload **flat reference images** and reference them directly in your prompt using `@Image1`, `@Image2`, etc. The model incorporates those subjects into the generated video.

### How it works

1. Upload **1–7 reference images** — photos of characters, objects, or scenes you want in the video
2. Write a prompt that describes the video, using `@Image1`, `@Image2`, etc. to reference specific images
3. The model generates a video incorporating those references

If you don't include `@Image` tags in your prompt, all uploaded images are referenced automatically.

### Settings

| Setting      | Options                             | Default |
| ------------ | ----------------------------------- | ------- |
| Aspect Ratio | 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16 | 16:9    |
| Resolution   | 480p, 720p                          | 480p    |
| Duration     | 5s, 8s, 10s                         | 8s      |

<Note>
  Grok Imagine R2V does not support audio generation, multi-shot mode, or Elements. For those features, use Kling O3 R2V.
</Note>

### Step-by-step guide (Video Studio)

#### 1. Select the model

Go to [venice.ai/video](https://venice.ai/video). In the Model Browser, select **Grok Imagine R2V**.

#### 2. Upload reference images

Click **References** in the input toolbar (or use the + menu) to open the reference images panel. Upload 1–7 images of the characters, objects, or scenes you want in the video.

Each image is automatically tagged as `@Image1`, `@Image2`, etc. in the order you upload them (left to right).

#### 3. Write your prompt

Describe the video you want. Use `@Image` tags to reference specific images:

```
@Image1 and @Image2 walking together through a sunlit park,
camera slowly tracking alongside them, warm afternoon light.
```

Type `@` in the prompt field to see an autocomplete menu of available image references.

<Tip>
  If you omit `@Image` tags entirely, the backend automatically prepends references to all uploaded images. This is useful when you want all images used without specifying which is which.
</Tip>

#### 4. Configure settings and generate

Open **Video Settings** to adjust aspect ratio, resolution, and duration. Click **Generate Video**.

### Grok Imagine R2V Pricing

Grok Imagine R2V uses duration and resolution-based pricing:

| Resolution | Per second |
| ---------- | ---------- |
| 480p       | \~\$0.063  |
| 720p       | \~\$0.088  |

**Example:** An 8-second video at 480p = 8 × $0.063 = **~$0.50\*\*

<Note>
  Grok Imagine charges a content moderation fee for generated videos, even if the video is rejected. This is reflected in the credit cost shown before generation.
</Note>

### Grok Imagine R2V API usage

#### Python

```python theme={"system"}
import requests

response = requests.post(
    "https://api.venice.ai/api/v1/video/queue",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "grok-imagine-reference-to-video",
        "prompt": "@Image1 and @Image2 walking through a park, cinematic tracking shot",
        "duration": "8",
        "aspect_ratio": "16:9",
        "referenceImageUrls": [
            "https://example.com/character-a.jpg",
            "https://example.com/character-b.jpg"
        ]
    }
)

queue_id = response.json()["id"]
```

#### Node.js

```javascript theme={"system"}
const response = await fetch("https://api.venice.ai/api/v1/video/queue", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "grok-imagine-reference-to-video",
    prompt: "@Image1 and @Image2 walking through a park, cinematic tracking shot",
    duration: "8",
    aspect_ratio: "16:9",
    referenceImageUrls: [
      "https://example.com/character-a.jpg",
      "https://example.com/character-b.jpg"
    ]
  })
});

const { id: queueId } = await response.json();
```

#### cURL

```bash theme={"system"}
curl https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-imagine-reference-to-video",
    "prompt": "@Image1 and @Image2 walking through a park, cinematic tracking shot",
    "duration": "8",
    "aspect_ratio": "16:9",
    "referenceImageUrls": [
      "https://example.com/character-a.jpg",
      "https://example.com/character-b.jpg"
    ]
  }'
```

#### API parameters

| Field                | Type      | Required | Description                                               |
| -------------------- | --------- | -------- | --------------------------------------------------------- |
| `model`              | string    | **Yes**  | Must be `grok-imagine-reference-to-video`                 |
| `prompt`             | string    | **Yes**  | Text prompt with optional `@Image1`, `@Image2` references |
| `referenceImageUrls` | string\[] | **Yes**  | 1–7 image URLs or data URLs                               |
| `duration`           | string    | No       | `"5"`, `"8"` (default), or `"10"`                         |
| `aspect_ratio`       | string    | No       | e.g., `"16:9"` (default), `"9:16"`, `"1:1"`               |
| `resolution`         | string    | No       | `"480p"` (default) or `"720p"`                            |

<Note>
  Grok Imagine R2V does not use the `elements`, `image_urls`, or `imageUrl` fields. All reference images are passed via `referenceImageUrls`.
</Note>

### Grok Imagine R2V Troubleshooting

| Problem                                          | Likely cause                              | Fix                                                                                                       |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Generate button is disabled                      | No reference images uploaded              | Upload at least 1 reference image                                                                         |
| "At least one reference image is required" error | `referenceImageUrls` is empty or missing  | Provide at least one image URL in `referenceImageUrls`                                                    |
| Wrong image associated with `@Image` tag         | Image order doesn't match tags            | `@Image1` corresponds to the first image in your upload order (left to right). Reorder uploads if needed. |
| Subject not appearing in video                   | Too many references without explicit tags | Use `@Image` tags in your prompt to be explicit about which images to use                                 |
| Low quality output                               | Using 480p resolution                     | Try 720p for higher quality (costs more)                                                                  |
| Video too short                                  | Default duration is 8s                    | Set duration to `"10"` for longer videos                                                                  |


# Structured Responses
Source: https://docs.venice.ai/overview/guides/structured-responses

Using structured responses within the Venice API

Venice has now included structured outputs via “response\_format” as an available field in the API. This field enables you to generate responses to your prompts that follow a specific pre-defined format. With this new method, the models are less likely to hallucinate incorrect keys or values within the response, which was more prevalent when attempting through system prompt manipulation or via function calling.

The structured output “response\_format” field utilizes the OpenAI API format, and is further described in the openAI guide [here](https://platform.openai.com/docs/guides/structured-outputs). OpenAI also released an introduction article to using stuctured outputs within the API specifically [here](https://openai.com/index/introducing-structured-outputs-in-the-api/). As this is advanced functionality, there are a handful of “gotchas” on the bottom of this page that should be followed.

This functionality is not natively available for all models. Please refer to the models section [here](https://docs.venice.ai/api-reference/endpoint/models/list?playground=open), and look for “supportsResponseSchema” for applicable models.

```json theme={"system"}
    {
      "id": "venice-uncensored",
      "type": "text",
      "object": "model",
      "created": 1726869022,
      "owned_by": "venice.ai",
      "model_spec": {
        "availableContextTokens": 32768,
        "capabilities": {
          "supportsFunctionCalling": true,
          "supportsResponseSchema": true,
          "supportsWebSearch": true
        },
```

### How to use Structured Responses

To properly use the “response\_format” you can define your schema with various “properties”, representing categories of outputs, each with individually configured data types. These objects can be nested to create more advanced structures of outputs.

Here is an example of an API call using response\_format to explain the step-by-step process of solving a math equation.

You can see that the properties were configured to require both “steps” and “final\_answer” within the response. Within nesting, the steps category consists of both an “explanation” and an “output”, each as strings.

```json theme={"system"}
curl --request POST \
  --url https://api.venice.ai/api/v1/chat/completions \
  --header 'Authorization: Bearer <api-key>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "venice-uncensored",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful math tutor."
    },
    {
      "role": "user",
      "content": "solve 8x + 31 = 2"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "math_response",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "explanation": {
                  "type": "string"
                },
                "output": {
                  "type": "string"
                }
              },
              "required": ["explanation", "output"],
              "additionalProperties": false
            }
          },
          "final_answer": {
            "type": "string"
          }
        },
        "required": ["steps", "final_answer"],
        "additionalProperties": false
      }
    }
  }
}

```

Here is the response that was received from the model. You can see that the structure followed the requirements by first providing the “steps” with the “explanation” and “output” of each step, and then the “final answer”.

```json theme={"system"}
{
  "steps": [
    {
      "explanation": "Subtract 31 from both sides to isolate the term with x.",
      "output": "8x + 31 - 31 = 2 - 31"
    },
    {
      "explanation": "This simplifies to 8x = -29.",
      "output": "8x = -29"
    },
    {
      "explanation": "Divide both sides by 8 to solve for x.",
      "output": "x = -29 / 8"
    }
  ],
  "final_answer": "x = -29 / 8"
}

```

Although this is a simple example, this can be extrapolated into more advanced use cases like: Data Extraction, Chain of Thought Exercises, UI Generation, Data Categorization and many others.

### Gotchas

Here are some key requirements to keep in mind when using Structured Outputs via response\_format:

* Initial requests using response\_format may take longer to generate a response. Subsequent requests will not experience the same latency as the initial request.

* For larger queries, the model can fail to complete if either `max_tokens` or model timeout are reached, or if any rate limits are violated

* Incorrect schema format will result in errors on completion, usually due to timeout

* Although response\_format ensures the model will output a particular way, it does not guarantee that the model provided the correct information within. The content is driven by the prompt and the model performance.

* Structured Outputs via response\_format are not compatible with parallel function calls

* Important: All fields or parameters must include a `required` tag. To make a field optional, you need to add a `null` option within the `type`of the field, like this `"type": ["string", "null"]`&#x20;

* It is possible to make fields optional by giving a `null` options within the required field to allow an empty response.

* Important: `additionalProperties` must be set to false for response\_format to work properly

* Important: `strict` must be set to true for response\_format to work properly


# TEE & E2EE Models
Source: https://docs.venice.ai/overview/guides/tee-e2ee-models

Privacy-enhanced AI with Trusted Execution Environments and End-to-End Encryption

Venice offers privacy-enhanced models that run in Trusted Execution Environments (TEE) and support End-to-End Encryption (E2EE). These models provide cryptographic guarantees that your data remains private—even from Venice.

## Understanding the Privacy Levels

| Type     | Prefix   | What It Means                                                                                                         |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| **TEE**  | `tee-*`  | Model runs in a hardware-secured enclave. Venice cannot access the computation. You can verify this with attestation. |
| **E2EE** | `e2ee-*` | Full end-to-end encryption. Your prompts are encrypted client-side before being sent. Only the TEE can decrypt them.  |

<Info>
  E2EE models include TEE protection plus client-side encryption. TEE models provide enclave security without requiring client-side encryption.
</Info>

## Available Models

<div>Loading...</div>

Check the [Models page](/overview/models) for the full list with pricing and context limits.

## TEE Models

TEE models run inside hardware-secured enclaves (Intel TDX, NVIDIA Confidential Computing). The model weights and your data are protected from the host system—including Venice's infrastructure.

### Basic Usage

TEE models work exactly like regular models:

<CodeGroup>
  ```python Python theme={"system"}
  from openai import OpenAI

  client = OpenAI(
      api_key="your-venice-api-key",
      base_url="https://api.venice.ai/api/v1"
  )

  response = client.chat.completions.create(
      model="tee-qwen3-5-122b-a10b",
      messages=[{"role": "user", "content": "Explain quantum computing"}]
  )

  print(response.choices[0].message.content)
  ```

  ```javascript Node.js theme={"system"}
  import OpenAI from 'openai';

  const client = new OpenAI({
      apiKey: 'your-venice-api-key',
      baseURL: 'https://api.venice.ai/api/v1'
  });

  const response = await client.chat.completions.create({
      model: 'tee-qwen3-5-122b-a10b',
      messages: [{ role: 'user', content: 'Explain quantum computing' }]
  });

  console.log(response.choices[0].message.content);
  ```

  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY_VENICE" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "tee-qwen3-5-122b-a10b",
      "messages": [{"role": "user", "content": "Explain quantum computing"}]
    }'
  ```
</CodeGroup>

### Verifying TEE Attestation

You can cryptographically verify that a model is running in a genuine TEE by fetching its attestation report:

<CodeGroup>
  ```bash cURL theme={"system"}
  # Generate a random nonce (prevents replay attacks)
  NONCE=$(openssl rand -hex 16)

  # Fetch attestation
  curl "https://api.venice.ai/api/v1/tee/attestation?model=tee-qwen3-5-122b-a10b&nonce=$NONCE" \
    -H "Authorization: Bearer $API_KEY_VENICE"
  ```

  ```python Python theme={"system"}
  import secrets
  import requests

  nonce = secrets.token_hex(16)

  response = requests.get(
      f"https://api.venice.ai/api/v1/tee/attestation",
      params={"model": "tee-qwen3-5-122b-a10b", "nonce": nonce},
      headers={"Authorization": f"Bearer {api_key}"}
  )

  attestation = response.json()
  print(f"Verified: {attestation['verified']}")
  print(f"TEE Provider: {attestation['tee_provider']}")
  print(f"Model: {attestation['model']}")
  ```
</CodeGroup>

The attestation response includes:

| Field             | Description                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `verified`        | Whether the attestation passed server-side verification                                                                    |
| `nonce`           | Your nonce, confirming freshness                                                                                           |
| `model`           | The attested model ID                                                                                                      |
| `tee_provider`    | TEE provider identifier                                                                                                    |
| `intel_quote`     | Raw Intel TDX quote (base64) for client-side verification                                                                  |
| `nvidia_payload`  | NVIDIA GPU attestation data (if applicable)                                                                                |
| `signing_key`     | Public key for verifying response signatures (typically required for E2EE flows; may be omitted for some plain TEE models) |
| `signing_address` | Ethereum address derived from signing key                                                                                  |

<Tip>
  For production use, verify the attestation client-side by parsing the Intel TDX quote and checking the NVIDIA attestation.
</Tip>

<Note>
  For plain TEE model verification, `signing_address` and server-side verification fields are sufficient for baseline attestation checks. A `signing_key` is required when you need client-side E2EE key agreement and strict key-binding checks.
</Note>

### Response Signatures

TEE models can sign their responses, proving the output came from the attested enclave:

<CodeGroup>
  ```bash cURL theme={"system"}
  # After getting a completion, verify the signature
  curl "https://api.venice.ai/api/v1/tee/signature?model=tee-qwen3-5-122b-a10b&request_id=chatcmpl-abc123" \
    -H "Authorization: Bearer $API_KEY_VENICE"
  ```

  ```python Python theme={"system"}
  response = requests.get(
      f"https://api.venice.ai/api/v1/tee/signature",
      params={"model": "tee-qwen3-5-122b-a10b", "request_id": completion_id},
      headers={"Authorization": f"Bearer {api_key}"}
  )

  signature = response.json()
  # Verify signature matches the signing_address from attestation
  ```
</CodeGroup>

## E2EE Models

E2EE models add client-side encryption on top of TEE protection. Your prompts are encrypted before leaving your device, and only the TEE can decrypt them.

Venice E2EE uses:

* **ECDH (Elliptic Curve Diffie-Hellman)** on secp256k1 for key exchange
* **HKDF-SHA256** for key derivation
* **AES-256-GCM** for symmetric encryption
* **TEE attestation** to verify the model runs in a secure enclave

<Warning>
  E2EE requires client-side implementation. The examples below show the complete protocol.
</Warning>

### How E2EE Works

<Steps>
  <Step title="Generate Ephemeral Key Pair">
    Client generates a secp256k1 key pair for this session.
  </Step>

  <Step title="Fetch TEE Attestation">
    Client requests `/api/v1/tee/attestation` and receives the model's public key, attestation evidence, and nonce.
  </Step>

  <Step title="Verify Attestation">
    Client checks nonce match, debug mode disabled, and attestation validity.
  </Step>

  <Step title="Encrypt Messages">
    Client encrypts prompts using ECDH shared secret → HKDF → AES-GCM.
  </Step>

  <Step title="Send Request">
    Client sends request with E2EE headers (`X-Venice-TEE-Client-Pub-Key`, `X-Venice-TEE-Model-Pub-Key`, `X-Venice-TEE-Signing-Algo`).
  </Step>

  <Step title="TEE Processing">
    TEE decrypts request, processes it, and encrypts the response.
  </Step>

  <Step title="Decrypt Response">
    Client receives encrypted chunks and decrypts with private key.
  </Step>
</Steps>

### Prerequisites

**JavaScript (Node.js ESM):**

```bash theme={"system"}
npm install elliptic @noble/ciphers @noble/hashes
```

**Python:**

```bash theme={"system"}
pip install cryptography ecdsa requests
```

### Step 1: Check Model E2EE Support

First, verify the model supports E2EE by checking the `/models` endpoint.

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  async function getE2EEModels(apiKey) {
    const response = await fetch('https://api.venice.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const { data } = await response.json()

    return data.filter(model => model.model_spec?.capabilities?.supportsE2EE === true)
  }

  // Example usage
  const models = await getE2EEModels('your-api-key')
  console.log('E2EE Models:', models.map(m => m.id))
  // Output: ['e2ee-qwen3-5-122b-a10b', 'e2ee-glm-5', ...]
  ```

  ```python Python theme={"system"}
  import requests

  def get_e2ee_models(api_key: str) -> list:
      """Get list of models that support E2EE."""
      response = requests.get(
          'https://api.venice.ai/api/v1/models',
          headers={'Authorization': f'Bearer {api_key}'}
      )
      models = response.json()['data']

      return [
          model for model in models
          if model.get('model_spec', {}).get('capabilities', {}).get('supportsE2EE')
      ]

  # Example usage
  models = get_e2ee_models('your-api-key')
  print('E2EE Models:', [m['id'] for m in models])
  ```
</CodeGroup>

### Step 2: Generate Ephemeral Key Pair

Generate a new key pair for each session. The private key should be kept in memory only and securely zeroed after use.

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  import { ec as EC } from 'elliptic'

  function generateEphemeralKeyPair() {
    const ec = new EC('secp256k1')
    const keyPair = ec.genKeyPair()

    return {
      privateKey: new Uint8Array(keyPair.getPrivate().toArray('be', 32)),
      publicKeyHex: keyPair.getPublic('hex'), // Uncompressed format (65 bytes hex)
    }
  }

  // Security: Zero-fill private key when done
  function zeroFill(arr) {
    arr.fill(0)
  }
  ```

  ```python Python theme={"system"}
  from ecdsa import SECP256k1, SigningKey
  import secrets

  def generate_ephemeral_key_pair():
      """Generate ephemeral secp256k1 key pair for E2EE session."""
      private_key = SigningKey.generate(curve=SECP256k1)
      public_key = private_key.get_verifying_key()

      # Get uncompressed public key (04 || x || y)
      public_key_bytes = b'\x04' + public_key.to_string()

      return {
          'private_key': private_key.to_string(),  # 32 bytes
          'public_key_hex': public_key_bytes.hex()  # 130 hex chars
      }
  ```
</CodeGroup>

#### Validation Helpers

Use these helper functions to validate keys and encrypted content before sending requests.

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  function validateClientPubkey(pubkeyHex) {
    if (pubkeyHex.length !== 130 || !pubkeyHex.startsWith('04')) {
      throw new Error(`Client pubkey must be 130 hex chars starting with '04' (got ${pubkeyHex.length})`)
    }
  }

  function isValidEncrypted(s) {
    // Minimum: ephemeral_pub (65) + nonce (12) + tag (16) = 93 bytes = 186 hex chars
    return s.length >= 186 && /^[0-9a-fA-F]+$/.test(s)
  }
  ```

  ```python Python theme={"system"}
  def validate_client_pubkey(pubkey_hex: str) -> None:
      """Validate client public key format."""
      if len(pubkey_hex) != 130 or not pubkey_hex.startswith('04'):
          raise ValueError(f"Client pubkey must be 130 hex chars starting with '04' (got {len(pubkey_hex)})")

  def is_valid_encrypted(s: str) -> bool:
      """Check if string is valid hex-encrypted content."""
      # Minimum: ephemeral_pub (65) + nonce (12) + tag (16) = 93 bytes = 186 hex chars
      return len(s) >= 186 and all(c in '0123456789abcdefABCDEF' for c in s)
  ```
</CodeGroup>

### Step 3: Fetch and Verify TEE Attestation

The attestation proves the model is running in a genuine TEE. Always verify the attestation before trusting the model's public key.

<Info>
  **Important: Nonce Length** - The client nonce must be **32 bytes (64 hex characters)**. Some TEE providers require exactly 32 bytes and will reject shorter nonces.
</Info>

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  import crypto from 'crypto'

  async function fetchAndVerifyAttestation(modelId, apiKey) {
    // Generate client nonce for replay protection (32 bytes = 64 hex chars)
    const clientNonce = crypto.randomBytes(32).toString('hex')

    const response = await fetch(
      `https://api.venice.ai/api/v1/tee/attestation?model=${encodeURIComponent(modelId)}&nonce=${clientNonce}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    const attestation = await response.json()

    // Verify attestation
    if (attestation.verified !== true) {
      throw new Error('TEE attestation verification failed on server')
    }

    if (attestation.nonce !== clientNonce) {
      throw new Error('Attestation nonce mismatch - possible replay attack')
    }

    // Get model's public key for encryption
    const modelPublicKey = attestation.signing_key || attestation.signing_public_key
    if (!modelPublicKey) {
      throw new Error('No signing key in attestation response')
    }

    return {
      modelPublicKey,
      signingAddress: attestation.signing_address,
      attestation,
    }
  }
  ```

  ```python Python theme={"system"}
  import secrets
  import requests

  def fetch_and_verify_attestation(model_id: str, api_key: str) -> dict:
      """Fetch and verify TEE attestation for a model."""
      # Generate client nonce for replay protection (32 bytes = 64 hex chars)
      client_nonce = secrets.token_hex(32)

      response = requests.get(
          f'https://api.venice.ai/api/v1/tee/attestation',
          params={'model': model_id, 'nonce': client_nonce},
          headers={'Authorization': f'Bearer {api_key}'}
      )
      attestation = response.json()

      # Verify attestation
      if attestation.get('verified') != True:
          raise ValueError('TEE attestation verification failed on server')

      if attestation.get('nonce') != client_nonce:
          raise ValueError('Attestation nonce mismatch - possible replay attack')

      # Get model's public key for encryption
      model_public_key = attestation.get('signing_key') or attestation.get('signing_public_key')
      if not model_public_key:
          raise ValueError('No signing key in attestation response')

      return {
          'model_public_key': model_public_key,
          'signing_address': attestation.get('signing_address'),
          'attestation': attestation
      }
  ```
</CodeGroup>

### Step 4: Encrypt Messages

Encrypt user and system messages before sending. Only `user` and `system` role messages need encryption.

<Warning>
  When E2EE headers are present, **all** `user` and `system` role messages must be encrypted. Sending any plaintext content in these roles will result in an "Encrypted field is not valid hex" error.
</Warning>

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  import { gcm } from '@noble/ciphers/aes.js'
  import { hkdf } from '@noble/hashes/hkdf.js'
  import { sha256 } from '@noble/hashes/sha2.js'
  import { ec as EC } from 'elliptic'
  import crypto from 'crypto'

  const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption')

  function encryptMessage(plaintext, modelPublicKeyHex) {
    const ec = new EC('secp256k1')

    // Normalize public key (add 04 prefix if needed)
    let normalizedKey = modelPublicKeyHex
    if (!normalizedKey.startsWith('04') && normalizedKey.length === 128) {
      normalizedKey = '04' + normalizedKey
    }

    const modelPublicKey = ec.keyFromPublic(normalizedKey, 'hex')

    // Generate ephemeral key pair for this message
    const ephemeralKeyPair = ec.genKeyPair()

    // ECDH shared secret
    const sharedSecret = ephemeralKeyPair.derive(modelPublicKey.getPublic())
    const sharedSecretBytes = new Uint8Array(sharedSecret.toArray('be', 32))

    // Derive AES key using HKDF
    const aesKey = hkdf(sha256, sharedSecretBytes, undefined, HKDF_INFO, 32)

    // Generate random nonce
    const nonce = crypto.randomBytes(12)

    // Encrypt with AES-GCM
    const cipher = gcm(aesKey, nonce)
    const encrypted = cipher.encrypt(new TextEncoder().encode(plaintext))

    // Get ephemeral public key (uncompressed)
    const ephemeralPublic = new Uint8Array(ephemeralKeyPair.getPublic(false, 'array'))

    // Combine: ephemeral_public (65 bytes) + nonce (12 bytes) + ciphertext
    const result = new Uint8Array(65 + 12 + encrypted.length)
    result.set(ephemeralPublic, 0)
    result.set(nonce, 65)
    result.set(encrypted, 65 + 12)

    return Buffer.from(result).toString('hex')
  }

  function encryptMessagesForE2EE(messages, modelPublicKey) {
    return messages.map(msg => {
      if (msg.role === 'user' || msg.role === 'system') {
        return {
          ...msg,
          content: encryptMessage(msg.content, modelPublicKey),
        }
      }
      return msg
    })
  }
  ```

  ```python Python theme={"system"}
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  from cryptography.hazmat.primitives.kdf.hkdf import HKDF
  from cryptography.hazmat.primitives import hashes
  from ecdsa import SECP256k1, VerifyingKey, SigningKey
  import os

  HKDF_INFO = b'ecdsa_encryption'

  def encrypt_message(plaintext: str, model_public_key_hex: str) -> str:
      """Encrypt a message using ECDH + HKDF + AES-GCM."""
      # Normalize public key
      key_hex = model_public_key_hex
      if not key_hex.startswith('04') and len(key_hex) == 128:
          key_hex = '04' + key_hex

      model_public_key_bytes = bytes.fromhex(key_hex)

      # Parse model's public key (skip 04 prefix)
      model_verifying_key = VerifyingKey.from_string(
          model_public_key_bytes[1:],
          curve=SECP256k1
      )

      # Generate ephemeral key pair for this message
      ephemeral_private = SigningKey.generate(curve=SECP256k1)
      ephemeral_public = ephemeral_private.get_verifying_key()

      # ECDH: compute shared secret
      shared_point = model_verifying_key.pubkey.point * ephemeral_private.privkey.secret_multiplier
      shared_secret = shared_point.x().to_bytes(32, 'big')

      # Derive AES key using HKDF
      hkdf = HKDF(
          algorithm=hashes.SHA256(),
          length=32,
          salt=None,
          info=HKDF_INFO,
      )
      aes_key = hkdf.derive(shared_secret)

      # Generate random nonce
      nonce = os.urandom(12)

      # Encrypt with AES-GCM
      aesgcm = AESGCM(aes_key)
      ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)

      # Get ephemeral public key (uncompressed: 04 || x || y)
      ephemeral_public_bytes = b'\x04' + ephemeral_public.to_string()

      # Combine: ephemeral_public (65 bytes) + nonce (12 bytes) + ciphertext
      result = ephemeral_public_bytes + nonce + ciphertext

      return result.hex()

  def encrypt_messages_for_e2ee(messages: list, model_public_key: str) -> list:
      """Encrypt user and system messages."""
      encrypted_messages = []
      for msg in messages:
          if msg['role'] in ('user', 'system'):
              encrypted_messages.append({
                  **msg,
                  'content': encrypt_message(msg['content'], model_public_key)
              })
          else:
              encrypted_messages.append(msg)
      return encrypted_messages
  ```
</CodeGroup>

### Step 5: Send Request with E2EE Headers

Include the required headers to enable E2EE processing.

| Header                        | Description                                             |
| ----------------------------- | ------------------------------------------------------- |
| `X-Venice-TEE-Client-Pub-Key` | Your ephemeral public key (uncompressed hex, 130 chars) |
| `X-Venice-TEE-Model-Pub-Key`  | Model's public key from attestation                     |
| `X-Venice-TEE-Signing-Algo`   | Always `ecdsa`                                          |

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  async function sendE2EERequest(messages, model, e2eeContext, apiKey) {
    // Encrypt messages
    const encryptedMessages = encryptMessagesForE2EE(messages, e2eeContext.modelPublicKey)

    const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // E2EE headers
        'X-Venice-TEE-Client-Pub-Key': e2eeContext.publicKeyHex,
        'X-Venice-TEE-Model-Pub-Key': e2eeContext.modelPublicKey,
        'X-Venice-TEE-Signing-Algo': 'ecdsa',
      },
      body: JSON.stringify({
        model,
        messages: encryptedMessages,
        stream: true, // E2EE requires streaming
      }),
    })

    return response
  }
  ```

  ```python Python theme={"system"}
  import requests

  def send_e2ee_request(
      messages: list,
      model: str,
      e2ee_context: dict,
      api_key: str
  ) -> requests.Response:
      """Send an E2EE-encrypted chat completion request."""
      # Encrypt messages
      encrypted_messages = encrypt_messages_for_e2ee(
          messages,
          e2ee_context['model_public_key']
      )

      response = requests.post(
          'https://api.venice.ai/api/v1/chat/completions',
          headers={
              'Authorization': f'Bearer {api_key}',
              'Content-Type': 'application/json',
              # E2EE headers
              'X-Venice-TEE-Client-Pub-Key': e2ee_context['public_key_hex'],
              'X-Venice-TEE-Model-Pub-Key': e2ee_context['model_public_key'],
              'X-Venice-TEE-Signing-Algo': 'ecdsa'
          },
          json={
              'model': model,
              'messages': encrypted_messages,
              'stream': True  # E2EE requires streaming
          },
          stream=True
      )

      return response
  ```
</CodeGroup>

### Step 6: Decrypt Response Chunks

Responses from E2EE models are hex-encoded encrypted chunks. Decrypt each chunk using your private key.

<CodeGroup>
  ```javascript JavaScript theme={"system"}
  import { gcm } from '@noble/ciphers/aes.js'
  import { hkdf } from '@noble/hashes/hkdf.js'
  import { sha256 } from '@noble/hashes/sha2.js'
  import { ec as EC } from 'elliptic'

  const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption')

  function hexToBytes(hex) {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex
    const bytes = new Uint8Array(h.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16)
    }
    return bytes
  }

  function isHexEncrypted(s) {
    // Minimum: ephemeral_pub (65) + nonce (12) + tag (16) = 93 bytes = 186 hex chars
    if (s.length < 186) return false
    return /^[0-9a-fA-F]+$/.test(s)
  }

  function decryptChunk(ciphertextHex, clientPrivateKey) {
    const raw = hexToBytes(ciphertextHex)

    // Parse components
    const serverEphemeralPubKey = raw.slice(0, 65)
    const nonce = raw.slice(65, 65 + 12)
    const ciphertext = raw.slice(65 + 12)

    // ECDH with server's ephemeral key
    const ec = new EC('secp256k1')
    const clientKey = ec.keyFromPrivate(Buffer.from(clientPrivateKey))
    const serverKey = ec.keyFromPublic(Buffer.from(serverEphemeralPubKey))
    const sharedSecret = clientKey.derive(serverKey.getPublic())
    const sharedSecretBytes = new Uint8Array(sharedSecret.toArray('be', 32))

    // Derive AES key
    const aesKey = hkdf(sha256, sharedSecretBytes, undefined, HKDF_INFO, 32)

    // Decrypt
    const cipher = gcm(aesKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)

    return new TextDecoder().decode(plaintext)
  }

  // Process streaming response
  async function processE2EEStream(response, clientPrivateKey) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const chunk = JSON.parse(data)
          const content = chunk.choices?.[0]?.delta?.content

          if (content && isHexEncrypted(content)) {
            const decrypted = decryptChunk(content, clientPrivateKey)
            fullContent += decrypted
            process.stdout.write(decrypted) // Real-time output
          } else if (content) {
            fullContent += content
            process.stdout.write(content)
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }

    return fullContent
  }
  ```

  ```python Python theme={"system"}
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  from cryptography.hazmat.primitives.kdf.hkdf import HKDF
  from cryptography.hazmat.primitives import hashes
  from ecdsa import SECP256k1, VerifyingKey, SigningKey
  import json
  import re

  HKDF_INFO = b'ecdsa_encryption'

  def is_hex_encrypted(s: str) -> bool:
      """Check if string looks like hex-encrypted content."""
      if len(s) < 186:  # Minimum: 65 + 12 + 16 = 93 bytes = 186 hex
          return False
      return bool(re.match(r'^[0-9a-fA-F]+$', s))

  def decrypt_chunk(ciphertext_hex: str, client_private_key: bytes) -> str:
      """Decrypt an E2EE response chunk."""
      raw = bytes.fromhex(ciphertext_hex)

      # Parse components
      server_ephemeral_pub = raw[:65]
      nonce = raw[65:77]
      ciphertext = raw[77:]

      # Parse server's ephemeral public key (skip 04 prefix)
      server_verifying_key = VerifyingKey.from_string(
          server_ephemeral_pub[1:],
          curve=SECP256k1
      )

      # Reconstruct client's private key
      client_signing_key = SigningKey.from_string(client_private_key, curve=SECP256k1)

      # ECDH: compute shared secret
      shared_point = server_verifying_key.pubkey.point * client_signing_key.privkey.secret_multiplier
      shared_secret = shared_point.x().to_bytes(32, 'big')

      # Derive AES key
      hkdf = HKDF(
          algorithm=hashes.SHA256(),
          length=32,
          salt=None,
          info=HKDF_INFO,
      )
      aes_key = hkdf.derive(shared_secret)

      # Decrypt
      aesgcm = AESGCM(aes_key)
      plaintext = aesgcm.decrypt(nonce, ciphertext, None)

      return plaintext.decode('utf-8')

  def process_e2ee_stream(response, client_private_key: bytes) -> str:
      """Process streaming E2EE response."""
      full_content = ''

      for line in response.iter_lines():
          if not line:
              continue

          line_str = line.decode('utf-8')
          if not line_str.startswith('data: '):
              continue

          data = line_str[6:]
          if data == '[DONE]':
              continue

          try:
              chunk = json.loads(data)
              content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')

              if content and is_hex_encrypted(content):
                  decrypted = decrypt_chunk(content, client_private_key)
                  full_content += decrypted
                  print(decrypted, end='', flush=True)  # Real-time output
              elif content:
                  full_content += content
                  print(content, end='', flush=True)
          except json.JSONDecodeError:
              pass

      print()  # Final newline
      return full_content
  ```
</CodeGroup>

### Complete Working Example

<Tabs>
  <Tab title="JavaScript">
    ```javascript theme={"system"}
    import elliptic from 'elliptic';
    import { gcm } from '@noble/ciphers/aes.js';
    import { hkdf } from '@noble/hashes/hkdf.js';
    import { sha256 } from '@noble/hashes/sha2.js';
    import crypto from 'crypto';

    const EC = elliptic.ec;

    const API_KEY = process.env.API_KEY_VENICE;
    const BASE_URL = 'https://api.venice.ai/api/v1';
    const MODEL = 'e2ee-qwen3-5-122b-a10b';
    const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption');

    function hexToBytes(hex) {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }

    async function main() {
      // Step 1: Generate ephemeral key pair
      console.log('🔑 Generating ephemeral key pair...');
      const ec = new EC('secp256k1');
      const keyPair = ec.genKeyPair();
      const clientPublicKeyHex = keyPair.getPublic('hex');

      // Step 2: Fetch and verify attestation
      console.log('🔍 Fetching TEE attestation...');
      const clientNonce = crypto.randomBytes(32).toString('hex'); // 32 bytes required
      const attestationRes = await fetch(
        `${BASE_URL}/tee/attestation?model=${MODEL}&nonce=${clientNonce}`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      const attestation = await attestationRes.json();

      if (attestation.verified !== true || attestation.nonce !== clientNonce) {
        throw new Error('Attestation verification failed');
      }

      const modelPublicKey = attestation.signing_key || attestation.signing_public_key;
      console.log('✅ TEE attestation verified');

      // Step 3: Encrypt message
      console.log('🔐 Encrypting message...');
      const plaintext = 'What is 2+2? Answer briefly.';

      // Normalize and parse model's public key
      let normalizedKey = modelPublicKey;
      if (!normalizedKey.startsWith('04') && normalizedKey.length === 128) {
        normalizedKey = '04' + normalizedKey;
      }

      const modelKey = ec.keyFromPublic(normalizedKey, 'hex');
      const ephemeralKeyPair = ec.genKeyPair();
      const sharedSecret = ephemeralKeyPair.derive(modelKey.getPublic());
      const sharedSecretBytes = new Uint8Array(sharedSecret.toArray('be', 32));
      const aesKey = hkdf(sha256, sharedSecretBytes, undefined, HKDF_INFO, 32);
      const nonce = crypto.randomBytes(12);
      const cipher = gcm(aesKey, nonce);
      const encrypted = cipher.encrypt(new TextEncoder().encode(plaintext));
      const ephemeralPublic = new Uint8Array(ephemeralKeyPair.getPublic(false, 'array'));

      const result = new Uint8Array(65 + 12 + encrypted.length);
      result.set(ephemeralPublic, 0);
      result.set(nonce, 65);
      result.set(encrypted, 77);

      const encryptedContent = Buffer.from(result).toString('hex');
      const messages = [{ role: 'user', content: encryptedContent }];

      // Step 4: Send E2EE request
      console.log('📤 Sending encrypted request...');
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-Venice-TEE-Client-Pub-Key': clientPublicKeyHex,
          'X-Venice-TEE-Model-Pub-Key': modelPublicKey,
          'X-Venice-TEE-Signing-Algo': 'ecdsa',
        },
        body: JSON.stringify({ model: MODEL, messages, stream: true }),
      });

      // Step 5: Decrypt response
      console.log('📥 Decrypting response...\n');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;

          try {
            const chunk = JSON.parse(line.slice(6));
            const content = chunk.choices?.[0]?.delta?.content;
            if (!content) continue;

            if (/^[0-9a-fA-F]+$/.test(content) && content.length >= 186) {
              // Decrypt
              const raw = hexToBytes(content);
              const serverEphemeralPub = raw.slice(0, 65);
              const nonce = raw.slice(65, 77);
              const ciphertext = raw.slice(77);

              const serverKey = ec.keyFromPublic(Buffer.from(serverEphemeralPub));
              const sharedSecret = keyPair.derive(serverKey.getPublic());
              const aesKey = hkdf(sha256, new Uint8Array(sharedSecret.toArray('be', 32)), undefined, HKDF_INFO, 32);
              const cipher = gcm(aesKey, nonce);
              const plaintext = new TextDecoder().decode(cipher.decrypt(ciphertext));
              process.stdout.write(plaintext);
            } else {
              process.stdout.write(content);
            }
          } catch {}
        }
      }

      console.log('\n\n🔐 Response decrypted end-to-end');
    }

    main().catch(console.error);
    ```
  </Tab>

  <Tab title="Python">
    ```python theme={"system"}
    #!/usr/bin/env python3
    """Complete E2EE implementation example for Venice AI API."""

    import os
    import json
    import secrets
    import requests
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
    from ecdsa import SECP256k1, VerifyingKey, SigningKey

    API_KEY = os.environ.get('API_KEY_VENICE')
    BASE_URL = 'https://api.venice.ai/api/v1'
    MODEL = 'e2ee-qwen3-5-122b-a10b'
    HKDF_INFO = b'ecdsa_encryption'

    def main():
        # Step 1: Generate ephemeral key pair
        print('🔑 Generating ephemeral key pair...')
        private_key = SigningKey.generate(curve=SECP256k1)
        public_key = private_key.get_verifying_key()
        client_public_key_hex = (b'\x04' + public_key.to_string()).hex()

        # Step 2: Fetch and verify attestation
        print('🔍 Fetching TEE attestation...')
        client_nonce = secrets.token_hex(32)  # 32 bytes required
        attestation_res = requests.get(
            f'{BASE_URL}/tee/attestation',
            params={'model': MODEL, 'nonce': client_nonce},
            headers={'Authorization': f'Bearer {API_KEY}'},
            timeout=30
        )
        attestation = attestation_res.json()

        if attestation.get('verified') != True or attestation.get('nonce') != client_nonce:
            raise ValueError('Attestation verification failed')

        model_public_key = attestation.get('signing_key') or attestation.get('signing_public_key')
        print(f'✅ TEE attestation verified (provider: {attestation.get("tee_provider", "unknown")})')

        # Step 3: Encrypt message
        print('🔐 Encrypting message...')
        plaintext = 'What is 2+2? Answer briefly.'

        # Normalize public key
        key_hex = model_public_key
        if not key_hex.startswith('04') and len(key_hex) == 128:
            key_hex = '04' + key_hex

        model_key_bytes = bytes.fromhex(key_hex)
        model_verifying_key = VerifyingKey.from_string(model_key_bytes[1:], curve=SECP256k1)

        # ECDH
        ephemeral_private = SigningKey.generate(curve=SECP256k1)
        ephemeral_public = ephemeral_private.get_verifying_key()
        shared_point = model_verifying_key.pubkey.point * ephemeral_private.privkey.secret_multiplier
        shared_secret = shared_point.x().to_bytes(32, 'big')

        # Derive AES key
        hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=HKDF_INFO)
        aes_key = hkdf.derive(shared_secret)

        # Encrypt
        nonce = os.urandom(12)
        aesgcm = AESGCM(aes_key)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)

        ephemeral_public_bytes = b'\x04' + ephemeral_public.to_string()
        result = ephemeral_public_bytes + nonce + ciphertext
        encrypted_content = result.hex()

        messages = [{'role': 'user', 'content': encrypted_content}]

        # Step 4: Send E2EE request
        print('📤 Sending encrypted request...')
        response = requests.post(
            f'{BASE_URL}/chat/completions',
            headers={
                'Authorization': f'Bearer {API_KEY}',
                'Content-Type': 'application/json',
                'X-Venice-TEE-Client-Pub-Key': client_public_key_hex,
                'X-Venice-TEE-Model-Pub-Key': model_public_key,
                'X-Venice-TEE-Signing-Algo': 'ecdsa'
            },
            json={'model': MODEL, 'messages': messages, 'stream': True},
            stream=True,
            timeout=60
        )

        # Step 5: Decrypt response
        print('📥 Decrypting response...\n')

        for line in response.iter_lines():
            if not line:
                continue
            line_str = line.decode('utf-8')
            if not line_str.startswith('data: ') or '[DONE]' in line_str:
                continue

            try:
                chunk = json.loads(line_str[6:])
                content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                if not content:
                    continue

                # Check if encrypted
                if len(content) >= 186 and all(c in '0123456789abcdefABCDEF' for c in content):
                    raw = bytes.fromhex(content)
                    server_ephemeral_pub = raw[:65]
                    nonce = raw[65:77]
                    ciphertext = raw[77:]

                    server_verifying_key = VerifyingKey.from_string(server_ephemeral_pub[1:], curve=SECP256k1)
                    shared_point = server_verifying_key.pubkey.point * private_key.privkey.secret_multiplier
                    shared_secret = shared_point.x().to_bytes(32, 'big')

                    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=HKDF_INFO)
                    aes_key = hkdf.derive(shared_secret)

                    aesgcm = AESGCM(aes_key)
                    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
                    print(plaintext.decode('utf-8'), end='', flush=True)
                else:
                    print(content, end='', flush=True)
            except Exception:
                pass

        print('\n\n🔐 Response decrypted end-to-end')

    if __name__ == '__main__':
        main()
    ```
  </Tab>
</Tabs>

### E2EE Limitations

<Warning>
  E2EE has some constraints due to the encryption requirements:
</Warning>

| Feature              | Status                                       |
| -------------------- | -------------------------------------------- |
| Streaming            | **Required** (non-streaming not supported)   |
| Web search           | **Disabled** (would leak content)            |
| File uploads         | **Not supported**                            |
| Function calling     | **Not supported**                            |
| Venice system prompt | **Disabled** (must be encrypted client-side) |

### Security Best Practices

1. **Generate new key pairs per session** - Don't reuse ephemeral keys
2. **Zero-fill private keys** - Clear private key bytes from memory when done
3. **Verify attestation** - Always check `verified: true` and nonce match
4. **Check for debug mode** - Reject attestations from debug enclaves
5. **Use streaming** - E2EE requires streaming for proper encryption chunking
6. **Handle errors gracefully** - Don't expose decryption errors to users
7. **Use 32-byte nonces** - TEE providers require exactly 32 bytes

## Best Practices

<AccordionGroup>
  <Accordion title="Always verify attestation in production">
    Don't just trust the `verified: true` response. Parse the Intel TDX quote client-side and verify the measurements match expected values. For NVIDIA GPUs, check the attestation via NVIDIA's verification service.
  </Accordion>

  <Accordion title="Use fresh nonces">
    Always generate a new random nonce for each attestation request. This prevents replay attacks where an attacker could serve a stale attestation.
  </Accordion>

  <Accordion title="Verify key binding">
    The signing key should be bound to the TDX REPORTDATA field. This proves the key was generated inside the enclave.
  </Accordion>

  <Accordion title="Check for debug mode">
    Verify the TDX attestation doesn't have debug flags set. A debug enclave can be inspected and should not be trusted for production.
  </Accordion>

  <Accordion title="Use our SDKs for E2EE">
    E2EE requires careful cryptographic implementation. Use our official SDKs rather than implementing the protocol yourself.
  </Accordion>
</AccordionGroup>

## Checking Model Capabilities

You can check if a model supports TEE or E2EE via the models endpoint:

<CodeGroup>
  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/models \
    -H "Authorization: Bearer $API_KEY_VENICE" | jq '.data[] | select(.model_spec.capabilities.supportsTeeAttestation == true or .model_spec.capabilities.supportsE2EE == true) | {id, tee: .model_spec.capabilities.supportsTeeAttestation, e2ee: .model_spec.capabilities.supportsE2EE}'
  ```

  ```python Python theme={"system"}
  models = client.models.list()

  for model in models.data:
      caps = getattr(model, 'model_spec', {}).get('capabilities', {})
      if caps.get('supportsTeeAttestation') or caps.get('supportsE2EE'):
          print(f"{model.id}: TEE={caps.get('supportsTeeAttestation')}, E2EE={caps.get('supportsE2EE')}")
  ```
</CodeGroup>

## Error Handling

| Error                                 | Cause                               | Solution                             |
| ------------------------------------- | ----------------------------------- | ------------------------------------ |
| `TEE attestation verification failed` | Attestation didn't pass validation  | Retry or contact support             |
| `Attestation nonce mismatch`          | Possible replay attack              | Generate a fresh nonce               |
| `TDX debug mode detected`             | Enclave is in debug mode            | Don't use for production             |
| `Failed to decrypt field`             | E2EE decryption failed server-side  | Check your encryption implementation |
| `E2EE requires streaming`             | Non-streaming request to E2EE model | Set `stream: true`                   |
| `Encrypted field is not valid hex`    | Plaintext sent with E2EE headers    | Encrypt all user/system messages     |
| `Invalid public key`                  | Wrong key format                    | Use 130 hex chars starting with `04` |

## Troubleshooting

<AccordionGroup>
  <Accordion title="502 Bad Gateway or 'Nonce must be exactly 32 bytes'">
    The nonce length is incorrect. TEE providers require exactly **32 bytes (64 hex characters)**.

    * Use `crypto.randomBytes(32).toString('hex')` (JS) or `secrets.token_hex(32)` (Python)
    * Common mistake: `secrets.token_hex(16)` produces 32 hex chars (16 bytes), not 32 bytes
  </Accordion>

  <Accordion title="Attestation verification failed">
    * Check that the model supports E2EE (`supportsE2EE: true`)
    * Verify your API key is valid and has access to the requested model
    * Verify network connectivity to Venice API
  </Accordion>

  <Accordion title="Decryption failed">
    * Ensure you're using the same private key that generated the public key sent in headers
    * Check that the response content is actually hex-encoded (E2EE active)
    * Verify the model public key matches what was used for encryption
  </Accordion>

  <Accordion title="Encrypted field is not valid hex">
    * All `user` and `system` role messages must be encrypted when E2EE headers are present
    * Verify your encrypted content passes the `isValidEncrypted()` validation (minimum 186 hex characters)
    * Check that encryption output is lowercase hex without any prefixes
  </Accordion>

  <Accordion title="Invalid public key errors">
    * Client public key must be exactly **130 hex characters** starting with `04`
    * Use the `validateClientPubkey()` helper to verify format before sending
    * Ensure you're using uncompressed public key format (65 bytes = 130 hex chars)
  </Accordion>

  <Accordion title="Model not found">
    * Verify the model ID is correct and the model supports E2EE
    * Use the `/models` endpoint to verify available E2EE models
  </Accordion>
</AccordionGroup>

## Resources

* [Intel TDX Documentation](https://www.intel.com/content/www/us/en/developer/tools/trust-domain-extensions/documentation.html)
* [NVIDIA Confidential Computing](https://developer.nvidia.com/confidential-computing)


# Vercel AI SDK
Source: https://docs.venice.ai/overview/guides/vercel-ai-sdk

Build AI-powered Next.js and React apps with Venice AI and the Vercel AI SDK

The [Vercel AI SDK](https://sdk.vercel.ai/) is the most popular way to build AI features in Next.js, React, Svelte, and Vue apps. Venice works out of the box as an OpenAI-compatible provider.

## Setup

```bash theme={"system"}
npm install ai @ai-sdk/openai
```

## Provider Configuration

Create a Venice provider using the OpenAI-compatible adapter:

```typescript theme={"system"}
// lib/venice.ts
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.VENICE_API_KEY!,
  baseURL: 'https://api.venice.ai/api/v1',
});

// Use .chat() to ensure compatibility with Venice's chat completions endpoint
export const venice = (modelId: string) => openai.chat(modelId);
```

<Note>
  Using `.chat()` ensures requests go to Venice's `/chat/completions` endpoint. The default `openai('model')` syntax may use newer OpenAI endpoints that Venice doesn't support yet.
</Note>

## Streaming Chat (Next.js App Router)

### API Route

```typescript theme={"system"}
// app/api/chat/route.ts
import { streamText } from 'ai';
import { venice } from '@/lib/venice';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: venice('venice-uncensored'),
    system: 'You are a helpful, privacy-respecting AI assistant.',
    messages,
  });

  return result.toDataStreamResponse();
}
```

### React Component

```tsx theme={"system"}
// app/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className="font-bold">{m.role === 'user' ? 'You' : 'Venice'}:</span>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          className="flex-1 border rounded px-3 py-2"
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading} className="bg-red-600 text-white px-4 py-2 rounded">
          Send
        </button>
      </form>
    </div>
  );
}
```

## Generating Text (Non-Streaming)

```typescript theme={"system"}
import { generateText } from 'ai';
import { venice } from '@/lib/venice';

const { text } = await generateText({
  model: venice('zai-org-glm-5-1'),
  prompt: 'Explain zero-knowledge proofs in simple terms.',
});

console.log(text);
```

## Structured Output

```typescript theme={"system"}
import { generateObject } from 'ai';
import { venice } from '@/lib/venice';
import { z } from 'zod';

const { object } = await generateObject({
  model: venice('venice-uncensored'),
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.string()),
      steps: z.array(z.string()),
      prepTimeMinutes: z.number(),
    }),
  }),
  prompt: 'Generate a recipe for chocolate chip cookies.',
});

console.log(object.recipe.name);
console.log(`Prep time: ${object.recipe.prepTimeMinutes} minutes`);
```

## Tool Calling

```typescript theme={"system"}
import { streamText, tool } from 'ai';
import { venice } from '@/lib/venice';
import { z } from 'zod';

const result = streamText({
  model: venice('zai-org-glm-5-1'),
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
  tools: {
    getWeather: tool({
      description: 'Get current weather for a location',
      parameters: z.object({
        location: z.string().describe('City name'),
      }),
      execute: async ({ location }) => {
        // Your weather API call here
        return { temperature: 22, condition: 'Sunny', location };
      },
    }),
  },
});

for await (const part of result.fullStream) {
  if (part.type === 'text-delta') {
    process.stdout.write(part.textDelta);
  } else if (part.type === 'tool-result') {
    console.log('Tool result:', part.result);
  }
}
```

## Image Generation

Venice image generation can be called directly alongside the AI SDK:

```typescript theme={"system"}
// app/api/image/route.ts
export async function POST(req: Request) {
  const { prompt } = await req.json();

  const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-image',
      prompt,
      width: 1024,
      height: 1024,
    }),
  });

  const data = await response.json();
  return Response.json({ image: data.images[0] });
}
```

## Multi-Model Chat (Model Selector)

Let users choose between Venice models:

```typescript theme={"system"}
// app/api/chat/route.ts
import { streamText } from 'ai';
import { venice } from '@/lib/venice';

const ALLOWED_MODELS = [
  'venice-uncensored',
  'zai-org-glm-5-1',
  'qwen3-vl-235b-a22b',
  'qwen3-5-9b',
];

export async function POST(req: Request) {
  const { messages, model: modelId } = await req.json();

  if (!ALLOWED_MODELS.includes(modelId)) {
    return new Response('Invalid model', { status: 400 });
  }

  const result = streamText({
    model: venice(modelId),
    messages,
  });

  return result.toDataStreamResponse();
}
```

```tsx theme={"system"}
// Client component with model selector
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

const MODELS = [
  { id: 'venice-uncensored', name: 'Venice Uncensored', desc: 'Fast & uncensored' },
  { id: 'zai-org-glm-5-1', name: 'GLM 5.1', desc: 'Most intelligent (private)' },
  { id: 'qwen3-vl-235b-a22b', name: 'Qwen Vision', desc: 'Advanced vision + text' },
  { id: 'qwen3-5-9b', name: 'Qwen 3.5 9B', desc: 'Fastest & cheapest' },
];

export default function Chat() {
  const [model, setModel] = useState('venice-uncensored');
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    body: { model },
  });

  return (
    <div>
      <select value={model} onChange={(e) => setModel(e.target.value)}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name} — {m.desc}</option>
        ))}
      </select>
      {/* ... chat UI ... */}
    </div>
  );
}
```

## Web Search Integration

Pass Venice parameters for web search:

```typescript theme={"system"}
import { streamText } from 'ai';
import { venice } from '@/lib/venice';

const result = streamText({
  model: venice('venice-uncensored'),
  messages: [{ role: 'user', content: 'What happened in AI news today?' }],
  // Venice-specific parameters
  experimental_providerMetadata: {
    venice_parameters: {
      enable_web_search: 'auto',
    },
  },
});
```

<Note>
  If `experimental_providerMetadata` doesn't pass through, you can use a custom fetch wrapper or call the Venice API directly for web search features.
</Note>

## Embeddings

For embeddings, use `textEmbeddingModel()` on the provider directly:

```typescript theme={"system"}
import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.VENICE_API_KEY!,
  baseURL: 'https://api.venice.ai/api/v1',
});

// Single embedding
const { embedding } = await embed({
  model: openai.textEmbeddingModel('text-embedding-bge-m3'),
  value: 'Privacy-first AI infrastructure',
});

// Batch embeddings
const { embeddings } = await embedMany({
  model: openai.textEmbeddingModel('text-embedding-bge-m3'),
  values: [
    'Venice AI provides private inference.',
    'Zero data retention guaranteed.',
    'OpenAI SDK compatible.',
  ],
});
```

## Environment Variables

```bash theme={"system"}
# .env.local
VENICE_API_KEY=your-venice-api-key
```

## Recommended Models

| Use Case      | Model                | Why                                         |
| ------------- | -------------------- | ------------------------------------------- |
| Chat apps     | `venice-uncensored`  | Fast, cheap, no filtering                   |
| Complex tasks | `zai-org-glm-5-1`    | Private flagship reasoning                  |
| Vision apps   | `qwen3-vl-235b-a22b` | Advanced image understanding                |
| High-volume   | `qwen3-5-9b`         | Cheapest at $0.10/1M input, $0.15/1M output |
| Tool calling  | `zai-org-glm-5-1`    | Reliable function calling                   |

<CardGroup>
  <Card title="Vercel AI SDK Docs" icon="book" href="https://sdk.vercel.ai/docs">
    Official Vercel AI SDK documentation
  </Card>

  <Card title="Venice Models" icon="database" href="/models/overview">
    Browse all Venice models
  </Card>
</CardGroup>


# Video Generation
Source: https://docs.venice.ai/overview/guides/video-generation

Generate videos from text prompts or images using Venice's async queue system

Video generation is async. Submit a job, save `queue_id`, then poll `/video/retrieve` until the response is `video/mp4`.

## Endpoints

| Endpoint               | Purpose                            | Required |
| ---------------------- | ---------------------------------- | -------- |
| `POST /video/quote`    | Get price in USD before generating | No       |
| `POST /video/queue`    | Submit generation request          | Yes      |
| `POST /video/retrieve` | Poll status or download video      | Yes      |
| `POST /video/complete` | Delete video from storage          | No       |

## Step 1: Queue Generation

**Request:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/video/queue
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "wan-2.5-preview-text-to-video",
  "prompt": "A gondola gliding through Venice canals at sunset",
  "duration": "5s",
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

**Response (200):**

```json theme={"system"}
{
  "model": "wan-2.5-preview-text-to-video",
  "queue_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

For Grok Imagine Private models, the queue response includes an extra `download_url` field:

```json theme={"system"}
{
  "model": "grok-imagine-text-to-video-private",
  "queue_id": "123e4567-e89b-12d3-a456-426614174000",
  "download_url": "https://private-share.venice.ai/v1/share/read/..."
}
```

`download_url` is a pre-signed URL you use to download the finished video instead of reading it from the retrieve response. It is only returned once, so persist it alongside `queue_id`. This applies to all four Grok Imagine Private variants:

* `grok-imagine-text-to-video-private`
* `grok-imagine-image-to-video-private`
* `grok-imagine-reference-to-video-private`
* `grok-imagine-video-to-video-private`

Unlike the public `grok-imagine-*-video` variants, Grok Imagine Private models are not billed for content-moderation rejections, so you only pay for successful generations.

Save `model`, `queue_id`, and `download_url` (if present) for all subsequent calls.

## Step 2: Poll for Completion

**Request:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/video/retrieve
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "wan-2.5-preview-text-to-video",
  "queue_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response depends on status:**

| Content-Type                          | Meaning                    | Action                                           |
| ------------------------------------- | -------------------------- | ------------------------------------------------ |
| `application/json`                    | Still processing           | Wait 5s, poll again                              |
| `video/mp4`                           | Complete                   | Response body is the video file                  |
| `application/json` with `"COMPLETED"` | Complete, video not inline | `GET` the `download_url` from the queue response |

**Processing response (200, application/json):**

```json theme={"system"}
{
  "status": "PROCESSING",
  "average_execution_time": 145000,
  "execution_duration": 53200
}
```

Times are in milliseconds. Use `average_execution_time` to estimate remaining wait.

**Complete response (200, video/mp4):**
Response body is raw binary video data. Save to file.

**Complete response (200, application/json with `"COMPLETED"`):**
For models that returned a `download_url` at queue time, retrieve always returns JSON. Fetch the video with `GET download_url`. The URL is pre-signed (no auth header needed) and valid for 24 hours.

## Step 3: Cleanup (Optional)

Either auto-delete on retrieval:

```json theme={"system"}
{
  "model": "wan-2.5-preview-text-to-video",
  "queue_id": "123e4567-e89b-12d3-a456-426614174000",
  "delete_media_on_completion": true
}
```

Or call `/video/complete` after saving:

```bash theme={"system"}
POST https://api.venice.ai/api/v1/video/complete
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "wan-2.5-preview-text-to-video",
  "queue_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response (200):**

```json theme={"system"}
{
  "success": true
}
```

***

## Complete Example

<CodeGroup>
  ```python Python theme={"system"}
  import os
  import time
  import requests

  API_KEY = os.environ.get("VENICE_API_KEY")
  BASE_URL = "https://api.venice.ai/api/v1"
  HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

  # Queue
  resp = requests.post(f"{BASE_URL}/video/queue", headers=HEADERS, json={
      "model": "wan-2.5-preview-text-to-video",
      "prompt": "A gondola gliding through Venice canals at sunset",
      "duration": "5s",
      "resolution": "720p",
      "aspect_ratio": "16:9"
  })
  data = resp.json()
  model, queue_id = data["model"], data["queue_id"]
  download_url = data.get("download_url")

  # Poll
  while True:
      resp = requests.post(f"{BASE_URL}/video/retrieve", headers=HEADERS,
                           json={"model": model, "queue_id": queue_id})
      if "video/mp4" in resp.headers.get("Content-Type", ""):
          with open("output.mp4", "wb") as f:
              f.write(resp.content)
          break
      if resp.json().get("status") == "COMPLETED" and download_url:
          with open("output.mp4", "wb") as f:
              f.write(requests.get(download_url).content)
          break
      time.sleep(5)

  # Cleanup
  requests.post(f"{BASE_URL}/video/complete", headers=HEADERS,
                json={"model": model, "queue_id": queue_id})
  ```

  ```javascript Node.js theme={"system"}
  const API_KEY = process.env.VENICE_API_KEY;
  const BASE_URL = "https://api.venice.ai/api/v1";
  const headers = {"Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json"};

  // Queue
  const queueResp = await fetch(`${BASE_URL}/video/queue`, {
      method: "POST", headers,
      body: JSON.stringify({
          model: "wan-2.5-preview-text-to-video",
          prompt: "A gondola gliding through Venice canals at sunset",
          duration: "5s", resolution: "720p", aspect_ratio: "16:9"
      })
  });
  const {model, queue_id, download_url} = await queueResp.json();

  // Poll
  while (true) {
      const resp = await fetch(`${BASE_URL}/video/retrieve`, {
          method: "POST", headers,
          body: JSON.stringify({model, queue_id})
      });
      if (resp.headers.get("Content-Type")?.includes("video/mp4")) {
          const fs = await import("fs");
          fs.writeFileSync("output.mp4", Buffer.from(await resp.arrayBuffer()));
          break;
      }
      const status = await resp.json();
      if (status.status === "COMPLETED" && download_url) {
          const fs = await import("fs");
          const video = await fetch(download_url);
          fs.writeFileSync("output.mp4", Buffer.from(await video.arrayBuffer()));
          break;
      }
      await new Promise(r => setTimeout(r, 5000));
  }

  // Cleanup
  await fetch(`${BASE_URL}/video/complete`, {
      method: "POST", headers,
      body: JSON.stringify({model, queue_id})
  });
  ```
</CodeGroup>

***

## Request Parameters

### Queue Request

| Parameter         | Type    | Required                | Default                                                        | Description                                                                                                                       |
| ----------------- | ------- | ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `model`           | string  | Yes                     | -                                                              | Model ID. Use `wan-2.5-preview-text-to-video` for text-to-video, `wan-2.5-preview-image-to-video` for image-to-video              |
| `prompt`          | string  | Yes                     | -                                                              | What to generate. Max 2500 chars                                                                                                  |
| `negative_prompt` | string  | No                      | `"low resolution, error, worst quality, low quality, defects"` | What to avoid                                                                                                                     |
| `duration`        | string  | Yes                     | -                                                              | `"5s"` or `"10s"`                                                                                                                 |
| `resolution`      | string  | No                      | `"720p"`                                                       | `"480p"`, `"720p"`, or `"1080p"`                                                                                                  |
| `aspect_ratio`    | string  | Conditional             | -                                                              | Model-dependent. Required for models that expose aspect-ratio options; omit for models that do not support aspect-ratio selection |
| `audio`           | boolean | Conditional             | `true` (when supported)                                        | Only valid for models with `supportsAudioConfig: true`; omit for models without audio config support                              |
| `image_url`       | string  | Only for image-to-video | -                                                              | URL or base64 data URL of source image                                                                                            |
| `audio_url`       | string  | Conditional             | -                                                              | URL or base64 data URL of reference audio for models that support audio input                                                     |

Queue validation is model-specific. Check `/models?type=video` for each model's supported request fields before calling `/video/queue`.

### Quote Request

| Parameter      | Type    | Required    | Default                 | Description                                                                 |
| -------------- | ------- | ----------- | ----------------------- | --------------------------------------------------------------------------- |
| `model`        | string  | Yes         | -                       | Model ID to price                                                           |
| `duration`     | string  | Yes         | -                       | `"5s"` or `"10s"`                                                           |
| `resolution`   | string  | No          | `"720p"`                | `"480p"`, `"720p"`, or `"1080p"`                                            |
| `aspect_ratio` | string  | Conditional | -                       | Include when the selected model supports or requires aspect-ratio selection |
| `audio`        | boolean | Conditional | `true` (when supported) | Only valid for models with `supportsAudioConfig: true`                      |

### Retrieve Request

| Parameter                    | Type    | Required | Default | Description                             |
| ---------------------------- | ------- | -------- | ------- | --------------------------------------- |
| `model`                      | string  | Yes      | -       | From queue response                     |
| `queue_id`                   | string  | Yes      | -       | From queue response                     |
| `delete_media_on_completion` | boolean | No       | `false` | Delete video after successful retrieval |

### Complete Request

| Parameter  | Type   | Required | Description         |
| ---------- | ------ | -------- | ------------------- |
| `model`    | string | Yes      | From queue response |
| `queue_id` | string | Yes      | From queue response |

***

## Image to Video

For image-to-video models, pass source image via `image_url`. The prompt describes desired motion, not the image content.

```json theme={"system"}
{
  "model": "wan-2.5-preview-image-to-video",
  "prompt": "Camera slowly zooms in as leaves rustle in the wind",
  "image_url": "https://example.com/image.jpg",
  "duration": "5s"
}
```

Or with base64:

```json theme={"system"}
{
  "model": "wan-2.5-preview-image-to-video",
  "prompt": "Camera slowly zooms in as leaves rustle in the wind",
  "image_url": "data:image/jpeg;base64,/9j/4AAQ...",
  "duration": "5s"
}
```

***

## Price Quote

Get exact cost before generating. Send only pricing inputs (`model`, `duration`, and optional `resolution`, `aspect_ratio`, `audio`):

**Request:**

```json theme={"system"}
{
  "model": "wan-2.5-preview-text-to-video",
  "duration": "10s",
  "resolution": "1080p"
}
```

**Response:**

```json theme={"system"}
{
  "quote": 0.085
}
```

Quote is in USD.

***

## Errors

| Status | Returned By                              | Meaning                                        | Action                                            |
| ------ | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| 400    | `queue`, `quote`, `retrieve`, `complete` | Invalid parameters                             | Check request body against schema                 |
| 401    | `queue`, `retrieve`, `complete`          | Auth failed                                    | Check API key                                     |
| 402    | `queue`                                  | Insufficient balance                           | Add funds                                         |
| 404    | `retrieve`, `download_url`               | Media not found (invalid, expired, or deleted) | Verify `model`/`queue_id` or re-queue             |
| 410    | `download_url`                           | Pre-signed URL expired (>24h)                  | Re-queue the generation                           |
| 413    | `queue`                                  | Payload too large                              | Reduce image/audio size                           |
| 422    | `queue`, `retrieve`                      | Content violation                              | Modify prompt                                     |
| 500    | `queue`, `retrieve`, `complete`          | Inference/processing failed                    | Retry with backoff; contact support if persistent |
| 503    | `retrieve`                               | Model at capacity                              | Retry with backoff                                |

***

## Polling Strategy

1. Poll `/video/retrieve` on an interval (for example, every 5 seconds)
2. If `Content-Type` is `application/json` and `status` is `"PROCESSING"`, wait and poll again. Use `average_execution_time` and `execution_duration` (milliseconds) to estimate remaining time
3. If `Content-Type` is `video/mp4`, save the response body as your output file
4. If `Content-Type` is `application/json` and `status` is `"COMPLETED"`, `GET` the `download_url` from the queue response to fetch the video
5. Optional cleanup: set `delete_media_on_completion: true` on retrieve, or call `/video/complete` after download
6. Handle `404` as invalid, expired, or deleted media; handle `500/503` with retries/backoff

***

## Available Models

See [Video Models](/models/video) for current model list and pricing.


# Video Upscaling
Source: https://docs.venice.ai/overview/guides/video-upscaling

Enhance video resolution and quality using the Topaz Video Upscale model via the Venice API

Video upscaling lets you enhance existing videos to higher resolutions while improving visual quality. The **Topaz Video Upscale** model uses AI-powered upscaling to increase resolution by 2x or 4x, or apply quality enhancement at the original resolution (1x).

## How it works

Video upscaling uses the same async queue system as video generation:

1. **Queue** — Submit your video to `/video/queue` with the `topaz-video-upscale` model
2. **Poll** — Check `/video/retrieve` with the returned `queue_id` until the status is `completed`
3. **Complete** — Call `/video/complete` to finalize and get the output URL

The server automatically detects the input video's duration, frame rate, and dimensions from the uploaded file. You don't need to provide these values — billing is calculated from the actual video metadata.

## Upscale factors

| `upscale_factor` | Output resolution   | Use case                                           |
| ---------------- | ------------------- | -------------------------------------------------- |
| `1`              | Same as input       | Quality enhancement only (denoising, sharpening)   |
| `2` (default)    | 2x input dimensions | Standard upscale — 720p input becomes 1440p output |
| `4`              | 4x input dimensions | Maximum upscale — 480p input becomes 1920p output  |

<Note>
  The `upscale_factor` parameter replaces `resolution` for upscale models. Passing `resolution` will return an error. This is because the output resolution depends on the input video's dimensions — a `2x` upscale of a 720p video produces a different result than a `2x` upscale of a 480p video.
</Note>

## Supported input formats

* **Formats**: MP4, MOV, WebM
* **Input methods**: HTTPS URL or `data:video/...;base64,...` data URL
* **Max duration**: 300 seconds (5 minutes)

## API usage

### Queue an upscale job

<CodeGroup>
  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/video/queue \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "topaz-video-upscale",
      "video_url": "https://example.com/input-video.mp4",
      "upscale_factor": 2
    }'
  ```

  ```python Python theme={"system"}
  import requests

  response = requests.post(
      "https://api.venice.ai/api/v1/video/queue",
      headers={"Authorization": "Bearer YOUR_API_KEY"},
      json={
          "model": "topaz-video-upscale",
          "video_url": "https://example.com/input-video.mp4",
          "upscale_factor": 2,
      },
  )

  data = response.json()
  queue_id = data["queue_id"]
  print(f"Queued: {queue_id}")
  ```

  ```javascript Node.js theme={"system"}
  const response = await fetch("https://api.venice.ai/api/v1/video/queue", {
    method: "POST",
    headers: {
      "Authorization": "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "topaz-video-upscale",
      video_url: "https://example.com/input-video.mp4",
      upscale_factor: 2,
    }),
  });

  const { queue_id } = await response.json();
  console.log(`Queued: ${queue_id}`);
  ```
</CodeGroup>

The response includes a `queue_id` to track the job:

```json theme={"system"}
{
  "model": "topaz-video-upscale",
  "queue_id": "abc123-def456-..."
}
```

### Poll for completion

<CodeGroup>
  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/video/retrieve \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"queue_id": "abc123-def456-..."}'
  ```

  ```python Python theme={"system"}
  import time

  while True:
      result = requests.post(
          "https://api.venice.ai/api/v1/video/retrieve",
          headers={"Authorization": "Bearer YOUR_API_KEY"},
          json={"queue_id": queue_id},
      )
      data = result.json()

      if data.get("status") == "completed":
          print(f"Video URL: {data['url']}")
          break

      time.sleep(5)
  ```

  ```javascript Node.js theme={"system"}
  const poll = async (queueId) => {
    while (true) {
      const res = await fetch("https://api.venice.ai/api/v1/video/retrieve", {
        method: "POST",
        headers: {
          "Authorization": "Bearer YOUR_API_KEY",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queue_id: queueId }),
      });
      const data = await res.json();

      if (data.status === "completed") {
        console.log(`Video URL: ${data.url}`);
        return data;
      }

      await new Promise((r) => setTimeout(r, 5000));
    }
  };

  await poll(queue_id);
  ```
</CodeGroup>

### Finalize with complete

After retrieving the result, call `/video/complete` to finalize:

```bash theme={"system"}
curl https://api.venice.ai/api/v1/video/complete \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"queue_id": "abc123-def456-..."}'
```

***

## API parameters

| Field            | Type   | Required | Description                                                     |
| ---------------- | ------ | -------- | --------------------------------------------------------------- |
| `model`          | string | **Yes**  | Must be `topaz-video-upscale`                                   |
| `video_url`      | string | **Yes**  | Input video URL or data URL. Supported formats: MP4, MOV, WebM. |
| `upscale_factor` | number | No       | `1`, `2` (default), or `4`. Controls the upscale multiplier.    |

### Parameters not used for upscale models

The following parameters are **not accepted** for `topaz-video-upscale` and will return an error if provided:

| Field        | Reason                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| `resolution` | Use `upscale_factor` instead. Output resolution depends on input dimensions. |
| `prompt`     | Upscaling does not use text prompts. An empty string is set automatically.   |

The `duration` parameter is also ignored — the server detects duration directly from the video file for billing accuracy.

***

## Pricing

Pricing is based on **duration**, **output resolution tier**, and **frame rate**. The output resolution tier is determined by the input video's height multiplied by the upscale factor.

### Output resolution tiers

| Tier  | Output height | Per-second rate |
| ----- | ------------- | --------------- |
| 720p  | ≤ 720px       | \~\$0.013       |
| 1080p | 721–1080px    | \~\$0.025       |
| 4K    | > 1080px      | \~\$0.10        |

<Note>
  Videos with frame rates above 48fps cost 2x the per-second rate.
</Note>

### Pricing examples

| Input        | Upscale factor | Output            | Duration | Estimated cost |
| ------------ | -------------- | ----------------- | -------- | -------------- |
| 480p, 30fps  | 2x             | 960p (1080p tier) | 10s      | \~\$0.25       |
| 720p, 30fps  | 2x             | 1440p (4K tier)   | 10s      | \~\$1.00       |
| 1080p, 30fps | 2x             | 2160p (4K tier)   | 30s      | \~\$3.00       |
| 360p, 24fps  | 4x             | 1440p (4K tier)   | 10s      | \~\$1.00       |
| 480p, 60fps  | 2x             | 960p (1080p tier) | 10s      | \~\$0.50       |

Use the [Video Quote API](/api-reference/endpoint/video/quote) to get exact pricing before submitting a job.

### Getting a quote

```bash theme={"system"}
curl https://api.venice.ai/api/v1/video/quote \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "topaz-video-upscale",
    "duration": "10",
    "input_height": 720
  }'
```

The quote endpoint accepts `input_height` so it can estimate the output resolution tier. This is optional — if omitted, the quote assumes a conservative estimate.

***

## Troubleshooting

| Problem                                      | Likely cause                                | Fix                                                                                                       |
| -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `"Use upscale_factor instead of resolution"` | `resolution` was passed in the request      | Remove `resolution` and use `upscale_factor` instead                                                      |
| Higher-than-expected cost                    | Input video has high resolution or high FPS | Check input dimensions with the quote endpoint. 720p+ input with 2x upscale lands in the 4K pricing tier. |
| Job takes a long time                        | Large or long video                         | Upscaling is compute-intensive. Longer videos and higher upscale factors take proportionally longer.      |
| `"Insufficient balance"`                     | Account credits too low                     | Add credits at [venice.ai/settings/api](https://venice.ai/settings/api)                                   |


# X402
Source: https://docs.venice.ai/overview/guides/x402-venice-api

Access Venice without an API key using wallet authentication.

X402 lets you use Venice's paid API routes by authenticating with an Ethereum wallet on Base. No API key or account required. Sign a message, maintain a balance, and call any supported route.

<CardGroup>
  <Card title="Wallet Auth" icon="wallet">
    Authenticate with a signed SIWE payload in the `X-Sign-In-With-X` header.
  </Card>

  <Card title="Pay with USDC" icon="coins">
    Maintain spendable balance with USDC on Base.
  </Card>

  <Card title="DIEM First" icon="sparkles">
    If the wallet is linked to a Venice account with DIEM balance, that is spent first.
  </Card>
</CardGroup>

## What is X402?

[X402](https://www.x402.org/) is an open payment standard that lets applications and agents pay for services programmatically using cryptocurrency. Venice implements X402 on Base so that wallets can authenticate and pay for inference directly.

## Prerequisites

* An EVM wallet on Base
* A small amount of ETH on Base for gas
* USDC on Base (or existing DIEM-backed balance from a linked Venice account)

<Tip>
  Consider using a dedicated wallet for automation rather than your main treasury wallet.
</Tip>

## Quick start

The [`venice-x402-client`](https://github.com/veniceai/x402-client) SDK provides helpers for SIWE auth, top-ups, and balance tracking.

```bash theme={"system"}
npm install venice-x402-client
```

```typescript theme={"system"}
import { VeniceClient } from 'venice-x402-client'

const venice = new VeniceClient(process.env.WALLET_KEY)

await venice.topUp(10) // skip if the wallet already has spendable balance

const response = await venice.chat({
  model: 'kimi-k2-5',
  messages: [{ role: 'user', content: 'Hello!' }]
})
```

The client generates a fresh `X-Sign-In-With-X` header for each request and automatically tracks balance from `X-Balance-Remaining` response headers.

### With OpenAI-compatible tools

If you're using a tool that accepts a custom `fetch`, use `createAuthFetch` to add wallet auth to any request:

```typescript theme={"system"}
import { createAuthFetch } from 'venice-x402-client'

const authFetch = createAuthFetch(process.env.WALLET_KEY)
```

### Available helpers

The SDK includes first-class helpers for the most common Venice x402 routes. For anything not covered, use `request()` or `createAuthFetch()` directly.

| Category   | Methods                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Chat       | `chat()`, `chatStream()`                                                                                                            |
| Responses  | `responses.create()`, `responses.stream()`                                                                                          |
| Images     | `images.generate()`, `images.generations()`, `images.upscale()`, `images.edit()`, `images.multiEdit()`, `images.backgroundRemove()` |
| Audio      | `audio.speech()`, `audio.transcribe()`, `audio.queue()`, `audio.retrieve()`, `audio.complete()`                                     |
| Video      | `video.queue()`, `video.retrieve()`, `video.generate()`, `video.complete()`, `video.transcribe()`                                   |
| Embeddings | `embeddings()`                                                                                                                      |
| Models     | `models()`                                                                                                                          |
| Wallet     | `getBalance()`, `getTransactions()`, `topUp()`                                                                                      |

***

## Manual flow

If you're not using the SDK or need to understand the underlying protocol, here's the step-by-step flow. For a new wallet, assume you need to top up first unless it already has spendable DIEM balance.

### Step 1: Create the X-Sign-In-With-X header

Venice expects a Base64-encoded JSON payload containing a signed SIWE message. Generate a fresh nonce and timestamp for each request flow.

```typescript theme={"system"}
import { Wallet } from 'ethers'
import { SiweMessage, generateNonce } from 'siwe'

const wallet = new Wallet(process.env.EVM_PRIVATE_KEY)
const now = new Date()
const resourceUrl = 'https://api.venice.ai/api/v1/chat/completions'

const siwe = new SiweMessage({
  domain: 'api.venice.ai',
  address: wallet.address,
  statement: 'Sign in to Venice AI',
  uri: resourceUrl,
  version: '1',
  chainId: 8453,
  nonce: generateNonce(),
  issuedAt: now.toISOString(),
  expirationTime: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
})

const message = siwe.prepareMessage()
const signature = await wallet.signMessage(message)

const xSignInWithX = Buffer.from(
  JSON.stringify({
    address: wallet.address,
    message,
    signature,
    timestamp: now.getTime(),
    chainId: 8453,
  }),
  'utf8',
).toString('base64')

console.log(xSignInWithX)
```

### Step 2: Check balance

Before making a paid request, verify the wallet has spendable balance:

```bash theme={"system"}
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS
export X402_AUTH=YOUR_BASE64_SIWX_HEADER

curl --request GET \
  --url "https://api.venice.ai/api/v1/x402/balance/$WALLET_ADDRESS" \
  --header "X-Sign-In-With-X: $X402_AUTH"
```

The response includes:

* `canConsume`: whether the wallet can make paid requests
* `balanceUsd`: current spendable balance
* `minimumTopUpUsd` and `suggestedTopUpUsd`: guidance for top-ups
* `diemBalanceUsd`: DIEM-backed balance, if any

### Step 3: Top up

Top up with USDC on Base:

```bash theme={"system"}
curl --request POST \
  --url https://api.venice.ai/api/v1/x402/top-up
```

The first call returns `402 Payment Required` with a `PAYMENT-REQUIRED` header containing an `accepts` array. Use those payment details to build an `X-402-Payment` header and retry the same route.

#### Building the X-402-Payment header

The following script creates a signed x402 payment and sends the top-up request. Requires the `x402` and `viem` npm packages.

```bash theme={"system"}
export EVM_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

```bash theme={"system"}
export X402_PAYMENT="$(
node --input-type=module <<'EOF'
import { createPaymentHeader } from "x402/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const amountUsd = 5;
const amountBaseUnits = String(Math.round(amountUsd * 1e6));

const header = await createPaymentHeader(signer, 2, {
  scheme: "exact",
  network: "base",
  maxAmountRequired: amountBaseUnits,
  resource: "https://api.venice.ai/api/v1/x402/top-up",
  description: "Venice x402 top-up",
  mimeType: "application/json",
  payTo: "0x2670B922ef37C7Df47158725C0CC407b5382293F",
  maxTimeoutSeconds: 300,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  extra: { name: "USD Coin", version: "2" },
});

process.stdout.write(header);
EOF
)"

curl -X POST "https://api.venice.ai/api/v1/x402/top-up" \
  -H "X-402-Payment: $X402_PAYMENT"
```

<Note>
  Use the latest `PAYMENT-REQUIRED` / `accepts` response as the source of truth in production instead of hardcoding these values.
</Note>

### Step 4: Make a request

Once the wallet has spendable balance, call any supported endpoint with the `X-Sign-In-With-X` header:

```bash theme={"system"}
export X402_AUTH=YOUR_BASE64_SIWX_HEADER

curl --request POST \
  --url https://api.venice.ai/api/v1/chat/completions \
  --header "Content-Type: application/json" \
  --header "X-Sign-In-With-X: $X402_AUTH" \
  --data '{
    "model": "kimi-k2-5",
    "messages": [
      {
        "role": "user",
        "content": "Hello from an x402-authenticated wallet."
      }
    ]
  }'
```

Successful responses may include an `X-Balance-Remaining` header.

### Step 5: Inspect transactions (optional)

Review the wallet's transaction history:

```bash theme={"system"}
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS
export X402_AUTH=YOUR_BASE64_SIWX_HEADER

curl --request GET \
  --url "https://api.venice.ai/api/v1/x402/transactions/$WALLET_ADDRESS?limit=10&offset=0" \
  --header "X-Sign-In-With-X: $X402_AUTH"
```

The ledger includes entries such as `TOP_UP`, `CHARGE`, and `REFUND`.

***

## Supported routes

### Paid inference routes

The following public paid Venice routes currently support x402 wallet authentication.

| Category   | Endpoints                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat       | `POST /api/v1/chat/completions`, `POST /api/v1/responses`                                                                                                                                          |
| Image      | `POST /api/v1/image/generate`, `POST /api/v1/images/generations`, `POST /api/v1/image/upscale`, `POST /api/v1/image/edit`, `POST /api/v1/image/multi-edit`, `POST /api/v1/image/background-remove` |
| Embeddings | `POST /api/v1/embeddings`                                                                                                                                                                          |
| Audio      | `POST /api/v1/audio/speech`, `POST /api/v1/audio/transcriptions`, `POST /api/v1/audio/complete`, `POST /api/v1/audio/queue`, `POST /api/v1/audio/retrieve`                                         |
| Video      | `POST /api/v1/video/complete`, `POST /api/v1/video/queue`, `POST /api/v1/video/retrieve`, `POST /api/v1/video/transcriptions`                                                                      |

### Top-up route

| Endpoint                   | Auth                                          | Purpose                                            |
| -------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `POST /api/v1/x402/top-up` | Initial request: none. Retry: `X-402-Payment` | Add USDC credits to the wallet's spendable balance |

### Wallet-only routes

These routes use `X-Sign-In-With-X` for identity but do not charge balance.

| Endpoint                                        | Purpose                  |
| ----------------------------------------------- | ------------------------ |
| `GET /api/v1/x402/balance/{walletAddress}`      | Check spendable balance  |
| `GET /api/v1/x402/transactions/{walletAddress}` | View transaction history |

***

## Errors

| Status                           | Likely cause                                   | What to do                                                                 |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `401`                            | Malformed or expired SIWE payload              | Rebuild `X-Sign-In-With-X` with a fresh nonce and timestamp                |
| `402` on a paid route            | Not enough spendable balance                   | Top up and retry                                                           |
| `402` on `/x402/top-up`          | Expected. This is the payment initiation flow. | Use the returned payment details to build `X-402-Payment` and retry        |
| `403` on balance or transactions | Wallet mismatch                                | Ensure the authenticated wallet matches the `walletAddress` path parameter |
| `400` on top-up                  | Malformed payment header                       | Rebuild from the latest `402` response                                     |

***

## For agents

The flow is the same. Store private keys in environment variables or a secret manager, and check balance before requests to avoid unnecessary `402` round-trips.

***

## Related resources

<CardGroup>
  <Card title="x402 Client SDK" icon="npm" href="https://github.com/veniceai/x402-client">
    Official Venice x402 client for Node.js/TypeScript.
  </Card>

  <Card title="API Pricing" icon="coins" href="/overview/pricing">
    Check model pricing and how Venice charges usage.
  </Card>

  <Card title="Chat Completions" icon="message" href="/api-reference/endpoint/chat/completions">
    A common paid route for wallet-based access.
  </Card>

  <Card title="API Spec" icon="code" href="/api-reference/api-spec">
    Reference documentation and raw spec access.
  </Card>
</CardGroup>


# API Pricing
Source: https://docs.venice.ai/overview/pricing



Prices per 1M tokens unless noted. All prices in USD. 1 Diem = \$1/day of compute.

## Text Models

### Chat Completions

<div>
  | Model                             | ID                                     | Input Price | Output Price | Cache Read | Cache Write | Context | Privacy        |
  | --------------------------------- | -------------------------------------- | ----------- | ------------ | ---------- | ----------- | ------- | -------------- |
  | Aion 2.0                          | `aion-labs-aion-2-0`                   | \$1.00      | \$2.00       | \$0.25     | -           | 128K    | Anonymized     |
  | Claude Opus 4.5                   | `claude-opus-4-5`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 198K    | Anonymized     |
  | Claude Opus 4.6 (Beta)            | `claude-opus-4-6`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 1000K   | Anonymized     |
  | Claude Opus 4.6 Fast (Beta)       | `claude-opus-4-6-fast`                 | \$36.00     | \$180.00     | \$3.60     | \$45.00     | 1000K   | Anonymized     |
  | Claude Opus 4.7                   | `claude-opus-4-7`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 1000K   | Anonymized     |
  | Claude Sonnet 4.5                 | `claude-sonnet-4-5`                    | \$3.75      | \$18.75      | \$0.38     | \$4.69      | 198K    | Anonymized     |
  | Claude Sonnet 4.6 (Beta)          | `claude-sonnet-4-6`                    | \$3.60      | \$18.00      | \$0.36     | \$4.50      | 1000K   | Anonymized     |
  | DeepSeek V3.2                     | `deepseek-v3.2`                        | \$0.33      | \$0.48       | \$0.16     | -           | 160K    | Private        |
  | Gemini 3 Flash Preview            | `gemini-3-flash-preview`               | \$0.70      | \$3.75       | \$0.07     | -           | 256K    | Anonymized     |
  | Gemini 3.1 Pro Preview            | `gemini-3-1-pro-preview`               | \$2.50      | \$15.00      | \$0.50     | \$0.50      | 1000K   | Anonymized     |
  | ↳ >200K Context                   |                                        | \$5.00      | \$22.50      | \$0.50     | \$0.50      |         |                |
  | Gemma 3 27B (Beta)                | `e2ee-gemma-3-27b-p`                   | \$0.14      | \$0.50       | -          | -           | 40K     | E2EE · Private |
  | Gemma 4 Uncensored                | `gemma-4-uncensored`                   | \$0.16      | \$0.50       | -          | -           | 256K    | Private        |
  | GLM 4.6                           | `zai-org-glm-4.6`                      | \$0.85      | \$2.75       | \$0.30     | -           | 198K    | Private        |
  | GLM 4.7                           | `zai-org-glm-4.7`                      | \$0.55      | \$2.65       | \$0.11     | -           | 198K    | Private        |
  | GLM 4.7 (Beta)                    | `e2ee-glm-4-7-p`                       | \$1.10      | \$4.15       | -          | -           | 128K    | E2EE · Private |
  | GLM 4.7 Flash                     | `zai-org-glm-4.7-flash`                | \$0.13      | \$0.50       | -          | -           | 128K    | Private        |
  | GLM 4.7 Flash (Beta)              | `e2ee-glm-4-7-flash-p`                 | \$0.13      | \$0.55       | -          | -           | 198K    | E2EE · Private |
  | GLM 4.7 Flash Heretic             | `olafangensan-glm-4.7-flash-heretic`   | \$0.14      | \$0.80       | -          | -           | 200K    | Private        |
  | GLM 5                             | `zai-org-glm-5`                        | \$1.00      | \$3.20       | \$0.20     | -           | 198K    | Private        |
  | GLM 5 (Beta)                      | `e2ee-glm-5`                           | \$1.10      | \$4.15       | -          | -           | 198K    | E2EE · Private |
  | GLM 5 Turbo                       | `z-ai-glm-5-turbo`                     | \$1.20      | \$4.00       | \$0.24     | -           | 200K    | Anonymized     |
  | GLM 5.1 (Beta)                    | `zai-org-glm-5-1`                      | \$1.75      | \$5.50       | \$0.33     | -           | 200K    | Private        |
  | GLM 5V Turbo (Beta)               | `z-ai-glm-5v-turbo`                    | \$1.50      | \$5.00       | \$0.30     | -           | 200K    | Anonymized     |
  | Google Gemma 3 27B Instruct       | `google-gemma-3-27b-it`                | \$0.12      | \$0.20       | -          | -           | 198K    | Private        |
  | Google Gemma 4 26B A4B Instruct   | `google-gemma-4-26b-a4b-it`            | \$0.16      | \$0.50       | -          | -           | 256K    | Private        |
  | Google Gemma 4 31B Instruct       | `google-gemma-4-31b-it`                | \$0.17      | \$0.50       | -          | -           | 256K    | Private        |
  | GPT OSS 120B (Beta)               | `e2ee-gpt-oss-120b-p`                  | \$0.13      | \$0.65       | -          | -           | 128K    | E2EE · Private |
  | GPT OSS 20B (Beta)                | `e2ee-gpt-oss-20b-p`                   | \$0.05      | \$0.19       | -          | -           | 128K    | E2EE · Private |
  | GPT-4o                            | `openai-gpt-4o-2024-11-20`             | \$3.13      | \$12.50      | -          | -           | 128K    | Anonymized     |
  | GPT-4o Mini                       | `openai-gpt-4o-mini-2024-07-18`        | \$0.19      | \$0.75       | \$0.09     | -           | 128K    | Anonymized     |
  | GPT-5.2                           | `openai-gpt-52`                        | \$2.19      | \$17.50      | \$0.22     | -           | 256K    | Anonymized     |
  | GPT-5.2 Codex                     | `openai-gpt-52-codex`                  | \$2.19      | \$17.50      | \$0.22     | -           | 256K    | Anonymized     |
  | GPT-5.3 Codex (Beta)              | `openai-gpt-53-codex`                  | \$2.19      | \$17.50      | \$0.22     | -           | 400K    | Anonymized     |
  | GPT-5.4 (Beta)                    | `openai-gpt-54`                        | \$3.13      | \$18.80      | \$0.31     | -           | 1000K   | Anonymized     |
  | GPT-5.4 Mini (Beta)               | `openai-gpt-54-mini`                   | \$0.94      | \$5.63       | \$0.09     | -           | 400K    | Anonymized     |
  | GPT-5.4 Pro (Beta)                | `openai-gpt-54-pro`                    | \$37.50     | \$225.00     | -          | -           | 1000K   | Anonymized     |
  | ↳ >272K Context                   |                                        | \$75.00     | \$337.50     | -          | -           |         |                |
  | Grok 4.1 Fast                     | `grok-41-fast`                         | \$0.23      | \$0.57       | \$0.06     | -           | 1000K   | Private        |
  | Grok 4.20 (Beta)                  | `grok-4-20`                            | \$2.27      | \$6.80       | \$0.23     | -           | 2000K   | Private        |
  | ↳ >200K Context                   |                                        | \$4.53      | \$13.60      | \$0.45     | -           |         |                |
  | Grok 4.20 Multi-Agent (Beta)      | `grok-4-20-multi-agent`                | \$2.27      | \$6.80       | \$0.23     | -           | 2000K   | Private        |
  | ↳ >200K Context                   |                                        | \$4.53      | \$13.60      | \$0.45     | -           |         |                |
  | Hermes 3 Llama 3.1 405b           | `hermes-3-llama-3.1-405b`              | \$1.10      | \$3.00       | -          | -           | 128K    | Private        |
  | Kimi K2.5                         | `kimi-k2-5`                            | \$0.56      | \$3.50       | \$0.11     | -           | 256K    | Private        |
  | Kimi K2.6                         | `kimi-k2-6`                            | \$0.56      | \$3.50       | \$0.11     | -           | 256K    | Private        |
  | Llama 3.2 3B                      | `llama-3.2-3b`                         | \$0.15      | \$0.60       | -          | -           | 128K    | Private        |
  | Llama 3.3 70B                     | `llama-3.3-70b`                        | \$0.70      | \$2.80       | -          | -           | 128K    | Private        |
  | Mercury 2 (Beta)                  | `mercury-2`                            | \$0.31      | \$0.94       | \$0.03     | -           | 128K    | Anonymized     |
  | MiniMax M2.5                      | `minimax-m25`                          | \$0.34      | \$1.19       | \$0.04     | -           | 198K    | Private        |
  | MiniMax M2.7                      | `minimax-m27`                          | \$0.38      | \$1.50       | \$0.07     | -           | 198K    | Anonymized     |
  | Mistral Small 3.2 24B Instruct    | `mistral-small-3-2-24b-instruct`       | \$0.09      | \$0.25       | -          | -           | 256K    | Private        |
  | Mistral Small 4 (Beta)            | `mistral-small-2603`                   | \$0.19      | \$0.75       | -          | -           | 256K    | Private        |
  | Nemotron Cascade 2 30B A3B (Beta) | `nvidia-nemotron-cascade-2-30b-a3b`    | \$0.14      | \$0.80       | -          | -           | 256K    | Private        |
  | NVIDIA Nemotron 3 Nano 30B (Beta) | `nvidia-nemotron-3-nano-30b-a3b`       | \$0.07      | \$0.30       | -          | -           | 128K    | Private        |
  | OpenAI GPT OSS 120B               | `openai-gpt-oss-120b`                  | \$0.07      | \$0.30       | -          | -           | 128K    | Private        |
  | Qwen 2.5 7B (Beta)                | `e2ee-qwen-2-5-7b-p`                   | \$0.05      | \$0.13       | -          | -           | 32K     | E2EE · Private |
  | Qwen 3 235B A22B Instruct 2507    | `qwen3-235b-a22b-instruct-2507`        | \$0.15      | \$0.75       | -          | -           | 128K    | Private        |
  | Qwen 3 235B A22B Thinking 2507    | `qwen3-235b-a22b-thinking-2507`        | \$0.45      | \$3.50       | -          | -           | 128K    | Private        |
  | Qwen 3 Coder 480b                 | `qwen3-coder-480b-a35b-instruct`       | \$0.75      | \$3.00       | -          | -           | 256K    | Private        |
  | Qwen 3 Coder 480B Turbo (Beta)    | `qwen3-coder-480b-a35b-instruct-turbo` | \$0.35      | \$1.50       | \$0.04     | -           | 256K    | Private        |
  | Qwen 3 Next 80b                   | `qwen3-next-80b`                       | \$0.35      | \$1.90       | -          | -           | 256K    | Private        |
  | Qwen 3.5 35B A3B (Beta)           | `qwen3-5-35b-a3b`                      | \$0.31      | \$1.25       | \$0.16     | -           | 256K    | Private        |
  | Qwen 3.5 397B                     | `qwen3-5-397b-a17b`                    | \$0.75      | \$4.50       | -          | -           | 128K    | Anonymized     |
  | Qwen 3.5 9B                       | `qwen3-5-9b`                           | \$0.10      | \$0.15       | -          | -           | 256K    | Private        |
  | Qwen 3.6 Plus Uncensored (Beta)   | `qwen-3-6-plus`                        | \$0.63      | \$3.75       | \$0.06     | \$0.78      | 1000K   | Anonymized     |
  | ↳ >256K Context                   |                                        | \$2.50      | \$7.50       | \$0.06     | \$0.78      |         |                |
  | Qwen3 30B A3B (Beta)              | `e2ee-qwen3-30b-a3b-p`                 | \$0.19      | \$0.69       | -          | -           | 256K    | E2EE · Private |
  | Qwen3 VL 235B                     | `qwen3-vl-235b-a22b`                   | \$0.25      | \$1.50       | -          | -           | 256K    | Private        |
  | Qwen3 VL 30B A3B (Beta)           | `e2ee-qwen3-vl-30b-a3b-p`              | \$0.25      | \$0.90       | -          | -           | 128K    | E2EE · Private |
  | Qwen3.5 122B A10B (Beta)          | `e2ee-qwen3-5-122b-a10b`               | \$0.50      | \$4.00       | -          | -           | 128K    | E2EE · Private |
  | Trinity Large Thinking            | `arcee-trinity-large-thinking`         | \$0.31      | \$1.13       | \$0.07     | -           | 256K    | Private        |
  | Venice Role Play Uncensored       | `venice-uncensored-role-play`          | \$0.50      | \$2.00       | -          | -           | 128K    | Private        |
  | Venice Uncensored 1.1 (Beta)      | `e2ee-venice-uncensored-24b-p`         | \$0.25      | \$1.15       | -          | -           | 32K     | E2EE · Private |
  | Venice Uncensored 1.2             | `venice-uncensored-1-2`                | \$0.20      | \$0.90       | -          | -           | 128K    | Private        |
</div>

*Prices per 1M tokens. [View all models →](/models/text)*

### Embeddings

<div>
  | Model                          | ID                                              | Input (per 1M tokens) | Output (per 1M tokens) | Privacy    |
  | ------------------------------ | ----------------------------------------------- | --------------------- | ---------------------- | ---------- |
  | BGE-EN-ICL                     | `text-embedding-bge-en-icl`                     | \$0.01                | \$0.01                 | Private    |
  | BGE-M3                         | `text-embedding-bge-m3`                         | \$0.15                | \$0.60                 | Private    |
  | Gemini Embedding 2 Preview     | `gemini-embedding-2-preview`                    | \$0.25                | \$0.25                 | Anonymized |
  | Multilingual E5 Large Instruct | `text-embedding-multilingual-e5-large-instruct` | \$0.01                | \$0.01                 | Private    |
  | Nemotron Embed VL 1B v2        | `text-embedding-nemotron-embed-vl-1b-v2`        | \$0.01                | \$0.01                 | Private    |
  | Qwen3 Embedding 0.6B           | `text-embedding-qwen3-0-6b`                     | \$0.01                | \$0.01                 | Private    |
  | Qwen3 Embedding 8B             | `text-embedding-qwen3-8b`                       | \$0.01                | \$0.01                 | Private    |
  | Text Embedding 3 Large         | `text-embedding-3-large`                        | \$0.16                | \$0.16                 | Anonymized |
  | Text Embedding 3 Small         | `text-embedding-3-small`                        | \$0.03                | \$0.03                 | Anonymized |
</div>

## Media Models

### Image Generation

<div>
  #### Generation

  | Model                       | ID                          | Price                            | Privacy    |
  | --------------------------- | --------------------------- | -------------------------------- | ---------- |
  | Recraft V4 Pro              | `recraft-v4-pro`            | Per Image: \$0.29                | Anonymized |
  | GPT Image 1.5               | `gpt-image-1-5`             | Per Image: \$0.26                | Anonymized |
  | GPT Image 2                 | `gpt-image-2`               | 1K: $0.26, 2K: $0.50, 4K: \$0.83 | Anonymized |
  | Nano Banana Pro             | `nano-banana-pro`           | 1K: $0.18, 2K: $0.23, 4K: \$0.35 | Anonymized |
  | Nano Banana 2               | `nano-banana-2`             | 1K: $0.10, 2K: $0.14, 4K: \$0.19 | Anonymized |
  | Qwen Image 2 Pro            | `qwen-image-2-pro`          | Per Image: \$0.10                | Anonymized |
  | Wan 2.7 Pro                 | `wan-2-7-pro-text-to-image` | Per Image: \$0.09                | Anonymized |
  | Flux 2 Max                  | `flux-2-max`                | Per Image: \$0.09                | Anonymized |
  | Grok Imagine Pro (20260207) | `grok-imagine-image-pro`    | Per Image: \$0.09                | Private    |
  | ImagineArt 1.5 Pro          | `imagineart-1.5-pro`        | Per Image: \$0.06                | Anonymized |
  | Qwen Image 2                | `qwen-image-2`              | Per Image: \$0.05                | Anonymized |
  | Recraft V4                  | `recraft-v4`                | Per Image: \$0.05                | Anonymized |
  | Seedream V4.5               | `seedream-v4`               | Per Image: \$0.05                | Anonymized |
  | Seedream V5 Lite            | `seedream-v5-lite`          | Per Image: \$0.05                | Anonymized |
  | Flux 2 Pro                  | `flux-2-pro`                | Per Image: \$0.04                | Anonymized |
  | Wan 2.7                     | `wan-2-7-text-to-image`     | Per Image: \$0.04                | Anonymized |
  | Grok Imagine (SOTA)         | `grok-imagine-image`        | Per Image: \$0.03                | Private    |
  | Background Remover          | `bria-bg-remover`           | Per Image: \$0.03                | Anonymized |
  | Anime (WAI)                 | `wai-Illustrious`           | Per Image: \$0.01                | Private    |
  | Chroma                      | `chroma`                    | Per Image: \$0.01                | Private    |
  | Lustify SDXL                | `lustify-sdxl`              | Per Image: \$0.01                | Private    |
  | Lustify v8                  | `lustify-v8`                | Per Image: \$0.01                | Private    |
  | Qwen Image                  | `qwen-image`                | Per Image: \$0.01                | Private    |
  | Venice SD35                 | `venice-sd35`               | Per Image: \$0.01                | Private    |
  | Z-Image Turbo               | `z-image-turbo`             | Per Image: \$0.01                | Private    |
  | Hunyuan Image 3.0 (Beta)    | `hunyuan-image-v3`          | Per Image: \$0.09                | Private    |

  #### Upscaling

  | Model          | ID         | 2x Upscale | 4x Upscale |
  | -------------- | ---------- | ---------- | ---------- |
  | Image Upscaler | `upscaler` | \$0.02     | \$0.08     |

  #### Editing

  | Model                  | ID                      | Per Edit |
  | ---------------------- | ----------------------- | -------- |
  | FireRed Image Edit 1.1 | `firered-image-edit`    | \$0.04   |
  | Flux 2 Max             | `flux-2-max-edit`       | \$0.09   |
  | GPT Image 1.5          | `gpt-image-1-5-edit`    | \$0.36   |
  | GPT Image 2            | `gpt-image-2-edit`      | \$0.35   |
  | Grok Imagine           | `grok-imagine-edit`     | \$0.03   |
  | Nano Banana 2          | `nano-banana-2-edit`    | \$0.10   |
  | Nano Banana Pro        | `nano-banana-pro-edit`  | \$0.18   |
  | Qwen Edit 2511         | `qwen-edit`             | \$0.04   |
  | Qwen Image 2           | `qwen-image-2-edit`     | \$0.05   |
  | Qwen Image 2 Pro       | `qwen-image-2-pro-edit` | \$0.10   |
  | Seedream V4.5          | `seedream-v4-edit`      | \$0.05   |
  | Seedream V5 Lite       | `seedream-v5-lite-edit` | \$0.05   |
  | Qwen Image             | `qwen-image`            | \$0.04   |
</div>

### Audio

<div>
  #### Text-to-Speech

  | Model                       | ID                          | Per 1M Characters | Privacy    |
  | --------------------------- | --------------------------- | ----------------- | ---------- |
  | Chatterbox HD (Resemble AI) | `tts-chatterbox-hd`         | \$50.00           | Private    |
  | ElevenLabs Turbo v2.5       | `tts-elevenlabs-turbo-v2-5` | \$62.50           | Anonymized |
  | Gemini 3.1 Flash TTS        | `tts-gemini-3-1-flash`      | \$187.50          | Anonymized |
  | Inworld TTS-1.5 Max         | `tts-inworld-1-5-max`       | \$12.50           | Anonymized |
  | Kokoro Text to Speech       | `tts-kokoro`                | \$3.50            | Private    |
  | MiniMax Speech-02 HD        | `tts-minimax-speech-02-hd`  | \$125.00          | Anonymized |
  | Orpheus TTS                 | `tts-orpheus`               | \$62.50           | Private    |
  | Qwen 3 TTS 0.6B             | `tts-qwen3-0-6b`            | \$87.50           | Private    |
  | Qwen 3 TTS 1.7B             | `tts-qwen3-1-7b`            | \$112.50          | Private    |
  | xAI TTS v1                  | `tts-xai-v1`                | \$5.25            | Anonymized |

  #### Speech-to-Text

  | Model                 | ID                            | Per Audio Second | Privacy    |
  | --------------------- | ----------------------------- | ---------------- | ---------- |
  | ElevenLabs Scribe V2  | `elevenlabs/scribe-v2`        | \$0.0002         | Anonymized |
  | Parakeet ASR          | `nvidia/parakeet-tdt-0.6b-v3` | \$0.0001         | Private    |
  | Whisper Large V3      | `openai/whisper-large-v3`     | \$0.0001         | Private    |
  | Wizper (Whisper v3)   | `fal-ai/wizper`               | \$0.0001         | Private    |
  | xAI Speech to Text v1 | `stt-xai-v1`                  | \$0.0000         | Anonymized |
</div>

### Music

<div>
  #### Song Generation (Duration-Based)

  | Model            | ID                 | Duration Pricing                                                                                                                | Privacy    |
  | ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
  | ACE-Step 1.5     | `ace-step-15`      | 60s: $0.03, 90s: $0.04, 120s: $0.05, 150s: $0.06, 180s: $0.07, 210s: $0.08                                                      | Anonymized |
  | ElevenLabs Music | `elevenlabs-music` | 60s: $0.87, 120s: $1.73, 180s: $2.59, 240s: $3.45, 300s: $4.32, 360s: $5.18, 420s: $6.04, 480s: $6.90, 540s: $7.77, 600s: $8.63 | Anonymized |

  #### Song Generation (Per-Generation)

  | Model             | ID                  | Per Generation | Privacy    |
  | ----------------- | ------------------- | -------------- | ---------- |
  | MiniMax Music 2.0 | `minimax-music-v2`  | \$0.04         | Anonymized |
  | MiniMax Music 2.5 | `minimax-music-v25` | \$0.24         | Anonymized |
  | MiniMax Music 2.6 | `minimax-music-v26` | \$0.24         | Anonymized |
  | Stable Audio 2.5  | `stable-audio-25`   | \$0.24         | Anonymized |

  #### Sound Effects (Per-Second)

  | Model                    | ID                            | Per Second | Privacy    |
  | ------------------------ | ----------------------------- | ---------- | ---------- |
  | ElevenLabs Sound Effects | `elevenlabs-sound-effects-v2` | \$0.0023   | Anonymized |
  | MMAudio V2               | `mmaudio-v2-text-to-audio`    | \$0.0009   | Anonymized |
</div>

<Info>
  For exact pricing before generation, use the [Audio Quote API](/api-reference/endpoint/audio/quote). Duration-based models have fixed price tiers, while per-second models charge based on output length.
</Info>

### Video

<div>
  Video pricing varies by resolution and duration. Visit the [Video Models page](/models/video) for exact quotes, or use the [Video Quote API](/api-reference/endpoint/video/quote).

  | Model                        | ID                                        | Type           | Pricing  | Privacy    |
  | ---------------------------- | ----------------------------------------- | -------------- | -------- | ---------- |
  | Grok Imagine                 | `grok-imagine-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Grok Imagine                 | `grok-imagine-image-to-video`             | Image to Video | Variable | Anonymized |
  | Grok Imagine Private         | `grok-imagine-text-to-video-private`      | Text to Video  | Variable | Private    |
  | Grok Imagine Private         | `grok-imagine-image-to-video-private`     | Image to Video | Variable | Private    |
  | Grok Imagine Private         | `grok-imagine-video-to-video-private`     | Text to Video  | Variable | Private    |
  | Grok Imagine R2V (Beta)      | `grok-imagine-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Grok Imagine R2V Private     | `grok-imagine-reference-to-video-private` | Text to Video  | Variable | Private    |
  | Kling 2.5 Turbo Pro          | `kling-2.5-turbo-pro-text-to-video`       | Text to Video  | Variable | Anonymized |
  | Kling 2.5 Turbo Pro          | `kling-2.5-turbo-pro-image-to-video`      | Image to Video | Variable | Anonymized |
  | Kling 2.6 Pro                | `kling-2.6-pro-text-to-video`             | Text to Video  | Variable | Anonymized |
  | Kling 2.6 Pro                | `kling-2.6-pro-image-to-video`            | Image to Video | Variable | Anonymized |
  | Kling O3 Pro                 | `kling-o3-pro-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Kling O3 Pro                 | `kling-o3-pro-image-to-video`             | Image to Video | Variable | Anonymized |
  | Kling O3 Pro R2V (Beta)      | `kling-o3-pro-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling O3 Standard            | `kling-o3-standard-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling O3 Standard            | `kling-o3-standard-image-to-video`        | Image to Video | Variable | Anonymized |
  | Kling O3 Standard R2V (Beta) | `kling-o3-standard-reference-to-video`    | Text to Video  | Variable | Anonymized |
  | Kling V3 Pro                 | `kling-v3-pro-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Kling V3 Pro                 | `kling-v3-pro-image-to-video`             | Image to Video | Variable | Anonymized |
  | Kling V3 Standard            | `kling-v3-standard-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling V3 Standard            | `kling-v3-standard-image-to-video`        | Image to Video | Variable | Anonymized |
  | Longcat Distilled            | `longcat-distilled-image-to-video`        | Image to Video | Variable | Private    |
  | Longcat Distilled            | `longcat-distilled-text-to-video`         | Text to Video  | Variable | Private    |
  | Longcat Full Quality         | `longcat-image-to-video`                  | Image to Video | Variable | Private    |
  | Longcat Full Quality         | `longcat-text-to-video`                   | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B            | `ltx-2-19b-full-text-to-video`            | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B            | `ltx-2-19b-full-image-to-video`           | Image to Video | Variable | Private    |
  | LTX Video 2.0 19B Distilled  | `ltx-2-19b-distilled-text-to-video`       | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B Distilled  | `ltx-2-19b-distilled-image-to-video`      | Image to Video | Variable | Private    |
  | LTX Video 2.0 Fast           | `ltx-2-fast-image-to-video`               | Image to Video | Variable | Anonymized |
  | LTX Video 2.0 Fast           | `ltx-2-fast-text-to-video`                | Text to Video  | Variable | Anonymized |
  | LTX Video 2.0 Full Quality   | `ltx-2-full-image-to-video`               | Image to Video | Variable | Anonymized |
  | LTX Video 2.0 Full Quality   | `ltx-2-full-text-to-video`                | Text to Video  | Variable | Anonymized |
  | LTX Video 2.3 Fast           | `ltx-2-v2-3-fast-image-to-video`          | Image to Video | Variable | Anonymized |
  | LTX Video 2.3 Fast           | `ltx-2-v2-3-fast-text-to-video`           | Text to Video  | Variable | Anonymized |
  | LTX Video 2.3 Full Quality   | `ltx-2-v2-3-full-image-to-video`          | Image to Video | Variable | Anonymized |
  | LTX Video 2.3 Full Quality   | `ltx-2-v2-3-full-text-to-video`           | Text to Video  | Variable | Anonymized |
  | Ovi                          | `ovi-image-to-video`                      | Image to Video | Variable | Private    |
  | PixVerse C1                  | `pixverse-c1-text-to-video`               | Text to Video  | Variable | Anonymized |
  | PixVerse C1                  | `pixverse-c1-image-to-video`              | Image to Video | Variable | Anonymized |
  | PixVerse C1 R2V              | `pixverse-c1-reference-to-video`          | Text to Video  | Variable | Anonymized |
  | PixVerse C1 Transition       | `pixverse-c1-transition`                  | Text to Video  | Variable | Anonymized |
  | PixVerse v5.6                | `pixverse-v5.6-text-to-video`             | Text to Video  | Variable | Anonymized |
  | PixVerse v5.6                | `pixverse-v5.6-image-to-video`            | Image to Video | Variable | Anonymized |
  | PixVerse v5.6 Transition     | `pixverse-v5.6-transition`                | Text to Video  | Variable | Anonymized |
  | Runway Gen-4 Aleph           | `runway-gen4-aleph`                       | Text to Video  | Variable | Anonymized |
  | Runway Gen-4 Turbo           | `runway-gen4-turbo`                       | Text to Video  | Variable | Anonymized |
  | Runway Gen-4.5               | `runway-gen4-5`                           | Text to Video  | Variable | Anonymized |
  | Runway Gen-4.5               | `runway-gen4-5-text`                      | Text to Video  | Variable | Anonymized |
  | Seedance 1.5 Pro             | `seedance-1-5-pro-text-to-video`          | Text to Video  | Variable | Anonymized |
  | Seedance 1.5 Pro             | `seedance-1-5-pro-image-to-video`         | Image to Video | Variable | Anonymized |
  | Seedance 2.0                 | `seedance-2-0-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Seedance 2.0                 | `seedance-2-0-image-to-video`             | Image to Video | Variable | Anonymized |
  | Seedance 2.0 Fast            | `seedance-2-0-fast-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Seedance 2.0 Fast            | `seedance-2-0-fast-image-to-video`        | Image to Video | Variable | Anonymized |
  | Seedance 2.0 Fast R2V        | `seedance-2-0-fast-reference-to-video`    | Text to Video  | Variable | Anonymized |
  | Seedance 2.0 R2V             | `seedance-2-0-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Topaz Video Upscale          | `topaz-video-upscale`                     | Text to Video  | Variable | Anonymized |
  | Veo 3 Fast                   | `veo3-fast-text-to-video`                 | Text to Video  | Variable | Anonymized |
  | Veo 3 Fast                   | `veo3-fast-image-to-video`                | Image to Video | Variable | Anonymized |
  | Veo 3 Full Quality           | `veo3-full-text-to-video`                 | Text to Video  | Variable | Anonymized |
  | Veo 3 Full Quality           | `veo3-full-image-to-video`                | Image to Video | Variable | Anonymized |
  | Veo 3.1 Fast                 | `veo3.1-fast-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Veo 3.1 Fast                 | `veo3.1-fast-image-to-video`              | Image to Video | Variable | Anonymized |
  | Veo 3.1 Full Quality         | `veo3.1-full-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Veo 3.1 Full Quality         | `veo3.1-full-image-to-video`              | Image to Video | Variable | Anonymized |
  | Vidu Q3                      | `vidu-q3-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Vidu Q3                      | `vidu-q3-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.1 Pro                  | `wan-2.1-pro-image-to-video`              | Image to Video | Variable | Private    |
  | Wan 2.2 A14B                 | `wan-2.2-a14b-text-to-video`              | Text to Video  | Variable | Private    |
  | Wan 2.5 Preview              | `wan-2.5-preview-image-to-video`          | Image to Video | Variable | Anonymized |
  | Wan 2.5 Preview              | `wan-2.5-preview-text-to-video`           | Text to Video  | Variable | Anonymized |
  | Wan 2.6                      | `wan-2.6-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.6                      | `wan-2.6-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Wan 2.6 Flash                | `wan-2.6-flash-image-to-video`            | Image to Video | Variable | Anonymized |
  | Wan 2.7                      | `wan-2-7-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Wan 2.7                      | `wan-2-7-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.7 Edit                 | `wan-2-7-video-to-video`                  | Text to Video  | Variable | Anonymized |
  | Wan 2.7 Reference            | `wan-2-7-reference-to-video`              | Text to Video  | Variable | Anonymized |
</div>

## Additional Features

### Web Search and Scraping

<div>
  | Feature        | Config                      | Pricing                 |
  | -------------- | --------------------------- | ----------------------- |
  | Web Search     | `enable_web_search: true`   | \$10.00 per 1K requests |
  | Web Scraping   | `enable_web_scraping: true` | \$10.00 per 1K URLs     |
  | X Search (xAI) | `enable_x_search: true`     | \$10.00 per 1K results  |
</div>

<Info>
  **Web Scraping** automatically detects up to 5 URLs per request, scrapes and converts content into structured markdown, and adds the extracted text into model context. Only successfully scraped URLs are billed.

  **X Search** enables xAI's native search for supported Grok models (e.g., `grok-4-20-beta`). This searches both the web and X/Twitter for real-time information. Billed per search result returned by the model (e.g., if the model returns 10 search results, you are charged for 10 results at $0.01 each = $0.10).

  These charges apply in addition to standard model token pricing.
</Info>

## Payment Options

<CardGroup>
  <Card title="USD" icon="credit-card" href="https://venice.ai/settings/api">
    Buy API credits with credit card. Credits never expire.
  </Card>

  <Card title="Crypto" icon="bitcoin" href="https://venice.ai/settings/api">
    Buy API credits with cryptocurrency. Same rates as USD.
  </Card>

  <Card title="Stake DIEM" icon="coins" href="https://venice.ai/token">
    Each Diem = \$1/day of credits that refresh daily.
  </Card>
</CardGroup>

### Pro Users

Pro subscribers receive a one-time \$10 API credit when upgrading to Pro. Use it to test and build small apps.


# Privacy
Source: https://docs.venice.ai/overview/privacy



Nearly all AI apps and services collect user data (personal information, prompt text, and AI text and image responses) in central servers, which they can access, and which they can (and do) share with third parties, ranging from ad networks to governments. Even if a company wants to keep this data safe, data breaches happen [all the time](https://www.wired.com/story/wired-guide-to-data-breaches/), often unreported.

> The only way to achieve reasonable user privacy is to avoid collecting this information in the first place. This is harder to do from an engineering perspective, but we believe it’s the correct approach.

### Privacy as a principle

One of Venice’s guiding principles is user privacy. The platform's architecture flows from this philosophical principle, and every component is designed with this objective in mind.

#### Architecture

The Venice API replicates the same technical architecture as the Venice platform from a backend perspective.

**Venice does not store or log any prompt or model responses on our servers.** API calls are forwarded directly to GPUs running across a collection of decentralized providers over encrypted HTTPS paths.

<img alt="Venice AI Privacy Architecture" />

