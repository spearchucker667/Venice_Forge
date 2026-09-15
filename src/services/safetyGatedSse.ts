export interface GatedSseEvent {
  raw: string;
  data: string;
  done: boolean;
}

export interface SafetyGateDecision {
  allowed: boolean;
}

export interface GatedSseOptions {
  maxEventBytes: number;
  classify: (event: GatedSseEvent) => SafetyGateDecision | Promise<SafetyGateDecision>;
  release: (event: GatedSseEvent) => void | Promise<void>;
}

/** Incremental SSE parser/gate. It retains only the current event, decodes
 * split UTF-8 sequences correctly, supports LF/CRLF framing and multiple
 * data lines, and never calls release before classify allows the event. */
export class SafetyGatedSse {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });
  private pending = "";
  private readonly options: GatedSseOptions;
  private closed = false;

  constructor(options: GatedSseOptions) {
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
    const event: GatedSseEvent = { raw, data, done: data === "[DONE]" };
    const decision = await this.options.classify(event);
    if (!decision.allowed) {
      this.closed = true;
      throw new Error("SSE event blocked by Family Safe Mode.");
    }
    await this.options.release(event);
  }
}
