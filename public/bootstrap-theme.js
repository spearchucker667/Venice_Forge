(function() {
  try {
    var raw = localStorage.getItem('vf.theme.bootstrap');
    if (!raw) return;
    var boot = JSON.parse(raw);
    var root = document.documentElement;
    var t = (boot.customTheme && boot.customTheme.tokens) || {};
    // Validate token values to prevent CSS injection via malicious localStorage.
    function validColor(v) {
      if (typeof v !== 'string' || v.length > 128) return false;
      if (/url\(|expression\(|javascript:|@import/i.test(v)) return false;
      return /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[-+\d\s.,%/]+\s*\)|hsla?\(\s*[-+\d\s.,deg%/]+\s*\)|transparent|currentColor)$/i.test(v);
    }
    function safeToken(val, fallback) {
      return validColor(val) ? val : fallback;
    }
    var isDracula = boot.selectedThemeId === 'builtin-dracula';
    var isVenice = boot.selectedThemeId === 'builtin-venice' || !boot.selectedThemeId; // Default to Venice
    var map = {
      '--bg': safeToken(t.background, isVenice ? '#050a0f' : isDracula ? '#282a36' : (boot.appearanceMode === 'light' ? '#f6f8fa' : '#0d1117')),
      '--surface': safeToken(t.surface, isVenice ? '#080f15' : isDracula ? '#44475a' : (boot.appearanceMode === 'light' ? '#ffffff' : '#161b22')),
      '--surface-elevated': safeToken(t.surfaceElevated, isVenice ? '#111922' : isDracula ? '#6272a4' : (boot.appearanceMode === 'light' ? '#ffffff' : '#1c2330')),
      '--border': safeToken(t.border, isVenice ? '#1b2632' : isDracula ? '#6272a4' : (boot.appearanceMode === 'light' ? '#d0d7de' : '#2a3140')),
      '--text-primary': safeToken(t.textPrimary, isVenice ? '#f4f6f8' : isDracula ? '#f8f8f2' : (boot.appearanceMode === 'light' ? '#1f2328' : '#e6edf3')),
      '--text-secondary': safeToken(t.textSecondary, isVenice ? '#a6b0bc' : isDracula ? '#bfbfbf' : (boot.appearanceMode === 'light' ? '#57606a' : '#9aa7b8')),
      '--text-muted': safeToken(t.textMuted, isVenice ? '#687483' : isDracula ? '#6272a4' : (boot.appearanceMode === 'light' ? '#8b949e' : '#6b7686')),
      '--accent': safeToken(t.accent, isVenice ? '#63b3ed' : isDracula ? '#bd93f9' : (boot.appearanceMode === 'light' ? '#0969da' : '#2f81f7')),
      '--accent-hover': safeToken(t.accentHover, isVenice ? '#2b6cb0' : isDracula ? '#ff79c6' : (boot.appearanceMode === 'light' ? '#0860c4' : '#4c93f8')),
      '--accent-fg': safeToken(t.accentForeground, isVenice ? '#050a0f' : isDracula ? '#f8f8f2' : '#ffffff'),
      '--success': safeToken(t.success, isVenice ? '#74d66a' : isDracula ? '#50fa7b' : (boot.appearanceMode === 'light' ? '#1a7f37' : '#3fb950')),
      '--warning': safeToken(t.warning, isVenice ? '#d6a84f' : isDracula ? '#f1fa8c' : (boot.appearanceMode === 'light' ? '#9a6700' : '#d29922')),
      '--danger': safeToken(t.danger, isVenice ? '#ef4444' : isDracula ? '#ff5555' : (boot.appearanceMode === 'light' ? '#cf222e' : '#f85149')),
      '--info': safeToken(t.info, isVenice ? '#7da7ff' : isDracula ? '#8be9fd' : (boot.appearanceMode === 'light' ? '#0969da' : '#58a6ff')),
      '--focus-ring': safeToken(t.focusRing, isVenice ? '#63b3ed' : isDracula ? '#bd93f9' : (boot.appearanceMode === 'light' ? '#0969da' : '#4c93f8')),
      '--overlay': safeToken(t.overlay, isVenice ? 'rgba(5, 10, 15, 0.7)' : isDracula ? 'rgba(40,42,54,0.7)' : (boot.appearanceMode === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)')),
      '--glow': safeToken(t.glow, isVenice ? 'rgba(99, 179, 237, 0.1)' : isDracula ? 'rgba(189,147,249,0.2)' : (boot.appearanceMode === 'light' ? 'rgba(9,105,218,0.18)' : 'rgba(47,129,247,0.25)')),
    };
    Object.keys(map).forEach(function(k) { root.style.setProperty(k, map[k]); });
    root.dataset.themeMode = boot.appearanceMode || 'dark';
  } catch (e) {}
})();
