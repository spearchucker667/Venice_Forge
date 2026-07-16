import { describe, expect, it } from "vitest";
import { mergeCharacterCardConflict } from "./characterCardSyncMerge";

describe("character card sync conflict merge", () => {
  it("unions greetings, namespaces, book entries, and versions while retaining winner scalar/avatar fields", () => {
    const winner = { id: "c1", description: "Winner", avatar: { contentHash: "a" }, alternateGreetings: ["Hello"], tavernExtensions: { shared: { side: "winner" }, winner: true }, embeddedCharacterBook: { extensions: {}, entries: [{ id: 1, keys: ["a"], content: "A" }] }, versions: [{ id: "v2", createdAt: 2 }] };
    const loser = { id: "c1", description: "Loser", avatar: { contentHash: "b" }, alternateGreetings: ["hello", "Welcome"], tavernExtensions: { shared: { side: "loser" }, loser: true }, embeddedCharacterBook: { extensions: { remote: true }, entries: [{ id: 1, keys: ["a"], content: "Changed" }, { id: 2, keys: ["b"], content: "B" }] }, versions: [{ id: "v1", createdAt: 1 }] };
    const merged = mergeCharacterCardConflict(winner, loser);
    expect(merged.description).toBe("Winner");
    expect(merged.avatar).toEqual({ contentHash: "a" });
    expect(merged.alternateGreetings).toEqual(["Hello", "Welcome"]);
    expect(merged.tavernExtensions).toEqual({ shared: { side: "winner" }, winner: true, loser: true });
    expect((merged.embeddedCharacterBook as { entries: unknown[] }).entries).toHaveLength(2);
    expect((merged.versions as Array<{ id: string }>).map((version) => version.id)).toEqual(["v1", "v2"]);
  });
});
