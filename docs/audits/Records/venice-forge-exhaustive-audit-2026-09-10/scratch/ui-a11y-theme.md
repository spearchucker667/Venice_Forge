# UI / Accessibility / Theme audit — 2026-09-10

| Field | Value |
| --- | --- |
| Audit ID | VF-AUD-20260910-UI |
| Baseline SHA | `c3ae21af2f723111d92b43c7888a60930226d213` |
| Branch | `main` |
| Package | `venice-forge@3.0.0-beta.3` |
| Method | Static source review of renderer UI, theme engine, CSS, and assets. No headed Electron or Chromium session. |
| Classification rule | **CONFIRMED** requires file:line evidence. Visual/runtime effects without a headed session are **LIKELY** or **NEEDS HEADED QA**. |

## Counts

| Class | Count |
| --- | ---: |
| CONFIRMED findings | 32 |
| LIKELY findings | 6 |
| NEEDS HEADED QA (not defects; untested in this environment) | 14 |
| INFORMATIONAL / not a defect (positive or by-design) | 12 |
| False positives recorded | 0 |
| **Total numbered findings (CONFIRMED + LIKELY)** | **38** |

Finding IDs: `VF-AUD-20260910-UI-001` … `UI-038`.

---

## Execution limits

This environment did **not** launch:

- headed Electron (`npm run dev:electron`)
- Vite renderer in a real browser (`npm run dev:web`)
- screen reader (VoiceOver / NVDA)
- 200%/400% zoom, `prefers-contrast: more`, or live `prefers-reduced-motion`
- packaged `file://` app to watch image 404s

Static URL/CSS/ARIA proof is still valid. Anything that requires pixels, focus rings, or AT announcement is tagged **NEEDS HEADED QA**.

---

## Surfaces reviewed vs not launched

### Statically reviewed (source + tests)

| Surface | Primary files | Headed launch |
| --- | --- | --- |
| App shell, skip link, global shortcuts, overlay host order | `src/App.tsx`, `src/config/tabs.ts` | **Not launched** |
| Sidebar / header / inspector / mesh overlay | `src/components/layout/*` | **Not launched** |
| Chat, composer, bubbles, history, character chats, TTS, markdown | `src/components/chat/*` | **Not launched** |
| Image Studio + tools + inspector | `src/components/image/*`, `src/components/image-inspector/*` | **Not launched** |
| Media Studio (gallery, compare, lineage, detail, inspector, toolbar) | `src/components/gallery/*` | **Not launched** |
| Audio / music / video / embeddings | `src/components/{audio,music,video,embeddings}/*` | **Not launched** |
| Search / scrape / research workspace | `src/components/search/*`, `src/components/research/*`, `src/components/SearchScrapeView.tsx` | **Not launched** |
| Prompt Library / Scene Composer | `src/components/prompts/*`, `src/components/scenes/*` | **Not launched** |
| Characters / Character Creator | `src/components/CharactersView.tsx`, `src/components/character-creator/*` | **Not launched** |
| RP Studio | `src/components/rp-studio/*` | **Not launched** |
| Workflows / Playground | `src/components/workflows/*`, `src/components/playground/*` | **Not launched** |
| Documents / Privacy / Status | `src/components/documents/*`, `src/components/privacy/*`, `src/components/status/*` | **Not launched** |
| Settings + Theme Maker + Theme Preview | `src/components/settings/*`, `src/components/ThemeMaker.tsx`, `src/components/ThemePreview.tsx` | **Not launched** |
| Shared dialogs / toasts / command palette | `AccessibleDialog`, `ConfirmModal`, `FirstRunModal`, `OnboardingSplash`, `CommandPalette`, `modal-requests` | **Not launched** |
| Theme engine | `src/theme/**`, `config/themes/**`, `src/styles/*`, `src/index.css`, `public/bootstrap-theme.js` | **Not launched** |
| Assets | `public/**`, `assets/**`, `src/components/ui/logo.tsx`, mascot imports | **Not launched** |

### Not launched (headed)

All 22 canonical tabs, first-run / onboarding, command palette, drawers, light/dark/high-contrast themes, RTL (`dir=rtl` is applied in JS but not visually verified), zoom matrix, packaged Electron `file://` media.

---

## CONFIRMED findings

### VF-AUD-20260910-UI-001 — Command Palette stacks above the age-gate and onboarding

**Class:** CONFIRMED (overlay / legal-control bypass capability)
**Expected:** Blocking first-run and onboarding dialogs remain the top-most modal until acknowledged.
**Observed:** `CommandPalette` is always mounted and uses `z-[200]`. `FirstRunModal` and `AccessibleDialog` (onboarding) use `z-[80]`. Cmd/Ctrl+K therefore paints a command UI *over* the age-gate.

```304:311:src/components/command-palette/CommandPalette.tsx
  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
```

```332:344:src/App.tsx
      <FirstRunModal
        open={!firstRunAcked}
        onAcknowledge={acknowledgeFirstRun}
        onDismiss={() => { /* cannot dismiss the age gate; user must acknowledge */ }}
      />
      {firstRunAcked && !globalOnboardingCompleted && <OnboardingSplash />}
      <Toaster />
      <ModalRequestHost />
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onToggle={() => setCmdPaletteOpen((value) => !value)}
      />
```

`AccessibleDialog` default z-index:

```27:27:src/components/ui/AccessibleDialog.tsx
  zIndexClassName = 'z-[80]',
```

