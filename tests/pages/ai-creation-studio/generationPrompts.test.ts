import { describe, expect, it } from 'vitest';
import {
  buildDescriptionPrompt,
  buildNamePrompt,
  renderStudioPrompt,
} from '../../../src/pages/ai-creation-studio/generationPrompts';
import {
  DEFAULT_STUDIO_GENERATION_SETTINGS,
  cloneStudioGenerationSettings,
} from '../../../src/pages/ai-creation-studio/studioGenerationDefaults';

describe('AI Studio generation prompts', () => {
  it('replaces every supported custom prompt placeholder', () => {
    const prompt = renderStudioPrompt('${concept}|${name}|${description}|${style}|${narrationFormat}', {
      concept: 'A lighthouse keeper',
      name: 'Mara',
      description: 'Keeps the forbidden light burning.',
      style: 'Use present tense.',
      narrationFormat: 'Use third person.',
    });

    expect(prompt).toBe(
      'A lighthouse keeper|Mara|Keeps the forbidden light burning.|Use present tense.|Use third person.'
    );
  });

  it('keeps the bundled name prompt compatible with the previous output', () => {
    const prompt = buildNamePrompt('A clockwork detective');

    expect(prompt).toContain('A clockwork detective');
    expect(prompt).toContain('output that name exactly and nothing else');
    expect(prompt).not.toContain('${concept}');
  });

  it('uses description-specific style instructions for the bundled description prompt', () => {
    const prompt = buildDescriptionPrompt('A haunted lighthouse keeper', 'Mara', 'third_person', 'past_tense');

    expect(prompt).toContain('third-person omniscient style');
    expect(prompt).toContain('Use past tense throughout.');
    expect(prompt).toContain('Descriptions are character-card reference material');
  });

  it('deep clones generation settings', () => {
    const clone = cloneStudioGenerationSettings();
    clone.fields[0].label = 'Changed';
    clone.fields[0].prompt = 'Custom';

    expect(DEFAULT_STUDIO_GENERATION_SETTINGS.fields[0].label).toBe('Name');
    expect(DEFAULT_STUDIO_GENERATION_SETTINGS.fields[0].prompt).not.toBe('Custom');
  });
});
