# Venice Forge Agent Handoff: Limited Document Tools and Workspace-Scoped File Access

## Role

Act as a senior Electron security architect, TypeScript engineer, local-first application engineer, document-processing engineer, and agent-tooling specialist.

Work directly against:

```text
/Users/super_user/Projects/Venice_Forge
```

The application is an Electron desktop client using a React renderer and TypeScript. Preserve its local-first security model.

The renderer must never receive unrestricted Node.js, filesystem, shell, database, keychain, or process access. All privileged operations must cross narrow, typed preload IPC interfaces and be validated again in the Electron main process.

Do not assume that the current repository already contains the services, paths, schemas, or persistence abstractions described in this handoff. Inspect the repository before making file-specific claims.

---

# Primary Objective

Implement a production-safe agent tool system with two distinct access modes:

1. **Limited Document Tools**

   * Default mode.
   * Restricted to files explicitly attached to the conversation and documents managed by Venice Forge.
   * All modifications are proposed before being applied.
   * Existing content is never overwritten without explicit approval.
   * No arbitrary filesystem browsing.

2. **Full Workspace Tools**

   * Explicit opt-in.
   * Restricted to one user-selected directory.
   * Provides broad file management inside that granted root.
   * Does not imply unrestricted machine access.
   * Does not automatically grant shell, Git, network, package-manager, OS settings, keychain, database, or external-directory access.

The model is a planner and proposal generator. The application is the final authority.

Every tool argument returned by a model must be treated as hostile, untrusted input.

---

# Required Product Behavior

## Limited Document Tools

This must be the default and production-safe mode.

The model may:

* Read files explicitly attached to the current conversation.
* Read documents already stored in the current Venice Forge project.
* Create a new document in the application-managed document library.
* Propose structured edits against a known document revision.
* Request an export operation.
* Read prior revisions.
* Propose restoration of a prior revision.
* Create supported document formats:

  * Markdown.
  * Plain text.
  * JSON.
  * HTML.
  * CSV.
  * DOCX.
  * PDF.
* Save app-created documents inside the managed project workspace.

The model may not:

* Browse arbitrary machine paths.
* Read files merely because it knows or guesses their paths.
* Overwrite an original submitted file without explicit confirmation.
* Delete files.
* write outside an app-managed workspace.
* Invoke shell commands.
* Execute scripts or binaries.
* Follow symlinks or Windows reparse points outside the workspace.
* Access API keys.
* Access application databases directly.
* Access logs.
* Access OS secure storage.
* Access Electron session cookies.
* Access browser cache.
* Read hidden application state that was not deliberately exposed through a tool.

## Full Workspace Tools

This mode must require explicit user activation and selection of a workspace root through a native directory picker.

The model may, subject to policy:

* List files beneath the selected root.
* Read supported files.
* Search supported text content.
* Create files.
* Create directories.
* Propose changes to existing files.
* Rename or move files inside the workspace.
* Move files to Trash or an application-managed recovery area.
* Apply approved multi-file changesets.
* Read revision history created by Venice Forge.
* Restore an earlier app-created revision.

“Full workspace” means broad access inside one granted workspace. It does not mean unrestricted operating-system access.

Do not automatically include:

* Shell execution.
* Terminal commands.
* Package installation.
* Git commands.
* Arbitrary network requests.
* Browser automation.
* OS settings access.
* Keychain access.
* Database access.
* Access to sibling or parent directories.
* Access to mounted volumes outside the granted root.
* Access through symlink, junction, alias, or reparse-point escapes.

Treat shell, Git, network, keychain, database, and OS control as separate future capabilities with separate grants, policy rules, and approval interfaces.

---

# Mandatory Discovery Before Editing

Before implementing anything, inspect and record the current repository state.

Run:

```bash
cd /Users/super_user/Projects/Venice_Forge

git status --short
git branch --show-current
git rev-parse --show-toplevel
git log -1 --oneline

node --version
npm --version
```

Inspect:

```text
package.json
electron/**
src/**
scripts/**
config/**
docs/**
.github/**
```

Locate and document:

1. The Electron main-process entrypoint.
2. The preload scripts.
3. Existing IPC registration and validation.
4. Existing renderer-facing API types.
5. Current project or workspace storage.
6. Current attachment ingestion.
7. Existing document import or export paths.
8. Existing DOCX and PDF dependencies.
9. Existing file-save dialogs.
10. Existing application-managed blob storage.
11. Existing revision, backup, undo, or history services.
12. Existing audit and diagnostics services.
13. Existing secure-storage implementation.
14. Existing model-catalog and model-capability handling.
15. Every Venice chat-completion implementation.
16. Every place that currently constructs `tools`, `tool_choice`, or structured-response schemas.
17. Chat, Workflows, Projects, Research, and background-service execution paths.
18. Current tests and verification scripts.
19. Current Electron packaging and sandbox configuration.
20. Current custom protocols used for local media or file access.

Search for likely duplication:

```bash
rg -n \
  "tool_choice|parallel_tool_calls|tool_calls|function_call|response_format|chat/completions|completions.create" \
  electron src scripts
```

Search for unsafe filesystem access:

```bash
rg -n \
  "node:fs|from ['\"]fs|fs\\.|readFile|writeFile|rm\\(|unlink|rename|realpath|showOpenDialog|showSaveDialog|shell\\.openPath" \
  electron src
```

Search for direct renderer privileges:

```bash
rg -n \
  "nodeIntegration|contextIsolation|sandbox|contextBridge|ipcRenderer|ipcMain" \
  electron src
```

Do not claim that any proposed path exists until it has been verified.

Create an initial discovery report containing:

```md
# Document Agent Discovery Report

## Current Repository State
## Existing Agent Execution Paths
## Existing IPC Boundaries
## Existing Persistence Layers
## Existing Attachment Flow
## Existing Document Dependencies
## Existing Export Flow
## Existing Security Controls
## Existing Contract Duplication
## Missing Foundations
## Confirmed Proposed File Locations
```

---

# Architectural Boundary

Use this authority boundary:

```text
React renderer
    │
    │ typed requests, proposal display, approval decisions
    ▼
Preload IPC bridge
    │
    │ narrow contextBridge surface
    ▼
Electron main process
    ├── Agent orchestrator
    ├── Canonical tool registry
    ├── Capability policy engine
    ├── Approval coordinator
    ├── Managed document service
    ├── Document parser/serializer service
    ├── Workspace filesystem service
    ├── Revision and backup service
    ├── Search/index service
    ├── Audit/redaction service
    └── App-managed blob store
```

For untrusted complex document parsing, prefer an additional isolated boundary:

```text
Electron main process
    │
    ▼
Electron utilityProcess or worker
    ├── DOCX parser
    ├── PDF parser
    ├── HTML sanitizer
    └── resource-limit enforcement
```

A parser crash or malformed archive must not crash the primary application process when isolation is reasonably possible.

The renderer must not:

* Receive absolute local paths unless a display-safe redacted path is intentionally required.
* Receive unrestricted filesystem handles.
* Receive raw encryption or signing keys.
* Resolve arbitrary `file://` URLs.
* Decide whether a path is safe.
* apply a proposed edit directly.
* Convert user approval into a different operation than the one displayed.
* Register its own tool schemas independently.
* Construct provider-specific tool payloads independently.

---

# Canonical Tool Naming

Maintain two names for each tool:

1. An internal canonical identifier, such as:

```text
document.get
document.proposeEdits
workspace.search
```

2. A provider-safe API function name, such as:

```text
document_get
document_propose_edits
workspace_search
```

Do not assume dots are accepted in all provider function-name implementations.

Use a strict mapping:

```ts
export const toolNameMap = {
  "document.get": "document_get",
  "document.proposeEdits": "document_propose_edits",
  "document.create": "document_create",
  "document.export": "document_export",
  "document.getRevision": "document_get_revision",
  "document.restoreRevision": "document_restore_revision",

  "workspace.list": "workspace_list",
  "workspace.read": "workspace_read",
  "workspace.search": "workspace_search",
  "workspace.createFile": "workspace_create_file",
  "workspace.createDirectory": "workspace_create_directory",
  "workspace.proposeChangeset": "workspace_propose_changeset",
  "workspace.move": "workspace_move",
  "workspace.trash": "workspace_trash",
} as const;

export type InternalToolName = keyof typeof toolNameMap;

export type ProviderToolName =
  (typeof toolNameMap)[InternalToolName];
```

The registry must be the only code responsible for translating provider function names back to internal tool identifiers.

Chat components, workflow nodes, background workers, and project views must not create separate tool definitions.

---

# Tool Exposure Rules

Not every internal operation should be exposed to the model.

## Model-callable operations

These may be included in model tool schemas when authorized:

```text
document.get
document.proposeEdits
document.create
document.export
document.getRevision
document.restoreRevision

workspace.list
workspace.read
workspace.search
workspace.createFile
workspace.createDirectory
workspace.proposeChangeset
workspace.move
workspace.trash
```

## Application-internal operations

These should normally not be exposed as model-callable tools:

```text
document.applyApprovedEdits
workspace.applyApprovedChangeset
approval.issueToken
approval.consumeToken
revision.commit
revision.rollback
audit.record
```

The application should execute an approved proposal directly. Do not ask the model to issue another tool call after the user approves an edit.

This prevents the model from altering arguments between preview and application.

---

# Permission Model

Use operation-level capability grants rather than a single Boolean such as `agentMode: true`.

```ts
export type AgentPermissionPreset =
  | "off"
  | "read_attachments"
  | "limited_documents"
  | "workspace_with_approval"
  | "workspace_autonomous";

export type Capability =
  | "attachment:read"
  | "document:read"
  | "document:create"
  | "document:propose-update"
  | "document:export"
  | "document:read-revision"
  | "document:restore-revision"
  | "workspace:list"
  | "workspace:read"
  | "workspace:search"
  | "workspace:create-file"
  | "workspace:create-directory"
  | "workspace:propose-update"
  | "workspace:move"
  | "workspace:trash";

export interface CapabilityGrant {
  id: string;
  sessionId: string;
  preset: AgentPermissionPreset;
  capabilities: Capability[];
  projectId?: string;
  workspaceId?: string;
  issuedAt: string;
  expiresAt?: string;
  userInitiated: boolean;
}
```

A workspace grant must include its root and limits in main-process-only state:

```ts
export interface WorkspaceGrant {
  id: string;
  sessionId: string;
  workspaceId: string;
  rootPath: string;

  allowedOperations: Array<
    | "list"
    | "read"
    | "search"
    | "create"
    | "update"
    | "rename"
    | "move"
    | "trash"
  >;

  allowedExtensions: string[];

  maxReadBytes: number;
  maxWriteBytes: number;
  maxFilesPerOperation: number;
  maxTotalChangeBytes: number;

  includeHiddenFiles: boolean;
  followSymlinks: false;

  issuedAt: string;
  expiresAt?: string;
}
```

Do not expose `rootPath` to the model. Give the model a logical workspace identifier and relative paths.

Example model-visible workspace context:

