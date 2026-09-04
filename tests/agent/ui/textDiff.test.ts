import { describe, expect, it } from 'vitest';
import {
  addedRanges,
  diffForValue,
  diffLines,
  diffWords,
} from '../../../src/agent/ui/textDiff';

const text = (segments: Array<{ kind: string; text: string }>) =>
  segments.map((segment) => `${segment.kind}:${segment.text}`);

describe('diffWords', () => {
  it('marks a single substituted word as removed and added', () => {
    const { left, right } = diffWords(
      'A quiet cartographer.',
      'A careful cartographer.',
    );
    expect(left.find((segment) => segment.kind === 'removed')?.text).toBe('quiet');
    expect(right.find((segment) => segment.kind === 'added')?.text).toBe('careful');
  });

  it('keeps unchanged prose out of the removed/added segments', () => {
    const { left, right } = diffWords('Same start. Same end.', 'Same start. Same end.');
    expect(left.every((segment) => segment.kind === 'same')).toBe(true);
    expect(right.every((segment) => segment.kind === 'same')).toBe(true);
  });

  it('marks a whole insertion as added without touching the original', () => {
    const { left, right } = diffWords('Hello.', 'Hello. How are you?');
    expect(left.every((segment) => segment.kind === 'same')).toBe(true);
    const added = right.filter((segment) => segment.kind === 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.map((segment) => segment.text).join(' ')).toContain('How are you?');
  });

  it('treats whitespace-only runs as context, never as highlights', () => {
    const { left, right } = diffWords('alpha beta', 'alpha gamma');
    const whiteInLeft = left.find((segment) => segment.kind !== 'same' && /^\s+$/.test(segment.text));
    const whiteInRight = right.find((segment) => segment.kind !== 'same' && /^\s+$/.test(segment.text));
    expect(whiteInLeft).toBeUndefined();
    expect(whiteInRight).toBeUndefined();
  });

  it('does not paint a whole long text when only a few words changed', () => {
    const words = Array.from({ length: 1600 }, (_, index) => `w${index}`);
    const before = words.join(' ');
    const after = words
      .map((word, index) => (index === 500 ? 'CHANGED1' : index === 1500 ? 'CHANGED2' : word))
      .join(' ');
    const { left, right } = diffWords(before, after);
    const removed = new Set(
      left.filter((segment) => segment.kind === 'removed').map((segment) => segment.text),
    );
    const added = new Set(
      right.filter((segment) => segment.kind === 'added').map((segment) => segment.text),
    );
    expect(removed).toEqual(new Set(['w500', 'w1500']));
    expect(added).toEqual(new Set(['CHANGED1', 'CHANGED2']));
    const sameText = left
      .filter((segment) => segment.kind === 'same')
      .map((segment) => segment.text)
      .join('');
    expect(sameText).toContain('w700');
    expect(sameText).toContain('w1499');
  });
});

describe('diffLines', () => {
  it('refines a changed JSON line down to the changed token', () => {
    const before = '{\n  "name": "Aria",\n  "scan_depth": 1\n}';
    const after = '{\n  "name": "Aria",\n  "scan_depth": 4\n}';
    const { left, right } = diffLines(before, after);
    const removed = left.filter((segment) => segment.kind === 'removed');
    const added = right.filter((segment) => segment.kind === 'added');
    expect(removed.map((segment) => segment.text)).toEqual(['1']);
    expect(added.map((segment) => segment.text)).toEqual(['4']);
    expect(left.some((segment) => segment.kind === 'same' && segment.text.includes('"name"'))).toBe(true);
    expect(left.some((segment) => segment.kind === 'same' && segment.text.includes('"scan_depth"'))).toBe(true);
  });

  it('refines a word change inside a long single-line JSON value', () => {
    const before = '  "content": "The old sentence lives here with many words.",\n';
    const after = '  "content": "The NEW sentence lives here with many words.",\n';
    const { left, right } = diffLines(before, after);
    const removed = left.filter((segment) => segment.kind === 'removed');
    const added = right.filter((segment) => segment.kind === 'added');
    expect(removed.map((segment) => segment.text)).toEqual(['old']);
    expect(added.map((segment) => segment.text)).toEqual(['NEW']);
    expect(left.some((segment) => segment.kind === 'same' && segment.text.includes('sentence lives'))).toBe(true);
  });

  it('keeps whole-line marks when a replaced line shares almost nothing', () => {
    const { left, right } = diffLines('aaa\n', 'bbbb cccc\n');
    expect(left.find((segment) => segment.kind === 'removed')?.text).toBe('aaa\n');
    expect(right.find((segment) => segment.kind === 'added')?.text).toBe('bbbb cccc\n');
  });

  it('reports an added entry block line by line', () => {
    const { left, right } = diffLines('', '{\n  "id": 0\n}');
    expect(left).toHaveLength(0);
    const added = right.filter((segment) => segment.kind === 'added');
    expect(added.map((segment) => segment.text).join('')).toBe('{\n  "id": 0\n}');
  });

  it('tiles both texts exactly even when refinement is applied', () => {
    const before = '{\n  "name": "Aria",\n  "content": "The old sentence lives here.",\n  "scan_depth": 1\n}';
    const after = '{\n  "name": "Aria",\n  "content": "The NEW sentence lives here.",\n  "scan_depth": 4\n}';
    const { left, right } = diffLines(before, after);
    expect(left.map((segment) => segment.text).join('')).toBe(before);
    expect(right.map((segment) => segment.text).join('')).toBe(after);
  });
});

describe('diffForValue', () => {
  it('routes text to word diff and json to line diff', () => {
    const textResult = diffForValue('one two', 'one three', 'text');
    expect(text(textResult.left)).toBeDefined();
    const removed = textResult.left.find((segment) => segment.kind === 'removed');
    expect(removed?.text).toBe('two');
    const jsonResult = diffForValue('one\ntwo', 'one\nthree', 'json');
    const jsonRemoved = jsonResult.left.find((segment) => segment.kind === 'removed');
    expect(jsonRemoved?.text).toBe('two');
  });
});

describe('addedRanges', () => {
  it('returns offsets of added words in the after text', () => {
    const before = 'A quiet cartographer.';
    const after = 'A careful quiet cartographer.';
    const ranges = addedRanges(before, after, 'text');
    expect(ranges.length).toBeGreaterThan(0);
    const slices = ranges.map(({ from, to }) => after.slice(from, to));
    expect(slices.join('')).toContain('careful');
  });

  it('maps a refined JSON change to the changed token only', () => {
    const before = '{\n  "scan_depth": 1\n}';
    const after = '{\n  "scan_depth": 4\n}';
    const ranges = addedRanges(before, after, 'json');
    const slices = ranges.map(({ from, to }) => after.slice(from, to)).join('');
    expect(slices).toBe('4');
  });

  it('covers every added character without overlap', () => {
    const before = 'one two three';
    const after = 'one two three four five';
    const ranges = addedRanges(before, after, 'text');
    const slices = ranges.map(({ from, to }) => after.slice(from, to)).join('');
    expect(slices).toBe('fourfive');
    const covered = new Set<string>();
    for (const { from, to } of ranges) {
      for (let i = from; i < to; i += 1) covered.add(String(i));
    }
    const count = ranges.reduce((sum, { from, to }) => sum + to - from, 0);
    expect(count).toBe(covered.size);
  });
});
