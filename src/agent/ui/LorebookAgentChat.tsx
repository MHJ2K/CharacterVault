import React, { useCallback, useMemo, type ReactNode } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { AIChatView } from '../../components/ai/AIChatView';
import type { ChatMessage } from '../../components/ai/types';
import { AgentChangeReviewModal } from './AgentChangeReviewModal';
import type {
  AIConfig,
  CharacterBook,
  ChatOwnerType,
  PromptSettings,
  SamplerSettings,
} from '../../db/characterTypes';
import { stripFences } from '../core/stripFences';
import { computeAgentContextUsage, usageStatus } from '../hosts/lorebook/contextUsage';
import { AgentChatMessage } from './AgentChatMessage';
import { AgentToolModeChip } from './AgentToolModeChip';
import { formatAgentBusyLabel } from './busyLabel';
import { LiveSpeech } from './LiveSpeech';
import { LiveThinking } from './LiveThinking';
import {
  messageNotices,
  shouldRenderAgentMessage,
  visibleToolEvents,
  writeRecapLine,
} from './notices';
import type { AgentToolTarget } from './types';
import { useLorebookAgent } from './useLorebookAgent';

export interface LorebookAgentChatProps {
  aiConfig: AIConfig;
  samplerSettings: SamplerSettings;
  promptSettings: PromptSettings;
  getBook: () => CharacterBook;
  setBook: (book: CharacterBook) => Promise<void>;
  getCustomContext: () => Promise<string | null>;
  flushDraft: () => void | Promise<void>;
  takeSnapshot: () => Promise<void>;
  customContextIncluded: boolean;
  customContextCharLength?: number;
  headerActions?: ReactNode;
  onClose?: () => void;
  onRunningChange?: (running: boolean) => void;
  onOpenTarget?: (target: AgentToolTarget) => void;
  chatOwnerType: ChatOwnerType;
  chatOwnerId: string;
  /** When false, edits are applied directly without the review modal. */
  stageChanges?: boolean;
  title?: string;
  emptyBody?: string;
  contextEmptyHint?: string;
  composerHint?: string;
}

const BOOK_SUGGESTIONS: readonly string[] = [
  'Audit this book',
  'List my constant entries',
  'Summarize my longest entry',
];

