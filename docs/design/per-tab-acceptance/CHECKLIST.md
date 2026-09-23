# Per-Tab Headed Reviewer Checklist (VF-20260918-P2-016 / VF-20260922-P2-011)

Reviewers must inspect and evaluate each tab against both the universal criteria and the tab-specific checklist below before signing a manifest.

---

## 1. Universal Review Criteria

### A. Visual & Contrast
- [ ] Text contrast meets WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for large text).
- [ ] Active and hover states have distinct visual indicators without relying solely on hue.
- [ ] Light and dark themes maintain adequate panel/border separation.
- [ ] Background materials (`mesh-panel`, `vf-material`) do not obscure text legibility.

### B. Layout & Responsive Scaling
- [ ] Controls fit within viewport widths from 390px (mobile) to 2560px without horizontal document clipping.
- [ ] Sidebar and action rows collapse or truncate gracefully under narrow widths.
- [ ] Font scaling (100% to 200%) does not cause overlapping text or clipped action buttons.
- [ ] Modals, drawers, and portaled context menus are bounded by the viewport.

### C. Keyboard Navigation & Focus
- [ ] Logical `Tab` / `Shift+Tab` sequence across all interactive controls.
- [ ] Focused elements have a visible focus ring (`--color-vf-accent-glow-subtle` or equivalent).
- [ ] Roving focus (`ArrowUp` / `ArrowDown` / `Home` / `End`) works in menus, select lists, and tab strips.
- [ ] `Escape` dismisses open menus, dropdowns, and overlays, returning focus to the trigger.

### D. Screen-Reader & Accessibility Semantics
- [ ] Interactive elements have accessible names via `aria-label`, `aria-labelledby`, or text content.
- [ ] Dropdowns and menus expose `aria-expanded`, `aria-haspopup`, and `aria-activedescendant`.
- [ ] Status updates and generation progress announce via `aria-live="polite"` or `role="status"`.
- [ ] Icon-only buttons include descriptive screen-reader labels.

### E. Localization & RTL (Bidi)
- [ ] No raw translation keys (`__MISSING__:` or unparsed string paths) visible in the interface.
- [ ] Text strings expand gracefully for verbose languages (German, Russian, Portuguese) without clipping.
- [ ] Arabic (`ar`) renders with RTL layout, mirrored navigation, and right-aligned context menus.

---

## 2. Per-Tab Specific Checks

### 1. `character-chats`
- [ ] Chat conversation list displays titles, timestamps, and model badges without truncation overlap.
- [ ] Message bubbles resize cleanly; code blocks have horizontal scroll without breaking bubble width.
- [ ] Attachment drawer controls are keyboard-accessible.

### 2. `history`
- [ ] Folder tree and conversation items support keyboard navigation (`ArrowUp` / `ArrowDown`).
- [ ] Folder context menu (`ContextMenu`) opens within viewport bounds and restores focus on close.
- [ ] Search filtering updates list smoothly without focus loss.

### 3. `image-inspector`
- [ ] Session thumbnails and primary preview render valid media via `ResolvedMediaImg` (no 403 errors).
- [ ] Zoom/pan controls respond to keyboard and mouse wheel.
- [ ] EXIF / metadata drawer text wraps cleanly without clipping.

### 4. `prompts`
- [ ] Prompt template cards wrap tags and action buttons cleanly at 390px width.
- [ ] Search input and category filters support full keyboard traversal.
- [ ] Copy prompt action provides feedback (visual toast or `aria-live` announcement).

### 5. `scenes`
- [ ] Scene editor panels (characters, location, mood, plot) preserve layout at compact viewports.
- [ ] Generation parameters controls validate inputs before dispatch.
- [ ] Generated scene output renders without clipping long dialogue segments.

### 6. `audio`
- [ ] Audio player controls (play/pause, seek, volume) have distinct accessible names and keyboard focus.
- [ ] Spectrogram/waveform displays resize cleanly across viewports.
- [ ] TTS voice selection dropdown displays model choices and pricing indicators clearly.

### 7. `music`
- [ ] Track generation prompt meters show character counts within limits.
- [ ] Audio playback controls operate with spacebar / arrow keys.
- [ ] Track history cards support rename, download, and delete actions.

### 8. `video`
- [ ] Video queue progress indicators update reliably without layout jumps.
- [ ] Video player handles playback, full-screen, and download without z-index collisions.
- [ ] Duration and aspect ratio select inputs maintain active-descendant IDs.

### 9. `embeddings`
- [ ] Text chunking options and embedding model selectors display help tooltips clearly.
- [ ] Vector search test interface provides readable similarity score readouts.
- [ ] Batch processing tables scroll horizontally when columns exceed viewport width.

### 10. `search`
- [ ] Global search input autofocuses and supports `ArrowDown` into result lists.
- [ ] Search results distinguish message hits, document hits, and character hits visually.
- [ ] Search highlight tokens maintain readable contrast against background.

### 11. `characters`
- [ ] Character cards display avatar, name, and tag pills without overflow.
- [ ] Action buttons (chat, edit, export, delete) wrap within narrow card widths.
- [ ] Import card dialog validates character JSON / card PNG without freezing UI.

### 12. `character-creator`
- [ ] Form sections (identity, personality, scenario, greeting) support sequential tab navigation.
- [ ] Avatar upload preview renders without distorting aspect ratio.
- [ ] Submit button disables with clear error messages when required fields are missing.

### 13. `rp-studio`
- [ ] Persona selector, scenario builder, and dialogue history stay synchronized.
- [ ] Multi-character response styling clearly identifies speakers.
- [ ] Formatting toolbar buttons have accessible labels and active toggle states.

### 14. `privacy`
- [ ] Local storage usage meters display accurate byte / item counts.
- [ ] Clear storage confirmations warn with destructive button styling (`variant="danger"`).
- [ ] Export data package action functions with clear progress feedback.

### 15. `playground`
- [ ] System prompt editor, user prompt editor, and parameter sliders fit side-by-side or stacked cleanly.
- [ ] Model selector lists capability tags (E2EE, uncensored, vision).
- [ ] Token counter and cost estimator update dynamically on keystroke.
