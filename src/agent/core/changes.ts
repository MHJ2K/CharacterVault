export type AgentChangeValueType = 'text' | 'json';

export interface AgentPendingChange {
  id: string;
  label: string;
  target: string;
  beforeText: string;
  afterText: string;
  valueType: AgentChangeValueType;
  destructive?: boolean;
}

export interface AgentChangeUpdate {
  id: string;
  afterText: string;
}

export interface AgentChangeIssue {
  change: AgentPendingChange;
  message: string;
}

export interface AgentCommitResult {
  applied: AgentPendingChange[];
  conflicts: AgentChangeIssue[];
  invalid: AgentChangeIssue[];
}

export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function cloneChangeValue<T>(value: T): T {
  return structuredClone(value);
}