```json
{
  "workspaceId": "workspace_01J...",
  "displayName": "Research Project",
  "allowedExtensions": [
    ".md",
    ".txt",
    ".json",
    ".html",
    ".csv",
    ".docx",
    ".pdf"
  ],
  "limits": {
    "maxReadBytes": 5242880,
    "maxWriteBytes": 10485760,
    "maxFilesPerOperation": 100
  }
}
```

---

# Recommended Preset Behavior

| Operation                         |  Off | Read attachments |          Limited documents |   Workspace with approval |   Workspace autonomous |
| --------------------------------- | ---: | ---------------: | -------------------------: | ------------------------: | ---------------------: |
| Read explicit attachment          | Deny |        Automatic |                  Automatic |                 Automatic |              Automatic |
| Read managed document             | Deny |             Deny |                  Automatic |                 Automatic |              Automatic |
| Create app-managed document       | Deny |             Deny |   Automatic, non-overwrite |                 Automatic |              Automatic |
| Propose managed-document edit     | Deny |             Deny |                  Automatic |                 Automatic |              Automatic |
| Apply managed-document edit       | Deny |             Deny | Always preview and approve |              Configurable |           Configurable |
| Export through save dialog        | Deny |             Deny |        Confirm destination |       Confirm destination |    Confirm destination |
| List workspace                    | Deny |             Deny |                       Deny |                 Automatic |              Automatic |
| Read workspace file               | Deny |             Deny |                       Deny | Automatic or configurable |              Automatic |
| Search workspace                  | Deny |             Deny |                       Deny |                 Automatic |              Automatic |
| Create workspace file             | Deny |             Deny |                       Deny |       Preview or approval | Automatic under limits |
| Modify workspace file             | Deny |             Deny |                       Deny |      Preview and approval | Automatic under limits |
| Rename or move                    | Deny |             Deny |                       Deny |                   Confirm |                Confirm |
| Trash file                        | Deny |             Deny |                       Deny |                   Confirm |                Confirm |
| Overwrite original submission     | Deny |             Deny |         Confirm every time |        Confirm every time |     Confirm every time |
| Access outside granted root       | Deny |             Deny |                       Deny |                      Deny |                   Deny |
| Shell, Git, keychain or OS access | Deny |             Deny |                       Deny |                      Deny |                   Deny |

Even `workspace_autonomous` must require explicit approval for:

* Deleting or trashing a file.
* Renaming or moving a file.
* Overwriting an original submitted document.
* Replacing an existing file with a format conversion.
* Changes exceeding configured file-count or byte thresholds.
* Changes involving files classified as sensitive.
* Operations that may lose unsupported formatting.
* Restoration that would replace newer content.
* Any operation that the policy engine cannot classify confidently.

---

# Managed Document Model

Use an application-owned intermediate representation.

```ts
export type DocumentFormat =
  | "txt"
  | "md"
  | "json"
  | "csv"
  | "html"
  | "docx"
  | "pdf";

export interface ManagedDocument {
  id: string;
  projectId: string;
  displayName: string;
  libraryRelativePath: string;
  originalFormat: DocumentFormat;
  sourceBlobId?: string;
  currentRevisionId: string;
  createdAt: string;
  updatedAt: string;
  importedAt?: string;
  metadata: Record<string, string | number | boolean | null>;
}

export type DocumentBlock =
  | {
      id: string;
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
    }
  | {
      id: string;
      type: "paragraph";
      text: string;
    }
  | {
      id: string;
      type: "list";
      ordered: boolean;
      items: Array<{
        id: string;
        text: string;
      }>;
    }
  | {
      id: string;
      type: "table";
      rows: Array<{
        id: string;
        cells: Array<{
          id: string;
          text: string;
        }>;
      }>;
    }
  | {
      id: string;
      type: "code";
      language?: string;
      text: string;
    }
  | {
      id: string;
      type: "quote";
      text: string;
    }
  | {
      id: string;
      type: "image";
      blobId: string;
      altText?: string;
      caption?: string;
    }
  | {
      id: string;
      type: "pageBreak";
    };
```

Persist immutable revisions:

```ts
export interface DocumentRevision {
  id: string;
  documentId: string;
  parentRevisionId?: string;
  createdAt: string;
  createdBy: "user" | "agent" | "import" | "restore";
  summary: string;
  contentHash: string;
  blocks: DocumentBlock[];
  sourceFormat: DocumentFormat;
  warnings: DocumentWarning[];
}

export interface DocumentWarning {
  code:
    | "formatting_loss_possible"
    | "unsupported_embedded_object"
    | "external_link_removed"
    | "macro_removed"
    | "font_substitution"
    | "pdf_reflow"
    | "table_layout_changed";
  message: string;
}
```

The original submitted bytes must be stored as an immutable source blob when retention is enabled.

A restore operation must create a new revision whose content is copied from the selected prior revision. Do not silently move the current revision pointer backward and erase later history.

---

# Stable Block Identity

Assign block IDs once when a document is imported or created.

Requirements:

* Unchanged blocks retain their IDs across revisions.
* Inserted blocks receive new IDs.
* Deleted IDs are not reused.
* Reordering preserves IDs.
* Parsed source documents are converted into IDs before the model reads them.
* Re-parsing an exported file must not be used as the normal revision mechanism.

The model should operate against stable block IDs, not line numbers that may shift.

Use hashes to detect stale proposals:

```ts
export interface BlockSnapshot {
  blockId: string;
  textHash: string;
  blockHash: string;
}
```

A proposal must fail with a conflict result when:

* The base revision is no longer current.
* A targeted block no longer exists.
* The expected text hash differs.
* The document was replaced or re-imported.
* The capability grant expired.

Do not silently rebase model edits.

---

# Canonical Edit Operations

Use a narrow set of deterministic operations.

```ts
export type DocumentEditOperation =
  | {
      operation: "replace_block";
      blockId: string;
      expectedBlockHash: string;
      block: DocumentBlock;
    }
  | {
      operation: "replace_text";
      blockId: string;
      expectedTextHash: string;
      searchText: string;
      replacementText: string;
      occurrence: number;
    }
  | {
      operation: "insert_before";
      blockId: string;
      expectedBlockHash: string;
      blocks: DocumentBlock[];
    }
  | {
      operation: "insert_after";
      blockId: string;
      expectedBlockHash: string;
      blocks: DocumentBlock[];
    }
  | {
      operation: "delete_block";
      blockId: string;
      expectedBlockHash: string;
    }
  | {
      operation: "move_block";
      blockId: string;
      expectedBlockHash: string;
      destinationBlockId: string;
      position: "before" | "after";
    };
```

For the initial release:

* Support paragraph, heading, list, code, quote, and whole-table operations.
* Do not attempt granular DOCX run-level formatting edits.
* Do not attempt arbitrary PDF object-stream mutation.
* Replace tables as complete blocks unless cell-level behavior is implemented and tested.
* Reject ambiguous `replace_text` operations when the expected occurrence count does not match.
* Reject operations that produce an invalid normalized document.

---

# Tool Result Envelope

Every tool must return a consistent result envelope.

```ts
export type ToolResult<TData = unknown> =
  | {
      ok: true;
      toolName: InternalToolName;
      requestId: string;
      data: TData;
      warnings?: ToolWarning[];
    }
  | {
      ok: false;
      toolName: InternalToolName;
      requestId: string;
      error: ToolError;
    };

export interface ToolWarning {
  code: string;
  message: string;
}

export interface ToolError {
  code:
    | "CAPABILITY_DENIED"
    | "INVALID_ARGUMENTS"
    | "RESOURCE_NOT_FOUND"
    | "STALE_REVISION"
    | "PATH_OUTSIDE_WORKSPACE"
    | "SYMLINK_ESCAPE"
    | "UNSUPPORTED_FILE_TYPE"
    | "FILE_TOO_LARGE"
    | "CHANGESET_TOO_LARGE"
    | "APPROVAL_REQUIRED"
    | "APPROVAL_EXPIRED"
    | "APPROVAL_MISMATCH"
    | "FORMAT_VALIDATION_FAILED"
    | "SERIALIZATION_FAILED"
    | "PARSER_FAILED"
    | "CONFLICT"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  safeDetails?: Record<string, string | number | boolean>;
}
```

Do not return stack traces, absolute paths, API keys, signed URLs, database locations, or raw parser internals to the model.

---

# Limited Document Tool Schemas

## Read a managed document

```ts
export const documentGetTool = {
  type: "function",
  function: {
    name: "document_get",
    description:
      "Read a document explicitly attached to the conversation or managed by the current Venice Forge project.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Stable Venice Forge document ID.",
        },
        revisionId: {
          anyOf: [
            {
              type: "string",
              minLength: 1,
              maxLength: 128,
            },
            {
              type: "null",
            },
          ],
          description:
            "Optional immutable revision ID. Null reads the current revision.",
        },
        blockIds: {
          type: "array",
          maxItems: 200,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 128,
          },
          description:
            "Optional block IDs to read. Omit for the first bounded document segment.",
        },
        cursor: {
          anyOf: [
            { type: "string", maxLength: 512 },
            { type: "null" },
          ],
          description:
            "Opaque pagination cursor returned by a prior document read.",
        },
      },
      required: ["documentId"],
    },
  },
} as const;
```

Do not return an unlimited document body in one tool response.

Return bounded blocks and an opaque continuation cursor:

```ts
export interface DocumentReadResult {
  documentId: string;
  revisionId: string;
  displayName: string;
  format: DocumentFormat;
  blocks: DocumentBlock[];
  nextCursor: string | null;
  totalBlocks: number;
  contentHash: string;
  warnings: DocumentWarning[];
}
```

## Propose edits

```ts
export const documentProposeEditsTool = {
  type: "function",
  function: {
    name: "document_propose_edits",
    description:
      "Propose deterministic edits to a managed document. This tool never writes the document.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: {
          type: "string",
          minLength: 1,
          maxLength: 128,
        },
        baseRevisionId: {
          type: "string",
          minLength: 1,
          maxLength: 128,
        },
        summary: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            description:
              "A validated operation matching the canonical DocumentEditOperation union.",
          },
        },
      },
      required: [
        "documentId",
        "baseRevisionId",
        "summary",
        "operations"
      ],
    },
  },
} as const;
```

The handler must validate the exact discriminated union with a runtime validator such as Zod, Valibot, or the repository’s established validation library.

JSON Schema validation at the provider boundary is not sufficient.

## Create a managed document

```ts
export const documentCreateTool = {
  type: "function",
  function: {
    name: "document_create",
    description:
      "Create a new non-overwriting document in the current app-managed project.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: {
          type: "string",
          minLength: 1,
          maxLength: 128,
        },
        relativePath: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description:
            "Relative app-library path. Absolute paths and parent traversal are forbidden.",
        },
        format: {
          type: "string",
          enum: [
            "txt",
            "md",
            "json",
            "csv",
            "html",
            "docx",
            "pdf"
          ],
        },
        document: {
          type: "object",
          description:
            "Normalized document representation. The model must not provide binary DOCX or PDF bytes.",
        },
        overwrite: {
          type: "boolean",
          const: false,
        },
      },
      required: [
        "projectId",
        "relativePath",
        "format",
        "document",
        "overwrite"
      ],
    },
  },
} as const;
```

