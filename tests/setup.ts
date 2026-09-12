import { beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// Globally stub Electron so contract verifiers and tests can run without an installed Electron runtime
// while still importing canonical adapters that transitively import Electron.
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/venice-forge-test-userdata'),
    getName: vi.fn(() => 'Venice Forge'),
    isPackaged: false,
    getVersion: vi.fn(() => '0.0.0-test'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
    decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf8')),
  },
}))


import { changeLanguage } from "../src/i18n";

beforeEach(() => {
  changeLanguage("en-US");
});

// VF-AUD-20260912-P2-005: Do not globally silence console.warn and console.error.
// Expected warnings/errors should be scoped to individual tests via vi.spyOn(console, ...).
// console.warn = vi.fn();
// console.error = vi.fn();

if (typeof globalThis.HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      canvas: null,
    })),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: vi.fn(() => "data:image/png;base64,"),
  });
}
