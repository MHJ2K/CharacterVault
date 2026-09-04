import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../src/db/characterTypes';

const { createCharacter } = vi.hoisted(() => ({
  createCharacter: vi.fn(),
}));

vi.mock('../../src/db/CharacterDatabase', () => ({
  characterDb: { createCharacter },
}));

import { CharacterImportService } from '../../src/services/CharacterImportService';

function makeCreatedCharacter(input: { name: string; data?: Character['data'] }): Character {
  return {
    id: 'char-1',
    name: input.name,
    imageData: '',
    thumbnailData: '',
    version: 1,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    data: input.data ?? {
      spec: {
        name: input.name,
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        physical_description: '',
      },
    },
  };
}

describe('CharacterImportService V3 card fields', () => {
  beforeEach(() => {
    createCharacter.mockReset();
    createCharacter.mockImplementation(async (input) => makeCreatedCharacter(input));
  });

  it('preserves physical_description from a nested V3 JSON card', async () => {
    const service = new CharacterImportService();
    const file = new File(
      [JSON.stringify({
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          name: 'Aria',
          description: 'A courier',
          personality: 'Brave',
          scenario: '',
          first_mes: 'Hello.',
          mes_example: '',
          system_prompt: '',
          post_history_instructions: '',
          alternate_greetings: [],
          physical_description: 'Short silver hair and a scar over her left eyebrow.',
          extensions: {},
        },
      })],
      'aria.json',
      { type: 'application/json' },
    );

    const result = await service.importFromFile(file);

    expect(result.success).toBe(true);
    expect(createCharacter).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        spec: expect.objectContaining({
          physical_description: 'Short silver hair and a scar over her left eyebrow.',
        }),
      }),
    }));
  });
});
