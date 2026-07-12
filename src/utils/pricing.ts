import type { VeniceModel } from "../types/venice";

const FALLBACK_IMAGE_COST = 0.005;

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
      return `${name} (Estimated ~$${FALLBACK_IMAGE_COST.toFixed(3)})`;
    }
  }

  if (cost !== undefined) {
    return `${name} (Live $${cost.toFixed(3)})`;
  }
  
  if (type === 'video' || model.id.includes('video')) {
    const state = ('source' in model && model.source)
      ? (model.source === 'live' ? 'Live'
        : model.source === 'fallback' ? 'Estimated'
        : model.source === 'catalog' ? 'Catalog' : 'Unavailable')
      : 'Catalog';
    return `${name} (${state})`;
  }
  return name;
}
