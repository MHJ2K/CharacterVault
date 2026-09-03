import { describe, expect, it } from 'vitest';
import { TAG_CATEGORIES } from '../../../src/pages/ai-creation-studio/tags/tagData';

describe('AI Studio tag taxonomy', () => {
  it('includes the bundled Source group', () => {
    const source = TAG_CATEGORIES.find((category) => category.key === 'source');

    expect(source?.label).toBe('Source');
    expect(source?.tags).toContain('original_character');
    expect(source?.tags).toContain('video_game_character');
  });
});