Palette commands call `setActiveTab` while the gate is still open. Headed confirmation of a complete legal bypass is **NEEDS HEADED QA**; the stacking and always-on listener are static facts.

---

### VF-AUD-20260910-UI-002 — Cmd/Ctrl+K is not suppressed in editable fields

**Class:** CONFIRMED (keyboard)
**Expected:** Global shortcuts ignore inputs/textareas, matching `isShortcutTargetEditable` used by App tab shortcuts.
**Observed:** Command Palette always `preventDefault`s Cmd/Ctrl+K.

```90:97:src/components/command-palette/CommandPalette.tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggle();
        return;
      }
```

App shortcuts *do* skip editables:

```37:39:src/App.tsx
export function isShortcutTargetEditable(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return !!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
```

Chat composer, prompt editors, and Theme Maker name field cannot use the OS/browser “insert k with modifier” path; the palette steals the chord.

---

### VF-AUD-20260910-UI-003 — Number shortcuts only reach 9 of 22 canonical tabs

**Class:** CONFIRMED (keyboard / product contract gap)
**Expected:** Comment claims `⌘1`..`⌘N` follows `CANONICAL_TAB_ORDER`.
**Observed:** Handler parses a single `e.key` digit. Only `'1'`…`'9'` can match. Registry has 22 canonical tabs (`chat` … `status`, including `video`). Tabs from `music` onward have no number shortcut.

```139:142:src/config/tabs.ts
/** Ordered list of canonical (non-alias) tab ids. Used for ⌘1..N navigation. */
export const CANONICAL_TAB_ORDER: readonly TabId[] = TAB_REGISTRY.map(
  (t) => t.id,
);
```

```282:288:src/App.tsx
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= TAB_ORDER.length) {
        e.preventDefault()
        setActiveTab(TAB_ORDER[num - 1] as Tab)
        setMobileSidebarOpen(false)
        return
      }
```

Reachable: chat, character-chats, history, image, media, image-inspector, prompts, scenes, audio.
Unreachable via digits: music, video, embeddings, search, characters, character-creator, rp-studio, workflows, documents, privacy, playground, settings, status.

Command Palette remains the keyboard path for those tabs (when it is not blocked by UI-001/002).

---

### VF-AUD-20260910-UI-004 — API key dialog has no focus trap and poor initial tab order

**Class:** CONFIRMED (dialogs / focus)
**Expected:** Modal dialogs use `useFocusTrap`, move focus into the first field, and restore focus on close (pattern in `AccessibleDialog` / `ConfirmModal`).
**Observed:** `ApiKeyDialog` is `role="dialog"` + `aria-modal="true"` but does **not** call `useFocusTrap`. Escape is a window listener. First tab stop is a full-viewport close `<button>`.

```132:148:src/components/layout/api-key-dialog.tsx
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        aria-label={tRuntime(
          "runtimeGenerated.components.layout.apiKeyDialog.attribute.closeDialog",
        )}
        className="absolute inset-0 bg-overlay/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="mesh-panel relative rounded-xl p-6 w-full max-w-sm mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
```

Tab can leave the dialog into the app behind the overlay. Connect busy state is a raw `"…"` (UI-030).

---

### VF-AUD-20260910-UI-005 — Character Creator local picker is not an accessible modal

**Class:** CONFIRMED (dialogs / labels / keyboard)
**Observed:** Full-screen overlay with no `role="dialog"`, no `aria-modal`, no `useFocusTrap`, no Escape handler. Close control is an icon-only Lucide `X` with no `aria-label`.

```36:54:src/components/character-creator/CharacterCreatorLocalPickerModal.tsx
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
      <div className="flex flex-col w-full max-w-xl max-h-[80vh] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-surface-elevated">
          ...
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
```

---

### VF-AUD-20260910-UI-006 — Import plan modal is not an accessible modal

**Class:** CONFIRMED (dialogs / keyboard)
**Observed:** Overlay has no dialog role, no focus trap, no Escape, no labelled close. Also uses the non-token class `bg-background` (UI-012).

```27:31:src/components/settings/ImportPlanModal.tsx
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface-elevated border border-border/50 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-border/50">
          <h2 className="text-[17px] font-semibold text-text-primary">{t('settings:importPlan.title', 'Review Import Plan')}</h2>
```

This is a destructive-import confirmation surface. Keyboard users can tab into the page behind it.

---

### VF-AUD-20260910-UI-007 — Gallery compare and lineage dialogs have no accessible name

**Class:** CONFIRMED (ARIA)
**Expected:** `role="dialog"` + `aria-modal="true"` requires `aria-labelledby` or `aria-label` (WAI-ARIA).
**Observed:** Both overlays set dialog + modal and focus-trap, but neither names the dialog. Compare inner view has visible “Compare” text that is **not** wired as the dialog name.

```1378:1408:src/components/gallery/gallery-view.tsx
      {compareOpen && (
        <div
          ref={compareModalRef}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay p-6"
          data-testid="compare-modal"
          onClick={() => setCompareOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          ...
      {lineageOpen && inspectorItem && (
        <div
          ref={lineageModalRef}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay p-6"
          data-testid="lineage-modal"
          onClick={() => setLineageOpen(false)}
          role="dialog"
          aria-modal="true"
        >
```

Contrast: `media-detail-dialog.tsx` and `image-view.tsx` lightbox **do** set `aria-label`.

---

