# Image Inspector

Image Inspector turns a local image into a structured visual analysis and a reusable image-generation prompt. Direct image-based web matching is currently unavailable and fail-closed.

## What It Produces

For a successful analysis, Image Inspector returns:

- A concise visual summary
- Subjects, composition, lighting, color, environment, style, technical characteristics, and mood
- Visible text and possible source clues
- A positive replication prompt tailored to Generic Natural Language, Venice Image Studio, FLUX, or Midjourney
- A negative prompt
- Suggested descriptive, attribution, and product-identification search queries
- Confidence and uncertainty notes

Model responses are validated against a versioned schema before they are stored or shown as successful. Common harmless formatting differences may be normalized, but incomplete or structurally unusable output fails closed.

## Analyze an Image

1. Open **Image Inspector** from the Generate section.
2. Select **Open File**, or use the clipboard button in the desktop app.
3. Choose a vision-capable model.
   The selector excludes models that explicitly lack vision support and displays the live USD input/output rates reported by the model catalog. Rates are per one million tokens; the final charge depends on the image and generated response.
4. Select an analysis depth:
   - **Quick** for a compact result
   - **Standard** for normal prompt reconstruction
   - **Maximum** for more visual detail
   - **Forensic** for the most exhaustive supported analysis
5. Choose a prompt target.
6. Optionally add instructions such as `Focus on lighting and composition`.
7. Select **Analyze Image**.

The shared anime processing animation remains visible while analysis is running. You can cancel an in-progress request. Completed and failed sessions remain available in the Image Inspector session list.

Use the delete button beside a completed, failed, canceled, or draft session to remove that inspection after confirmation. Deleting an inspection does not delete the underlying Media Studio image. An active analysis must be canceled before it can be deleted.

## Supported Inputs

Desktop ingestion accepts valid PNG, JPEG, and WebP images through the native file picker or clipboard. Images are decoded and checked for type, signature, byte size, dimensions, and total decoded pixels before a provider request is allowed.

Image bytes are resolved through the main process. The renderer does not receive unrestricted filesystem access or arbitrary local paths.

## Image-Based Source Search

Direct image-based web matching is currently unavailable. The prior Google/Brave action used a model-derived text query, not the inspected image bytes, so that action is disabled rather than presented as reverse-image search. Historical text-query results remain visibly labeled as legacy results.

The historical query-derived feature:

- Searches with descriptive text derived from the analysis
- May help identify visually described subjects, products, artists, or pages
- Does not upload the image to a reverse-image-search engine
- Does not calculate pixel similarity or prove that a result is the original source

Treat source results as leads that require human verification.

The currently configured Venice Google/Brave search contract accepts text queries only. Direct source-image upload requires a separate supported reverse-image provider and credential/privacy design; the app does not describe query-derived results as raw-image matches.

## Privacy and Diagnostics

Selecting **Analyze Image** sends the image and analysis instructions to the selected Venice vision model. Source-discovery queries are sent only when you explicitly start a search.

Venice Forge does not place raw image bytes, base64 data, complete prompts, API keys, or local absolute paths in safe diagnostics exports. Traffic Inspector records sanitized request shape, model, media metadata, status, timing, and normalized error information.

## Troubleshooting

- **No vision-capable models available:** Refresh the model catalog and confirm the configured Venice account exposes a model with vision capability metadata.
- **Request/schema/model error:** Select another live vision model and retry. Provider support for strict structured output can differ by model.
- **Response did not match the schema:** The model returned incomplete or incompatible structured content. Retry with another vision model or a lower analysis depth.
- **Image rejected before analysis:** Confirm the file is a valid PNG, JPEG, or WebP within the app's bounded size, dimension, and decoded-pixel limits.
- **Source result is unrelated:** Refine the generated query with distinctive visible text, product markings, names, or scene details.

## Known Limitations

- Live provider model availability and structured-output support can change.
- Analysis and reconstruction prompts are model interpretations, not factual guarantees.
- Direct source-image web matching cannot be enabled until a supported provider and credential/privacy design are implemented.
- Paid-provider PNG, JPEG, and WebP acceptance remains part of release manual verification.

For implementation and security details, see [Image Inspector Architecture](../developer/image-inspector-architecture.md).
