#!/usr/bin/env node
/**
 * VERIFY-IPC-PARITY (companion to VF-AUD-20260912-N1).
 *
 * Asserts that every IPC channel exposed to the renderer via `ipcRenderer.invoke`
 * / `ipcRenderer.on` in `electron/preload.ts` is backed by a `registerPrivileged
 * IpcChannel` / `rateLimitIpcHandler` / `handleIpc` / `ipcMain.handle` /
 * template-literal registration in the main process, and vice versa. A
 * documented orphan allow-list exists for genuine exceptions; it must stay
 * empty unless a channel is reachable only through a non-preload path that
 * is independently authorized. Dead privileged handlers must be removed,
 * not allow-listed.
 *
 * Exit code 0 on success; non-zero on any parity break.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function walkTs(dir, list = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return list;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p, list);
    else if (/\.(ts|tsx)$/.test(e.name) && !p.includes('.test.')) list.push(p);
  }
  return list;
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return ''; }
}

// --- 1) Build constant map from `const X = { ... } as const` blocks across
// electron + src/types + src/shared. Resolves dotted refs like
// `imageInspectorIpc.chooseImage` -> "imageInspector:chooseImage".
//
// We also capture single-string constants of the form
// `export const CHANNEL = "channel-name"` and
// `export const NAMESPACE_CHANNELS = { foo: "channel-foo", ... } as const`.

const constMap = new Map();

function ingestConstMaps(files) {
  for (const f of files) {
    const src = readSafe(f);
    const objRe = /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{([\s\S]*?)\}\s*as\s+const/g;
    let m;
    while ((m = objRe.exec(src))) {
      const objName = m[1];
      const body = m[2];
      // Flat keys
      const keyRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["']([^"']+)["']/g;
      let km;
      while ((km = keyRe.exec(body))) {
        constMap.set(objName + '.' + km[1], km[2]);
      }
      // Nested keys (one level)
      const nestedRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{([\s\S]*?)\}/g;
      let nm;
      while ((nm = nestedRe.exec(body))) {
        const inner = nm[2];
        const innerKeyRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["']([^"']+)["']/g;
        let ik;
        while ((ik = innerKeyRe.exec(inner))) {
          constMap.set(objName + '.' + nm[1] + '.' + ik[1], ik[2]);
        }
      }
    }
    // Single-string constants: `export const FOO = "bar" as const;` or
    // `export const FOO: string = "bar";` (no as const). Match only when the
    // RHS is a literal string and the LHS is UPPER_SNAKE_CASE (which is the
    // convention for IPC channel constants in this codebase).
    const singleRe = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*string)?\s*=\s*["']([^"']+)["'](?:\s*as\s+const)?\s*;/g;
    let sm;
    while ((sm = singleRe.exec(src))) {
      constMap.set(sm[1], sm[2]);
    }
  }
}

// --- 2) Collect handler registrations.

const HANDLER_PATTERNS = [
  // registerPrivilegedIpcChannel(CONST.path, ...)
  /registerPrivilegedIpcChannel\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\b/g,
  // registerPrivilegedIpcChannel("literal", ...)
  /registerPrivilegedIpcChannel\(\s*["']([^"']+)["']/g,
  // handleIpc("literal", ...)
  /handleIpc\(\s*["']([^"']+)["']/g,
  // rateLimitIpcHandler(CONST.path, ...)
  /rateLimitIpcHandler\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\b/g,
  // rateLimitIpcHandler("literal", ...)
  /rateLimitIpcHandler\(\s*["']([^"']+)["']/g,
  // ipcMain.handle("literal", ...)
  /ipcMain\.handle\(\s*["']([^"']+)["']/g,
];

function collectHandlerChannels(files) {
  const channels = new Set();
  for (const f of files) {
    const src = readSafe(f);
    // Direct registrations
    for (const re of HANDLER_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const token = m[1];
        if (token.includes('.')) {
          const resolved = constMap.get(token);
          if (resolved) channels.add(resolved);
        } else {
          channels.add(token);
        }
      }
    }
    // Template-literal loops. We use a simpler two-step approach: locate the
    // `registerPrivilegedIpcChannel(`<template>` ,` call sites, then walk back
    // to find the enclosing `for (const [<name>, ...] of [...])` loop to
    // extract the literal array of values that bind to `<name>`.
    const TEMPLATE_BACKREF_RE = /register(?:Privileged)?IpcChannel\(\s*`([^`]+)`/g;
    TEMPLATE_BACKREF_RE.lastIndex = 0;
    let tm;
    while ((tm = TEMPLATE_BACKREF_RE.exec(src))) {
      const template = tm[1];
      const m = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(template);
      if (!m) continue;
      const nameVar = m[1];
      // Walk back to find the enclosing for-of loop. Use indexOf to avoid the
      // complex bracket-matching that defeated the original regex.
      const startIdx = tm.index;
      const before = src.slice(0, startIdx);
      const forMatch = /for\s*\(\s*const\s*\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s*\]\s*of\s*(\[[^\n]*?\])\s*as\s+const\s*\)\s*\{\s*$/m;
      const fm = forMatch.exec(before);
      if (!fm) continue;
      const literalArray = fm[1];
      const lits = literalArray.match(/["']([^"']+)["']/g) || [];
      for (const lit of lits) {
        const stripped = lit.slice(1, -1);
        channels.add(template.replace(`\${${nameVar}}`, stripped));
      }
    }
  }
  return channels;
}

// --- 3) Collect preload invocations / listeners.

const INVOKE_RE = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
const ON_RE = /ipcRenderer\.on\(\s*["']([^"']+)["']/g;

function collectPreloadChannels(preloadSrc) {
  const invoke = new Set();
  const on = new Set();
  let m;
  INVOKE_RE.lastIndex = 0;
  while ((m = INVOKE_RE.exec(preloadSrc))) invoke.add(m[1]);
  ON_RE.lastIndex = 0;
  while ((m = ON_RE.exec(preloadSrc))) on.add(m[1]);
  return { invoke, on };
}

// --- 3b) Collect emitter channels. Channels emitted by the main process satisfy
// the consumer-side requirement for `preload.on` channels.
//
// We track every known emit path:
//   - `webContents.send("literal", ...)` and `.webContents.send("literal", ...)`
//   - `safeSendToRenderer(<expr>, "literal", ...)` (canonical wrapper)
//   - `broadcast("literal", ...)` (updates helper)
//   - `safeSendToRenderer(<expr>, CONSTANT, ...)` (constant resolved via const map)

const EMITTER_RE_LIST = [
  // webContents.send (with or without leading identifier)
  /\.?webContents\.send\(\s*["']([^"']+)["']/g,
  // safeSendToRenderer(EXPR, "literal", ...)
  /safeSendToRenderer\(\s*[^,]+,\s*["']([^"']+)["']/g,
  // broadcast("literal", ...)
  /\bbroadcast\(\s*["']([^"']+)["']/g,
];

// Constant refs passed to safeSendToRenderer (e.g. INSPECTOR_TELEMETRY_CHANNEL)
const EMITTER_CONST_RE = /safeSendToRenderer\(\s*[^,]+,\s*([A-Z][A-Z0-9_]*)\b/g;

function collectEmitterChannels(files) {
  const emitters = new Set();
  for (const f of files) {
    const src = readSafe(f);
    for (const re of EMITTER_RE_LIST) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) emitters.add(m[1]);
    }
    EMITTER_CONST_RE.lastIndex = 0;
    let cm;
    while ((cm = EMITTER_CONST_RE.exec(src))) {
      const resolved = constMap.get(cm[1]);
      if (resolved) emitters.add(resolved);
    }
  }
  return emitters;
}

// --- 4) Documented orphans.
//
// Handler-registered channels that have no preload invoke/on consumer must
// either be removed or, only when independently authorized, listed here.
// Workspace mutations (`workspace.proposeChangeset` / `workspace.move` /
// `workspace.trash`) run through the agent-tool executor, not IPC — do not
// re-add `documentAgent:workspace:propose*` handlers or allow-list them.
// Generic `credential:set|get|delete` is also forbidden: typed apiKey /
// masterPassword / profilePassword / providerCredential channels remain.

const DOCUMENTED_ORPHAN_HANDLERS = new Set();

// Preload methods that must have a non-test renderer consumer outside
// desktopBridge.ts. Channels listed here are kept as paid-provider or
// deferred-feature surfaces and must not be silently re-used as a dump
// for dead privileged handlers.
const RENDERER_CONSUMER_NEEDLES = {
  'conversations:archive': ['desktopConversations.archive('],
  'conversations:search': ['desktopConversations.search('],
  'characterCreator:validateCard': ['desktopCharacterCreator.validateCard('],
  'chat:listPage': ['desktopChat.listPage('],
  'replicate:generateImage': ['desktopReplicate.generateImage('],
};
const DOCUMENTED_RENDERER_ORPHANS = new Set();

// --- 5) Run.

const electronFiles = [
  ...walkTs(path.join(root, 'electron/ipc')),
  ...walkTs(path.join(root, 'electron/services')),
  ...walkTs(path.join(root, 'electron/agent')),
  path.join(root, 'electron/main.ts'),
].filter(Boolean);

const typeFiles = [
  ...walkTs(path.join(root, 'src/types')),
  ...walkTs(path.join(root, 'src/shared')),
];

ingestConstMaps([...electronFiles, ...typeFiles]);

const handlerChannels = collectHandlerChannels(electronFiles);

const preloadSrc = readSafe(path.join(root, 'electron/preload.ts'));
if (!preloadSrc) {
  console.error('❌ electron/preload.ts not found');
  process.exit(1);
}

const { invoke: invokeChannels, on: onChannels } = collectPreloadChannels(preloadSrc);

const emitterChannels = collectEmitterChannels(electronFiles);

// A handler channel is "consumer-covered" if it's invoked OR listened-to by preload,
// OR if it's emitted by the main process (for events), OR if it's in the documented
// orphan allow-list.

const consumerCovered = (ch) =>
  invokeChannels.has(ch) ||
  onChannels.has(ch) ||
  emitterChannels.has(ch) ||
  DOCUMENTED_ORPHAN_HANDLERS.has(ch);

const orphanHandlers = [...handlerChannels].filter((c) => !consumerCovered(c));
const missingHandlers = [...invokeChannels].filter((c) => !handlerChannels.has(c));
// A preload.on channel is satisfied by either a handler registration OR an
// emitter registration (events are typically one-way, emitted via
// webContents.send / safeSendToRenderer rather than registered with
// ipcMain.handle). Allow either.
const missingOnHandlers = [...onChannels].filter((c) => !consumerCovered(c));

let failed = false;
const log = (icon, msg) => console.log(`${icon} ${msg}`);

console.log('Running VERIFY-IPC-PARITY...');
console.log('');
log('📊', `handler-registered channels: ${handlerChannels.size}`);
log('📊', `preload.invoke channels:    ${invokeChannels.size}`);
log('📊', `preload.on channels:        ${onChannels.size}`);
log('📊', `documented orphans:         ${DOCUMENTED_ORPHAN_HANDLERS.size}`);
console.log('');

if (missingHandlers.length > 0) {
  failed = true;
  console.error(`❌ preload.invoke channels WITHOUT handler registration (${missingHandlers.length}):`);
  for (const c of missingHandlers.sort()) console.error(`   - ${c}`);
  console.error('   Fix: add a `registerPrivilegedIpcChannel(channel, handler)` call in');
  console.error('   the appropriate electron/ipc/handlers/*.ts file.');
  console.error('');
}

if (missingOnHandlers.length > 0) {
  failed = true;
  console.error(`❌ preload.on channels WITHOUT handler emitter (${missingOnHandlers.length}):`);
  for (const c of missingOnHandlers.sort()) console.error(`   - ${c}`);
  console.error('   Fix: emit these channels from main via `webContents.send(channel, ...)`');
  console.error('   or add them to DOCUMENTED_ORPHAN_HANDLERS if consumed differently.');
  console.error('');
}

if (orphanHandlers.length > 0) {
  failed = true;
  console.error(`❌ handler-registered channels WITHOUT preload consumer (${orphanHandlers.length}):`);
  for (const c of orphanHandlers.sort()) console.error(`   - ${c}`);
  console.error('   Either: (a) expose them in electron/preload.ts via ipcRenderer.invoke/on,');
  console.error('   or (b) add them to DOCUMENTED_ORPHAN_HANDLERS in this script.');
  console.error('');
}

function collectRendererSrcFiles(dir, list = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return list;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectRendererSrcFiles(p, list);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) list.push(p);
  }
  return list;
}

const rendererConsumerFiles = collectRendererSrcFiles(path.join(root, 'src'))
  .filter((p) => !p.endsWith(`${path.sep}desktopBridge.ts`));
const rendererConsumerSrc = rendererConsumerFiles.map((p) => readSafe(p)).join('\n');
const missingRendererConsumers = Object.entries(RENDERER_CONSUMER_NEEDLES)
  .filter(([channel, needles]) => {
    if (DOCUMENTED_RENDERER_ORPHANS.has(channel)) return false;
    return !needles.some((needle) => rendererConsumerSrc.includes(needle));
  })
  .map(([channel]) => channel);

log('📊', `documented renderer orphans: ${DOCUMENTED_RENDERER_ORPHANS.size}`);

if (missingRendererConsumers.length > 0) {
  failed = true;
  console.error(`❌ preload channels WITHOUT a non-test src consumer (${missingRendererConsumers.length}):`);
  for (const c of missingRendererConsumers.sort()) console.error(`   - ${c}`);
  console.error('   Wire a renderer caller outside desktopBridge.ts, or add the channel to');
  console.error('   DOCUMENTED_RENDERER_ORPHANS with an independent justification.');
  console.error('');
}

if (failed) process.exit(1);

console.log('✅ IPC parity: every preload surface is backed by a main-process handler,');
console.log('   and every handler is reachable from the renderer (via invoke or on).');
