/**
 * @fileoverview Concept input component for AI Creation Studio with Write/Tags toggle
 * @module @pages/ai-creation-studio/ConceptInput
 */

import React from 'react';
import {
  Sparkles,
  AlertCircle,
  Settings2,
  Loader2,
  X,
  PenLine,
  Tag,
} from 'lucide-react';
import { TagSelector } from './TagSelector';
import { hasAtLeastOneTag } from './inputState';
import type { InputMode } from './types';
import {
  formatTag,
  getGenerationTags,
  hasRequiredGenerationTags,
  PERSPECTIVE_TAGS,
  TENSE_TAGS,
  toggleGenerationTagSelection,
} from './tags/tagData';

interface ConceptInputProps {
  /* Write mode state */
  concept: string;
  onConceptChange: (value: string) => void;
  tagsText: string;
  onTagsTextChange: (value: string) => void;
  /* Tag mode state */
  tagSelections: Record<string, string[]>;
  onTagSelectionsChange: (s: Record<string, string[]>) => void;
  onFeelingLucky: () => void;
  taxonomyVersion: number;
  /* Shared */
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onGenerate: () => void;
  onAbort: () => void;
  isConfigured: boolean;
  isGenerating: boolean;
  onOpenSettings: () => void;
}

interface GenerationStyleSelectorProps {
  selections: Record<string, string[]>;
  onSelectionsChange: (s: Record<string, string[]>) => void;
  isGenerating: boolean;
}

