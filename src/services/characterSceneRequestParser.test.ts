import { describe, it, expect } from 'vitest';
import { parseCharacterSceneRequest } from './characterSceneRequestParser';

describe('parseCharacterSceneRequest', () => {
  it('accepts a valid marker and strips it from display text', () => {
    const text = 'Let me paint that. <venice_forge_scene_request>{"intent":"create_scene","focus":"sunset picnic"}</venice_forge_scene_request> Enjoy!';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toEqual({ intent: 'create_scene', focus: 'sunset picnic' });
    expect(result.displayText).not.toContain('<venice_forge_scene_request>');
    expect(result.displayText).toContain('Let me paint that');
    expect(result.displayText).toContain('Enjoy!');
  });

  it('validates aspect_ratio allowlist', () => {
    const text = '<venice_forge_scene_request>{"intent":"create_scene","aspect_ratio":"16:9"}</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toEqual({ intent: 'create_scene', aspect_ratio: '16:9' });
  });

  it('rejects invalid aspect_ratio', () => {
    const text = '<venice_forge_scene_request>{"intent":"create_scene","aspect_ratio":"99:1"}</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
  });

  it('rejects multiple markers', () => {
    const text = '<venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request> and <venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
    expect(result.displayText).not.toContain('<venice_forge_scene_request>');
  });

  it('rejects malformed JSON', () => {
    const text = '<venice_forge_scene_request>not json</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
    expect(result.displayText).not.toContain('<venice_forge_scene_request>');
  });

  it('rejects wrong intent', () => {
    const text = '<venice_forge_scene_request>{"intent":"do_something"}</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
  });

  it('returns original text when no marker present', () => {
    const text = 'Just normal assistant text.';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
    expect(result.displayText).toBe(text);
  });

  it('caps focus length', () => {
    const focus = 'a'.repeat(1001);
    const text = `<venice_forge_scene_request>{"intent":"create_scene","focus":"${focus}"}</venice_forge_scene_request>`;
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
  });
});
