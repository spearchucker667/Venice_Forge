import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { WorkspaceEntry } from "../../agent/contracts/workspace";
import type { WorkspaceGrantView } from "../../stores/document-agent-store";
import { desktopDocumentAgent } from "../../services/desktopBridge";

interface TreeNode {
  relativePath: string;
  kind: "file" | "directory";
  expanded: boolean;
  loading: boolean;
  error: string | null;
  children: TreeNode[];
  nextOffset: number | null;
}

function createNode(entry: WorkspaceEntry): TreeNode {
  return {
    relativePath: entry.relativePath,
    kind: entry.kind,
    expanded: false,
    loading: false,
    error: null,
    children: [],
    nextOffset: null,
  };
}

function updateNode(rootNode: TreeNode, relativePath: string, updater: (node: TreeNode) => TreeNode): TreeNode {
  if (rootNode.relativePath === relativePath) {
    return updater(rootNode);
  }
  let changed = false;
  const newChildren = rootNode.children.map(child => {
    const newChild = updateNode(child, relativePath, updater);
    if (newChild !== child) changed = true;
    return newChild;
  });
  if (changed) {
    return { ...rootNode, children: newChildren };
  }
  return rootNode;
}

interface WorkspaceTreeProps {
  workspaceGrant: WorkspaceGrantView;
  agentSessionId: string;
  onSelectFile: (relativePath: string) => void;
  selectedFile: string | null;
  refreshToken?: number;
}

export function WorkspaceTree({
  workspaceGrant,
  agentSessionId,
  onSelectFile,
  selectedFile,
  refreshToken = 0,
}: WorkspaceTreeProps) {
  const { t: tRuntime } = useTranslation("common");
  const [root, setRoot] = useState<TreeNode>({
    relativePath: "",
    kind: "directory",
    expanded: true,
    loading: false,
    error: null,
    children: [],
    nextOffset: null,
  });

  const loadDirectory = useCallback(
    async (
      relativeDirectory: string,
      offset: number,
    ): Promise<{ entries: WorkspaceEntry[]; nextOffset: number | null }> => {
      const result = await desktopDocumentAgent.workspace.list({
        grantId: workspaceGrant.id,
        agentSessionId,
        relativeDirectory,
        recursive: false,
        maxDepth: 1,
        offset,
      });
      if (!result.ok || !result.result) {
        throw new Error(result.error || "Workspace list failed.");
      }
      return result.result;
    },
    [workspaceGrant.id, agentSessionId],
  );

  const appendPage = useCallback(
    async (relativeDirectory: string, startingOffset: number = 0) => {
      let currentOffset = startingOffset;

      setRoot((prev) =>
        updateNode(prev, relativeDirectory, (n) => ({
          ...n,
          loading: true,
          error: null,
        }))
      );

      try {
        let hasMore = true;
        let safety = 0;
        while (hasMore && safety < 100) {
          safety += 1;
          const { entries, nextOffset } = await loadDirectory(
            relativeDirectory,
            currentOffset,
          );
          setRoot((prev) =>
            updateNode(prev, relativeDirectory, (target) => {
              if (target.kind !== "directory") return target;
              return {
                ...target,
                children: [...target.children, ...entries.map(createNode)],
                nextOffset,
                loading: false,
                error: null,
              };
            })
          );
          hasMore = nextOffset !== null;
          currentOffset = nextOffset ?? currentOffset;
        }
      } catch (error) {
        setRoot((prev) =>
          updateNode(prev, relativeDirectory, (target) => {
            if (target.kind !== "directory") return target;
            return {
              ...target,
              loading: false,
              error:
                error instanceof Error ? error.message : "Workspace list failed.",
            };
          })
        );
      }
    },
    [loadDirectory],
  );

  useEffect(() => {
    setRoot({
      relativePath: "",
      kind: "directory",
      expanded: true,
      loading: false,
      error: null,
      children: [],
      nextOffset: null,
    });
    void appendPage("", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceGrant.id, agentSessionId, refreshToken]);

  const toggleDirectory = useCallback(
    (relativePath: string) => {
      let needsLoad = false;
      let nextOffset = 0;

      const node = findNode(root, relativePath);
      if (node && node.kind === "directory") {
        const expanded = !node.expanded;
        needsLoad = expanded && node.children.length === 0 && !node.loading;
        nextOffset = node.nextOffset ?? 0;
      }

      setRoot((prev) =>
        updateNode(prev, relativePath, (n) => {
          if (n.kind !== "directory") return n;
          return { ...n, expanded: !n.expanded };
        })
      );

      if (needsLoad) {
        void appendPage(relativePath, nextOffset);
      }
    },
    [appendPage, root],
  );

  const handleSelectFile = useCallback(
    (relativePath: string) => {
      onSelectFile(relativePath);
    },
    [onSelectFile],
  );

  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-0.5">
      <DirectoryNode
        node={root}
        depth={0}
        onToggle={toggleDirectory}
        onSelectFile={handleSelectFile}
        selectedFile={selectedFile}
      />
      {root.children.length === 0 && !root.loading && (
        <p className="text-[12px] text-foreground-muted py-4 text-center">
          <Trans i18nKey="common:surface.componentsDocumentsDocumentagentview.description.noWorkspaceFilesFound" />
        </p>
      )}
      {root.error && (
        <p className="text-[12px] text-danger py-2 px-2">{root.error}</p>
      )}
      {root.loading && (
        <p className="text-[12px] text-foreground-muted py-2 px-2">
          {tRuntime(
            "runtimeGenerated.components.documents.documentagentview.notification.loadingWorkspace",
          )}
        </p>
      )}
    </div>
  );
}

