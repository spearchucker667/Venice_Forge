# Image Inspector

Image Inspector turns a local image into a structured visual analysis and a reusable image-generation prompt. It can also derive editable text queries for potential-source discovery. It does not perform pixel-based reverse-image matching.

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
4. Select an analysis depth:
   - **Quick** for a compact result
   - **Standard** for normal prompt reconstruction
   - **Maximum** for more visual detail
   - **Forensic** for the most exhaustive supported analysis
5. Choose a prompt target.
6. Optionally add instructions such as `Focus on lighting and composition`.
7. Select **Analyze Image**.

The shared anime processing animation remains visible while analysis is running. You can cancel an in-progress request. Completed and failed sessions remain available in the Image Inspector session list.

## Supported Inputs

Desktop ingestion accepts valid PNG, JPEG, and WebP images through the native file picker or clipboard. Images are decoded and checked for type, signature, byte size, dimensions, and total decoded pixels before a provider request is allowed.

Image bytes are resolved through the main process. The renderer does not receive unrestricted filesystem access or arbitrary local paths.

## Text-Based Source Discovery

After a successful analysis, review or edit the suggested query and select the Google- or Brave-backed search action. Results are ranked as potential text-query sources.

This feature:

- Searches with descriptive text derived from the analysis
- May help identify visually described subjects, products, artists, or pages
- Does not upload the image to a reverse-image-search engine
- Does not calculate pixel similarity or prove that a result is the original source

Treat source results as leads that require human verification.

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
- Source discovery is text based and cannot establish visual identity, ownership, provenance, or copyright status.
- Paid-provider PNG, JPEG, and WebP acceptance remains part of release manual verification.

For implementation and security details, see [Image Inspector Architecture](../developer/image-inspector-architecture.md).
