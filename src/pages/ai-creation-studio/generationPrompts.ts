import type { PerspectiveTag, TenseTag } from './tags/tagData';
import type { StudioGenerationField, StudioGenerationFieldConfig } from '../../db/characterTypes';
import { DEFAULT_STUDIO_GENERATION_SETTINGS, DEFAULT_STUDIO_SYSTEM_PROMPT } from './studioGenerationDefaults';

export const GENERATION_SYSTEM_PROMPT = DEFAULT_STUDIO_SYSTEM_PROMPT;

export interface StudioPromptContext {
    concept: string;
    name: string;
    description: string;
    style: string;
    narrationFormat: string;
}

export interface CharacterInfoPromptContext {
    tags: string;
    characterInfo: string;
}

export function renderCharacterInfoPrompt(template: string, context: CharacterInfoPromptContext): string {
    return template.replace(/\$\{(tags|characterInfo)\}/g, (_, key: keyof CharacterInfoPromptContext) => context[key]);
}

export function renderStudioPrompt(template: string, context: StudioPromptContext): string {
    const values: Record<string, string> = {
        concept: context.concept,
        name: context.name,
        description: context.description,
        style: context.style,
        narrationFormat: context.narrationFormat,
    };
    return template.replace(/\$\{(concept|name|description|style|narrationFormat)\}/g, (_, key: string) => values[key]);
}

export function getDefaultStudioFieldConfig(field: StudioGenerationField): StudioGenerationFieldConfig {
    const config = DEFAULT_STUDIO_GENERATION_SETTINGS.fields.find((item) => item.key === field);
    if (!config) throw new Error(`Unknown Studio generation field: ${field}`);
    return { ...config };
}

/** Build generation style instructions based on selected perspective and tense tags. */
export function buildGenerationStyleInstructions(perspective: PerspectiveTag | null, tense: TenseTag | null): string {
    if (!perspective || !tense) {
        throw new Error('Generation style requires one perspective tag and one tense tag.');
    }

    const perspectiveInstruction: Record<PerspectiveTag, string> = {
        first_person: "Write in first person from the character's perspective (I, me, my).",
        second_person: 'Write in second person, addressing the reader as "you".',
        third_person: 'Write in third person (he, she, they).',
        first_person_you: 'Write in first person from the character\'s perspective (I, me, my), and refer to {{user}} as "you".',
    };
    const tenseInstruction = tense === 'present_tense' ? 'Use present tense throughout.' : 'Use past tense throughout.';

    return `\n\n<generation_style>\n${perspectiveInstruction[perspective]}\n${tenseInstruction}\n</generation_style>`;
}

export function buildDescriptionStyleInstructions(perspective: PerspectiveTag | null, tense: TenseTag | null): string {
    if (!perspective || !tense) {
        throw new Error('Generation style requires one perspective tag and one tense tag.');
    }

    const perspectiveInstruction: Record<PerspectiveTag, string> = {
        first_person: "Write description content in first person from the character's perspective (I, me, my).",
        first_person_you: 'Write description content in first person from the character\'s perspective, but refer to the player only as {{user}}. Do not address {{user}} as "you" in the description. Example: write "{{user}} is the only thing that feels stable in my life," not "You are the only thing that feels stable in my life."',
        second_person: 'Write description content in third-person omniscient style (he, she, they, the character), describing the character rather than addressing the reader.',
        third_person: 'Write description content in third-person omniscient style (he, she, they, the character), describing the character rather than addressing the reader.',
    };
    const tenseInstruction = tense === 'present_tense' ? 'Use present tense throughout.' : 'Use past tense throughout.';

    return `\n\n<generation_style>\n${perspectiveInstruction[perspective]}\n${tenseInstruction}\nDescriptions are character-card reference material, not an opening message. Do not write directly to the reader in description sections.</generation_style>`;
}

export function buildNarrationFormatInstruction(perspective: PerspectiveTag | null): string {
    if (!perspective) throw new Error('Generation style requires a valid perspective tag.');

    const instructions: Record<PerspectiveTag, string> = {
        first_person: "Narrative/action text should use first person from the character's perspective; dialogue should still be quoted naturally.",
        second_person: 'Narrative/action text should use second person, addressing {{user}} as "you"; dialogue should still be quoted naturally.',
        third_person: 'Narrative/action text should use third person; dialogue should still be quoted naturally.',
        first_person_you: 'Narrative/action text should use first person from the character\'s perspective and refer to {{user}} as "you"; dialogue should still be quoted naturally.',
    };
    return instructions[perspective];
}

function buildContext(concept: string, name: string, description: string, perspective: PerspectiveTag | null, tense: TenseTag | null): StudioPromptContext {
    return {
        concept,
        name,
        description,
        style: buildGenerationStyleInstructions(perspective, tense),
        narrationFormat: buildNarrationFormatInstruction(perspective),
    };
}

function buildDefaultPrompt(field: StudioGenerationField, context: StudioPromptContext): string {
    const config = getDefaultStudioFieldConfig(field);
    return renderStudioPrompt(config.prompt, context);
}

export function buildNamePrompt(concept: string): string {
    return buildDefaultPrompt('name', { concept, name: '', description: '', style: '', narrationFormat: '' });
}

export function buildDescriptionPrompt(concept: string, name: string, perspective: PerspectiveTag | null, tense: TenseTag | null): string {
    return buildDefaultPrompt('description', {
        concept,
        name,
        description: '',
        style: buildDescriptionStyleInstructions(perspective, tense),
        narrationFormat: '',
    });
}

export function buildFirstMessagePrompt(concept: string, name: string, description: string, perspective: PerspectiveTag | null, tense: TenseTag | null): string {
    return buildDefaultPrompt('first_mes', buildContext(concept, name, description, perspective, tense));
}

export function buildExamplesPrompt(concept: string, name: string, description: string, perspective: PerspectiveTag | null, tense: TenseTag | null): string {
    return buildDefaultPrompt('mes_example', buildContext(concept, name, description, perspective, tense));
}
