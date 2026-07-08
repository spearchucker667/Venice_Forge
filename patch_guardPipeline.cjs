const fs = require('fs');
let content = fs.readFileSync('electron/services/guardPipeline.ts', 'utf-8');

content = content.replace(
  /export async function performGuardedVeniceRequest\(\n  request: Omit<VeniceForgeRequest, "signalId">\n\): Promise<GuardedRequestResult> \{/g,
  'export async function performGuardedVeniceRequest(\n  request: Omit<import("../../src/types/desktop").VeniceForgeRequest, "signalId">\n): Promise<GuardedRequestResult> {'
);
content = content.replace(
  /const response = await veniceFetch\(request\.endpoint, \{/g,
  'const response = await veniceFetch(request.endpoint, {\n    profileId: request.profileId,'
);
// Make sure to add profileId to options of streamChat as well.
content = content.replace(
  /export async function performGuardedVeniceStream\(\n  request: Omit<VeniceForgeRequest, "signalId">,\n  onDelta: \(chunk: \{ content: string; reasoning: string; providerRequestId\?: string \}\) => void,\n  onComplete: \(\) => void,\n  onError: \(error: Error\) => void,\n  abortSignal\?: AbortSignal\n\): Promise<\{ requestOutcome: InspectorCallOutcome; responseOutcome: InspectorCallOutcome \}> \{/g,
  'export async function performGuardedVeniceStream(\n  request: Omit<import("../../src/types/desktop").VeniceForgeRequest, "signalId">,\n  onDelta: (chunk: { content: string; reasoning: string; providerRequestId?: string }) => void,\n  onComplete: () => void,\n  onError: (error: Error) => void,\n  abortSignal?: AbortSignal\n): Promise<{ requestOutcome: InspectorCallOutcome; responseOutcome: InspectorCallOutcome }> {'
);
content = content.replace(
  /const response = await veniceFetch\(request\.endpoint, \{\n      method: "POST",\n      body: JSON\.stringify\(downstreamBody\),/g,
  'const response = await veniceFetch(request.endpoint, {\n      method: "POST",\n      profileId: request.profileId,\n      body: JSON.stringify(downstreamBody),'
);

fs.writeFileSync('electron/services/guardPipeline.ts', content);
