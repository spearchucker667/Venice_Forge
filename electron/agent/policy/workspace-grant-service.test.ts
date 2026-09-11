// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceGrantService } from "./workspace-grant-service";

const roots = new Set<string>();

function temporaryWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-workspace-grant-"));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots.clear();
});

describe("WorkspaceGrantService renderer-session ownership", () => {
  it("recognizes only grants owned by the exact renderer session family", async () => {
    const service = new WorkspaceGrantService();
    const grant = await service.issue({
      sessionId: "runtime_1:renderer_7:agent_writer",
      rootPath: temporaryWorkspace(),
    });
    const owns = (service as unknown as {
      isOwnedBySessionFamily?: (grantId: string, rootSessionId: string) => boolean;
    }).isOwnedBySessionFamily;

    expect(typeof owns).toBe("function");
    expect(owns?.call(service, grant.id, "runtime_1:renderer_7")).toBe(true);
    expect(owns?.call(service, grant.id, "runtime_1:renderer_8")).toBe(false);
  });

  it("revokes all agent grants when their renderer changes profile", async () => {
    const service = new WorkspaceGrantService();
    const first = await service.issue({
      sessionId: "runtime_1:renderer_7:agent_writer",
      rootPath: temporaryWorkspace(),
    });
    const second = await service.issue({
      sessionId: "runtime_1:renderer_7:agent_reviewer",
      rootPath: temporaryWorkspace(),
    });
    const revoke = (service as unknown as {
      revokeSessionFamily?: (rootSessionId: string) => void;
    }).revokeSessionFamily;

    expect(typeof revoke).toBe("function");
    revoke?.call(service, "runtime_1:renderer_7");
    expect(service.get(first.id, "runtime_1:renderer_7:agent_writer")).toBeNull();
    expect(service.get(second.id, "runtime_1:renderer_7:agent_reviewer")).toBeNull();
  });
});