const GenerationStyleSelector: React.FC<GenerationStyleSelectorProps> = ({
  selections,
  onSelectionsChange,
  isGenerating,
}) => {
  const generationSelections = selections.generation ?? [];
  const generationTags = getGenerationTags(selections);

  const toggleTag = (tag: string) => {
    onSelectionsChange({
      ...selections,
      generation: toggleGenerationTagSelection(generationSelections, tag),
    });
  };

  const renderTagButton = (tag: string) => {
    const isSelected = generationSelections.includes(tag);
    return (
      <button
        key={tag}
        type="button"
        onClick={() => toggleTag(tag)}
        disabled={isGenerating}
        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
          isSelected
            ? 'bg-accent-soft text-accent border-accent ring-1 ring-accent'
            : 'border-border text-fg-muted hover:border-accent/40 hover:bg-accent-soft hover:text-accent'
        }`}
      >
        {formatTag(tag)}
      </button>
    );
  };

  return (
    <div className="space-y-3 p-4 bg-bg/50 border border-border rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Generation Style
        </span>
        <span className="font-bold px-1.5 py-0.5 rounded-full bg-warning-soft text-warning-soft-fg">
          Required
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <p className="font-medium text-fg-muted mb-1.5">
            Perspective
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PERSPECTIVE_TAGS.map(renderTagButton)}
          </div>
        </div>
        <div>
          <p className="font-medium text-fg-muted mb-1.5">
            Tense
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TENSE_TAGS.map(renderTagButton)}
          </div>
        </div>
      </div>

      {(!generationTags.perspective || !generationTags.tense) && (
        <p className="text-xs text-warning">
          Choose one perspective and one tense before generating.
        </p>
      )}
    </div>
  );
};

export const ConceptInput: React.FC<ConceptInputProps> = ({
  concept,
  onConceptChange,
  tagsText,
  onTagsTextChange,
  tagSelections,
  onTagSelectionsChange,
  onFeelingLucky,
  taxonomyVersion,
  inputMode,
  onInputModeChange,
  onGenerate,
  onAbort,
  isConfigured,
  isGenerating,
  onOpenSettings,
}) => {
  const hasTags = hasAtLeastOneTag(tagsText);
  const hasGenerationTags = hasRequiredGenerationTags(tagSelections);
  const canGenerate = isConfigured && hasTags && hasGenerationTags && !isGenerating;

  return (
    <div className="space-y-5">
      {/* Write / Tags tab toggle */}
      <div className="flex p-1 bg-muted/60 rounded-xl">
        <button
          onClick={() => onInputModeChange('write')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            inputMode === 'write'
              ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/30'
              : 'text-fg-muted hover:text-fg hover:bg-accent-soft/50'
          }`}
        >
          <PenLine className="w-4 h-4" />
          Write
        </button>
        <button
          onClick={() => onInputModeChange('tags')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            inputMode === 'tags'
              ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/30'
              : 'text-fg-muted hover:text-fg hover:bg-accent-soft/50'
          }`}
        >
          <Tag className="w-4 h-4" />
          Tags
        </button>
      </div>

      {inputMode === 'write' ? (
        <>
          <GenerationStyleSelector
            selections={tagSelections}
            onSelectionsChange={onTagSelectionsChange}
            isGenerating={isGenerating}
          />

          {/* Header */}
          <div className="text-center sm:text-left">
            <h2 className="text-lg font-bold text-fg">
              What character do you want to create?
            </h2>
            <p className="text-sm text-fg-muted mt-1">
              Describe your idea and the AI will generate a complete character card.
            </p>
          </div>

          {/* Tags input */}
          <div>
            <label htmlFor="studio-tags-input" className="mb-2 block text-sm font-semibold text-fg">Tags <span className="text-warning">(required)</span></label>
            <input
              id="studio-tags-input"
              type="text"
              value={tagsText}
              onChange={(e) => onTagsTextChange(e.target.value)}
              placeholder="e.g. Dwarven, Blacksmith, Cynical"
              disabled={isGenerating}
              className="w-full px-4 py-2.5 bg-bg/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-all placeholder:text-fg-subtle"
            />
          </div>

          {/* Input Area */}
          <div className="relative">
            <label htmlFor="studio-character-info" className="mb-2 block text-sm font-semibold text-fg">Character info <span className="font-normal text-fg-muted">(optional)</span></label>
            <textarea
              id="studio-character-info"
              value={concept}
              onChange={(e) => onConceptChange(e.target.value)}
              placeholder="A cynical dwarven blacksmith with a secret past, living in a mountain fortress who speaks in riddles..."
              disabled={isGenerating}
              className="w-full h-36 p-4 bg-bg/50 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-all placeholder:text-fg-subtle"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {isConfigured && (
                <span className="text-xs font-medium text-fg-subtle">
                  Optional
                </span>
              )}
            </div>
          </div>

          {/* Not Configured State */}
          {!isConfigured && (
            <div className="flex flex-col items-center text-center gap-3 p-5 bg-warning-soft/60 border border-warning/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-warning-soft flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-warning-soft-fg">
                  AI Provider Not Configured
                </p>
                <p className="text-xs text-warning-soft-fg mt-0.5">
                  Configure your AI provider and choose a model to start generating characters.
                </p>
              </div>
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-warning-soft-fg bg-warning-soft hover:opacity-90 rounded-lg transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                Configure AI
              </button>
            </div>
          )}

          {/* API call cost notice */}
          <p className="text-xs text-fg-subtle text-center">
            Generation uses a minimum of 4 API calls. At least one per field.
          </p>

          {/* Action Bar */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-accent text-accent-fg font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isGenerating ? 'Generating Character...' : 'Generate Character'}
            </button>
            {isGenerating && (
              <button
                onClick={onAbort}
                className="flex items-center gap-2 px-4 py-2.5 border border-border-strong text-fg-muted font-medium rounded-xl hover:bg-hover active:scale-[0.98] transition-all"
              >
                <X className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>

          {/* Required tag hint */}
          {isConfigured && !isGenerating && !hasTags && (
            <p className="text-xs text-warning text-center">
              Add at least one tag before creating the character.
            </p>
          )}

          {isConfigured && !isGenerating && hasTags && !hasGenerationTags && (
            <p className="text-xs text-warning text-center">
              Choose a generation style before creating the character.
            </p>
          )}
        </>
      ) : (
        <TagSelector
          key={taxonomyVersion}
          selections={tagSelections}
          onSelectionsChange={onTagSelectionsChange}
          onFeelingLucky={onFeelingLucky}
          onGenerate={onGenerate}
          onAbort={onAbort}
          isGenerating={isGenerating}
          isConfigured={isConfigured}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
};