### VF-AUD-20260910-UI-008 — Command Palette dialog is unnamed and the combobox pattern is incomplete

**Class:** CONFIRMED (ARIA)
**Observed:**

1. Dialog has no `aria-label` / `aria-labelledby` (visible “Command” text is not associated).
2. Search `<input>` sets `aria-activedescendant` without `role="combobox"`, `aria-controls`, or a `role="listbox"` on the item list.

```309:330:src/components/command-palette/CommandPalette.tsx
      role="dialog"
      aria-modal="true"
      onKeyDown={handleListKeyDown}
    >
      ...
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "commandPalette.searchPlaceholder",
              "Search tabs or actions… (e.g. image, new project)",
            )}
            className="flex-1 bg-transparent text-[14px] placeholder:text-text-muted/60 focus:outline-none"
            aria-activedescendant={activeDescendantId}
          />
```

Arrow/Home/End/Enter navigation exists (good). Accessible name and combobox roles do not.

---

### VF-AUD-20260910-UI-009 — Chat context popup is a `dialog` without modal semantics or trap

**Class:** CONFIRMED (ARIA misuse)
**Observed:** Popup uses `role="dialog"` without `aria-modal`, without `useFocusTrap`, and without moving focus into the panel. Escape/outside-click exist via a local effect. This is a disclosure/menu pattern implemented as a dialog.

```1329:1336:src/components/chat/chat-view.tsx
      {open && (
        <div
          role="dialog"
          aria-label={tRuntime(
            "runtimeGenerated.components.chat.chatView.attribute.chatContext",
          )}
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-elevated px-3 py-3 shadow-xl"
        >
```

---

### VF-AUD-20260910-UI-010 — App logo is a white-fill SVG on every theme

**Class:** CONFIRMED (theme / contrast)
**Expected:** Brand mark tracks appearance mode (black/red/white assets exist).
**Observed:** `VeniceLogo` always loads `venice-keys-white.svg`. The SVG paths are `fill="white"`. Forge Daylight light background is `#f6f8fa` / surface `#ffffff`. White-on-`#f6f8fa` is ~1.05:1 (fails WCAG AA). Unused siblings: `venice-keys-black.svg`, `venice-keys-red.svg`.

```13:16:src/components/ui/logo.tsx
    <img
      src="assets/branding/venice-keys-white.svg"
      className={cn("shrink-0", className)}
      width={size}
```

```12:13:src/theme/builtins/light.ts
      background: "#f6f8fa",
      surface: "#ffffff",
```

Public SVG (first path): `fill="white"`.

Rendered in sidebar, API-key dialog, empty chat, onboarding. Headed pixel check still listed under NEEDS HEADED QA; the color math does not require a browser.

---

### VF-AUD-20260910-UI-011 — Chat default avatar uses a root-absolute public URL

**Class:** CONFIRMED (assets / packaged vs dev)
**Expected:** Comment says Vite rewrites the URL for `file://`. Electron production sets `base: "./"`.
**Observed:** The value is a **string literal** beginning with `/`. Vite does not rewrite that. In a `file://` document this resolves to `file:///assets/branding/...`, not `dist/assets/branding/...`.

```37:40:src/components/chat/message-bubble.tsx
// Vite owns the emitted URL so it remains valid for both HTTP development and
// packaged file:// execution.
export const DEFAULT_AI_AVATAR_SRC = "/assets/branding/venice-seal-red-fill.svg";
```

```45:46:vite.config.ts
    // Electron's loadFile requires relative asset paths
    base: isElectronBuild ? "./" : "/",
```

Contrast: `VeniceLogo` uses a relative `assets/branding/...` path; `uiSoundController` resolves `audio/ui/...` against `document.baseURI`; mascot GIFs are Vite-imported from `assets/mascot/` (hashed, packaged-safe).

Broken image in packaged Electron is **LIKELY** until a headed `file://` session; the URL construction is CONFIRMED.

---

### VF-AUD-20260910-UI-012 — Production UI uses CSS classes that are not in the theme contract

**Class:** CONFIRMED (theme tokens)
**Expected:** `@theme` in `src/styles/theme.css` exposes `--color-bg`, `--color-surface`, `--color-danger`, `--color-text-primary`, etc. `scripts/verify-theme-tokens.cjs` forbids a small set of black/white utilities.
**Observed:** No `--color-background`, `--color-surface-base`, `--color-error`, `--color-text` (bare), or `--color-surface-hover` exists. These Tailwind classes therefore generate no theme color.

Evidence of missing keys: repository grep of `src/styles/theme.css` / theme engine finds `--color-bg` / `--color-danger` / `--color-text-primary` only.

Widespread usage includes:

| Class | Example |
| --- | --- |
| `bg-background` | `PromptCreateModal.tsx`, `PromptLibraryView.tsx`, `SceneComposerView.tsx`, `CommandPalette.tsx` (dozens of rows), `CharacterCreatorView.tsx`, `ImportPlanModal.tsx`, `ImageInspectorView.tsx` |
| `bg-surface-base` | `TaskCenterDrawer.tsx` (drawer + backdrop + action chips), `DocumentAgentView.tsx`, `SafetyPanel.tsx` |
| `text-error` / `bg-error` | `ImageInspectorView.tsx`, `ContextMenu.tsx` |
| `text-text` | `ContextMenu.tsx`, `ImageInspectorView.tsx` |
| `bg-surface-hover` / `hover:bg-surface-hover` | `WorkflowTemplatesView.tsx`, `ContextMenu.tsx` |

