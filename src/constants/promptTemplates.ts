/**
 * @fileoverview Prompt templates library for enhancing image and video generation prompts.
 */

export interface PromptTemplate {
  id: string;
  label: string;
  description: string;
  category: "lighting" | "composition" | "character" | "style" | "quality" | "negative";
  positiveText?: string;
  negativeText?: string;
  compatibleModes: Array<"image" | "image-edit" | "image-to-video" | "video">;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Style
  {
    id: "style-anime",
    label: "Anime Illustration",
    description: "Vibrant colors, clean lineart, modern anime/manga aesthetic",
    category: "style",
    positiveText: ", anime illustration, vibrant colors, detailed lineart, clean studio work, high resolution",
    compatibleModes: ["image", "image-edit"]
  },
  {
    id: "style-cinematic",
    label: "Cinematic Film",
    description: "35mm camera film look, natural lighting, movie scene grain",
    category: "style",
    positiveText: ", cinematic style, shot on 35mm film, volumetric lighting, photorealistic details, grain, 8k",
    compatibleModes: ["image", "image-edit", "video"]
  },
  {
    id: "style-vector",
    label: "Minimalist Vector Art",
    description: "Clean flat color vector design, SVG style",
    category: "style",
    positiveText: ", flat vector art, minimalist svg illustration, clean shapes, corporate design style, no gradients",
    compatibleModes: ["image"]
  },
  {
    id: "style-oil",
    label: "Oil Painting",
    description: "Classical textured canvas brushstrokes",
    category: "style",
    positiveText: ", classical oil painting, textured canvas, visible paint brushstrokes, masterpiece, dramatic lighting",
    compatibleModes: ["image", "image-edit"]
  },

  // Lighting
  {
    id: "light-golden",
    label: "Golden Hour",
    description: "Warm, low-angle sunset glow",
    category: "lighting",
    positiveText: ", golden hour lighting, warm sunlight, long soft shadows, volumetric dust particles",
    compatibleModes: ["image", "image-edit", "video"]
  },
  {
    id: "light-studio",
    label: "Studio Portrait",
    description: "Professional multi-point studio key lighting",
    category: "lighting",
    positiveText: ", professional studio lighting, three-point key light, soft fill light, dark background, premium headshot quality",
    compatibleModes: ["image", "image-edit"]
  },
  {
    id: "light-neon",
    label: "Neon Cyberpunk",
    description: "Vibrant neon blues and magentas with dark shadows",
    category: "lighting",
    positiveText: ", neon cyberpunk lighting, ambient blue and pink glow, glowing rain-slicked city streets, high contrast",
    compatibleModes: ["image", "image-edit", "video"]
  },

  // Composition
  {
    id: "comp-closeup",
    label: "Extreme Close-Up",
    description: "Tight focus on facial details or small subjects",
    category: "composition",
    positiveText: ", extreme close-up shot, shallow depth of field, macro focus, high detail textures",
    compatibleModes: ["image", "image-edit"]
  },
  {
    id: "comp-drone",
    label: "Aerial Drone View",
    description: "High altitude bird's-eye perspective",
    category: "composition",
    positiveText: ", aerial drone shot, bird's-eye view, wide perspective landscape, high altitude composition",
    compatibleModes: ["image", "video"]
  },
  {
    id: "comp-thirds",
    label: "Rule of Thirds Wide",
    description: "Balanced off-center cinematic focal point",
    category: "composition",
    positiveText: ", wide angle landscape, rule of thirds composition, off-center subject, cinematic landscape balance",
    compatibleModes: ["image", "video"]
  },

  // Quality
  {
    id: "qual-photoreal",
    label: "Photorealistic 8k",
    description: "Maximizes resolution, skin textures, and material realism",
    category: "quality",
    positiveText: ", photorealistic, hyper-detailed, 8k resolution, raw photo, intricate textures, masterpiece quality",
    compatibleModes: ["image", "image-edit"]
  },

  // Negative
  {
    id: "neg-standard",
    label: "Standard Negative",
    description: "Standard prompts to avoid distortions and low quality",
    category: "negative",
    negativeText: "blurry, low quality, distorted, extra limbs, bad proportions, watermark, signature, text, out of frame",
    compatibleModes: ["image", "image-edit", "video"]
  }
];