function DirectoryNode({
  node,
  depth,
  onToggle,
  onSelectFile,
  selectedFile,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
  selectedFile: string | null;
}) {
  const isRoot = depth === 0;
  return (
    <div className={isRoot ? "" : "pl-3 border-l border-vf-panel-border"}>
      {!isRoot && (
        <button
          type="button"
          onClick={() => onToggle(node.relativePath)}
          className="w-full text-left text-[12px] text-foreground py-1 px-2 rounded hover:bg-vf-control-hover-muted flex items-center gap-2 transition-colors"
        >
          <span className="text-[12px]">{node.expanded ? "▼" : "▶"}</span>
          <span>📁</span>
          <span className="truncate">{basename(node.relativePath)}</span>
        </button>
      )}
      {node.expanded && (
        <div className="space-y-0.5">
          {node.children.map((child) =>
            child.kind === "directory" ? (
              <DirectoryNode
                key={child.relativePath}
                node={child}
                depth={depth + 1}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ) : (
              <FileNode
                key={child.relativePath}
                node={child}
                onSelectFile={onSelectFile}
                selected={selectedFile === child.relativePath}
              />
            ),
          )}
          {node.children.length === 0 && !node.loading && !isRoot && (
            <p className="text-[11px] text-foreground-muted py-1 px-2 pl-6">
              <Trans i18nKey="common:surface.componentsDocumentsDocumentagentview.description.emptyDirectory" />
            </p>
          )}
          {node.loading && (
            <p className="text-[11px] text-foreground-muted py-1 px-2 pl-6">
              <Trans i18nKey="common:runtimeGenerated.components.documents.documentagentview.notification.loadingDirectory" />
            </p>
          )}
          {node.error && (
            <p className="text-[11px] text-danger py-1 px-2 pl-6">{node.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({
  node,
  onSelectFile,
  selected,
}: {
  node: TreeNode;
  onSelectFile: (relativePath: string) => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.relativePath)}
      className={`w-full text-left text-[12px] py-1 px-2 pl-2 rounded flex items-center justify-between transition-colors ${
        selected
          ? "bg-vf-panel-bg-raised text-foreground"
          : "text-foreground hover:bg-vf-control-hover-muted"
      }`}
    >
      <span className="truncate">
        📄 {basename(node.relativePath)}
      </span>
      <span className="text-[10px] text-foreground-muted">
        <Trans i18nKey="common:surface.componentsDocumentsDocumentagentview.text.read" />
      </span>
    </button>
  );
}

function basename(relativePath: string): string {
  return relativePath.split("/").pop() || relativePath;
}

function findNode(root: TreeNode, relativePath: string): TreeNode | null {
  if (root.relativePath === relativePath) return root;
  for (const child of root.children) {
    const found = findNode(child, relativePath);
    if (found) return found;
  }
  return null;
}