`TaskCenterDrawer` panel:

```76:87:src/components/status/TaskCenterDrawer.tsx
        className="fixed inset-0 z-[100] bg-surface-base/80 backdrop-blur-sm transition-opacity"
        onClick={close}
        aria-hidden
      />
      <div
        ...
        className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-sm flex-col soft-separator-l bg-surface-base shadow-2xl transition-transform duration-300 ease-out"
```

Visual “transparent drawer” is **LIKELY** without headed proof; the missing token is CONFIRMED.

---

### VF-AUD-20260910-UI-013 — Palette-scale Tailwind colors bypass the theme verifier

**Class:** CONFIRMED (theme)
**Expected:** Semantic `text-danger` / `bg-warning` / `text-info` (VERIFY-010 / VERIFY-041).
**Observed:** `verify-theme-tokens.cjs` only flags white/black/`bg-*-950`/`bg-[#000]`. Production files still use `text-red-*`, `border-red-*`, `bg-red-*`, `text-yellow-*`, `bg-yellow-*`, `text-blue-*`, `bg-blue-*`, `text-emerald-*`.

Examples:

```553:553:src/components/scenes/SceneComposerView.tsx
                  className="ml-auto rounded border border-border px-1.5 py-0.5 text-[12px] hover:border-red-400 hover:text-red-300"
```

```437:437:src/components/workflows/WorkflowTemplatesView.tsx
                  className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded"
```

```86:86:src/components/playground/agent-model-picker.tsx
            <span className="shrink-0 text-[12px] px-1 py-px rounded bg-emerald-400/15 text-emerald-300 font-medium uppercase tracking-wider">
```

```206:206:src/components/ui/shared.tsx
      className="flex items-start gap-2 text-[13px] text-red-300/95 bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2"
```

Also: `PromptLibraryView.tsx`, `playground-chat.tsx`, `preview-node.tsx`, `ProvidersPanel.tsx`, `CharacterCreatorView.tsx` (partially allowlisted), `venice-params.tsx`, `ManagedVideoPlayer.tsx` (`text-red-500`).

These colors do not follow light/dark semantic tokens and will fail contrast on some families.

---

### VF-AUD-20260910-UI-014 — Chat TTS controls are icon-only with `title`, not `aria-label`

**Class:** CONFIRMED (labels)
**Observed:** SVGs are `aria-hidden`. Accessible name therefore depends on HTML `title`, which is last-resort and inconsistently exposed.

```62:75:src/components/chat/ChatTtsPlayer.tsx
      <button
        onClick={handlePlayPause}
        className="p-1.5 text-text-muted/60 hover:text-text-secondary transition-colors rounded-md hover:bg-surface-elevated cursor-pointer disabled:opacity-50"
        title={
          isPlaying
            ? tRuntime(
                "runtimeGenerated.components.chat.chatttsplayer.attribute.pauseSpeech",
              )
            : tRuntime(
                "runtimeGenerated.components.chat.chatttsplayer.attribute.playSpeech",
              )
        }
        disabled={isLoading}
      >
```

Stop/restart buttons repeat the same `title`-only pattern.

---

### VF-AUD-20260910-UI-015 — Collapsed sidebar tab buttons have no `aria-label`

**Class:** CONFIRMED (labels / keyboard)
**Observed:** When `expanded` is false, the button child is only a `Meteocon` (no `aria-hidden` on the icon wrapper). Accessible name is the HTML `title` tooltip.

```700:716:src/components/layout/sidebar.tsx
                      <button
                        key={id}
                        onClick={() => {
                          setActiveTab(id);
                          onMobileClose?.();
                        }}
                        aria-current={isActive ? "page" : undefined}
                        title={!expanded ? tabLabel : undefined}
                        className={cn(
```

`Meteocon` renders a sanitized SVG via `dangerouslySetInnerHTML` and does not set `aria-hidden` (`src/components/ui/Meteocon.tsx` ~149–156). Expanded state includes a visible text label (OK).

---

### VF-AUD-20260910-UI-016 — Context menu has no arrow-key model and uses invalid color tokens

**Class:** CONFIRMED (keyboard / ARIA / theme)
**Observed:** `role="menu"` + `role="menuitem"` without roving tabindex, ArrowUp/Down, or auto-focus. Escape/outside-click exist. `aria-label` is optional. Classes `text-error`, `text-text`, `hover:bg-surface-hover` are not theme tokens (UI-012).

```123:148:src/components/ui/ContextMenu.tsx
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      data-context-menu-root="true"
      ...
        const labelClass = item.destructive
          ? "text-error hover:bg-error/10"
          : "text-text hover:bg-surface-hover";
```

Used from Media Studio cards (`media-card.tsx`).

---

### VF-AUD-20260910-UI-017 — Agent model picker announces a listbox it does not implement

**Class:** CONFIRMED (ARIA / i18n)
**Observed:** Trigger has `aria-haspopup="listbox"` and `aria-expanded` but no `aria-controls`. Popup is an un-roled `<div>` of `<button>`s, no `role="listbox"` / `option`, no ArrowDown from the trigger. Loading/empty labels are hardcoded English.

```67:82:src/components/playground/agent-model-picker.tsx
  const label = isLoading
    ? "Loading…"
    : current?.name || value || "Pick agent model";

  return (
    <div ref={ref} className="relative w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        ...
        aria-haspopup="listbox"
        aria-expanded={open}
      >
```

