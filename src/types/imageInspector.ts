export type ImageInspectorInputSource =
  | "file"
  | "clipboard"
  | "url"
  | "attachment"
  | "app-media"
  | "media-record";

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
  sanitizedRemoteUrl?: string;
  sha256?: string;
  perceptualHash?: string;
  uri?: string;
}

export type ImageAnalysisDepth = "quick" | "standard" | "maximum" | "forensic";

export type ImageInspectorOutputFormat = "markdown" | "json" | "raw-prompt";

export type PromptTarget =
  | "generic"
  | "venice-image"
  | "flux"
  | "sdxl"
  | "stable-diffusion"
  | "midjourney"
  | "custom";

export interface PromptTargetProfile {
  id: PromptTarget;
  label: string;
  supportsNegativePrompt: boolean;
  supportsWeights: boolean;
  supportsAspectRatioSyntax: boolean;
  supportsSeed: boolean;
  promptStyle: "natural-language" | "tagged" | "command";
  systemSuffix?: string;
}

export interface InspectorVisionModel {
  id: string;
  name: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsSystemMessages: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
  status: "available" | "unavailable" | "unknown";
}

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

export interface EvidenceValue<T> {
  value: T;
  basis: "observed" | "inferred" | "unknown";
  confidence: number;
  alternatives?: T[];
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

export type ImageSearchMode =
  | "visual-query"
  | "reverse-image"
  | "local-hash";

export interface ProviderQuotaSummary {
  limit?: number;
  remaining?: number;
  resetDate?: string;
}

export interface TrustedImageReference {
  id: string;
  type: "app-media" | "attachment" | "file-path" | "remote-url";
  uri: string;
}

export interface ImageSearchRequest {
  sessionId: string;
  imageRef?: TrustedImageReference;
  queries: SearchQueryCandidate[];
  count: number;
  safeSearch?: "off" | "moderate" | "strict";
  country?: string;
  language?: string;
}

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
  matchType:
    | "exact-local"
    | "near-duplicate-local"
    | "potential-source"
    | "similar-image"
    | "possible-repost";
  matchReason: string;
  score: number;
}

export interface ImageSearchProviderResult {
  providerId: string;
  results: ImageSearchResult[];
  warnings: string[];
  quota?: ProviderQuotaSummary;
}

export interface ImageSearchProviderContext {
  signal?: AbortSignal;
}

export interface ImageSearchProvider {
  id: string;
  name: string;
  mode: ImageSearchMode;
  requiresApiKey: boolean;
  acceptsImage: boolean;
  acceptsImageUrl: boolean;
  supportsSafeSearch: boolean;

  search(
    request: ImageSearchRequest,
    context: ImageSearchProviderContext,
  ): Promise<ImageSearchProviderResult>;
}

export type SanitizedInspectorError = {
  code: ImageInspectorErrorCode;
  message: string;
};

export type ImageInspectorErrorCode =
  | "NO_INPUT"
  | "UNSUPPORTED_IMAGE"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_DECODE_FAILED"
  | "REMOTE_IMAGE_BLOCKED"
  | "NO_VISION_MODEL"
  | "MODEL_UNAVAILABLE"
  | "ANALYSIS_REQUEST_FAILED"
  | "ANALYSIS_PARSE_FAILED"
  | "ANALYSIS_CANCELED"
  | "PROVIDER_NOT_CONFIGURED"
  | "SEARCH_CONSENT_REQUIRED"
  | "SEARCH_RATE_LIMITED"
  | "SEARCH_REQUEST_FAILED"
  | "SEARCH_CANCELED"
  | "SESSION_SAVE_FAILED"
  | "EXPORT_FAILED";

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
    outputFormat: ImageInspectorOutputFormat;
    promptTarget: PromptTarget;
    userInstructions?: string;
  };
  analysis?: ImageInspectorAnalysis;
  searches: ImageInspectorSearchRun[];
  error?: SanitizedInspectorError;
}

export interface ImageInspectorSettings {
  defaultVisionModelId?: string;
  defaultDepth: ImageAnalysisDepth;
  defaultOutputFormat: ImageInspectorOutputFormat;
  defaultPromptTarget: PromptTarget;
  sourceDiscoveryEnabled: boolean;
  defaultSearchProviderId?: string;
  searchSafeMode: "off" | "moderate" | "strict";
  saveSessionsByDefault: boolean;
  includePreciseMetadata: boolean;
}

export interface ImageComparisonResult {
  sharedFeatures: EvidenceValue<string>[];
  differences: EvidenceValue<string>[];
  transformationPrompt: string;
  similarityScore?: number;
  hashEvidence?: {
    exactMatch: boolean;
    perceptualDistance?: number;
  };
  confidence: number;
}
