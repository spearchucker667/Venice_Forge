/**
 * @fileoverview VERIFY-014 — Character RP safety wrapper routing.
 *
 * Regression guard for `src/shared/safety/characterImportSafety.ts`. Locks:
 *   - Every wrapper routes to `assessChildExploitationSafety` with the right
 *     `source` / `endpoint` so the existing guard's category set is what fires.
 *   - `assessCharacterImport` (single card)
 *   - `assessCharacterBatchImport` (multi-card aggregate)
 *   - `assessPersonaImport` (persona)
 *   - `assessRpContext` (chat dispatch)
 *   - `assessScenePrompt` (image prompt)
 *
 * VERIFY-014 is the umbrella for the suite of tests in
 * `tests/safety/characterImportSafety.test.ts` (which already covers each wrapper
 * in detail). This file adds a **routing fingerprint** test: every wrapper
 * returns a non-empty `audit.decisionId` (proving the guard ran), and a clean
 * card with all five wrappers returns `allow: true` without spurious category
 * firings — protecting against future changes that bypass the existing guard.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  assessCharacterImport,
  assessCharacterBatchImport,
  assessPersonaImport,
  assessRpContext,
  assessScenePrompt,
} from "../../src/shared/safety/characterImportSafety";
import { _resetAuditCounters_TEST_ONLY } from "../../src/shared/safety/guardAudit";
import type { CharacterCardV1, RpChatV1, UserPersonaV1 } from "../../src/types/rp";

function makeCard(): CharacterCardV1 {
  return {
    schema: "CharacterCardV1",
    id: "card_a",
    name: "Alice",
    description: "A friendly blacksmith.",
    systemPrompt: "You are Alice.",
    tags: ["fantasy"],
    adult: false,
    exampleDialogues: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makePersona(): UserPersonaV1 {
  return {
    schema: "UserPersonaV1",
    id: "persona1",
    name: "Hero",
    description: "A brave wanderer.",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeChat(): RpChatV1 {
  return {
    schema: "RpChatV1",
    id: "chat1",
    title: "Test",
    characterIds: ["card_a"],
    lorebookIds: [],
    modelId: "venice-uncensored",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  _resetAuditCounters_TEST_ONLY();
});

describe("VERIFY-014 characterImportSafety routing", () => {
  it("every wrapper produces a non-empty audit.decisionId (guard actually ran)", () => {
    const d1 = assessCharacterImport(makeCard());
    const d2 = assessCharacterBatchImport([makeCard()]);
    const d3 = assessPersonaImport(makePersona());
    const d4 = assessRpContext({
      rpChat: makeChat(),
      characters: [makeCard()],
      userMessage: "Hello",
    });
    const d5 = assessScenePrompt("A blacksmith at work.");
    for (const d of [d1, d2, d3, d4, d5]) {
      expect(d.audit.decisionId).toBeTruthy();
      expect(d.audit.decisionId.length).toBeGreaterThan(0);
    }
  });

  it("clean inputs across all five wrappers return allow:true with no spurious category", () => {
    const d1 = assessCharacterImport(makeCard());
    const d2 = assessCharacterBatchImport([makeCard()]);
    const d3 = assessPersonaImport(makePersona());
    const d4 = assessRpContext({
      rpChat: makeChat(),
      characters: [makeCard()],
      userMessage: "Hello",
    });
    const d5 = assessScenePrompt("A blacksmith at work.");
    for (const d of [d1, d2, d3, d4, d5]) {
      expect(d.allow).toBe(true);
      expect(d.action).toBe("allow");
      // A clean card must not accidentally fire a category — that would mean
      // the wrapper is doing extra matching that the guard does not.
      expect(d.signals).toEqual([]);
    }
  });

  it("wrapper decisions never include raw prompt text in userMessage", () => {
    const card = makeCard();
    card.systemPrompt = "SECRET_TOKEN_x9q2k4";
    const d = assessCharacterImport(card);
    expect(d.userMessage).not.toContain("SECRET_TOKEN_x9q2k4");
  });

  it("assessCharacterBatchImport routes with the same source as single (ipc + /character-card/import)", () => {
    // We cannot directly observe the wrapper's internal payload, but we can
    // confirm that a single card and a one-card batch produce the same decision
    // shape (both should be allowed and the same signals).
    const card = makeCard();
    const single = assessCharacterImport(card);
    const batch = assessCharacterBatchImport([card]);
    expect(single.allow).toBe(batch.allow);
    expect(single.category).toBe(batch.category);
  });
});
