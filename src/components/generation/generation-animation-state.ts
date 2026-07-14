export type GenerationVisualState =
  | "queued"
  | "starting"
  | "generating"
  | "streaming"
  | "processing"
  | "reviewing"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export type AnimationSemanticGroup = "queued" | "active" | "processing" | "completed" | "failed" | "neutral";

export function getSemanticGroup(state: GenerationVisualState): AnimationSemanticGroup {
  switch (state) {
    case "queued":
    case "starting":
      return "queued";
    case "generating":
    case "streaming":
      return "active";
    case "processing":
    case "reviewing":
    case "saving":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    default:
      return "neutral";
  }
}