For JSON and CSV, allow a validated format-specific representation instead of forcing all content into paragraph blocks.

Example:

```ts
export type CreateDocumentInput =
  | {
      format: "txt" | "md" | "html" | "docx" | "pdf";
      document: {
        title?: string;
        blocks: DocumentBlock[];
      };
    }
  | {
      format: "json";
      document: {
        value: unknown;
        indentation: 2 | 4;
      };
    }
  | {
      format: "csv";
      document: {
        columns: string[];
        rows: string[][];
        delimiter: "," | ";" | "\t";
        includeHeader: boolean;
      };
    };
```

## Request export

```ts
export const documentExportTool = {
  type: "function",
  function: {
    name: "document_export",
    description:
      "Request export of a managed document. The user selects and confirms the destination through the application.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        revisionId: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        format: {
          type: "string",
          enum: [
            "txt",
            "md",
            "json",
            "csv",
            "html",
            "docx",
            "pdf"
          ],
        },
        suggestedFileName: {
          type: "string",
          minLength: 1,
          maxLength: 255,
        },
      },
      required: [
        "documentId",
        "revisionId",
        "format",
        "suggestedFileName"
      ],
    },
  },
} as const;
```

The model does not choose an absolute export destination.

The main process must show a native save dialog and perform the write only after user confirmation.

## Read revision

```ts
export const documentGetRevisionTool = {
  type: "function",
  function: {
    name: "document_get_revision",
    description:
      "Read metadata and bounded content from an immutable document revision.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        revisionId: { type: "string" },
        cursor: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: ["documentId", "revisionId"],
    },
  },
} as const;
```

## Propose revision restoration

```ts
export const documentRestoreRevisionTool = {
  type: "function",
  function: {
    name: "document_restore_revision",
    description:
      "Propose restoring a prior document revision by creating a new current revision. This requires user approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        currentRevisionId: { type: "string" },
        restoreRevisionId: { type: "string" },
        reason: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
      },
      required: [
        "documentId",
        "currentRevisionId",
        "restoreRevisionId",
        "reason"
      ],
    },
  },
} as const;
```

---

# Workspace Tool Schemas

Do not expose one broad tool such as:

```text
filesystem.execute(action, path, content, options)
```

Use narrow operations.

## List workspace contents

```ts
export const workspaceListTool = {
  type: "function",
  function: {
    name: "workspace_list",
    description:
      "List files and directories under the granted workspace root.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspaceId: { type: "string" },
        relativeDirectory: {
          type: "string",
          maxLength: 500,
          description:
            "Workspace-relative directory. Use an empty string for the root.",
        },
        recursive: {
          type: "boolean",
        },
        maxDepth: {
          type: "integer",
          minimum: 0,
          maximum: 10,
        },
        cursor: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: [
        "workspaceId",
        "relativeDirectory",
        "recursive",
        "maxDepth"
      ],
    },
  },
} as const;
```

Results must be bounded and paginated.

Do not return hidden files unless the grant explicitly permits them.

## Read workspace file

```ts
export const workspaceReadTool = {
  type: "function",
  function: {
    name: "workspace_read",
    description:
      "Read a supported file inside the granted workspace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspaceId: { type: "string" },
        relativePath: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
        mode: {
          type: "string",
          enum: ["text", "document_blocks", "metadata"],
        },
        cursor: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: ["workspaceId", "relativePath", "mode"],
    },
  },
} as const;
```

## Search workspace

```ts
export const workspaceSearchTool = {
  type: "function",
  function: {
    name: "workspace_search",
    description:
      "Search supported text files within the granted workspace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspaceId: { type: "string" },
        query: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
        includeGlobs: {
          type: "array",
          maxItems: 20,
          items: {
            type: "string",
            maxLength: 200,
          },
        },
        excludeGlobs: {
          type: "array",
          maxItems: 50,
          items: {
            type: "string",
            maxLength: 200,
          },
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 200,
        },
      },
      required: ["workspaceId", "query", "maxResults"],
    },
  },
} as const;
```

Search must:

* Ignore binary files.
* Respect extension allowlists.
* Respect file-size limits.
* Avoid `.git`, dependency directories, application data, and other excluded directories by default.
* Bound total bytes read.
* Be cancellable.
* Return snippets with relative paths and line ranges.
* Never invoke external `grep`, `rg`, shell, or subprocesses in this capability mode.

## Propose a multi-file changeset

```ts
export interface WorkspaceChangeProposal {
  workspaceId: string;
  baseSnapshotId: string;
  summary: string;
  changes: WorkspaceChange[];
}

export type WorkspaceChange =
  | {
      type: "create_file";
      relativePath: string;
      expectedAbsent: true;
      format: DocumentFormat;
      content: string;
    }
  | {
      type: "replace_file";
      relativePath: string;
      expectedContentHash: string;
      format: DocumentFormat;
      content: string;
    }
  | {
      type: "patch_text_file";
      relativePath: string;
      expectedContentHash: string;
      replacements: Array<{
        expectedText: string;
        replacementText: string;
        occurrence: number;
      }>;
    }
  | {
      type: "create_directory";
      relativePath: string;
      expectedAbsent: true;
    };
```

Rename, move, and Trash should remain separate proposal types because their risk and approval presentation differ.

Do not combine destructive and non-destructive operations into an opaque generic action list.

---

# Agent Execution Loop

The application owns the execution loop.

Use a structure similar to:

```ts
export async function runAgentTurn(
  input: AgentTurnInput
): Promise<AgentTurnResult> {
  const messages = [...input.messages];

  for (
    let iteration = 0;
    iteration < input.maxIterations;
    iteration += 1
  ) {
    const schemas = toolRegistry.getProviderSchemas({
      modelId: input.model,
      grant: input.capabilityGrant,
    });

    const response = await veniceClient.createChatCompletion({
      model: input.model,
      messages,
      tools: schemas.length > 0 ? schemas : undefined,
      tool_choice: schemas.length > 0 ? "auto" : undefined,
      parallel_tool_calls: false,
    });

    const assistantMessage =
      response.choices[0]?.message;

    if (!assistantMessage) {
      throw new AgentExecutionError(
        "NO_ASSISTANT_MESSAGE",
        "Venice returned no assistant message."
      );
    }

    messages.push(assistantMessage);

    const toolCalls =
      assistantMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return {
        status: "completed",
        message: assistantMessage,
        messages,
      };
    }

    for (const providerToolCall of toolCalls) {
      const prepared = await toolExecutor.prepare({
        providerToolCall,
        sessionId: input.sessionId,
        modelId: input.model,
        grantId: input.capabilityGrant.id,
      });

      if (prepared.kind === "denied") {
        messages.push({
          role: "tool",
          tool_call_id: providerToolCall.id,
          content: JSON.stringify(prepared.result),
        });

        continue;
      }

      if (prepared.kind === "approval_required") {
        await pendingApprovalStore.save({
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          messages,
          proposal: prepared.proposal,
        });

        return {
          status: "approval_required",
          proposal: prepared.proposal.publicView,
          pendingApprovalId:
            prepared.proposal.pendingApprovalId,
          messages,
        };
      }

      const executionResult =
        await toolExecutor.executePrepared(
          prepared.execution
        );

      messages.push({
        role: "tool",
        tool_call_id: providerToolCall.id,
        content: JSON.stringify(executionResult),
      });
    }
  }

  throw new AgentExecutionError(
    "ITERATION_LIMIT",
    "Agent exceeded the configured tool iteration limit."
  );
}
```

Initial behavior:

```ts
parallel_tool_calls: false
```

Keep tool execution sequential until the system has proven support for:

* Independent proposal grouping.
* Deterministic approval ordering.
* Multi-proposal conflict checks.
* Revision locks.
* Rollback across parallel writes.

Do not enable parallel writes merely because a model supports parallel tool calls.

---

# Approval Integrity

The approval interface must be cryptographically or structurally bound to the exact proposal shown to the user.

An approval must not be a Boolean such as:

```ts
{ approved: true }
```

Use a one-time approval record:

```ts
export interface PendingApproval {
  id: string;
  sessionId: string;
  grantId: string;
  proposalType:
    | "document_edit"
    | "document_restore"
    | "document_export"
    | "workspace_changeset"
    | "workspace_move"
    | "workspace_trash";

  proposalHash: string;
  baseRevisionIds: string[];
  affectedResources: string[];
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}
```

The proposal hash must cover:

* Canonical tool identifier.
* Validated arguments.
* Base revision IDs.
* Expected content hashes.
* Destination relative paths.
* Workspace grant ID.
* User-visible summary.
* Format-loss warnings.
* File counts.
* Byte counts.
* Overwrite behavior.

Approval request:

```ts
export interface ApproveProposalRequest {
  pendingApprovalId: string;
  proposalHash: string;
  decision: "approve" | "reject";
}
```

On approval, main must revalidate:

1. The approval exists.
2. It belongs to the same application session.
3. It is not expired.
4. It has not been consumed.
5. The submitted hash matches.
6. The capability grant remains valid.
7. The target revisions and content hashes remain current.
8. Every target still resolves under the authorized root.
9. The planned result still falls within configured limits.

Consume the approval token exactly once.

Do not execute new model-generated arguments after approval.

---

# Proposal Preparation

`prepare()` must perform all non-mutating work necessary to produce an accurate preview.

Example:

```ts
export interface PreparedProposal {
  pendingApprovalId: string;
  proposalHash: string;
  requiresApproval: true;

  publicView: {
    title: string;
    summary: string;
    affectedFiles: Array<{
      displayPath: string;
      operation: string;
      originalBytes?: number;
      resultingBytes?: number;
      overwrite: boolean;
    }>;
    diff: DiffViewModel;
    warnings: DocumentWarning[];
    rollbackAvailable: boolean;
  };

  privateExecutionPlan: {
    validatedOperations: unknown[];
    resolvedTargets: unknown[];
    expectedHashes: string[];
    backupPlan: unknown;
  };
}
```

The renderer receives only `publicView`, the approval ID, and the proposal hash.

Do not send internal resolved absolute paths to the renderer.

---

# Filesystem Safety Requirements

The Electron main process must enforce every path restriction independently of model instructions and renderer state.

## Reject absolute and malformed paths

Reject:

