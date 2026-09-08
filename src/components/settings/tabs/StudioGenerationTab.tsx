import React, { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Wand2 } from 'lucide-react';
import type { StudioGenerationField, StudioGenerationFieldConfig } from '../../../db/characterTypes';
import { DEFAULT_STUDIO_GENERATION_SETTINGS } from '../../../pages/ai-creation-studio/studioGenerationDefaults';
import { SettingsCard } from '../components/SettingsCard';
import type { SettingsTabProps } from '../types';

const FIELD_PLACEHOLDERS = '${concept}, ${name}, ${description}, ${style}, ${narrationFormat}';
const CHARACTER_INFO_PLACEHOLDERS = '${tags}, ${characterInfo}';

export const StudioGenerationTab: React.FC<SettingsTabProps> = ({ draft, setDraft }) => {
  const [expanded, setExpanded] = useState<Set<StudioGenerationField>>(new Set());
  const fields = draft.studioGeneration.fields;

  const update = (generation: typeof draft.studioGeneration) =>
    setDraft((previous) => ({ ...previous, studioGeneration: generation }));

  const updateField = (key: StudioGenerationField, changes: Partial<StudioGenerationFieldConfig>) => {
    update({
      ...draft.studioGeneration,
      fields: fields.map((field) => (field.key === key ? { ...field, ...changes } : field)),
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fields.length) return;
    const next = [...fields];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update({ ...draft.studioGeneration, fields: next });
  };

  const reset = () => update({
    systemPrompt: DEFAULT_STUDIO_GENERATION_SETTINGS.systemPrompt,
    characterInfoGeneratePrompt: DEFAULT_STUDIO_GENERATION_SETTINGS.characterInfoGeneratePrompt,
    characterInfoImprovePrompt: DEFAULT_STUDIO_GENERATION_SETTINGS.characterInfoImprovePrompt,
    fields: DEFAULT_STUDIO_GENERATION_SETTINGS.fields.map((field) => ({ ...field })),
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-fg">AI Studio Generation</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Choose which card fields are generated, set their order and labels, and customize the prompts sent to your AI provider.
        </p>
      </div>

      <SettingsCard title="System prompt" icon={<Wand2 className="h-4 w-4" />}>
        <textarea
          aria-label="AI Studio system prompt"
          value={draft.studioGeneration.systemPrompt}
          onChange={(event) => update({ ...draft.studioGeneration, systemPrompt: event.target.value })}
          rows={5}
          className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
        />
      </SettingsCard>

      <SettingsCard title="Character info prompts" icon={<Wand2 className="h-4 w-4" />}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted" htmlFor="studio-character-info-generate-prompt">Generate Idea prompt</label>
            <textarea
              id="studio-character-info-generate-prompt"
              value={draft.studioGeneration.characterInfoGeneratePrompt}
              onChange={(event) => update({ ...draft.studioGeneration, characterInfoGeneratePrompt: event.target.value })}
              rows={6}
              className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg"
            />
            <p className="mt-2 text-xs text-fg-muted">Available placeholder: <code>${'{tags}'}</code>.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted" htmlFor="studio-character-info-improve-prompt">Improve prompt</label>
            <textarea
              id="studio-character-info-improve-prompt"
              value={draft.studioGeneration.characterInfoImprovePrompt}
              onChange={(event) => update({ ...draft.studioGeneration, characterInfoImprovePrompt: event.target.value })}
              rows={8}
              className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg"
            />
            <p className="mt-2 text-xs text-fg-muted">Available placeholders: <code>{CHARACTER_INFO_PLACEHOLDERS}</code>.</p>
          </div>
        </div>
      </SettingsCard>

      {fields.map((field, index) => {
        const isOpen = expanded.has(field.key);
        return (
          <SettingsCard key={field.key}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(field.key)) next.delete(field.key);
                  else next.add(field.key);
                  return next;
                })}
                className="rounded-lg p-2 text-fg-muted hover:bg-hover"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${field.label}`}
              >
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <input
                aria-label={`${field.key} label`}
                value={field.label}
                onChange={(event) => updateField(field.key, { label: event.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-fg"
              />
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={field.key === 'name' || field.enabled}
                  disabled={field.key === 'name'}
                  onChange={(event) => updateField(field.key, { enabled: event.target.checked })}
                />
                Generate
              </label>
              <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move field up"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move field down"><ChevronDown className="h-4 w-4" /></button>
            </div>
            {isOpen && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted" htmlFor={`studio-prompt-${field.key}`}>{field.label} prompt</label>
                <textarea
                  id={`studio-prompt-${field.key}`}
                  value={field.prompt}
                  onChange={(event) => updateField(field.key, { prompt: event.target.value })}
                  rows={Math.min(18, Math.max(6, field.prompt.split('\n').length + 2))}
                  className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg"
                />
                <p className="mt-2 text-xs text-fg-muted">Available placeholders: <code>{FIELD_PLACEHOLDERS}</code>. The style placeholders include the selected perspective and tense instructions.</p>
              </div>
            )}
          </SettingsCard>
        );
      })}

      <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:bg-hover">
        <RotateCcw className="h-4 w-4" />
        Reset Studio generation defaults
      </button>
    </div>
  );
};
