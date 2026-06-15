(function() {
  try {
    var raw = localStorage.getItem('vf.theme.bootstrap');
    if (!raw) return;
    var boot = JSON.parse(raw);
    if (!boot || typeof boot !== 'object' || Array.isArray(boot)) return;
    if (boot.appearanceMode !== 'dark' && boot.appearanceMode !== 'light') boot.appearanceMode = 'dark';
    var root = document.documentElement;
    var customTheme = boot.customTheme && typeof boot.customTheme === 'object' && !Array.isArray(boot.customTheme)
      ? boot.customTheme
      : null;
    var t = customTheme && customTheme.tokens && typeof customTheme.tokens === 'object' && !Array.isArray(customTheme.tokens)
      ? customTheme.tokens
      : {};
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
    var isVenice = boot.selectedThemeId === 'builtin-venice';
    var isGruvbox = boot.selectedThemeId === 'builtin-gruvbox-dark';
    var isRosepine = boot.selectedThemeId === 'builtin-rosepine';
    var map = {
      '--bg': safeToken(t.background, isVenice ? '#050a0f' : isDracula ? '#282a36' : isGruvbox ? '#282828' : isRosepine ? '#191724' : (boot.appearanceMode === 'light' ? '#f6f8fa' : '#0d1117')),
      '--surface': safeToken(t.surface, isVenice ? '#080f15' : isDracula ? '#343748' : isGruvbox ? '#3c3836' : isRosepine ? '#1f1d2e' : (boot.appearanceMode === 'light' ? '#ffffff' : '#161b22')),
      '--surface-elevated': safeToken(t.surfaceElevated, isVenice ? '#111922' : isDracula ? '#44475a' : isGruvbox ? '#504945' : isRosepine ? '#26233a' : (boot.appearanceMode === 'light' ? '#ffffff' : '#1c2330')),
      '--border': safeToken(t.border, isVenice ? '#1b2632' : isDracula ? '#52566e' : isGruvbox ? '#665c54' : isRosepine ? '#403d52' : (boot.appearanceMode === 'light' ? '#d0d7de' : '#2a3140')),
      '--text-primary': safeToken(t.textPrimary, isVenice ? '#f4f6f8' : isDracula ? '#f8f8f2' : isGruvbox ? '#ebdbb2' : isRosepine ? '#e0def4' : (boot.appearanceMode === 'light' ? '#1f2328' : '#e6edf3')),
      '--text-secondary': safeToken(t.textSecondary, isVenice ? '#a6b0bc' : isDracula ? '#bfbfbf' : isGruvbox ? '#d5c4a1' : isRosepine ? '#908caa' : (boot.appearanceMode === 'light' ? '#57606a' : '#9aa7b8')),
      '--text-muted': safeToken(t.textMuted, isVenice ? '#687483' : isDracula ? '#9e9fb4' : isGruvbox ? '#928374' : isRosepine ? '#6e6a86' : (boot.appearanceMode === 'light' ? '#8b949e' : '#6b7686')),
      '--accent': safeToken(t.accent, isVenice ? '#63b3ed' : isDracula ? '#bd93f9' : isGruvbox ? '#fe8019' : isRosepine ? '#ebbcba' : (boot.appearanceMode === 'light' ? '#0969da' : '#2f81f7')),
      '--accent-hover': safeToken(t.accentHover, isVenice ? '#2b6cb0' : isDracula ? '#ff79c6' : isGruvbox ? '#d65d0e' : isRosepine ? '#31748f' : (boot.appearanceMode === 'light' ? '#0860c4' : '#4c93f8')),
      '--accent-fg': safeToken(t.accentForeground, isVenice ? '#050a0f' : isDracula ? '#282a36' : isGruvbox ? '#282828' : isRosepine ? '#191724' : '#ffffff'),
      '--success': safeToken(t.success, isVenice ? '#74d66a' : isDracula ? '#50fa7b' : isGruvbox ? '#b8bb26' : isRosepine ? '#9ccfd8' : (boot.appearanceMode === 'light' ? '#1a7f37' : '#3fb950')),
      '--warning': safeToken(t.warning, isVenice ? '#d6a84f' : isDracula ? '#f1fa8c' : isGruvbox ? '#fabd2f' : isRosepine ? '#f6c177' : (boot.appearanceMode === 'light' ? '#9a6700' : '#d29922')),
      '--danger': safeToken(t.danger, isVenice ? '#ef4444' : isDracula ? '#ff5555' : isGruvbox ? '#fb4934' : isRosepine ? '#eb6f92' : (boot.appearanceMode === 'light' ? '#cf222e' : '#f85149')),
      '--info': safeToken(t.info, isVenice ? '#7da7ff' : isDracula ? '#8be9fd' : isGruvbox ? '#83a598' : isRosepine ? '#c4a7e7' : (boot.appearanceMode === 'light' ? '#0969da' : '#58a6ff')),
      '--focus-ring': safeToken(t.focusRing, isVenice ? '#63b3ed' : isDracula ? '#bd93f9' : isGruvbox ? '#fe8019' : isRosepine ? '#ebbcba' : (boot.appearanceMode === 'light' ? '#0969da' : '#4c93f8')),
      '--overlay': safeToken(t.overlay, isVenice ? 'rgba(5, 10, 15, 0.7)' : isDracula ? 'rgba(40,42,54,0.7)' : isGruvbox ? 'rgba(40, 40, 40, 0.6)' : isRosepine ? 'rgba(25, 23, 36, 0.7)' : (boot.appearanceMode === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)')),
      '--glow': safeToken(t.glow, isVenice ? 'rgba(99, 179, 237, 0.1)' : isDracula ? 'rgba(189,147,249,0.2)' : isGruvbox ? 'rgba(254, 128, 25, 0.25)' : isRosepine ? 'rgba(235, 188, 186, 0.2)' : (boot.appearanceMode === 'light' ? 'rgba(9,105,218,0.18)' : 'rgba(47,129,247,0.25)')),
    };
    var lightMode = boot.appearanceMode === 'light';
    var statusFallback = lightMode ? '#ffffff' : map['--bg'];
    map['--surface-muted'] = safeToken(t.surfaceMuted, map['--surface']);
    map['--border-strong'] = safeToken(t.borderStrong, map['--text-muted']);
    map['--foreground'] = safeToken(t.foreground, map['--text-primary']);
    map['--foreground-muted'] = safeToken(t.foregroundMuted, map['--text-secondary']);
    map['--foreground-subtle'] = safeToken(t.foregroundSubtle, map['--text-muted']);
    map['--success-fg'] = safeToken(t.successForeground, statusFallback);
    map['--warning-fg'] = safeToken(t.warningForeground, statusFallback);
    map['--danger-fg'] = safeToken(t.dangerForeground, statusFallback);
    map['--input-bg'] = safeToken(t.inputBackground, map['--surface-elevated']);
    map['--input-fg'] = safeToken(t.inputForeground, map['--foreground']);
    map['--placeholder'] = safeToken(t.placeholder, map['--foreground-subtle']);
    map['--disabled-fg'] = safeToken(t.disabledForeground, map['--foreground-subtle']);
    map['--button-primary-bg'] = safeToken(t.buttonPrimaryBackground, map['--accent']);
    map['--button-primary-fg'] = safeToken(t.buttonPrimaryForeground, map['--accent-fg']);
    map['--button-secondary-bg'] = safeToken(t.buttonSecondaryBackground, map['--surface-elevated']);
    map['--button-secondary-fg'] = safeToken(t.buttonSecondaryForeground, map['--foreground']);
    map['--link'] = safeToken(t.link, map['--info']);
    map['--selection-bg'] = safeToken(t.selectionBackground, map['--accent']);
    map['--selection-fg'] = safeToken(t.selectionForeground, map['--accent-fg']);
    Object.keys(map).forEach(function(k) { root.style.setProperty(k, map[k]); });
    root.dataset.themeMode = boot.appearanceMode || 'dark';
  } catch (e) {}
})();
