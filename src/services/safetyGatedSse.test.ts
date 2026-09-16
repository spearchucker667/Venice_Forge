import { describe, expect, it, vi } from "vitest";
import { SafetyGatedSse } from "./safetyGatedSse";

const encoder = new TextEncoder();

async function feed(text: string, splits = [text.length]): Promise<string[]> {
  const released: string[] = [];
  const gate = new SafetyGatedSse({
    maxEventBytes: 1024,
    classify: ({ data }) => ({ allowed: data !== "unsafe" }),
    release: ({ data }) => { released.push(data); },
  });
  let start = 0;
  for (const end of splits) {
    await gate.push(encoder.encode(text.slice(start, end)));
    start = end;
  }
  await gate.end();
  return released;
}

describe("SafetyGatedSse", () => {
  const chatEvent = (index: number, delta: Record<string, string>) =>
    `data: ${JSON.stringify({ choices: [{ index, delta }] })}\n\n`;

  it.each([
    ["complete LF event", "data: hello\n\n", undefined, ["hello"]],
    ["split event with multiple data lines", "data: hello\ndata: world\n\n", [5, 13, 24], ["hello\nworld"]],
    ["split CRLF framing", "data: hello\r\n\r\n", [12, 14], ["hello"]],
  ])("parses and releases %s", async (_name, text, splits, expected) => {
    await expect(feed(text, splits)).resolves.toEqual(expected);
  });

  it("preserves split UTF-8 code points", async () => {
    const text = "data: café 😀\n\n";
    const encoded = encoder.encode(text);
    const released: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: () => ({ allowed: true }),
      release: ({ data }) => { released.push(data); },
    });
    const split = encoded.indexOf(0xc3) + 1;
    await gate.push(encoded.slice(0, split));
    await gate.push(encoded.slice(split));
    await gate.end();
    expect(released).toEqual(["café 😀"]);
  });

  it("reconstructs JSON SSE deltas split across byte and character boundaries", async () => {
    const contexts: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: ({ semanticContexts }) => {
        contexts.push(...semanticContexts);
        return { allowed: true };
      },
      release: vi.fn(),
    });
    const bytes = encoder.encode(chatEvent(0, { content: "café 😀" }));
    const split = bytes.indexOf(0xc3) + 1;
    await gate.push(bytes.slice(0, 9));
    await gate.push(bytes.slice(9, split));
    await gate.push(bytes.slice(split));
    await gate.end();
    expect(JSON.parse(contexts[0]).choices[0].delta.content).toBe("café 😀");
  });

  it("classifies events in order and never releases an unsafe event", async () => {
    const released: string[] = [];
    const classifications: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: async ({ data }) => {
        classifications.push(data);
        await Promise.resolve();
        return { allowed: data !== "unsafe" };
      },
      release: ({ data }) => { released.push(data); },
    });

    await expect(gate.push(encoder.encode("data: safe\n\ndata: unsafe\n\n"))).rejects.toThrow(/blocked/i);
    expect(classifications).toEqual(["safe", "unsafe"]);
    expect(released).toEqual(["safe"]);
  });

  it.each([
    ["two", ["un", "safe"]],
    ["three", ["un", "sa", "fe"]],
  ])("blocks an unsafe relation split across %s choice deltas", async (_name, parts) => {
    const released: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: ({ semanticContexts }) => ({
        allowed: semanticContexts.every((context) => !JSON.parse(context).choices[0].delta.content.includes("unsafe")),
      }),
      release: ({ data }) => { released.push(data); },
    });
    const events = parts.map((part) => chatEvent(0, { content: part }));
    for (const event of events.slice(0, -1)) await gate.push(encoder.encode(event));
    await expect(gate.push(encoder.encode(events.at(-1)!))).rejects.toThrow(/blocked/i);
    expect(released).toHaveLength(parts.length - 1);
  });

  it("keeps choices independent and screens reasoning deltas", async () => {
    const seen: Array<Array<{ content: string; reasoning: string }>> = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      maxSemanticChars: 4,
      classify: ({ semanticContexts }) => {
        seen.push(semanticContexts.map((context) => {
          const { content, reasoning } = JSON.parse(context).choices[0].delta;
          return { content, reasoning };
        }));
        return { allowed: true };
      },
      release: vi.fn(),
    });
    await gate.push(encoder.encode(chatEvent(0, { content: "alpha", reasoning_content: "think" })));
    await gate.push(encoder.encode(chatEvent(1, { content: "bravo" })));
    await gate.push(encoder.encode(chatEvent(0, { content: "beta", reasoning_content: "again" })));
    await gate.push(encoder.encode(": heartbeat\n\n"));
    await gate.push(encoder.encode("data: [DONE]\n\n"));
    await gate.end();
    expect(seen.slice(0, 3)).toEqual([
      [{ content: "lpha", reasoning: "hink" }],
      [{ content: "ravo", reasoning: "" }],
      [{ content: "beta", reasoning: "gain" }],
    ]);
    expect(seen.at(-1)).toEqual([]);
  });

  it("screens every choice in a shared event without mixing their histories", async () => {
    const release = vi.fn();
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: ({ semanticContexts }) => ({
        allowed: semanticContexts.every((context) =>
          !JSON.parse(context).choices[0].delta.content.includes("unsafe")),
      }),
      release,
    });
    await gate.push(encoder.encode(chatEvent(1, { content: "un" })));
    const shared = JSON.stringify({ choices: [
      { index: 0, delta: { content: "safe" } },
      { index: 1, delta: { content: "safe" } },
    ] });
    await expect(gate.push(encoder.encode(`data: ${shared}\n\n`))).rejects.toThrow(/blocked/i);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not retain half of a UTF-16 surrogate at the window boundary", async () => {
    const contexts: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      maxSemanticChars: 3,
      classify: ({ semanticContexts }) => {
        contexts.push(...semanticContexts);
        return { allowed: true };
      },
      release: vi.fn(),
    });
    await gate.push(encoder.encode(chatEvent(0, { content: "😀ab" })));
    expect(JSON.parse(contexts[0]).choices[0].delta.content).toBe("ab");
  });

  it("fails closed and clears state when classification throws", async () => {
    const release = vi.fn();
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: () => { throw new Error("classifier unavailable"); },
      release,
    });
    await expect(gate.push(encoder.encode(chatEvent(0, { content: "hello" })))).rejects.toThrow("classifier unavailable");
    await gate.push(encoder.encode(chatEvent(0, { content: "later" })));
    expect(release).not.toHaveBeenCalled();
  });

  it("rejects oversized events and stops after cancellation", async () => {
    const release = vi.fn();
    const gate = new SafetyGatedSse({
      maxEventBytes: 8,
      classify: vi.fn(() => ({ allowed: true })),
      release,
    });
    await expect(gate.push(encoder.encode("data: 123456789"))).rejects.toThrow(/bounded/i);

    gate.cancel();
    await gate.push(encoder.encode("data: ignored\n\n"));
    await gate.end();
    expect(release).not.toHaveBeenCalled();
  });
});
