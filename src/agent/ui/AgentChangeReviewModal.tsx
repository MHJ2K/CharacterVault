import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, Pencil, RotateCcw, X } from 'lucide-react';
import type { AgentPendingChange } from '../core/changes';
import {
  diffForValue,
  type DiffSegment,
} from './textDiff';
import { AgentDiffEditor } from './AgentDiffEditor';

export interface AgentChangeReviewModalProps {
  changes: AgentPendingChange[];
  isSaving?: boolean;
  error?: string | null;
  onChange: (id: string, afterText: string) => void;
  onApprove: (selectedIds: ReadonlySet<string>) => void;
  /** Close the modal but keep the staged changes available for later. */
  onDismiss: () => void;
  /** Permanently throw the staged changes away. */
  onDiscard: () => void;
}

const ADDED_CLASS =
  'bg-success-soft text-success-soft-fg rounded-[2px] px-px';
const REMOVED_CLASS =
  'bg-danger-soft text-danger-soft-fg rounded-[2px] px-px line-through decoration-danger/60';

function DiffText({ segments }: { segments: DiffSegment[] }): ReactNode {
  return segments.map((segment, index) => {
    if (segment.kind === 'same') {
      return <React.Fragment key={index}>{segment.text}</React.Fragment>;
    }
    const className = segment.kind === 'added' ? ADDED_CLASS : REMOVED_CLASS;
    return (
      <span key={index} className={className}>
        {segment.text}
      </span>
    );
  });
}

const PANE_HEIGHT = 'h-80';

function EmptyPane({ label }: { label: string }): React.ReactElement {
  return (
    <div
      className={`flex ${PANE_HEIGHT} items-center justify-center rounded-lg border border-dashed border-border bg-bg px-3 py-2 text-center text-xs text-fg-subtle`}
    >
      {label}
    </div>
  );
}

interface ChangeCardProps {
  change: AgentPendingChange;
  draft: string;
  isOpen: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onToggleOpen: () => void;
  onToggleSelected: () => void;
  onEditDraft: (value: string) => void;
  onToggleEdit: () => void;
  onReset: () => void;
}

