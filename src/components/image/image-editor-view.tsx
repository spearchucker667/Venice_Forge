import { ImageTools } from "./image-tools";

/** Dedicated navigation destination for the existing image-edit workflow. */
export function ImageEditorView() {
  return <ImageTools editOnly />;
}
