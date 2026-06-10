import { describe, expect, it } from 'vitest';
import { readBoundedJsonFile } from './file-reader';

describe('readBoundedJsonFile helper', () => {
  it('successfully parses valid JSON file under size limit', async () => {
    const data = { foo: 'bar' };
    const file = new File([JSON.stringify(data)], 'test.json', { type: 'application/json' });
    const result = await readBoundedJsonFile<typeof data>(file, { maxBytes: 1024 });
    expect(result).toEqual(data);
  });

  it('rejects files exceeding maxBytes size limit', async () => {
    const data = { data: 'a'.repeat(2000) };
    const file = new File([JSON.stringify(data)], 'large.json', { type: 'application/json' });
    
    await expect(readBoundedJsonFile(file, { maxBytes: 1000 })).rejects.toThrow(
      /exceeds the limit/
    );
  });

  it('rejects non-JSON files', async () => {
    const file = new File(['plain text'], 'test.txt', { type: 'text/plain' });
    await expect(readBoundedJsonFile(file, { maxBytes: 1000 })).rejects.toThrow(
      /Only JSON files are accepted/
    );
  });

  it('rejects invalid JSON content', async () => {
    const file = new File(['{invalid'], 'test.json', { type: 'application/json' });
    await expect(readBoundedJsonFile(file, { maxBytes: 1000 })).rejects.toThrow(
      /Invalid JSON format/
    );
  });

  it('enforces maxItems count for array JSON', async () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const file = new File([JSON.stringify(data)], 'test.json', { type: 'application/json' });
    
    // Within limits
    const result = await readBoundedJsonFile<any[]>(file, { maxBytes: 1000, maxItems: 5 });
    expect(result).toEqual(data);

    // Over limits
    await expect(readBoundedJsonFile(file, { maxBytes: 1000, maxItems: 2 })).rejects.toThrow(
      /Import contains too many items/
    );
  });

  it('enforces maxItems count for object JSON with itemKey', async () => {
    const data = {
      prompts: [{ id: 1 }, { id: 2 }, { id: 3 }]
    };
    const file = new File([JSON.stringify(data)], 'test.json', { type: 'application/json' });
    
    // Within limits
    const result = await readBoundedJsonFile<any>(file, { maxBytes: 1000, maxItems: 5, itemKey: 'prompts' });
    expect(result).toEqual(data);

    // Over limits
    await expect(readBoundedJsonFile(file, { maxBytes: 1000, maxItems: 2, itemKey: 'prompts' })).rejects.toThrow(
      /Import contains too many items/
    );
  });
});
