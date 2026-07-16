import { beforeEach, describe, expect, it } from "vitest";
import { getCanonicalModelById, mergeCanonicalModels, replaceCanonicalModels } from "./modelCatalogCache";

describe("modelCatalogCache", () => {
  beforeEach(() => replaceCanonicalModels([]));

  it("preserves unrelated modalities and replaces only the refreshed type", () => {
    mergeCanonicalModels("text", [{ id: "text-old" }]);
    mergeCanonicalModels("image", [{ id: "image-live" }]);
    mergeCanonicalModels("text", [{ id: "text-new" }]);

    expect(getCanonicalModelById("text-old")).toBeUndefined();
    expect(getCanonicalModelById("text-new")?.id).toBe("text-new");
    expect(getCanonicalModelById("image-live")?.id).toBe("image-live");
  });

  it("lets a complete catalog replace every previous modality atomically", () => {
    mergeCanonicalModels("text", [{ id: "old-text" }]);
    mergeCanonicalModels("image", [{ id: "old-image" }]);
    replaceCanonicalModels([{ id: "complete-text" }], { text: [{ id: "complete-text" }] });

    expect(getCanonicalModelById("old-text")).toBeUndefined();
    expect(getCanonicalModelById("old-image")).toBeUndefined();
    expect(getCanonicalModelById("complete-text")?.id).toBe("complete-text");
  });
});
