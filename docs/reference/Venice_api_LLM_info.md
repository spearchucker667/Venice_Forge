# Introduction
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
| `strip_thinking_response`            | boolean | Strip `<think></think>` blocks from the response (models using legacy `<think>` tag format). See [Reasoning Models](/guides/features/reasoning-models).                                                                                                                                                                                      | `false` |
| `disable_thinking`                   | boolean | On supported reasoning models, disable thinking and strip the `<think></think>` blocks from the response                                                                                                                                                                                                                                     | `false` |
| `enable_web_search`                  | string  | Enable web search for this request (`off`, `on`, `auto` - auto enables based on model's discretion)<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping).                                                                                                                                   | `off`   |
| `enable_web_scraping`                | boolean | Enable web scraping of up to 5 URLs detected in the user message. Scraped content augments responses and bypasses web search. Only successfully scraped URLs are billed.<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping).                                                              | `false` |
| `enable_x_search`                    | boolean | Enable xAI's native search (web + X/Twitter) for supported Grok models (e.g., `grok-4-20-beta`). Provides higher quality search results by using xAI's search infrastructure. When enabled, Venice's standard web search is bypassed.<br />Additional usage-based pricing applies, see [pricing](/overview/pricing#web-search-and-scraping). | `false` |
| `enable_web_citations`               | boolean | When web search is enabled, request that the LLM cite its sources using `[REF]0[/REF]` format                                                                                                                                                                                                                                                | `false` |
| `include_search_results_in_stream`   | boolean | Experimental: Include search results in the stream as the first emitted chunk                                                                                                                                                                                                                                                                | `false` |
| `return_search_results_as_documents` | boolean | Surface search results in an OpenAI-compatible tool call named `venice_web_search_documents` for LangChain integration                                                                                                                                                                                                                       | `false` |
| `include_venice_system_prompt`       | boolean | Whether to include Venice's default system prompts alongside specified system prompts                                                                                                                                                                                                                                                        | `true`  |

<Note>
  These parameters can also be specified as model suffixes appended to the model name (e.g., `zai-org-glm-5:enable_web_search=auto`). See [Model Feature Suffixes](/api-reference/endpoint/chat/model_feature_suffix) for details.
</Note>

### Prompt Caching

Venice supports prompt caching on select models to reduce latency and costs for repeated content. For supported models, Venice automatically caches system prompts—no code changes required. You can also manually mark content for caching using the `cache_control` property on message content.

| Parameter          | Type   | Description                                                                                                                                                                                          |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt_cache_key` | string | Optional routing hint to improve cache hit rates. When supplied, Venice routes requests to the same backend infrastructure, increasing the likelihood of cache hits across multi-turn conversations. |

See [Prompt Caching](/guides/features/prompt-caching) for details on how caching works, billing, and best practices.

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

Please see [this guide](/guides/getting-started/generating-api-key-agent) on how to use this endpoint.

***


# Generate API Key with Web3 Wallet
Source: https://docs.venice.ai/api-reference/endpoint/api_keys/generate_web3_key/post

POST /api_keys/generate_web3_key
Authenticates a wallet holding sVVV and creates an API key.

## Autonomous Agent API Key Creation

Please see [this guide](/guides/getting-started/generating-api-key-agent) on how to use this endpoint.

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

**Voice cloning:** Some TTS models (e.g. `tts-chatterbox-hd`) accept a cloned-voice handle in the `voice` field. Mint a handle by uploading a reference audio sample to POST /v1/audio/voices, then pass the returned `vv_<id>` value as `voice` here paired with the same `model`. Supported voice-cloning models advertise the `voice_cloning` capability on GET /models?type=tts.

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
Extracts text from a document file. Supports PDF, DOCX, PPTX, XLSX, and plain text formats. Upload a file via multipart/form-data.

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

* **modelName**: Display name of the model (e.g., "GLM 5")
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
Run text inference based on the supplied parameters. Supports multimodal inputs including text, images (image_url), audio (input_audio), video (video_url), and files (file) for compatible models. File inputs (PDF, DOCX, PPTX, XLSX, TXT, etc.) are automatically extracted to text before being sent to the model. Long running requests should use the streaming API by setting stream=true in your request.

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
* **x402 Wallet**: Pay-as-you-go with USDC credits from a wallet on Base or Solana. No Venice account required. See the [x402 guide](/guides/integrations/x402-venice-api) for setup.

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
Edit or modify an image based on the supplied prompt. The image can be provided either as a multipart form-data file upload or as a base64-encoded string in a JSON request. For models with resolution tiers that require explicit dimensions, omit aspect_ratio or set it to auto to infer the closest supported aspect ratio from the input image; provide aspect_ratio directly when exact output dimensions are required. Use output_format to request jpeg, jpg, png, or webp output.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Warning>
  This is an experimental endpoint and may be subject to change.
</Warning>

<Info>
  **Pricing:** Image editing pricing varies by model. The default model (`qwen-edit`) is **\$0.04 per edit**. See the [Models endpoint](/api-reference/endpoint/models/list) for all available edit models and their pricing.
</Info>

## Quality Tiers

Some edit models accept an optional `quality` parameter (`low`, `medium`, `high`) that trades visual fidelity for cost. Currently supported by `gpt-image-2-edit`; other models ignore the parameter.

```json theme={"system"}
{
  "model": "gpt-image-2-edit",
  "image": "iVBORw0KGgo...",
  "prompt": "change the sky to a sunrise",
  "resolution": "2K",
  "quality": "medium"
}
```

When you omit `quality`, the model uses its default tier (`high` for `gpt-image-2-edit`). Per-tier prices (1K/2K/4K × low/medium/high) live under `model_spec.pricing.quality` in the [Models endpoint](/api-reference/endpoint/models/list) and are listed in the [Pricing overview](/overview/pricing).

<Info>
  Quality-aware pricing is the default for all API and SDK callers — no opt-in header required. Requests that omit `quality` are billed at the model's default tier (`high` for `gpt-image-2-edit`).
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

## Sizing Options

Image models use model-specific sizing parameters:

* Pixel-based models accept `width` and `height`, for example `venice-sd35` and `qwen-image`.
* Aspect-ratio models accept `aspect_ratio`, for example `qwen-image-2`.
* Resolution-tier models accept both `aspect_ratio` and `resolution`.

For example, `gpt-image-2`, `nano-banana-2`, and `nano-banana-pro` support `resolution` values of `1K`, `2K`, and `4K`:

```json theme={"system"}
{
  "model": "gpt-image-2",
  "prompt": "a cinematic wide shot of Venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "4K",
  "format": "png"
}
```

The same resolution-tier sizing pattern also applies to Nano Banana models:

```json theme={"system"}
{
  "model": "nano-banana-pro",
  "prompt": "a serene canal in venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "2K"
}
```

For models that accept aspect ratio but do not expose resolution tiers, send `aspect_ratio` without `resolution`:

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "a serene canal in venice at sunset",
  "aspect_ratio": "16:9"
}
```

For models that use direct pixel dimensions, send `width` and `height` instead:

```json theme={"system"}
{
  "model": "venice-sd35",
  "prompt": "a serene canal in venice at sunset",
  "width": 1024,
  "height": 1024
}
```

Check [Image Models](/models/image) or the [Models endpoint](/api-reference/endpoint/models/list) for each model's supported sizing options before mixing sizing fields across models.

## Quality Tiers

Some models accept an optional `quality` parameter (`low`, `medium`, `high`) that trades visual fidelity for cost. Currently supported by `gpt-image-2`; other models ignore the parameter.

```json theme={"system"}
{
  "model": "gpt-image-2",
  "prompt": "a cinematic wide shot of Venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "quality": "medium"
}
```

When you omit `quality`, the model uses its default tier (`high` for `gpt-image-2`). Pricing depends on the combination of `resolution` and `quality` — the per-tier prices for `gpt-image-2` (1K/2K/4K × low/medium/high) are exposed under `model_spec.pricing.quality` in the [Models endpoint](/api-reference/endpoint/models/list) and listed in the [Pricing overview](/overview/pricing).

<Info>
  Quality-aware pricing is the default for all API and SDK callers — no opt-in header required. Requests that omit `quality` are billed at the model's default tier (`high` for `gpt-image-2`).
</Info>

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

For models with resolution tiers that require explicit dimensions, omit `aspect_ratio` or set it to `auto` to infer the closest supported aspect ratio from the first input image. Provide `aspect_ratio` directly when exact output dimensions are required. Use `output_format` to request jpeg, jpg, png, or webp output.


**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Info>
  **Pricing:** Multi-edit pricing varies by model. See the [Pricing overview](/overview/pricing)
  for current per-edit prices.
</Info>

## Quality Tiers

Some multi-edit models accept an optional `quality` parameter (`low`, `medium`, `high`) that trades visual fidelity for cost. Currently supported by `gpt-image-2-edit`; other models ignore the parameter.

```json theme={"system"}
{
  "modelId": "gpt-image-2-edit",
  "images": ["iVBORw0KGgo...", "iVBORw0KGgo..."],
  "prompt": "blend the two scenes into one cinematic frame",
  "resolution": "2K",
  "quality": "medium"
}
```

When you omit `quality`, the model uses its default tier (`high` for `gpt-image-2-edit`). Per-tier prices (1K/2K/4K × low/medium/high) live under `model_spec.pricing.quality` in the [Models endpoint](/api-reference/endpoint/models/list) and are listed in the [Pricing overview](/overview/pricing).

<Info>
  Quality-aware pricing is the default for all API and SDK callers — no opt-in header required. Requests that omit `quality` are billed at the model's default tier (`high` for `gpt-image-2-edit`).
</Info>


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

## Quality-Tier Pricing

For image models that accept the optional `quality` parameter (currently `gpt-image-2` and `gpt-image-2-edit`), the response exposes a per-quality price matrix under `model_spec.pricing.quality`. Each top-level key is a resolution tier (`1K`, `2K`, `4K`) and each nested key is a quality level (`low`, `medium`, `high`) carrying its own `usd` and `diem` price:

```json theme={"system"}
"pricing": {
  "resolutions": {
    "1K": { "usd": 0.27, "diem": 0.27 },
    "2K": { "usd": 0.51, "diem": 0.51 },
    "4K": { "usd": 0.84, "diem": 0.84 }
  },
  "quality": {
    "1K": {
      "low":    { "usd": 0.02, "diem": 0.02 },
      "medium": { "usd": 0.07, "diem": 0.07 },
      "high":   { "usd": 0.26, "diem": 0.26 }
    },
    "2K": {
      "low":    { "usd": 0.03, "diem": 0.03 },
      "medium": { "usd": 0.13, "diem": 0.13 },
      "high":   { "usd": 0.50, "diem": 0.50 }
    },
    "4K": {
      "low":    { "usd": 0.05, "diem": 0.05 },
      "medium": { "usd": 0.21, "diem": 0.21 },
      "high":   { "usd": 0.83, "diem": 0.83 }
    }
  }
}
```

`pricing.resolutions` is the legacy per-image schedule kept for backward compatibility. `pricing.quality` is the per-(resolution, quality) matrix that applies whenever the `quality` parameter is supported. Both fields are kept in the response so clients can detect quality support and surface the matrix in their own UIs.

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

