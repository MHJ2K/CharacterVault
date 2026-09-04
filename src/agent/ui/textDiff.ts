export type DiffSegmentKind = 'same' | 'added' | 'removed';

export interface DiffSegment {
  kind: DiffSegmentKind;
  text: string;
}

const LCS_CELL_LIMIT = 1_500_000;
const REFINE_SIMILARITY_MIN = 0.4;

function lcsRegion(
  left: string[],
  right: string[],
  leftMatched: boolean[],
  rightMatched: boolean[],
  loL: number,
  hiL: number,
  loR: number,
  hiR: number,
): void {
  const n = hiL - loL;
  const m = hiR - loR;
  if (n <= 0 || m <= 0) return;
  const cols = m + 1;
  const dp = new Uint32Array((n + 1) * cols);
  for (let i = 1; i <= n; i += 1) {
    const row = i * cols;
    const prev = (i - 1) * cols;
    for (let j = 1; j <= m; j += 1) {
      const diag = dp[prev + j - 1];
      const up = dp[prev + j];
      const leftCell = dp[row + j - 1];
      dp[row + j] =
        left[loL + i - 1] === right[loR + j - 1]
          ? diag + 1
          : up >= leftCell
            ? up
            : leftCell;
    }
  }
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const prev = (i - 1) * cols;
    if (left[loL + i - 1] === right[loR + j - 1]) {
      leftMatched[loL + i - 1] = true;
      rightMatched[loR + j - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[prev + j] >= dp[i * cols + j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
}

interface Anchor {
  l: number;
  r: number;
}

function regionAlign(
  left: string[],
  right: string[],
  leftMatched: boolean[],
  rightMatched: boolean[],
  loL: number,
  hiL: number,
  loR: number,
  hiR: number,
): void {
  const n = hiL - loL;
  const m = hiR - loR;
  if (n <= 0 || m <= 0) return;

  if (n * m <= LCS_CELL_LIMIT) {
    lcsRegion(left, right, leftMatched, rightMatched, loL, hiL, loR, hiR);
    return;
  }

  // Over the DP budget: anchor on tokens that occur exactly once in both
  // regions (patience-diff style) so a localized change in a very long text
  // never paints the whole span as changed.
  const leftCounts = new Map<string, number>();
  const leftIndex = new Map<string, number>();
  for (let i = loL; i < hiL; i += 1) {
    const token = left[i];
    const count = leftCounts.get(token) ?? 0;
    leftCounts.set(token, count + 1);
    leftIndex.set(token, i);
  }
  const rightCounts = new Map<string, number>();
  const rightIndex = new Map<string, number>();
  for (let j = loR; j < hiR; j += 1) {
    const token = right[j];
    const count = rightCounts.get(token) ?? 0;
    rightCounts.set(token, count + 1);
    rightIndex.set(token, j);
  }

  const anchors: Anchor[] = [];
  for (let i = loL; i < hiL; i += 1) {
    const token = left[i];
    if ((leftCounts.get(token) ?? 0) !== 1) continue;
    if ((rightCounts.get(token) ?? 0) !== 1) continue;
    const r = rightIndex.get(token);
    if (r === undefined || r < loR || r >= hiR) continue;
    if (anchors.length === 0 || r > anchors[anchors.length - 1].r) {
      anchors.push({ l: i, r });
    }
  }

  if (anchors.length === 0) {
    // No reliable anchors (e.g. a fully rewritten span): leave the region
    // unmatched so every token reads as changed, which is accurate here.
    return;
  }

  let prevL = loL;
  let prevR = loR;
  for (const anchor of anchors) {
    leftMatched[anchor.l] = true;
    rightMatched[anchor.r] = true;
    regionAlign(left, right, leftMatched, rightMatched, prevL, anchor.l, prevR, anchor.r);
    prevL = anchor.l + 1;
    prevR = anchor.r + 1;
  }
  regionAlign(left, right, leftMatched, rightMatched, prevL, hiL, prevR, hiR);
}

function alignIndexes(left: string[], right: string[]): {
  leftMatched: boolean[];
  rightMatched: boolean[];
} {
  const n = left.length;
  const m = right.length;
  const leftMatched = new Array<boolean>(n).fill(false);
  const rightMatched = new Array<boolean>(m).fill(false);
  if (n === 0 || m === 0) return { leftMatched, rightMatched };

  let prefix = 0;
  while (prefix < n && prefix < m && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < n - prefix
    && suffix < m - prefix
    && left[n - 1 - suffix] === right[m - 1 - suffix]
  ) {
    suffix += 1;
  }
  for (let i = 0; i < prefix; i += 1) {
    leftMatched[i] = true;
    rightMatched[i] = true;
  }
  for (let i = 0; i < suffix; i += 1) {
    leftMatched[n - 1 - i] = true;
    rightMatched[m - 1 - i] = true;
  }
  regionAlign(left, right, leftMatched, rightMatched, prefix, n - suffix, prefix, m - suffix);
  return { leftMatched, rightMatched };
}

function tokenizeWhitespace(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

function countMatched(matched: boolean[]): number {
  let count = 0;
  for (const isMatched of matched) {
    if (isMatched) count += 1;
  }
  return count;
}

interface WordDiffResult {
  left: DiffSegment[];
  right: DiffSegment[];
  similarity: number;
}

/** Word-level alignment; whitespace-only runs are never marked as changes. */
function wordDiffDetailed(before: string, after: string): WordDiffResult {
  const leftTokens = tokenizeWhitespace(before);
  const rightTokens = tokenizeWhitespace(after);
  const { leftMatched, rightMatched } = alignIndexes(leftTokens, rightTokens);

  const whiteOnly = (token: string) => /^\s+$/.test(token);
  const leftSegments: DiffSegment[] = [];
  const rightSegments: DiffSegment[] = [];

  const appendSegment = (
    segments: DiffSegment[],
    kind: DiffSegmentKind,
    text: string,
  ) => {
    if (text.length === 0) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.kind === kind) {
      previous.text += text;
    } else {
      segments.push({ kind, text });
    }
  };

  for (let i = 0; i < leftTokens.length; i += 1) {
    const kind = !leftMatched[i] && !whiteOnly(leftTokens[i]) ? 'removed' : 'same';
    appendSegment(leftSegments, kind, leftTokens[i]);
  }
  for (let i = 0; i < rightTokens.length; i += 1) {
    const kind = !rightMatched[i] && !whiteOnly(rightTokens[i]) ? 'added' : 'same';
    appendSegment(rightSegments, kind, rightTokens[i]);
  }

  const matchedTotal = countMatched(leftMatched) + countMatched(rightMatched);
  const totalTokens = leftTokens.length + rightTokens.length;
  const similarity = totalTokens === 0 ? 1 : matchedTotal / totalTokens;
  return { left: leftSegments, right: rightSegments, similarity };
}

/** Word-level diff for prose values; whitespace-only runs are never marked. */
export function diffWords(before: string, after: string): {
  left: DiffSegment[];
  right: DiffSegment[];
} {
  const { left, right } = wordDiffDetailed(before, after);
  return { left, right };
}

function splitLinesKeepEnds(text: string): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let rest = text;
  for (;;) {
    const newline = rest.indexOf('\n');
    if (newline === -1) {
      if (rest.length > 0) lines.push(rest);
      break;
    }
    lines.push(rest.slice(0, newline + 1));
    rest = rest.slice(newline + 1);
    if (rest.length === 0) break;
  }
  return lines;
}

function appendSegment(
  segments: DiffSegment[],
  kind: DiffSegmentKind,
  text: string,
): void {
  if (text.length === 0) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.kind === kind) {
    previous.text += text;
  } else {
    segments.push({ kind, text });
  }
}

/**
 * Line-level diff for JSON values. When a removed/added line pair is largely
 * the same text (one JSON token changed inside an otherwise identical line),
 * the pair is refined word-by-word so only the changed fragment lights up
 * instead of the whole line.
 */
export function diffLines(before: string, after: string): {
  left: DiffSegment[];
  right: DiffSegment[];
} {
  const left = splitLinesKeepEnds(before);
  const right = splitLinesKeepEnds(after);
  const { leftMatched, rightMatched } = alignIndexes(left, right);

  const leftSegments: DiffSegment[] = [];
  const rightSegments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  const nL = left.length;
  const nR = right.length;

  while (i < nL || j < nR) {
    if (i < nL && j < nR && leftMatched[i] && rightMatched[j]) {
      appendSegment(leftSegments, 'same', left[i]);
      appendSegment(rightSegments, 'same', right[j]);
      i += 1;
      j += 1;
      continue;
    }

    const removed: number[] = [];
    const added: number[] = [];
    while (i < nL || j < nR) {
      if (i < nL && j < nR && leftMatched[i] && rightMatched[j]) break;
      if (i < nL && !leftMatched[i]) {
        removed.push(i);
        i += 1;
      } else if (j < nR && !rightMatched[j]) {
        added.push(j);
        j += 1;
      } else if (i < nL) {
        i += 1;
      } else {
        j += 1;
      }
    }

    if (removed.length > 0 && removed.length === added.length) {
      for (let k = 0; k < removed.length; k += 1) {
        const beforeLine = left[removed[k]];
        const afterLine = right[added[k]];
        if (beforeLine === afterLine) {
          appendSegment(leftSegments, 'same', beforeLine);
          appendSegment(rightSegments, 'same', afterLine);
          continue;
        }
        const refined = wordDiffDetailed(beforeLine, afterLine);
        if (refined.similarity >= REFINE_SIMILARITY_MIN) {
          for (const segment of refined.left) {
            appendSegment(
              leftSegments,
              segment.kind === 'same' ? 'same' : 'removed',
              segment.text,
            );
          }
          for (const segment of refined.right) {
            appendSegment(
              rightSegments,
              segment.kind === 'same' ? 'same' : 'added',
              segment.text,
            );
          }
        } else {
          appendSegment(leftSegments, 'removed', beforeLine);
          appendSegment(rightSegments, 'added', afterLine);
        }
      }
    } else {
      for (const index of removed) appendSegment(leftSegments, 'removed', left[index]);
      for (const index of added) appendSegment(rightSegments, 'added', right[index]);
    }
  }

  return { left: leftSegments, right: rightSegments };
}

export type AgentDiffMode = 'text' | 'json';

export function diffForValue(
  beforeText: string,
  afterText: string,
  mode: AgentDiffMode,
): { left: DiffSegment[]; right: DiffSegment[] } {
  return mode === 'json'
    ? diffLines(beforeText, afterText)
    : diffWords(beforeText, afterText);
}

/**
 * Character offsets (into `afterText`) of the added spans, for editors that
 * highlight the new text in place. Segment output always tiles `afterText`
 * exactly, so cumulative lengths map cleanly to offsets.
 */
export function addedRanges(
  beforeText: string,
  afterText: string,
  mode: AgentDiffMode,
): Array<{ from: number; to: number }> {
  const { right } = diffForValue(beforeText, afterText, mode);
  const ranges: Array<{ from: number; to: number }> = [];
  let offset = 0;
  for (const segment of right) {
    const from = offset;
    offset += segment.text.length;
    if (segment.kind === 'added' && offset > from) {
      ranges.push({ from, to: offset });
    }
  }
  return ranges;
}