* POSIX absolute paths.
* Windows drive-letter paths.
* UNC paths.
* Device paths such as `\\.\`.
* Home shortcuts such as `~`.
* URI schemes.
* Null bytes.
* Empty path segments when invalid.
* Parent traversal.
* Mixed-separator traversal.
* Percent-encoded traversal when decoding occurs.
* Alternate data streams on Windows.
* Reserved Windows device names.
* Paths ending in invalid platform-specific forms.

Example prevalidation:

```ts
export function assertRelativeWorkspacePath(
  input: string
): string {
  if (input.length === 0 || input.length > 500) {
    throw new PathPolicyError("INVALID_LENGTH");
  }

  if (input.includes("\0")) {
    throw new PathPolicyError("NULL_BYTE");
  }

  if (
    path.posix.isAbsolute(input) ||
    path.win32.isAbsolute(input) ||
    /^[a-zA-Z]:/.test(input) ||
    input.startsWith("\\\\") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)
  ) {
    throw new PathPolicyError("ABSOLUTE_PATH");
  }

  const normalized = input.replaceAll("\\", "/");

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment === ".." ||
        segment === "." ||
        segment.length === 0
    )
  ) {
    throw new PathPolicyError("TRAVERSAL");
  }

  return segments.join(path.sep);
}
```

This is only preliminary validation. It does not replace realpath containment checks.

## Resolve containment safely

For existing paths:

1. Resolve the workspace root through `realpath`.
2. Resolve the candidate through `realpath`.
3. Compare path components, not string prefixes.
4. Handle case-insensitive filesystems correctly.
5. Reject symlink, junction, alias, or reparse-point escapes.
6. Reject sockets, devices, FIFOs, and other special files.
7. Recheck immediately before mutation.

For new paths:

1. Validate the relative path.
2. Resolve the nearest existing parent through `realpath`.
3. Confirm the parent remains inside the root.
4. Walk every existing component and reject symlinks or reparse points where policy forbids them.
5. Create through a safe temporary path inside the same authorized directory.
6. Recheck containment before the final rename.

Do not use:

```ts
candidate.startsWith(root)
```

as a containment check.

`/workspace-other/file` starts with `/workspace` as a string but is not inside it.

Use component-aware relative comparison:

```ts
export function isPathInside(
  rootRealPath: string,
  candidateRealPath: string
): boolean {
  const relative = path.relative(
    rootRealPath,
    candidateRealPath
  );

  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
```

Handle the root itself separately when it is a valid target.

## Symlink and race protections

Account for time-of-check/time-of-use races.

Where the platform permits:

* Use no-follow file-open flags.
* Operate through already validated file descriptors.
* Re-stat targets before commit.
* Compare inode or stable file identity where available.
* Detect Windows reparse points.
* Abort if the target changes after preview.

Do not promise perfect race elimination through high-level Node path checks alone. Document platform limitations.

---

# Atomic Write Strategy

For a new or modified file:

1. Validate the operation.
2. Verify capability.
3. Resolve and verify the parent.
4. Read and hash the current target when applicable.
5. Confirm the expected hash.
6. Create a revision or backup.
7. Serialize into a temporary file in the same directory.
8. Flush the temporary file where supported.
9. Validate the serialized output.
10. Atomically rename the temporary file into place.
11. Flush the containing directory where supported.
12. Record the new revision and audit event.
13. Remove temporary files on failure.
14. Return a compact stable resource identifier.

Example temporary filename:

```text
.document-name.md.vf-tmp-<random-id>
```

Never write directly over the existing file before the replacement is completely serialized and validated.

For multi-file changes:

* Stage every output first.
* Validate all staged outputs.
* Create backups or revisions for all affected existing files.
* Commit in deterministic order.
* Record partial-commit state.
* Roll back committed files if a later commit fails when safe.
* Surface an explicit recovery record when complete rollback is impossible.

Do not describe a multi-file change as atomic unless the implementation genuinely provides transaction-like behavior.

---

# Revision and Backup Strategy

For app-managed documents:

* Store immutable revisions.
* Make the current revision a pointer or relation.
* Record parent revision.
* Record content hash.
* Record operation summary.
* Record actor.
* Retain the original source blob where configured.
* Restore by creating another revision.

For external workspace files:

* Create a Venice Forge revision record before approved modification.
* Store the previous bytes in an app-managed backup area, subject to retention policy.
* Associate the backup with:

  * Workspace ID.
  * Relative path.
  * Previous content hash.
  * New content hash.
  * Timestamp.
  * Proposal ID.
* Do not place backups beside the source file unless the user explicitly enables that behavior.
* Never back up secrets or unsupported large binaries without policy review.

Example:

```ts
export interface WorkspaceFileRevision {
  id: string;
  workspaceId: string;
  relativePath: string;
  previousBlobId: string;
  previousContentHash: string;
  resultingContentHash: string;
  proposalId: string;
  createdAt: string;
}
```

---

# Document Parsing Rules

Treat every imported file as untrusted.

## General limits

Enforce:

* Maximum source byte size.
* Maximum decompressed byte size.
* Maximum archive entry count.
* Maximum nesting depth.
* Maximum extracted text length.
* Maximum image count.
* Maximum image byte count.
* Parsing timeout.
* Cancellation.
* Memory limits where supported.

## DOCX

DOCX is a ZIP-based format.

Protect against:

* ZIP bombs.
* Path traversal inside archive entries.
* External relationships.
* Embedded OLE objects.
* Macros.
* Remote templates.
* Unsupported custom XML.
* Excessive image payloads.
* Malformed relationship graphs.

Initial DOCX behavior should support:

* Headings.
* Paragraphs.
* Basic inline emphasis when the representation supports it.
* Ordered and unordered lists.
* Basic tables.
* Images copied into the blob store.
* Page breaks.
* Basic document metadata.

Warn that these may not round-trip exactly:

* Complex section layouts.
* Text boxes.
* Floating objects.
* Track changes.
* Comments.
* Footnotes and endnotes.
* Custom fonts.
* Embedded charts.
* Equations.
* Macros.
* Form controls.

Never execute macros or embedded content.

## PDF

PDF should initially support:

* Text extraction.
* Page-aware reading.
* Annotation stored as a derivative or app-managed overlay.
* Creation of a new PDF from normalized blocks.
* Creation of a revised derivative PDF.
* Page rendering for preview when the existing dependency supports it safely.

Do not market arbitrary in-place PDF editing unless the implementation preserves the necessary PDF object semantics.

A visual black rectangle is not secure redaction.

Only expose “Redact” when the implementation removes or irreversibly rasterizes the underlying content according to a tested redaction pipeline.

Otherwise use terms such as:

```text
Cover
Annotate
Create redacted derivative
```

with accurate warnings.

## HTML

Sanitize HTML before preview or export.

Remove or disallow:

* `<script>`.
* Inline event handlers.
* `javascript:` URLs.
* Remote frames.
* Plugins.
* Meta refresh.
* Unsafe SVG.
* Unapproved remote resources.
* Forms that submit externally.

Render previews in an isolated sandbox with no Node integration and restrictive CSP.

## JSON

Before writing:

* Parse and validate.
* Reject invalid JSON.
* Use deterministic indentation.
* Do not silently serialize unsupported values such as functions or cycles.
* Preserve numeric and Boolean types.

## CSV

Validate row widths and encoding.

Protect spreadsheet consumers from formula injection.

By default, escape cells beginning with:

```text
=
+
-
@
```

when exporting user-controlled plain data for spreadsheet use.

Provide an explicit policy when true formulas are intentionally supported. Do not silently change formulas without communicating the behavior.

---

# Serialization Rules

The model must never generate binary DOCX or PDF bytes.

Workflow:

```text
Model-generated normalized representation
    ↓
runtime schema validation
    ↓
format-specific serializer
    ↓
temporary output
    ↓
format validation
    ↓
preview or approved commit
```

Each serializer must produce:

```ts
export interface SerializationResult {
  format: DocumentFormat;
  bytes: Uint8Array;
  contentHash: string;
  warnings: DocumentWarning[];
  validation: {
    valid: boolean;
    details: string[];
  };
}
```

Do not commit a serialization result when `valid` is false.

---

# Export Behavior

Export must always be user-mediated because it writes outside the app-managed library.

Required flow:

```text
Model requests export
    ↓
Main process prepares export
    ↓
Renderer displays format and warnings
    ↓
User selects Export
    ↓
Main process opens native save dialog
    ↓
User selects destination
    ↓
Main process validates and writes atomically
    ↓
Application reports success
```

The model must not receive the selected absolute destination path.

A safe result is:

```json
{
  "ok": true,
  "exported": true,
  "displayName": "Research Notes.docx",
  "format": "docx",
  "sizeBytes": 48122
}
```

Do not return:

```json
{
  "path": "/Users/example/Documents/Research Notes.docx"
}
```

unless a separate privacy-reviewed UX explicitly requires it.

---

# Workspace Selection

Full workspace access must be created through a native directory picker.

Required flow:

1. User changes Agent Access to `Manage selected workspace`.
2. Explain the scope before opening the picker.
3. Open the native directory picker from main.
4. User selects one directory.
5. Main canonicalizes and validates it.
6. Main creates a workspace grant.
7. Renderer receives:

   * Workspace ID.
   * Display name.
   * Redacted location label.
   * Capabilities.
   * Limits.
   * Expiration.
8. The chat displays a persistent access indicator.
9. The user can revoke access immediately.

Default grant duration:

* Current agent session only.

Optional user choice:

* Remember for this project.

Persistent directory access must follow the repository’s packaging and platform constraints. Inspect whether the application uses macOS App Sandbox, security-scoped bookmarks, or other platform-specific permissions before designing persistence.

Do not assume that a directory path saved in settings will remain accessible on every packaged platform.

---

# Model Capability Detection

Define:

```ts
export interface ModelCapabilities {
  modelId: string;
  supportsFunctionCalling: boolean;
  supportsParallelToolCalls?: boolean;
  supportsStructuredResponses: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  contextTokens?: number;
  fetchedAt: string;
  source: "models_endpoint" | "verified_local_override";
}
```

Requirements:

* Fetch current model capabilities from the authoritative model catalog.
* Cache capabilities with a bounded TTL.
* Do not infer function-calling support solely from model names.
* Do not enable executing tools when support is unknown.
* Disable Agent Access controls when the selected model lacks function calling.
* Present a direct model-selection action.
* Revalidate capability when the selected model changes.
* Record capability source for diagnostics.
* Do not expose a manually maintained override as though it came from the provider.

For models lacking function calling:

* Permit structured edit-plan generation only.
* Label it as a non-executing proposal.
* Require manual review.
* Do not automatically parse ordinary prose and execute it as a tool call.
* Do not treat JSON-shaped text as equivalent to an authenticated tool call.

---

# Tool Registry

Create one canonical registry.

```ts
export interface RegisteredTool<TArgs, TResult> {
  internalName: InternalToolName;
  providerName: ProviderToolName;
  description: string;
  requiredCapabilities: Capability[];
  modelCallable: boolean;
  requiresApproval:
    | "never"
    | "always"
    | "policy";
  schema: unknown;
  argsValidator: {
    parse(input: unknown): TArgs;
  };
  prepare(
    context: ToolExecutionContext,
    args: TArgs
  ): Promise<PreparedToolAction<TResult>>;
}
```

Registry behavior:

```ts
export class ToolRegistry {
  getProviderSchemas(input: {
    modelId: string;
    grant: CapabilityGrant;
  }): ProviderToolSchema[] {
    // Return only model-callable tools whose required
    // capabilities are present and whose model supports tools.
  }

  resolveProviderName(
    providerName: string
  ): RegisteredTool<unknown, unknown> {
    // Reject unknown or duplicate names.
  }
}
```

On application startup:

* Validate unique internal names.
* Validate unique provider names.
* Validate every schema.
* Validate that every model-callable tool has an argument validator.
* Validate that internal-only apply operations are not exported.
* Fail closed when registry construction is invalid.

Workflows, Projects, Chat, and background tasks must use this same registry.

---

# Policy Engine

Create an explicit policy decision result.

```ts
export type PolicyDecision =
  | {
      decision: "allow";
      approvalRequired: false;
    }
  | {
      decision: "allow";
      approvalRequired: true;
      reasons: string[];
    }
  | {
      decision: "deny";
      code: string;
      reasons: string[];
    };
```

Policy inputs should include:

```ts
export interface PolicyInput {
  sessionId: string;
  grant: CapabilityGrant;
  toolName: InternalToolName;
  validatedArguments: unknown;
  targetClassification:
    | "attachment"
    | "managed_document"
    | "workspace_file"
    | "workspace_directory";
  operationRisk:
    | "read"
    | "create"
    | "modify"
    | "move"
    | "trash"
    | "export"
    | "restore";
  affectedFileCount: number;
  affectedBytes: number;
  overwritesExistingContent: boolean;
  formatLossPossible: boolean;
  sensitiveDocument: boolean;
}
```

Policy decisions must be deterministic and testable.

Do not put primary authorization logic inside React components.

---

# Sensitive Document Handling

Add an application-level document sensitivity classification.

Do not send file contents to another model merely to determine whether a file is sensitive.

Use local heuristics and explicit user classification.

Potential signals:

* Filename patterns.
* Known project classification.
* User-marked sensitivity.
* Presence of likely credentials.
* Private key headers.
* Environment-variable files.
* Identity-document patterns.
* Financial or medical project categories.

Sensitive classification must:

* Increase approval requirements.
* Prevent autonomous overwrite or export.
* Redact previews where appropriate.
* Avoid logging snippets.
* Never silently block the user from accessing their own document.
* Explain what restriction was applied.

Do not claim that heuristic classification guarantees detection.

---

# UI Requirements

## Agent Access selector

Add a visible control:

```text
Agent access:
  Off
  Read attachments
  Edit submitted documents
  Manage selected workspace
```

Optional advanced preset:

```text
Manage selected workspace autonomously
```

Do not make autonomous access the default.

Show an active-access indicator while a grant exists:

```text
Agent access: Research Project
Scope: Selected workspace only
Expires: End of session
[Review access] [Revoke]
```

## Document change card

When the model proposes edits:

```text
Proposed document change

Document: Research Notes.docx
Base revision: 14
Operations: 7
Adds: 3
Changes: 3
Deletes: 1
Output: New revision
Original overwritten: No
Rollback available: Yes

[Review changes] [Approve once] [Reject]
```

## Review interface

Show:

* Unified or side-by-side diff.
* Document name.
* Base revision.
* Current revision.
* Operation count.
* Added, modified, moved, and deleted blocks.
* Resulting destination.
* Original overwrite status.
* File-count changes.
* Byte-size changes.
* Format-conversion warnings.
* Unsupported feature warnings.
* Rollback availability.
* Workspace scope.
* Exact capability being exercised.
* Whether approval applies once or to a broader policy.

For DOCX and PDF:

* Show normalized text/block changes.
* Show rendered preview where safely available.
* Explain that the preview is a newly serialized result.
* Show formatting-loss warnings before approval.

## Multi-file changeset

Example:

```text
Proposed workspace changes

Workspace: Research Project
Files created: 2
Files modified: 4
Directories created: 1
Files moved: 0
Files trashed: 0
Total write size: 84 KB

Requires approval because:
- Existing files will be modified.
- The changes affect more than three files.

[Review all changes] [Approve once] [Reject]
```

Do not collapse a multi-file operation into one vague summary.

## Conflict UI

When content changed after the model read it:

```text
This proposal is stale

The document changed after the model prepared these edits.

Base revision: 14
Current revision: 16

The changes were not applied.

[Review current document] [Ask model to re-propose] [Dismiss]
```

Do not automatically apply the proposal to the newer revision.

## Export UI

Show:

* Source document.
* Revision.
* Export format.
* Suggested filename.
* Formatting warnings.
* Whether external resources were removed.
* Whether formulas or active HTML content were sanitized.
* Resulting approximate size.

Then open the native save dialog.

---

# Preload IPC Design

Expose one narrow frozen API.

```ts
export const documentAgentIpc = {
  getState: "document-agent:get-state",
  setPreset: "document-agent:set-preset",
  chooseWorkspace: "document-agent:choose-workspace",
  revokeGrant: "document-agent:revoke-grant",

  getProposal: "document-agent:get-proposal",
  approveProposal: "document-agent:approve-proposal",
  rejectProposal: "document-agent:reject-proposal",

  getDocument: "document-agent:get-document",
  getRevision: "document-agent:get-revision",
  listRevisions: "document-agent:list-revisions",

  requestExport: "document-agent:request-export",

  getAuditEvents: "document-agent:get-audit-events",
} as const;
```

Preload example:

```ts
import {
  contextBridge,
  ipcRenderer,
} from "electron";

const documentAgentApi = Object.freeze({
  getState: () =>
    ipcRenderer.invoke(
      documentAgentIpc.getState
    ),

  setPreset: (
    request: SetAgentPresetRequest
  ) =>
    ipcRenderer.invoke(
      documentAgentIpc.setPreset,
      request
    ),

  chooseWorkspace: () =>
    ipcRenderer.invoke(
      documentAgentIpc.chooseWorkspace
    ),

  revokeGrant: (
    request: RevokeGrantRequest
  ) =>
    ipcRenderer.invoke(
      documentAgentIpc.revokeGrant,
      request
    ),

  getProposal: (
    request: GetProposalRequest
  ) =>
    ipcRenderer.invoke(
      documentAgentIpc.getProposal,
      request
    ),

  approveProposal: (
    request: ApproveProposalRequest
  ) =>
    ipcRenderer.invoke(
      documentAgentIpc.approveProposal,
      request
    ),

  rejectProposal: (
    request: RejectProposalRequest
  ) =>
    ipcRenderer.invoke(
      documentAgentIpc.rejectProposal,
      request
    ),
});

contextBridge.exposeInMainWorld(
  "veniceForgeDocumentAgent",
  documentAgentApi
);
```

Validate all incoming IPC arguments in main.

Do not trust TypeScript types as runtime validation.

Do not expose `ipcRenderer` directly.

Do not expose a generic method such as:

```ts
invoke(channel: string, payload: unknown)
```

---

# Audit and Redaction

Record security-relevant events without recording document content.

```ts
export interface DocumentAgentAuditEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  grantId?: string;
  toolName?: InternalToolName;
  outcome:
    | "allowed"
    | "denied"
    | "approval_requested"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "rolled_back";
  resourceType?: string;
  resourceId?: string;
  displayPath?: string;
  operationCount?: number;
  affectedBytes?: number;
  errorCode?: string;
}
```

Never log:

* Raw file content.
* Base64 document data.
* API keys.
* Keychain values.
* Full absolute paths.
* Signed URLs.
* Authentication headers.
* Chat messages.
* Model arguments containing complete document bodies.
* Unredacted diff bodies in normal diagnostics.

Use workspace-relative paths or redacted labels.

Provide a separate user-initiated diagnostics export with explicit warnings when more detailed content is included.

---

# Restart-Safe Pending Approvals

Persist pending proposals in app-managed state so an Electron restart does not create an ambiguous write.

Persist:

```ts
export interface PersistedPendingApproval {
  id: string;
  conversationId: string;
  sessionId: string;
  grantId: string;
  proposalHash: string;
  proposalType: string;
  publicView: unknown;
  encryptedPrivatePlan?: string;
  createdAt: string;
  expiresAt: string;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "expired"
    | "consumed";
}
```

Requirements:

* Expire session-only workspace grants after restart unless explicitly persisted.
* Do not resume a write automatically after restart.
* Revalidate every proposal before execution.
* Show expired proposals as expired.
* Do not let the model assume an approval was granted because the conversation contains an old approval card.
* Deduplicate execution by proposal ID.

---

# Concurrency Control

Use per-resource locks in main.

Examples:

```text
document:<documentId>
workspace-file:<workspaceId>:<relativePath>
changeset:<proposalId>
```

Requirements:

* Prevent two approved proposals from modifying the same document concurrently.
* Prevent a restore and edit from committing simultaneously.
* Recheck revision and content hashes after acquiring the lock.
* Keep locks scoped and bounded.
* Release locks in `finally`.
* Recover stale persisted operation state after crashes.

Do not hold filesystem locks while waiting for user approval.

---

# Search and Context Limits

Tool output must be bounded to protect context and application performance.

Recommended initial limits:

```ts
export const documentAgentLimits = {
  maxToolIterations: 12,
  maxBlocksPerRead: 100,
  maxCharactersPerToolResult: 80_000,
  maxSearchResults: 100,
  maxSearchFileBytes: 2_000_000,
  maxSingleAttachmentBytes: 20_000_000,
  maxCreateBytes: 10_000_000,
  maxEditOperations: 200,
  maxChangesetFiles: 100,
  maxChangesetBytes: 25_000_000,
} as const;
```

Adjust limits after repository inspection and product requirements.

When content exceeds limits:

* Return pagination cursors.
* Return summaries and matching block IDs.
* Allow targeted follow-up reads.
* Do not truncate content without stating truncation.
* Do not expose cursors that encode local paths.

---

# Document Library Structure

Use existing persistence infrastructure when suitable. Otherwise, propose a structure similar to:

```text
appData/
  documents/
    metadata/
      <document-id>.json
    revisions/
      <document-id>/
        <revision-id>.json
    sources/
      <blob-id>
    exports/
      temp/
  blobs/
    sha256/
      ab/
        abc123...
  workspace-backups/
    <workspace-id>/
      <revision-id>
  agent/
    grants/
    pending-approvals/
    operation-journal/
  audit/
    document-agent.ndjson
