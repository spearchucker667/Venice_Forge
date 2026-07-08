import type { VeniceModel } from "../types/venice";

const FALLBACK_IMAGE_COST = 0.005;
const FALLBACK_VIDEO_COST = 0.05;

export function formatModelLabelWithCost(model: VeniceModel | { id: string, name?: string, type?: string }): string {
  const name = ('model_spec' in model && model.model_spec?.name) ? model.model_spec.name : (('name' in model && model.name) ? model.name : model.id);
  const type = ('type' in model) ? model.type : undefined;
  
  // Try to get live pricing
  let cost: number | undefined;
  if ('model_spec' in model && model.model_spec?.pricing?.output?.usd !== undefined) {
    cost = model.model_spec.pricing.output.usd;
  }
  
  if (cost === undefined) {
    if (type === 'image' || model.id.includes('image')) {
      cost = FALLBACK_IMAGE_COST;
    } else if (type === 'video' || model.id.includes('video')) {
      cost = FALLBACK_VIDEO_COST;
    }
  }

  if (cost !== undefined) {
    return `${name} (~$${cost.toFixed(3)})`;
  }
  return name;
}
