// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./veniceClient', () => ({ veniceFetch: vi.fn() }));

import { refreshModels } from './modelService';
import { veniceFetch } from './veniceClient';

const dispatch = vi.fn();
beforeEach(() => { localStorage.clear(); dispatch.mockReset(); vi.mocked(veniceFetch).mockReset(); });

describe('modelService cache behavior', () => {
  it('returns fresh cache without fetch', async () => {
    localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: { text: [{id:'a'}] }, fetchedAt: Date.now() }));
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_MODELS', fallback: false }));
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  it('dispatches stale cache then refreshes', async () => {
    localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: { text: [{id:'a'}] }, fetchedAt: Date.now()-9999999 }));
    vi.mocked(veniceFetch).mockResolvedValue({ data: { data:[{id:'x',type:'text',name:'x'}] } } as any);
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalled();
    expect(veniceFetch).toHaveBeenCalled();
  });
});
