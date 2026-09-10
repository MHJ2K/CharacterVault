import { describe, expect, it } from 'vitest';
import {
  getGenerationTags,
  hasRequiredGenerationTags,
  TAG_CATEGORIES,
  toggleGenerationTagSelection,
} from '../../../src/pages/ai-creation-studio/tags/tagData';

describe('AI Studio tag taxonomy', () => {
  it('requires exactly one card type alongside perspective and tense', () => {
    const generation = ['character_card', 'third_person', 'present_tense'];
    expect(hasRequiredGenerationTags({ generation })).toBe(true);
    expect(getGenerationTags({ generation }).cardType).toBe('character_card');

    const worldGeneration = toggleGenerationTagSelection(generation, 'world_setting_card');
    expect(worldGeneration).not.toContain('character_card');
    expect(getGenerationTags({ generation: worldGeneration }).cardType).toBe('world_setting_card');
    expect(hasRequiredGenerationTags({ generation: ['third_person', 'present_tense'] })).toBe(false);
  });

  it('includes the bundled Source group', () => {
    const source = TAG_CATEGORIES.find((category) => category.key === 'source');

    expect(source?.label).toBe('Source');
    expect(source?.tags).toContain('original_character');
    expect(source?.tags).toContain('video_game_character');
  });
});
