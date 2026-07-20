const fs = require('fs');
let content = fs.readFileSync('electron/agent/runtime/chat-agent-runner.ts', 'utf8');

// Replace the loop with single execution and remove fake assistant message
content = content.replace(/const maxIterations = 5;[\s\S]*?(?=return result;)/, `
  const result = await performGuardedVeniceRequest(request, {
    onDelta: (chunk: SseChunk) => {
      //... (will be replaced)
`);

fs.writeFileSync('electron/agent/runtime/chat-agent-runner.ts', content);