```

Do not expose these physical paths to the model or renderer.

Use content-addressed storage for immutable binary sources when compatible with the existing app architecture.

---

# Integration With Chat

Chat must:

* Resolve model tool support before enabling agent access.
* Include only schemas authorized by the active capability grant.
* Show active access clearly.
* Suspend the execution loop when approval is required.
* Resume from the exact stored message state after approval.
* Append the tool execution result with the original `tool_call_id`.
* Avoid rerunning an already consumed tool call.
* Preserve pending state when changing tabs.
* Cancel safely when the conversation is deleted.
* Revoke session grants when the chat is closed if the grant is session-scoped.

Generic chat should not gain workspace access because another conversation has a grant.

Grants must be scoped to a session, conversation, project, or explicit persistent workspace setting.

Do not store a single global `fullAccess: true` flag.

---

# Integration With Workflows

Workflows must use the same registry, policy engine, validators, revision service, and approval coordinator as Chat.

A workflow node must not bypass approval by calling an internal service directly.

Each workflow execution should have its own capability context.

Workflow behavior:

* Pause at approval-required nodes.
* Persist resumable execution state.
* Display the exact proposed changes.
* Resume only after validated approval.
* Prevent replay of consumed approvals.
* Record audit events.
* Fail closed when the required grant is unavailable.

Do not create separate workflow-only filesystem schemas.

---

# Integration With Projects

Projects should own app-managed documents.

Required project behaviors:

* List project documents.
* Show current revision.
* Show revision history.
* Open document preview.
* Compare revisions.
* Restore by creating a new revision.
* Export a selected revision.
* Mark documents as sensitive.
* Show document source:

  * Created in app.
  * Imported.
  * Derived from attachment.
  * Exported from workspace.
* Show active agent activity and pending proposals.

A project must not implicitly grant access to arbitrary files elsewhere on the machine.

---

# Format-Specific Product Behavior

## Markdown and TXT

* Direct text serialization.
* Preserve UTF-8.
* Normalize line endings according to project policy.
* Show text diff.
* Validate output size.

## JSON

* Parse before commit.
* Show structural or text diff.
* Preserve types.
* Use deterministic formatting.
* Reject invalid JSON.

## HTML

* Sanitize before preview and export.
* Show removed-active-content warnings.
* Do not allow preview to access Node or unrestricted network resources.

## CSV

* Validate column counts.
* Apply documented formula-injection handling.
* Show tabular preview.
* Preserve delimiter and encoding metadata.

## DOCX

* Preserve immutable source.
* Edit normalized blocks.
* Serialize a derivative revision.
* Warn about unsupported layout and embedded content.
* Validate that the generated ZIP package is structurally readable.

## PDF

* Treat original as immutable.
* Extract for reading.
* Create annotations or derivative revisions.
* Create a newly serialized PDF for substantial edits.
* Do not imply arbitrary lossless in-place PDF editing.
* Implement secure redaction only with a tested removal pipeline.

---

# Required Validation Tests

## Unit Tests

Add tests for:

* Tool-name mapping.
* Registry uniqueness.
* Capability filtering.
* Provider schema generation.
* Runtime argument validation.
* Policy decisions.
* Approval hash generation.
* Approval mismatch rejection.
* Approval expiration.
* Approval one-time consumption.
* Stable block IDs.
* Revision creation.
* Revision restoration.
* Stale revision detection.
* Edit operation application.
* Invalid operation rejection.
* Document read pagination.
* Search result bounding.
* Path normalization.
* POSIX traversal rejection.
* Windows traversal rejection.
* UNC path rejection.
* Drive-letter rejection.
* URI rejection.
* Symlink escape rejection.
* Reparse-point policy where testable.
* Extension allowlist.
* File-size limits.
* Multi-file thresholds.
* Atomic temporary-write cleanup.
* JSON validation.
* CSV row validation.
* HTML sanitization.
* DOCX archive limits.
* Audit redaction.
* Safe error serialization.

## Integration Tests

Add tests for:

1. Attach a Markdown document and read it in limited mode.
2. Attempt to read an unreferenced local path in limited mode and receive denial.
3. Create a managed Markdown document without overwrite.
4. Propose edits without changing storage.
5. Preview and approve a document edit.
6. Reject a document edit and confirm no revision was created.
7. Modify the source after proposal preparation and confirm stale rejection.
8. Restore an old revision by creating a new revision.
9. Export through a mocked native save dialog.
10. Cancel export and confirm no write occurred.
11. Choose a workspace and receive a scoped grant.
12. Read a file inside the workspace.
13. Reject a path outside the workspace.
14. Reject a symlink escape.
15. Propose a multi-file changeset.
16. Approve and commit a multi-file changeset.
17. Simulate a partial commit and verify recovery behavior.
18. Move a file inside the workspace after confirmation.
19. Trash a file through the recoverable path.
20. Revoke a workspace grant and reject subsequent calls.
21. Restart with a pending approval and require revalidation.
22. Change chat tabs without losing the pending proposal.
23. Run the same tool through Chat and Workflows and confirm identical policy behavior.
24. Use a non-function-calling model and confirm only non-executing proposal mode is available.

## Electron Security Tests

Verify:

* Renderer has no direct Node filesystem access.
* Renderer cannot invoke arbitrary IPC channels.
* Renderer cannot retrieve workspace root paths.
* Renderer cannot access secure-storage APIs through the document bridge.
* A forged approval hash is rejected.
* A consumed approval cannot be replayed.
* Tool arguments cannot select a different workspace grant.
* Export cannot silently write without a native dialog.
* `file://` access is not enabled for arbitrary documents.
* HTML preview cannot execute scripts.
* External DOCX relationships are not fetched.
* Parser failures do not expose sensitive stack traces.
* Audit logs contain no document bodies or secrets.
* Workspace search cannot traverse excluded directories.
* Full workspace mode cannot invoke shell, Git, network, or package installation.