export function LorebookAgentChat({
  aiConfig,
  samplerSettings,
  promptSettings,
  getBook,
  setBook,
  getCustomContext,
  flushDraft,
  takeSnapshot,
  customContextIncluded,
  customContextCharLength = 0,
  headerActions,
  onClose,
  onRunningChange,
  title = 'Lorebook agent',
  emptyBody,
  contextEmptyHint = 'Custom context is optional. Enable it in the lorebook sidebar to give the agent source notes.',
  composerHint,
  onOpenTarget,
  chatOwnerType,
  chatOwnerId,
  stageChanges = true,
}: LorebookAgentChatProps): React.ReactElement {
  const stagedEmptyBody =
    emptyBody ??
    (stageChanges
      ? 'Ask it to build or extend this book from custom context. It drafts entries, then asks you to review before anything is saved.'
      : 'Ask it to build or extend this book from custom context. Edits to entries and settings are applied directly when the run finishes — Snapshots let you roll back.');
  const stagedComposerHint =
    composerHint ??
    (stageChanges
      ? 'Stop, then Send to retry · Changes are staged for your approval'
      : 'Stop, then Send to retry · Edits are applied directly');
  const session = useLorebookAgent({
    aiConfig,
    samplerSettings,
    promptSettings,
    getBook,
    setBook,
    getCustomContext,
    flushDraft,
    takeSnapshot,
    onRunningChange,
    chatOwnerType,
    chatOwnerId,
    stageChanges,
  });

  const contextLabels = useMemo(() => {
    const labels = ['Entry catalog'];
    if (customContextIncluded) labels.unshift('Custom context');
    return labels;
  }, [customContextIncluded]);

  // While a live prompt count is pinned, the idle estimate is never shown — skip
  // the catalog rebuild + full-history encode that would otherwise run per commit.
  const contextUsage = useMemo(() => {
    if (session.livePromptTokens != null) {
      const limit = Math.max(1, samplerSettings.contextLength || 0);
      const percentage = Math.min(100, (session.livePromptTokens / limit) * 100);
      return {
        tokens: session.livePromptTokens,
        limit,
        percentage,
        status: usageStatus(percentage),
      };
    }
    return computeAgentContextUsage({
      book: getBook(),
      customContextCharLength,
      customContextIncluded,
      history: session.chatHistory,
      contextLength: samplerSettings.contextLength,
    });
  }, [
    customContextCharLength,
    customContextIncluded,
    getBook,
    samplerSettings.contextLength,
    session.chatHistory,
    session.livePromptTokens,
  ]);

  const renderMessage = useCallback(
    (message: ChatMessage, index: number) => {
      const events = session.toolEventsByMessageId[message.id] ?? [];
      const notices = messageNotices(session.errorByMessageId[message.id]);
      const toolEvents = visibleToolEvents(events);
      const speech = message.role === 'assistant' ? stripFences(message.content) : message.content;
      const recapLine = speech ? null : writeRecapLine(toolEvents);
      const showReasoning = aiConfig.showReasoning ?? true;
      if (
        !shouldRenderAgentMessage(
          message.role,
          speech,
          toolEvents,
          notices,
          showReasoning ? message.reasoning ?? '' : '',
        )
      ) {
        return null;
      }
      return (
        <AgentChatMessage
          message={message}
          messageIndex={index}
          chatHistoryLength={session.chatHistory.length}
          isProcessing={session.isProcessing}
          showReasoning={showReasoning}
          showRegenerate
          notices={notices}
          toolEvents={toolEvents}
          recapLine={recapLine}
          onRegenerate={session.handleRegenerate}
          onDelete={session.handleDeleteMessage}
          onOpenTarget={onOpenTarget}
        />
      );
    },
    [
      aiConfig.showReasoning,
      onOpenTarget,
      session.chatHistory.length,
      session.errorByMessageId,
      session.handleDeleteMessage,
      session.handleRegenerate,
      session.isProcessing,
      session.toolEventsByMessageId,
    ],
  );

  return (
    <>
      <AIChatView
      title={title}
      emptyTitle={title}
      emptyBody={stagedEmptyBody}
      placeholder="Tell the agent what to add…"
      contextLabels={contextLabels}
      contextEmptyHint={contextEmptyHint}
      composerHint={stagedComposerHint}
      headerActions={
        <>
          <AgentToolModeChip mode={session.toolMode} />
          {headerActions}
        </>
      }
      aboveComposer={
        session.pendingChanges && session.reviewDismissed ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/25 bg-accent-soft/50 px-3 py-2">
            <span className="text-xs text-fg-muted">
              The Agent proposed {session.pendingChanges.length} change
              {session.pendingChanges.length === 1 ? '' : 's'}. Nothing has been saved yet.
            </span>
            <button
              type="button"
              onClick={() => void session.handleReopenChanges()}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-accent-fg transition-colors hover:opacity-90"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Review changes
            </button>
          </div>
        ) : undefined
      }
      showReasoning={false}
      showRegenerate
      showStreamDraft={false}
      contextUsage={contextUsage}
      chatHistory={session.chatHistory}
      isProcessing={session.isProcessing}
      error={session.chatHistory.length === 0 ? session.error : null}
      isStreaming={session.isStreaming}
      streamingContent={session.streamingContent}
      streamingReasoning={session.streamingReasoning}
      handleAsk={session.handleAsk}
      handleRegenerate={session.handleRegenerate}
      handleNewChat={session.handleNewChat}
      handleDeleteMessage={session.handleDeleteMessage}
      handleAbort={session.handleAbort}
      clearError={session.clearError}
      isHydrating={session.isHydrating}
      hasOlderMessages={session.hasOlderMessages}
      onLoadOlder={session.handleLoadOlder}
      onClose={onClose}
      emptySuggestions={BOOK_SUGGESTIONS}
      renderMessage={renderMessage}
      processingIndicator={
        <div className="py-1 text-fg-muted">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="text-xs">
              {session.busyLabel ? `Running ${formatAgentBusyLabel(session.busyLabel)}` : 'Working…'}
            </span>
          </div>
          {aiConfig.showReasoning !== false ? (
            <LiveThinking text={session.streamingReasoning} />
          ) : null}
          <LiveSpeech text={session.streamingContent} isStreaming={session.isStreaming} />
        </div>
      }
      />
      {session.pendingChanges && !session.reviewDismissed ? (
        <AgentChangeReviewModal
          changes={session.pendingChanges}
          isSaving={session.isApplyingChanges}
          error={session.reviewError}
          onChange={session.handleEditChange}
          onApprove={(selectedIds) => void session.handleApproveChanges(selectedIds)}
          onDismiss={() => void session.handleDismissChanges()}
          onDiscard={() => void session.handleCancelChanges()}
        />
      ) : null}
    </>
  );
}
