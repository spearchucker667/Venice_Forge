export type ImageInspectorInputSource =
  | "file"
  | "clipboard"
  | "attachment"
  | "app-media";

export interface ImageInspectorInput {
  id: string;
  source: ImageInspectorInputSource;
  displayName: string;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
  mediaId?: string;
  attachmentId?: string;
  sha256?: string;
  uri?: string;
}

export type ImageAnalysisDepth = "quick" | "standard" | "maximum" | "forensic";

export type PromptTarget =
  | "generic"
  | "venice-image"
  | "flux"
  | "sdxl"
  | "stable-diffusion"
  | "midjourney"
  | "custom";

export interface VisualSubject {
  description: string;
  attributes: string[];
}
export interface CompositionAnalysis {
  description: string;
}
export interface LightingAnalysis {
  description: string;
}
export interface ColorAnalysis {
  description: string;
}
export interface EnvironmentAnalysis {
  description: string;
}
export interface StyleAnalysis {
  description: string;
}
export interface TechnicalAnalysis {
  description: string;
}
export interface MoodAnalysis {
  description: string;
}
export interface VisibleTextItem {
  text: string;
  type: string;
}
export interface SourceClue {
  type: string;
  value: string;
}
export interface SearchQueryCandidate {
  query: string;
  type: string;
}
export interface ConfidenceSummary {
  overall: number;
  uncertainties: string[];
}

export interface ReplicationPrompt {
  target: PromptTarget;
  positive: string;
  negative: string;
  aspectRatioHint?: string;
  cameraHints?: string[];
  lightingHints?: string[];
  colorHints?: string[];
}

export interface ImageInspectorAnalysis {
  schemaVersion: 1;
  summary: string;
  subjects: VisualSubject[];
  composition: CompositionAnalysis;
  lighting: LightingAnalysis;
  color: ColorAnalysis;
  environment: EnvironmentAnalysis;
  style: StyleAnalysis;
  technical: TechnicalAnalysis;
  mood: MoodAnalysis;
  visibleText: VisibleTextItem[];
  sourceClues: SourceClue[];
  replicationPrompt: ReplicationPrompt;
  negativePrompt: string;
  searchQueries: SearchQueryCandidate[];
  confidence: ConfidenceSummary;
  warnings: string[];
}

export type ImageSearchMode = "text-source-discovery";

export interface ImageSearchResult {
  id: string;
  providerId: string;
  title: string;
  pageUrl: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  sourceDomain: string;
  width?: number;
  height?: number;
  mimeType?: string;
  publishedAt?: string;
  indexedAt?: string;
  matchType: "potential-source";
  matchReason: string;
  rank: number;
}

export type SanitizedInspectorError = {
  code: ImageInspectorErrorCode;
  message: string;
};

export type ImageInspectorErrorCode =
  | "ANALYSIS_REQUEST_FAILED"
  | "ANALYSIS_PARSE_FAILED";

export interface ImageInspectorSearchRun {
  id: string;
  providerId: string;
  mode: ImageSearchMode;
  createdAt: string;
  queryIds: string[];
  resultIds: string[];
  status: "running" | "complete" | "partial" | "failed" | "canceled";
  warnings: string[];
}

export interface ImageInspectorSession {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  title: string;
  status:
    | "draft"
    | "analyzing"
    | "complete"
    | "partial"
    | "failed"
    | "canceled";
  inputs: ImageInspectorInput[];
  request: {
    modelId: string;
    depth: ImageAnalysisDepth;
    promptTarget: PromptTarget;
    userInstructions?: string;
  };
  analysis?: ImageInspectorAnalysis;
  searches: ImageInspectorSearchRun[];
  error?: SanitizedInspectorError;
}
