import { describe, expect, it } from 'vitest';
import { hasAtLeastOneTag } from '../../../src/pages/ai-creation-studio/inputState';

describe('AI Studio input state', () => {
  it('requires at least one non-whitespace tag', () => {
    expect(hasAtLeastOneTag('Dwarven')).toBe(true);
    expect(hasAtLeastOneTag(' Dwarven, blacksmith ')).toBe(true);
    expect(hasAtLeastOneTag('')).toBe(false);
    expect(hasAtLeastOneTag('   ')).toBe(false);
  });
});
