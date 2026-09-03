/**
 * @fileoverview Types for AI Creation Studio
 * @module @pages/ai-creation-studio/types
 */

import type { CharacterSpec, StudioGenerationField } from '../../db/characterTypes';

export type GenerationField = StudioGenerationField;

export type GenerationStatus = 'idle' | 'generating' | 'complete' | 'error';

export interface GenerationState {
  status: GenerationStatus;
  currentField: GenerationField | null;
  completedFields: GenerationField[];
  generatedData: Partial<Pick<CharacterSpec, GenerationField>>;
  generatedReasoning: Partial<Record<GenerationField, string>>;
  error: string | null;
  failedField: GenerationField | null;
}

export interface FieldConfig {
  key: GenerationField;
  label: string;
  icon: string;
}

/** Input mode for the creation studio concept area */
export type InputMode = 'write' | 'tags';

/** Tag selections grouped by category */
export type TagSelections = Record<string, string[]>;
