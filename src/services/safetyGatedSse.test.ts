import { describe, expect, it, vi } from "vitest";
import { SafetyGatedSse } from "./safetyGatedSse";

const bytes = new TextEncoder();

async function feed(text: string, splits: number[] = [text.length]) {
  const released: string[] = [];
  const gate = new SafetyGatedSse({
    maxEventBytes: 1024,
    classify: ({ data }) => ({ allowed: data !== "unsafe" }),
    release: ({ data }) => { released.push(data); },
  });
  let start = 0;
  for (const end of splits) {
    await gate.push(bytes.encode(text.slice(start, end)));
    start = end;
  }
  await gate.end();
  return released;
}

describe("SafetyGatedSse", () => {
  it("releases complete events only after classification", async () => {
    await expect(feed("data: hello\n\n")).resolves.toEqual(["hello"]);
  });

  it("handles an event split across chunks and multiple data lines", async () => {
    await expect(feed("data: hello\ndata: world\n\n", [5, 13, 24])).resolves.toEqual(["hello\nworld"]);
  });

  it("handles CRLF framing split across chunks", async () => {
    await expect(feed("data: hello\r\n\r\n", [12, 14])).resolves.toEqual(["hello"]);
  });

  it("preserves split UTF-8 code points", async () => {
    const text = "data: café 😀\n\n";
    const encoded = bytes.encode(text);
    const released: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: () => ({ allowed: true }),
      release: ({ data }) => { released.push(data); },
    });
    await gate.push(encoded.slice(0, encoded.indexOf(0xc3) + 1));
    await gate.push(encoded.slice(encoded.indexOf(0xc3) + 1));
    await gate.end();
    expect(released).toEqual(["café 😀"]);
  });

  it("never releases an unsafe later event", async () => {
    const released: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: ({ data }) => ({ allowed: data !== "unsafe" }),
      release: ({ data }) => { released.push(data); },
    });
    await expect(gate.push(bytes.encode("data: safe\n\ndata: unsafe\n\n"))).rejects.toThrow(/blocked/i);
    expect(released).toEqual(["safe"]);
  });

  it("rejects an oversized event with bounded retained memory", async () => {
    const gate = new SafetyGatedSse({
      maxEventBytes: 8,
      classify: vi.fn(() => ({ allowed: true })),
      release: vi.fn(),
    });
    await expect(gate.push(bytes.encode("data: 123456789"))).rejects.toThrow(/bounded/i);
  });

  it("stops releasing after cancellation", async () => {
    const release = vi.fn();
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: () => ({ allowed: true }),
      release,
    });
    gate.cancel();
    await gate.push(bytes.encode("data: ignored\n\n"));
    await gate.end();
    expect(release).not.toHaveBeenCalled();
  });
});
