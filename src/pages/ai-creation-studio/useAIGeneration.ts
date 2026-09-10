/**
 * @fileoverview Hook for AI character generation
 * @module @pages/ai-creation-studio/useAIGeneration
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AIService, AIError } from "../../services/AIService";
import { characterSettingsService } from "../../services/CharacterSettingsService";
import type { AIConfig, SamplerSettings, CharacterSpec, StudioGenerationSettings } from "../../db/characterTypes";
import type { GenerationField, GenerationState, FieldConfig } from "./types";
import type { GenerationStyleTags } from "./tags/tagData";
import { DEFAULT_STUDIO_GENERATION_SETTINGS, cloneStudioGenerationSettings } from "./studioGenerationDefaults";
import {
    renderStudioPrompt,
    renderCharacterInfoPrompt,
    buildGenerationStyleInstructions,
    buildDescriptionStyleInstructions,
    buildNarrationFormatInstruction,
    applyCardTypeInstruction,
} from "./generationPrompts";

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

const INITIAL_STATE: GenerationState = {
    status: "idle",
    currentField: null,
    completedFields: [],
    generatedData: {},
    generatedReasoning: {},
    error: null,
    failedField: null,
};

export interface UseAIGenerationResult {
    state: GenerationState;
    fields: FieldConfig[];
    isConfigured: boolean;
    isLoading: boolean;
    concept: string;
    generationTags: GenerationStyleTags;
    start: (concept: string, tags: GenerationStyleTags) => Promise<void>;
    abort: () => void;
    retryField: (field: GenerationField) => Promise<void>;
    regenerateField: (field: GenerationField) => Promise<void>;
    continueGeneration: () => Promise<void>;
    reloadConfig: () => Promise<void>;
    updateGeneratedField: (field: GenerationField, value: string) => void;
    reset: () => void;
    generateCharacterInfo: (tags: string, currentInfo: string, cardType: GenerationStyleTags["cardType"]) => Promise<string>;
    isGeneratingCharacterInfo: boolean;
}

export function useAIGeneration(): UseAIGenerationResult {
    const [state, setState] = useState<GenerationState>(INITIAL_STATE);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingCharacterInfo, setIsGeneratingCharacterInfo] = useState(false);
    const [concept, setConcept] = useState("");
    const [generationTags, setGenerationTags] = useState<GenerationStyleTags>({ cardType: null, perspective: null, tense: null });
    const [generationSettings, setGenerationSettings] = useState<StudioGenerationSettings>(() => cloneStudioGenerationSettings());
    const generationTagsRef = useRef<GenerationStyleTags>({ cardType: null, perspective: null, tense: null });
    const generationSettingsRef = useRef<StudioGenerationSettings>(cloneStudioGenerationSettings());

    const aiServiceRef = useRef<AIService | null>(null);
    const configRef = useRef<{ config: AIConfig; sampler: SamplerSettings } | null>(null);
    const stateRef = useRef<GenerationState>(state);
    const isAbortedRef = useRef(false);
    const operationIdRef = useRef(0);
    const mountedRef = useRef(true);
    const configRequestIdRef = useRef(0);
    stateRef.current = state;

    const isCurrentOperation = (operationId: number): boolean =>
        mountedRef.current && operationId === operationIdRef.current && !isAbortedRef.current;

    const abortCurrent = useCallback(() => {
        isAbortedRef.current = true;
        operationIdRef.current += 1;
        configRequestIdRef.current += 1;
        aiServiceRef.current?.abort();
    }, []);

    const beginOperation = useCallback((): number => {
        abortCurrent();
        isAbortedRef.current = false;
        return ++operationIdRef.current;
    }, [abortCurrent]);

    const loadConfig = useCallback(async (operationId?: number): Promise<boolean> => {
        const configRequestId = ++configRequestIdRef.current;
        try {
            const [config, sampler, studioGeneration] = await Promise.all([
                characterSettingsService.getAISettings(),
                characterSettingsService.getSamplerSettings(),
                characterSettingsService.getStudioGenerationSettings(),
            ]);
            if (
                !mountedRef.current ||
                configRequestId !== configRequestIdRef.current ||
                (operationId !== undefined && operationId !== operationIdRef.current)
            ) return false;

            const nextGenerationSettings = studioGeneration ?? DEFAULT_STUDIO_GENERATION_SETTINGS;
            generationSettingsRef.current = nextGenerationSettings;
            setGenerationSettings(nextGenerationSettings);

            const isLocalEndpoint = Boolean(
                config.baseUrl &&
                (config.baseUrl.includes("localhost") ||
                    config.baseUrl.includes("127.0.0.1") ||
                    config.baseUrl.includes("0.0.0.0"))
            );
            const hasConfig = Boolean(config.baseUrl && config.modelId && (config.apiKey || isLocalEndpoint));
            setIsConfigured(hasConfig);

            if (hasConfig) {
                configRef.current = { config, sampler };
                aiServiceRef.current = new AIService(config, sampler);
            } else {
                aiServiceRef.current = null;
            }
            return hasConfig;
        } catch (err) {
            console.error("[useAIGeneration] Failed to load config:", err);
            if (
                mountedRef.current &&
                configRequestId === configRequestIdRef.current &&
                (operationId === undefined || operationId === operationIdRef.current)
            ) {
                setIsConfigured(false);
            }
            return false;
        }
    }, []);

    const reloadConfig = useCallback(async () => {
        await loadConfig();
    }, [loadConfig]);

    useEffect(() => {
        void loadConfig();
    }, [loadConfig]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortCurrent();
        };
    }, [abortCurrent]);

    const buildMessages = useCallback(
        (field: GenerationField, fieldConcept: string, data: Partial<CharacterSpec>): ChatMessage[] => {
            const settings = generationSettingsRef.current;
            const fieldConfig = settings.fields.find((item) => item.key === field);
            if (!fieldConfig) throw new Error(`Studio field is not configured: ${field}`);

            const { cardType, perspective, tense } = generationTagsRef.current;
            const style = perspective && tense
                ? field === "description"
                    ? buildDescriptionStyleInstructions(perspective, tense)
                    : buildGenerationStyleInstructions(perspective, tense)
                : "";
            const narrationFormat = perspective ? buildNarrationFormatInstruction(perspective) : "";
            const renderedPrompt = renderStudioPrompt(fieldConfig.prompt, {
                concept: fieldConcept,
                name: data.name || "",
                description: data.description || "",
                style,
                narrationFormat,
            });
            const userPrompt = applyCardTypeInstruction(renderedPrompt, cardType);

            return [
                { role: "system", content: settings.systemPrompt },
                { role: "user", content: userPrompt },
            ];
        },
        [],
    );

    const generateField = useCallback(
        async (
            field: GenerationField,
            fieldConcept: string,
            currentData: Partial<CharacterSpec>,
            operationId: number,
        ): Promise<string> => {
            const service = aiServiceRef.current;
            if (!service) throw new Error("AI service not initialized");

            const messages = buildMessages(field, fieldConcept, currentData);
            let accumulatedContent = "";
            let accumulatedReasoning = "";

            try {
                const response = await service.chat(messages, undefined, (chunk: { content?: string; reasoning?: string }) => {
                    if (!isCurrentOperation(operationId)) return;
                    if (chunk.content) accumulatedContent += chunk.content;
                    if (chunk.reasoning) accumulatedReasoning += chunk.reasoning;
                    setState((prev) => ({
                        ...prev,
                        generatedData: { ...prev.generatedData, [field]: accumulatedContent },
                        generatedReasoning: { ...prev.generatedReasoning, [field]: accumulatedReasoning },
                    }));
                });

                if (!isCurrentOperation(operationId)) {
                    throw new AIError("Request was cancelled", "unknown");
                }
                const content = response.content || "";
                if (!content.trim()) {
                    throw new AIError(
                        `Generation returned empty content for "${field}". The model may have errored during generation.`,
                        "unknown",
                    );
                }
                return content;
            } catch (err) {
                if (isCurrentOperation(operationId)) {
                    setState((prev) => ({
                        ...prev,
                        failedField: field,
                        generatedData: { ...prev.generatedData, [field]: undefined },
                        generatedReasoning: { ...prev.generatedReasoning, [field]: undefined },
                    }));
                }
                throw err;
            }
        },
        [buildMessages],
    );

    const start = useCallback(
        async (newConcept: string, tags: GenerationStyleTags) => {
            if (!newConcept.trim()) return;
            if (!tags.cardType || !tags.perspective || !tags.tense) {
                if (mountedRef.current) {
                    setState({
                        ...INITIAL_STATE,
                        status: "error",
                        error: "Choose a card type, perspective, and tense before generating.",
                    });
                }
                return;
            }

            const trimmedConcept = newConcept.trim();
            setConcept(trimmedConcept);
            generationTagsRef.current = tags;
            if (mountedRef.current) setGenerationTags(tags);

            const operationId = beginOperation();
            const hasConfig = await loadConfig(operationId);
            if (!isCurrentOperation(operationId)) return;
            if (!hasConfig) {
                setState({
                    ...INITIAL_STATE,
                    status: "error",
                    error: "AI is not configured. Please configure your AI settings first.",
                });
                return;
            }

            setIsLoading(true);
            setState({ ...INITIAL_STATE, status: "generating", currentField: "name" });
            const generatedData: Partial<CharacterSpec> = {};
            const fieldOrder = generationSettingsRef.current.fields
                .filter((field) => field.enabled || field.key === "name")
                .map((field) => field.key);

            try {
                for (const field of fieldOrder) {
                    if (!isCurrentOperation(operationId)) return;
                    setState((prev) => ({ ...prev, currentField: field, generatedData: { ...generatedData } }));
                    const result = await generateField(field, trimmedConcept, generatedData, operationId);
                    if (!isCurrentOperation(operationId)) return;
                    generatedData[field] = result;
                    setState((prev) => ({
                        ...prev,
                        completedFields: [...prev.completedFields, field],
                        generatedData: { ...generatedData },
                    }));
                }
                if (isCurrentOperation(operationId)) {
                    setState((prev) => ({ ...prev, status: "complete", currentField: null }));
                }
            } catch (err) {
                if (isCurrentOperation(operationId)) {
                    const errorMessage = err instanceof AIError ? err.message : "An unexpected error occurred during generation";
                    setState((prev) => ({
                        ...prev,
                        status: "error",
                        error: errorMessage,
                        failedField: prev.failedField ?? prev.currentField,
                        currentField: null,
                    }));
                }
            } finally {
                if (mountedRef.current && operationId === operationIdRef.current) setIsLoading(false);
            }
        },
        [beginOperation, generateField, loadConfig],
    );

    const abort = useCallback(() => {
        abortCurrent();
        if (!mountedRef.current) return;
        setIsLoading(false);
        setState((prev) => ({ ...prev, status: "error", currentField: null, error: "Generation stopped by user." }));
    }, [abortCurrent]);

    const retryField = useCallback(
        async (field: GenerationField) => {
            const operationId = beginOperation();
            const hasConfig = await loadConfig(operationId);
            if (!isCurrentOperation(operationId)) return;
            if (!hasConfig) {
                setState((prev) => ({ ...prev, status: "error", error: "AI is not configured. Please configure your AI settings first." }));
                return;
            }

            setIsLoading(true);
            setState((prev) => ({ ...prev, status: "generating", currentField: field, error: null, failedField: null }));
            try {
                const currentData = stateRef.current.generatedData;
                const result = await generateField(field, concept || currentData.name || "Character", currentData, operationId);
                if (!isCurrentOperation(operationId)) return;
                setState((prev) => ({
                    ...prev,
                    status: "complete",
                    currentField: null,
                    generatedData: { ...prev.generatedData, [field]: result },
                    completedFields: Array.from(new Set([...prev.completedFields, field])),
                    error: null,
                    failedField: null,
                }));
            } catch (err) {
                if (isCurrentOperation(operationId)) {
                    setState((prev) => ({
                        ...prev,
                        status: "error",
                        error: err instanceof AIError ? err.message : "An unexpected error occurred during generation",
                        failedField: field,
                        currentField: null,
                    }));
                }
            } finally {
                if (mountedRef.current && operationId === operationIdRef.current) setIsLoading(false);
            }
        },
        [beginOperation, concept, generateField, loadConfig],
    );

    const regenerateField = useCallback(
        async (field: GenerationField) => {
            const operationId = beginOperation();
            const hasConfig = await loadConfig(operationId);
            if (!isCurrentOperation(operationId)) return;
            if (!hasConfig) {
                setState((prev) => ({ ...prev, status: "error", error: "AI is not configured. Please configure your AI settings first." }));
                return;
            }

            setIsLoading(true);
            setState((prev) => ({
                ...prev,
                status: "generating",
                currentField: field,
                error: null,
                failedField: null,
                completedFields: prev.completedFields.filter((f) => f !== field),
                generatedData: { ...prev.generatedData, [field]: undefined },
                generatedReasoning: { ...prev.generatedReasoning, [field]: undefined },
            }));
            try {
                const currentData = stateRef.current.generatedData;
                const contextData = { ...currentData, [field]: undefined };
                const result = await generateField(field, concept || currentData.name || "Character", contextData, operationId);
                if (!isCurrentOperation(operationId)) return;
                setState((prev) => ({
                    ...prev,
                    status: "complete",
                    currentField: null,
                    generatedData: { ...prev.generatedData, [field]: result },
                    completedFields: Array.from(new Set([...prev.completedFields, field])),
                    error: null,
                    failedField: null,
                }));
            } catch (err) {
                if (isCurrentOperation(operationId)) {
                    setState((prev) => ({
                        ...prev,
                        status: "error",
                        error: err instanceof AIError ? err.message : "An unexpected error occurred during generation",
                        failedField: field,
                        currentField: null,
                    }));
                }
            } finally {
                if (mountedRef.current && operationId === operationIdRef.current) setIsLoading(false);
            }
        },
        [beginOperation, concept, generateField, loadConfig],
    );

    const continueGeneration = useCallback(async () => {
        const operationId = beginOperation();
        const hasConfig = await loadConfig(operationId);
        if (!isCurrentOperation(operationId)) return;
        if (!hasConfig) {
            setState((prev) => ({ ...prev, status: "error", error: "AI is not configured. Please configure your AI settings first." }));
            return;
        }

        const currentState = stateRef.current;
        const remaining = generationSettingsRef.current.fields
            .filter((field) => field.enabled || field.key === "name")
            .map((field) => field.key)
            .filter((field) => !currentState.completedFields.includes(field));
        if (remaining.length === 0) return;

        setIsLoading(true);
        setState((prev) => ({ ...prev, status: "generating", error: null, failedField: null }));
        const generatedData: Partial<CharacterSpec> = { ...currentState.generatedData };
        const trimmedConcept = concept || currentState.generatedData.name || "Character";

        try {
            for (const field of remaining) {
                if (!isCurrentOperation(operationId)) return;
                setState((prev) => ({ ...prev, currentField: field, generatedData: { ...generatedData } }));
                const result = await generateField(field, trimmedConcept, generatedData, operationId);
                if (!isCurrentOperation(operationId)) return;
                generatedData[field] = result;
                setState((prev) => ({
                    ...prev,
                    completedFields: Array.from(new Set([...prev.completedFields, field])),
                    generatedData: { ...generatedData },
                }));
            }
            if (isCurrentOperation(operationId)) {
                setState((prev) => ({ ...prev, status: "complete", currentField: null }));
            }
        } catch (err) {
            if (isCurrentOperation(operationId)) {
                setState((prev) => ({
                    ...prev,
                    status: "error",
                    error: err instanceof AIError ? err.message : "An unexpected error occurred during generation",
                    failedField: prev.failedField ?? prev.currentField,
                    currentField: null,
                }));
            }
        } finally {
            if (mountedRef.current && operationId === operationIdRef.current) setIsLoading(false);
        }
    }, [beginOperation, concept, generateField, loadConfig]);

    const updateGeneratedField = useCallback((field: GenerationField, value: string) => {
        if (!mountedRef.current) return;
        setState((prev) => ({ ...prev, generatedData: { ...prev.generatedData, [field]: value } }));
    }, []);

    const generateCharacterInfo = useCallback(async (tags: string, currentInfo: string, cardType: GenerationStyleTags["cardType"]): Promise<string> => {
        const trimmedTags = tags.trim();
        if (!trimmedTags) throw new Error("Add at least one tag before generating character info.");
        if (!cardType) throw new Error("Choose a card type before generating character info.");

        const operationId = beginOperation();
        const hasConfig = await loadConfig(operationId);
        if (!isCurrentOperation(operationId)) throw new AIError("Request was cancelled", "unknown");
        if (!hasConfig) throw new Error("AI is not configured. Please configure your AI settings first.");

        const service = aiServiceRef.current;
        if (!service) throw new Error("AI service not initialized");
        setIsGeneratingCharacterInfo(true);
        const settings = generationSettingsRef.current;
        const template = currentInfo.trim() ? settings.characterInfoImprovePrompt : settings.characterInfoGeneratePrompt;
        const prompt = applyCardTypeInstruction(
            renderCharacterInfoPrompt(template, { tags: trimmedTags, characterInfo: currentInfo.trim() }),
            cardType,
        );
        let accumulatedContent = "";

        try {
            const response = await service.chat(
                [{ role: "system", content: settings.systemPrompt }, { role: "user", content: prompt }],
                undefined,
                (chunk: { content?: string }) => {
                    if (!isCurrentOperation(operationId) || !chunk.content) return;
                    accumulatedContent += chunk.content;
                    setConcept(accumulatedContent);
                },
            );
            if (!isCurrentOperation(operationId)) throw new AIError("Request was cancelled", "unknown");
            const result = (response.content || accumulatedContent).trim();
            if (!result) throw new Error("Generation returned empty character info.");
            setConcept(result);
            return result;
        } finally {
            if (mountedRef.current && operationId === operationIdRef.current) setIsGeneratingCharacterInfo(false);
        }
    }, [beginOperation, loadConfig]);

    const reset = useCallback(() => {
        abortCurrent();
        if (!mountedRef.current) return;
        setState(INITIAL_STATE);
        setIsLoading(false);
        setIsGeneratingCharacterInfo(false);
        setConcept("");
        generationTagsRef.current = { cardType: null, perspective: null, tense: null };
        setGenerationTags({ cardType: null, perspective: null, tense: null });
    }, [abortCurrent]);

    const fields: FieldConfig[] = generationSettings.fields
        .filter((field) => field.enabled || field.key === "name")
        .map((field) => ({
            key: field.key,
            label: field.label,
            icon: field.key === "name"
                ? "Type"
                : field.key === "description"
                    ? "FileText"
                    : field.key === "scenario"
                        ? "Map"
                        : field.key === "first_mes"
                            ? "MessageCircle"
                            : "MessagesSquare",
        }));

    return {
        state,
        fields,
        isConfigured,
        isLoading,
        concept,
        generationTags,
        start,
        abort,
        retryField,
        regenerateField,
        continueGeneration,
        reloadConfig,
        updateGeneratedField,
        reset,
        generateCharacterInfo,
        isGeneratingCharacterInfo,
    };
}
