# Image Model Capabilities

Venice Forge maintains a strict capability contract for all image models. This documentation outlines the model operations, dimensions, and capability gating.

## Operations and Endpoints

Venice splits image processing across endpoints:

- **Text-to-Image** (`operation: 'text-to-image'`): Uses `POST /api/v1/image/generate`
- **Image Edit** (`operation: 'image-edit'`): Uses `POST /api/v1/image/edit`

## Seedream Model Integration

Seedream models are natively supported for both generation and editing.

### Text-to-Image Models (`/image/generate`)
- `seedream-v5-pro`
- `seedream-v5-lite`
- `seedream-v4`

### Image Edit Models (`/image/edit`)
- `seedream-v5-pro-edit`
- `seedream-v5-lite-edit`
- `seedream-v4-edit`

### Capability Table

| Capability | Text-to-Image (Seedream) | Image Edit (Seedream Edit) |
| --- | --- | --- |
| **Operation** | `text-to-image` | `image-edit` |
| **Dimension Mode** | `aspectRatio` | `aspectRatio` |
| **Default Ratio** | `1:1` | `auto` |
| **Seed** | ✅ Supported | ❌ Unsupported |
| **Variants** | ✅ Supported | ❌ Unsupported |
| **Negative Prompt** | ❌ Unsupported | ❌ Unsupported |
| **Steps** | ❌ Unsupported | ❌ Unsupported |
| **CFG Scale** | ❌ Unsupported | ❌ Unsupported |
| **Style** | ❌ Unsupported | ❌ Unsupported |

## How to add future models

To add a new image model, follow these steps:

1. **Verify Endpoint**: Check `docs/reference/Venice_swagger_api.yaml` to verify whether the model is intended for `/image/generate` or `/image/edit`.
2. **Update Registry**: Add an entry to `IMAGE_MODEL_CAPABILITIES` in `src/config/image-model-capabilities.ts`.
3. **Declare Constraints**: Supply `supportsNegativePrompt`, `supportsSeed`, `supportsVariants`, `supportsSteps`, `supportsCfgScale`, and `supportsStyle` according to the Swagger specification.
4. **Dimension Mode**: Assign the correct dimension mode. Older SD-classic models tend to use `widthHeight`. Newer models (Nano, Seedream) rely on `aspectRatio` or `aspectResolution`.
5. **Update Constants**: Add the ID to relevant sets in `src/constants/venice.ts` if it is an edit model (`IMAGE_EDIT_MODEL_IDS`) or if it needs to be statically resolvable.
6. **Tests**: Update `src/config/image-model-capabilities.test.ts` to assert the newly added model's behavior.
