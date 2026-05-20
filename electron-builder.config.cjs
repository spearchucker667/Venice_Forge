/**
 * electron-builder configuration for Venice Forge desktop app.
 * Produces a Windows NSIS installer and a portable .exe.
 *
 * Build outputs go to release/
 * Run: npm run dist:win
 */

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "ai.venice.forge",
  productName: "Venice Forge",
  copyright: "Copyright © 2026 Venice Forge contributors",

  directories: {
    output: "release",
    buildResources: "build",
  },

  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json",
  ],

  extraMetadata: {
    main: "dist-electron/main.js",
  },

  asar: true,

  // Publish disabled by default – configure your own publish target if needed
  publish: null,

  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    icon: "build/icon.ico",
    requestedExecutionLevel: "asInvoker",
    artifactName: "Venice-Forge-${version}-${arch}-Setup.${ext}",
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Venice Forge",
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    installerHeaderIcon: "build/icon.ico",
    deleteAppDataOnUninstall: false,
  },

  portable: {
    artifactName: "Venice-Forge-${version}-${arch}-Portable.${ext}",
  },

  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    icon: "build/icon.icns",
    category: "public.app-category.productivity",
  },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    icon: "build/icon.png",
    category: "Utility",
  },
};

module.exports = config;
