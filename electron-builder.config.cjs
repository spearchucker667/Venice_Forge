/**
 * electron-builder configuration for Venice Forge desktop app.
 * Produces Windows (NSIS installer + portable .exe) and macOS (DMG + zip)
 * artifacts.
 *
 * Build outputs go to release/
 * Run: npm run dist:win or npm run dist:mac
 */

const isCIRelease =
  !!process.env.CSC_LINK &&
  !!process.env.CSC_KEY_PASSWORD &&
  !!process.env.APPLE_ID &&
  !!process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  !!process.env.APPLE_TEAM_ID;

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
    main: "dist-electron/electron/main.js",
  },

  asar: true,

  publish: {
    provider: "github",
    owner: "spearchucker667",
    repo: "Venice-API-connector",
  },

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
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
    icon: "build/icon.icns",
    category: "public.app-category.productivity",
    artifactName: "Venice-Forge-${version}-${arch}.${ext}",
    // Hardened runtime is only valid when a signing identity is present.
    // Ad-hoc / unsigned builds (CI without credentials, local dev) omit it.
    ...(isCIRelease ? { hardenedRuntime: true } : {}),
  },

  dmg: {
    artifactName: "Venice-Forge-${version}-${arch}.${ext}",
    sign: false,
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications",
      },
    ],
  },

  // Linux target is disabled until icon assets (icon.png)
  // are added and the platform is smoke-tested.
  // linux: {
  //   target: [{ target: "AppImage", arch: ["x64"] }],
  //   icon: "build/icon.png",
  //   category: "Utility",
  // },
};

module.exports = config;
