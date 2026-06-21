// VERIFY-056 regression guard — per-store typed mappers
import { describe, it, expect } from "vitest";
import {
  mapMediaItemToStorageRecord,
  mapWorkflowToStorageRecord,
  mapCharacterToStorageRecord,
  mapLorebookToStorageRecord,
  mapPersonaToStorageRecord,
  mapScenarioToStorageRecord,
  mapSceneToStorageRecord,
} from "./storage-privacy-store";
import type { MediaItem } from "../types/media";
import type { WorkflowTemplateItem } from "../types/workflow";
import type { CharacterCardV1, LorebookV1, UserPersonaV1, ScenarioV1 } from "../types/rp";
import type { SceneComposerItem } from "../types/scene";

const baseMedia: MediaItem = {
  id: "media-1",
  mediaType: "image",
  operation: "generate",
  parentId: null,
  childrenIds: [],
  tags: [],
  note: "",
  favorite: false,
  image: "data:image/png;base64,abc",
  prompt: "prompt",
  model: "model",
  timestamp: 1,
};

const baseWorkflow: WorkflowTemplateItem = {
  id: "wf-1",
  scope: "global",
  projectId: "project-1",
  title: "My Workflow",
  currentVersionId: "v1",
  versions: [],
  tags: [],
  favorite: false,
  archivedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const baseCharacter: CharacterCardV1 = {
  schema: "CharacterCardV1",
  id: "char-1",
  name: "Ada",
  description: "",
  systemPrompt: "",
  tags: [],
  adult: false,
  exampleDialogues: [],
  createdAt: 1,
  updatedAt: 1,
};

const baseLorebook: LorebookV1 = {
  schema: "LorebookV1",
  id: "lb-1",
  name: "World Lore",
  description: "",
  tags: [],
  entries: [],
  createdAt: 1,
  updatedAt: 1,
  projectId: "project-1",
};

const basePersona: UserPersonaV1 = {
  schema: "UserPersonaV1",
  id: "persona-1",
  name: "Pilot",
  description: "",
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  projectId: "project-1",
};

const baseScenario: ScenarioV1 = {
  schema: "ScenarioV1",
  id: "scenario-1",
  scope: "project",
  projectId: "project-1",
  name: "Rescue Mission",
  description: "",
  content: "",
  tags: [],
  favorite: false,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const baseScene: SceneComposerItem = {
  id: "scene-1",
  scope: "project",
  projectId: "project-1",
  title: "Sunset Alley",
  currentVersionId: "v1",
  versions: [],
  tags: [],
  favorite: false,
  archivedAt: "2024-01-01T00:00:00Z",
  outputMediaIds: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("storage-privacy-store mappers", () => {
  it("maps a MediaItem without title/name", () => {
    const record = mapMediaItemToStorageRecord(baseMedia);
    expect(record).toEqual({ id: "media-1", projectId: null });
  });

  it("maps a MediaItem with a projectId", () => {
    const record = mapMediaItemToStorageRecord({ ...baseMedia, projectId: "project-42" });
    expect(record).toEqual({ id: "media-1", projectId: "project-42" });
  });

  it("maps a WorkflowTemplateItem with title, projectId and archivedAt", () => {
    const record = mapWorkflowToStorageRecord(baseWorkflow);
    expect(record).toEqual({
      id: "wf-1",
      title: "My Workflow",
      projectId: "project-1",
      archivedAt: "2024-01-01T00:00:00Z",
    });
  });

  it("maps a CharacterCardV1 by name", () => {
    const record = mapCharacterToStorageRecord(baseCharacter);
    expect(record).toEqual({ id: "char-1", name: "Ada" });
  });

  it("maps a LorebookV1 by name and projectId", () => {
    const record = mapLorebookToStorageRecord(baseLorebook);
    expect(record).toEqual({ id: "lb-1", name: "World Lore", projectId: "project-1" });
  });

  it("maps a UserPersonaV1 by name and projectId", () => {
    const record = mapPersonaToStorageRecord(basePersona);
    expect(record).toEqual({ id: "persona-1", name: "Pilot", projectId: "project-1" });
  });

  it("maps a ScenarioV1 by name, projectId and archivedAt", () => {
    const record = mapScenarioToStorageRecord(baseScenario);
    expect(record).toEqual({
      id: "scenario-1",
      name: "Rescue Mission",
      projectId: "project-1",
      archivedAt: null,
    });
  });

  it("maps a SceneComposerItem by title, projectId and archivedAt", () => {
    const record = mapSceneToStorageRecord(baseScene);
    expect(record).toEqual({
      id: "scene-1",
      title: "Sunset Alley",
      projectId: "project-1",
      archivedAt: "2024-01-01T00:00:00Z",
    });
  });
});
