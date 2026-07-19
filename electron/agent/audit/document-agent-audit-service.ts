import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type DocumentAgentAuditOutcome = "allow" | "deny" | "proposal" | "approval" | "execution" | "failure" | "rollback";

export interface DocumentAgentAuditInput {
  sessionId: string;
  toolName: string;
  outcome: DocumentAgentAuditOutcome;
  resourceIds?: string[];
  relativePaths?: string[];
  reasonCode?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface AuditRecord extends DocumentAgentAuditInput {
  id: string;
  timestamp: string;
  previousHash: string;
  recordHash: string;
}

function safeText(value: string): string {
  return value
    .replace(/\b(?:sk|venice)_[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:[a-zA-Z]:[\\/]|\/Users\/|\/home\/)[^\s]*/g, "[REDACTED_PATH]")
    .slice(0, 500);
}

export class DocumentAgentAuditService {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly logFile: string) {}

  async record(input: DocumentAgentAuditInput): Promise<void> {
    const previous = this.queue;
    let release = () => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      await fs.promises.mkdir(path.dirname(this.logFile), { recursive: true, mode: 0o700 });
      let previousHash = "GENESIS";
      try {
        const lines = (await fs.promises.readFile(this.logFile, "utf8")).trim().split("\n");
        if (lines[0]) previousHash = (JSON.parse(lines.at(-1) as string) as AuditRecord).recordHash;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const safeInput: DocumentAgentAuditInput = {
        sessionId: safeText(input.sessionId),
        toolName: safeText(input.toolName),
        outcome: input.outcome,
        resourceIds: input.resourceIds?.map(safeText),
        relativePaths: input.relativePaths?.map((item) => safeText(item.replaceAll("\\", "/"))),
        reasonCode: input.reasonCode ? safeText(input.reasonCode) : undefined,
        metadata: input.metadata ? Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [safeText(key), typeof value === "string" ? safeText(value) : value])) : undefined,
      };
      const partial = { ...safeInput, id: `audit_${randomUUID()}`, timestamp: new Date().toISOString(), previousHash };
      const record: AuditRecord = { ...partial, recordHash: createHash("sha256").update(JSON.stringify(partial)).digest("hex") };
      await fs.promises.appendFile(this.logFile, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    } finally {
      release();
    }
  }
}
