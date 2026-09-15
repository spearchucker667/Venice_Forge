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
