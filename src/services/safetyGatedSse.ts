export interface GatedSseEvent {
  raw: string;
  data: string;
  done: boolean;
  /** Bounded, per-choice assistant text including this event's delta. */
  semanticContexts: string[];
}

export interface SafetyGateDecision {
  allowed: boolean;
}

export interface GatedSseOptions {
  maxEventBytes: number;
  maxSemanticChars?: number;
  classify: (event: GatedSseEvent) => SafetyGateDecision | Promise<SafetyGateDecision>;
  release: (event: GatedSseEvent) => void | Promise<void>;
}

function boundedUnicodeTail(text: string, limit: number): string {
  const tail = text.slice(-limit);
  return /^[\uDC00-\uDFFF]/.test(tail) ? tail.slice(1) : tail;
}

/** Incremental SSE parser/gate. It retains only the current event, decodes
 * split UTF-8 sequences correctly, supports LF/CRLF framing and multiple
 * data lines, and never calls release before classify allows the event. */
export class SafetyGatedSse {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });
  private pending = "";
  private readonly options: GatedSseOptions;
  private closed = false;
  private readonly choiceContexts = new Map<number, { content: string; reasoning: string }>();

  constructor(options: GatedSseOptions) {
    if (options.maxSemanticChars !== undefined &&
      (!Number.isSafeInteger(options.maxSemanticChars) || options.maxSemanticChars < 2)) {
      throw new Error("Invalid bounded SSE semantic window size.");
    }
    this.options = options;
  }

  async push(chunk: Uint8Array | Buffer): Promise<void> {
    if (this.closed) return;
    const decoded = this.decoder.decode(chunk, { stream: true });
    this.pending += decoded;
    await this.drain(false);
  }

  async end(): Promise<void> {
    if (this.closed) return;
    this.pending += this.decoder.decode();
    await this.drain(true);
    this.closed = true;
  }

  cancel(): void {
    this.closed = true;
    this.pending = "";
    this.choiceContexts.clear();
  }

  private semanticContexts(data: string): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return [data];
    }
    if (!parsed || typeof parsed !== "object" || !("choices" in parsed) || !Array.isArray(parsed.choices)) {
      return [data];
    }

    const contexts: string[] = [];
    for (const choice of parsed.choices) {
      if (!choice || typeof choice !== "object") continue;
      const record = choice as Record<string, unknown>;
      const index = record.index ?? (parsed.choices.length === 1 ? 0 : undefined);
      if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) {
        throw new Error("SSE choice has no valid index for bounded safety screening.");
      }
      const delta = record.delta;
      if (!delta || typeof delta !== "object") continue;
      const fields = delta as Record<string, unknown>;
      const content = typeof fields.content === "string" ? fields.content : "";
      const reasoning = typeof fields.reasoning_content === "string" ? fields.reasoning_content : "";
      if (!content && !reasoning) continue;
      if (!this.choiceContexts.has(index) && this.choiceContexts.size >= 16) {
        throw new Error("SSE choices exceeded the bounded safety screening window.");
      }
      const previous = this.choiceContexts.get(index) ?? { content: "", reasoning: "" };
      const limit = this.options.maxSemanticChars ?? 16_384;
      const next = {
        content: boundedUnicodeTail(previous.content + content, limit),
        reasoning: boundedUnicodeTail(previous.reasoning + reasoning, limit),
      };
      this.choiceContexts.set(index, next);
      contexts.push(JSON.stringify({ choices: [{ delta: next }] }));
    }
    return contexts.length > 0 ? contexts : [data];
  }

  private async drain(flush: boolean): Promise<void> {
    while (!this.closed) {
      const boundary = this.findBoundary();
      if (boundary < 0) {
        const eventBytes = Buffer.byteLength(this.pending, "utf8");
        if (eventBytes > this.options.maxEventBytes) {
          this.closed = true;
          throw new Error("SSE safety event exceeded the bounded screening window.");
        }
        if (flush && this.pending.length > 0) {
          const raw = this.pending;
          this.pending = "";
          await this.processEvent(raw);
        }
        return;
      }

      const raw = this.pending.slice(0, boundary);
      const separatorLength = this.pending.startsWith("\r\n\r\n", boundary) ? 4 : 2;
      this.pending = this.pending.slice(boundary + separatorLength);
      const eventBytes = Buffer.byteLength(raw, "utf8");
      if (eventBytes > this.options.maxEventBytes) {
        this.closed = true;
        throw new Error("SSE safety event exceeded the bounded screening window.");
      }
      await this.processEvent(raw);
    }
  }

  private findBoundary(): number {
    const lf = this.pending.indexOf("\n\n");
    const crlf = this.pending.indexOf("\r\n\r\n");
    if (lf < 0) return crlf;
    if (crlf < 0) return lf;
    return Math.min(lf, crlf);
  }

  private async processEvent(raw: string): Promise<void> {
    const lines = raw.split(/\r?\n/);
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    const data = dataLines.join("\n");
    if (!data) return;
    const done = data === "[DONE]";
    let event: GatedSseEvent;
    try {
      event = { raw, data, done, semanticContexts: done ? [] : this.semanticContexts(data) };
    } catch (error) {
      this.cancel();
      throw error;
    }
    let decision: SafetyGateDecision;
    try {
      decision = await this.options.classify(event);
    } catch (error) {
      this.cancel();
      throw error;
    }
    if (!decision.allowed) {
      this.cancel();
      throw new Error("SSE event blocked by Family Safe Mode.");
    }
    await this.options.release(event);
  }
}