Chevron SVG is not `aria-hidden`.

---

### VF-AUD-20260910-UI-018 — Research session list is a listbox without the listbox keyboard contract

**Class:** CONFIRMED (ARIA)
**Observed:** Container `role="listbox"`; rows are `<button role="option">`. No `aria-activedescendant`, no arrow-key handler. AT will announce a listbox and expect arrows.

```413:430:src/components/research/ResearchWorkspaceView.tsx
          <div
            className="flex-1 overflow-y-auto"
            role="listbox"
            aria-label={tRuntime(
              "runtimeGenerated.components.research.researchworkspaceview.attribute.researchSessions",
            )}
          >
            {filteredSessions.map((s) => (
              ...
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSessionId === s.id}
```

(The same view otherwise labels create/collapse/submit controls well.)

---

### VF-AUD-20260910-UI-019 — Workspace tree directory toggles omit `aria-expanded`

**Class:** CONFIRMED (labels / tree)
**Observed:** Expand/collapse is a `<button>` with a decorative triangle and folder emoji, no `aria-expanded`, no `aria-controls`, not a treeitem.

```237:245:src/components/documents/WorkspaceTree.tsx
        <button
          type="button"
          onClick={() => onToggle(node.relativePath)}
          className="w-full text-left text-[12px] text-foreground py-1 px-2 rounded hover:bg-surface-muted flex items-center gap-2 transition-colors"
        >
          <span className="text-[12px]">{node.expanded ? "▼" : "▶"}</span>
          <span>📁</span>
          <span className="truncate">{basename(node.relativePath)}</span>
        </button>
```

---

### VF-AUD-20260910-UI-020 — First-run legal body and actions are English-only

**Class:** CONFIRMED (localization)
**Observed:** Title goes through `translateRuntime`. `body`, `agreeLabel`, and `docsLabel` are English string literals. `FirstRunModal` renders them verbatim.

```40:61:src/shared/legal.ts
export const FIRST_RUN_COPY = {
  get title() {
    return translateRuntime(
      "runtimeGenerated.shared.legal.metadata.welcomeToVeniceForge",
      "Welcome to Venice Forge",
    );
  },
  body: `**18+ Age Requirement & Content Warning**
You must be 18 years or older to use this application. ...
  agreeLabel: "I understand and am 18+",
  docsLabel: "View official Venice docs",
} as const;
```

Legal copy may be intentionally English; that is still a runtime-locale gap for non-English UI.

---

### VF-AUD-20260910-UI-021 — `ModalRequestHost` defaults and validation strings are English literals

**Class:** CONFIRMED (i18n / dialogs)
**Observed:**

```152:176:src/components/ui/modal-requests.tsx
      if (value.length < minLength) {
        setError(`Passphrase must be at least ${minLength} characters long.`);
        return;
      }
      if (request.options.confirm && value !== confirmation) {
        setError("Passphrases do not match.");
        return;
      }
...
  const actionLabel =
    request.kind === "text"
      ? (request.options.actionLabel ?? "Save")
      : request.kind === "secret"
        ? (request.options.actionLabel ?? "Continue")
        : (request.options.actionLabel ?? "Continue");
  const cancelLabel = request.options.cancelLabel ?? "Cancel";
```

This host is the canonical `askText` / `askSecret` / `askDecision` UI (backup, command palette, sidebar project create).

---

### VF-AUD-20260910-UI-022 — `ConfirmModal` default button labels are English

**Class:** CONFIRMED (i18n)
**Observed:** Component defaults `"Confirm"` / `"Cancel"`. Callers *may* pass translated labels; the primitive does not.

```12:29:src/components/ConfirmModal.tsx
  /** Label for the confirm action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel action button. Defaults to "Cancel". */
  cancelLabel?: string;
...
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
```

Also uses a static `id="confirm-modal-title"` (safe while only one instance is mounted).

---

### VF-AUD-20260910-UI-023 — Theme names Meslo Nerd Font, but no font files are packaged

**Class:** CONFIRMED (assets / typography)
**Observed:** `@theme` sets `--font-sans` / `--font-mono` to MesloLGM / MesloLGS Nerd Font. There is no `@font-face`, no file under `public/`, and `find` over the repo (excluding `node_modules`) returns no Meslo files. Runtime falls back to `system-ui` / generic `monospace`. Packaged vs dev look depends on whether the OS has that font installed.

```3:5:src/styles/theme.css
  --font-sans: "MesloLGM Nerd Font", system-ui, sans-serif;
  --font-mono: "MesloLGS Nerd Font Mono", monospace;
```

---

### VF-AUD-20260910-UI-024 — Bootstrap FOUC script special-cases 4 of 43 theme families

**Class:** CONFIRMED (theme engine)
**Observed:** `public/bootstrap-theme.js` hard-codes fallback palettes for `builtin-dracula`, `builtin-venice`, `builtin-gruvbox-dark`, `builtin-rosepine`, plus generic light/dark. The other 39 families flash the generic GitHub-like dark/light until React `applyTheme` runs. Code-syntax tokens are not applied at bootstrap at all.

```24:29:public/bootstrap-theme.js
    var isDracula = boot.selectedThemeId === 'builtin-dracula';
    var isVenice = boot.selectedThemeId === 'builtin-venice';
    var isGruvbox = boot.selectedThemeId === 'builtin-gruvbox-dark';
    var isRosepine = boot.selectedThemeId === 'builtin-rosepine';
