# Venice Forge — Theme Import and Export Specification

> **Specification:** Theme Exchange & Interoperability  
> **Schema:** Venice Forge Theme V2  
> **File Extension:** `*.theme.yaml` or `*.yaml`  
> **Security Boundaries:** Electron Trusted Main Process / Renderer IPC  
> **Date:** September 14, 2026  

---

## 1. Overview

Venice Forge provides full export and import support for user-created, community, and backup themes. Themes are serialized as clean, human-readable YAML documents containing both `light` and `dark` mode variants and syntax-highlighting configurations.

---

## 2. Canonical YAML Exchange Structure

Below is the authoritative Schema V2 exchange format:

```yaml
schemaVersion: 2
id: cyber-matrix
name: Cyber Matrix
description: High-contrast neon green and obsidian terminal palette
author: Venice Community
version: 1.0.0
variants:
  dark:
    tokens:
      background: "#0a0d0a"
      surface: "#101610"
      surfaceElevated: "#172017"
      surfaceMuted: "#1f2a1f"
      overlay: "#000000b3"
      glow: "#00ff6640"
      foreground: "#e0ffe8"
      foregroundMuted: "#88bb94"
      foregroundSubtle: "#44664c"
      placeholder: "#33553a"
      disabledForeground: "#2a4230"
      link: "#00ff66"
      border: "#1f3322"
      borderStrong: "#2d4d33"
      focusRing: "#00ff66"
      selectionBackground: "#00ff6633"
      selectionForeground: "#ffffff"
      accent: "#00ff66"
      accentHover: "#1aff75"
      accentForeground: "#001a08"
      buttonPrimaryBackground: "#00ff66"
      buttonPrimaryForeground: "#001a08"
      buttonSecondaryBackground: "#172017"
      buttonSecondaryForeground: "#e0ffe8"
      inputBackground: "#101610"
      inputForeground: "#e0ffe8"
      success: "#00ff66"
      successForeground: "#001a08"
      warning: "#ffbb00"
      warningForeground: "#1a1300"
      danger: "#ff3355"
      dangerForeground: "#ffffff"
      info: "#00ddff"
    code:
      preset: automatic
      tokens:
        background: "#080b08"
        foreground: "#e0ffe8"
        border: "#1f3322"
        headerBackground: "#101610"
        headerForeground: "#88bb94"
        inlineBackground: "#172017"
        inlineForeground: "#00ff66"
        selectionBackground: "#00ff6633"
        comment: "#44664c"
        keyword: "#00ff66"
        string: "#77ff99"
        number: "#ffbb00"
        function: "#33ddff"
  light:
    tokens:
      background: "#f4faf5"
      surface: "#ffffff"
      surfaceElevated: "#eaf3ec"
      surfaceMuted: "#d9e8dc"
      overlay: "#00000066"
      glow: "#00883320"
      foreground: "#0a1a0e"
      foregroundMuted: "#2d4a34"
      foregroundSubtle: "#627d68"
      placeholder: "#849e8a"
      disabledForeground: "#a2b8a7"
      link: "#008833"
      border: "#c5d9c9"
      borderStrong: "#9ebfa4"
      focusRing: "#008833"
      selectionBackground: "#00883325"
      selectionForeground: "#0a1a0e"
      accent: "#008833"
      accentHover: "#00732b"
      accentForeground: "#ffffff"
      buttonPrimaryBackground: "#008833"
      buttonPrimaryForeground: "#ffffff"
      buttonSecondaryBackground: "#eaf3ec"
      buttonSecondaryForeground: "#0a1a0e"
      inputBackground: "#ffffff"
      inputForeground: "#0a1a0e"
      success: "#008833"
      successForeground: "#ffffff"
      warning: "#b36b00"
      warningForeground: "#ffffff"
      danger: "#cc1133"
      dangerForeground: "#ffffff"
      info: "#0066aa"
    code:
      preset: automatic
      tokens:
        background: "#eaf3ec"
        foreground: "#0a1a0e"
        border: "#c5d9c9"
        headerBackground: "#d9e8dc"
        headerForeground: "#2d4a34"
        inlineBackground: "#d9e8dc"
        inlineForeground: "#008833"
        selectionBackground: "#00883325"
        comment: "#627d68"
        keyword: "#008833"
        string: "#006622"
        number: "#b36b00"
        function: "#005588"
```

---

## 3. Security, Sanitization & Trust Boundaries

All imported theme documents are treated as untrusted external content:

1. **Parser Safety:** Parsed using YAML safe mode (`yaml.parse` with strict schema validation). Prototype pollution keys (`__proto__`, `constructor`, `prototype`) are explicitly stripped.
2. **Color Value Sanitization:** Every token value is sanitized and verified by `isValidColorValue()`. Any value that cannot resolve as a safe CSS color literal (hex, rgb, rgba, hsl, hsla) is rejected with a descriptive error.
3. **No Code Execution:** Themes are declarative data structures only. Inline JavaScript, CSS expressions (`expression(...)`), and SVG scripts are structurally impossible.
4. **Filename Sanitization:** On export, filenames are sanitized using `[^a-z0-9_-]` regex replacements to prevent path traversal or shell character injection.

---

## 4. Conflict Resolution Workflows

When importing a theme that matches an existing theme by ID or name:

```
Import YAML
     │
     ▼
Collision with Existing Theme?
 ├── No  ──► Import as New Custom Theme
 └── Yes ──► Present Conflict Resolution Dialog
              ├── "Apply as Preview": Preview in memory without saving to disk
              ├── "Import as Copy": Rename with "(Copy)" and allocate fresh ID
              └── "Replace Existing": Overwrite stored record with explicit confirmation
```

---

## 5. Automated Testing

Theme serialization and import workflows are verified by:
- `src/theme/yamlTheme.test.ts`: Lossless roundtrip serialization, multi-variant handling, fallback resilience.
- `src/components/ThemeMaker.custom.test.tsx`: Import modal conflict detection and resolution actions.
