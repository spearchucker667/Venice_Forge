/**
 * electron-builder configuration for Venice Forge desktop app.
 * Produces:
 *   Windows: NSIS installer + portable .exe
 *   macOS:   DMG + ZIP (both arm64 and x64)
 *   Linux:   AppImage + .deb + .rpm
 *
 * Build outputs go to release/
 * Run: npm run dist:win / dist:mac / dist:linux
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
  copyright: "Copyright © 2026 Venice Forge contributors. Venice™, Venice.ai™, and the Venice marks are trademarks of Venice.ai, Inc. Used under identification/fair-use principles.",

  directories: {
    output: "release",
    buildResources: "build",
  },

  files: [
    "dist/**/*",
    "!dist/**/*.map",
    "dist-electron/**/*",
    "!dist-electron/**/*.map",
    "package.json",
    "!**/*.map",
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
    // Hardened runtime requires a signing identity; ad-hoc/unsigned builds omit it.
    // identity: null explicitly disables code signing when no cert is available.
    ...(isCIRelease
      ? { hardenedRuntime: true }
      : { identity: null }),
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

  linux: {
    // Expanded Linux support per exhaustive review (P1 packaging gap).
    // Includes arm64 for Apple Silicon / ARM servers + deb/rpm for broader distro compatibility.
    // AppImage remains for portable "just run" experience.
    target: [
      { target: "AppImage", arch: ["x64", "arm64"] },
      { target: "deb", arch: ["x64", "arm64"] },
      { target: "rpm", arch: ["x64", "arm64"] },
    ],
    icon: "build/icon.png",
    category: "Utility",
    // Maintainer is required for .deb/.rpm packages because the
    // package.json `author` field is a string, not an object with email.
    // Without this, electron-builder aborts on the FpmTarget step.
    maintainer: "Venice Forge contributors <venice-forge@localhost.invalid>",
    vendor: "Venice Forge contributors",
    // artifactName helps with consistent naming across arches.
    artifactName: "Venice-Forge-${version}-${arch}.${ext}",
  },
};

module.exports = config;