```

Built-in family count is asserted as 43 in `src/theme/themes.test.ts`.

---

### VF-AUD-20260910-UI-025 — Theme Maker category and most token labels are hardcoded English

**Class:** CONFIRMED (i18n / Theme Maker)
**Observed:** `TOKEN_LABELS` is almost entirely English string literals (`"Background"`, `"Accent"`, …). Only `placeholder` uses `translateRuntime`. `TOKEN_CATEGORIES` / `CODE_TOKEN_CATEGORIES` names (`"Surfaces & Backgrounds"`, `"Code Surfaces"`) are English and rendered as `<h4>`.

```36:48:src/components/ThemeMaker.tsx
const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background: "Background",
  surface: "Surface",
  surfaceElevated: "Surface Elevated",
  ...
  accent: "Accent",
```

```80:86:src/components/ThemeMaker.tsx
const TOKEN_CATEGORIES: Array<{
  name: string;
  keys: Array<keyof ThemeTokens>;
}> = [
  {
    name: "Surfaces & Backgrounds",
```

---

### VF-AUD-20260910-UI-026 — Image/Video generate disable for missing API key has no local explanation

**Class:** CONFIRMED (disabled conditions / labels)
**Expected:** Loading/surface contract: short controls “must expose an accessible name or adjacent status text.” Chat empty-state copy explains a missing key. Composer uses `composer.disabledPlaceholder`.
**Observed:** Image Studio `PrimaryButton` disables on `!hasVeniceKey` with no `aria-describedby` and no adjacent “connect a key” status. Video generate does the same.

```1606:1612:src/components/image/image-view.tsx
      <PrimaryButton
        onClick={handleGenerate}
        disabled={
          !prompt.trim() || prompt.length > promptLimit || !hasVeniceKey
        }
        loading={mutation.isPending}
        size="lg"
```

Chat *does* explain:

```778:784:src/components/chat/chat-view.tsx
                {hasVeniceKey
                  ? tRuntime(
                      "runtimeGenerated.components.chat.chatView.text.pickAModelInTheHeaderAboveThenStartA",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.chat.chatView.text.connectAVeniceApiKeyFromTheHeaderAboveTo",
                    )}
```

Header has a Connect control (mitigation). The generate control itself is a silent disable.

---

### VF-AUD-20260910-UI-027 — Theme-token verifier does not cover the defects in UI-012/013

**Class:** CONFIRMED (verifier drift)
**Observed:** `scripts/verify-theme-tokens.cjs` `FORBIDDEN` list is white/black/`bg-[#000]`/`bg-*-950`/`bg-bg-base`. It does not flag `bg-background`, `text-error`, `text-red-400`, `bg-yellow-500/20`, or `bg-emerald-400/15`. `INVALID_BROWSER_TOKENS` (`--surface-base`, `--tone-error`, …) is only scanned under `src/components/research`, `src/components/search`, `src/styles`, `assets` — not `status/`, `gallery/`, `playground/`, `workflows/`.

```30:36:scripts/verify-theme-tokens.cjs
const SCAN_ROOTS = ["src/App.tsx", "src/components"];
const INVALID_BROWSER_TOKEN_SCAN_ROOTS = [
  "src/components/research",
  "src/components/search",
  "src/styles",
  "assets",
];
```

Research tests explicitly ban `bg-red-*` for that one view; the rest of the app is ungated.

---

### VF-AUD-20260910-UI-028 — Playground React Flow canvas has no accessible name

**Class:** CONFIRMED (ARIA) / interaction **NEEDS HEADED QA**
**Observed:** `@xyflow/react` `ReactFlow` is rendered with drag/select disabled and no `aria-label`. Default XYFlow UI is a mouse canvas; keyboard access is not configured.

```42:58:src/components/playground/workflow-preview.tsx
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={memoTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-surface"
      defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--border)', strokeWidth: 2 } }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      <Controls
        showInteractive={false}
```

---

### VF-AUD-20260910-UI-029 — Command Palette search field removes the focus outline with no replacement

**Class:** CONFIRMED (focus visibility)
**Observed:** `className="... focus:outline-none"` and no `focus-visible:ring` / `focus:border-*`. The control is the primary keyboard surface of the palette.

See snippet under UI-008 (`CommandPalette.tsx` line 329).

Many other inputs use `outline-none` **with** `focus:border-accent` (acceptable-if-headed-verified). This one does not.

---

### VF-AUD-20260910-UI-030 — API key Connect busy label is an ellipsis

**Class:** CONFIRMED (stale/opaque loading)
**Observed:** While `busy`, the primary button children become `"…"`. `aria-busy` is set; the accessible name collapses to a punctuation character.

```229:237:src/components/layout/api-key-dialog.tsx
          <button
            onClick={handleConnect}
            disabled={busy || !value.trim()}
            aria-busy={busy || undefined}
            ...
            {busy
              ? "…"
              : tRuntime(
                  "runtimeGenerated.components.layout.apiKeyDialog.text.connect",
                )}
```

`PrimaryButton` elsewhere keeps the label and sets `aria-busy` (better).

---

### VF-AUD-20260910-UI-031 — `theme.css` ships a fixed dark surface scale independent of the active theme

**Class:** CONFIRMED (theme)
**Observed:** `@theme` defines `--color-bg-base/raised/overlay` as hardcoded near-black hex, allowlisted. Any utility `bg-bg-base` is dark even in light mode. Related invalid `bg-surface-base` (UI-012) is a different, missing token.

```55:58:src/styles/theme.css
  --color-bg-base: #0a0a0c; /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */
  --color-bg-raised: #111114; /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */
  --color-bg-overlay: #16161b; /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */
```

The verifier *does* forbid `bg-bg-base` in components (comment: “Static dark surface scale in theme.css is not theme-aware”) but the tokens remain in the design system.

---

### VF-AUD-20260910-UI-032 — `useFocusTrap` is element-scoped and omits several focusable types

**Class:** CONFIRMED (focus-trap limitation)
**Observed:** Tab wrapping listens on the dialog element, not `document` in capture phase. If focus is outside the dialog (UI-004, or a click on a non-focusable overlay), Tab is not trapped. Selector list omits `summary`, `[role="button"]` without tabindex, and `audio/video[controls]`.

```21:30:src/hooks/useFocusTrap.ts
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ].join(',');
```

```80:80:src/hooks/useFocusTrap.ts
    el.addEventListener('keydown', handleKeyDown);
```

Onboarding `AccessibleDialog` with omitted `onClose` (UI-038) also swallows Escape via this hook.

---

## LIKELY findings

### VF-AUD-20260910-UI-033 — Packaged Electron 404 for the default AI avatar

**Class:** LIKELY (depends on `file://` resolution; construction in UI-011 is CONFIRMED)
**Evidence:** `DEFAULT_AI_AVATAR_SRC = "/assets/branding/venice-seal-red-fill.svg"` + Electron `base: "./"` + `win.loadFile(prodHtmlPath)`.

---

### VF-AUD-20260910-UI-034 — Task Center / Document Agent panels may render without a background

**Class:** LIKELY (visual)
**Evidence:** `bg-surface-base` is not a defined theme color (UI-012). Drawer would show whatever is behind the overlay.

---

### VF-AUD-20260910-UI-035 — Command Palette / Prompt Library / Scene Composer hover states are no-ops

**Class:** LIKELY (visual)
**Evidence:** `hover:bg-background` on palette rows and library/scene list items. If the parent is already `bg-surface`, hover provides no affordance.

---

### VF-AUD-20260910-UI-036 — Chat composer textarea has `outline-none` and no local focus ring

**Class:** LIKELY (focus visibility; parent chrome may substitute)
**Evidence:**

```408:410:src/components/chat/chat-input.tsx
            aria-label={t("composer.messageInput")}
            className="w-full bg-transparent px-5 pt-4 pb-1 text-[16px] text-text-primary outline-none resize-none max-h-48 placeholder:text-text-muted leading-relaxed"
            disabled={disabled}
```

Attach/send buttons *do* have `focus-visible:outline`. The textarea does not.

---

### VF-AUD-20260910-UI-037 — Hardcoded red/yellow/blue on light themes will fail AA

**Class:** LIKELY (contrast)
**Evidence:** `text-red-300`, `text-yellow-400`, `text-blue-300` are authored for dark canvases. Light families (Forge Daylight, GitHub Light, Porcelain) use light surfaces. No headed contrast measurement was taken.

---

### VF-AUD-20260910-UI-038 — Onboarding dialog traps Tab and ignores Escape

**Class:** LIKELY product issue / CONFIRMED behavior
**Evidence:** `OnboardingSplash` uses `AccessibleDialog` with no `onClose`. `useFocusTrap(..., onClose)` therefore no-ops Escape while preventing Tab from leaving. First-run age-gate similarly wires `onDismiss` to a no-op in `App.tsx` (intentional). Onboarding may be intentional; it is still a keyboard dead-end besides Next/Get Started.

```86:92:src/components/OnboardingSplash.tsx
    <AccessibleDialog
      title={<div className="sr-only">{steps[step].title}</div>}
      description={<div className="sr-only">{steps[step].description}</div>}
      panelRef={dialogRef}
      initialFocusRef={primaryActionRef}
      panelClassName="max-w-xl mesh-surface-elevated overflow-hidden p-0"
    >
```

---

## NEEDS HEADED QA (not claimed as defects)

These were **not** executed. Do not treat as CONFIRMED.

1. Skip-link focus landing on `#main-content` (`tabIndex={-1}`) in Electron vs web.
2. Mobile drawer (`md:hidden` overlay + sidebar translate) at narrow widths.
3. Sidebar resize handle keyboard (`Arrow`/`Home`/`End`) and inspector splitter.
4. High-contrast (`prefers-contrast: more`) and reduced-motion GIF freeze on generation mascots.
5. 100% / 200% / 400% zoom (called out by `docs/design/LOADING_AND_SURFACE_CONTRACT.md` as headed release QA).
6. RTL (`applyDocumentDirection` sets `dir` for `ar`/`he`; layout mirroring unverified).
7. All 43 families × light/dark Theme Maker preview, including code-syntax tokens.
8. Media compare/lightbox focus return after close.
9. React Flow Controls buttons vs screen reader.
10. Toast `role="alert"` vs `status` announcement order with Task Center open.
11. `group-hover` conversation export/delete vs keyboard (`group-focus-within` is present; visual QA still needed).
12. Packaged `file://` load of relative logo + audio oggs (construction looks correct; not executed).
13. First-run Cmd+K actually switching tabs under the age-gate (stacking CONFIRMED; user-visible bypass not executed).
14. Dark-on-dark mesh overlays reducing border contrast below 3:1.

---

## INFORMATIONAL / not a defect

1. **Skip link exists** and is guarded by `src/App.skip-link.test.ts` (VERIFY-066).
2. **Canonical dialog primitive** `AccessibleDialog` + `useFocusTrap` is used correctly by Prompt Create, Master Password, Profile password, Onboarding (except UI-038).
3. **Many icon buttons are correctly labelled** (header menu/sidebar/task/API key, chat attach/send/stop, image seed/preview, research session create/collapse, media toolbar).
4. **`PrimaryButton` loading** uses `aria-busy` and keeps the label (Image Studio generate).
5. **Generation loading indicator** uses `role="status"` + `aria-live="polite"` and reduced-motion static frames (`GenerationLoadingIndicator.tsx`).
6. **Mascot assets** are Vite-imported from `assets/mascot/` with static PNG fallback — packaged-safe.
7. **UI sounds** use relative `audio/ui/...` + `document.baseURI` (`src/services/uiSoundController.ts`) — packaged-safe.
8. **Branding trees match:** `diff -rq assets/branding public/assets/branding` is empty; `scripts/verify-dist.cjs` also sync-checks `NOTICE.md`.
9. **YAML starters exist for every built-in family** (`src/theme/themes.test.ts`). Dual `config/themes/*.yaml` + `src/theme/builtins/*.ts` is by design, not proven drift.
10. **`html lang` / `dir`** are updated by `src/i18n/direction.ts` on locale change (initial `index.html` is `lang="en"` until i18n boots).
11. **Contrast unit tests** exist for built-in families (`src/theme/contrast.test.ts`) — they do not cover hardcoded `text-red-300` in components.
12. **Chat composer disabled path** uses a translated placeholder (`composer.disabledPlaceholder`) when `disabled={!hasVeniceKey}`.

---

## Theme engine notes (architecture, not extra IDs)

- Runtime tokens are applied in `src/theme/applyTheme.ts` onto `--bg`, `--surface`, `--text-primary`, `--code-*`, `--syntax-*`.
- Tailwind `@theme` maps those to `--color-*` utilities (`bg-bg`, `text-text-primary`, `bg-accent`, …).
- `config/themes/*.yaml` is the user/YAML catalog; `src/theme/builtins/*.ts` is the compiled built-in catalog.
- Intentional fixed colors are marked `THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR` (video letterbox `bg-black`, toggle knobs `bg-white`, some status-on-media overlays).
- `index.html` loads `/bootstrap-theme.js` before the module bundle to reduce FOUC (limited by UI-024).

---

## Asset path matrix

| Asset | How referenced | Dev (`base: "/"`) | Electron prod (`base: "./"`) |
| --- | --- | --- | --- |
| `public/assets/branding/venice-keys-white.svg` | relative string in `logo.tsx` | OK | OK |
| `public/assets/branding/venice-seal-red-fill.svg` | `"/assets/..."` in `message-bubble.tsx` | OK | **broken (UI-011/033)** |
| `public/audio/ui/**/*.ogg` | relative + `new URL(..., baseURI)` | OK | OK |
| `assets/mascot/*.gif\|png` | ESM import | hashed in `dist/assets` | OK |
| `public/bootstrap-theme.js` | `/bootstrap-theme.js` in `index.html` | OK | Vite rewrites HTML `base`; script is copied to dist root |

---

## Dialog inventory (static)

| Dialog | `role=dialog` | `aria-modal` | accessible name | `useFocusTrap` |
| --- | --- | --- | --- | --- |
| `AccessibleDialog` | yes | yes | `aria-labelledby` | yes |
| `ConfirmModal` | yes | yes | `aria-labelledby` | yes |
| `FirstRunModal` | yes | yes | `aria-labelledby` | yes |
| `ModalRequestHost` | yes | yes | `aria-labelledby` | yes |
| `CommandPalette` | yes | yes | **none (UI-008)** | yes |
| `ApiKeyDialog` | yes | yes | `aria-labelledby` | **no (UI-004)** |
| `media-detail-dialog` | yes | yes | `aria-label` | yes |
| Image lightbox | yes | yes | `aria-label` | yes |
| Gallery compare/lineage | yes | yes | **none (UI-007)** | yes |
| `DiagnosticsDrawer` / `TaskCenterDrawer` | yes | yes | `aria-label` | yes |
| RP import / new chat / prompt debug | yes | yes | labelled | yes |
| Chat context popup | yes | **no** | `aria-label` | **no (UI-009)** |
| `CharacterCreatorLocalPickerModal` | **no** | no | n/a | **no (UI-005)** |
| `ImportPlanModal` | **no** | no | n/a | **no (UI-006)** |

---

## Suggested remediation order (not implemented)

1. Cap overlay z-index so first-run/onboarding outrank Command Palette; ignore Cmd+K while those are open (UI-001, UI-002).
2. Adopt `AccessibleDialog` (or equivalent trap + name) for API key, import plan, character picker, gallery compare/lineage, command palette (UI-004–008).
3. Replace `bg-background` / `bg-surface-base` / `text-error` / palette-scale reds with semantic tokens; extend `verify-theme-tokens.cjs` (UI-012, UI-013, UI-027).
4. Theme-aware logo (`currentColor` or black/white swap) and relative/imported seal URL (UI-010, UI-011).
5. `aria-label` on icon-only TTS and collapsed nav (UI-014, UI-015).

No source files were modified except this findings document.