## Property and Fuzz Tests

Add fuzz or property-oriented tests for:

* Relative path parsing.
* Mixed path separators.
* Unicode normalization.
* Reserved filenames.
* Edit-operation sequencing.
* Repeated approval consumption.
* Malformed provider tool arguments.
* Oversized JSON structures.
* DOCX archive entry names.
* HTML sanitizer inputs.
* CSV cell prefixes.
* Partial operation journals.

---

# Manual QA Matrix

## Limited Documents

* [ ] Attach a Markdown file and ask the model to summarize it.
* [ ] Ask the model to edit the attached file.
* [ ] Confirm no write occurs before approval.
* [ ] Review the diff.
* [ ] Approve once.
* [ ] Confirm a new revision is created.
* [ ] Confirm the original submitted bytes remain available.
* [ ] Reject another edit and confirm nothing changes.
* [ ] Create a TXT document in the managed library.
* [ ] Create valid JSON.
* [ ] Reject invalid JSON.
* [ ] Create a CSV and inspect spreadsheet-safety behavior.
* [ ] Create an HTML document and verify scripts are removed.
* [ ] Create a DOCX derivative.
* [ ] Create a PDF derivative.
* [ ] Export each supported format through a native save dialog.
* [ ] Cancel a save dialog and confirm no external file is created.
* [ ] Restore an older revision and confirm later history remains intact.

## Workspace Access

* [ ] Enable workspace mode.
* [ ] Select a directory through the native picker.
* [ ] Confirm the selected scope remains visible.
* [ ] List files under the root.
* [ ] Search supported text files.
* [ ] Read a supported file.
* [ ] Attempt to read `../outside.txt` and confirm denial.
* [ ] Attempt an absolute path and confirm denial.
* [ ] Attempt a symlink escape and confirm denial.
* [ ] Create a new file.
* [ ] Modify an existing file through a reviewed diff.
* [ ] Create a directory.
* [ ] Apply a multi-file changeset.
* [ ] Rename a file after confirmation.
* [ ] Move a file after confirmation.
* [ ] Trash a file and verify recovery.
* [ ] Revoke the grant.
* [ ] Confirm all later workspace calls fail.
* [ ] Restart and verify session-only access does not silently persist.

## Model Compatibility

* [ ] Select a function-calling model and enable tools.
* [ ] Select a model without function calling.
* [ ] Confirm executing agent access is disabled.
* [ ] Generate a structured manual edit plan.
* [ ] Confirm structured output is not automatically executed.
* [ ] Switch models during a pending approval.
* [ ] Confirm the prepared proposal remains bound to its original validated operation.

## Resilience

* [ ] Change tabs during an agent operation.
* [ ] Reload the renderer during a pending approval.
* [ ] Restart the application during a pending approval.
* [ ] Simulate a parser crash.
* [ ] Simulate a failed temporary write.
* [ ] Simulate a stale source revision.
* [ ] Simulate a multi-file partial failure.
* [ ] Confirm recovery records remain understandable.
* [ ] Confirm no operation is executed twice.

---

# Implementation Phases

## Phase 0: Repository Discovery

* Inventory current chat-completion and tool-calling paths.
* Inventory current IPC.
* Inventory document ingestion and storage.
* Inventory project persistence.
* Inventory existing parser and export libraries.
* Inventory security and packaging restrictions.
* Identify duplicated contracts.
* Produce the discovery report.
* Establish verified target modules.

Do not begin broad implementation until the discovery report is complete.

## Phase 1: Canonical Contracts

Implement:

* Tool identifier mapping.
* Shared tool-result envelope.
* Runtime schemas.
* Tool registry.
* Model capability adapter.
* Capability grant types.
* Policy decision types.
* IPC request and response types.

Add startup validation and unit tests.

## Phase 2: Managed Document Foundation

Implement:

* Managed document metadata.
* Immutable revisions.
* Stable block IDs.
* Content hashes.
* Source blob retention.
* Revision listing.
* Restore-as-new-revision.
* Bounded reads.
* Document warnings.

Do not add workspace writes before revision behavior is stable.

## Phase 3: Read-Only Limited Tools

Implement:

* Attachment read.
* Managed-document read.
* Revision read.
* Pagination.
* Context limits.
* Audit events.
* Safe errors.

Validate that the renderer and model cannot address arbitrary paths.

## Phase 4: Proposal and Approval System

Implement:

* Structured edit operations.
* Deterministic patch engine.
* Proposal preparation.
* Diff generation.
* Proposal hash.
* Pending approval persistence.
* Approval UI.
* Approval one-time consumption.
* Stale revision rejection.
* Per-resource locking.

Do not write during `document.proposeEdits`.

## Phase 5: Creation and Serialization

Implement:

* App-managed file creation.
* TXT serialization.
* Markdown serialization.
* JSON serialization and validation.
* CSV serialization and safety.
* HTML sanitization.
* DOCX serialization.
* PDF serialization.
* Serialization warnings.
* Output validation.

Do not expose raw binary generation to the model.

## Phase 6: Export

Implement:

* Export preparation.
* Format-warning preview.
* Native save dialog.
* Atomic external write.
* Cancellation.
* Redacted result.
* Audit event.

No model-selected absolute paths.

## Phase 7: Workspace Grants and Read Operations

Implement:

* Native directory selection.
* Workspace grant creation.
* Grant revocation.
* Root canonicalization.
* Path policy.
* Symlink and reparse-point protections.
* Workspace listing.
* Workspace reads.
* Workspace search.
* Limits and cancellation.

Security tests must pass before enabling writes.

## Phase 8: Workspace Changesets

Implement:

* Create file.
* Create directory.
* Proposed file modification.
* Changeset diff.
* Approval.
* Revalidation.
* Backups.
* Atomic staging.
* Operation journal.
* Rollback or recovery state.
* Deduplication.

## Phase 9: Move and Trash

Implement:

* Separate move proposals.
* Separate rename proposals.
* Trash or recoverable staging.
* Explicit confirmation.
* Recovery UI.
* Audit events.

Do not implement direct permanent deletion in the initial release.

## Phase 10: Workflow and Project Integration

Integrate the same:

