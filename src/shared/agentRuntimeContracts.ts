export interface TrustedRuntimeContent {
  currentDate: string;
  currentTime: string;
  timezone: string;
  timezoneOffsetMinutes: number;
  isoTimestamp: string;
  unixTimestamp: number;
}

export interface TrustedRuntimeLayer {
  kind: 'trusted-runtime';
  priority: 0;
  immutable: true;
  content: TrustedRuntimeContent;
}

export interface ToolRuntimeLayer {
  kind: 'tool-runtime';
  priority: 10;
  immutable: false;
  tools: Array<{ name: string; trusted: boolean }>;
}

export interface CustomAgentLayer {
  kind: 'custom';
  priority: number;
  immutable: boolean;
  content: unknown;
}

export type AgentRuntimeLayer = TrustedRuntimeLayer | ToolRuntimeLayer | CustomAgentLayer;

export interface AppAgentRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  customLayers?: CustomAgentLayer[];
}

export interface AppAgentRuntimeContract {
  version: string;
  layers: AgentRuntimeLayer[];
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}