function ChangeCard({
  change,
  draft,
  isOpen,
  isSelected,
  isEditing,
  isSaving,
  onToggleOpen,
  onToggleSelected,
  onEditDraft,
  onToggleEdit,
  onReset,
}: ChangeCardProps): React.ReactElement {
  const mode = change.valueType === 'json' ? 'json' : 'text';
  const diff = useMemo(
    () => diffForValue(change.beforeText, draft, mode),
    [change.beforeText, draft, mode],
  );
  const changedFromProposal = draft !== change.afterText;
  const hasBefore = change.beforeText.length > 0;
  const jsonHint = mode === 'json';

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          disabled={isSaving}
          aria-label={`Approve ${change.label}`}
          className="h-3.5 w-3.5 shrink-0 rounded border-border-strong text-accent focus:ring-accent"
        />
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate text-xs font-semibold text-fg">{change.label}</span>
          {change.destructive ? (
            <span className="shrink-0 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-danger-soft-fg">
              Destructive
            </span>
          ) : null}
          {changedFromProposal && !isEditing ? (
            <span className="shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success-soft-fg">
              Edited
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {changedFromProposal ? (
            <button
              type="button"
              onClick={onReset}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40"
              title="Reset to the agent's original proposal"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={isSaving}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft disabled:opacity-40"
            title={
              isEditing
                ? 'Back to the read-only diff'
                : 'Edit the planned text (changes stay highlighted)'
            }
          >
            <Pencil className="h-3 w-3" />
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              Current
            </p>
            {hasBefore ? (
              <pre
                className={`${PANE_HEIGHT} overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs leading-5 text-fg-muted`}
              >
                <DiffText segments={diff.left} />
              </pre>
            ) : (
              <EmptyPane label="(does not exist)" />
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                {isEditing
                  ? 'Planned · editing — additions stay highlighted'
                  : 'Planned · changes highlighted'}
              </p>
              <span className="text-[10px] text-fg-subtle">
                {jsonHint ? 'JSON' : 'Text'}
              </span>
            </div>
            {isEditing ? (
              <div
                className={`${PANE_HEIGHT} overflow-hidden rounded-lg border border-accent/40 bg-bg`}
              >
                <AgentDiffEditor
                  value={draft}
                  beforeText={change.beforeText}
                  mode={mode}
                  disabled={isSaving}
                  onChange={onEditDraft}
                />
              </div>
            ) : draft.length === 0 ? (
              <EmptyPane label="(empty — this will be removed)" />
            ) : (
              <pre
                className={`${PANE_HEIGHT} overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs leading-5 text-fg-muted`}
              >
                <DiffText segments={diff.right} />
              </pre>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AgentChangeReviewModal({
  changes,
  isSaving = false,
  error,
  onChange,
  onApprove,
  onDismiss,
  onDiscard,
}: AgentChangeReviewModalProps): React.ReactElement {
  const [selected, setSelected] = useState(() => new Set(changes.map((change) => change.id)));
  const [expanded, setExpanded] = useState(() => new Set(changes.map((change) => change.id)));
  const [editing, setEditing] = useState(() => new Set<string>());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [drafts, setDrafts] = useState(
    () => new Map(changes.map((change) => [change.id, change.afterText])),
  );

  const selectedCount = selected.size;
  const allSelected = selectedCount === changes.length && changes.length > 0;
  const totalLabel = `${changes.length} proposed change${changes.length === 1 ? '' : 's'}`;

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEditing = (id: string) => {
    setEditing((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateDraft = (id: string, value: string) => {
    setDrafts((previous) => new Map(previous).set(id, value));
    onChange(id, value);
  };

  const resetDraft = (change: AgentPendingChange) => {
    setDrafts((previous) => new Map(previous).set(change.id, change.afterText));
    onChange(change.id, change.afterText);
  };

  useEffect(() => {
    if (isSaving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          onDismiss();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDiscard, isSaving, onDismiss]);

  const modal = (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center bg-overlay p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={(event) => {
        if (!isSaving && event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-change-review-title"
        className="flex max-h-[min(92dvh,64rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-scale-in"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 md:px-6">
          <div className="min-w-0">
            <h2
              id="agent-change-review-title"
              className="text-lg font-semibold text-fg"
            >
              Review Agent changes
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Nothing has been saved yet. Compare the highlighted changes, edit the
              planned text if you like, then approve what you want to apply.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSaving}
            className="shrink-0 rounded-lg p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
            aria-label="Close review (keep changes)"
            title="Close — the proposed changes stay available for later"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 md:px-6">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-muted">
            <span className="font-medium text-fg">{totalLabel}</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-success-soft" />
              added
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-danger-soft" />
              removed
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setSelected(
                allSelected ? new Set() : new Set(changes.map((change) => change.id)),
              )
            }
            className="text-xs text-accent transition-colors hover:underline"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {error ? (
          <div className="mx-4 mt-3 shrink-0 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-soft-fg md:mx-6">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 md:p-6">
          {changes.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              draft={drafts.get(change.id) ?? change.afterText}
              isOpen={expanded.has(change.id)}
              isSelected={selected.has(change.id)}
              isEditing={editing.has(change.id)}
              isSaving={isSaving}
              onToggleOpen={() => toggleExpanded(change.id)}
              onToggleSelected={() => toggleSelected(change.id)}
              onEditDraft={(value) => updateDraft(change.id, value)}
              onToggleEdit={() => toggleEditing(change.id)}
              onReset={() => resetDraft(change)}
            />
          ))}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            disabled={isSaving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-danger-soft-fg transition-colors hover:bg-danger-soft disabled:opacity-40"
            title="Permanently throw away the staged changes"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={() => onApprove(selected)}
            disabled={isSaving || selectedCount === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            {isSaving
              ? 'Applying…'
              : `Approve ${selectedCount} change${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );

  const confirmOverlay = (
    <div
      className="fixed inset-0 z-130 flex items-center justify-center bg-overlay p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={(event) => {
        if (!isSaving && event.target === event.currentTarget) setConfirmDiscard(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="agent-change-discard-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl animate-scale-in"
      >
        <h3 id="agent-change-discard-title" className="text-base font-semibold text-fg">
          Discard {changes.length} proposed change{changes.length === 1 ? '' : 's'}?
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          Nothing has been saved yet. Discarding permanently throws away the Agent&apos;s
          proposed changes.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDiscard(false)}
            disabled={isSaving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            Keep reviewing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modal}
      {confirmDiscard ? confirmOverlay : null}
    </>,
    document.body,
  );
}