* Registry.
* Policy engine.
* Grant service.
* Approval coordinator.
* Revision service.
* Audit service.
* Recovery service.

Delete or migrate duplicate tool schema construction.

## Phase 11: Hardening and Release

Complete:

* Full test suite.
* Security review.
* Parser fuzzing.
* Performance testing.
* Large-document testing.
* Crash recovery.
* Documentation.
* User-facing permissions text.
* Migration handling.
* Packaged-app QA.

---

# Expected Proposed Module Layout

Use repository conventions discovered during Phase 0. A reasonable proposed layout is:

```text
src/
  agent/
    contracts/
      capabilities.ts
      tool-results.ts
      proposals.ts
    registry/
      tool-registry.ts
      tool-name-map.ts
    model-capabilities/
      model-capability-service.ts
    renderer/
      AgentAccessControl.tsx
      ApprovalCard.tsx
      DocumentDiffView.tsx
      WorkspaceChangesetView.tsx

electron/
  agent/
    orchestrator/
      agent-orchestrator.ts
    policy/
      capability-policy-engine.ts
      workspace-grant-service.ts
    approvals/
      approval-coordinator.ts
      pending-approval-store.ts
    tools/
      document-tools.ts
      workspace-tools.ts
    documents/
      managed-document-service.ts
      document-parser-service.ts
      document-serializer-service.ts
      document-patch-engine.ts
      revision-service.ts
    workspace/
      workspace-filesystem-service.ts
      workspace-search-service.ts
      path-policy.ts
      operation-journal.ts
    audit/
      document-agent-audit-service.ts
      document-agent-redactor.ts
    ipc/
      document-agent-ipc.ts

preload/
  document-agent-bridge.ts
```

These are proposed paths only until repository inspection confirms the project’s actual conventions.

---

# Documentation Requirements

Create or update:

```text
README.md
docs/document-agent.md
docs/document-agent-permissions.md
docs/document-agent-security-model.md
docs/document-agent-supported-formats.md
docs/document-agent-revisions.md
docs/document-agent-workspaces.md
docs/document-agent-recovery.md
docs/document-agent-troubleshooting.md
docs/developer/document-agent-architecture.md
docs/developer/document-agent-tool-contracts.md
docs/developer/document-agent-testing.md
docs/developer/document-parser-safety.md
```

Document:

* What Limited Document Tools can access.
* What Full Workspace Tools can access.
* What “full workspace” does not include.
* How workspace selection works.
* How grants expire.
* How to revoke access.
* Why the renderer does not access files directly.
* Why edits require proposals and previews.
* How revision history works.
* How exports work.
* Supported format limitations.
* DOCX round-trip limitations.
* PDF editing and redaction limitations.
* How Trash and recovery work.
* How stale edits are handled.
* How structured-response fallback differs from function calling.
* Why shell, Git, network, keychain, and package installation are separate capabilities.
* Which metadata is recorded in the audit log.
* Which information is deliberately excluded from diagnostics.

---

# Required Verification Commands

First inspect `package.json` and use the repository’s real scripts.

At minimum, run the corresponding available commands for:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Run all repository-specific security and IPC verifiers.

Search for likely commands:

```bash
node -e '
const p = require("./package.json");
console.log(
  Object.keys(p.scripts || {})
    .sort()
    .join("\n")
);
'
```

Also run targeted tests for:

```text
tool registry
policy engine
approval coordinator
document patch engine
revision service
path policy
workspace filesystem
document parsers
document serializers
IPC validation
renderer approval UI
agent orchestrator
workflow integration
```

Do not claim that a command passed unless it was actually executed.

For an unrelated pre-existing failure:

1. Record the exact command.
2. Record the exact failing test.
3. Include the relevant error.
4. Explain why it is unrelated.
5. Do not weaken a verifier merely to obtain a green result.

---

# Acceptance Criteria

The implementation is complete only when all of the following are true.

## Limited Documents

1. Limited mode is the default agent mode.
2. The model can read explicitly attached documents.
3. The model can read app-managed project documents.
4. The model cannot address arbitrary filesystem paths.
5. The model can create a new non-overwriting managed document.
6. The model can propose structured edits.
7. Proposing edits does not modify storage.
8. The user sees a diff or preview before modification.
9. Approval is bound to the exact proposal shown.
10. A changed base revision invalidates the proposal.
11. An approved edit creates an immutable new revision.
12. The original submitted source is not overwritten silently.
13. Prior revisions can be read.
14. Restoration creates a new revision.
15. Export uses a native save dialog.
16. The model cannot choose the absolute export destination.
17. TXT, Markdown, JSON, HTML, CSV, DOCX, and PDF creation work through validated serializers.
18. DOCX and PDF bytes are produced by the application, not the model.
19. Format-loss warnings are visible before approval or export.
20. Pending approvals survive tab changes and fail safely after restart.

## Workspace Access

21. Workspace mode requires explicit opt-in.
22. A workspace is selected through a native directory picker.
23. Access is restricted to one granted root.
24. Paths outside the root are denied.
25. Parent traversal is denied.
26. Absolute paths are denied.
27. Symlink or reparse-point escapes are denied.
28. Unsupported special files are denied.
29. Listing is bounded and paginated.
30. Reading respects extension and byte limits.
31. Search does not invoke a shell or external process.
32. Creating a file cannot overwrite an existing file accidentally.
33. Modifications are checked against expected hashes.
34. Multi-file changes show a complete preview.
35. Rename and move require explicit confirmation.
36. Deletion is implemented through Trash or recoverable staging.
37. Permanent deletion is not exposed in the initial release.
38. Revoking the grant immediately prevents further operations.
39. Session-only grants do not silently persist across restart.
40. Full workspace mode does not grant shell, Git, network, keychain, database, or OS access.

## Security and Reliability

41. The renderer has no direct filesystem access.
42. The renderer cannot invoke arbitrary IPC channels.
43. Tool arguments are runtime validated.
44. Policy is enforced in main.
45. Paths are revalidated immediately before writes.
46. Writes use safe temporary files and replacement behavior.
47. Existing content receives a revision or backup before approved modification.
48. Approval tokens are one-time and expire.
49. Replayed approvals are rejected.
50. Model capability support is derived from an authoritative capability source.
51. Models without function calling cannot execute tools.
52. JSON-shaped prose is never treated as an executing tool call.
53. Tool contracts are centralized across Chat, Workflows, Projects, and background execution.
54. Audit logs do not contain document bodies, secrets, or unredacted absolute paths.
55. Parser failures fail closed.
56. Complex document parsing applies archive, size, time, and resource limits.
57. HTML previews cannot execute active content.
58. DOCX external relationships are not fetched.
59. Large tool responses are bounded.
60. No security verifier is weakened.

---

# Required Agent Implementation Checklist

## Discovery

* [ ] Record the current branch, commit, working tree, Node version, and npm version.
* [ ] Locate every chat-completion implementation.
* [ ] Locate every tool-schema construction path.
* [ ] Locate existing IPC registration and preload bridges.
* [ ] Locate attachment ingestion.
* [ ] Locate project and document persistence.
* [ ] Locate existing revision, backup, or undo systems.
* [ ] Locate existing save-dialog and export logic.
* [ ] Locate DOCX and PDF dependencies.
* [ ] Locate secure-storage access.
* [ ] Locate current app-managed blob storage.
* [ ] Locate current audit and diagnostics redaction.
* [ ] Produce the discovery report.
* [ ] Mark every proposed module path as verified or proposed.

## Canonical Contracts

* [ ] Add canonical internal tool identifiers.
* [ ] Add provider-safe function-name mappings.
* [ ] Add startup uniqueness validation.
* [ ] Add runtime argument validators.
* [ ] Add the shared tool-result envelope.
* [ ] Add safe tool-error serialization.
* [ ] Add the model-capability interface.
* [ ] Add capability grant types.
* [ ] Add workspace grant types.
* [ ] Add policy decision types.
* [ ] Add proposal and approval types.
* [ ] Remove duplicate schema construction after migration.

## Managed Documents

* [ ] Add managed-document metadata.
* [ ] Add immutable document revisions.
* [ ] Add stable block IDs.
* [ ] Add content hashes.
* [ ] Preserve original source blobs where configured.
* [ ] Add bounded document reads.
* [ ] Add opaque pagination cursors.
* [ ] Add revision listing.
* [ ] Add restore-as-new-revision behavior.
* [ ] Add document warnings.
* [ ] Add sensitive-document classification.

## Tool Registry

* [ ] Implement one canonical tool registry.
* [ ] Filter schemas by model capability.
* [ ] Filter schemas by active grant.
* [ ] Prevent internal apply operations from being model-callable.
* [ ] Reject unknown provider tool names.
* [ ] Reject duplicate provider names.
* [ ] Integrate Chat with the registry.
* [ ] Integrate Workflows with the registry.
* [ ] Integrate Projects with the registry.
* [ ] Integrate background execution with the registry where applicable.

## Limited Document Tools

* [ ] Implement attachment reads.
* [ ] Implement managed-document reads.
* [ ] Implement revision reads.
* [ ] Implement document creation with `overwrite: false`.
* [ ] Implement edit proposal preparation.
* [ ] Implement export requests.
* [ ] Implement revision-restoration proposals.
* [ ] Confirm limited mode cannot address arbitrary paths.
* [ ] Confirm no limited tool can delete a document.

## Edit Engine

* [ ] Implement `replace_block`.
* [ ] Implement deterministic `replace_text`.
* [ ] Implement `insert_before`.
* [ ] Implement `insert_after`.
* [ ] Implement `delete_block`.
* [ ] Implement `move_block`.
* [ ] Reject missing block IDs.
* [ ] Reject stale block hashes.
* [ ] Reject ambiguous replacement occurrences.
* [ ] Validate resulting normalized documents.
* [ ] Preserve stable IDs for unchanged blocks.
* [ ] Assign new IDs to inserted blocks.

## Approvals

* [ ] Implement proposal preparation without writes.
* [ ] Generate a canonical proposal hash.
* [ ] Bind approval to the grant and base revisions.
* [ ] Persist pending approvals.
* [ ] Add approval expiration.
* [ ] Add one-time approval consumption.
* [ ] Reject proposal-hash mismatch.
* [ ] Reject stale base revisions.
* [ ] Revalidate policy after approval.
* [ ] Revalidate path containment after approval.
* [ ] Add per-resource execution locks.
* [ ] Prevent duplicate proposal execution.
* [ ] Add rejection behavior with no mutation.

## Diff and Preview UI

* [ ] Add an Agent Access selector.
* [ ] Add an active workspace grant indicator.
* [ ] Add revoke-access controls.
* [ ] Add a document proposal card.
* [ ] Add a unified text diff.
* [ ] Add a side-by-side text diff.
* [ ] Add block-aware document diff.
* [ ] Add multi-file changeset summary.
* [ ] Add formatting-loss warnings.
* [ ] Add original-overwrite warnings.
* [ ] Add rollback-availability information.
* [ ] Add stale-proposal UI.
* [ ] Add approval and rejection controls.
* [ ] Ensure approval submits the displayed proposal hash.

