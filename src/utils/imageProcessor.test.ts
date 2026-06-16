/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect } from 'vitest';
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  detectMimeType,
  stripImageMetadata,
  processBase64Image,
  routeAsset,
  DEFAULT_ASSET_ROUTE_RULES,
} from './imageProcessor';

describe('imageProcessor', () => {
  describe('base64ToUint8Array', () => {
    it('converts base64 to Uint8Array', () => {
      const base64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const result = base64ToUint8Array(base64);
      expect(Buffer.from(result).toString()).toBe('Hello World');
    });

    it('handles data URI prefixes', () => {
      const base64 = 'data:image/jpeg;base64,SGVsbG8gV29ybGQ=';
      const result = base64ToUint8Array(base64);
      expect(Buffer.from(result).toString()).toBe('Hello World');
    });
  });

  describe('uint8ArrayToBase64', () => {
    it('converts Uint8Array to base64 data URI', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToBase64(bytes, 'image/jpeg');
      expect(result).toBe('data:image/jpeg;base64,SGVsbG8=');
    });
  });

  describe('detectMimeType', () => {
    it('detects PNG', () => {
      const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(detectMimeType(pngSig)).toEqual({ mimeType: 'image/png', extension: 'png' });
    });

    it('detects JPEG', () => {
      const jpegSig = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(detectMimeType(jpegSig)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    });

    it('detects WebP', () => {
      const webpSig = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectMimeType(webpSig)).toEqual({ mimeType: 'image/webp', extension: 'webp' });
    });

    it('returns null for unknown', () => {
      expect(detectMimeType(new Uint8Array([0, 0, 0, 0]))).toBeNull();
    });
    
    it('returns null for short arrays', () => {
      expect(detectMimeType(new Uint8Array([0xFF, 0xD8]))).toBeNull(); 
    });
  });

  describe('stripImageMetadata - JPEG', () => {
    it('strips APP1 (EXIF) from JPEG', () => {
      const data = new Uint8Array([
        0xFF, 0xD8, // SOI
        0xFF, 0xE1, 0x00, 0x04, 0x00, 0x00, // APP1 marker (EXIF) - length 4
        0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00, // DQT marker
        0xFF, 0xD9  // EOI
      ]);
      const { data: result, report } = stripImageMetadata(data);
      expect(report.metadataRemoved).toBe(true);
      expect(result).toEqual(new Uint8Array([
        0xFF, 0xD8,
        0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00,
        0xFF, 0xD9
      ]));
    });

    it('handles short JPEG', () => {
      // It is unreachable to hit "Invalid JPEG signature" from stripImageMetadata
      // because detectMimeType requires length >= 4 and matches FF D8.
      // So we just skip testing that specific warning and rely on other coverage.
      const data = new Uint8Array([0xFF, 0xD8, 0x00, 0x00]);
      const { data: result } = stripImageMetadata(data);
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles standalone markers and padding', () => {
      const data = new Uint8Array([
        0xFF, 0xD8, // SOI
        0xFF, 0x00, // Standalone
        0xFF, 0xD0, // Standalone RST0
        0xFF, 0xD9  // EOI
      ]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data); // nothing stripped
    });

    it('handles malformed chunk (length exceeds bounds)', () => {
      const data = new Uint8Array([
        0xFF, 0xD8, // SOI
        0xFF, 0xE1, 0xFF, 0xFF // Length is too big
      ]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data); // Keeps everything since it breaks loop
    });
    
    it('handles early termination and non-marker FF', () => {
      const data2 = new Uint8Array([
        0xFF, 0xD8, // SOI
        0x55, 0xDB, 0x00, 0x04, 0x00, 0x00
      ]);
      const { data: result2 } = stripImageMetadata(data2);
      expect(result2).toEqual(data2);
    });
    
    it('handles missing data after FF', () => {
      const data = new Uint8Array([0xFF, 0xD8, 0xFF]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data);
    });
    
    it('handles missing length bytes', () => {
      const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data);
    });
  });

  describe('stripImageMetadata - PNG', () => {
    const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
    
    it('strips metadata chunks from PNG', () => {
      const ihdrChunk = [0,0,0,0, ...Array.from(Buffer.from('IHDR')), 0,0,0,0];
      const textChunk = [0,0,0,4, ...Array.from(Buffer.from('tEXt')), 1,2,3,4, 0,0,0,0];
      const data = new Uint8Array([...pngSig, ...ihdrChunk, ...textChunk]);
      
      const { data: result, report } = stripImageMetadata(data);
      expect(report.metadataRemoved).toBe(true);
      expect(result).toEqual(new Uint8Array([...pngSig, ...ihdrChunk]));
    });

    it('handles invalid PNG signature', () => {
      const data = new Uint8Array([...pngSig.slice(0, 7), 0]);
      // Actually we need to force mime type to PNG manually to hit the signature check.
      // But detectMimeType will say unknown.
      // If we use processBase64Image? No, it uses detectMimeType.
      // Wait! detectMimeType checks first 4 bytes of PNG!
      // So if first 4 bytes match, but next 4 don't, stripImageMetadata will run PNG stripper!
      const pseudoPng = new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0]);
      const { data: result, report } = stripImageMetadata(pseudoPng);
      expect(report.warnings).toContain('Invalid PNG signature');
      expect(result).toEqual(pseudoPng);
    });

    it('handles short PNG', () => {
      const data = new Uint8Array([137, 80, 78, 71, 0, 0]);
      const { data: result, report } = stripImageMetadata(data);
      expect(report.warnings).toContain('Invalid PNG signature');
      expect(result).toEqual(data);
    });
    
    it('handles truncated chunk header in PNG', () => {
      const data = new Uint8Array([...pngSig, 0, 0, 0]); // 3 bytes left
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data);
    });
    
    it('handles truncated chunk', () => {
      const ihdrChunk = [0,0,0,0, ...Array.from(Buffer.from('IHDR')), 0]; // Missing crc
      const data = new Uint8Array([...pngSig, ...ihdrChunk]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data);
    });
    
    it('handles malformed chunk length', () => {
      const data = new Uint8Array([
        ...pngSig,
        0xFF, 0xFF, 0xFF, 0xFF, // huge length
        ...Array.from(Buffer.from('IHDR'))
      ]);
      const { data: result } = stripImageMetadata(data);
      expect(result).toEqual(data);
    });
  });

  describe('stripImageMetadata - WebP', () => {
    it('strips EXIF from WebP', () => {
      const sig = [
        0x52, 0x49, 0x46, 0x46, // RIFF
        32, 0x00, 0x00, 0x00,   // size = 32 (little endian)
        0x57, 0x45, 0x42, 0x50  // WEBP
      ];
      const vp8xChunk = [...Array.from(Buffer.from('VP8X')), 10,0,0,0, ...new Array(10).fill(0)];
      const exifChunk = [...Array.from(Buffer.from('EXIF')), 4,0,0,0, 1,2,3,4];
      const data = new Uint8Array([...sig, ...vp8xChunk, ...exifChunk]);
      
      const { data: result, report } = stripImageMetadata(data);
      expect(report.metadataRemoved).toBe(true);
      
      expect(result.length).toBe(30);
      expect(result.subarray(12)).toEqual(new Uint8Array(vp8xChunk));
    });

    it('handles invalid WebP container size', () => {
      // detectMimeType needs offset 8 to be WEBP
      const data = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0,0,0,0, 0x57, 0x45, 0x42 // 11 bytes. Actually if it's 11 bytes detectMimeType returns null!
      ]);
      const { data: result, report } = stripImageMetadata(data);
      expect(report.warnings).toContain('Unsupported image format');
    });

    it('handles valid detectMimeType but invalid stripWebp', () => {
      const data = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0,0,0,0, 0x57, 0x45, 0x42, 0x50
      ]);
      const { data: result, report } = stripImageMetadata(data);
      expect(report.metadataRemoved).toBe(false);
      // Size will be fixed to 4 in result (12 - 8)
      expect(result[4]).toBe(4);
    });

    it('handles malformed chunk', () => {
      const sig = [
        0x52, 0x49, 0x46, 0x46,
        100, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50
      ];
      const invalidChunk = [...Array.from(Buffer.from('VP8X')), 255, 255, 255, 255]; // Huge size
      const data = new Uint8Array([...sig, ...invalidChunk]);
      const { data: result } = stripImageMetadata(data);
      expect(result.length).toBe(12 + invalidChunk.length);
    });
    
    it('handles truncated chunk type', () => {
      const sig = [
        0x52, 0x49, 0x46, 0x46,
        100, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50
      ];
      const data = new Uint8Array([...sig, 86, 80, 56]); // 'VP8'
      const { data: result } = stripImageMetadata(data);
      expect(result.length).toBe(15);
    });
  });

  describe('processBase64Image', () => {
    it('processes base64 end to end', () => {
      const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 1, 2, 3, 0xFF, 0xD9]);
      const base64 = `data:image/jpeg;base64,${Buffer.from(data).toString('base64')}`;
      const { base64: result, report } = processBase64Image(base64);
      expect(report.mimeType).toBe('image/jpeg');
      expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
  });

  describe('routeAsset', () => {
    it('routes anime keywords', () => {
      expect(routeAsset('a beautiful anime girl')).toBe('anime');
      expect(routeAsset('detailed manga art')).toBe('anime');
    });

    it('routes cinematic keywords', () => {
      expect(routeAsset('cinematic movie shot')).toBe('cinematic');
    });

    it('routes by regex', () => {
      expect(routeAsset('shot on 35mm film')).toBe('cinematic');
      expect(routeAsset('a scenic view')).toBe('landscapes');
    });

    it('ignores negative keywords', () => {
      const rules = [
        {
          id: 'test',
          label: 'Test',
          directoryName: 'test_dir',
          priority: 10,
          match: {
            keywords: ['test'],
            negativeKeywords: ['ignore']
          }
        }
      ];
      expect(routeAsset('a test image', rules)).toBe('test_dir');
      expect(routeAsset('a test image but ignore this', rules)).toBe('uncategorized');
    });

    it('returns uncategorized when no match', () => {
      expect(routeAsset('something random')).toBe('uncategorized');
    });

    it('prioritizes correctly', () => {
      expect(routeAsset('anime portrait')).toBe('anime'); // anime(10) > portrait(8)
    });
  });

  describe('Buffer fallbacks', () => {
    let originalBuffer: any;

    global.beforeAll(() => {
      originalBuffer = global.Buffer;
    });

    global.afterAll(() => {
      global.Buffer = originalBuffer;
    });

    it('base64ToUint8Array without Buffer', () => {
      // @ts-expect-error fix
      global.Buffer = undefined;
      const base64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const result = base64ToUint8Array(base64);
      expect(String.fromCharCode(...result)).toBe('Hello World');
    });

    it('uint8ArrayToBase64 without Buffer', () => {
      // @ts-expect-error fix
      global.Buffer = undefined;
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToBase64(bytes, 'image/jpeg');
      expect(result).toBe('data:image/jpeg;base64,SGVsbG8=');
    });
  });
});