Private models also return a `download_url` for the finished video. It is a short-lived delivery URL (a few retries are fine if a download drops); see the [Video Generation guide](/guides/media/video-generation#private-download-links) for details and optional `DELETE` for privacy.

### Seedance 2.0

For `seedance-2-0-*` models (text-to-video, image-to-video, reference-to-video, plus the `-fast-*` variants), see the [Seedance 2.0 Guide](/guides/media/seedance-2-0) for the four-workflow model (Reference / Edit / Extend / Stitch), canonical prompt patterns, multimodal input limits, and pricing details.

### Video upscaling

For the `topaz-video-upscale` model, use `upscale_factor` (1, 2, or 4) instead of `resolution`, and provide a `video_url`. Duration and FPS are detected automatically from the video file. See the [Video Upscaling Guide](/guides/media/video-upscaling) for full details and examples.

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

For private models, the finished file is downloaded from the `download_url` returned by `/video/queue` (not as binary from this endpoint). See [Private download links](/guides/media/video-generation#private-download-links) for how the link works, retries, and optional `DELETE`.

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
Get the x402 credit balance for a wallet address. Requires Sign-in-with-x authentication for the same EVM or Solana wallet.



# X402 Top Up
Source: https://docs.venice.ai/api-reference/endpoint/x402/top-up

POST /x402/top-up
Top up your Venice credit balance using an `X-402-Payment` header. If the header is missing, the endpoint returns payment requirements.

This is the primary x402 payment endpoint. It currently returns Base and Solana USDC payment options in the `accepts` array. All inference endpoints (chat, image, audio, video) consume from the credit balance you establish here.



# X402 Transactions
Source: https://docs.venice.ai/api-reference/endpoint/x402/transactions

GET /x402/transactions/{walletAddress}
Get paginated x402 transaction history for a wallet address. Requires Sign-in-with-x authentication for the same EVM or Solana wallet.



# Error Codes
Source: https://docs.venice.ai/api-reference/error-codes



When an error occurs, the Venice API returns an HTTP status code and a descriptive message. Some errors also include additional fields, such as refund status, suggested retry models, validation details, or request IDs.

## Error response format

Most errors return an `error` field with a human-readable message:

```json theme={"system"}
{
  "error": "Invalid request parameters"
}
```

Some endpoints include additional fields that are specific to the endpoint. For example, video moderation errors can include whether credits were refunded:

```json theme={"system"}
{
  "error": "Your generation was blocked due to the model provider's content policies. Credits have been refunded.",
  "credits_refunded": true
}
```

Validation errors may include `details` and `issues` fields with field-level validation information:

```json theme={"system"}
{
  "error": "Invalid request parameters",
  "details": {
    "_errors": [],
    "field": {
      "_errors": ["Field is required"]
    }
  },
  "issues": []
}
```

Some OpenAI-compatible endpoints may return OpenAI-style error objects for specific cases, such as context length errors:

```json theme={"system"}
{
  "error": {
    "message": "Your request exceeds the model's maximum context. Please reduce your prompt or completion length.",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "context_length_exceeded"
  }
}
```

## Error codes

| Error Code                           | HTTP Status | Message                                                                                                                                                           | Log Level |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `AUTHENTICATION_FAILED`              | 401         | Authentication failed                                                                                                                                             | -         |
| `AUTHENTICATION_FAILED_INACTIVE_KEY` | 401         | Authentication failed - Pro subscription is inactive. Please upgrade your subscription to continue using the API                                                  | -         |
| `X402_INVALID_SIGN_IN`               | 401         | Invalid Sign-in-with-x signature                                                                                                                                  | -         |
| `PRO_ONLY_MODEL`                     | 401         | This model is only available to Pro users                                                                                                                         | -         |
| `INSUFFICIENT_BALANCE`               | 402         | Insufficient USD or Diem balance to complete request. Visit [https://venice.ai/settings/api](https://venice.ai/settings/api) to add credits.                      | -         |
| `API_KEY_DIEM_SPEND_LIMIT_EXCEEDED`  | 402         | API key DIEM spend limit exceeded. Your account may still have DIEM balance, but this API key has reached its configured DIEM spending limit.                     | -         |
| `API_KEY_USD_SPEND_LIMIT_EXCEEDED`   | 402         | API key USD spend limit exceeded. Your account may still have USD balance, but this API key has reached its configured USD spending limit.                        | -         |
| `UNAUTHORIZED`                       | 403         | Unauthorized access                                                                                                                                               | -         |
| `API_ACCESS_DISABLED`                | 403         | API access has been disabled for this account. Please contact [support@venice.ai](mailto:support@venice.ai)                                                       | -         |
| `X402_WALLET_MISMATCH`               | 403         | You can only access resources for your own wallet                                                                                                                 | -         |
| `INVALID_REQUEST`                    | 400         | Invalid request parameters                                                                                                                                        | -         |
| `INVALID_MODEL`                      | 400         | Invalid model specified                                                                                                                                           | -         |
| `REQUEST_ID_NOT_FOUND`               | 400         | Request ID is invalid.                                                                                                                                            | -         |
| `INVALID_AUDIO_FORMAT`               | 400         | Invalid audio format. Supported formats are WAV and MP3.                                                                                                          | -         |
| `INVALID_VIDEO_FORMAT`               | 400         | Invalid video format. Supported formats include MP4, MOV, WebM, MKV, AVI, and others.                                                                             | -         |
| `CORRUPTED_IMAGE`                    | 400         | The image file is corrupted or unreadable                                                                                                                         | -         |
| `IMAGE_TOO_SMALL`                    | 400         | Image dimensions are too small                                                                                                                                    | -         |
| `TOO_MANY_TOKENS`                    | 400         | Your request exceeds the model's maximum context. Please reduce your prompt or completion length.                                                                 | -         |
| `CHARACTER_NOT_FOUND`                | 404         | No character could be found from the provided character\_slug                                                                                                     | -         |
| `MODEL_NOT_FOUND`                    | 404         | Specified model not found                                                                                                                                         | -         |
| `MEDIA_NOT_FOUND`                    | 404         | Media could not be found. Request may may be invalid, expired, or deleted.                                                                                        | -         |
| `PAYLOAD_TOO_LARGE`                  | 413         | The request payload is too large. Please reduce the size of your request.                                                                                         | -         |
| `INVALID_CONTENT_TYPE`               | 415         | Invalid request content-type                                                                                                                                      | -         |
| `VIDEO_DURATION_TOO_LONG`            | 422         | Video duration exceeds the maximum allowed.                                                                                                                       | -         |
| `VIDEO_DURATION_TOO_SHORT`           | 422         | Video duration is too short.                                                                                                                                      | -         |
| `IMAGE_TOO_LARGE`                    | 422         | Image dimensions exceed the maximum allowed.                                                                                                                      | -         |
| `CONTENT_POLICY_VIOLATION`           | 422         | Your prompt violates the content policy of Venice.ai or the model provider                                                                                        | -         |
| `ASR_UPSTREAM_VALIDATION_FAILED`     | 422         | The audio could not be processed for transcription. Common causes: zero-length, silent, corrupt, or unsupported-language audio. Please verify the file and retry. | warn      |
| `RATE_LIMIT_EXCEEDED`                | 429         | Rate limit exceeded                                                                                                                                               | -         |
| `MODEL_OVERLOADED`                   | 429         | The model is currently overloaded. Please try again later.                                                                                                        | -         |
| `INFERENCE_FAILED`                   | 500         | Inference processing failed                                                                                                                                       | error     |
| `UPSCALE_FAILED`                     | 500         | Image upscaling failed                                                                                                                                            | error     |
| `IMAGE_EDIT_ERROR`                   | 500         | Image edit failed                                                                                                                                                 | error     |
| `UNKNOWN_ERROR`                      | 500         | An unknown error occurred                                                                                                                                         | error     |
| `TEE_ATTESTATION_FAILED`             | 502         | TEE attestation request failed. The Trusted Execution Environment provider may be temporarily unavailable.                                                        | error     |
| `TEE_SIGNATURE_FAILED`               | 502         | TEE signature request failed. The Trusted Execution Environment provider may be temporarily unavailable.                                                          | error     |
| `ASR_UPSTREAM_FAILED`                | 502         | Audio transcription failed due to a temporary upstream error. Please retry.                                                                                       | warn      |
| `MODEL_OFFLINE`                      | 503         | The model is temporarily offline. Please try again later.                                                                                                         | -         |
| `MODEL_AT_CAPACITY`                  | 503         | The model is at capacity. Please try again later.                                                                                                                 | -         |
| `REQUEST_TIMEOUT`                    | 504         | The request took too long to complete and was timed-out. For long-running inference requests, use the streaming API by setting `stream=true` in your request.     | -         |


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

  **M** `zai-org-glm-5` `qwen3-next-80b` `google-gemma-3-27b-it`

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


# File Inputs
Source: https://docs.venice.ai/guides/features/file-inputs

Send documents and source files to chat models with the Venice API

File inputs let you attach documents and source files directly to a `/chat/completions` request. Venice extracts the file to text before sending it to the selected model, so you can ask questions, summarize, compare, or transform file content without building your own parser first.

Use file inputs when your prompt depends on the contents of a document, spreadsheet, markdown file, JSON file, or code file. They are request-scoped inputs, not persistent file storage, so include the file in each request that needs it.

<Info>
  File inputs use the OpenAI-compatible chat content array. Add a content block with `type: "file"` and provide the file content in `file.file_data`.
</Info>

## Supported File Types

The chat API accepts file inputs as either base64 data URLs or publicly accessible URLs.

The maximum file size is **25MB per file**, measured after decoding a base64 data URL or after fetching a URL.

| Category      | Formats                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Documents     | PDF, DOCX, PPTX                                                                                                                |
| Spreadsheets  | XLSX, XLS, CSV                                                                                                                 |
| Text and data | TXT, Markdown, JSON                                                                                                            |
| Source code   | Most common code files, including `.py`, `.js`, `.ts`, `.c`, `.cpp`, `.java`, `.go`, `.rs`, `.ps1`, `.sh`, `.yaml`, and `.sql` |

<Note>
  Files are extracted to text before inference. The extracted text counts toward the model's input context, so choose a model with enough `availableContextTokens` for the file plus your instructions and expected answer.
</Note>

## Basic Usage

Send a `messages` array where the user message `content` is an array of text and file blocks:

<CodeGroup>
  ```python Python theme={"system"}
  import base64
  import os
  from pathlib import Path

  from openai import OpenAI

  client = OpenAI(
      api_key=os.environ["VENICE_API_KEY"],
      base_url="https://api.venice.ai/api/v1",
  )

  path = Path("q3-report.pdf")
  file_data = "data:application/pdf;base64," + base64.b64encode(path.read_bytes()).decode("utf-8")

  response = client.chat.completions.create(
      model="openai-gpt-55",
      messages=[
          {
              "role": "user",
              "content": [
                  {
                      "type": "text",
                      "text": "Summarize this report in five bullets and list the main risks.",
                  },
                  {
                      "type": "file",
                      "file": {
                          "file_data": file_data,
                          "filename": "q3-report.pdf",
                      },
                  },
              ],
          }
      ],
  )

  print(response.choices[0].message.content)
  ```

  ```javascript Node.js theme={"system"}
  import OpenAI from "openai";
  import { readFile } from "node:fs/promises";

  const client = new OpenAI({
    apiKey: process.env.VENICE_API_KEY,
    baseURL: "https://api.venice.ai/api/v1",
  });

  const pdf = await readFile("q3-report.pdf");
  const fileData = `data:application/pdf;base64,${pdf.toString("base64")}`;

  const response = await client.chat.completions.create({
    model: "openai-gpt-55",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Summarize this report in five bullets and list the main risks.",
          },
          {
            type: "file",
            file: {
              file_data: fileData,
              filename: "q3-report.pdf",
            },
          },
        ],
      },
    ],
  });

  console.log(response.choices[0].message.content);
  ```

  ```bash cURL theme={"system"}
  PDF_BASE64=$(base64 < q3-report.pdf | tr -d '\n')

  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
  {
    "model": "openai-gpt-55",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Summarize this report in five bullets and list the main risks."
          },
          {
            "type": "file",
            "file": {
              "file_data": "data:application/pdf;base64,$PDF_BASE64",
              "filename": "q3-report.pdf"
            }
          }
        ]
      }
    ]
  }
  EOF
  ```
</CodeGroup>

## File URLs

If the file is already hosted at a public HTTP or HTTPS URL, pass the URL in `file_data` instead of base64 encoding it:

```json theme={"system"}
{
  "model": "openai-gpt-55",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Identify the governing law, renewal terms, and termination rights in this agreement."
        },
        {
          "type": "file",
          "file": {
            "file_data": "https://example.com/contracts/vendor-agreement.pdf",
            "filename": "vendor-agreement.pdf"
          }
        }
      ]
    }
  ]
}
```

<Warning>
  Only use public URLs that Venice can fetch without authentication. For private files, send a base64 data URL.
</Warning>

## Multiple Files

You can include more than one file block in the same message. Put a short text instruction before the files so the model knows how to use them.

```json theme={"system"}
{
  "model": "openai-gpt-55",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Compare these two policy drafts. Return the material differences and recommend which version is clearer."
        },
        {
          "type": "file",
          "file": {
            "file_data": "data:application/pdf;base64,JVBERi0xLjQK...",
            "filename": "policy-v1.pdf"
          }
        },
        {
          "type": "file",
          "file": {
            "file_data": "data:application/pdf;base64,JVBERi0xLjQK...",
            "filename": "policy-v2.pdf"
          }
        }
      ]
    }
  ]
}
```

For best results, name each file clearly and refer to those names in your prompt.

## Data URLs

For local files, encode the file bytes as base64 and prefix them with the correct MIME type:

| File type  | Data URL prefix                                                                          |
| ---------- | ---------------------------------------------------------------------------------------- |
| PDF        | `data:application/pdf;base64,`                                                           |
| DOCX       | `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,`   |
| PPTX       | `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,` |
| XLSX       | `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,`         |
| CSV        | `data:text/csv;base64,`                                                                  |
| Markdown   | `data:text/markdown;base64,`                                                             |
| Plain text | `data:text/plain;base64,`                                                                |
| JSON       | `data:application/json;base64,`                                                          |

If you do not know the exact MIME type, use `application/octet-stream`. Including an accurate `filename` still helps Venice identify and display the file.

## Working With Large Files

Because files become prompt text, large files can increase latency, token usage, and cost. Keep the model's context window in mind.

The raw file must be 25MB or smaller. Base64 encoding increases request size by about 33%, so a file near the 25MB limit will produce a larger JSON request body.

Good patterns for large files:

* Ask for a specific task instead of a broad "analyze everything" prompt.
* Include only the documents needed for the current answer.
* Use models with larger `availableContextTokens` for long reports or codebases.
* Put stable, repeated documents before dynamic user questions if you are also using [prompt caching](/guides/features/prompt-caching).
* Use `stream: true` when you expect a long response.

## File Inputs vs. Text Parser

Use chat file inputs when you want the model to reason over the file immediately.

Use the [Text Parser API](/api-reference/endpoint/augment/text-parser) when you want to extract text first, inspect the token count, store the extracted text in your own system, or send the same extracted text to multiple requests.

| Need                                         | Use                                               |
| -------------------------------------------- | ------------------------------------------------- |
| Ask a model about a document in one request  | Chat file input                                   |
| Extract text without model inference         | Text Parser API                                   |
| Check extracted token count before prompting | Text Parser API                                   |
| Reuse extracted text across many requests    | Text Parser API, then include the text in prompts |

## Best Practices

* Include `filename` whenever possible, especially when sending multiple files.
* Put the instruction before the file blocks so the model knows the task before reading the extracted content.
* Use public URLs only for files that can be fetched without cookies, headers, or signed session state.
* Prefer base64 data URLs for private files or files generated inside your application.
* Ask focused questions and specify the output format you want.
* For structured extraction, combine file inputs with [structured responses](/guides/features/structured-responses).

## Troubleshooting

<AccordionGroup>
  <Accordion title="The model says it cannot access the file">
    Make sure the message content uses an array and includes a `type: "file"` block. If you used a URL, verify it is publicly reachable without authentication.
  </Accordion>

  <Accordion title="The request is slow or expensive">
    The file may extract to a large amount of text. Use a larger-context model, narrow the task, send fewer files, or pre-extract and trim the text with the Text Parser API.
  </Accordion>

  <Accordion title="The response ignores one of my files">
    Give each file a descriptive `filename` and refer to the filenames directly in your prompt. For example, "Compare `policy-v1.pdf` against `policy-v2.pdf`."
  </Accordion>

  <Accordion title="A model rejects the file content">
    File inputs are available on compatible chat models. Check the [Models page](/models/overview) for current model capabilities and context limits, or try a current large-context text model.
  </Accordion>
</AccordionGroup>


# Prompt Caching
Source: https://docs.venice.ai/guides/features/prompt-caching

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
Source: https://docs.venice.ai/guides/features/reasoning-models

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

## Token limits

Reasoning models generate visible answer tokens (in `content`) and reasoning tokens (in `reasoning_content`). Both count toward your token budget.

### Setting a token cap

Use `max_completion_tokens` to cap the total number of tokens the model generates, including reasoning:

```json theme={"system"}
{
  "model": "deepseek-v4-flash",
  "messages": [...],
  "max_completion_tokens": 500
}
```

`max_tokens` is also accepted and behaves the same way. If both are set, `max_completion_tokens` takes precedence.

To get more visible output, raise the cap, lower `reasoning_effort`, or [disable reasoning](#disabling-reasoning).

### Reading the breakdown

The `usage` object shows how your budget was spent:

```json theme={"system"}
"usage": {
  "completion_tokens": 501,
  "completion_tokens_details": { "reasoning_tokens": 169 },
  "prompt_tokens": 13,
  "total_tokens": 514
}
```

In this example, 169 tokens were spent on reasoning and 332 on the visible answer. When the cap is reached, `finish_reason` is `length`.

Each model's upper bound is available as `maxCompletionTokens` on the [`/v1/models`](/api-reference/endpoint/models/list) endpoint.

### Non-reasoning models

`max_tokens` and `max_completion_tokens` behave the same on non-reasoning models, capping visible output directly.

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


# Structured Responses
Source: https://docs.venice.ai/guides/features/structured-responses

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
Source: https://docs.venice.ai/guides/features/tee-e2ee-models

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


# Generating an API Key
Source: https://docs.venice.ai/guides/getting-started/generating-api-key



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
Source: https://docs.venice.ai/guides/getting-started/generating-api-key-agent



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
2. **Use the [x402 wallet flow](/guides/integrations/x402-venice-api) instead of the API key.** With x402 the agent signs a Sign-In-With-X message per request, tops up directly with USDC on Base or Solana via `POST /api/v1/x402/top-up`, and pays per request. The x402 USDC balance is wallet-bound, not user-bound, so it does not show up as balance for the minted Bearer key, but it does let the same wallet pay for inference programmatically.

## Related resources

<CardGroup>
  <Card title="Crypto and Agents" icon="link" href="/guides/integrations/crypto-rpc-agents">
    Use Venice as both the model provider and the blockchain RPC layer for autonomous agents.
  </Card>

  <Card title="x402 Wallet Authentication" icon="wallet" href="/guides/integrations/x402-venice-api">
    Pay per request with USDC on Base or Solana, no API key required.
  </Card>

  <Card title="Generate Web3 API Key Endpoint" icon="code" href="/api-reference/endpoint/api_keys/generate_web3_key/post">
    Endpoint reference for the mint endpoint.
  </Card>

  <Card title="Standard API Key Guide" icon="key" href="/guides/getting-started/generating-api-key">
    For users who prefer to mint a key from the dashboard.
  </Card>
</CardGroup>


# Migrate from OpenAI
Source: https://docs.venice.ai/guides/getting-started/openai-migration

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


# Using Postman
Source: https://docs.venice.ai/guides/getting-started/postman



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


# AI Agents
Source: https://docs.venice.ai/guides/integrations/ai-agents

Build private agents with Venice across apps, coding tools, MCP hosts, skills, frameworks, and crypto workflows.

Build agents on Venice with private, OpenAI-compatible models, media endpoints, tool access, and wallet-based payments.

<CardGroup>
  <Card title="Agent apps" icon="robot" href="#agent-apps">
    OpenClaw, Hermes Agent, and NanoClaw.
  </Card>

  <Card title="Coding agents" icon="terminal" href="#coding-agents">
    Claude Code, Cursor, and Codex CLI.
  </Card>

  <Card title="MCP + Skills" icon="plug" href="#tools-and-skills">
    Runtime tools, endpoint guidance, and production playbooks.
  </Card>

  <Card title="Autonomous agents" icon="link" href="#autonomous-and-framework-agents">
    x402 wallet auth, Crypto RPC, autonomous keys, and agent frameworks.
  </Card>
</CardGroup>

## Agent apps

<CardGroup>
  <Card title="OpenClaw" icon="message" href="/guides/integrations/openclaw-bot">
    Connect Venice to WhatsApp, Telegram, Discord, iMessage, Slack, and more.
  </Card>

  <Card title="Hermes Agent" icon="brain" href="/guides/integrations/hermes-agent">
    Self-hosted agents with memory, skills, and Venice models.
  </Card>

  <Card title="NanoClaw" icon="mobile-screen" href="/guides/integrations/nanoclaw-venice">
    Lightweight WhatsApp and Telegram assistant powered by Venice.
  </Card>
</CardGroup>

## Coding agents

<CardGroup>
  <Card title="Claude Code" icon="terminal" href="/guides/integrations/claude-code">
    Use Claude Code with Venice-hosted Claude models.
  </Card>

  <Card title="Cursor" icon="code" href="/guides/integrations/cursor">
    Add Venice models to Cursor with the `venice-` model prefix.
  </Card>

  <Card title="Codex CLI" icon="square-terminal" href="/guides/integrations/codex-cli">
    Point Codex CLI at Venice's OpenAI-compatible endpoint.
  </Card>
</CardGroup>

## Tools and skills

<CardGroup>
  <Card title="Venice MCP Server" icon="plug" href="/guides/integrations/venice-mcp">
    Expose chat, image, video, audio, music, embeddings, and more as MCP tools.
  </Card>

  <Card title="Venice Skills" icon="screwdriver-wrench" href="/guides/integrations/venice-skills">
    Give agents endpoint-specific instructions synced to the API spec.
  </Card>

  <Card title="Video Harness" icon="video" href="/guides/integrations/venice-video-harness">
    Use agent playbooks for repeatable Venice video production.
  </Card>
</CardGroup>

## Autonomous and framework agents

<CardGroup>
  <Card title="Crypto RPC for Agents" icon="link" href="/guides/integrations/crypto-rpc-agents">
    Give agents inference and on-chain access through one credential.
  </Card>

  <Card title="x402 Wallet Auth" icon="wallet" href="/guides/integrations/x402-venice-api">
    Let agents pay for Venice with Base or Solana USDC.
  </Card>

  <Card title="Autonomous API Keys" icon="key" href="/guides/getting-started/generating-api-key-agent">
    Mint API keys from a staked VVV wallet.
  </Card>

  <Card title="LangChain" icon="link" href="/guides/integrations/langchain">
    Build chains and agents on Venice models.
  </Card>

  <Card title="Vercel AI SDK" icon="triangle" href="/guides/integrations/vercel-ai-sdk">
    Stream Venice models through the AI SDK.
  </Card>

  <Card title="CrewAI" icon="users" href="/guides/integrations/crewai">
    Run multi-agent crews with Venice as the model provider.
  </Card>
</CardGroup>


# Claude Code
Source: https://docs.venice.ai/guides/integrations/claude-code

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

Venice [prompt caching](/guides/features/prompt-caching) works alongside Claude Code's native cache markers. Venice automatically detects when Claude Code sends `cache_control` fields and adjusts its caching strategy accordingly.

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
Source: https://docs.venice.ai/guides/integrations/codex-cli

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
Source: https://docs.venice.ai/guides/integrations/crewai

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
  `SerperDevTool` requires a `SERPER_API_KEY` environment variable from [serper.dev](https://serper.dev). As an alternative, you can use Venice's built-in web search by passing `venice_parameters: {"enable_web_search": "auto"}` via `model_kwargs` — no extra API key needed. See the LangChain guide's [Web Search Integration](/guides/integrations/langchain#web-search-integration) for an example.
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
Source: https://docs.venice.ai/guides/integrations/crypto-rpc-agents

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
    Agents can authenticate with a wallet signature and pay in USDC on Base or Solana.
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

| Method          | Best for                                         | How it works                                                                                                                                                             |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API key**     | Server-side agents, fixed deployments            | `Authorization: Bearer <key>` header. Get a key at [venice.ai/settings/api](https://venice.ai/settings/api).                                                             |
| **x402 wallet** | Autonomous, crypto-native, or short-lived agents | Wallet signs a Sign-In-With-X message, pays per request in USDC on Base or Solana. No Venice account needed. See the [x402 guide](/guides/integrations/x402-venice-api). |

Both methods share the same rate limits and billing in Venice credits.

<Tip>
  Truly autonomous agents can mint their own API key by staking VVV on Base. See [Autonomous Agent API Key Creation](/guides/getting-started/generating-api-key-agent).
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

See [Autonomous Agent API Key Creation](/guides/getting-started/generating-api-key-agent) for the complete walkthrough with code and the full error reference.

## x402 wallet auth in 30 seconds

If your agent already has a Base or Solana wallet, skip the API key entirely. The [`venice-x402-client`](https://github.com/veniceai/x402-client) SDK handles Sign-In-With-X signing, top-ups, and balance tracking.

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

The same wallet auth works against `/crypto/rpc/{network}` for blockchain reads and writes. Full protocol details in the [x402 guide](/guides/integrations/x402-venice-api).

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

  <Card title="x402 Wallet Auth" icon="wallet" href="/guides/integrations/x402-venice-api">
    Authenticate and pay with a Base or Solana wallet
  </Card>

  <Card title="Autonomous Agent API Key" icon="robot" href="/guides/getting-started/generating-api-key-agent">
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
Source: https://docs.venice.ai/guides/integrations/cursor

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


# Hermes Agent
Source: https://docs.venice.ai/guides/integrations/hermes-agent

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


# Additional Integrations
Source: https://docs.venice.ai/guides/integrations/integrations

Third-party tools and community projects with Venice AI integrations.

[How to use Venice API](https://venice.ai/blog/how-to-use-venice-api) reference guide.

<Note>
  Several integrations have their own dedicated guides — see [AI Agents](/guides/integrations/ai-agents), [OpenClaw](/guides/integrations/openclaw-bot), [NanoClaw](/guides/integrations/nanoclaw-venice), [Cursor](/guides/integrations/cursor), [Claude Code](/guides/integrations/claude-code), and [Codex CLI](/guides/integrations/codex-cli).
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

  * [1Claw](https://1claw.xyz), secure infrastructure for AI agents; routes private inference to Venice via the Shroud TEE proxy

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
Source: https://docs.venice.ai/guides/integrations/langchain

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
Source: https://docs.venice.ai/guides/integrations/nanoclaw-venice

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


# OpenClaw
Source: https://docs.venice.ai/guides/integrations/openclaw-bot

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


# Venice MCP Server
Source: https://docs.venice.ai/guides/integrations/venice-mcp

The official Venice Model Context Protocol server with 31 Venice tools for any MCP host

The [Venice MCP Server](https://github.com/veniceai/venice-mcp-server) is the official [Model Context Protocol](https://modelcontextprotocol.io/) server for Venice. It exposes the full Venice API (chat, image, video, audio, music, embeddings, web augment, and characters) as **31 tools** that any MCP-compatible agent can call.

<Card title="GitHub: veniceai/venice-mcp-server" icon="github" href="https://github.com/veniceai/venice-mcp-server">
  Published as [`@veniceai/mcp-server`](https://www.npmjs.com/package/@veniceai/mcp-server) on npm. MIT licensed.
</Card>

<CardGroup>
  <Card title="31 Tools" icon="toolbox">
    Every Venice modality in one config block
  </Card>

  <Card title="Any MCP Host" icon="plug">
    Claude Desktop, Cursor, ChatGPT, LM Studio, Continue, and more
  </Card>

  <Card title="Wallet Auth (Optional)" icon="wallet">
    Bring an API key, or pay per call with a SIWE-signed wallet via x402
  </Card>
</CardGroup>

## Quick start

<Steps>
  <Step title="Get a Venice API key">
    Generate one from [venice.ai/settings/api](https://venice.ai/settings/api). See the [API key guide](/guides/getting-started/generating-api-key) for step-by-step instructions.
  </Step>

  <Step title="Add Venice to your MCP host config">
    Drop this into your MCP host's config file:

    ```json theme={"system"}
    {
      "mcpServers": {
        "venice": {
          "command": "npx",
          "args": ["-y", "@veniceai/mcp-server@0.2.0"],
          "env": { "VENICE_API_KEY": "<your-venice-api-key>" }
        }
      }
    }
    ```

    Common config paths:

    | Host                     | Path                                                              |
    | ------------------------ | ----------------------------------------------------------------- |
    | Claude Desktop (macOS)   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
    | Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json`                     |
    | Cursor                   | `~/.cursor/mcp.json`                                              |
    | LM Studio                | `mcp.json` (from the app's MCP settings)                          |
  </Step>

  <Step title="Restart your MCP host">
    Your agent now has chat, image, video, music, TTS, ASR, and 25 more Venice tools available.
  </Step>
</Steps>

<Note>
  Most MCP hosts only pass environment variables that are **explicitly listed** in the `env` block. System-level env vars are not inherited. If you see 402 errors with an API key set, double-check that `VENICE_API_KEY` is inside `env` in your config.
</Note>

## What you get

**31 tools** spanning every Venice modality, **3 resources** (`venice://models`, `venice://styles`, `venice://voices`), and **3 prompt templates**.

### Chat & embeddings

| Tool                         | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `venice_chat`                | OpenAI-compatible chat completion against Venice's full LLM catalog.     |
| `venice_responses`           | OpenAI-compatible Responses API with single- or multi-turn tool support. |
| `venice_embeddings`          | Compute embeddings for text input.                                       |
| `venice_chat_with_character` | Chat with a Venice character by slug.                                    |

### Image

| Tool                      | Description                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `venice_image_generate`   | Generate an image (Flux 2, Lustify SDXL, Anime/WAI, Qwen Image, GPT Image, Nano Banana Pro, and more). |
| `venice_image_edit`       | Edit an image with a prompt.                                                                           |
| `venice_image_multi_edit` | Edit multiple images together with one prompt.                                                         |
| `venice_image_upscale`    | Upscale an image up to 4×.                                                                             |
| `venice_image_remove_bg`  | Remove an image background.                                                                            |
| `venice_image_styles`     | List image style presets.                                                                              |

### Video

| Tool                          | Description                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `venice_video_generate`       | Queue a video generation (Sora 2, Veo 3.1, Kling, Wan, LTX 2, Seedance, Runway Gen-4, and more). |
| `venice_video_status`         | Check status of a queued video job.                                                              |
| `venice_video_complete`       | Mark a completed video as downloaded; deletes server-side media.                                 |
| `venice_video_transcriptions` | Transcribe a YouTube video URL.                                                                  |
| `venice_video_quote`          | Get a price quote before queuing.                                                                |

### Audio (TTS / ASR)

| Tool                 | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `venice_tts`         | Text-to-speech with cloned voices and emotion tags.  |
| `venice_asr`         | Transcribe audio from a URL.                         |
| `venice_voice_clone` | List built-in voices or clone a voice from a sample. |
| `venice_audio_quote` | Get a price quote for music generation.              |

### Music

| Tool                    | Description                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `venice_music_generate` | Queue music generation (`ace-step-15`, `elevenlabs-music`, `minimax-music-v2/v25/v26`, `stable-audio-25`, `mmaudio-v2`, `elevenlabs-sound-effects-v2`). |
| `venice_music_status`   | Check status of a queued music job.                                                                                                                     |
| `venice_music_complete` | Mark a completed music job as downloaded.                                                                                                               |

### Web augment, catalog, and crypto

| Tool                     | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `venice_web_search`      | Search the web (Firecrawl-backed).                                      |
| `venice_web_scrape`      | Scrape one URL into markdown.                                           |
| `venice_text_parser`     | Extract text from PDF/DOCX/EPUB/PPTX/XLSX.                              |
| `venice_list_models`     | List the live model catalog with prices.                                |
| `venice_list_characters` | List public Venice characters.                                          |
| `venice_crypto_rpc`      | Proxy JSON-RPC calls to Base, Ethereum, Polygon, Arbitrum, or Optimism. |

### x402 wallet helpers

Only relevant if you authenticate with a wallet via [x402](/guides/integrations/x402-venice-api) instead of an API key.

| Tool                       | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `venice_x402_balance`      | Check prepaid x402 credit balance for an EVM or Solana wallet address.              |
| `venice_x402_top_up_info`  | Fetch top-up requirements (network, USDC token, receiver, min amount).              |
| `venice_x402_transactions` | List recent x402 top-up and debit transactions for an EVM or Solana wallet address. |

## Configuration

The server is configured entirely through environment variables.

| Env var                      | Default                   | Notes                                                              |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `VENICE_API_KEY`             | *(none)*                  | Your Venice API key. The simplest setup.                           |
| `VENICE_DEFAULT_CHAT_MODEL`  | `venice-uncensored`       |                                                                    |
| `VENICE_DEFAULT_IMAGE_MODEL` | `flux-2-pro`              |                                                                    |
| `VENICE_DEFAULT_TTS_MODEL`   | `tts-kokoro`              |                                                                    |
| `VENICE_DEFAULT_ASR_MODEL`   | `openai/whisper-large-v3` |                                                                    |
| `VENICE_DISABLE_NSFW`        | `0`                       | Set to `1` to remove NSFW capability notes from tool descriptions. |
| `VENICE_HTTP_TIMEOUT_MS`     | `60000`                   |                                                                    |
| `VENICE_SIWX_TOKEN`          | *(none)*                  | x402 wallet-mode auth token. See [x402 below](#x402-wallet-mode).  |

If both `VENICE_API_KEY` and `VENICE_SIWX_TOKEN` are set, the API key wins.

## x402 wallet mode

Venice supports authenticating with a [Sign-In-With-X wallet token](/guides/integrations/x402-venice-api) backed by prepaid USDC credit on Base or Solana, in addition to the normal API key flow. No email, phone, or KYC required: your wallet is the only identity.

```json theme={"system"}
{
  "mcpServers": {
    "venice": {
      "command": "npx",
      "args": ["-y", "@veniceai/mcp-server@0.2.0"],
      "env": { "VENICE_SIWX_TOKEN": "<base64 Sign-In-With-X payload>" }
    }
  }
}
```

The MCP server forwards `VENICE_SIWX_TOKEN` as the `X-Sign-In-With-X` header on every Venice API call. The server never sees your private key. Wallet signing and USDC top-up authorizations happen in your own wallet.

| Flow                     | What happens                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One-time setup**       | Sign a Sign-In-With-X message in your wallet → produces a SIWX token (base64 JSON).                                                                                           |
| **Top up**               | `POST /api/v1/x402/top-up` returns 402 + payment requirements. Sign a USDC payment for one of the returned Base or Solana options, resubmit, and Venice credits your balance. |
| **Every inference call** | MCP server sends `X-Sign-In-With-X: <SIWX>`; Venice debits your prepaid balance.                                                                                              |

Minimum top-up is **\$5 USD**. Minimum balance to call inference is **\$0.10**. Once topped up, calls are sub-100ms because settlement happens off-chain on a fast credit account.

<Tip>
  Wallets linked to a Venice account with DIEM staked consume from the staking balance instead of USDC credits, so no top-up is needed.
</Tip>

## Self-hosting (Streamable HTTP)

For team or workspace deployments, run the MCP server over HTTP instead of stdio:

```bash theme={"system"}
docker run -p 3333:3333 \
  -e VENICE_API_KEY=<your-venice-api-key> \
  -e VENICE_MCP_AUTH_TOKEN=<choose-a-long-random-token> \
  ghcr.io/veniceai/venice-mcp-server:latest
```

The server is now available at `http://localhost:3333/mcp`. HTTP clients must send `Authorization: Bearer <VENICE_MCP_AUTH_TOKEN>`.

<Warning>
  `/mcp` is a credential-backed tool execution endpoint: callers can spend the configured Venice API key or x402 balance. When HTTP mode binds outside loopback, startup fails unless `VENICE_MCP_AUTH_TOKEN` is set. For production, pin the npm package version explicitly instead of relying on `latest`.
</Warning>

## Resources

<CardGroup>
  <Card title="GitHub" icon="github" href="https://github.com/veniceai/venice-mcp-server">
    Source code, issues, and releases
  </Card>

  <Card title="npm" icon="npm" href="https://www.npmjs.com/package/@veniceai/mcp-server">
    `@veniceai/mcp-server`
  </Card>

  <Card title="Venice Skills" icon="book" href="/guides/integrations/venice-skills">
    Companion skills that teach agents how to use these tools
  </Card>

  <Card title="MCP Spec" icon="arrow-up-right-from-square" href="https://modelcontextprotocol.io/">
    Learn more about the Model Context Protocol
  </Card>
</CardGroup>


# Venice Skills
Source: https://docs.venice.ai/guides/integrations/venice-skills

Official Agent Skills for the Venice API that load Venice knowledge into Claude Code, Cursor, Codex, OpenCode, Hermes, and Cline

[Venice Skills](https://github.com/veniceai/skills) is the canonical collection of [Agent Skills](https://www.anthropic.com/news/agent-skills) for the Venice API. Each skill is a self-contained folder with a `SKILL.md` that an LLM agent loads on demand to work correctly against a specific surface area of the API.

<Card title="GitHub: veniceai/skills" icon="github" href="https://github.com/veniceai/skills">
  19 skills covering the full Venice API. MIT licensed. Kept in sync with the public [`swagger.yaml`](/api-reference/api-spec).
</Card>

<CardGroup>
  <Card title="19 Skills" icon="layer-group">
    One per Venice API surface area
  </Card>

  <Card title="Runtime-agnostic" icon="plug">
    Works with Claude Code, Cursor, Codex, OpenCode, Hermes, Cline, and any other Agent Skills host
  </Card>

  <Card title="Spec-synced" icon="rotate">
    Derived from Venice's OpenAPI spec, with CI checks for drift
  </Card>
</CardGroup>

## Why skills?

Without skills, your agent has to discover Venice's quirks the hard way: `venice_parameters`, model-type enums, 402 payment-required flows, video queue/retrieve lifecycle, character slugs, and so on. Skills bundle that knowledge into focused, on-demand files so the agent only loads what it needs for the current task.

Each `SKILL.md` includes:

* The endpoint(s) it covers
* Required headers, parameters, and response shapes
* A curl example plus a minimal SDK example
* A "gotchas" section with the things real integrators trip over

## Skill catalog

| Skill                        | Covers                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `venice-api-overview`        | Base URL, auth modes, response headers, pricing model, versioning                       |
| `venice-auth`                | Bearer API keys + Sign-In-With-X / x402 wallet authentication                           |
| `venice-chat`                | `/chat/completions` with `venice_parameters`, multimodal, tools, reasoning, streaming   |
| `venice-responses`           | `/responses`, the OpenAI-compatible Responses API (Alpha)                               |
| `venice-embeddings`          | `/embeddings` models, encoding formats, dimensions                                      |
| `venice-image-generate`      | `/image/generate`, `/images/generations`, `/image/styles`                               |
| `venice-image-edit`          | `/image/edit`, `/image/multi-edit`, `/image/upscale`, `/image/background-remove`        |
| `venice-audio-speech`        | `/audio/speech` TTS models, voices, formats, streaming                                  |
| `venice-audio-music`         | `/audio/quote`, `/audio/queue`, `/audio/retrieve`, `/audio/complete`                    |
| `venice-audio-transcription` | `/audio/transcriptions` with Whisper, Parakeet, Scribe, Wizper, xAI STT                 |
| `venice-video`               | `/video/*` generation + transcription                                                   |
| `venice-models`              | `/models`, `/models/traits`, `/models/compatibility_mapping`                            |
| `venice-characters`          | `/characters*` + `venice_parameters.character_slug`                                     |
| `venice-api-keys`            | CRUD `/api_keys`, rate limits, Web3 key generation                                      |
| `venice-billing`             | `/billing/balance`, `/billing/usage`, `/billing/usage-analytics`                        |
| `venice-x402`                | `/x402/*` wallet credits, USDC on Base or Solana                                        |
| `venice-crypto-rpc`          | `/crypto/rpc/*` JSON-RPC proxy with 1×/2×/4× pricing                                    |
| `venice-augment`             | `/augment/text-parser`, `/augment/scrape`, `/augment/search`                            |
| `venice-errors`              | Error shapes, 402 payment required, 422 content policy, 429 rate limits, retry strategy |

## Install

Each skill is just a folder with a `SKILL.md` that starts with YAML frontmatter:

```yaml theme={"system"}
---
name: venice-chat
description: When the agent should load this skill and what's in it
---
```

Drop the `skills/` folder (or any subset) into whichever path your runtime watches.

<Tabs>
  <Tab title="Claude Code">
    Project-local:

    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git
    cp -r skills/skills/* .claude/skills/
    ```

    Or global, for every project on your machine:

    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git ~/src/venice-skills
    ln -s ~/src/venice-skills/skills ~/.claude/skills/venice
    ```
  </Tab>

  <Tab title="Cursor">
    Project-local:

    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git .cursor/skills-venice
    ```

    Or copy individual skills:

    ```bash theme={"system"}
    cp -r skills/venice-chat .cursor/skills/
    ```
  </Tab>

  <Tab title="Codex">
    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git ~/src/venice-skills
    ln -s ~/src/venice-skills/skills ~/.codex/skills/venice
    ```

    For project-local installs, target `.codex/skills/` instead.
  </Tab>

  <Tab title="OpenCode">
    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git ~/src/venice-skills
    ln -s ~/src/venice-skills/skills ~/.config/opencode/skills/venice
    ```

    OpenCode also reads `.opencode/skills/`, `.claude/skills/`, and `.agents/skills/` from the project root.
  </Tab>

  <Tab title="Hermes Agent">
    Hermes has a built-in installer for Venice skills:

    ```bash theme={"system"}
    hermes skills install veniceai/skills
    ```

    Or symlink directly:

    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git ~/src/venice-skills
    ln -s ~/src/venice-skills/skills ~/.hermes/skills/venice
    ```
  </Tab>

  <Tab title="Cline">
    ```bash theme={"system"}
    git clone https://github.com/veniceai/skills.git .clinerules/skills-venice
    ```
  </Tab>
</Tabs>

### Path reference

| Runtime        | Project-local                                                   | Global                                        |
| -------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Claude Code    | `.claude/skills/`                                               | `~/.claude/skills/`                           |
| Codex          | `.codex/skills/`                                                | `~/.codex/skills/` (or `$CODEX_HOME/skills/`) |
| OpenCode       | `.opencode/skills/` (also `.claude/skills/`, `.agents/skills/`) | `~/.config/opencode/skills/`                  |
| Hermes Agent   | `$HERMES_OPTIONAL_SKILLS_DIR`                                   | `~/.hermes/skills/`                           |
| Cursor         | `.cursor/skills/`                                               | `~/.cursor/skills/`                           |
| Cline          | `.clinerules/skills/`                                           | n/a                                           |
| Other runtimes | `.agents/skills/` (convention)                                  | `~/.agents/skills/`                           |

<Tip>
  Runtimes that define extra frontmatter fields (`version`, `platforms`, `metadata.*`, `compatibility`, …) are required by spec to ignore unknown fields, so the same skill file works everywhere without forks.
</Tip>

### As a git submodule

If you want pinned versions in your own repo:

```bash theme={"system"}
git submodule add https://github.com/veniceai/skills.git vendor/venice-skills
```

Then symlink or copy the subsets you want into your agent's skill path.

## How agents load them

The agent discovers each `SKILL.md` by its frontmatter `name` and `description`. When the user asks something that matches a skill's purpose, the agent loads that one file into context (not the whole catalog), so the prompt stays small and the answer stays accurate.

For example, an agent that needs to generate music will load `venice-audio-music` and immediately know:

* That music goes through the queue/retrieve/complete lifecycle, not a synchronous endpoint
* Which models are available and their per-minute pricing
* How to call `/audio/quote` for cost estimation first
* What the polling backoff should look like

Without the skill, the agent might try to call `/audio/speech` for music and get a useless response.

## Authoring a new skill

1. Copy `template/` to `skills/<your-skill>/`.
2. Fill in the frontmatter and body. Keep `description` concrete, since it's what an agent uses to decide when to load the skill.
3. Link related skills at the bottom for cross-navigation.
4. Open a PR against [`veniceai/skills`](https://github.com/veniceai/skills).

See the repository's `CONTRIBUTING.md` for style conventions (short first paragraph, explicit endpoint tables, curl + one SDK example, "gotchas" section, ≤ 500 lines).

## Resources

<CardGroup>
  <Card title="GitHub" icon="github" href="https://github.com/veniceai/skills">
    Source code, contributing guide, and skill template
  </Card>

  <Card title="Venice MCP Server" icon="plug" href="/guides/integrations/venice-mcp">
    Pair skills with the official MCP server for runtime tool access
  </Card>

  <Card title="Agent Skills Spec" icon="arrow-up-right-from-square" href="https://www.anthropic.com/news/agent-skills">
    Learn the underlying format
  </Card>

  <Card title="Venice API Spec" icon="book" href="/api-reference/api-spec">
    The OpenAPI source of truth these skills are derived from
  </Card>
</CardGroup>


# Venice Video Harness
Source: https://docs.venice.ai/guides/integrations/venice-video-harness

Agent-first, Venice-optimized harness for consistency-first AI video creation

The [Venice Video Harness](https://github.com/jordanurbs/venice-video-harness) is a community, agent-first, Venice-optimized toolkit for **consistency-first video creation at any length**. It turns an IDE agent (Claude Code, Cursor, Codex, etc.) into an operator of a reusable Venice production system covering 50+ Venice video, image, audio, and music models.

<Card title="GitHub: venice-video-harness" icon="github" href="https://github.com/jordanurbs/venice-video-harness">
  MIT licensed. Community-maintained.
</Card>

<CardGroup>
  <Card title="Character-consistent video" icon="users">
    Lock characters, voices, and aesthetics across an entire series
  </Card>

  <Card title="Storyboard-to-video" icon="film">
    Two-pass panel generation with Venice multi-edit refinement
  </Card>

  <Card title="Text-first editing" icon="scissors">
    Transcribe locally with whisper.cpp, cut from a 12KB pack, self-eval at every boundary
  </Card>
</CardGroup>

## What this is

Most Venice integrations are thin wrappers around API calls. The Venice Video Harness is the **higher-level layer** that sits between your agent and the Venice API:

* **Orchestration rules** in `CLAUDE.md`
* **Reusable playbooks** in `.claude/commands/` (19 workflow commands)
* **Specialized agents** in `.claude/agents/` (art-director, prompt-engineer, cut-qa, and more)
* **Venice production skills** in `.claude/skills/` (compatible with the [Agent Skills](/guides/integrations/venice-skills) format)
* **TypeScript execution layer** in `src/`
* **Comprehensive model registry** covering 50+ Venice video, image, audio, and music models

Built for creators producing:

* Character-consistent video projects (any genre, any length)
* Visual-style-locked series or campaigns
* Storyboard-to-video workflows
* Short-form and long-form narrative content
* Branded cinematic sequences, trailers, and teasers
* Recurring-character social series

## Getting started

### Requirements

<CardGroup>
  <Card title="Node.js 20+" icon="node-js" href="https://nodejs.org/">
    Latest LTS recommended
  </Card>

  <Card title="ffmpeg + ffprobe" icon="terminal" href="https://ffmpeg.org/">
    On your PATH
  </Card>

  <Card title="Venice API key" icon="key" href="/guides/getting-started/generating-api-key">
    From [venice.ai/settings/api](https://venice.ai/settings/api)
  </Card>
</CardGroup>

Optional, for the editing pipeline: install `whisper-cpp` for local transcription.

```bash theme={"system"}
brew install whisper-cpp
mkdir -p ~/.cache/whisper.cpp
curl -L -o ~/.cache/whisper.cpp/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

### Setup

<Steps>
  <Step title="Clone the harness">
    ```bash theme={"system"}
    git clone https://github.com/jordanurbs/venice-video-harness.git
    cd venice-video-harness
    ```
  </Step>

  <Step title="Configure your API key">
    ```bash theme={"system"}
    cp .env.example .env
    # Add VENICE_API_KEY to .env
    ```
  </Step>

  <Step title="Install and build">
    ```bash theme={"system"}
    npm install
    npm run build
    ```
  </Step>

  <Step title="Open in your agent">
    Open the project in Cursor, Claude Code, or any IDE with agentic chat. The agent reads `CLAUDE.md` and the playbooks automatically.

    Try one of these first messages:

    * "Set up this Venice video harness for first use"
    * "Create a new character-consistent video series"
    * "Generate a 30-second branded video sequence"
    * "Build a multi-episode narrative with locked characters"
    * "Create a product launch trailer with consistent visual style"
  </Step>
</Steps>

## What's Venice-optimized about it

* **Image prompts tuned for Venice image models** like `seedream-v5-lite`, `nano-banana-pro`, `flux-2-pro/max`, and more
* **Two-pass panel generation** with Venice multi-edit refinement for character correction
* **Model-routing logic** for action, atmosphere, and character-consistency tiers
* **Reference-aware video generation** that uses `elements`, `reference_image_urls`, and `scene_image_urls` correctly per model
* **Environment-aware prompt adaptation** for daytime vs night scene handling
* **Venice-native audio paths** for TTS (Kokoro, Qwen3, ElevenLabs), SFX, and music
* **Cost estimation** before generation via `/video/quote` and `/audio/quote`
* **Model-aware parameter building** that auto-skips parameters the target model doesn't support

## Model routing defaults

The harness defaults are opinionated because consistency is the point. The current routing (April 2026):

**Seedance 2.0 R2V by default. Kling O3 R2V fallback for 3+ character scenes. Seedance 2.0 i2v for establishing shots.**

| Role                             | Default model                          | When used                                                                                   |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Character shots (1-2 characters) | `seedance-2-0-reference-to-video`      | Default R2V with flat `reference_image_urls`, `@Image` tags, up to 15s, native stereo audio |
| Character shots (3+ characters)  | `kling-o3-standard-reference-to-video` | Auto-fallback with structured `elements` for multi-character identity                       |
| Establishing / mood / action     | `seedance-2-0-image-to-video`          | No characters; epic cinematic quality, up to 15s                                            |

These are overridable per-project via `series.json → videoDefaults`. To target a non-Seedance family (e.g. accounts that lack Seedance access), set `videoDefaults` to `kling-o3-standard-reference-to-video` and `veo3.1-fast-image-to-video`.

<Note>
  **Seedance face rule:** Seedance 2.0 blocks face-bearing input images that weren't produced by `seedream-v5-lite` or `seedream-v5-lite-edit`. The harness handles this automatically by routing character-bearing image work through Seedream and running a pre-flight gate before every Seedance call.
</Note>

## Supported Venice models

### Video (April 2026)

| Family                    | i2v                        | t2v                   | Max duration | Audio                           | Notes                                                       |
| ------------------------- | -------------------------- | --------------------- | ------------ | ------------------------------- | ----------------------------------------------------------- |
| **Seedance 2.0**          | i2v, R2V                   | t2v                   | 15s          | Yes (stereo, lip-sync 8+ langs) | #1 ranked. R2V: flat `reference_image_urls`, `@Image` tags. |
| **Kling V3**              | Pro, Standard              | Pro, Standard         | 15s          | Yes                             | `end_image_url` for frame targeting                         |
| **Kling O3**              | Pro, Std, Pro R2V, Std R2V | Pro, Standard         | 15s          | Yes                             | R2V: `elements`, `reference_image_urls`, `scene_image_urls` |
| **Kling 2.6 / 2.5 Turbo** | Pro                        | Pro                   | 10s          | 2.6: Yes / 2.5: No              | `end_image_url`                                             |
| **Veo 3.1**               | Fast, Full                 | Fast, Full            | 8s           | Yes                             | Up to 4K resolution                                         |
| **Sora 2**                | Standard, Pro              | Standard, Pro         | 12s          | Yes                             | Up to 1080p                                                 |
| **Wan 2.6 / 2.5**         | Std, Flash / Yes           | Std / Yes             | 15s / 10s    | Yes                             | `audio_url` input                                           |
| **LTX Video 2.0**         | Fast, Full, v2.3, 19B      | Fast, Full, v2.3, 19B | 20s          | Yes                             | Up to 4K, longest synced                                    |
| **Longcat**               | Std, Distilled             | Std, Distilled        | **30s**      | No                              | Longest single-shot                                         |
| **Vidu Q3**               | Yes                        | Yes                   | 16s          | Yes                             | `reference_image_urls`                                      |
| **PixVerse v5.6**         | Std, Transition            | Standard              | 8s           | Yes                             | Transition: `end_image_url`                                 |
| **Grok Imagine**          | Yes                        | Yes                   | 15s          | Yes                             | Wide aspect ratio support                                   |

### Image, audio, and music

* **Image (22+ models):** `nano-banana-pro/2`, `gpt-image-2`, `flux-2-pro/max`, `grok-imagine`, `qwen-image-2-pro`, `recraft-v4-pro`, `seedream-v4` / `v5-lite`, `lustify-sdxl/v7`, `wai-Illustrious`, and more
* **Multi-edit:** `qwen-edit`, `flux-2-max-edit`, `nano-banana-pro-edit`, `seedream-v5-lite-edit`, `gpt-image-2-edit`, and more
* **TTS:** `tts-kokoro` (50+ voices), `tts-qwen3-0-6b/1-7b`, `elevenlabs-tts-v3`, `elevenlabs-tts-multilingual-v2`
* **Music:** `elevenlabs-music`, `minimax-music-v2`, `ace-step-15`, `stable-audio-25`
* **SFX:** `elevenlabs-sound-effects-v2`, `mmaudio-v2-text-to-audio`

## Production pipelines

### Generation pipeline

End-to-end narrative video (script → storyboard → video → audio → assembly):

```bash theme={"system"}
npm run dev -- produce-episode -p output/my-series -e 1
```

Reference implementation in `src/mini-drama/` covers:

* Series / character / episode management
* LLM-powered script workshopping
* Two-pass storyboard generation (generate + multi-edit refine)
* Vision-based panel QA
* Video generation with frame chaining
* Layered audio post-production
* Subtitle burn-in and final assembly

### Editing pipeline

Cut already-existing media (Venice-generated shots or real raw footage). **Text-first**: the LLM reads a compact `takes_packed.md` (\~12KB per 40 min of audio) rather than frame-dumping video.

The five steps:

<Steps>
  <Step title="Transcribe">
    Local whisper.cpp produces per-source `*.words.json` + `takes_packed.md`.
  </Step>

  <Step title="Read the pack">
    The LLM forms a cut strategy from text alone.
  </Step>

  <Step title="Confirm">
    Proposes the strategy and waits for "yes / revise / cancel".
  </Step>

  <Step title="Render the EDL">
    JSON cut list → ffmpeg concat with 30ms audio fades. Archive-first, so originals are never overwritten.
  </Step>

  <Step title="Self-eval">
    The `cut-qa` agent runs 6 programmatic checks at every cut boundary; max 3 fix iterations.
  </Step>
</Steps>

The `cut-qa` checks catch aspect-ratio regressions, frame-hash jumps inside a word, VO truncation, lighting discontinuity, audio peaks above -6 dBFS, and caption overlap with in-frame text.

<Tip>
  The editing pipeline is inspired by [browser-use/video-use](https://github.com/browser-use/video-use). Their core insight, *"the LLM never watches the video, it reads it"*, is what makes agent-driven editing work without drowning in frame-dump tokens.
</Tip>

## Commands, agents, and skills

The harness exposes 19 workflow commands, 10 specialized agents, and 7 production skills. Highlights:

| Workflow command                   | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `new-series`                       | Create a new series with locked aesthetics     |
| `add-character` / `lock-character` | Character + voice locking                      |
| `workshop-episode`                 | Collaborative episode scripting                |
| `storyboard-episode`               | Storyboard one episode                         |
| `produce-episode`                  | Full pipeline in one command                   |
| `generate-trailer`                 | Full trailer pipeline                          |
| `edit-footage`                     | Text-first editing pipeline for existing media |
| `ingest-screenplay`                | Ingest a Fountain or PDF screenplay            |

| Specialized agent  | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `art-director`     | Aesthetic, palette, lighting, composition decisions           |
| `prompt-engineer`  | Venice image prompts, character consistency                   |
| `storyboard-qa`    | Panel QA for continuity and character checks                  |
| `cut-qa`           | Post-render quality gate (6 checks per cut, max 3 iterations) |
| `overlay-designer` | Branded motion graphics, parallel sub-agents                  |
| `trailer-curator`  | Trailer shot selection and anti-spoiler rules                 |

| Production skill             | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `venice-api`                 | Venice REST API usage and defaults                     |
| `venice-video-model-routing` | R2V-first routing, decision trees                      |
| `character-consistency`      | Multi-shot character consistency guidance              |
| `shot-composition`           | Shot composition and camera guidance                   |
| `screenplay-parsing`         | Screenplay parsing workflows                           |
| `video-editing`              | Text-first editing philosophy, EDL format, cut-qa loop |

## NLE round-trip

After rendering, export the assembled timeline as XML for fine-tuning in your editor of choice. Every video segment, dialogue clip, SFX clip, and music cue lands on its own track.

```bash theme={"system"}
mini-drama export-timeline -p output/<project> -e 1 --format fcpxml      # Final Cut Pro X
mini-drama export-timeline -p output/<project> -e 1 --format premiere    # Premiere Pro
mini-drama export-timeline -p output/<project> -e 1 --format davinci     # DaVinci Resolve
```

## Programmatic usage

You can also call into the harness's modules directly from your own TypeScript:

```typescript theme={"system"}
import { VeniceClient } from './src/venice/client.js';
import { generateVideo, quoteVideo } from './src/venice/video.js';
import { listVideoModels } from './src/venice/models.js';

const client = new VeniceClient();

const quote = await quoteVideo(client, {
  model: 'kling-v3-pro-image-to-video',
  duration: '8s',
  audio: true,
});
console.log(`Estimated cost: $${quote.quote}`);

const result = await generateVideo(client, {
  model: 'kling-v3-pro-image-to-video',
  prompt: 'A slow dolly shot pushes forward...',
  duration: '8s',
  imageUrl: 'data:image/png;base64,...',
  audio: true,
  outputPath: 'output/shot-001.mp4',
});

const longModels = listVideoModels({ minDurationSec: 20 });
```

## Resources

<CardGroup>
  <Card title="GitHub" icon="github" href="https://github.com/jordanurbs/venice-video-harness">
    Source code, issues, and releases
  </Card>

  <Card title="Venice Video Generation" icon="film" href="/guides/media/video-generation">
    The underlying API the harness drives
  </Card>

  <Card title="Reference-to-Video" icon="image" href="/guides/media/reference-to-video">
    R2V guide for character consistency
  </Card>

  <Card title="Seedance 2.0" icon="bolt" href="/guides/media/seedance-2-0">
    The harness's default video family
  </Card>
</CardGroup>

<Note>
  Community-maintained and provided as-is. For harness-specific issues, file them on the [project's GitHub repo](https://github.com/jordanurbs/venice-video-harness/issues).
</Note>


# Vercel AI SDK
Source: https://docs.venice.ai/guides/integrations/vercel-ai-sdk

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


# X402
Source: https://docs.venice.ai/guides/integrations/x402-venice-api

Access Venice without an API key using wallet authentication.

X402 lets you use Venice's paid API routes by authenticating with a wallet and maintaining a prepaid USDC balance. No API key or account required. Sign a message, top up on Base or Solana, and call any supported route.

<CardGroup>
  <Card title="Wallet Auth" icon="wallet">
    Authenticate with a signed Sign-In-With-X payload in the `X-Sign-In-With-X` header.
  </Card>

  <Card title="Pay with USDC" icon="coins">
    Maintain spendable balance with USDC on Base or Solana.
  </Card>

  <Card title="DIEM First" icon="sparkles">
    If the wallet is linked to a Venice account with DIEM balance, that is spent first.
  </Card>
</CardGroup>

## What is X402?

[X402](https://www.x402.org/) is an open payment standard that lets applications and agents pay for services programmatically using cryptocurrency. Venice implements X402 so that wallets can authenticate and pay for inference directly with USDC on Base or Solana.

## Prerequisites

* A wallet on Base or Solana
* Native token for gas on the selected chain, such as ETH on Base or SOL on Solana
* USDC on the selected chain (or existing DIEM-backed balance from a linked Venice account)

<Tip>
  Consider using a dedicated wallet for automation rather than your main treasury wallet.
</Tip>

## Quick start

The [`venice-x402-client`](https://github.com/veniceai/x402-client) SDK provides helpers for wallet auth, top-ups, and balance tracking.

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

Venice expects a Base64-encoded JSON payload containing a signed Sign-In-With-X message. EVM wallets sign an EIP-4361 SIWE message on Base. Solana wallets sign the Solana SIWX message with Ed25519. Generate a fresh nonce and timestamp for each request flow.

For Solana, set `chainId` to `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, include `type: "ed25519"` in the encoded JSON payload, and provide the Ed25519 signature as base58 or base64. The signed message starts with `<domain> wants you to sign in with your Solana account:`, followed by the wallet address and the standard `URI`, `Version`, `Chain ID`, `Nonce`, `Issued At`, and optional `Expiration Time` fields.

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
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS_OR_SOLANA_ADDRESS
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

The `walletAddress` path parameter accepts either an EVM address (`0x...`) or a Solana base58 address.

### Step 3: Top up

Top up with USDC on Base or Solana:

```bash theme={"system"}
curl --request POST \
  --url https://api.venice.ai/api/v1/x402/top-up
```

The first call returns `402 Payment Required` with a `PAYMENT-REQUIRED` header containing an `accepts` array. Each entry describes one accepted payment option, including `network`, `asset`, `payTo`, and `amount`. Choose the Base or Solana option you want to pay with, use those exact details to build an `X-402-Payment` header, and retry the same route.

#### Building the X-402-Payment header for Base

The following script creates a signed x402 payment on Base and sends the top-up request. Requires the `x402` and `viem` npm packages.

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
  Use the latest `PAYMENT-REQUIRED` / `accepts` response as the source of truth in production instead of hardcoding these values. For Solana top-ups, build the payment from the Solana entry returned in `accepts`. Solana entries use `network: "solana"`, the USDC mint as `asset`, and may include network-specific metadata such as `extra.feePayer`.
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
export WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS_OR_SOLANA_ADDRESS
export X402_AUTH=YOUR_BASE64_SIWX_HEADER

curl --request GET \
  --url "https://api.venice.ai/api/v1/x402/transactions/$WALLET_ADDRESS?limit=10&offset=0" \
  --header "X-Sign-In-With-X: $X402_AUTH"
```

The ledger includes entries such as `TOP_UP`, `CHARGE`, and `REFUND`.

The `walletAddress` path parameter accepts either an EVM address (`0x...`) or a Solana base58 address.

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

| Endpoint                   | Auth                                          | Purpose                                                                                            |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/v1/x402/top-up` | Initial request: none. Retry: `X-402-Payment` | Add USDC credits to the wallet's spendable balance using an accepted Base or Solana payment option |

### Wallet-only routes

These routes use `X-Sign-In-With-X` for identity but do not charge balance.

| Endpoint                                        | Purpose                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/x402/balance/{walletAddress}`      | Check spendable balance for an EVM or Solana wallet address  |
| `GET /api/v1/x402/transactions/{walletAddress}` | View transaction history for an EVM or Solana wallet address |

***

## Errors

| Status                           | Likely cause                                   | What to do                                                                 |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `401`                            | Malformed or expired Sign-In-With-X payload    | Rebuild `X-Sign-In-With-X` with a fresh nonce and timestamp                |
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


# Image Editing
Source: https://docs.venice.ai/guides/media/image-editing

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

* Use [Image Generation](/guides/media/image-generation) when you're starting from text instead of an existing image.
* Use [Image Models](/models/image) to compare generation, edit, and enhancement model families.
* Use [Image Edit API](/api-reference/endpoint/image/edit), [Multi-Edit API](/api-reference/endpoint/image/multi-edit), and [Background Remove API](/api-reference/endpoint/image/background-remove) for full schema details.


# Image Generation
Source: https://docs.venice.ai/guides/media/image-generation

Generate images from text prompts using Venice's native image API or the OpenAI-compatible images endpoint

Image generation on Venice is synchronous. Send a prompt to `/image/generate` and receive your image in the same response, either as base64 inside JSON or as raw binary when `return_binary` is `true`.

## Endpoints

| Endpoint                   | Purpose                                | When to use                                           |
| -------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `POST /image/generate`     | Native Venice image generation API     | Use this for full feature support                     |
| `GET /image/styles`        | List available style presets           | Use this before sending `style_preset`                |
| `POST /images/generations` | OpenAI-compatible image generation API | Use this when migrating existing OpenAI image clients |

## Step 1: Send a generation request

Sizing is model-specific. Some models accept explicit `width` and `height`; some expose `aspect_ratio`; and resolution-tier models expose `aspect_ratio` plus `resolution` values such as `1K`, `2K`, or `4K`.

**Pixel-based sizing example:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/image/generate
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "venice-sd35",
  "prompt": "A cinematic photo of a gondola passing through a narrow Venice canal at blue hour, warm window lights reflecting on the water",
  "negative_prompt": "blurry, low quality, distorted anatomy, text, watermark",
  "width": 1024,
  "height": 1024,
  "format": "webp"
}
```

**Aspect-ratio sizing example:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/image/generate
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "qwen-image-2",
  "prompt": "A cinematic photo of a gondola passing through a narrow Venice canal at blue hour",
  "aspect_ratio": "16:9",
  "format": "webp"
}
```

**Resolution-tier sizing example:**

```bash theme={"system"}
POST https://api.venice.ai/api/v1/image/generate
Authorization: Bearer $VENICE_API_KEY
Content-Type: application/json

{
  "model": "gpt-image-2",
  "prompt": "A cinematic wide shot of a gondola passing through a narrow Venice canal at blue hour",
  "aspect_ratio": "16:9",
  "resolution": "4K",
  "format": "png"
}
```

The same pattern applies to other resolution-tier models:

```json theme={"system"}
{
  "model": "nano-banana-pro",
  "prompt": "A serene canal in Venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "2K"
}
```

Use [Image Models](/models/image) or the [Models API](/api-reference/endpoint/models/list) to confirm which sizing fields each model accepts.

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
          "model": "venice-sd35",
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
      model: "venice-sd35",
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

| Parameter           | Type    | Required    | Default         | Description                                                                                                                   |
| ------------------- | ------- | ----------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `model`             | string  | Yes         | -               | Model ID to use for generation                                                                                                |
| `prompt`            | string  | Yes         | -               | What to generate                                                                                                              |
| `negative_prompt`   | string  | No          | -               | What to avoid in the image                                                                                                    |
| `width`             | integer | No          | `1024`          | Output width in pixels for pixel-based models such as `venice-sd35` and `qwen-image`                                          |
| `height`            | integer | No          | `1024`          | Output height in pixels for pixel-based models such as `venice-sd35` and `qwen-image`                                         |
| `format`            | string  | No          | `webp`          | Output format: `jpeg`, `png`, or `webp`                                                                                       |
| `variants`          | integer | No          | `1`             | Number of images to generate (`1`-`4`), only when `return_binary` is `false`                                                  |
| `return_binary`     | boolean | No          | `false`         | Return raw image bytes instead of base64 JSON                                                                                 |
| `safe_mode`         | boolean | No          | `true`          | Blur adult content when enabled                                                                                               |
| `seed`              | integer | No          | random          | Reuse the same seed for more consistent iterations                                                                            |
| `cfg_scale`         | number  | No          | model-dependent | Higher values push the model to follow the prompt more closely                                                                |
| `style_preset`      | string  | No          | -               | Apply a preset style from [Image Styles](/api-reference/endpoint/image/styles)                                                |
| `aspect_ratio`      | string  | Conditional | -               | Used by models that support ratio-based sizing, such as `qwen-image-2`, `gpt-image-2`, `nano-banana-2`, and `nano-banana-pro` |
| `resolution`        | string  | Conditional | -               | Used by models that support resolution tiers such as `1K`, `2K`, or `4K`                                                      |
| `enable_web_search` | boolean | Conditional | `false`         | Allows supported models to use current web information; adds extra cost                                                       |

Validation is model-specific. Check [Image Models](/models/image) and the [Models API](/api-reference/endpoint/models/list) before relying on a parameter across multiple models.

***

## Model-specific options

### High-resolution generation

Some image models support `aspect_ratio` without a selectable `resolution` tier. For example, `qwen-image-2` accepts aspect ratio and maps it to model-specific output dimensions:

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "Editorial product photo of a luxury watch on black marble, dramatic studio lighting",
  "aspect_ratio": "16:9"
}
```

Other image models support `aspect_ratio` plus a `resolution` tier. For example, `gpt-image-2`, `nano-banana-2`, and `nano-banana-pro` support `1K`, `2K`, and `4K`:

```json theme={"system"}
{
  "model": "gpt-image-2",
  "prompt": "Editorial product photo of a luxury watch on black marble, dramatic studio lighting",
  "aspect_ratio": "16:9",
  "resolution": "4K"
}
```

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
4. Keep sizing model-aware. Some models use `width`/`height`, some use `aspect_ratio`, and resolution-tier models use `aspect_ratio` plus `resolution`.
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


# Reference to Video
Source: https://docs.venice.ai/guides/media/reference-to-video

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


# Seedance 2.0
Source: https://docs.venice.ai/guides/media/seedance-2-0

Seedance 2.0 — Venice's flagship multimodal video model. Text / image / reference-to-video on one endpoint, with four workflows (Reference, Edit, Extend, Stitch) inferred from prompt shape.

Seedance 2.0 is a flagship multimodal video model exposed on Venice as a family of three variants for text-, image-, and reference-driven video generation. The **reference-to-video** variant is unusually powerful: a single endpoint and a single model ID handle **four distinct workflows** (Reference, Edit, Extend, Stitch) — the workflow is inferred from the **shape of your prompt**.

This guide walks through the variants, the four workflows with their canonical prompts, the multimodal input limits, pricing, and complete `curl` examples.

## Variants

| Model ID                               | Variant  | Output resolutions  | Notes                                                                                                               |
| -------------------------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `seedance-2-0-text-to-video`           | T2V      | 480p / 720p / 1080p | Text prompt only                                                                                                    |
| `seedance-2-0-image-to-video`          | I2V      | 480p / 720p / 1080p | First-frame (and optionally last-frame) image grounding                                                             |
| `seedance-2-0-reference-to-video`      | R2V      | 480p / 720p / 1080p | Up to 9 reference images + 3 reference videos + 3 reference audio donors. Powers Reference / Edit / Extend / Stitch |
| `seedance-2-0-fast-text-to-video`      | Fast T2V | 480p / 720p         | Faster, lower-fidelity tier                                                                                         |
| `seedance-2-0-fast-image-to-video`     | Fast I2V | 480p / 720p         | Faster, lower-fidelity tier                                                                                         |
| `seedance-2-0-fast-reference-to-video` | Fast R2V | 480p / 720p         | Faster, lower-fidelity tier; same workflow set                                                                      |

All variants are async. Submit via `POST /api/v1/video/queue`, then poll `POST /api/v1/video/retrieve` until the response body is `video/mp4`. See [Video Generation](/guides/media/video-generation) for the general queue flow.

## The "one model, four workflows" model

The reference-to-video variant (`seedance-2-0-reference-to-video` and its Fast sibling) is the same underlying model serving four different tasks. **The model infers the task from the prompt prefix and the shape of your inputs.** There is no `task` or `workflow` field — the prompt syntax is the routing.

| Workflow      | What it does                                                                                       | Prompt prefix                                                        | Inputs                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Reference** | Generate a new video using uploaded reference files as donors for subject / motion / style / audio | `Refer to ... in <Image\|Video\|Audio N> to generate ...`            | Text + ≥1 image OR video reference (0-9 images, 0-3 videos), plus optionally up to 3 audio donors |
| **Edit**      | Modify a single input video while preserving the rest                                              | `Strictly edit <Video 1>, changing its ...`                          | 1 input video + text (images optional grounding)                                                  |
| **Extend**    | Forward / backward extension of one clip                                                           | `Extend <Video 1>, generate ...`                                     | 1 input video + text                                                                              |
| **Stitch**    | Stitch 2-3 clips with auto-generated transitions                                                   | `<Video 1> + <transition description> + followed by <Video 2> + ...` | 2-3 input videos + text                                                                           |

The **prompt syntax is canonical and case-sensitive**: angle brackets, capital first letter, single space before the number — `<Video 1>`, `<Image 1>`, `<Audio 1>`.

***

## Workflow patterns

### Reference workflow

Use the uploaded reference files as **donors** — subject, scene, motion, style, vocal timbre — to generate a brand-new video.

**Canonical prompt patterns**:

```
Refer to <Subject N> in <Image N> to generate ...
Refer to the [action | camera scene | style | sound effect] in <Video N> to generate ...
Refer to the [tone | timbre] in <Audio N> to generate ...
```

**Examples**:

* `Refer to <Subject 1> in <Image 1> to generate a 5-second clip of the same character riding a horse through snow.`
* `Refer to the camera scene in <Video 1> to generate a similar establishing shot of a futuristic city at dawn.`
* `Refer to <Subject 1> in <Image 1> and use the timbre in <Audio 1> for the narrator describing the scene.` (audio donors must be paired with at least one image or video reference — audio alone is rejected)

### Edit workflow

Modify a single input video. **Anything not explicitly named in the prompt is preserved.** Use this when you want a localized change (subject swap, weather/color change, element add/remove) rather than a wholly new video.

**Canonical prompt pattern**:

```
Strictly edit <Video 1>, changing its [original feature] to [new feature] ...
```

**Sub-patterns for finer control**:

```
Add Elements:
  At [timestamp / timing] and [spatial location] of <Video 1>, add [description of intended element].

Remove Elements:
  Remove [element to be deleted] from <Video 1>, keeping the rest of the video content unchanged.

Modify Elements:
  Replace [description of element to be changed] in <Video 1> with [description of intended element].
```

**Examples**:

* `Strictly edit <Video 1>, changing its weather from sunny to a heavy rainstorm.`
* `Add snacks such as fried chicken and pizza to the countertop in <Video 1>.`
* `Remove the red car from <Video 1>, keeping the rest of the video content unchanged.`
* `Replace the perfume featured in <Video 1> with the face cream from <Image 1>, with all original motions and camera work preserved.`

The last example combines Edit with an image reference — perfectly legal, the model uses `<Image 1>` as a visual donor for the replacement.

### Extend workflow

Continue a single clip forward or backward in time. **By default Seedance returns only the new content** — not the original input concatenated with the extension. This is by design, for transition continuity; if you want the input clip preserved alongside the extension, say so explicitly:

```
Extend <Video 1>, generate [description of extended content]
Extend <Video 1> backward, [description of extended content]
Extend <Video 1>, start with <Video 1>, then [description of extended content]      ← preserves input at start
Extend <Video 1> backward, [description], and then end with <Video 1>               ← preserves input at end
```

Transition handling: the model automatically extracts the transition frames for seamless blending, and the original segments of the input video are not re-generated.

**Examples**:

* `Extend <Video 1>, generate a dramatic chase scene through narrow alleys at dusk.`
* `Extend <Video 1> backward, the same character walking toward the camera before the original shot begins.`
* `Extend <Video 1>, start with <Video 1>, then the camera pulls back to reveal a vast landscape.`

### Stitch workflow (Track Completion)

Connect 2-3 input clips with AI-generated transitions. Total combined input duration must be ≤ 15 s.

**Canonical prompt pattern**:

```
<Video 1> + [transition description] + followed by <Video 2> [+ [transition description] + followed by <Video 3>]
```

**Examples**:

* `<Video 1> + a smooth seamless cut + followed by <Video 2>`
* `<Video 1>. The moment a leaf falls to the ground, it sets off a special effect of golden particles. A gust of wind blows by, leading into <Video 2>.`
* `<Video 1> + a wisp of smoke transforms into a flock of birds + followed by <Video 2> + a slow dolly-in + followed by <Video 3>`

The model auto-trims connecting segments at the join points for continuity.

***

## Universal prompt formula

Across all four workflows, the recommended authoring formula is:

```
Subject + Motion + Environment (Optional)
       + Camera Movement / Cut (Optional)
       + Aesthetic Description (Optional)
       + Audio (Optional)
```

* **Subject + Motion**: the logical foundation — define "Who" is performing "What action"
* **Environment + Aesthetics**: spatial background, lighting, visual style
* **Camera**: explicit shot type or movement
* **Audio**: ambient sound effects or vocal direction for immersive output

Layering this on top of a workflow prefix (e.g., `Strictly edit <Video 1>, changing its <subject + motion + environment + ...>`) produces the highest-quality outputs.

***

## Multimodal input limits

Values below are what the Venice API accepts. Requests outside these ranges are rejected at the schema layer with a 400 before reaching inference.

### Images

| Constraint                          | Value                                                               |
| ----------------------------------- | ------------------------------------------------------------------- |
| Input methods                       | URL (`http://`, `https://`) or Base64 data URL (`data:image/...`)   |
| Formats                             | `.jpeg`, `.png`, `.webp`, `.bmp`, `.tiff`, `.gif`, `.heic`, `.heif` |
| Aspect ratio (W / H)                | exclusive `(0.4, 2.5)`                                              |
| Minimum side                        | ≥ 300 px                                                            |
| Image count: I2V first-frame        | 1                                                                   |
| Image count: I2V first + last frame | 2                                                                   |
| **Image count: R2V (V2 / Fast)**    | **1 – 9**                                                           |

### Videos

| Constraint                  | Value                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| Input methods               | URL (`http://`, `https://`) or Base64 data URL (`data:video/...`) |
| Formats                     | `.mp4`, `.mov`                                                    |
| Video codecs                | H.264 / AVC, H.265 / HEVC                                         |
| Audio codecs (in container) | AAC, MP3                                                          |
| **Duration per clip**       | `[2, 15]` s (inclusive)                                           |
| **Max clip count**          | 3 (R2V / Stitch / Extend)                                         |
| **Total combined duration** | ≤ 15 s across all clips                                           |
| **Per-clip size**           | ≤ 50 MB                                                           |

### Audio

| Constraint                  | Value                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| Input methods               | URL (`http://`, `https://`) or Base64 data URL (`data:audio/...`) |
| Formats                     | `.wav`, `.mp3`                                                    |
| **Duration per clip**       | `[2, 15]` s                                                       |
| **Max clip count**          | 3                                                                 |
| **Total combined duration** | ≤ 15 s across all clips                                           |
| **Per-clip size**           | ≤ 15 MB                                                           |

Reference audio is supported on the R2V variants only. Each entry is forwarded to the model as a `role: "reference_audio"` content item that the prompt addresses as `<Audio 1>`, `<Audio 2>`, `<Audio 3>` — the model uses each clip for vocal timbre, sound effects, or background music depending on how the prompt frames it. The legacy singular `audio_url` field maps to the same content shape and is now equivalent to passing a one-element `reference_audio_urls`.

<Warning>
  **`reference_audio_urls` cannot be the only reference input.** The model requires at least one image or video reference alongside any audio donor. Pair `reference_audio_urls` with `reference_image_urls`, `reference_video_urls`, `image_url`, or `video_url` — audio-only submissions are rejected.
</Warning>

### Request size

The queue endpoint accepts JSON bodies up to **35 MB**. Inline data URLs for large videos can push past this — for multi-clip Stitch in particular, prefer URLs over inline base64.

***

## Pricing

Call `POST /api/v1/video/quote` to get a quote for a given request shape before submitting it to `/video/queue`. The quote endpoint is the only authoritative source; pricing details may change and shouldn't be cached or duplicated client-side.

When reference video(s) are part of the request, also pass `reference_video_total_duration` (the sum of all reference clip durations in seconds) so the quote matches what `/video/queue` will charge:

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/quote \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "duration": "5s",
    "resolution": "1080p",
    "aspect_ratio": "16:9",
    "reference_video_total_duration": 5
  }'
```

***

## Complete examples

All examples assume `VENICE_API_KEY` is set in the environment.

### Text-to-video

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-text-to-video",
    "prompt": "A golden retriever frolicking through a sunlit meadow at sunset, slow camera dolly-in, shallow depth of field, warm cinematic lighting.",
    "duration": "5s",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

### Image-to-video (first frame)

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-image-to-video",
    "prompt": "The lighthouse keeper turns toward the storm, lantern raised, waves crashing against the rocks.",
    "image_url": "https://example.com/lighthouse.jpg",
    "duration": "5s",
    "resolution": "720p"
  }'
```

<Note>
  `seedance-2-0-image-to-video` (and its Fast variant) **do not accept `aspect_ratio`** — the output aspect ratio is auto-derived from the input image's dimensions. Passing the field returns a 400 with *"This model does not support aspect\_ratio"*. Use the T2V or R2V variants if you need explicit aspect-ratio control.
</Note>

### Reference workflow — subject donor

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "Refer to <Subject 1> in <Image 1> to generate a 5-second clip of the same character walking through a neon-lit Tokyo street at night.",
    "reference_image_urls": ["https://example.com/character.png"],
    "duration": "5s",
    "aspect_ratio": "9:16",
    "resolution": "1080p"
  }'
```

### Reference workflow — subject + audio donor

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "Refer to <Subject 1> in <Image 1> to generate a 5-second clip of the same character walking through a neon-lit Tokyo street at night. Refer to the timbre in <Audio 1> for a soft female voiceover describing the scene.",
    "reference_image_urls": ["https://example.com/character.png"],
    "reference_audio_urls": ["https://example.com/voice-sample.mp3"],
    "duration": "5s",
    "aspect_ratio": "9:16",
    "resolution": "1080p"
  }'
```

### Edit workflow

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "Strictly edit <Video 1>, changing its weather from sunny to a heavy rainstorm, with all original motions and camera work preserved.",
    "reference_video_urls": ["https://example.com/sunny-scene.mp4"],
    "reference_video_total_duration": 5,
    "duration": "5s",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

### Edit workflow with image grounding

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "Replace the perfume featured in <Video 1> with the face cream from <Image 1>, with all original motions and camera work preserved.",
    "reference_video_urls": ["https://example.com/perfume-ad.mp4"],
    "reference_image_urls": ["https://example.com/face-cream.png"],
    "reference_video_total_duration": 4,
    "duration": "5s",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

### Extend forward

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "Extend <Video 1>, generate a dramatic chase scene through narrow alleys at dusk, with neon signs flickering and rain on the pavement.",
    "reference_video_urls": ["https://example.com/alley-intro.mp4"],
    "reference_video_total_duration": 4,
    "duration": "5s",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

### Stitch (3 clips)

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/queue \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "prompt": "<Video 1> + a wisp of smoke transforms into a flock of birds + followed by <Video 2> + a slow dolly-in + followed by <Video 3>",
    "reference_video_urls": [
      "https://example.com/clip-1.mp4",
      "https://example.com/clip-2.mp4",
      "https://example.com/clip-3.mp4"
    ],
    "reference_video_total_duration": 12,
    "duration": "5s",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

### Polling for completion

After every queue submission, save the returned `queue_id` and poll `/video/retrieve` until the response body is `video/mp4`:

```bash theme={"system"}
curl -X POST https://api.venice.ai/api/v1/video/retrieve \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2-0-reference-to-video",
    "queue_id": "123e4567-e89b-12d3-a456-426614174000"
  }' \
  -o output.mp4
```

The response is JSON (`{ "status": "queued" | "running" | "failed", ... }`) until the job completes, at which point the response body switches to `video/mp4` bytes. See [Video Generation](/guides/media/video-generation) for the full polling pattern.

***

## Troubleshooting

### `At least one reference is required for this model`

Reference-to-video submissions must include at least one of `reference_image_urls`, `reference_video_urls`, `image_references`, or `video_references`. Pure text-only generation isn't a valid R2V workflow — use `seedance-2-0-text-to-video` instead. `reference_audio_urls` alone is not sufficient (see the Audio section above).

### `reference_video_urls must have at most 3 videos`

The model caps reference videos at 3. If you need more clips, run a Stitch first (3 → 1), then use the output as a reference for a follow-up.

### `Per clip must be 2–15s` / aggregate `> 15s`

Per-clip duration is `[2, 15]` seconds **inclusive**; the sum across all reference videos is also capped at 15 seconds. Trim clips client-side before submission.

### Prompt routes to the wrong workflow

Workflow is inferred from prompt syntax. Common misroutings:

* Wanting to **Extend** but writing `Refer to ...` → model treats your video as a *donor*, not a canvas to continue
* Wanting to **Stitch** but writing `Refer to ...` → model picks one as the donor, ignores the others
* Wanting to **Edit** but writing `Generate a video based on <Video 1>` → ambiguous; model may default to Reference

Use the canonical prefixes exactly as written: `Strictly edit <Video 1>, ...`, `Extend <Video 1>, ...`, `<Video 1> + ... + followed by <Video 2>`.

### Quote doesn't match the queued amount

If you included a reference video but didn't pass `reference_video_total_duration` to `/video/quote`, the quote and the queued amount may differ. Always pass `reference_video_total_duration` (sum of all reference clip durations, in seconds) when reference videos are present.

***

## References

* Venice video queue endpoint: [`POST /api/v1/video/queue`](/api-reference/endpoint/video/queue)
* Venice quote endpoint: [`POST /api/v1/video/quote`](/api-reference/endpoint/video/quote)
* Companion guide: [Reference to Video](/guides/media/reference-to-video) (covers Kling O3 + Grok Imagine R2V)
* Companion guide: [Video Generation](/guides/media/video-generation) (queue / polling overview)


# Video Generation
Source: https://docs.venice.ai/guides/media/video-generation

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

`download_url` is a pre-signed URL you use to download the finished video instead of reading it from the retrieve response. It is only returned once in the queue response, so persist it alongside `queue_id`. This applies to all four Grok Imagine Private variants:

* `grok-imagine-text-to-video-private`
* `grok-imagine-image-to-video-private`
* `grok-imagine-reference-to-video-private`
* `grok-imagine-video-to-video-private`

Unlike the public `grok-imagine-*-video` variants, Grok Imagine Private models are not billed for content-moderation rejections, so you only pay for successful generations.

Save `model`, `queue_id`, and `download_url` (if present) for all subsequent calls.

### Private download links

For private models, `download_url` is how you fetch the finished file once the job is complete. The link is **short-lived and single-purpose**: it is there to deliver the MP4 to you, not to serve as a long-term or widely shared URL.

If a download is interrupted, you can **retry the same `GET` a few times** from the same environment until the file finishes. Those retries are for recovering from network blips—not for polling the same link indefinitely, sharing it across many clients, or embedding it like a permanent media URL. Patterns like that often show up as **`429`** or **`410`**, which can be surprising if you expected the link to behave like regular file hosting.

For reliability, **`GET` requests should originate from one client network**. There is some flexibility if your IP changes once (for example you disconnect a VPN and try again), but wide variation in source IPs usually will not work.

The URL stays valid for up to **24 hours**, or until the object is removed.

<Note>
  If you need a stable URL, public playback, or repeated access over time, save the file to **your own storage** first and serve it from there.
</Note>

**Privacy: revoke the link with `DELETE`**

When you are done fetching the file—or if you decide not to keep it—you can call **`DELETE`** on the same `download_url`. No Venice API key is required on that request. This is optional but **recommended when privacy matters**, because some proxies and middleboxes outside Venice keep logs of full URLs, and deleting the link is the simplest way to narrow the window where the pre-signed URL exists.

```bash theme={"system"}
curl -X DELETE "$DOWNLOAD_URL"
```

**Flow:** poll `/video/retrieve` until `COMPLETED` → `GET` the `download_url` (retry lightly if the transfer drops) → save the file where you need it → `DELETE` the `download_url` if you want the link invalidated → optionally call `/video/complete` if you still use queue-based cleanup.

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
For models that returned a `download_url` at queue time, retrieve always returns JSON. Fetch the video with `GET download_url` (no auth header). See [Private download links](#private-download-links) for how these URLs work, retries, and optional `DELETE`.

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

| Status | Returned By                              | Meaning                                                                     | Action                                                                                                                                                                           |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `queue`, `quote`, `retrieve`, `complete` | Invalid parameters                                                          | Check request body against schema                                                                                                                                                |
| 401    | `queue`, `retrieve`, `complete`          | Auth failed                                                                 | Check API key                                                                                                                                                                    |
| 402    | `queue`                                  | Insufficient balance                                                        | Add funds                                                                                                                                                                        |
| 404    | `retrieve`, `download_url`               | Media not found (invalid, expired, or deleted)                              | Verify `model`/`queue_id` or re-queue                                                                                                                                            |
| 410    | `download_url`                           | Pre-signed URL expired, fully used, or revoked (for example after `DELETE`) | Start a new generation if you need another file; each link is intentionally short-lived                                                                                          |
| 429    | `download_url`                           | Rate limited—often from many retries or repeated fetches of the same link   | Finish the download (a few retries are fine if the connection drops), save a local copy, and use `DELETE` if you want to clear the link; keep ongoing access on your own storage |
| 413    | `queue`                                  | Payload too large                                                           | Reduce image/audio size                                                                                                                                                          |
| 422    | `queue`, `retrieve`                      | Content violation                                                           | Modify prompt                                                                                                                                                                    |
| 500    | `queue`, `retrieve`, `complete`          | Inference/processing failed                                                 | Retry with backoff; contact support if persistent                                                                                                                                |
| 503    | `retrieve`                               | Model at capacity                                                           | Retry with backoff                                                                                                                                                               |

***

## Polling Strategy

1. Poll `/video/retrieve` on an interval (for example, every 5 seconds)
2. If `Content-Type` is `application/json` and `status` is `"PROCESSING"`, wait and poll again. Use `average_execution_time` and `execution_duration` (milliseconds) to estimate remaining time
3. If `Content-Type` is `video/mp4`, save the response body as your output file
4. If `Content-Type` is `application/json` and `status` is `"COMPLETED"`, `GET` the `download_url` from the queue response to fetch the video (see [Private download links](#private-download-links))
5. If you used `download_url`, consider `DELETE` on that URL when you are done to narrow how long the pre-signed URL exists; then optionally set `delete_media_on_completion: true` on retrieve or call `/video/complete` for queue-based cleanup
6. Handle `404` as invalid, expired, or deleted media; handle `500/503` with retries/backoff

***

## Available Models

See [Video Models](/models/video) for current model list and pricing.


# Video Upscaling
Source: https://docs.venice.ai/guides/media/video-upscaling

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


# Guides
Source: https://docs.venice.ai/guides/overview

Practical guides for building with the Venice API

Use these guides to generate API keys, migrate existing OpenAI apps, enable Venice-specific features, and connect Venice to agent frameworks, coding tools, and media workflows.

<CardGroup>
  <Card title="Generate an API Key" icon="key" href="/guides/getting-started/generating-api-key">
    Create and manage API keys from the Venice dashboard.
  </Card>

  <Card title="Migrate from OpenAI" icon="arrows-rotate" href="/guides/getting-started/openai-migration">
    Switch OpenAI-compatible apps to Venice by changing the base URL.
  </Card>

  <Card title="Structured Responses" icon="brackets-curly" href="/guides/features/structured-responses">
    Request responses that match a JSON schema.
  </Card>

  <Card title="File Inputs" icon="file-lines" href="/guides/features/file-inputs">
    Send documents and source files to chat models.
  </Card>

  <Card title="Prompt Caching" icon="bolt" href="/guides/features/prompt-caching">
    Reduce latency and cost for repeated prompt content.
  </Card>

  <Card title="Private Research Agent" icon="robot" href="/guides/projects/private-research-agent">
    Build a Python research agent that collects sources and writes cited reports.
  </Card>
</CardGroup>

## Explore by Topic

<CardGroup>
  <Card title="Getting Started" icon="rocket" href="/guides/getting-started/generating-api-key">
    API keys, migration, autonomous key creation, and Postman.
  </Card>

  <Card title="Text & Chat" icon="message" href="/guides/features/structured-responses">
    Structured outputs, reasoning models, file inputs, prompt caching, and privacy-enhanced models.
  </Card>

  <Card title="Image & Video" icon="image" href="/guides/media/image-generation">
    Image generation, image editing, video generation, references, and upscaling.
  </Card>

  <Card title="Agents & Integrations" icon="robot" href="/guides/integrations/ai-agents">
    Agent frameworks, messaging bots, crypto RPC, wallet auth, and community integrations.
  </Card>

  <Card title="Coding Tools" icon="terminal" href="/guides/integrations/claude-code">
    Use Venice models with Claude Code, Cursor, and Codex CLI.
  </Card>

  <Card title="SDKs & Frameworks" icon="puzzle-piece" href="/guides/integrations/langchain">
    Build with LangChain, Vercel AI SDK, and CrewAI.
  </Card>

  <Card title="Projects" icon="hammer" href="/guides/projects/private-rag-bot">
    Build your own projects using one of our project walkthroughs.
  </Card>
</CardGroup>


# Building a Private RAG Bot
Source: https://docs.venice.ai/guides/projects/private-rag-bot



<AuthorByline name="Joshua Mo" />

Retrieval-augmented generation, or RAG, is one of the most useful patterns for building AI applications that need to answer from your own documents. Instead of asking a model to rely on memory alone, you retrieve relevant source material first, send that context to the model, and ask it to answer with citations.

In this tutorial, we'll build a private RAG bot using Python, Venice for embeddings and chat completions, Qdrant for vector search, and FastEmbed for local re-ranking. By the end, you'll have the core pieces for a local document assistant that can ingest your files, retrieve relevant chunks, re-rank them, and answer with citations.

<img alt="The RAG bot in action" />

Before we continue: if you want to run the code in this article, you'll need a Venice API key. Export it as an environment variable:

```bash theme={"system"}
export VENICE_API_KEY=<my-key>
```

Interested in the full code implementation? Check out [the GitHub repo.](https://github.com/joshua-mo-143/venice-rag-bot-demo)

## How a Modern RAG Bot Works

A good RAG pipeline is more than "put documents in a vector database." The basic flow looks like this:

| Step     | What happens                                                            |
| -------- | ----------------------------------------------------------------------- |
| Load     | Read local Markdown, text, or reStructuredText files                    |
| Chunk    | Split long documents into overlapping sections                          |
| Embed    | Use Venice embeddings to turn chunks into vectors                       |
| Store    | Save vectors and source metadata in Qdrant                              |
| Retrieve | Embed the user's question and run vector search                         |
| Re-rank  | Use a cross-encoder to rescore the best candidates                      |
| Answer   | Send the best context to a Venice chat model with citation instructions |

The re-ranking step is the upgrade that makes this more useful than a basic RAG demo. Vector search is fast and good at finding semantically similar chunks, but it can still return passages that are adjacent to the topic rather than directly useful. A cross-encoder reads the question and each candidate chunk together, then scores how well that chunk actually answers the question.

## Installing the Dependencies

We'll use the OpenAI Python SDK because Venice exposes an OpenAI-compatible API. We'll also use Qdrant's Python client with FastEmbed support:

```bash theme={"system"}
pip install "openai>=1.0.0" "qdrant-client[fastembed]>=1.14.1"
```

If you prefer to keep dependencies in a file, create `requirements.txt` with the same packages:

```text theme={"system"}
openai>=1.0.0
qdrant-client[fastembed]>=1.14.1
```

## Choosing the Models

Create a file called `rag_bot.py`, then start by adding the imports, data structures, API URL, and model names:

```python theme={"system"}
import os
import textwrap
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastembed.rerank.cross_encoder import TextCrossEncoder
from openai import OpenAI
from qdrant_client import QdrantClient, models

VENICE_BASE_URL = "https://api.venice.ai/api/v1"
CHAT_MODEL = "kimi-k2-6"
EMBEDDING_MODEL = "text-embedding-bge-m3"
RERANKER_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2"
COLLECTION_NAME = "private_rag_bot"


@dataclass
class SourceDocument:
    content: str
    metadata: dict


@dataclass
class RankedChunk:
    content: str
    metadata: dict
    vector_score: float
    rerank_score: float
```

The embedding model name is intentionally OpenAI-compatible. Venice maps compatible embedding model names to Venice-hosted embedding models, so existing OpenAI SDK code can usually move over by changing the `base_url` and API key.

You can list available Venice models with:

```bash theme={"system"}
curl "https://api.venice.ai/api/v1/models?type=embedding" \
  -H "Authorization: Bearer $VENICE_API_KEY"
```

For chat models:

```bash theme={"system"}
curl "https://api.venice.ai/api/v1/models?type=text" \
  -H "Authorization: Bearer $VENICE_API_KEY"
```

## Creating the Venice and Qdrant Clients

Create one OpenAI-compatible Venice client for both embeddings and chat completions:

```python theme={"system"}
venice = OpenAI(
    api_key=os.environ["VENICE_API_KEY"],
    base_url=VENICE_BASE_URL,
)
```

For Qdrant, you have three useful modes:

| Mode                                 | When to use it                     |
| ------------------------------------ | ---------------------------------- |
| `QdrantClient(":memory:")`           | Quick local demos and tests        |
| `QdrantClient(path="./qdrant_data")` | Local persistent storage           |
| `QdrantClient(url=..., api_key=...)` | A remote or managed Qdrant cluster |

For a private local bot, start with an on-disk local Qdrant path:

```python theme={"system"}
qdrant = QdrantClient(path="./qdrant_data")
```

There's a few different ways to handle deployment in production. However if you use a remote Qdrant deployment, remember that your document chunks and metadata will be stored there. Venice can keep the inference layer private, but you should still choose the right Qdrant deployment for your data.

## Loading and Chunking Documents

For this tutorial, we'll let the bot ingest local files or folders. Start with `.md`, `.rst`, and `.txt` files:

```python theme={"system"}
TEXT_EXTENSIONS = {".md", ".rst", ".txt"}

def expand_paths(paths: list[Path]) -> list[Path]:
    files = []
    for path in paths:
        if path.is_dir():
            files.extend(
                sorted(
                    file_path
                    for file_path in path.rglob("*")
                    if file_path.is_file()
                    and file_path.suffix.lower() in TEXT_EXTENSIONS
                )
            )
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Document path does not exist: {path}")
    return files
```

Once the files are loaded, we need to split the text up by "chunking" it - separating it into chunks of data. A naive strategy might split the chunks evenly. However in most cases, this can lose information at given semantic boundaries which can cause the effectiveness of your RAG system to go down.

The chunking strategy we will use prefers paragraph or sentence boundaries so the model gets coherent context:

```python theme={"system"}
def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    clean_text = textwrap.dedent(text).strip()
    if not clean_text:
        return []
    if len(clean_text) <= chunk_size:
        return [clean_text]

    chunks = []
    start = 0
    while start < len(clean_text):
        end = min(start + chunk_size, len(clean_text))

        if end < len(clean_text):
            paragraph_break = clean_text.rfind("\n\n", start, end)
            sentence_break = clean_text.rfind(". ", start, end)
            split_at = max(paragraph_break, sentence_break)
            if split_at > start + chunk_size // 2:
                end = split_at + 1

        chunk = clean_text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= len(clean_text):
            break

        start = max(end - chunk_overlap, start + 1)

    return chunks
```

A starting chunk size of `1000` characters with `150` characters of overlap is a good default for mixed Markdown and text documents. Smaller chunks can improve precision. Larger chunks can preserve more context. The right setting will often on depend on the kinds of documents you are storing.

## Embedding Documents with Venice

Once we have chunks, we embed them in batches:

```python theme={"system"}
def embed(texts: list[str]) -> list[list[float]]:
    embeddings = []
    for start in range(0, len(texts), 32):
        batch = texts[start : start + 32]
        response = venice.embeddings.create(
            model="text-embedding-bge-m3",
            input=batch,
        )
        embeddings.extend(
            item.embedding
            for item in sorted(response.data, key=lambda item: item.index)
        )
    return embeddings
```

Batching matters. Embedding one chunk at a time is simple, but it adds avoidable latency. Keep the batch size configurable so you can tune throughput based on your workload.

## Storing Vectors in Qdrant

Before inserting points, create a Qdrant collection with the right vector size. The easiest way to know the vector size is to embed the first batch, then use `len(embeddings[0])`.

```python theme={"system"}
qdrant.create_collection(
    collection_name=COLLECTION_NAME,
    vectors_config=models.VectorParams(
        size=len(embeddings[0]),
        distance=models.Distance.COSINE,
    ),
)
```

Each point stores the vector plus payload metadata. The payload includes the original text and a source path so the answer can cite where the context came from:

```python theme={"system"}
points.append(
    models.PointStruct(
        id=chunk_id,
        vector=embedding,
        payload={
            "text": chunk.content,
            "source": source,
            "chunk_index": chunk_index,
        },
    )
)

qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
```

Use deterministic UUIDs derived from `source`, `chunk_index`, and content. That makes repeated ingestion idempotent for unchanged chunks.

## Retrieving Candidate Chunks

At question time, the bot embeds the user's question and asks Qdrant for the top vector matches:

```python theme={"system"}
query_vector = embed([question])[0]
hits = qdrant.query_points(
    collection_name=COLLECTION_NAME,
    query=query_vector,
    with_payload=True,
    limit=8,
).points
```

The `limit` here is the candidate count. It should usually be higher than the number of chunks you plan to send to the model because the next step will re-rank them. A good default is to retrieve `8` candidates and send the best `4` to the chat model.

## Re-ranking with FastEmbed

Now we add the part that makes the retrieval feel much smarter.

```python theme={"system"}
from fastembed.rerank.cross_encoder import TextCrossEncoder

reranker = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")

candidate_texts = [str((hit.payload or {}).get("text", "")) for hit in hits]
rerank_scores = list(reranker.rerank(question, candidate_texts))
reranked = sorted(
    zip(hits, rerank_scores),
    key=lambda hit_and_score: hit_and_score[1],
    reverse=True,
)
```

The important difference between embedding search and cross-encoder re-ranking is how the scoring happens.

Embedding search compares one vector for the question against one vector for each chunk. It is fast and scalable. A cross-encoder evaluates the question and chunk together. It is slower, but it can judge relevance more directly.

That is why the usual pattern is:

1. Retrieve a larger candidate set with vector search.
2. Re-rank only those candidates locally.
3. Send the top few chunks to the language model.

A good starting point is `candidate_k=8` and `top_k=4`. Increase `candidate_k` if the right source is often nearby but not making it into the final context.

## Answering with Venice Chat Completions

Once the context is selected, format it with source numbers:

```python theme={"system"}
def format_context(chunks: list[RankedChunk]) -> str:
    if not chunks:
        return "No relevant context was retrieved."

    context_parts = []
    for index, chunk in enumerate(chunks, start=1):
        source = chunk.metadata.get("source", "unknown")
        context_parts.append(
            f"[{index}] Source: {source} | "
            f"Vector score: {chunk.vector_score:.4f} | "
            f"Rerank score: {chunk.rerank_score:.4f}\n"
            f"{chunk.content}"
        )
    return "\n\n---\n\n".join(context_parts)
```

Then send the context to a Venice chat model:

```python theme={"system"}
response = venice.chat.completions.create(
    model="kimi-k2-6",
    temperature=0.2,
    messages=[
        {
            "role": "system",
            "content": (
                "You are a helpful RAG assistant. Answer using only the supplied "
                "context. If the context does not answer the question, say that "
                "you do not have enough information."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Retrieved context:\n{context}\n\n"
                f"Question: {question}\n\n"
                "Answer with citations like [1] when the context supports the answer:"
            ),
        },
    ],
)
```

Notice the system prompt: the bot is told to answer only from the supplied context. That is a simple but important guardrail. A RAG assistant should not confidently answer from general model knowledge when the retrieved documents do not support the answer.

## Running the Bot

Once you assemble the pieces into a script, save it as `rag_bot.py`. A simple first run can use a few built-in sample documents so you can verify the pipeline before ingesting your own files:

```bash theme={"system"}
python rag_bot.py \
  --question "What does reranking improve in a RAG pipeline?"
```

To ingest your own documents:

```bash theme={"system"}
python rag_bot.py \
  --docs ./docs \
  --question "What does this project do?"
```

To keep a local Qdrant collection on disk and start an interactive chat:

```bash theme={"system"}
python rag_bot.py \
  --docs ./docs \
  --qdrant-path ./qdrant_data \
  --chat
```

The script prints the answer, then prints the sources with both vector and re-ranking scores:

```text theme={"system"}
Answer
============================================================
Reranking improves retrieval quality by rescoring the top
vector-search candidates with a cross-encoder model [1].

Sources
============================================================
1. sample-docs (vector=0.8123, rerank=0.7342)
```

If you want to inspect the actual text passed into the model, add:

```bash theme={"system"}
--show-context
```

## Useful CLI Options

Expose the main retrieval knobs as CLI options so you can tune the bot without editing code:

| Option                   | Default | What it controls                                    |
| ------------------------ | ------- | --------------------------------------------------- |
| `--candidate-k`          | `8`     | Number of vector search results to re-rank          |
| `--top-k`                | `4`     | Number of re-ranked chunks sent to the chat model   |
| `--chunk-size`           | `1000`  | Maximum chunk size before overlap                   |
| `--chunk-overlap`        | `150`   | Characters repeated between neighboring chunks      |
| `--embedding-batch-size` | `32`    | Number of chunks per Venice embeddings request      |
| `--qdrant-path`          | unset   | Local persistent Qdrant storage path                |
| `--qdrant-url`           | unset   | Remote Qdrant URL                                   |
| `--skip-ingest`          | `false` | Query an existing collection without reloading docs |
| `--recreate-collection`  | `false` | Delete and rebuild the Qdrant collection            |

For repeated local development, a common flow is:

```bash theme={"system"}
python rag_bot.py \
  --docs ./docs \
  --qdrant-path ./qdrant_data \
  --recreate-collection \
  --question "Summarize the most important setup steps."
```

Then ask follow-up questions without ingesting again:

```bash theme={"system"}
python rag_bot.py \
  --qdrant-path ./qdrant_data \
  --skip-ingest \
  --question "Which file explains deployment?"
```

## Privacy Notes

For a private RAG setup, think about each layer separately:

| Layer               | Privacy consideration                                            |
| ------------------- | ---------------------------------------------------------------- |
| Venice embeddings   | Document chunks are sent to Venice to create vectors             |
| Venice chat         | Retrieved context is sent to Venice to answer the question       |
| Qdrant local        | Vectors and payloads stay on your machine                        |
| Qdrant remote       | Vectors and payloads are stored wherever your Qdrant server runs |
| FastEmbed re-ranker | Re-ranking runs locally after the model is available             |

The most private default for this tutorial is Venice for inference, local Qdrant on disk, and local FastEmbed re-ranking. That gives you a practical RAG bot without sending your vector database payloads to a third-party vector store.

## Common Errors to Handle Up Front

| Symptom                                           | What it usually means                                          | What to do                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `Set VENICE_API_KEY before running this example.` | The environment variable is missing                            | Export `VENICE_API_KEY` before running the script                    |
| `Document path does not exist`                    | A path passed to `--docs` is wrong                             | Check the file or folder path                                        |
| Empty retrieval results                           | Nothing was ingested, or the wrong collection is being queried | Remove `--skip-ingest` or confirm `--collection` and `--qdrant-path` |
| Qdrant vector size error                          | The collection was created with a different embedding model    | Recreate the collection after changing embedding models              |
| Slow first re-rank                                | FastEmbed may be downloading or initializing the cross-encoder | Let the first run finish, then subsequent runs should be faster      |

If you change embedding models, recreate the Qdrant collection. Different embedding models can produce vectors with different dimensions, and Qdrant collections expect a fixed vector size.

## Where to Go Next

Once you have the baseline running, the highest-impact improvements are usually:

* Add document-specific loaders for PDFs, HTML, tickets, or internal wiki pages.
* Store richer metadata such as titles, headings, dates, owners, and URLs.
* Tune `candidate_k`, `top_k`, chunk size, and overlap on real questions.
* Add evaluation questions so you can measure retrieval quality before and after changes.
* Stream the final Venice chat completion for a better interactive chat experience.

RAG systems are easy to demo and surprisingly easy to make mediocre. The vector search plus re-ranking pattern is a strong foundation because it keeps retrieval fast while giving the bot a better chance of sending the language model the right context.


# Building a Private Research Agent
Source: https://docs.venice.ai/guides/projects/private-research-agent



<AuthorByline name="Joshua Mo" />

Research agents are useful when you want more than a single search result or a quick model answer. A good research agent can turn a broad topic into search queries, collect sources, extract the important evidence, follow up on gaps, and write a cited briefing that you can inspect afterward.

In this tutorial, we'll build a private research agent using Python and the Venice API. By the end, you'll have a CLI that can research a topic, scrape public pages into Markdown, summarize source chunks, run gap-aware follow-up research passes, and generate a cited report with optional local JSONL artifacts.

Interested in the full code implementation? Check out [the GitHub repo.](https://github.com/joshua-mo-143/venice-research-agent-demo)

Before we continue, you'll need a Venice API key:

```bash theme={"system"}
export VENICE_API_KEY=<my-key>
```

## What We're Building

The reference implementation is a small Python project with a few clear parts:

| Part            | What it does                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CLI             | Accepts a research topic, model, providers, depth settings, output path, and artifact directory                                       |
| Venice client   | Calls chat completions, streaming chat completions, and `POST /augment/scrape`                                                        |
| Search layer    | Searches DuckDuckGo by default, with optional arXiv paper discovery                                                                   |
| Data models     | Tracks source URLs, canonical URLs, chunks, evidence, notes, errors, and reports                                                      |
| Research agent  | Plans searches, reads sources, extracts evidence, analyzes gaps, generates follow-up queries, and writes the final report             |
| Artifact writer | Stores auditable JSONL records for queries, research gaps, results, fetches, chunks, source notes, report drafts, errors, and reports |

The flow looks like this:

<img alt="Private research agent pipeline" />

1. Ask Venice to generate diverse search queries for the topic.
2. Search the web with one or more providers.
3. Deduplicate URLs before reading them.
4. Use Venice's scrape endpoint to turn each public source page into Markdown.
5. Split long pages into chunks.
6. Ask Venice to extract evidence from each chunk.
7. Ask Venice to turn chunk evidence into source notes.
8. Identify research gaps and source-balance issues before generating follow-up queries.
9. Ask Venice to synthesize the final report with footnote-style citations.

This is "private" in the practical sense that the agent keeps the orchestration, source notes, artifacts, and final reports on your machine. Venice handles the model calls and scraping through its API. The default reference implementation still sends search queries to DuckDuckGo or arXiv, so treat provider choice as part of your privacy design.

## Setting Up the Project

The reference project uses Python 3.13 and `uv`, but the same code works with a normal virtual environment too.

Create a new project:

```bash theme={"system"}
mkdir venice-research-agent
cd venice-research-agent
uv init
```

Install the dependencies:

```bash theme={"system"}
uv add httpx beautifulsoup4 python-dotenv
```

If you prefer `pip`, create a virtual environment and install the same packages:

```bash theme={"system"}
python -m venv .venv
source .venv/bin/activate
pip install "httpx>=0.28.0" "beautifulsoup4>=4.13.0" "python-dotenv>=1.0.0"
```

Create a `.env` file for local development:

```bash theme={"system"}
VENICE_API_KEY=your_venice_api_key_here
VENICE_MODEL=openai-gpt-55
```

We use `VENICE_MODEL` so you can change the model without editing code. The reference implementation currently defaults to `openai-gpt-55`, but you can swap it for another chat model available to your Venice account.

## Creating the Data Models

Before writing the agent logic, we'll define the objects that move through the pipeline. These models keep the rest of the code easier to reason about because every source carries provenance: where it came from, which query found it, when it was retrieved, and how it was chunked.

Create `research_agent/models.py`:

```python theme={"system"}
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "msclkid",
    "ref",
    "ref_src",
}


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    query: str = ""
    rank: int = 0
    provider: str = "duckduckgo"
    canonical_url: str = ""

    def __post_init__(self) -> None:
        if not self.canonical_url:
            object.__setattr__(self, "canonical_url", canonicalize_url(self.url))


@dataclass(frozen=True)
class ScrapeResult:
    url: str
    content: str
    title: str = ""
    final_url: str = ""
    content_type: str = "text/markdown"


@dataclass(frozen=True)
class TextChunk:
    chunk_id: str
    text: str
    start: int
    end: int
    content_hash: str


@dataclass(frozen=True)
class WebPage:
    title: str
    url: str
    text: str
    final_url: str = ""
    canonical_url: str = ""
    content_type: str = ""
    retrieved_at: str = ""
    content_hash: str = ""
    chunks: tuple[TextChunk, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        final_url = self.final_url or self.url
        object.__setattr__(self, "final_url", final_url)
        if not self.canonical_url:
            object.__setattr__(self, "canonical_url", canonicalize_url(final_url))
        if not self.retrieved_at:
            object.__setattr__(self, "retrieved_at", utc_now())
        if not self.content_hash:
            object.__setattr__(self, "content_hash", content_hash(self.text))


@dataclass(frozen=True)
class EvidenceChunk:
    chunk_id: str
    text: str
    summary: str
    quotes: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class SourceNote:
    source_id: str
    title: str
    url: str
    query: str
    summary: str
    canonical_url: str = ""
    final_url: str = ""
    rank: int = 0
    snippet: str = ""
    provider: str = "duckduckgo"
    retrieved_at: str = ""
    content_type: str = ""
    content_hash: str = ""
    chunks: tuple[EvidenceChunk, ...] = field(default_factory=tuple)
```

The important fields here are `canonical_url`, `content_hash`, and `chunks`.

`canonical_url` lets the agent avoid reading the same source repeatedly when search results differ only by tracking parameters or fragments. `content_hash` helps catch duplicate pages even when they live at different URLs. `chunks` lets us summarize long pages in smaller pieces instead of losing useful evidence to context limits.

Add the helper functions below the dataclasses:

```python theme={"system"}
def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonicalize_url(raw_url: str) -> str:
    if not raw_url:
        return ""

    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")

    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not _is_tracking_param(key)
    ]
    query = urlencode(sorted(query_pairs), doseq=True)
    return urlunparse((scheme, netloc, path, "", query, ""))


def chunk_text(text: str, *, chunk_chars: int = 3000, overlap: int = 250) -> tuple[TextChunk, ...]:
    clean = text.strip()
    if not clean:
        return ()
    if chunk_chars <= 0:
        raise ValueError("chunk_chars must be greater than 0")
    if overlap < 0 or overlap >= chunk_chars:
        raise ValueError("overlap must be at least 0 and smaller than chunk_chars")

    chunks: list[TextChunk] = []
    start = 0
    index = 1
    while start < len(clean):
        end = min(len(clean), start + chunk_chars)
        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(
                TextChunk(
                    chunk_id=f"C{index}",
                    text=chunk,
                    start=start,
                    end=end,
                    content_hash=content_hash(chunk),
                )
            )
            index += 1
        if end == len(clean):
            break
        start = end - overlap

    return tuple(chunks)


def _is_tracking_param(key: str) -> bool:
    lowered = key.lower()
    return lowered.startswith("utm_") or lowered in TRACKING_PARAMS
```

Chunking is deliberately simple here: fixed-size character chunks with overlap. That is enough for a demo research agent because Venice's scrape endpoint returns Markdown, which is usually much cleaner than raw HTML. For production research on long technical documents, you can improve this by splitting on headings, paragraphs, or token counts.

## Building the Venice Client

Next, we'll create a small Venice client. You could use the OpenAI Python SDK for chat completions because Venice is OpenAI-compatible, but the reference implementation uses `httpx` directly so the same client can call Venice's `POST /augment/scrape` endpoint.

Create `research_agent/venice.py`:

```python theme={"system"}
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .models import ScrapeResult

DEFAULT_BASE_URL = "https://api.venice.ai/api/v1"
DEFAULT_MODEL = "openai-gpt-55"
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class VeniceError(RuntimeError):
    """Raised when the Venice API returns an unusable response."""


@dataclass(frozen=True)
class VeniceClient:
    api_key: str
    model: str = DEFAULT_MODEL
    base_url: str = DEFAULT_BASE_URL
    timeout: float = 60.0
    max_retries: int = 2
    backoff_seconds: float = 1.0

    @classmethod
    def from_env(cls, model: str | None = None, *, max_retries: int = 2) -> "VeniceClient":
        api_key = os.getenv("VENICE_API_KEY")
        if not api_key:
            raise VeniceError("VENICE_API_KEY is required.")

        return cls(
            api_key=api_key,
            model=model or os.getenv("VENICE_MODEL", DEFAULT_MODEL),
            base_url=os.getenv("VENICE_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
            max_retries=max_retries,
        )
```

The `from_env()` helper keeps secrets out of your source code. It also makes local development convenient because `python-dotenv` can load `VENICE_API_KEY` and `VENICE_MODEL` from `.env`.

Now add chat completions:

```python theme={"system"}
    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1600,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        data = self._post_json("/chat/completions", payload)
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise VeniceError(f"Unexpected Venice API response: {data}") from exc
```

For the final report, we want to use streaming because deep reports can take significantly longer (because it will produce a lot more text). This can cause timeout issues for requests where it may take an extremely long time to produce the final output. By using streaming, we can eliminate this issue and make the request more resistant to timeout failures:

```python theme={"system"}
    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1600,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        return self._post_chat_stream("/chat/completions", payload).strip()
```

Then add scraping:

```python theme={"system"}
    def scrape(self, url: str) -> ScrapeResult:
        data = self._post_json("/augment/scrape", {"url": url})
        content = _first_string(data, "content", "markdown", "text")
        if not content:
            raise VeniceError(f"Unexpected Venice scrape response: {data}")

        return ScrapeResult(
            url=url,
            final_url=_first_string(data, "final_url", "url", "source_url") or url,
            title=_first_string(data, "title"),
            content=content,
            content_type="text/markdown",
        )
```

Venice's scrape endpoint accepts a publicly accessible URL and returns the page as Markdown. That means the model does not need to parse raw HTML, and your source extraction prompts can work with cleaner text.

The remaining helper handles retries and response parsing:

```python theme={"system"}
    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            try:
                response = httpx.post(
                    f"{self.base_url}{path}",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=self.timeout,
                )
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < self.max_retries:
                    time.sleep(self.backoff_seconds * (2**attempt))
                    continue
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise VeniceError(f"Unexpected Venice API response: {data}")
                return data
            except httpx.HTTPError as exc:
                if attempt < self.max_retries:
                    time.sleep(self.backoff_seconds * (2**attempt))
                    continue
                raise VeniceError(f"Could not reach Venice API: {exc}") from exc

        raise VeniceError("Could not reach Venice API")


def _first_string(data: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    for nested_key in ("data", "result", "scrape"):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            value = _first_string(nested, *keys)
            if value:
                return value

    return ""
```

The complete repo also includes a robust `_post_chat_stream()` helper that reads server-sent events from streaming chat completions. You can start without streaming, then add it once the rest of the research flow works.

## Adding Search Providers

The search layer has two jobs: find source URLs and fetch those URLs through the Venice scraper. The reference implementation uses DuckDuckGo's HTML endpoint for general web search and arXiv's Atom API for papers.

Create `research_agent/web.py`:

```python theme={"system"}
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterable
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from .models import ScrapeResult, SearchResult, TextChunk, WebPage, canonicalize_url, chunk_text, content_hash, utc_now

USER_AGENT = "venice-research-agent-demo/0.1 (+https://venice.ai)"


class SearchProvider:
    name = "provider"

    def search(self, web: "WebSearch", query: str, limit: int) -> list[SearchResult]:
        raise NotImplementedError
```

Now add DuckDuckGo:

```python theme={"system"}
class DuckDuckGoProvider(SearchProvider):
    name = "duckduckgo"

    def search(self, web: "WebSearch", query: str, limit: int) -> list[SearchResult]:
        response = web.get("https://duckduckgo.com/html/", params={"q": query})
        soup = BeautifulSoup(response.text, "html.parser")
        results: list[SearchResult] = []
        seen_urls: set[str] = set()

        for node in soup.select(".result"):
            link = node.select_one(".result__a")
            if link is None:
                continue

            url = _normalize_duckduckgo_url(link.get("href", ""))
            canonical_url = canonicalize_url(url)
            if not canonical_url or canonical_url in seen_urls:
                continue

            snippet = node.select_one(".result__snippet")
            results.append(
                SearchResult(
                    title=_clean_text(link.get_text(" ", strip=True)),
                    url=url,
                    snippet=_clean_text(snippet.get_text(" ", strip=True) if snippet else ""),
                    query=query,
                    rank=len(results) + 1,
                    provider=self.name,
                    canonical_url=canonical_url,
                )
            )
            seen_urls.add(canonical_url)

            if len(results) >= limit:
                break

        return results
```

And arXiv:

```python theme={"system"}
class ArxivProvider(SearchProvider):
    name = "arxiv"

    def search(self, web: "WebSearch", query: str, limit: int) -> list[SearchResult]:
        response = web.get(
            "https://export.arxiv.org/api/query",
            params={
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": limit,
                "sortBy": "relevance",
            },
        )
        namespace = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(response.text)
        results: list[SearchResult] = []

        for entry in root.findall("atom:entry", namespace):
            title = _clean_text(_xml_text(entry.find("atom:title", namespace)))
            summary = _clean_text(_xml_text(entry.find("atom:summary", namespace)))
            url = _xml_text(entry.find("atom:id", namespace)).strip()
            canonical_url = canonicalize_url(url)
            if not url or not canonical_url:
                continue

            results.append(
                SearchResult(
                    title=title or url,
                    url=url,
                    snippet=summary,
                    query=query,
                    rank=len(results) + 1,
                    provider=self.name,
                    canonical_url=canonical_url,
                )
            )

            if len(results) >= limit:
                break

        return results
```

The `WebSearch` class coordinates providers and fetches pages:

```python theme={"system"}
class WebSearch:
    def __init__(
        self,
        timeout: float = 15.0,
        *,
        providers: Iterable[SearchProvider] | None = None,
        chunk_chars: int = 3000,
        scraper: Callable[[str], ScrapeResult] | None = None,
    ) -> None:
        self._client = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        )
        self.providers = tuple(providers or (DuckDuckGoProvider(),))
        self.chunk_chars = chunk_chars
        self.scraper = scraper

    @classmethod
    def from_provider_names(cls, provider_names: Iterable[str], **kwargs: object) -> "WebSearch":
        providers = [_provider_from_name(name) for name in provider_names]
        return cls(providers=providers, **kwargs)

    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        results: list[SearchResult] = []
        seen_urls: set[str] = set()

        for provider in self.providers:
            for result in provider.search(self, query, limit):
                if result.canonical_url in seen_urls:
                    continue
                results.append(result)
                seen_urls.add(result.canonical_url)

        return results

    def fetch(self, result: SearchResult) -> WebPage:
        if self.scraper is None:
            raise RuntimeError("WebSearch.fetch requires a Venice scrape function.")

        scraped = self.scraper(result.url)
        text = scraped.content.strip() or result.snippet
        chunks = self._chunk_text(text)
        return WebPage(
            title=scraped.title or result.title,
            url=result.url,
            final_url=scraped.final_url or scraped.url or result.url,
            canonical_url=canonicalize_url(scraped.final_url or result.url),
            text=text,
            content_type=scraped.content_type or "text/markdown",
            retrieved_at=utc_now(),
            content_hash=content_hash(text),
            chunks=chunks,
        )

    def get(self, url: str, *, params: dict[str, object] | None = None) -> httpx.Response:
        response = self._client.get(url, params=params)
        response.raise_for_status()
        return response

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "WebSearch":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _chunk_text(self, text: str) -> tuple[TextChunk, ...]:
        overlap = min(250, max(0, self.chunk_chars // 10))
        return chunk_text(text, chunk_chars=self.chunk_chars, overlap=overlap)
```

The full reference implementation adds retries, host-level request delays, and friendlier errors. Those are worth keeping because research agents spend a lot of time dealing with pages that block automation, redirect unexpectedly, or return transient errors.

Add the small provider helpers at the bottom:

```python theme={"system"}
def _normalize_duckduckgo_url(raw_url: str) -> str:
    if not raw_url:
        return ""

    parsed = urlparse(raw_url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path == "/l/":
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        return unquote(target)

    if parsed.scheme in {"http", "https"}:
        return raw_url

    return ""


def _provider_from_name(name: str) -> SearchProvider:
    normalized = name.strip().lower()
    if normalized in {"duckduckgo", "ddg", "web"}:
        return DuckDuckGoProvider()
    if normalized == "arxiv":
        return ArxivProvider()
    raise ValueError(f"Unknown source provider: {name}")


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _xml_text(node: ET.Element | None) -> str:
    return "" if node is None or node.text is None else node.text
```

## Writing Local Artifacts

For research workflows, auditability matters. If the final report says something surprising, you should be able to inspect which source led to it.

Create `research_agent/artifacts.py`:

```python theme={"system"}
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any


class ArtifactWriter:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root
        if self.root is not None:
            self.root.mkdir(parents=True, exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self.root is not None

    def write(self, kind: str, record: object) -> None:
        if self.root is None:
            return

        path = self.root / f"{kind}.jsonl"
        payload = json.dumps(_to_jsonable(record), ensure_ascii=False, sort_keys=True)
        with path.open("a", encoding="utf-8") as file:
            file.write(f"{payload}\n")


def _to_jsonable(value: object) -> Any:
    if is_dataclass(value):
        return _to_jsonable(asdict(value))
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_jsonable(item) for item in value]
    return value
```

This writes one JSON object per line, which makes the artifacts easy to append, inspect, and process with command-line tools later.

## Building the Research Agent

Now that we have Venice, search, models, and artifacts, we can build the actual agent.

Create `research_agent/agent.py`:

```python theme={"system"}
from __future__ import annotations

import json
from collections.abc import Callable
from textwrap import dedent

from .artifacts import ArtifactWriter
from .models import CollectionError, EvidenceChunk, ResearchReport, SearchResult, SourceNote, WebPage, utc_now
from .venice import VeniceClient, VeniceError
from .web import WebSearch

SYSTEM_PROMPT = """You are a careful research assistant.
Use the supplied source material only when making factual claims.
Flag uncertainty, contradictions, and missing context instead of filling gaps."""

ProgressCallback = Callable[[str], None]

DEFAULT_ITERATIONS = 3
DEFAULT_QUERY_COUNT = 6
DEFAULT_RESULTS_PER_QUERY = 4
DEFAULT_MAX_SOURCES = 40
DEFAULT_MAX_CHUNKS_PER_SOURCE = 6
```

The system prompt is the core behavioral guardrail. We don't want the model to produce an impressive-sounding report from memory. We want it to use the source material and call out uncertainty when the evidence is thin.

We also need two final dataclasses in `models.py` if you have not added them yet:

```python theme={"system"}
@dataclass(frozen=True)
class CollectionError:
    stage: str
    message: str
    query: str = ""
    url: str = ""
    source_id: str = ""
    provider: str = ""


@dataclass(frozen=True)
class ResearchReport:
    topic: str
    markdown: str
    sources: list[SourceNote]
    artifacts_dir: str | None = None
```

Next, define the `ResearchAgent`:

```python theme={"system"}
class ResearchAgent:
    def __init__(
        self,
        venice: VeniceClient,
        web: WebSearch | None = None,
        artifacts: ArtifactWriter | None = None,
        progress: ProgressCallback | None = None,
        max_sources: int | None = DEFAULT_MAX_SOURCES,
        max_chunks_per_source: int = DEFAULT_MAX_CHUNKS_PER_SOURCE,
    ) -> None:
        self.venice = venice
        self.web = web or WebSearch(scraper=venice.scrape)
        self.artifacts = artifacts or ArtifactWriter()
        self.progress = progress or (lambda _: None)
        self.max_sources = max_sources
        self.max_chunks_per_source = max_chunks_per_source
```

The `run()` method coordinates the research passes:

```python theme={"system"}
    def run(
        self,
        topic: str,
        *,
        iterations: int = DEFAULT_ITERATIONS,
        query_count: int = DEFAULT_QUERY_COUNT,
        results_per_query: int = DEFAULT_RESULTS_PER_QUERY,
    ) -> ResearchReport:
        notes: list[SourceNote] = []
        seen_source_keys: set[str] = set()
        seen_content_hashes: set[str] = set()
        queries = self._initial_queries(topic, query_count)

        self.artifacts.write("queries", {"stage": "initial", "topic": topic, "queries": queries})

        for iteration in range(1, iterations + 1):
            self.progress(f"Research pass {iteration}/{iterations}: {', '.join(queries)}")
            self._collect_notes(
                topic,
                queries,
                results_per_query,
                seen_source_keys,
                seen_content_hashes,
                notes,
                iteration,
            )

            if iteration < iterations:
                gaps, queries = self._gap_follow_up_queries(topic, notes, query_count)
                self.artifacts.write(
                    "research_gaps",
                    {
                        "topic": topic,
                        "after_iteration": iteration,
                        "source_balance": _source_cluster_counts(notes),
                        "gaps": gaps,
                        "queries": queries,
                    },
                )
                self.artifacts.write(
                    "queries",
                    {
                        "stage": "follow_up",
                        "topic": topic,
                        "iteration": iteration + 1,
                        "gap_count": len(gaps),
                        "queries": queries,
                    },
                )

        report = self._write_report(topic, notes)
        self.artifacts.write(
            "reports",
            {
                "topic": topic,
                "source_count": len(notes),
                "generated_at": utc_now(),
                "markdown": report,
            },
        )

        return ResearchReport(
            topic=topic,
            markdown=report,
            sources=notes,
            artifacts_dir=str(self.artifacts.root) if self.artifacts.root is not None else None,
        )
```

The two `seen_*` sets are what keep the agent from wasting time on duplicate sources. URL dedupe catches repeated links. Content hash dedupe catches mirrors, syndicated posts, and pages that redirect to the same final content.

## Planning Initial and Follow-up Searches

The first model call turns the topic into search queries:

```python theme={"system"}
    def _initial_queries(self, topic: str, count: int) -> list[str]:
        prompt = dedent(
            f"""
            Create {count} diverse web search queries for researching this topic:
            {topic}

            Cover background, recent developments, primary sources, criticism, and data.
            Include at least one query likely to find primary sources or datasets.
            Return JSON only in this shape: {{"queries": ["..."]}}
            """
        ).strip()
        return self._query_list(prompt, count, fallback=[topic])
```

After each research pass, the updated agent does a more deliberate gap-analysis step. It looks at the current notes, counts source clusters by domain, asks Venice what coverage is missing, writes those gaps to artifacts, and then uses the resulting queries for the next pass.

<img alt="Gap analysis loop" />

Start by tracking source balance:

```python theme={"system"}
from urllib.parse import urlparse


def _source_cluster_counts(notes: list[SourceNote]) -> list[dict[str, object]]:
    total = len(notes)
    if total == 0:
        return []

    clusters: dict[str, list[str]] = {}
    for note in notes:
        cluster = _source_cluster(note)
        clusters.setdefault(cluster, []).append(note.source_id)

    return [
        {
            "cluster": cluster,
            "source_count": len(source_ids),
            "source_share": round(len(source_ids) / total, 3),
            "source_ids": source_ids,
        }
        for cluster, source_ids in sorted(
            clusters.items(), key=lambda item: (-len(item[1]), item[0])
        )
    ]


def _source_cluster(note: SourceNote) -> str:
    url = note.canonical_url or note.final_url or note.url
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


def _source_balance_digest(notes: list[SourceNote], limit: int = 8) -> str:
    clusters = _source_cluster_counts(notes)
    if not clusters:
        return "No source clusters yet."

    total = len(notes)
    lines = [
        f"- {cluster['cluster']}: {cluster['source_count']}/{total} sources "
        f"({cluster['source_share']:.0%}); IDs: {', '.join(cluster['source_ids'])}"
        for cluster in clusters[:limit]
    ]
    return "\n".join(lines)
```

This gives the agent a simple way to notice source-cluster capture. If every source is coming from one company, one framework, or one domain, follow-up queries should deliberately broaden the source set instead of collecting more of the same.

Now use that balance information when creating follow-up searches:

```python theme={"system"}
    def _follow_up_queries(self, topic: str, notes: list[SourceNote], count: int) -> list[str]:
        digest = _source_digest(notes, max_chars=9000)
        source_balance = _source_balance_digest(notes)
        prompt = dedent(
            f"""
            We are researching: {topic}

            Current notes:
            {digest}

            Source balance:
            {source_balance}

            Create {count} follow-up web search queries that fill gaps, verify important claims,
            find primary evidence, and look for dissenting evidence.
            If one source domain, vendor, framework, product, or perspective is overrepresented,
            deliberately broaden beyond it unless the topic explicitly asks for that focus.
            Return JSON only in this shape: {{"queries": ["..."]}}
            """
        ).strip()
        return self._query_list(prompt, count, fallback=[topic])
```

The newer reference implementation wraps this in `_gap_follow_up_queries()`, which asks Venice to return both gap records and queries:

```python theme={"system"}
    def _gap_follow_up_queries(
        self, topic: str, notes: list[SourceNote], count: int
    ) -> tuple[list[dict[str, str]], list[str]]:
        if not notes:
            return [], [topic]

        digest = _source_digest(notes, max_chars=12000)
        source_balance = _source_balance_digest(notes)
        prompt = dedent(
            f"""
            Identify coverage gaps before the next research pass.

            Research topic:
            {topic}

            Current source notes:
            {digest}

            Source balance:
            {source_balance}

            Find important missing coverage that would improve a deep research report.
            Look specifically for primary sources, technical concepts, dissenting views,
            overrepresented source clusters, and claims that need verification.

            Return JSON only in this shape:
            {{"gaps": [{{"missing": "...", "why_it_matters": "...", "query": "..."}}],
              "queries": ["targeted web search query"]}}
            """
        ).strip()
        response = self.venice.chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=900,
        )

        data = json.loads(response)
        gaps = _clean_gap_records(data.get("gaps"))
        queries = _clean_string_list(data.get("queries"))
        if not queries:
            queries = [gap["query"] for gap in gaps if gap.get("query")]
        return gaps, queries[:count]
```

When `--artifacts` is enabled, these records are written to `research_gaps.jsonl`. That gives you a useful audit trail for why the agent searched for a particular second-pass query.

The parser should be forgiving. If the model returns malformed JSON, the agent falls back to the original topic:

```python theme={"system"}
    def _query_list(self, prompt: str, count: int, fallback: list[str]) -> list[str]:
        response = self.venice.chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=500,
        )
        try:
            data = json.loads(response)
            queries = data.get("queries", [])
        except (json.JSONDecodeError, AttributeError):
            queries = []

        clean_queries = [
            query.strip()
            for query in queries
            if isinstance(query, str) and query.strip()
        ]
        return (clean_queries or fallback)[:count]
```

This pattern is worth using throughout agent code: ask for structured output, parse it, and provide a simple fallback when the output is not usable.

## Reading and Summarizing Sources

Now we collect source notes. The agent searches each query, fetches each result through Venice scrape, chunks the Markdown, and summarizes the useful evidence.

```python theme={"system"}
    def _collect_notes(
        self,
        topic: str,
        queries: list[str],
        results_per_query: int,
        seen_source_keys: set[str],
        seen_content_hashes: set[str],
        notes: list[SourceNote],
        iteration: int,
    ) -> None:
        for query in queries:
            if self.max_sources is not None and len(notes) >= self.max_sources:
                return

            self.progress(f"Searching: {query}")
            try:
                results = self.web.search(query, limit=results_per_query)
            except Exception as exc:
                self._record_error("search", exc, query=query)
                continue

            self.artifacts.write(
                "search_results",
                {"iteration": iteration, "query": query, "results": results},
            )

            for result in results:
                if self.max_sources is not None and len(notes) >= self.max_sources:
                    return

                source_key = result.canonical_url or result.url
                if source_key in seen_source_keys:
                    self.artifacts.write("dedupe", {"reason": "canonical_url", "url": result.url})
                    continue

                seen_source_keys.add(source_key)
                source_id = f"S{len(notes) + 1}"
                note = self._read_source(topic, query, source_id, result, seen_source_keys, seen_content_hashes)
                if note is not None:
                    notes.append(note)
```

Individual search and fetch failures should not stop the whole run. The public web is messy. Some pages block scraping, some return PDFs, some are down, and some redirect to unexpected places. A research agent should keep moving and record what failed.

Here is the source-reading method:

```python theme={"system"}
    def _read_source(
        self,
        topic: str,
        query: str,
        source_id: str,
        result: SearchResult,
        seen_source_keys: set[str],
        seen_content_hashes: set[str],
    ) -> SourceNote | None:
        self.progress(f"Reading {source_id}: {result.title}")
        try:
            page = self.web.fetch(result)
        except Exception as exc:
            self._record_error("fetch", exc, query=query, url=result.url, source_id=source_id)
            return None

        if page.content_hash in seen_content_hashes:
            self.artifacts.write(
                "dedupe",
                {"reason": "content_hash", "source_id": source_id, "url": result.url},
            )
            return None
        seen_content_hashes.add(page.content_hash)

        chunks = self._summarize_chunks(topic, query, source_id, page)
        if not chunks:
            self._record_error("summarize_chunk", VeniceError("no chunks could be summarized"), url=result.url)
            return None

        summary = self._summarize_source(topic, query, source_id, page, chunks)
        note = SourceNote(
            source_id=source_id,
            title=page.title,
            url=result.url,
            canonical_url=page.canonical_url,
            final_url=page.final_url,
            query=query,
            rank=result.rank,
            snippet=result.snippet,
            provider=result.provider,
            retrieved_at=page.retrieved_at,
            content_type=page.content_type,
            content_hash=page.content_hash,
            chunks=chunks,
            summary=summary,
        )
        self.artifacts.write("source_notes", note)
        return note
```

For each source chunk, ask Venice for a short evidence summary and exact quotes:

```python theme={"system"}
    def _summarize_chunks(
        self,
        topic: str,
        query: str,
        source_id: str,
        page: WebPage,
    ) -> tuple[EvidenceChunk, ...]:
        evidence: list[EvidenceChunk] = []
        for chunk in page.chunks[: self.max_chunks_per_source]:
            prompt = dedent(
                f"""
                Topic: {topic}
                Search query: {query}
                Source ID: {source_id}
                Chunk ID: {chunk.chunk_id}
                Source title: {page.title}
                Source URL: {page.final_url}

                Source chunk:
                {chunk.text}

                Extract only evidence relevant to the topic.
                Return JSON only in this shape:
                {{"summary": "...", "quotes": ["short exact quote", "..."]}}
                """
            ).strip()

            try:
                response = self.venice.chat(
                    [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=600,
                )
                data = json.loads(response)
                evidence.append(
                    EvidenceChunk(
                        chunk_id=chunk.chunk_id,
                        text=chunk.text,
                        summary=str(data.get("summary", "")).strip(),
                        quotes=tuple(
                            quote.strip()
                            for quote in data.get("quotes", [])
                            if isinstance(quote, str) and quote.strip()
                        ),
                    )
                )
            except Exception as exc:
                self._record_error("summarize_chunk", exc, query=query, url=page.final_url, source_id=source_id)
                continue

        return tuple(evidence)
```

Then collapse the chunk summaries into a source note:

```python theme={"system"}
    def _summarize_source(
        self,
        topic: str,
        query: str,
        source_id: str,
        page: WebPage,
        chunks: tuple[EvidenceChunk, ...],
    ) -> str:
        chunk_digest = _chunk_digest(chunks, max_chars=9000)
        prompt = dedent(
            f"""
            Topic: {topic}
            Search query: {query}
            Source ID: {source_id}
            Source title: {page.title}
            Source URL: {page.final_url}

            Chunk evidence:
            {chunk_digest}

            Synthesize a source note using only the chunk evidence. Include:
            - key facts with dates/numbers where present
            - any limitations or bias in the source
            - useful exact wording from quotes if it is short

            Keep the note under 180 words and refer to the source as [{source_id}].
            """
        ).strip()
        return self.venice.chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=500,
        )
```

This two-step summarization is the part that makes the agent feel more reliable than a basic "summarize these URLs" script. The model reads source chunks first, then writes a source-level note from those extracted pieces of evidence.

## Writing the Final Report

Once the agent has source notes, it can write the report. Start with a single-pass report writer:

```python theme={"system"}
    def _write_report(self, topic: str, notes: list[SourceNote]) -> str:
        if not notes:
            return (
                f"# Research report: {topic}\n\n"
                "No usable web sources were collected. Check your network connection or try a narrower topic."
            )

        prompt = dedent(
            f"""
            Research topic:
            {topic}

            Source notes:
            {_source_digest(notes, max_chars=45000)}

            Write a detailed source-backed Markdown research survey.

            Requirements:
            - Start with a precise H1 title.
            - Open with "## Overview".
            - Use topic-specific sections.
            - Use footnote-style citation markers like [^1] and [^2].
            - Do not cite with internal source IDs like [S1] in the report body.
            - Do not include uncited factual claims.
            - Avoid source-cluster capture from one vendor, domain, framework, or viewpoint.
            - Include uncertainty, contradictions, and missing context where relevant.
            - End with "## References" as a numbered list ordered by first citation.
            """
        ).strip()

        return self.venice.chat_stream(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=7000,
        )
```

The reference implementation goes further for deep reports: it asks Venice for an outline, drafts each report section separately, then asks a final editor pass to assemble the finished report and convert internal source IDs into footnote-style citations.

That staged approach is useful when you want long-form research output because one giant prompt often compresses too much. The updated prompts also push the report toward a broad, source-backed survey instead of a thin decision guide. If the source base is skewed toward one cluster, the editor prompt tells Venice to acknowledge that skew and avoid presenting it as representative of the whole field.

Add the digest helpers:

```python theme={"system"}
def _chunk_digest(chunks: tuple[EvidenceChunk, ...], max_chars: int) -> str:
    parts = []
    for chunk in chunks:
        quote_text = "; ".join(chunk.quotes)
        parts.append(
            f"{chunk.chunk_id}: {chunk.summary}"
            + (f"\nQuotes: {quote_text}" if quote_text else "")
        )
    return "\n\n".join(parts)[:max_chars]


def _source_digest(notes: list[SourceNote], max_chars: int) -> str:
    chunks = [
        "\n".join(
            [
                f"[{note.source_id}] {note.title}",
                f"URL: {note.final_url or note.url}",
                f"Canonical URL: {note.canonical_url}",
                f"Found via: {note.query}",
                f"Provider/rank: {note.provider}/{note.rank}",
                f"Retrieved: {note.retrieved_at}",
                f"Content hash: {note.content_hash}",
                f"Note: {note.summary}",
                f"Chunk evidence: {_chunk_digest(note.chunks, max_chars=1000)}",
            ]
        )
        for note in notes
    ]
    return "\n\n".join(chunks)[:max_chars]
```

Finally, add error recording:

```python theme={"system"}
    def _record_error(
        self,
        stage: str,
        exc: Exception,
        *,
        query: str = "",
        url: str = "",
        source_id: str = "",
        provider: str = "",
    ) -> None:
        message = str(exc)
        self.progress(f"{stage.replace('_', ' ').title()} failed: {message}")
        self.artifacts.write(
            "errors",
            CollectionError(
                stage=stage,
                message=message,
                query=query,
                url=url,
                source_id=source_id,
                provider=provider,
            ),
        )
```

At this point, the core research loop is in place.

## Adding the CLI

Now we need a command-line entry point. Create `main.py`:

```python theme={"system"}
from __future__ import annotations

import argparse
from pathlib import Path

from dotenv import load_dotenv

from research_agent.agent import (
    DEFAULT_ITERATIONS,
    DEFAULT_MAX_CHUNKS_PER_SOURCE,
    DEFAULT_MAX_SOURCES,
    DEFAULT_QUERY_COUNT,
    DEFAULT_REPORT_STYLE,
    DEFAULT_RESULTS_PER_QUERY,
    ResearchAgent,
)
from research_agent.artifacts import ArtifactWriter
from research_agent.venice import VeniceClient, VeniceError
from research_agent.web import WebSearch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a minimal deep research agent powered by Venice AI.",
    )
    parser.add_argument("topic", nargs="+", help="Research topic, wrapped in quotes for best results.")
    parser.add_argument("--model", help="Venice model name. Defaults to VENICE_MODEL or openai-gpt-55.")
    parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS)
    parser.add_argument("--queries", type=int, default=DEFAULT_QUERY_COUNT)
    parser.add_argument("--results", type=int, default=DEFAULT_RESULTS_PER_QUERY)
    parser.add_argument("--output", "--markdown-output", dest="output", type=Path)
    parser.add_argument("--artifacts", type=Path, help="Optional directory for JSONL research artifacts.")
    parser.add_argument("--providers", default="duckduckgo", help="Comma-separated providers: duckduckgo, arxiv.")
    parser.add_argument("--max-sources", type=int, default=DEFAULT_MAX_SOURCES)
    parser.add_argument("--chunk-chars", type=int, default=3000)
    parser.add_argument("--max-chunks-per-source", type=int, default=DEFAULT_MAX_CHUNKS_PER_SOURCE)
    parser.add_argument(
        "--report-style",
        choices=["brief", "standard", "deep"],
        default=DEFAULT_REPORT_STYLE,
        help=f"Final report depth. Default: {DEFAULT_REPORT_STYLE}.",
    )
    parser.add_argument("--quiet", action="store_true", help="Hide progress messages.")
    return parser.parse_args()
```

The CLI exposes the knobs you'll actually tune during research:

| Option                    | What it controls                                             |
| ------------------------- | ------------------------------------------------------------ |
| `--iterations`            | Number of research passes                                    |
| `--queries`               | Search queries generated per pass                            |
| `--results`               | Results read per provider for each query                     |
| `--providers`             | Search providers, such as `duckduckgo` or `duckduckgo,arxiv` |
| `--max-sources`           | Maximum usable sources to collect                            |
| `--chunk-chars`           | Approximate chunk size before source evidence extraction     |
| `--max-chunks-per-source` | Number of chunks summarized per source                       |
| `--report-style`          | Final report depth: `brief`, `standard`, or `deep`           |
| `--artifacts`             | Directory for JSONL audit records                            |
| `--output`                | Path for the final Markdown report                           |

Now wire everything together:

```python theme={"system"}
def main() -> int:
    load_dotenv()
    args = parse_args()
    topic = " ".join(args.topic)

    try:
        venice = VeniceClient.from_env(model=args.model)
        progress = None if args.quiet else lambda message: print(f"[agent] {message}")
        provider_names = [name.strip() for name in args.providers.split(",") if name.strip()]

        with WebSearch.from_provider_names(
            provider_names,
            chunk_chars=args.chunk_chars,
            scraper=venice.scrape,
        ) as web:
            agent = ResearchAgent(
                venice=venice,
                web=web,
                artifacts=ArtifactWriter(args.artifacts),
                progress=progress,
                max_sources=args.max_sources,
                max_chunks_per_source=args.max_chunks_per_source,
                report_style=args.report_style,
            )
            report = agent.run(
                topic,
                iterations=args.iterations,
                query_count=args.queries,
                results_per_query=args.results,
            )
    except ValueError as exc:
        print(f"Configuration error: {exc}")
        return 1
    except VeniceError as exc:
        print(f"Venice API error: {exc}")
        return 1

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report.markdown, encoding="utf-8")
        print(f"\nSaved report to {args.output}")
    else:
        print()
        print(report.markdown)

    if report.artifacts_dir:
        print(f"Saved research artifacts to {report.artifacts_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

This gives us a working local research CLI.

## Running the Agent

Run a quick research pass:

```bash theme={"system"}
uv run python main.py "How are AI agents changing software engineering workflows?"
```

Write the report to a Markdown file:

```bash theme={"system"}
uv run python main.py "state of open source LLM inference in 2026" \
  --output reports/inference.md
```

Use more sources and multiple providers:

```bash theme={"system"}
uv run python main.py "agentic coding research" \
  --providers duckduckgo,arxiv \
  --iterations 3 \
  --queries 5 \
  --results 4 \
  --max-sources 12
```

Choose the final report style:

```bash theme={"system"}
uv run python main.py "AI agents in software engineering" --report-style deep
```

Use `brief` for a concise source-backed briefing, `standard` for a fuller survey, and `deep` for the staged outline/section/editor workflow.

Save auditable artifacts:

```bash theme={"system"}
uv run python main.py "privacy tradeoffs in hosted LLM APIs" \
  --output reports/privacy.md \
  --artifacts runs/privacy
```

When artifacts are enabled, you'll see files like:

```text theme={"system"}
runs/privacy/
  queries.jsonl
  research_gaps.jsonl
  search_results.jsonl
  fetches.jsonl
  source_chunks.jsonl
  chunk_summaries.jsonl
  source_notes.jsonl
  dedupe.jsonl
  errors.jsonl
  report_outline.jsonl
  report_sections.jsonl
  report_editor.jsonl
  reports.jsonl
```

These files are useful when you want to understand how the agent reached a conclusion. For example, `source_notes.jsonl` shows the summarized source evidence, `research_gaps.jsonl` shows why follow-up searches were generated, and `errors.jsonl` shows pages that failed during search, scraping, or summarization.

## Privacy and Reliability Notes

A research agent touches several systems, so it helps to be precise about what goes where:

<img alt="Private research agent data boundaries" />

| Layer                   | What sees the data                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Local CLI               | Topic, configuration, source notes, artifacts, and final reports stay on your machine       |
| Search provider         | Search queries are sent to the provider you choose, such as DuckDuckGo or arXiv             |
| Venice scrape           | Public source URLs are sent to Venice's scrape endpoint                                     |
| Venice chat completions | Prompts, source chunks, source notes, and report-generation instructions are sent to Venice |
| Output files            | Markdown reports and JSONL artifacts are written locally                                    |

If you want to keep more of the search path inside Venice, you can adapt the provider layer to call Venice's `POST /augment/search` endpoint instead of querying DuckDuckGo directly. The reference implementation uses lightweight public providers so the demo stays easy to run and understand.

For reliability, keep these defaults conservative:

* Use retries for Venice calls and web requests.
* Add a small `--request-delay` if you are reading many pages from the same host.
* Cap `--max-sources` so broad topics do not run indefinitely.
* Save `--artifacts` for important reports so you can audit the final output.
* Treat the report as a briefing, not ground truth. Follow citations back to the original source when accuracy matters.

## Testing the Pieces

You do not need live web requests or Venice calls to test most of the system. The reference repo uses fake Venice and fake web classes to test the research loop, dedupe behavior, artifacts, and report prompts.

A useful first test is URL canonicalization:

```python theme={"system"}
from research_agent.models import canonicalize_url


def test_canonicalize_url_removes_tracking_params():
    url = "https://example.com/post?utm_source=x&b=2&a=1#section"
    assert canonicalize_url(url) == "https://example.com/post?a=1&b=2"
```

Then test that duplicate content gets skipped:

```python theme={"system"}
from research_agent.models import SearchResult, WebPage, chunk_text


class FakeWeb:
    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        return [
            SearchResult(title="First source", url="https://example.com/a", snippet="snippet"),
            SearchResult(title="Mirror", url="https://example.com/b", snippet="snippet"),
        ]

    def fetch(self, result: SearchResult) -> WebPage:
        text = "This page contains relevant evidence. " * 5
        return WebPage(
            title=result.title,
            url=result.url,
            final_url=result.url,
            text=text,
            content_hash="same-content",
            chunks=chunk_text(text, chunk_chars=80, overlap=10),
        )
```

Fakes make agent tests much faster and less flaky. You can verify the orchestration logic without relying on live search results, network conditions, or model output.

## Benchmarking

Many AI providers now have their own deep research workflows, so the reference repo includes a simple benchmark against Perplexity's Deep Research tool. Both agents were asked to write a report on AI agent framework architecture, then the generated reports were checked into [the GitHub repo](https://github.com/joshua-mo-143/venice-research-agent-demo/tree/main/reports).

This is not meant to be a formal benchmark. It is a practical way to inspect report structure, source coverage, citation quality, and whether the agent over-focuses on one source cluster. That is also why the updated implementation tracks `research_gaps.jsonl` and source balance before follow-up searches.

## Extending This Example

Once the baseline agent works, here are practical ways to improve it:

* Add a Venice search provider using `POST /augment/search`.
* Store reports and artifacts in a small SQLite database instead of JSONL files.
* Add source allowlists or blocklists for trusted research domains.
* Add PDF support by combining Venice scrape with document parsing for sources that do not expose clean HTML.
* Add an evaluation set of topics and expected source types so you can compare research quality after prompt changes.
* Add a review step that asks Venice to find unsupported claims in the final report before saving it.

The biggest upgrade is usually better source selection. Query generation helps, but you can also improve quality by preferring primary sources, standards documents, official docs, papers, changelogs, and dataset pages over low-signal summaries.

## Finishing Up

Thanks for reading! Hopefully this helped you build a practical private research agent with Python and the Venice API.

The useful pattern here is not just "ask a model to research something." It is breaking research into auditable steps: plan searches, collect sources, extract evidence, write source notes, follow up on gaps, and synthesize with citations. By keeping those steps explicit, we get a research workflow that is easier to inspect, test, and improve over time.


# Building a Codebase Security Reviewer
Source: https://docs.venice.ai/guides/projects/security-code-reviewer



<AuthorByline name="Joshua Mo" />

Most static security tools find bugs in isolation. They scan one file, list the issues, and move on. The problem is that the most damaging vulnerabilities in modern codebases are rarely a single bug. They're a chain: a hardcoded signing key plus a missing authorization check plus a SQL injection that, on their own, all look manageable. Together they're an account-takeover path.

This is exactly the kind of cross-cutting reasoning LLMs are good at, if you give them the right structure. In this article, we'll build a two-agent security code reviewer using Python and the Venice AI API. By the end, you'll have a CLI you can point at any Python codebase to produce a Markdown report with atomic findings and exploit chains.

Interested in the full code implementation? Check out [the GitHub repo.](https://github.com/joshua-mo-143/venice-security-agent-demo)

Before we continue, you'll need a Venice API key. Export it as an environment variable:

```bash theme={"system"}
export VENICE_API_KEY=<my-key>
```

## What We're Building

The reviewer is a small Python project with a few clear parts:

| Part                | What it does                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pydantic models     | Define `Evidence`, `Finding`, and `Chain`, and give us a hard validation boundary between the LLM and the rest of the program                        |
| Venice client       | Wraps the OpenAI Python SDK pointed at Venice's OpenAI-compatible endpoint                                                                           |
| AST repo map        | Walks the target tree with Python's `ast` module and builds a deterministic map of every module's public symbols and import edges                    |
| Scanner agent       | Reads one Python file at a time plus a per-file neighbourhood slice of the repo map, and emits atomic vulnerability findings with file:line evidence |
| Chainer agent       | Reads the union of findings plus a condensed full repo map, and emits exploit chains that combine two or more findings                               |
| Reference validator | Drops any chain that references a finding ID the Scanner did not produce, or names a file none of its referenced findings actually came from         |
| Markdown report     | Renders findings and chains into a human-readable report                                                                                             |
| CLI                 | Wires everything together with Typer                                                                                                                 |

The flow looks like this:

1. Walk the target directory for `.py` files.
2. Build a deterministic repo map (imports, public symbols, signatures).
3. For each file, send the Scanner its source plus a per-file neighbourhood slice of the map and collect atomic findings.
4. Send the union of findings plus the condensed repo map to the Chainer and collect exploit chains.
5. Drop any chain that references a finding ID the Scanner did not produce, or that names a file none of its referenced findings actually came from.
6. Write a Markdown report.

Two design decisions are worth flagging before we start writing code.

The first is **why two agents instead of one**. A single-agent scanner that tries to do everything in one prompt has to balance being thorough about per-file bugs against being clever about combinatorial reasoning. Splitting the work means the Scanner can be relentless and noisy, and the Chainer can be selective and quiet. Adding one extra LLM call dedicated to combining findings unlocks an entire class of bug for very little extra code.

The second is **why a repo map**. Real codebases live across many files. A bug that consists of "the validator runs but doesn't apply per-iteration in the fetcher, and the fetcher's response ends up in the renderer" is invisible to a per-file scanner. Before any LLM call, we walk the target tree with Python's `ast` and build a structural map. The Scanner sees a per-file *neighbourhood* (who imports from this file, what this file imports, signatures of those external symbols). The Chainer sees a *condensed* full map (every module, every public symbol, every import edge, no source). That's the smallest amount of context engineering we have found that lets the Chainer construct chains whose data flow crosses module boundaries, without paying the token cost of stuffing the whole codebase into every prompt.

## Pre-requisites

* Python 3.12+
* A Venice API key from [venice.ai](https://venice.ai)
* Basic familiarity with Pydantic, Python's `ast` module, and the OpenAI Python SDK

The reference repo uses [`uv`](https://docs.astral.sh/uv/) for dependency management, but a regular virtual environment works just as well.

## Setting Up the Project

Create a new project and install the dependencies:

```bash theme={"system"}
mkdir venice-security-reviewer
cd venice-security-reviewer
uv init
uv add "openai>=1.54" "pydantic>=2.9" "typer>=0.12" "jinja2>=3.1" "python-dotenv>=1.0" "rich>=13.0"
```

If you prefer `pip`, create a virtual environment instead:

```bash theme={"system"}
python -m venv .venv
source .venv/bin/activate
pip install "openai>=1.54" "pydantic>=2.9" "typer>=0.12" "jinja2>=3.1" "python-dotenv>=1.0" "rich>=13.0"
```

Create a `.env` file for local development:

```bash theme={"system"}
VENICE_API_KEY=your-venice-api-key-here
# Optional overrides
# VENICE_BASE_URL=https://api.venice.ai/api/v1
# VENICE_MODEL=zai-org-glm-5
```

We'll lay the source out under `src/venice_security_reviewer/` to keep it importable as a package, with prompts under `prompts/` at the repo root so they can be reviewed and diffed like any other source artefact:

```
src/venice_security_reviewer/
  __init__.py
  models.py     # Pydantic models
  client.py     # Venice client factory
  repo_map.py   # AST-built repo map
  scanner.py    # Scanner agent
  chainer.py    # Chainer agent
  report.py     # Jinja2 Markdown rendering
  cli.py        # Typer CLI
  templates/
    report.md.j2
prompts/
  scanner.md
  chainer.md
tests/
  test_models.py
  test_cross_file_chain.py
```

## Setting Up the Venice Client

Venice is OpenAI-compatible, so we can use the official OpenAI Python SDK and just point its `base_url` at Venice. Centralising the client construction in one file means the rest of the code never has to know which provider it's talking to: swapping backends would only touch this one module.

Create `src/venice_security_reviewer/client.py`:

```python theme={"system"}
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
from openai import OpenAI

DEFAULT_BASE_URL = "https://api.venice.ai/api/v1"
DEFAULT_MODEL = "zai-org-glm-5"


class VeniceConfigError(RuntimeError):
    """Raised when Venice client config is missing or invalid."""


@dataclass(frozen=True, slots=True)
class VeniceConfig:
    api_key: str
    base_url: str
    model: str

    @classmethod
    def from_env(cls) -> "VeniceConfig":
        load_dotenv()
        api_key = os.getenv("VENICE_API_KEY")
        if not api_key:
            raise VeniceConfigError(
                "VENICE_API_KEY is not set. Add it to your .env file, "
                "or export VENICE_API_KEY in your shell."
            )
        return cls(
            api_key=api_key,
            base_url=os.getenv("VENICE_BASE_URL", DEFAULT_BASE_URL),
            model=os.getenv("VENICE_MODEL", DEFAULT_MODEL),
        )


def build_client(config: VeniceConfig | None = None) -> tuple[OpenAI, str]:
    cfg = config or VeniceConfig.from_env()
    client = OpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
    return client, cfg.model
```

A few things worth noting:

* We default to `zai-org-glm-5` because it's a strong general-purpose Venice model, but you can override it with the `VENICE_MODEL` environment variable. For larger or more nuanced codebases, swapping in a stronger model can make the Chainer notably better at narrative quality.
* `build_client` returns the client *and* the model id, so callers don't have to read environment variables themselves and tests can inject a fake config without monkeypatching.

## Defining the Data Models

The whole point of using Pydantic here, rather than passing raw dicts around, is that we get a hard validation boundary between the LLM and the rest of the program. If the model returns malformed JSON or invents a finding ID that doesn't exist, parsing fails loudly and we never propagate the hallucination into the report.

Create `src/venice_security_reviewer/models.py`:

```python theme={"system"}
from __future__ import annotations

from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Severity = Literal["low", "medium", "high", "critical"]
ChainSeverity = Literal["high", "critical"]


class Evidence(BaseModel):
    """A concrete code span that justifies a finding."""

    model_config = ConfigDict(frozen=True)

    file: Path
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    snippet: str

    @model_validator(mode="after")
    def _check_line_range(self) -> Self:
        if self.end_line < self.start_line:
            raise ValueError(
                f"end_line ({self.end_line}) must be >= start_line ({self.start_line})"
            )
        return self


class Finding(BaseModel):
    """An atomic vulnerability surfaced by the Scanner agent."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^F-\d{3,}$")
    title: str = Field(min_length=1)
    severity: Severity
    description: str = Field(min_length=1)
    cwe: str | None = None
    evidence: Evidence


class Chain(BaseModel):
    """An exploit chain combining two or more atomic findings."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^C-\d{3,}$")
    findings: list[str] = Field(min_length=2)
    narrative: str = Field(min_length=1)
    severity: ChainSeverity
    files_involved: list[Path] = Field(min_length=1)
```

The constraints are doing real work here:

* `Finding.id` and `Chain.id` are constrained to a regex like `F-001`, `C-001`. If the model gets creative with the format, validation fails.
* `Chain.findings` requires at least two entries: a "chain" of one finding is just a finding.
* `Chain.severity` is restricted to `high` or `critical`. A combination of findings that doesn't raise the impact above the highest individual severity isn't a chain worth reporting.
* `Evidence` enforces that `end_line >= start_line` so the model can't return nonsensical line ranges.

That's the *shape* validation. We also need *cross-reference* validation: a chain that references a finding ID the Scanner never produced is meaningless. Add this function to `models.py`:

```python theme={"system"}
def validate_chain_references(
    chains: list[Chain], findings: list[Finding]
) -> tuple[list[Chain], list[Chain]]:
    findings_by_id = {f.id: f for f in findings}
    valid: list[Chain] = []
    dropped: list[Chain] = []
    for chain in chains:
        if not all(ref in findings_by_id for ref in chain.findings):
            dropped.append(chain)
            continue
        chain_evidence_files = {
            findings_by_id[ref].evidence.file.as_posix() for ref in chain.findings
        }
        if not all(p.as_posix() in chain_evidence_files for p in chain.files_involved):
            dropped.append(chain)
            continue
        valid.append(chain)
    return valid, dropped
```

This is the deterministic guardrail that keeps the Chainer honest. It can only reference findings the Scanner actually produced, and it can only claim files involved in the chain that one of those findings actually came from. Returning the dropped chains rather than silently filtering them lets the CLI surface a warning when the model tries to invent something.

## Building the AST Repo Map

The repo map is the structural skeleton of a Python codebase: every module's public surface, every import edge, and a reverse index from "module M" to "modules that import from M". It's built once per scan run with Python's `ast`, never via execution, so it's safe to run on adversarial code: the parser doesn't import or invoke anything from the scanned tree.

We'll consume the map in two shapes. The Scanner gets a per-file *neighbourhood* slice so its prompts stay bounded in size. The Chainer gets a *condensed* full map so it can construct chains across files.

Create `src/venice_security_reviewer/repo_map.py` and start with the Pydantic models that describe the map:

```python theme={"system"}
from __future__ import annotations

import ast
import logging
from collections.abc import Iterable
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

SymbolKind = Literal["function", "class", "constant"]
_SIGNATURE_CHAR_CAP = 200

SKIP_DIR_NAMES: frozenset[str] = frozenset({
    ".git", ".venv", "venv", "env", "__pycache__", "node_modules",
    "dist", "build", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "site-packages",
})


class SymbolDef(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str
    kind: SymbolKind
    line: int = Field(ge=1)
    signature: str | None = None


class ImportEdge(BaseModel):
    model_config = ConfigDict(frozen=True)
    from_module: str
    imported_names: list[str]
    line: int = Field(ge=1)


class ModuleEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    path: Path
    module_name: str
    defines: list[SymbolDef]
    imports: list[ImportEdge]
    exports: list[str]
```

Now the helper that walks the tree and skips directories we shouldn't index:

```python theme={"system"}
def _iter_python_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*.py")):
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        if path.is_file():
            yield path


def _path_to_module_name(path: Path, root: Path) -> str:
    rel = path.relative_to(root)
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)
```

For each file we want three things out of the AST: the top-level symbols it defines, the import edges, and an explicit `__all__` list if one is present. Function signatures and class headers get rendered as compact strings the LLM can read directly:

```python theme={"system"}
def _render_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    try:
        prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
        args = ast.unparse(node.args)
        returns = f" -> {ast.unparse(node.returns)}" if node.returns is not None else ""
        sig = f"{prefix}{node.name}({args}){returns}"
        if len(sig) > _SIGNATURE_CHAR_CAP:
            return f"{prefix}{node.name}(...)"
        return sig
    except Exception:
        return f"def {node.name}(...)"


def _render_class_header(node: ast.ClassDef) -> str:
    try:
        bases = [ast.unparse(b) for b in node.bases]
        sig = f"class {node.name}({', '.join(bases)})" if bases else f"class {node.name}"
        if len(sig) > _SIGNATURE_CHAR_CAP:
            return f"class {node.name}(...)"
        return sig
    except Exception:
        return f"class {node.name}"
```

The `_SIGNATURE_CHAR_CAP` of 200 preserves typical real signatures (including type hints) while preventing pathological cases like a 200-line typed union from blowing up the prompt.

Next, the extractor that pulls the structural data out of a parsed module. We handle `ast.FunctionDef`, `ast.ClassDef`, top-level `ast.Assign` and `ast.AnnAssign` for constants, and both `ast.Import` and `ast.ImportFrom` for the import edges. Relative imports get resolved into their absolute dotted form so the Chainer can match them against module names later:

```python theme={"system"}
def _resolve_relative_package(
    *, importer_module: str, importer_is_init: bool, level: int
) -> str | None:
    if level <= 0:
        return None
    importer_parts = importer_module.split(".") if importer_module else []
    base_parts = list(importer_parts) if importer_is_init else importer_parts[:-1]
    steps_up = level - 1
    if steps_up > len(base_parts):
        return None
    package_parts = (
        base_parts[: len(base_parts) - steps_up] if steps_up else list(base_parts)
    )
    return ".".join(package_parts)
```

The full extraction logic walks `tree.body` and emits `SymbolDef` and `ImportEdge` entries for each top-level node. The reference repo's `_extract` function in [`repo_map.py`](https://github.com/joshua-mo-143/venice-security-agent-demo/blob/main/src/venice_security_reviewer/repo_map.py) covers the full implementation. The shape that comes out is a list of `ModuleEntry` objects, one per file.

The interesting part is what we do with those entries. Wrap them in a `RepoMap` with two consumer-facing methods:

```python theme={"system"}
class RepoMap(BaseModel):
    model_config = ConfigDict(frozen=True)
    root: Path
    modules: list[ModuleEntry]

    def by_module_name(self, module_name: str) -> ModuleEntry | None:
        for m in self.modules:
            if m.module_name == module_name:
                return m
        return None

    def importers_of(self, module_name: str) -> list["ImportingRef"]:
        refs: list["ImportingRef"] = []
        for m in self.modules:
            for edge in m.imports:
                if edge.from_module == module_name:
                    refs.append(
                        ImportingRef(
                            importer_path=m.path,
                            importer_module=m.module_name,
                            imported_names=list(edge.imported_names),
                            line=edge.line,
                        )
                    )
        return refs

    def neighborhood(self, path: Path) -> "ModuleNeighborhood | None":
        m = next((mod for mod in self.modules if mod.path == path), None)
        if m is None:
            return None
        return ModuleNeighborhood(
            this_module=m,
            imported_by=self.importers_of(m.module_name),
            imports_from_repo=self.resolve_imports_in_repo(m.module_name),
        )

    def condensed_dict(self) -> dict[str, object]:
        return {
            "modules": [
                {
                    "path": str(m.path),
                    "module": m.module_name,
                    "exports": list(m.exports),
                    "imports": [
                        {"from": e.from_module, "names": list(e.imported_names)}
                        for e in m.imports
                    ],
                }
                for m in self.modules
            ]
        }
```

`neighborhood(path)` is what the Scanner calls for each file. It returns a `ModuleNeighborhood` object containing the module itself, every other module that imports from it, and every in-repo symbol it imports from elsewhere (with their resolved signatures). That gives the Scanner enough context to flag findings that are only obvious in cross-file context, without dragging the whole codebase into the prompt.

`condensed_dict()` is what the Chainer gets. Snippets and signatures are dropped; only paths, module names, public exports, and import edges remain. That's the smallest representation that still lets the Chainer reason about cross-module data flow.

Finally, the entry point that builds the whole thing:

```python theme={"system"}
def build_repo_map(root: Path) -> RepoMap:
    root = root.resolve()
    modules: list[ModuleEntry] = []
    for path in _iter_python_files(root):
        rel = path.relative_to(root)
        module_name = _path_to_module_name(path, root)
        is_init = path.stem == "__init__"
        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
        except (OSError, SyntaxError, UnicodeDecodeError) as exc:
            logger.warning("repo_map: skipping %s: %s", rel, exc)
            continue
        defines, imports, explicit_all = _extract(
            tree, importer_module=module_name, importer_is_init=is_init
        )
        exports = explicit_all or [s.name for s in defines if not s.name.startswith("_")]
        modules.append(
            ModuleEntry(
                path=rel,
                module_name=module_name,
                defines=defines,
                imports=imports,
                exports=exports,
            )
        )
    return RepoMap(root=root, modules=modules)
```

Files we can't read or that fail to parse get logged and skipped. We return a partial map rather than failing the whole run; the worst case is that a Scanner call sees no neighbourhood for one file, which is still a working scan.

## Writing the Scanner Agent

The Scanner walks a target path, picks up Python source files, and asks Venice to identify atomic vulnerabilities one file at a time. Per-file scanning keeps the prompt small and makes failures isolated: one bad file doesn't kill the whole run.

We'll keep the prompt itself in a separate file so it can be reviewed and diffed like any other source artefact. Create `prompts/scanner.md`:

````markdown theme={"system"}
You are a static security analyst reviewing a single Python source file for
vulnerabilities. You will be given the file path, its full contents, and a
*neighborhood* slice of the surrounding repo: which other modules import
from this file (and what symbols they pull), and which in-repo symbols this
file imports from elsewhere. You must respond with a JSON object that lists
every distinct vulnerability you can identify, with concrete file:line
evidence for each.

# Rules

1. Output a single JSON object. No prose before or after. No markdown fences.
2. The object must match this schema exactly:

```json
{
  "findings": [
    {
      "id": "F-001",
      "title": "Short imperative title, e.g. 'Hardcoded session signing key'",
      "severity": "low | medium | high | critical",
      "description": "One to three sentences explaining the vulnerability and why it matters.",
      "cwe": "CWE-798 or null if not applicable",
      "evidence": {
        "file": "{filename}",
        "start_line": 12,
        "end_line": 14,
        "snippet": "the exact lines from the source, copied verbatim including whitespace"
      }
    }
  ]
}
```

3. Finding IDs must be sequential within this file: F-001, F-002, F-003, etc.
4. The `file` field in evidence must equal the filename you were given, exactly.
5. `start_line` and `end_line` must be 1-indexed line numbers from the source you were given.
6. The `snippet` must be the exact text of those lines, copied verbatim. Do not paraphrase. Do not truncate.
7. Do not invent vulnerabilities. If you are unsure, omit it. False positives waste the operator's time and erode trust in the tool.
8. Every finding's evidence must point at lines in THIS file. Do not produce findings whose evidence lives in a different file. The Chainer is the agent that reasons across files.
9. If the file contains no vulnerabilities, return `{"findings": []}`.
````

The full prompt in the [reference repo](https://github.com/joshua-mo-143/venice-security-agent-demo/blob/main/prompts/scanner.md) also contains a "What to look for" section listing common vulnerability classes (hardcoded secrets, SQL injection, command injection, SSRF, insecure deserialization, etc.) and a "How to use the neighborhood" section explaining how the model should consume the cross-file context.

A few prompt design notes:

* We tell the model to emit JSON only, with no prose or fences. The OpenAI SDK supports a `response_format={"type": "json_object"}` parameter that enforces this on the API side, but reinforcing it in the prompt cuts down on edge cases.
* We explicitly forbid the Scanner from producing cross-file chains. Chains are the Chainer's job, and asking the Scanner to do both blurs the responsibility.
* We require the snippet to be copied verbatim. This means the report can quote the exact bytes the model claims to have seen, and a reviewer can spot-check a finding by comparing the snippet to the source.

Now the agent code. Create `src/venice_security_reviewer/scanner.py` and start with the file walker and prompt loader:

```python theme={"system"}
from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Iterator
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from .models import Finding
from .repo_map import ModuleNeighborhood, RepoMap

logger = logging.getLogger(__name__)

DEFAULT_SOURCE_EXTENSIONS: frozenset[str] = frozenset({".py"})

SKIP_DIR_NAMES: frozenset[str] = frozenset({
    ".git", ".venv", "venv", "env", "__pycache__", "node_modules",
    "dist", "build", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "site-packages",
})

MAX_FILE_BYTES = 200_000


def _load_prompt_template(name: str) -> str:
    here = Path(__file__).resolve()
    return (here.parents[2] / "prompts" / name).read_text(encoding="utf-8")


def iter_source_files(
    root: Path, extensions: Iterable[str] = DEFAULT_SOURCE_EXTENSIONS
) -> Iterator[Path]:
    exts = {e.lower() for e in extensions}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in exts:
            continue
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                logger.warning("skipping %s: exceeds %d bytes", path, MAX_FILE_BYTES)
                continue
        except OSError:
            continue
        yield path
```

`MAX_FILE_BYTES` is a safety cap. Beyond \~200 KB we skip rather than send a huge prompt that's likely to be both expensive and low quality.

The next piece is the prompt builder. The template uses `{filename}`, `{source}`, and `{neighborhood}` as placeholders; we use `str.replace` rather than `.format()` because the template contains JSON examples with literal braces:

```python theme={"system"}
def _render_neighborhood(neighborhood: ModuleNeighborhood | None) -> str:
    if neighborhood is None:
        return "null"
    return neighborhood.model_dump_json(indent=2)


def _build_prompt(
    template: str, *, filename: str, source: str, neighborhood: ModuleNeighborhood | None
) -> str:
    return (
        template.replace("{filename}", filename)
        .replace("{source}", source)
        .replace("{neighborhood}", _render_neighborhood(neighborhood))
    )
```

Now the parser. We deserialise the JSON, validate each finding through Pydantic, and drop individual malformed findings rather than failing the whole file. One bad finding shouldn't lose us the good ones:

```python theme={"system"}
def _parse_findings(raw: str, *, source_file: Path) -> list[Finding]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"model did not return valid JSON: {exc}") from exc

    if not isinstance(data, dict) or "findings" not in data:
        raise ValueError("model JSON missing 'findings' key")

    findings: list[Finding] = []
    for entry in data["findings"]:
        try:
            findings.append(Finding.model_validate(entry))
        except ValidationError as exc:
            logger.warning("dropping malformed finding from %s: %s", source_file, exc)
    return findings
```

The Scanner emits IDs like `F-001` per file, but the Chainer needs to reference findings across the whole repo. We re-issue the IDs against a monotonic counter so they're globally unique:

```python theme={"system"}
def _renumber_findings(findings: list[Finding], offset: int) -> tuple[list[Finding], int]:
    renumbered: list[Finding] = []
    for i, f in enumerate(findings):
        new_id = f"F-{offset + i + 1:03d}"
        renumbered.append(f.model_copy(update={"id": new_id}))
    return renumbered, offset + len(findings)
```

The single-file scan call combines all of this. We read the file, build the prompt, send it to Venice with `response_format={"type": "json_object"}` and a low temperature, and parse the result:

```python theme={"system"}
def scan_file(
    client: OpenAI,
    model: str,
    path: Path,
    *,
    prompt_template: str,
    repo_root: Path,
    repo_map: RepoMap,
    max_retries: int = 1,
) -> list[Finding]:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("could not read %s: %s", path, exc)
        return []

    rel = path.relative_to(repo_root)
    neighborhood = repo_map.neighborhood(rel)
    prompt = _build_prompt(
        prompt_template, filename=str(rel), source=source, neighborhood=neighborhood
    )

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a precise static security analyst. You respond "
                            "only with valid JSON matching the schema in the user prompt."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
        except Exception as exc:
            logger.warning("Venice call failed for %s on attempt %d: %s", rel, attempt, exc)
            last_error = exc
            continue

        content = response.choices[0].message.content or ""
        try:
            findings = _parse_findings(content, source_file=path)
        except ValueError as exc:
            logger.warning("parse failure for %s on attempt %d: %s", rel, attempt, exc)
            last_error = exc
            continue

        return [
            f.model_copy(update={"evidence": f.evidence.model_copy(update={"file": rel})})
            for f in findings
        ]

    logger.error("giving up on %s after %d attempts: %s", rel, max_retries + 1, last_error)
    return []
```

Two details worth highlighting:

* We patch the evidence file path to be relative to `repo_root` *after* parsing, since the model echoes back whatever filename we gave it but we want a single canonical form throughout the report.
* `temperature=0.1` is intentionally low. We want the Scanner to be conservative and consistent across runs; creativity is the Chainer's job.

Finally, the orchestrator that scans every eligible file under the root:

```python theme={"system"}
def scan_path(
    client: OpenAI,
    model: str,
    root: Path,
    repo_map: RepoMap,
    *,
    extensions: Iterable[str] = DEFAULT_SOURCE_EXTENSIONS,
) -> list[Finding]:
    template = _load_prompt_template("scanner.md")
    all_findings: list[Finding] = []
    offset = 0
    for path in iter_source_files(root, extensions=extensions):
        logger.info("scanning %s", path.relative_to(root))
        findings = scan_file(
            client, model, path,
            prompt_template=template,
            repo_root=root,
            repo_map=repo_map,
        )
        renumbered, offset = _renumber_findings(findings, offset)
        all_findings.extend(renumbered)
    return all_findings
```

The repo map gets built once by the caller and reused for every file, so the Scanner sees a consistent global structure even when individual files fail to parse or get skipped.

## Writing the Chainer Agent

The Chainer takes the union of Scanner findings plus the condensed repo map and asks Venice whether any of the findings combine into a real exploit chain. Two deterministic guardrails sit between the LLM and the report:

1. Every chain must reference only finding IDs the Scanner produced.
2. Every chain must claim only files that at least one referenced finding's evidence touches.

Chains that violate either rule get dropped at parse time. This stops the model from hallucinating chains "just in case" and from claiming a chain spans files it has no evidence for.

The Chainer prompt lives at `prompts/chainer.md`. The core of it looks like this:

````markdown theme={"system"}
You are a senior offensive security engineer. You are given a list of atomic
vulnerability findings discovered in a single codebase, plus a structural map
of that codebase showing every module's public symbols and import edges. Your
job is to identify whether any subset of the findings can be combined into a
real, end-to-end exploit chain.

# Rules

1. Output a single JSON object. No prose before or after. No markdown fences.
2. The object must match this schema exactly:

```json
{
  "chains": [
    {
      "id": "C-001",
      "findings": ["F-001", "F-003"],
      "narrative": "Step-by-step explanation of how an attacker combines these specific findings into a single exploit. Reference each finding by ID where it is used.",
      "severity": "high | critical",
      "files_involved": ["pkg/validators.py", "pkg/fetcher.py"]
    }
  ]
}
```

3. Chain IDs must be sequential: C-001, C-002, C-003, etc.
4. Every entry in `findings` MUST be the ID of a finding from the input list. You may NOT invent new finding IDs.
5. Every entry in `files_involved` MUST be the `evidence.file` of at least one of the findings you reference in this chain.
6. A chain must reference at least two distinct findings.
7. Chains are by definition severity high or critical. If a combination doesn't raise the impact above the highest individual severity, it is not a chain worth reporting.
8. If no real chain exists, return `{"chains": []}`. It is correct and expected for many codebases to have findings that do not chain.
````

The full prompt in the [reference repo](https://github.com/joshua-mo-143/venice-security-agent-demo/blob/main/prompts/chainer.md) also explains how to read the repo map, how to decide what goes in `files_involved`, and crucially, when *not* to chain. Telling the model "it is correct and expected for many codebases to have findings that do not chain" is what stops it from inventing chains to look productive.

Now the agent code. Create `src/venice_security_reviewer/chainer.py`:

```python theme={"system"}
from __future__ import annotations

import json
import logging
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from .models import Chain, Finding, validate_chain_references
from .repo_map import RepoMap

logger = logging.getLogger(__name__)

MAX_REPO_MAP_CHARS = 8000


def _load_prompt_template(name: str) -> str:
    here = Path(__file__).resolve()
    return (here.parents[2] / "prompts" / name).read_text(encoding="utf-8")
```

`MAX_REPO_MAP_CHARS = 8000` is a soft ceiling for the JSON-rendered repo map block in the Chainer prompt. At roughly 4 chars per token, that's \~2000 tokens, which sits comfortably inside any Venice model's context window even with findings and the narrative budget on top.

We serialise findings into a compact JSON block. Note we strip the `snippet` from evidence here on purpose: the Chainer doesn't need raw bytes to decide whether two findings combine, and including them roughly doubles the token cost on real codebases:

```python theme={"system"}
def _findings_to_input_json(findings: list[Finding]) -> str:
    payload = [
        {
            "id": f.id,
            "title": f.title,
            "severity": f.severity,
            "description": f.description,
            "cwe": f.cwe,
            "evidence": {
                "file": str(f.evidence.file),
                "start_line": f.evidence.start_line,
                "end_line": f.evidence.end_line,
            },
        }
        for f in findings
    ]
    return json.dumps(payload, indent=2)
```

For larger codebases the full condensed repo map can blow past our character budget. When that happens, we prune to finding-bearing modules plus their direct neighbours. That preserves enough structure for the Chainer to reason about chains we have evidence for, and discards the rest:

```python theme={"system"}
def _prune_for_budget(
    repo_map: RepoMap, findings: list[Finding], *, char_budget: int
) -> dict[str, object]:
    full = repo_map.condensed_dict()
    if len(json.dumps(full)) <= char_budget:
        return full

    finding_files = {f.evidence.file for f in findings}
    keep_modules = {
        m.module_name for m in repo_map.modules if m.path in finding_files
    }
    if not keep_modules:
        return full

    neighbours: set[str] = set()
    for m in repo_map.modules:
        if m.module_name in keep_modules:
            for edge in m.imports:
                neighbours.add(edge.from_module)
        for edge in m.imports:
            if edge.from_module in keep_modules:
                neighbours.add(m.module_name)
    keep_modules.update(neighbours)

    pruned_modules = [
        {
            "path": str(m.path),
            "module": m.module_name,
            "exports": list(m.exports),
            "imports": [
                {"from": e.from_module, "names": list(e.imported_names)}
                for e in m.imports
            ],
        }
        for m in repo_map.modules
        if m.module_name in keep_modules
    ]
    return {
        "modules": pruned_modules,
        "_pruned": True,
        "_kept": len(pruned_modules),
        "_total": len(repo_map.modules),
    }


def _render_repo_map(
    repo_map: RepoMap, findings: list[Finding], *, char_budget: int = MAX_REPO_MAP_CHARS
) -> str:
    payload = _prune_for_budget(repo_map, findings, char_budget=char_budget)
    if payload.get("_pruned"):
        logger.info(
            "chainer: repo map pruned for token budget (kept %s of %s modules)",
            payload.get("_kept"),
            payload.get("_total"),
        )
    return json.dumps(payload, indent=2)
```

The pruning strategy is intentionally simple: keep the modules our findings live in, and keep their direct import-graph neighbours. Anything further out has no plausible role in a chain we currently have evidence for, so it can be dropped without losing reasoning power. We also annotate the payload with `_pruned`, `_kept`, and `_total` markers, so the Chainer prompt can warn the model when the map has been trimmed.

Parsing the response is the same shape as the Scanner: deserialise, validate each chain through Pydantic, drop malformed entries:

```python theme={"system"}
def _parse_chains(raw: str) -> list[Chain]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"chainer did not return valid JSON: {exc}") from exc

    if not isinstance(data, dict) or "chains" not in data:
        raise ValueError("chainer JSON missing 'chains' key")

    chains: list[Chain] = []
    for entry in data["chains"]:
        try:
            chains.append(Chain.model_validate(entry))
        except ValidationError as exc:
            logger.warning("dropping malformed chain: %s", exc)
    return chains
```

Then the agent itself:

```python theme={"system"}
def find_chains(
    client: OpenAI,
    model: str,
    findings: list[Finding],
    repo_map: RepoMap,
    *,
    max_retries: int = 1,
) -> tuple[list[Chain], list[Chain]]:
    if len(findings) < 2:
        return [], []

    template = _load_prompt_template("chainer.md")
    prompt = template.replace(
        "{findings_json}", _findings_to_input_json(findings)
    ).replace("{repo_map}", _render_repo_map(repo_map, findings))

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a senior offensive security engineer. You respond "
                            "only with valid JSON matching the schema in the user prompt."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
        except Exception as exc:
            logger.warning("Venice call failed on attempt %d: %s", attempt, exc)
            last_error = exc
            continue

        content = response.choices[0].message.content or ""
        try:
            chains = _parse_chains(content)
        except ValueError as exc:
            logger.warning("chainer parse failure on attempt %d: %s", attempt, exc)
            last_error = exc
            continue

        valid, dropped = validate_chain_references(chains, findings)
        if dropped:
            logger.warning(
                "chainer referenced %d unknown finding id(s) or file(s); chains dropped: %s",
                len(dropped),
                [c.id for c in dropped],
            )
        return valid, dropped

    logger.error("giving up on chainer after %d attempts: %s", max_retries + 1, last_error)
    return [], []
```

A couple of things worth pointing out:

* We bail out before calling the model when there are fewer than two findings. You can't chain a single finding, and skipping the call means we don't burn tokens on a guaranteed-empty result.
* `temperature=0.2` is slightly higher than the Scanner's `0.1`. The Chainer benefits from a touch more creativity to spot non-obvious combinations, but we still want it grounded in the findings and map it was given.
* After parsing, `validate_chain_references` runs the deterministic cross-reference check we wrote earlier. Anything that survives is safe to render; anything that doesn't gets logged so the operator knows the model tried to invent something.

That cross-reference check is the most important piece of the whole project. It's the boundary between "useful security tool" and "occasionally confidently wrong AI report." With it in place, even if the model hallucinates, the wrong chain never reaches the report.

## Rendering the Markdown Report

Keeping rendering separate from agent logic means the same `Finding` and `Chain` objects can later be fed into other formats (JSON, SARIF, HTML) without touching the Scanner or Chainer.

We'll use Jinja2 with a small template file. Create `src/venice_security_reviewer/templates/report.md.j2`:

````jinja theme={"system"}
# Security Review Report

**Target:** `{{ target }}`
**Scanned at:** {{ scanned_at }}
**Model:** `{{ model }}`

---

## Summary

- **Atomic findings:** {{ findings | length }}
- **Exploit chains:** {{ chains | length }}
{%- if dropped_chains %}
- **Dropped chains (referenced unknown findings):** {{ dropped_chains | length }}
{%- endif %}

---

## Exploit Chains

{% if not chains %}
_No exploit chains were identified by the Chainer agent._
{% else %}
{% for c in chains %}
### {{ c.id }} — {{ c.severity | upper }}

**Findings combined:** {{ c.findings | join(', ') }}
**Files involved:** {{ c.files_involved | map('string') | join(', ') }}

{{ c.narrative }}

{% endfor %}
{% endif %}

---

## Atomic Findings

{% for f in findings %}
### {{ f.id }} — {{ f.title }}

- **Severity:** {{ f.severity }}
{%- if f.cwe %}
- **CWE:** {{ f.cwe }}
{%- endif %}
- **Location:** `{{ f.evidence.file }}:{{ f.evidence.start_line }}-{{ f.evidence.end_line }}`

{{ f.description }}

```
{{ f.evidence.snippet }}
```

{% endfor %}
````

Then the renderer at `src/venice_security_reviewer/report.py`:

```python theme={"system"}
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, PackageLoader, select_autoescape

from .models import Chain, Finding


def _build_env() -> Environment:
    return Environment(
        loader=PackageLoader("venice_security_reviewer", "templates"),
        autoescape=select_autoescape(enabled_extensions=("html",)),
        keep_trailing_newline=True,
    )


def render_report(
    *,
    target: Path,
    model: str,
    findings: list[Finding],
    chains: list[Chain],
    dropped_chains: list[Chain] | None = None,
) -> str:
    env = _build_env()
    template = env.get_template("report.md.j2")
    return template.render(
        target=str(target),
        scanned_at=datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
        model=model,
        findings=findings,
        chains=chains,
        dropped_chains=dropped_chains or [],
    )
```

Autoescape stays off for the Markdown template (Markdown isn't HTML), but we leave it enabled for any future `.html` templates by extension.

## Wiring the CLI

The CLI is the orchestrator: build the repo map, scan, chain, render. We'll use Typer to handle argument parsing and Rich to print a nice summary table.

Create `src/venice_security_reviewer/cli.py`:

```python theme={"system"}
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from .chainer import find_chains
from .client import VeniceConfigError, build_client
from .models import Chain, Finding
from .repo_map import build_repo_map
from .report import render_report
from .scanner import scan_path

app = typer.Typer(
    add_completion=False,
    help="Two-agent security code reviewer powered by Venice AI.",
    no_args_is_help=True,
)
console = Console()


@app.callback()
def _root() -> None:
    """Force Typer to keep `scan` as a named subcommand."""


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def _print_summary(
    findings: list[Finding], chains: list[Chain], dropped: list[Chain]
) -> None:
    table = Table(title="Scan summary", show_header=True, header_style="bold")
    table.add_column("Metric")
    table.add_column("Count", justify="right")
    table.add_row("Atomic findings", str(len(findings)))
    table.add_row("Exploit chains", str(len(chains)))
    if dropped:
        table.add_row("Chains dropped (bad refs)", str(len(dropped)))
    console.print(table)


@app.command()
def scan(
    path: Annotated[
        Path,
        typer.Argument(
            exists=True, file_okay=False, dir_okay=True, readable=True, resolve_path=True,
            help="Path to the codebase to scan.",
        ),
    ],
    out: Annotated[
        Path, typer.Option("--out", "-o", help="Where to write the Markdown report.")
    ] = Path("report.md"),
    verbose: Annotated[
        bool, typer.Option("--verbose", "-v", help="Enable debug logging.")
    ] = False,
) -> None:
    """Scan a codebase for vulnerabilities and exploit chains."""
    _configure_logging(verbose)

    try:
        client, model = build_client()
    except VeniceConfigError as exc:
        console.print(f"[red]error:[/red] {exc}")
        raise typer.Exit(code=2) from exc

    console.print(f"[bold]Indexing[/bold] {path} (AST repo map)...")
    repo_map = build_repo_map(path)
    edge_count = sum(len(m.imports) for m in repo_map.modules)
    console.print(
        f"Repo map: [bold]{len(repo_map.modules)}[/bold] module(s), "
        f"[bold]{edge_count}[/bold] import edge(s)."
    )

    console.print(f"[bold]Scanning[/bold] {path} with model [cyan]{model}[/cyan]...")
    findings = scan_path(client, model, path, repo_map)
    console.print(f"Scanner produced [bold]{len(findings)}[/bold] finding(s).")

    console.print("[bold]Chaining[/bold] findings...")
    chains, dropped = find_chains(client, model, findings, repo_map)
    console.print(f"Chainer produced [bold]{len(chains)}[/bold] chain(s).")

    report = render_report(
        target=path, model=model,
        findings=findings, chains=chains, dropped_chains=dropped,
    )
    out.write_text(report, encoding="utf-8")
    console.print(f"Report written to [green]{out}[/green]")
    _print_summary(findings, chains, dropped)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
```

Add the script entry point to `pyproject.toml`:

```toml theme={"system"}
[project.scripts]
venice-security-reviewer = "venice_security_reviewer.cli:app"
```

That's the whole pipeline wired up.

## Testing the Guardrails

We've leaned hard on one idea throughout this build: the deterministic guardrails are what separate a useful security tool from a confidently wrong one. That claim is only worth making if we can prove the guardrails actually hold, so the most valuable tests in this project don't call Venice at all. They lock down the Pydantic boundary and the prompt-assembly plumbing, which means they run offline, in milliseconds, with no API key and no token cost.

Add the dev dependencies first:

```bash theme={"system"}
uv add --dev "pytest>=8.3" "ruff>=0.7" "mypy>=1.13"
```

The first thing worth testing is the model boundary itself. These tests assert that malformed findings and chains are rejected at construction time, before they can ever reach a report. Create `tests/test_models.py`:

```python theme={"system"}
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from venice_security_reviewer.models import (
    Chain,
    Evidence,
    Finding,
    validate_chain_references,
)


def _finding(fid: str) -> Finding:
    return Finding(
        id=fid,
        title="t",
        severity="medium",
        description="d",
        evidence=Evidence(file=Path("a.py"), start_line=1, end_line=2, snippet="x"),
    )


def test_evidence_rejects_inverted_line_range() -> None:
    with pytest.raises(ValidationError):
        Evidence(file=Path("a.py"), start_line=10, end_line=5, snippet="x")


def test_finding_id_pattern_enforced() -> None:
    with pytest.raises(ValidationError):
        Finding(
            id="not-an-id",
            title="t",
            severity="medium",
            description="d",
            evidence=Evidence(file=Path("a.py"), start_line=1, end_line=2, snippet="x"),
        )


def test_chain_requires_two_findings() -> None:
    with pytest.raises(ValidationError):
        Chain(
            id="C-001",
            findings=["F-001"],
            narrative="n",
            severity="high",
            files_involved=[Path("a.py")],
        )
```

Each of these mirrors a constraint we put on the models earlier: an inverted line range, an ID that doesn't match the `F-###` pattern, and a "chain" of a single finding. If any of them ever stops raising, a whole class of hallucination has quietly become possible again.

The most important test covers the cross-reference validator, since that's the function that actually drops invented chains:

```python theme={"system"}
def test_validate_chain_references_drops_unknown_ids() -> None:
    findings = [_finding("F-001"), _finding("F-002")]
    good = Chain(
        id="C-001",
        findings=["F-001", "F-002"],
        narrative="n",
        severity="critical",
        files_involved=[Path("a.py")],
    )
    bad = Chain(
        id="C-002",
        findings=["F-001", "F-999"],
        narrative="n",
        severity="critical",
        files_involved=[Path("a.py")],
    )
    valid, dropped = validate_chain_references([good, bad], findings)
    assert [c.id for c in valid] == ["C-001"]
    assert [c.id for c in dropped] == ["C-002"]
```

`F-999` was never produced by the Scanner, so the chain that references it lands in `dropped` and never reaches the report. The companion test in the reference repo, `test_validate_chain_references_drops_unknown_files`, does the same for a chain that claims a file none of its findings came from.

The second thing worth testing is the plumbing that feeds the Chainer. It's easy to refactor the prompt assembly and silently stop passing cross-file context, at which point the Chainer would keep working but quietly get worse. This test builds a two-module fixture, renders the prompt, and asserts the cross-file information is actually present, again without a Venice round-trip. Create `tests/test_cross_file_chain.py`:

```python theme={"system"}
from __future__ import annotations

from pathlib import Path

from venice_security_reviewer.chainer import (
    _findings_to_input_json,
    _load_prompt_template,
    _render_repo_map,
)
from venice_security_reviewer.models import Evidence, Finding
from venice_security_reviewer.repo_map import build_repo_map


def _write(root: Path, rel: str, content: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_chainer_prompt_carries_cross_file_context(tmp_path: Path) -> None:
    _write(tmp_path, "validators.py", "def is_safe_url(url: str) -> bool:\n    return True")
    _write(
        tmp_path,
        "fetcher.py",
        "from .validators import is_safe_url\n\ndef fetch(url: str) -> bytes:\n    return b''",
    )

    rmap = build_repo_map(tmp_path)
    findings = [
        Finding(
            id="F-001",
            title="Validator returns True unconditionally",
            severity="low",
            description="The validator always returns True.",
            evidence=Evidence(
                file=Path("validators.py"), start_line=1, end_line=2, snippet="..."
            ),
        ),
        Finding(
            id="F-002",
            title="Fetcher trusts a stub validator",
            severity="low",
            description="The fetcher gates network access on is_safe_url.",
            evidence=Evidence(
                file=Path("fetcher.py"), start_line=1, end_line=1, snippet="..."
            ),
        ),
    ]

    template = _load_prompt_template("chainer.md")
    prompt = template.replace(
        "{findings_json}", _findings_to_input_json(findings)
    ).replace("{repo_map}", _render_repo_map(rmap, findings))

    assert "{findings_json}" not in prompt and "{repo_map}" not in prompt
    assert "F-001" in prompt and "F-002" in prompt
    assert "validators.py" in prompt and "fetcher.py" in prompt
    assert "is_safe_url" in prompt
```

If this test passes, the Chainer is being handed a prompt that contains both findings, both file paths, and the import edge between them. Whether the *model* uses that information well is a separate, out-of-band evaluation; this test only guards the plumbing that gets the information into the prompt in the first place.

Run the whole suite, plus the linter and type checker, with:

```bash theme={"system"}
uv run pytest          # offline tests, no live Venice calls
uv run ruff check .
uv run mypy src/
```

Because none of these tests touch the network, they're safe to run on every commit and in CI without burning tokens or needing a Venice key. The reference repo also includes `tests/test_scanner_parse.py`, `tests/test_chainer_parse.py`, and `tests/test_repo_map.py`, which cover JSON parsing edge cases (malformed entries getting dropped rather than crashing the run) and the AST repo map builder.

## Running the Project

To try it on a real codebase, point the CLI at a directory of Python source:

```bash theme={"system"}
uv run venice-security-reviewer scan path/to/your/code
```

Or install it into your virtualenv with `pip install -e .` and run `venice-security-reviewer scan path/to/your/code`.

The output looks roughly like this:

```text theme={"system"}
Indexing /path/to/code (AST repo map)...
Repo map: 6 module(s), 14 import edge(s).
Scanning /path/to/code with model zai-org-glm-5...
Scanner produced 4 finding(s).
Chaining findings...
Chainer produced 1 chain(s).
Report written to report.md
                Scan summary
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━┓
┃ Metric                    ┃ Count ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━┩
│ Atomic findings           │     4 │
│ Exploit chains            │     1 │
└───────────────────────────┴───────┘
```

The Markdown report shows each chain at the top with its narrative, then every individual finding underneath with severity, CWE, file location, description, and the verbatim snippet the model claims to have read.

The reference repo also ships with four bundled demo targets that each exercise a different shape of reasoning the Chainer has to do:

* `examples/vulnerable_app` — a multi-file Flask app with three "low" findings, two of which combine into a critical privilege-escalation chain across files. Tests whether the Chainer is selective about what it combines.
* `examples/url_preview` — a multi-file URL-fetcher with a defensive allowlist that doesn't apply per-iteration. Tests cross-file data-flow reasoning combined with deployment topology (link-local IPs are cloud-credential gateways).
* `examples/csv_query` — a single-file CSV filter with an `eval` sandbox escape via `__class__.__base__.__subclasses__()`. Tests language-level reasoning rather than HTTP flow.
* `examples/webhook_handler` — a single-file HMAC verifier with a JSON parser-differential vulnerability. Tests reasoning across multiple specifications.

Try them with:

```bash theme={"system"}
uv run venice-security-reviewer scan examples/vulnerable_app
uv run venice-security-reviewer scan examples/csv_query
```

If you ever see the CLI log `chainer referenced N unknown finding id(s) or file(s); chains dropped`, that's the cross-reference validator catching the model in the act of inventing a chain. The dropped chains never make it into the report; you just get a warning that you can use to adjust the prompt or sample additional Chainer runs.

## Extending This Example

The two-agent shape generalises well. A few directions worth exploring:

* **More languages.** The Scanner is language-agnostic at the prompt level; the AST builder is what's Python-specific. Swap in `tree-sitter` and you can build the same neighbourhood/condensed-map shapes for TypeScript, Go, or Rust.
* **A third agent for fixes.** Once you have a chain, asking a Patcher agent to draft a unified diff that defangs *one* of the constituent findings is a small step. Pydantic-validate the diff against the same evidence-file set and you get the same hallucination guard for free.
* **Output formats.** `render_report` is the only place that knows about Markdown. Add a SARIF renderer and the same findings can drop into GitHub code scanning. Add a JSON renderer and you can pipe results into a downstream system.
* **Caching by file hash.** The Scanner's per-file calls are independent and idempotent. Caching by `(file_hash, prompt_hash, model)` means re-scanning a repo where one file changed only re-runs the Scanner on that one file.
* **Sampling for the Chainer.** For high-stakes runs, call the Chainer N times at slightly higher temperature and intersect the results. Chains the model finds consistently are more likely to be real; chains it finds once and never again are likely noise.
* **Stronger models.** `zai-org-glm-5` is the default because it strikes a good balance between cost and quality for combinatorial reasoning, but for harder codebases swapping in a stronger Venice model (set via `VENICE_MODEL`) can make the Chainer's narratives noticeably tighter.

## Finishing Up

Thanks for reading! Hopefully this helped you understand how to structure an AI security tool that's actually trustworthy. The pattern we used here generalises beyond security too: any time you want an LLM to reason across files in a way that has to ground out in real evidence, the recipe is the same. Build a deterministic structural map, hand the model a slice of it that fits in context, validate the model's references back against the structure, and drop anything it can't ground.

By using Python with the Venice AI API, we can build agents that combine LLM reasoning with hard validation boundaries, and ship something that gives a useful answer instead of a confident-sounding one.


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

<Tip>
  Image generation sizing is model-specific. Pixel-based models such as `venice-sd35` and `qwen-image` use `width` and `height`; aspect-ratio models such as `qwen-image-2` use `aspect_ratio`; models that list resolution options such as `1K`, `2K`, or `4K` use both `resolution` and `aspect_ratio`.
</Tip>

<Tip>
  **Quality tiers.** `gpt-image-2` (generate) and `gpt-image-2-edit` (edit/multi-edit) accept an optional `quality` parameter — `low`, `medium`, or `high` (default). Lower tiers cost less; see the [Pricing overview](/overview/pricing#quality-tier-pricing-gpt-image-2) for the full matrix or fetch `model_spec.pricing.quality` from the [Models endpoint](/api-reference/endpoint/models/list).
</Tip>


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

**Video Upscaling:** Enhance existing videos to higher resolutions using AI-powered upscaling. See the [Video Upscaling Guide](/guides/media/video-upscaling) for details.

<Note>
  Video generation and upscaling use an async queue system. See the [Video Queue API](/api-reference/endpoint/video/queue) to start generation and [Video Retrieve API](/api-reference/endpoint/video/retrieve) to fetch results.
</Note>

## Pricing

Adjust the dropdowns to see how duration, resolution, and audio affect the price. Models marked **FIXED** have a flat rate.

For exact quotes before generation, use the [Video Quote API](/api-reference/endpoint/video/quote).


# Venice API
Source: https://docs.venice.ai/overview/about-venice



<div>
  <p>The API for private, unrestricted access to intelligence.</p>
  <p>OpenAI-compatible chat, image, audio, and video behind one API key.</p>

  <div>
    <a href="https://venice.ai/settings/api">Get an API key →</a>
    <a href="/overview/getting-started">Get started</a>
  </div>
</div>

<CodeGroup>
  ```bash curl theme={"system"}
  curl https://api.venice.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $VENICE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "zai-org-glm-5-1",
      "messages": [{"role": "user", "content": "Build without permission."}]
    }'
  ```

  ```ts TypeScript theme={"system"}
  import OpenAI from "openai";

  const client = new OpenAI({
    apiKey: process.env.VENICE_API_KEY,
    baseURL: "https://api.venice.ai/api/v1",
  });

  const res = await client.chat.completions.create({
    model: "zai-org-glm-5-1",
    messages: [{ role: "user", content: "Build without permission." }],
  });
  ```

  ```python Python theme={"system"}
  import os
  from openai import OpenAI

  client = OpenAI(
      api_key=os.environ["VENICE_API_KEY"],
      base_url="https://api.venice.ai/api/v1",
  )

  res = client.chat.completions.create(
      model="zai-org-glm-5-1",
      messages=[{"role": "user", "content": "Build without permission."}],
  )
  ```
</CodeGroup>

<div>
  <p>Endpoints</p>
  <h2>One API for every modality</h2>
  <p>Chat, image, audio, video, and embeddings behind one API key.</p>
</div>

<div>
  <a href="/api-reference/endpoint/chat/completions">
    <span>Chat Completions</span>
    <p>OpenAI-compatible chat with reasoning, tool use, and streaming across 100+ text models.</p>

    <div>
      <span>Streaming</span>
      <span>Tools</span>
      <span>Vision</span>
    </div>

    <span>See reference →</span>
  </a>

  <a href="/api-reference/endpoint/image/generations">
    <span>Image Generation</span>
    <p>Text-to-image, image-to-image, upscaling, and background removal across photorealistic, stylized, and uncensored models.</p>

    <div>
      <span>Text-to-image</span>
      <span>Image-to-image</span>
      <span>Upscale</span>
    </div>

    <span>See reference →</span>
  </a>

  <a href="/api-reference/endpoint/audio/speech">
    <span>Audio</span>
    <p>Text-to-speech with 50+ multilingual voices, plus speech-to-text transcription for any audio file.</p>

    <div>
      <span>TTS</span>
      <span>Transcription</span>
      <span>50+ voices</span>
    </div>

    <span>See reference →</span>
  </a>

  <a href="/api-reference/endpoint/video/queue">
    <span>Video</span>
    <p>Text-to-video, image-to-video, and reference-to-video through a sync or async job queue.</p>

    <div>
      <span>Text-to-video</span>
      <span>Image-to-video</span>
      <span>Reference-to-video</span>
    </div>

    <span>See reference →</span>
  </a>
</div>

<p>
  Plus <a href="/api-reference/endpoint/embeddings/generate">embeddings</a>, <a href="/guides/features/file-inputs">file inputs</a>, <a href="/guides/integrations/venice-mcp">MCP tools</a>, and <a href="/guides/integrations/x402-venice-api">wallet payments</a>. <a href="/api-reference">View all endpoints →</a>
</p>

<div>
  <p>Agents</p>
  <h2>Built for AI agents</h2>
  <p>Private inference, MCP tools, and wallet-funded workflows for messaging, coding, and onchain agents.</p>
</div>

<div>
  <a href="/guides/integrations/ai-agents#agent-apps">
    <span>Agent apps</span>
    <p>Connect Venice to WhatsApp, Telegram, Discord, and more through OpenClaw, Hermes, and NanoClaw.</p>
    <span>See integrations →</span>
  </a>

  <a href="/guides/integrations/ai-agents#coding-agents">
    <span>Coding agents</span>
    <p>Use Claude Code, Cursor, and Codex CLI with Venice models for private coding workflows.</p>
    <span>See integrations →</span>
  </a>

  <a href="/guides/integrations/ai-agents#tools-and-skills">
    <span>MCP + Skills</span>
    <p>Expose chat, image, video, audio, and embeddings as MCP tools or runtime skills.</p>
    <span>See integrations →</span>
  </a>
</div>

<p>
  <a href="/guides/integrations/ai-agents">Explore the AI Agents hub →</a>
</p>

<div>
  <p>Models</p>
  <h2>Popular models</h2>
  <p>A few of the most-used models on Venice. Use the ID as your `model` parameter.</p>
</div>

<div>
  <a href="/overview/models">
    <div>
      <span>Kimi K2.6</span>
      <span>Moonshot AI</span>
    </div>

    <p>Open-weights frontier reasoning. Strong long-context and tool use at a fraction of frontier prices.</p>

    <div>
      <span>256K context</span>
      <span>\$0.85 / \$4.66 per 1M</span>
      <span>Private</span>
    </div>

    <code>kimi-k2-6</code>
  </a>

  <a href="/overview/models">
    <div>
      <span>Claude Opus 4.7</span>
      <span>Anthropic</span>
    </div>

    <p>Best-in-class for coding, planning, and long-horizon agents that need to stay coherent.</p>

    <div>
      <span>1M context</span>
      <span>\$6.00 / \$30.00 per 1M</span>
      <span>Anonymized</span>
    </div>

    <code>claude-opus-4-7</code>
  </a>

  <a href="/overview/models">
    <div>
      <span>GPT-5.5</span>
      <span>OpenAI</span>
    </div>

    <p>Frontier general intelligence with 1M context. Strong default for chat, RAG, and multi-step reasoning.</p>

    <div>
      <span>1M context</span>
      <span>\$6.25 / \$37.50 per 1M</span>
      <span>Anonymized</span>
    </div>

    <code>openai-gpt-55</code>
  </a>
</div>

<a href="/overview/models">
  <span>
    <span>250+ models</span>
    <span>Text, image, audio, and video</span>
  </span>

  <span>Browse the catalog →</span>
</a>

<div>
  <p>Tools</p>
  <h2>Built‑in tools for chat models</h2>
  <p>Turn on web search, attach files, or query a blockchain with `venice_parameters` or a Venice-native endpoint.</p>
</div>

<CardGroup>
  <Card title="Web Search" icon="globe" />

  <Card title="Web Scraping" icon="browser" />

  <Card title="File Inputs" icon="file" />

  <Card title="Crypto RPC" icon="link" />
</CardGroup>

<Accordion title="Web Search Code Samples">
  Add real-time web search with citations to any text model via `enable_web_search`.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "zai-org-glm-5-1",
        "messages": [{"role": "user", "content": "What are the latest developments in AI?"}],
        "venice_parameters": {
          "enable_web_search": "auto"
        }
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const completion = await client.chat.completions.create({
      model: "zai-org-glm-5-1",
      messages: [{ role: "user", content: "What are the latest developments in AI?" }],
      // @ts-expect-error - Venice-specific parameter
      venice_parameters: {
        enable_web_search: "auto",
      },
    });

    console.log(completion.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import os
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["VENICE_API_KEY"],
        base_url="https://api.venice.ai/api/v1",
    )

    response = client.chat.completions.create(
        model="zai-org-glm-5-1",
        messages=[{"role": "user", "content": "What are the latest developments in AI?"}],
        extra_body={
            "venice_parameters": {
                "enable_web_search": "auto",
            }
        },
    )

    print(response.choices[0].message.content)
    ```

    ```bash Model Suffix theme={"system"}
    # Alternative: append parameters directly to the model ID
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

<Accordion title="Web Scraping Code Samples">
  Set `enable_web_scraping: true` and the model will fetch and read any URLs in the user message before answering.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "openai-gpt-55",
        "messages": [
          {"role": "user", "content": "Summarize this post in five bullets: https://venice.ai/blog/how-to-use-venice-api"}
        ],
        "venice_parameters": {
          "enable_web_scraping": true
        }
      }'
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";

    const client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const response = await client.chat.completions.create({
      model: "openai-gpt-55",
      messages: [
        {
          role: "user",
          content:
            "Summarize this post in five bullets: https://venice.ai/blog/how-to-use-venice-api",
        },
      ],
      // @ts-expect-error - Venice-specific parameter
      venice_parameters: {
        enable_web_scraping: true,
      },
    });

    console.log(response.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import os
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["VENICE_API_KEY"],
        base_url="https://api.venice.ai/api/v1",
    )

    response = client.chat.completions.create(
        model="openai-gpt-55",
        messages=[
            {
                "role": "user",
                "content": "Summarize this post in five bullets: https://venice.ai/blog/how-to-use-venice-api",
            }
        ],
        extra_body={
            "venice_parameters": {
                "enable_web_scraping": True,
            }
        },
    )

    print(response.choices[0].message.content)
    ```
  </CodeGroup>
</Accordion>

<Accordion title="File Inputs Code Samples">
  Attach PDFs, Office docs, code, and text files (up to 25MB) directly to a chat request. See the [File Inputs guide](/guides/features/file-inputs) for the full format list.

  <CodeGroup>
    ```bash Curl theme={"system"}
    # Encode a local file as a base64 data URL, then send it inline
    FILE_B64=$(base64 q3-report.pdf | tr -d '\n')

    curl https://api.venice.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\": \"openai-gpt-55\",
        \"messages\": [
          {
            \"role\": \"user\",
            \"content\": [
              {\"type\": \"text\", \"text\": \"Summarize this report in five bullets and list the main risks.\"},
              {\"type\": \"file\", \"file\": {\"filename\": \"q3-report.pdf\", \"file_data\": \"data:application/pdf;base64,${FILE_B64}\"}}
            ]
          }
        ]
      }"
    ```

    ```ts TypeScript theme={"system"}
    import OpenAI from "openai";
    import { readFile } from "node:fs/promises";

    const client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY!,
      baseURL: "https://api.venice.ai/api/v1",
    });

    const pdf = await readFile("q3-report.pdf");
    const fileData = `data:application/pdf;base64,${pdf.toString("base64")}`;

    const response = await client.chat.completions.create({
      model: "openai-gpt-55",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Summarize this report in five bullets and list the main risks." },
            // @ts-expect-error - Venice file input block
            { type: "file", file: { filename: "q3-report.pdf", file_data: fileData } },
          ],
        },
      ],
    });

    console.log(response.choices[0].message.content);
    ```

    ```python Python theme={"system"}
    import base64
    import os
    from pathlib import Path
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["VENICE_API_KEY"],
        base_url="https://api.venice.ai/api/v1",
    )

    path = Path("q3-report.pdf")
    file_data = "data:application/pdf;base64," + base64.b64encode(path.read_bytes()).decode("utf-8")

    response = client.chat.completions.create(
        model="openai-gpt-55",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Summarize this report in five bullets and list the main risks."},
                    {"type": "file", "file": {"filename": "q3-report.pdf", "file_data": file_data}},
                ],
            }
        ],
    )

    print(response.choices[0].message.content)
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Crypto RPC Code Samples">
  Proxy JSON-RPC 2.0 calls across 11 supported chains with your Venice key or an x402 wallet. See the [Crypto RPC reference](/api-reference/endpoint/crypto/rpc) for chains, methods, and credit tiers.

  <CodeGroup>
    ```bash Curl theme={"system"}
    curl https://api.venice.ai/api/v1/crypto/rpc/ethereum-mainnet \
      -H "Authorization: Bearer $VENICE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 1
      }'
    ```

    ```ts TypeScript theme={"system"}
    const response = await fetch(
      "https://api.venice.ai/api/v1/crypto/rpc/base-mainnet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 },
          { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 2 },
        ]),
      }
    );

    const results = await response.json();
    console.log(results);
    ```

    ```python Python theme={"system"}
    import os
    import requests

    response = requests.post(
        "https://api.venice.ai/api/v1/crypto/rpc/ethereum-mainnet",
        headers={
            "Authorization": f"Bearer {os.environ['VENICE_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "jsonrpc": "2.0",
            "method": "eth_getBalance",
            "params": ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"],
            "id": 1,
        },
    )

    print(response.json())
    ```
  </CodeGroup>
</Accordion>

<div>
  <div>
    <p>Pricing</p>
    <h2>Top up, stake, or pay per request</h2>
    <p>Fund an account with credits, stake DIEM for a daily allowance, or skip the account entirely with USDC on Base.</p>
  </div>

  <div>
    <div>
      <div>
        <span>Credits</span>
        <span>USD or Crypto</span>
      </div>

      <p>Pay as you go in USD or crypto. Credits never expire and work across every endpoint.</p>
      <a href="https://venice.ai/settings/billing">Buy Credits</a>
    </div>

    <div>
      <div>
        <span>DIEM</span>
        <span>Daily allowance</span>
      </div>

      <p>Stake DIEM or VVV once and earn a fixed inference allowance every day, with no per-call charges.</p>
      <a href="https://venice.ai/token">Learn about DIEM</a>
    </div>

    <div>
      <div>
        <span>x402</span>
        <span>USDC on Base</span>
      </div>

      <p>Pay per request from any Base wallet in USDC. No account or API key, built for agents.</p>
      <a href="/guides/integrations/x402-venice-api">Read x402 Guide</a>
    </div>
  </div>
</div>

Questions or feedback? Join us on [Discord](https://discord.gg/askvenice).


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
`zai-org-glm-5`
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

    For a detailed walkthrough with screenshots, check out the [API Key guide](/guides/getting-started/generating-api-key).
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

  <Step title="Switch models by changing the model ID">
    Every request includes a `model` ID. To use a different model, change the `model` value in your request. Popular choices:

    * `zai-org-glm-5` - Default model for most use cases
    * `kimi-k2-6` - Strong reasoning for more complex tasks
    * `claude-opus-4-8` - High-intelligence model for complex tasks
    * `venice-uncensored-1-2` - Venice's uncensored model

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

  <Card title="Structured Responses" icon="brackets-curly" href="/guides/features/structured-responses">
    Learn how to get JSON responses with guaranteed schemas
  </Card>

  <Card title="AI Agents Guide" icon="robot" href="/guides/integrations/ai-agents">
    Build with agent apps, coding agents, MCP tools, skills, and crypto workflows
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

  <Card title="Postman Collection" icon="bolt" href="/guides/getting-started/postman">
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


# API Pricing
Source: https://docs.venice.ai/overview/pricing



Prices per 1M tokens unless noted. All prices in USD. 1 Diem = \$1/day of compute.

## Text Models

### Chat Completions

<div>
  | Model                             | ID                                     | Input Price | Output Price | Cache Read | Cache Write | Context | Privacy        |
  | --------------------------------- | -------------------------------------- | ----------- | ------------ | ---------- | ----------- | ------- | -------------- |
  | Aion 2.0                          | `aion-labs-aion-2-0`                   | \$1.00      | \$2.00       | \$0.25     | -           | 128K    | Anonymized     |
  | Claude Fable 5                    | `claude-fable-5`                       | \$12.00     | \$60.00      | \$1.20     | \$15.00     | 1000K   | Anonymized     |
  | Claude Opus 4.5                   | `claude-opus-4-5`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 198K    | Anonymized     |
  | Claude Opus 4.6 (Beta)            | `claude-opus-4-6`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 1000K   | Anonymized     |
  | Claude Opus 4.6 Fast (Beta)       | `claude-opus-4-6-fast`                 | \$36.00     | \$180.00     | \$3.60     | \$45.00     | 1000K   | Anonymized     |
  | Claude Opus 4.7                   | `claude-opus-4-7`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 1000K   | Anonymized     |
  | Claude Opus 4.7 Fast (Beta)       | `claude-opus-4-7-fast`                 | \$36.00     | \$180.00     | \$3.60     | \$45.00     | 1000K   | Anonymized     |
  | Claude Opus 4.8                   | `claude-opus-4-8`                      | \$6.00      | \$30.00      | \$0.60     | \$7.50      | 1000K   | Anonymized     |
  | Claude Opus 4.8 Fast (Beta)       | `claude-opus-4-8-fast`                 | \$12.00     | \$60.00      | \$1.20     | \$15.00     | 1000K   | Anonymized     |
  | Claude Sonnet 4.5                 | `claude-sonnet-4-5`                    | \$3.75      | \$18.75      | \$0.38     | \$4.69      | 198K    | Anonymized     |
  | Claude Sonnet 4.6 (Beta)          | `claude-sonnet-4-6`                    | \$3.60      | \$18.00      | \$0.36     | \$4.50      | 1000K   | Anonymized     |
  | DeepSeek V3.2                     | `deepseek-v3.2`                        | \$0.33      | \$0.48       | \$0.16     | -           | 160K    | Private        |
  | DeepSeek V4 Flash                 | `deepseek-v4-flash`                    | \$0.17      | \$0.35       | \$0.03     | -           | 1000K   | Anonymized     |
  | DeepSeek V4 Pro                   | `deepseek-v4-pro`                      | \$1.73      | \$3.80       | \$0.33     | -           | 1000K   | Anonymized     |
  | Gemini 3 Flash Preview            | `gemini-3-flash-preview`               | \$0.70      | \$3.75       | \$0.07     | -           | 256K    | Anonymized     |
  | Gemini 3.1 Pro Preview            | `gemini-3-1-pro-preview`               | \$2.50      | \$15.00      | \$0.50     | \$0.50      | 1000K   | Anonymized     |
  | ↳ >200K Context                   |                                        | \$5.00      | \$22.50      | \$0.50     | \$0.50      |         |                |
  | Gemini 3.5 Flash                  | `gemini-3-5-flash`                     | \$1.55      | \$9.45       | \$0.15     | \$0.09      | 1000K   | Anonymized     |
  | Gemma 3 27B (Beta)                | `e2ee-gemma-3-27b-p`                   | \$0.14      | \$0.50       | -          | -           | 40K     | E2EE · Private |
  | Gemma 4 26B A4B Uncensored (Beta) | `e2ee-gemma-4-26b-a4b-uncensored-p`    | \$0.19      | \$0.88       | -          | -           | 64K     | E2EE · Private |
  | Gemma 4 31B Instruct (Beta)       | `e2ee-gemma-4-31b`                     | \$0.14      | \$0.43       | \$0.03     | -           | 32K     | E2EE · Private |
  | Gemma 4 Uncensored                | `gemma-4-uncensored`                   | \$0.16      | \$0.50       | -          | -           | 256K    | Private        |
  | GLM 4.6                           | `zai-org-glm-4.6`                      | \$0.85      | \$2.75       | \$0.30     | -           | 198K    | Private        |
  | GLM 4.7                           | `zai-org-glm-4.7`                      | \$0.55      | \$2.65       | \$0.11     | -           | 198K    | Private        |
  | GLM 4.7 (Beta)                    | `e2ee-glm-4-7-p`                       | \$1.10      | \$4.15       | -          | -           | 128K    | E2EE · Private |
  | GLM 4.7 Flash                     | `zai-org-glm-4.7-flash`                | \$0.13      | \$0.50       | -          | -           | 128K    | Private        |
  | GLM 4.7 Flash (Beta)              | `e2ee-glm-4-7-flash-p`                 | \$0.13      | \$0.55       | -          | -           | 198K    | E2EE · Private |
  | GLM 4.7 Flash Heretic             | `olafangensan-glm-4.7-flash-heretic`   | \$0.14      | \$0.80       | -          | -           | 200K    | Private        |
  | GLM 5                             | `zai-org-glm-5`                        | \$1.00      | \$3.20       | \$0.20     | -           | 198K    | Private        |
  | GLM 5 Turbo                       | `z-ai-glm-5-turbo`                     | \$1.20      | \$4.00       | \$0.24     | -           | 200K    | Anonymized     |
  | GLM 5.1 (Beta)                    | `zai-org-glm-5-1`                      | \$1.75      | \$5.50       | \$0.33     | -           | 200K    | Private        |
  | GLM 5.1 (Beta)                    | `e2ee-glm-5-1`                         | \$1.10      | \$4.15       | -          | -           | 200K    | E2EE · Private |
  | GLM 5V Turbo (Beta)               | `z-ai-glm-5v-turbo`                    | \$1.50      | \$5.00       | \$0.30     | -           | 200K    | Anonymized     |
  | Google Gemma 3 27B Instruct       | `google-gemma-3-27b-it`                | \$0.12      | \$0.20       | -          | -           | 198K    | Private        |
  | Google Gemma 4 26B A4B Instruct   | `google-gemma-4-26b-a4b-it`            | \$0.16      | \$0.50       | -          | -           | 256K    | Private        |
  | Google Gemma 4 31B Instruct       | `google-gemma-4-31b-it`                | \$0.12      | \$0.36       | \$0.09     | -           | 256K    | Private        |
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
  | GPT-5.5 (Beta)                    | `openai-gpt-55`                        | \$6.25      | \$37.50      | \$0.63     | -           | 1000K   | Anonymized     |
  | ↳ >272K Context                   |                                        | \$12.50     | \$56.25      | \$1.25     | -           |         |                |
  | GPT-5.5 Pro (Beta)                | `openai-gpt-55-pro`                    | \$37.50     | \$225.00     | -          | -           | 1000K   | Anonymized     |
  | Grok 4.20                         | `grok-4-20`                            | \$1.42      | \$2.83       | \$0.23     | -           | 2000K   | Private        |
  | ↳ >200K Context                   |                                        | \$2.83      | \$5.67       | \$0.45     | -           |         |                |
  | Grok 4.20 Multi-Agent             | `grok-4-20-multi-agent`                | \$1.42      | \$2.83       | \$0.23     | -           | 2000K   | Private        |
  | ↳ >200K Context                   |                                        | \$2.83      | \$5.67       | \$0.45     | -           |         |                |
  | Grok 4.3                          | `grok-4-3`                             | \$1.42      | \$2.83       | \$0.23     | -           | 1000K   | Private        |
  | ↳ >200K Context                   |                                        | \$2.83      | \$5.67       | \$0.45     | -           |         |                |
  | Grok Build 0.1 (Beta)             | `grok-build-0-1`                       | \$1.00      | \$2.00       | \$0.20     | -           | 256K    | Private        |
  | ↳ >200K Context                   |                                        | \$2.00      | \$4.00       | \$0.40     | -           |         |                |
  | Hermes 3 Llama 3.1 405b           | `hermes-3-llama-3.1-405b`              | \$1.10      | \$3.00       | -          | -           | 128K    | Private        |
  | Hy3 Preview (Beta)                | `tencent-hy3-preview`                  | \$0.06      | \$0.21       | \$0.02     | -           | 256K    | Private        |
  | Kimi K2.5                         | `kimi-k2-5`                            | \$0.56      | \$3.50       | \$0.22     | -           | 256K    | Private        |
  | Kimi K2.6                         | `kimi-k2-6`                            | \$0.85      | \$4.66       | \$0.22     | -           | 256K    | Private        |
  | Llama 3.2 3B                      | `llama-3.2-3b`                         | \$0.15      | \$0.60       | -          | -           | 128K    | Private        |
  | Llama 3.3 70B                     | `llama-3.3-70b`                        | \$0.70      | \$2.80       | -          | -           | 128K    | Private        |
  | Mercury 2 (Beta)                  | `mercury-2`                            | \$0.31      | \$0.94       | \$0.03     | -           | 128K    | Anonymized     |
  | MiniMax M2.5                      | `minimax-m25`                          | \$0.34      | \$1.19       | \$0.04     | -           | 198K    | Private        |
  | MiniMax M2.7                      | `minimax-m27`                          | \$0.38      | \$1.50       | \$0.07     | -           | 198K    | Private        |
  | MiniMax M3                        | `minimax-m3`                           | \$0.30      | \$1.20       | \$0.06     | -           | 500K    | Anonymized     |
  | Mistral Small 3.2 24B Instruct    | `mistral-small-3-2-24b-instruct`       | \$0.09      | \$0.25       | -          | -           | 256K    | Private        |
  | Mistral Small 4 (Beta)            | `mistral-small-2603`                   | \$0.19      | \$0.75       | -          | -           | 256K    | Private        |
  | Nemotron Cascade 2 30B A3B (Beta) | `nvidia-nemotron-cascade-2-30b-a3b`    | \$0.14      | \$0.80       | -          | -           | 256K    | Private        |
  | NVIDIA Nemotron 3 Nano 30B (Beta) | `nvidia-nemotron-3-nano-30b-a3b`       | \$0.07      | \$0.30       | -          | -           | 128K    | Private        |
  | NVIDIA Nemotron 3 Ultra           | `nvidia-nemotron-3-ultra-550b-a55b`    | \$0.63      | \$3.13       | \$0.19     | -           | 256K    | Private        |
  | OpenAI GPT OSS 120B               | `openai-gpt-oss-120b`                  | \$0.07      | \$0.30       | -          | -           | 128K    | Private        |
  | Qwen 2.5 7B (Beta)                | `e2ee-qwen-2-5-7b-p`                   | \$0.05      | \$0.13       | -          | -           | 32K     | E2EE · Private |
  | Qwen 3 235B A22B Instruct 2507    | `qwen3-235b-a22b-instruct-2507`        | \$0.15      | \$0.75       | -          | -           | 128K    | Private        |
  | Qwen 3 235B A22B Thinking 2507    | `qwen3-235b-a22b-thinking-2507`        | \$0.45      | \$3.50       | -          | -           | 128K    | Private        |
  | Qwen 3 Coder 480B Turbo (Beta)    | `qwen3-coder-480b-a35b-instruct-turbo` | \$0.35      | \$1.50       | \$0.04     | -           | 256K    | Private        |
  | Qwen 3 Next 80b                   | `qwen3-next-80b`                       | \$0.35      | \$1.90       | -          | -           | 256K    | Private        |
  | Qwen 3.5 35B A3B (Beta)           | `qwen3-5-35b-a3b`                      | \$0.31      | \$1.25       | \$0.16     | -           | 256K    | Private        |
  | Qwen 3.5 397B                     | `qwen3-5-397b-a17b`                    | \$0.75      | \$4.50       | -          | -           | 128K    | Anonymized     |
  | Qwen 3.5 9B                       | `qwen3-5-9b`                           | \$0.10      | \$0.15       | -          | -           | 256K    | Private        |
  | Qwen 3.6 27B                      | `qwen3-6-27b`                          | \$0.33      | \$3.25       | -          | -           | 256K    | Private        |
  | Qwen 3.6 35B A3B FP8 (Beta)       | `e2ee-qwen3-6-35b-a3b`                 | \$0.18      | \$1.18       | \$0.06     | -           | 32K     | E2EE · Private |
  | Qwen 3.6 Plus Uncensored (Beta)   | `qwen-3-6-plus`                        | \$0.63      | \$3.75       | \$0.06     | \$0.78      | 1000K   | Anonymized     |
  | ↳ >256K Context                   |                                        | \$2.50      | \$7.50       | \$0.06     | \$0.78      |         |                |
  | Qwen 3.7 Max (Beta)               | `qwen-3-7-max`                         | \$2.70      | \$8.05       | \$0.27     | \$3.35      | 1000K   | Anonymized     |
  | Qwen 3.7 Plus (Beta)              | `qwen-3-7-plus`                        | \$0.50      | \$2.00       | \$0.05     | \$0.63      | 1000K   | Anonymized     |
  | ↳ >256K Context                   |                                        | \$1.50      | \$6.00       | \$0.15     | \$1.88      |         |                |
  | Qwen3 30B A3B (Beta)              | `e2ee-qwen3-30b-a3b-p`                 | \$0.19      | \$0.69       | -          | -           | 256K    | E2EE · Private |
  | Qwen3 VL 235B                     | `qwen3-vl-235b-a22b`                   | \$0.25      | \$1.50       | -          | -           | 256K    | Private        |
  | Qwen3 VL 30B A3B (Beta)           | `e2ee-qwen3-vl-30b-a3b-p`              | \$0.25      | \$0.90       | -          | -           | 128K    | E2EE · Private |
  | Qwen3.6 35B A3B Uncensored (Beta) | `e2ee-qwen3-6-35b-a3b-uncensored-p`    | \$0.38      | \$1.88       | -          | -           | 128K    | E2EE · Private |
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

  | Model                            | ID                           | Price                            | Privacy    |
  | -------------------------------- | ---------------------------- | -------------------------------- | ---------- |
  | Recraft V4 Pro                   | `recraft-v4-pro`             | Per Image: \$0.29                | Anonymized |
  | GPT Image 2                      | `gpt-image-2`                | 1K: $0.27, 2K: $0.51, 4K: \$0.84 | Anonymized |
  | GPT Image 1.5                    | `gpt-image-1-5`              | Per Image: \$0.26                | Anonymized |
  | Nano Banana Pro                  | `nano-banana-pro`            | 1K: $0.18, 2K: $0.23, 4K: \$0.35 | Anonymized |
  | Ideogram V4                      | `ideogram-v4`                | Per Image: \$0.15                | Anonymized |
  | Nano Banana 2                    | `nano-banana-2`              | 1K: $0.10, 2K: $0.14, 4K: \$0.19 | Anonymized |
  | Qwen Image 2 Pro                 | `qwen-image-2-pro`           | Per Image: \$0.10                | Anonymized |
  | Wan 2.7 Pro                      | `wan-2-7-pro-text-to-image`  | Per Image: \$0.09                | Anonymized |
  | Flux 2 Max                       | `flux-2-max`                 | Per Image: \$0.09                | Anonymized |
  | Grok Imagine High Quality (SOTA) | `grok-imagine-image-quality` | 1K: $0.08, 2K: $0.10             | Private    |
  | ImagineArt 1.5 Pro               | `imagineart-1.5-pro`         | Per Image: \$0.06                | Anonymized |
  | Qwen Image 2                     | `qwen-image-2`               | Per Image: \$0.05                | Anonymized |
  | Recraft V4                       | `recraft-v4`                 | Per Image: \$0.05                | Anonymized |
  | Seedream V4.5                    | `seedream-v4`                | Per Image: \$0.05                | Anonymized |
  | Seedream V5 Lite                 | `seedream-v5-lite`           | Per Image: \$0.05                | Anonymized |
  | Flux 2 Pro                       | `flux-2-pro`                 | Per Image: \$0.04                | Anonymized |
  | Grok Imagine                     | `grok-imagine-image`         | 1K: $0.04, 2K: $0.06             | Private    |
  | Wan 2.7                          | `wan-2-7-text-to-image`      | Per Image: \$0.04                | Anonymized |
  | Background Remover               | `bria-bg-remover`            | Per Image: \$0.03                | Anonymized |
  | Qwen Image                       | `qwen-image`                 | Per Image: \$0.03                | Anonymized |
  | Anime (WAI)                      | `wai-Illustrious`            | Per Image: \$0.01                | Private    |
  | Chroma                           | `chroma`                     | Per Image: \$0.01                | Private    |
  | Lustify SDXL                     | `lustify-sdxl`               | Per Image: \$0.01                | Private    |
  | Lustify v7                       | `lustify-v7`                 | Per Image: \$0.01                | Private    |
  | Lustify v8                       | `lustify-v8`                 | Per Image: \$0.01                | Private    |
  | Venice SD35                      | `venice-sd35`                | Per Image: \$0.01                | Private    |
  | Z-Image Turbo                    | `z-image-turbo`              | Per Image: \$0.01                | Private    |
  | Hunyuan Image 3.0 (Beta)         | `hunyuan-image-v3`           | Per Image: \$0.09                | Private    |
  | Krea v2 Large (Beta)             | `krea-v2-large`              | Per Image: \$0.07                | Anonymized |
  | Krea v2 Medium (Beta)            | `krea-v2-medium`             | Per Image: \$0.04                | Anonymized |

  #### Upscaling

  | Model          | ID         | 2x Upscale | 4x Upscale |
  | -------------- | ---------- | ---------- | ---------- |
  | Image Upscaler | `upscaler` | \$0.02     | \$0.08     |

  #### Editing

  | Model                     | ID                          | Per Edit |
  | ------------------------- | --------------------------- | -------- |
  | FireRed Edit              | `firered-image-edit`        | \$0.04   |
  | Flux 2 Max                | `flux-2-max-edit`           | \$0.19   |
  | GPT Image 1.5             | `gpt-image-1-5-edit`        | \$0.36   |
  | GPT Image 2               | `gpt-image-2-edit`          | \$0.36   |
  | Grok Imagine              | `grok-imagine-edit`         | \$0.04   |
  | Grok Imagine High Quality | `grok-imagine-quality-edit` | \$0.10   |
  | Nano Banana 2             | `nano-banana-2-edit`        | \$0.10   |
  | Nano Banana Pro           | `nano-banana-pro-edit`      | \$0.18   |
  | Qwen Edit 2511            | `qwen-edit`                 | \$0.04   |
  | Qwen Edit Uncensored      | `qwen-edit-uncensored`      | \$0.04   |
  | Qwen Image 2              | `qwen-image-2-edit`         | \$0.05   |
  | Qwen Image 2 Pro          | `qwen-image-2-pro-edit`     | \$0.10   |
  | Seedream V4.5             | `seedream-v4-edit`          | \$0.05   |
  | Seedream V5 Lite          | `seedream-v5-lite-edit`     | \$0.05   |
  | Wan 2.7 Pro Edit          | `wan-2-7-pro-edit`          | \$0.09   |
  | Qwen Image                | `qwen-image`                | \$0.04   |
</div>

### Audio

<div>
  #### Text-to-Speech

  | Model                       | ID                          | Per 1M Characters | Privacy    |
  | --------------------------- | --------------------------- | ----------------- | ---------- |
  | Chatterbox HD (Resemble AI) | `tts-chatterbox-hd`         | \$50.00           | Private    |
  | ElevenLabs Turbo v2.5       | `tts-elevenlabs-turbo-v2-5` | \$62.50           | Anonymized |
  | Gemini 3.1 Flash TTS        | `tts-gemini-3-1-flash`      | \$187.50          | Anonymized |
  | Gradium TTS                 | `tts-gradium-v1`            | \$47.50           | Anonymized |
  | Inworld TTS-1.5 Max         | `tts-inworld-1-5-max`       | \$12.50           | Anonymized |
  | Kokoro Text to Speech       | `tts-kokoro`                | \$3.50            | Private    |
  | MiniMax Speech-02 HD        | `tts-minimax-speech-02-hd`  | \$125.00          | Anonymized |
  | Orpheus TTS                 | `tts-orpheus`               | \$62.50           | Private    |
  | Qwen 3 TTS 0.6B             | `tts-qwen3-0-6b`            | \$87.50           | Private    |
  | Qwen 3 TTS 1.7B             | `tts-qwen3-1-7b`            | \$112.50          | Private    |
  | xAI TTS v1                  | `tts-xai-v1`                | \$18.75           | Anonymized |

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
  | Lyria 3 Pro       | `lyria-3-pro`       | \$0.10         | Anonymized |
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

  | Model                            | ID                                        | Type           | Pricing  | Privacy    |
  | -------------------------------- | ----------------------------------------- | -------------- | -------- | ---------- |
  | Grok Imagine                     | `grok-imagine-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Grok Imagine                     | `grok-imagine-image-to-video`             | Image to Video | Variable | Anonymized |
  | Grok Imagine 1.5 Private         | `grok-imagine-1-5-image-to-video-private` | Image to Video | Variable | Private    |
  | Grok Imagine Private             | `grok-imagine-text-to-video-private`      | Text to Video  | Variable | Private    |
  | Grok Imagine Private             | `grok-imagine-image-to-video-private`     | Image to Video | Variable | Private    |
  | Grok Imagine Private             | `grok-imagine-video-to-video-private`     | Text to Video  | Variable | Private    |
  | Grok Imagine R2V (Beta)          | `grok-imagine-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Grok Imagine R2V Private         | `grok-imagine-reference-to-video-private` | Text to Video  | Variable | Private    |
  | HappyHorse 1.0                   | `happyhorse-1-0-text-to-video`            | Text to Video  | Variable | Anonymized |
  | HappyHorse 1.0                   | `happyhorse-1-0-image-to-video`           | Image to Video | Variable | Anonymized |
  | HappyHorse 1.0 Edit              | `happyhorse-1-0-video-to-video`           | Text to Video  | Variable | Anonymized |
  | HappyHorse 1.0 Reference         | `happyhorse-1-0-reference-to-video`       | Text to Video  | Variable | Anonymized |
  | Kling 2.5 Turbo Pro              | `kling-2.5-turbo-pro-text-to-video`       | Text to Video  | Variable | Anonymized |
  | Kling 2.5 Turbo Pro              | `kling-2.5-turbo-pro-image-to-video`      | Image to Video | Variable | Anonymized |
  | Kling 2.6 Pro                    | `kling-2.6-pro-text-to-video`             | Text to Video  | Variable | Anonymized |
  | Kling 2.6 Pro                    | `kling-2.6-pro-image-to-video`            | Image to Video | Variable | Anonymized |
  | Kling O3 4K                      | `kling-o3-4k-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Kling O3 4K                      | `kling-o3-4k-image-to-video`              | Image to Video | Variable | Anonymized |
  | Kling O3 4K R2V                  | `kling-o3-4k-reference-to-video`          | Text to Video  | Variable | Anonymized |
  | Kling O3 Pro                     | `kling-o3-pro-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Kling O3 Pro                     | `kling-o3-pro-image-to-video`             | Image to Video | Variable | Anonymized |
  | Kling O3 Pro R2V (Beta)          | `kling-o3-pro-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling O3 Standard                | `kling-o3-standard-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling O3 Standard                | `kling-o3-standard-image-to-video`        | Image to Video | Variable | Anonymized |
  | Kling O3 Standard R2V (Beta)     | `kling-o3-standard-reference-to-video`    | Text to Video  | Variable | Anonymized |
  | Kling V3 4K                      | `kling-v3-4k-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Kling V3 4K R2V                  | `kling-v3-4k-reference-to-video`          | Text to Video  | Variable | Anonymized |
  | Kling V3 Pro                     | `kling-v3-pro-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Kling V3 Pro                     | `kling-v3-pro-image-to-video`             | Image to Video | Variable | Anonymized |
  | Kling V3 Pro Motion Control      | `kling-v3-pro-motion-control`             | Text to Video  | Variable | Anonymized |
  | Kling V3 Standard                | `kling-v3-standard-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Kling V3 Standard                | `kling-v3-standard-image-to-video`        | Image to Video | Variable | Anonymized |
  | Kling V3 Standard Motion Control | `kling-v3-standard-motion-control`        | Text to Video  | Variable | Anonymized |
  | Longcat Distilled                | `longcat-distilled-image-to-video`        | Image to Video | Variable | Private    |
  | Longcat Distilled                | `longcat-distilled-text-to-video`         | Text to Video  | Variable | Private    |
  | Longcat Full Quality             | `longcat-image-to-video`                  | Image to Video | Variable | Private    |
  | Longcat Full Quality             | `longcat-text-to-video`                   | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B                | `ltx-2-19b-full-text-to-video`            | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B                | `ltx-2-19b-full-image-to-video`           | Image to Video | Variable | Private    |
  | LTX Video 2.0 19B Distilled      | `ltx-2-19b-distilled-text-to-video`       | Text to Video  | Variable | Private    |
  | LTX Video 2.0 19B Distilled      | `ltx-2-19b-distilled-image-to-video`      | Image to Video | Variable | Private    |
  | LTX Video 2.0 Fast               | `ltx-2-fast-image-to-video`               | Image to Video | Variable | Anonymized |
  | LTX Video 2.0 Fast               | `ltx-2-fast-text-to-video`                | Text to Video  | Variable | Anonymized |
  | LTX Video 2.0 Full Quality       | `ltx-2-full-image-to-video`               | Image to Video | Variable | Anonymized |
  | LTX Video 2.0 Full Quality       | `ltx-2-full-text-to-video`                | Text to Video  | Variable | Anonymized |
  | LTX Video 2.3 Fast               | `ltx-2-v2-3-fast-image-to-video`          | Image to Video | Variable | Anonymized |
  | LTX Video 2.3 Fast               | `ltx-2-v2-3-fast-text-to-video`           | Text to Video  | Variable | Anonymized |
  | LTX Video 2.3 Full Quality       | `ltx-2-v2-3-full-image-to-video`          | Image to Video | Variable | Anonymized |
  | LTX Video 2.3 Full Quality       | `ltx-2-v2-3-full-text-to-video`           | Text to Video  | Variable | Anonymized |
  | Ovi                              | `ovi-image-to-video`                      | Image to Video | Variable | Private    |
  | PixVerse C1                      | `pixverse-c1-text-to-video`               | Text to Video  | Variable | Anonymized |
  | PixVerse C1                      | `pixverse-c1-image-to-video`              | Image to Video | Variable | Anonymized |
  | PixVerse C1 R2V                  | `pixverse-c1-reference-to-video`          | Text to Video  | Variable | Anonymized |
  | PixVerse C1 Transition           | `pixverse-c1-transition`                  | Text to Video  | Variable | Anonymized |
  | PixVerse v5.6                    | `pixverse-v5.6-text-to-video`             | Text to Video  | Variable | Anonymized |
  | PixVerse v5.6                    | `pixverse-v5.6-image-to-video`            | Image to Video | Variable | Anonymized |
  | PixVerse v5.6 Transition         | `pixverse-v5.6-transition`                | Text to Video  | Variable | Anonymized |
  | Runway Gen-4 Aleph               | `runway-gen4-aleph`                       | Text to Video  | Variable | Anonymized |
  | Runway Gen-4 Turbo               | `runway-gen4-turbo`                       | Text to Video  | Variable | Anonymized |
  | Runway Gen-4.5                   | `runway-gen4-5`                           | Text to Video  | Variable | Anonymized |
  | Runway Gen-4.5                   | `runway-gen4-5-text`                      | Text to Video  | Variable | Anonymized |
  | Seedance 1.5 Pro                 | `seedance-1-5-pro-text-to-video`          | Text to Video  | Variable | Anonymized |
  | Seedance 1.5 Pro                 | `seedance-1-5-pro-image-to-video`         | Image to Video | Variable | Anonymized |
  | Seedance 2.0                     | `seedance-2-0-text-to-video`              | Text to Video  | Variable | Anonymized |
  | Seedance 2.0                     | `seedance-2-0-image-to-video`             | Image to Video | Variable | Anonymized |
  | Seedance 2.0 Fast                | `seedance-2-0-fast-text-to-video`         | Text to Video  | Variable | Anonymized |
  | Seedance 2.0 Fast                | `seedance-2-0-fast-image-to-video`        | Image to Video | Variable | Anonymized |
  | Seedance 2.0 Fast R2V            | `seedance-2-0-fast-reference-to-video`    | Text to Video  | Variable | Anonymized |
  | Seedance 2.0 R2V                 | `seedance-2-0-reference-to-video`         | Text to Video  | Variable | Anonymized |
  | Topaz Video Upscale              | `topaz-video-upscale`                     | Text to Video  | Variable | Anonymized |
  | Veo 3 Fast                       | `veo3-fast-text-to-video`                 | Text to Video  | Variable | Anonymized |
  | Veo 3 Fast                       | `veo3-fast-image-to-video`                | Image to Video | Variable | Anonymized |
  | Veo 3 Full Quality               | `veo3-full-text-to-video`                 | Text to Video  | Variable | Anonymized |
  | Veo 3 Full Quality               | `veo3-full-image-to-video`                | Image to Video | Variable | Anonymized |
  | Veo 3.1 Fast                     | `veo3.1-fast-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Veo 3.1 Fast                     | `veo3.1-fast-image-to-video`              | Image to Video | Variable | Anonymized |
  | Veo 3.1 Full Quality             | `veo3.1-full-text-to-video`               | Text to Video  | Variable | Anonymized |
  | Veo 3.1 Full Quality             | `veo3.1-full-image-to-video`              | Image to Video | Variable | Anonymized |
  | Vidu Q3                          | `vidu-q3-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Vidu Q3                          | `vidu-q3-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.1 Pro                      | `wan-2.1-pro-image-to-video`              | Image to Video | Variable | Private    |
  | Wan 2.2 A14B                     | `wan-2.2-a14b-text-to-video`              | Text to Video  | Variable | Private    |
  | Wan 2.5 Preview                  | `wan-2.5-preview-image-to-video`          | Image to Video | Variable | Anonymized |
  | Wan 2.5 Preview                  | `wan-2.5-preview-text-to-video`           | Text to Video  | Variable | Anonymized |
  | Wan 2.6                          | `wan-2.6-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.6                          | `wan-2.6-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Wan 2.6 Flash                    | `wan-2.6-flash-image-to-video`            | Image to Video | Variable | Anonymized |
  | Wan 2.7                          | `wan-2-7-text-to-video`                   | Text to Video  | Variable | Anonymized |
  | Wan 2.7                          | `wan-2-7-image-to-video`                  | Image to Video | Variable | Anonymized |
  | Wan 2.7 Edit                     | `wan-2-7-video-to-video`                  | Text to Video  | Variable | Anonymized |
  | Wan 2.7 Reference                | `wan-2-7-reference-to-video`              | Text to Video  | Variable | Anonymized |
  | Wan 2.7 Uncensored               | `wan-2-7-uncensored-image-to-video`       | Image to Video | Variable | Anonymized |
  | Wan 2.7 Uncensored (Beta)        | `wan-2-7-uncensored-text-to-video`        | Text to Video  | Variable | Anonymized |
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

How Venice handles prompts, responses, metadata, TEE, and end-to-end encrypted model requests.

One of Venice's guiding principles is user privacy. The platform's architecture flows from this philosophical principle, and every component is designed with this objective in mind.

> The only way to achieve reasonable user privacy is to avoid collecting this information in the first place. This is harder to do from an engineering perspective, but we believe it is the correct approach.

The Venice API replicates the same backend privacy architecture as the Venice platform: requests pass through the Venice proxy over encrypted connections, Venice does not store or log prompt and response content for normal inference, and each selected model adds one of four privacy modes at the runtime layer: Anonymous, Private, TEE, or E2EE.

<img alt="Venice AI Privacy Architecture" />

## Privacy architecture

The Venice proxy is the shared foundation for every privacy mode. Requests pass through Venice over HTTPS/TLS and are relayed without Venice storing prompt or response content. The privacy mode on the selected model determines what happens next at the provider or model runtime layer.

Venice presents model privacy in four modes. They build on the same proxy foundation and add progressively stronger protections, from obscuring identity from the provider to encrypting prompts end-to-end into a verified enclave.

<div>Increasing privacy protection</div>

<div>
  <div>
    <div>
      <span>Anonymous</span>
    </div>

    <h3>Identity obscured from provider</h3>
    <p>Venice proxies the request without sending your Venice identity to the model provider. Prompt content is still visible to that provider.</p>
  </div>

  <div>
    <div>
      <span>Private</span>
    </div>

    <h3>Zero data retention, contract-enforced</h3>
    <p>Prompt and response content is processed for inference only and is not retained after the request completes.</p>
  </div>

  <div>
    <div>
      <span>TEE</span>
    </div>

    <h3>Hardware-isolated inference</h3>
    <p>Supported models run inside a Trusted Execution Environment with remote attestation support.</p>
  </div>

  <div>
    <div>
      <span>E2EE</span>
    </div>

    <h3>End-to-end encrypted to a verified TEE</h3>
    <p>Your client encrypts the prompt before sending it. Venice relays ciphertext, and only the verified TEE decrypts it.</p>
  </div>
</div>

The `/models` endpoint tells you each model's privacy level. Models marked as `anonymized` are Anonymous models, and models marked as `private` are Private models. TEE and E2EE are shown separately in the model's capabilities, such as `supportsTeeAttestation` and `supportsE2EE`.

<Info>
  For implementation details, see the [TEE & E2EE models guide](/guides/features/tee-e2ee-models).
</Info>

## TEE and E2EE

TEE and E2EE models add cryptographic and hardware-backed controls on top of Venice's default no-content-retention approach.

<CardGroup>
  <Card title="Use TEE when" icon="shield-halved">
    You want the model to run inside an attested hardware enclave, but your client can send plaintext prompts over the normal API request.
  </Card>

  <Card title="Use E2EE when" icon="lock">
    You want prompts encrypted before they leave your client and decrypted only inside a verified TEE.
  </Card>
</CardGroup>

The E2EE flow uses `/chat/completions` with E2EE-capable models. Your client must fetch attestation, verify the nonce and enclave evidence, encrypt `user` and `system` messages, send the `X-Venice-TEE-*` headers, stream the response, and verify/decrypt response content.

E2EE also disables features that need plaintext outside the enclave, such as web search, memory, summaries, some tool flows, and other server-side processing.

## Choosing a model

Use `/models` to see what privacy protections each model supports before you send a request.

Each model has two relevant fields:

* `model_spec.privacy` tells you the model's baseline privacy mode:
  * `anonymized`: Venice hides your identity from the provider, but the provider may still see the prompt.
  * `private`: Venice routes the request through zero-data-retention infrastructure.
* `model_spec.capabilities` tells you whether the model supports stronger protections:
  * `supportsTeeAttestation`: the model can run inside a verifiable Trusted Execution Environment.
  * `supportsE2EE`: the model can accept client-encrypted prompts that are decrypted only inside the TEE.

E2EE is a client-driven flow. Your application must encrypt the request, verify attestation, and verify/decrypt the response. See the [TEE & E2EE models guide](/guides/features/tee-e2ee-models).

<CodeGroup>
  ```bash cURL theme={"system"}
  curl https://api.venice.ai/api/v1/models \
    -H "Authorization: Bearer $API_KEY_VENICE" | \
    jq '.data[] | {
      id,
      privacy: .model_spec.privacy,
      tee: .model_spec.capabilities.supportsTeeAttestation,
      e2ee: .model_spec.capabilities.supportsE2EE
    }'
  ```
</CodeGroup>

A simple rule of thumb: choose `private` for zero data retention, choose `tee: true` for hardware-backed isolation, and choose `e2ee: true` when you need prompts encrypted before they leave your client.

## Operational metadata

Venice may process metadata needed for authentication, billing, abuse prevention, reliability, analytics, and support. Depending on how you use the product, this can include account or wallet identifiers, API key identifiers, request timestamps, selected model, token counts, billing amounts, rate-limit state, request IDs, IP address, browser or device information, and product event logs.

This metadata is used to operate the API and is separate from prompt and response content. Billing and usage records track details such as model, endpoint, token counts, timestamps, and account identifiers; they do not require storing the prompt or completion.