## Serialization

* [ ] Implement TXT serialization.
* [ ] Implement Markdown serialization.
* [ ] Implement JSON validation and serialization.
* [ ] Implement CSV validation and serialization.
* [ ] Implement formula-injection policy.
* [ ] Implement HTML sanitization.
* [ ] Implement DOCX serialization.
* [ ] Implement PDF serialization.
* [ ] Add output content hashing.
* [ ] Validate serialized files before commit.
* [ ] Surface serializer warnings.
* [ ] Prevent the model from submitting binary DOCX or PDF bytes.

## Parser Safety

* [ ] Enforce source file-size limits.
* [ ] Enforce decompression limits.
* [ ] Enforce archive-entry limits.
* [ ] Enforce image-count and image-byte limits.
* [ ] Add parsing timeout and cancellation.
* [ ] Reject archive path traversal.
* [ ] Ignore or reject DOCX macros.
* [ ] Block external DOCX relationships.
* [ ] Handle malformed PDFs safely.
* [ ] Isolate complex parsers where practical.
* [ ] Sanitize HTML active content.
* [ ] Test parser crashes and resource exhaustion.

## Export

* [ ] Prepare export in main.
* [ ] Show export format and warnings.
* [ ] Open the native save dialog.
* [ ] Handle dialog cancellation.
* [ ] Write through a temporary file.
* [ ] Validate the final output.
* [ ] Return a redacted export result.
* [ ] Confirm the model never receives the destination absolute path.
* [ ] Record a redacted audit event.

## Workspace Grants

* [ ] Add native directory selection.
* [ ] Canonicalize the selected root.
* [ ] Create a scoped workspace grant.
* [ ] Default the grant to the current session.
* [ ] Add optional project-level persistence only after platform review.
* [ ] Display grant scope and expiration.
* [ ] Add immediate revocation.
* [ ] Expire session grants after restart.
* [ ] Prevent one conversation from inheriting another conversation’s grant.

## Path Security

* [ ] Reject POSIX absolute paths.
* [ ] Reject Windows drive-letter paths.
* [ ] Reject UNC paths.
* [ ] Reject device paths.
* [ ] Reject URI schemes.
* [ ] Reject null bytes.
* [ ] Reject parent traversal.
* [ ] Normalize path separators.
* [ ] Handle case-insensitive filesystems.
* [ ] Compare path components rather than prefixes.
* [ ] Validate the nearest existing parent for new files.
* [ ] Reject symlink escapes.
* [ ] Reject junction or reparse-point escapes.
* [ ] Reject special files, devices, sockets, and pipes.
* [ ] Revalidate targets immediately before mutation.
* [ ] Document remaining TOCTOU limitations.

## Workspace Reads and Search

* [ ] Implement bounded workspace listing.
* [ ] Implement pagination.
* [ ] Implement supported-file reads.
* [ ] Implement metadata-only reads.
* [ ] Implement bounded text search.
* [ ] Exclude hidden files by default.
* [ ] Exclude dependency and VCS directories by default.
* [ ] Enforce extension allowlists.
* [ ] Enforce byte limits.
* [ ] Add cancellation.
* [ ] Confirm no shell or subprocess is invoked.

## Workspace Writes

* [ ] Implement non-overwriting file creation.
* [ ] Implement directory creation.
* [ ] Implement proposed text-file replacement.
* [ ] Implement expected-hash checks.
* [ ] Implement temporary-file writes.
* [ ] Implement safe replacement.
* [ ] Implement external-workspace revision backups.
* [ ] Implement multi-file staging.
* [ ] Implement an operation journal.
* [ ] Implement deterministic commit order.
* [ ] Implement rollback where safe.
* [ ] Implement explicit recovery state for incomplete rollback.
* [ ] Enforce file-count and byte thresholds.

## Move and Trash

* [ ] Add a separate rename proposal.
* [ ] Add a separate move proposal.
* [ ] Require confirmation for rename and move.
* [ ] Prevent moves outside the granted root.
* [ ] Add Trash or recoverable staging.
* [ ] Require confirmation for Trash.
* [ ] Add recovery UI.
* [ ] Do not expose permanent deletion in the initial release.

## Audit and Redaction

* [ ] Add document-agent audit events.
* [ ] Record allow, deny, proposal, approval, execution, failure, and rollback outcomes.
* [ ] Store relative or redacted display paths.
* [ ] Exclude document bodies.
* [ ] Exclude API keys.
* [ ] Exclude signed URLs.
* [ ] Exclude raw model arguments containing full documents.
* [ ] Add safe diagnostics export behavior.
* [ ] Add tests proving redaction.

## Model Compatibility

* [ ] Read function-calling support from the authoritative model source.
* [ ] Cache capabilities with a bounded TTL.
* [ ] Disable executing tools when support is unknown.
* [ ] Disable Agent Access for unsupported models.
* [ ] Add a select-compatible-model action.
* [ ] Add non-executing structured proposal mode.
* [ ] Ensure structured-response output cannot execute automatically.
* [ ] Revalidate capabilities after model changes.

## Resilience

* [ ] Persist pending approvals.
* [ ] Persist operation journals.
* [ ] Resume display state after renderer reload.
* [ ] Require revalidation after app restart.
* [ ] Prevent automatic write resumption after restart.
* [ ] Deduplicate proposal execution.
* [ ] Add per-resource locks.
* [ ] Clean failed temporary files.
* [ ] Recover or report partial multi-file commits.
* [ ] Preserve revision history through failures.

## Tests

* [ ] Add registry unit tests.
* [ ] Add policy-engine unit tests.
* [ ] Add approval-integrity tests.
* [ ] Add document-patch tests.
* [ ] Add revision tests.
* [ ] Add path-policy tests for POSIX.
* [ ] Add path-policy tests for Windows.
* [ ] Add symlink-escape tests.
* [ ] Add parser-limit tests.
* [ ] Add serializer tests.
* [ ] Add export-dialog tests.
* [ ] Add workspace-grant tests.
* [ ] Add workspace-search tests.
* [ ] Add multi-file recovery tests.
* [ ] Add IPC validation tests.
* [ ] Add renderer security tests.
* [ ] Add HTML sandbox tests.
* [ ] Add audit-redaction tests.
* [ ] Add Chat integration tests.
* [ ] Add Workflow integration tests.
* [ ] Add Project integration tests.
* [ ] Add restart-recovery tests.
* [ ] Add fuzz or property tests for hostile inputs.

## Documentation

* [ ] Update the README.
* [ ] Document Limited Document Tools.
* [ ] Document Full Workspace Tools.
* [ ] Document excluded capabilities.
* [ ] Document workspace grants and revocation.
* [ ] Document revisions and restoration.
* [ ] Document supported formats.
* [ ] Document DOCX limitations.
* [ ] Document PDF and redaction limitations.
* [ ] Document export behavior.
* [ ] Document Trash and recovery.
* [ ] Document the security model.
* [ ] Document tool contracts.
* [ ] Document parser safeguards.
* [ ] Document testing and troubleshooting.

## Release

* [ ] Run all targeted tests.
* [ ] Run the full typecheck.
* [ ] Run lint.
* [ ] Run the full test suite.
* [ ] Run all IPC and security verifiers.
* [ ] Build the renderer.
* [ ] Build the Electron main process.
* [ ] Test the packaged application.
* [ ] Complete the manual QA matrix.
* [ ] Record pre-existing unrelated failures separately.
* [ ] Produce the final implementation report.
* [ ] Do not mark the feature complete until every acceptance criterion is evidenced.

---

# Required Final Implementation Report

Create:

```text
docs/implementation/document-agent-implementation-report.md
```

Use this structure:

```md
# Document Agent Implementation Report

## Repository State

## Discovery Findings

## Existing Architecture Reused

## New Architecture

## Files Added

## Files Modified

## Canonical Tool Registry

## Capability Policy

## Managed Document Storage

## Revision Behavior

## Approval Integrity

## Limited Document Tools

## Workspace Grants

## Filesystem Safeguards

## Document Parsing

## Document Serialization

## Export Flow

## Workspace Changesets

## Move and Trash Behavior

## Model Compatibility

## Chat Integration

## Workflow Integration

## Project Integration

## Audit and Redaction

## Migration Behavior

## Tests Added or Updated

## Commands Executed

## Validation Results

## Manual QA Results

## Known Limitations

## Deferred Capabilities

## Remaining Risks
```

For every implemented capability, include:

```text
requirement
verified file path
symbol or line range
implementation behavior
security enforcement point
test proving behavior
manual QA status
```

Do not write “implemented,” “secure,” or “fixed” without evidence.

---

# Do Not

* Do not expose a generic filesystem execution tool.
* Do not let the renderer use Node filesystem APIs.
* Do not let the renderer choose whether a path is authorized.
* Do not trust model-generated paths.
* Do not trust provider JSON Schema validation alone.
* Do not apply edits during proposal generation.
* Do not ask the model to repeat an approved tool call.
* Do not let approval authorize arguments different from the preview.
* Do not use one global `agentMode` Boolean as the entire permission model.
* Do not allow workspace access without a user-selected root.
* Do not allow access outside the selected root.
* Do not follow symlinks or reparse points outside the root.
* Do not include shell execution.
* Do not include Git commands.
* Do not include package installation.
* Do not include arbitrary network access.
* Do not include keychain access.
* Do not include database access.
* Do not include OS settings access.
* Do not expose absolute paths to the model.
* Do not expose application data directories.
* Do not expose API keys or secure-storage values.
* Do not overwrite original submissions silently.
* Do not permanently delete files in the initial release.
* Do not store large binary documents inside model messages.
* Do not ask the model to generate DOCX or PDF bytes.
* Do not claim arbitrary lossless PDF editing.
* Do not implement fake visual redaction as secure redaction.
* Do not execute macros or embedded document content.
* Do not fetch external DOCX relationships.
* Do not render unsanitized HTML.
* Do not silently resolve stale edits.
* Do not silently drop revision history.
* Do not silently truncate tool results.
* Do not enable parallel write calls initially.
* Do not create independent tool registries for Chat, Workflows, Projects, or background services.
* Do not weaken Electron sandbox, context isolation, CSP, IPC validation, secure storage, endpoint allowlists, or existing network boundaries.
* Do not weaken tests or verification scripts to obtain a passing build.
* Do not claim validation was performed unless the exact command was executed.

---

# Final Product Standard

The finished system must make the following security statement true:

> Venice Forge may allow a model to plan document or workspace operations, but only the application can authorize, validate, preview, execute, revise, export, audit, or recover those operations.

The initial release should prioritize:

1. Read-only attachment access.
2. App-managed documents.
3. Immutable revisions.
4. Structured edit proposals.
5. Reliable diffs.
6. One-time approvals.
7. Safe creation and export.
8. Only then, user-selected workspace access.

Do not begin with unrestricted filesystem access.

A function-calling model is not a security boundary. The Electron main-process capability policy, revision system, path validator, approval coordinator, and audit service are the security boundary.
