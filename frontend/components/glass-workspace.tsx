"use client";

import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AssistantMessage } from "./assistant-message";
import {
  ChatComposer,
  DEFAULT_COMPOSER_AGENT_PREFERENCE,
  type ComposerAgentPreference,
} from "./chat-composer";
import { WorkspaceShell } from "./workspace-shell";
import { useAuth } from "@/hooks/use-auth";
import { useCalendarIntegration } from "@/hooks/use-calendar-integration";
import { useChatCompletion, type ChatCompletionMessagePayload } from "@/hooks/use-chat-completion";
import { useGmailIntegration } from "@/hooks/use-gmail-integration";
import { useNotificationUnreadCount } from "@/hooks/use-notification-unread-count";
import { useNotionIntegration } from "@/hooks/use-notion-integration";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { CHAT_TABS_LOCAL_STORAGE_KEY, clearPersistedChatWorkspaceTabs } from "@/lib/chat-workspace-storage";

const INITIAL_CONVERSATION_ID = "conv-initial";

const PERSISTED_CHAT_TABS_SCHEMA_VERSION = 1 as const;

const CHAT_TABLIST_LABEL = "Conversations";

const WORKSPACE_MORE_MENU_DOM_ID = "glass-workspace-more-menu";

const STARTER_PROMPT_GMAIL_SUMMARY =
  "Using my connected Gmail, list threads that likely need a reply today and suggest a short reply for each.";

const STARTER_PROMPT_CALENDAR_SNAPSHOT =
  "What is on my Google Calendar for the next seven days? Note conflicts or tight windows between meetings.";

const STARTER_PROMPT_WORKSPACE_CAPABILITIES =
  "Summarize what you can do with my connected Gmail, Calendar, and Notion in this app, then propose my top three priorities for today.";

const WORKSPACE_MENU_LINK_CLASS =
  "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-white/90 transition hover:bg-white/10";

const WORKSPACE_MENU_LOGOUT_CLASS =
  "flex w-full items-center px-3 py-2.5 text-left text-[13px] font-medium text-rose-200 transition hover:bg-rose-500/15";

/** Match `--chat-tab-enter-duration` / `--chat-panel-enter-duration` in app/globals.css */
const CHAT_TAB_ENTER_DURATION_MS = 1200;

const CHAT_ENTER_ANIMATION_BUFFER_MS = 120;

/**
 * Clears enter-animation state after tab grow + panel slide finish (slightly after CSS duration).
 */
const CHAT_ENTER_ANIMATION_CLEAR_MS = CHAT_TAB_ENTER_DURATION_MS + CHAT_ENTER_ANIMATION_BUFFER_MS;

function decrementInFlightCount(
  previous: Record<string, number>,
  conversationId: string,
): Record<string, number> {
  const next = { ...previous };
  const nextCount = (next[conversationId] ?? 0) - 1;
  if (nextCount <= 0) {
    delete next[conversationId];
  } else {
    next[conversationId] = nextCount;
  }
  return next;
}

function removeKey<T>(previous: Record<string, T>, key: string): Record<string, T> {
  const next = { ...previous };
  delete next[key];
  return next;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Agent routing chosen in the composer Options menu when the message was sent (user turns only). */
  routingPreference?: ComposerAgentPreference;
  /** Assistant replies from voice use plain text (no markdown parsing). */
  isPlainText?: boolean;
}

const TAB_ICON_ACCENT_CLASSES = [
  "bg-gradient-to-br from-pink-400 to-rose-500",
  "bg-gradient-to-br from-sky-400 to-blue-600",
  "bg-gradient-to-br from-violet-400 to-purple-600",
] as const;

interface ConversationTab {
  id: string;
  title: string;
}

interface PersistedChatTabsPayload {
  readonly version: typeof PERSISTED_CHAT_TABS_SCHEMA_VERSION;
  readonly conversations: readonly ConversationTab[];
  readonly activeConversationId: string;
}

function parsePersistedChatTabs(raw: string): PersistedChatTabsPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== PERSISTED_CHAT_TABS_SCHEMA_VERSION) {
      return null;
    }
    if (typeof record.activeConversationId !== "string" || record.activeConversationId.length === 0) {
      return null;
    }
    const rawList = record.conversations;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return null;
    }
    const conversations: ConversationTab[] = [];
    for (const entry of rawList) {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== "string" || row.id.length === 0 || typeof row.title !== "string") {
        return null;
      }
      conversations.push({ id: row.id, title: row.title });
    }
    const activeInList = conversations.some((c) => c.id === record.activeConversationId);
    const activeConversationId = activeInList ? record.activeConversationId : conversations[0].id;
    return {
      version: PERSISTED_CHAT_TABS_SCHEMA_VERSION,
      conversations,
      activeConversationId,
    };
  } catch {
    return null;
  }
}

function readPersistedChatTabsFromStorage(): PersistedChatTabsPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CHAT_TABS_LOCAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parsePersistedChatTabs(raw);
  } catch {
    return null;
  }
}

function writePersistedChatTabsToStorage(payload: PersistedChatTabsPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CHAT_TABS_LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode or quota — workspace still works for the session
  }
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconDotsHorizontal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function IconCloseSmall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconCalendarSimple({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"
      />
    </svg>
  );
}

function IconCheckSquare({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function IconBellNav({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

const TOP_BAR_ICON_LINK_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/14 text-white/90 shadow-sm transition hover:border-white/35 hover:bg-white/22";

export function GlassWorkspace() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { requestAssistantReply, abortConversation: abortChatForConversation } = useChatCompletion();
  const { sendVoiceMessage, abortVoiceConversation: abortVoiceForConversation } = useVoiceChat();
  const { unreadCount: topBarNotificationCount } = useNotificationUnreadCount();
  const { status: gmailStatus, connectGmail, disconnectGmail } = useGmailIntegration();
  const { status: calendarStatus, connectCalendar, disconnectCalendar } = useCalendarIntegration();
  const { status: notionStatus, connectNotion, disconnectNotion } = useNotionIntegration();
  /** Count of in-flight requests per conversation (text and/or voice can run in parallel). */
  const [repliesInFlight, setRepliesInFlight] = useState<Record<string, number>>({});
  /** Live status message per conversation, shown while a reply is in-flight. */
  const [statusByConversationId, setStatusByConversationId] = useState<Record<string, string>>({});

  const [conversations, setConversations] = useState<ConversationTab[]>(() => [
    { id: INITIAL_CONVERSATION_ID, title: "Chat 1" },
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string>(INITIAL_CONVERSATION_ID);
  const [draftsByConversationId, setDraftsByConversationId] = useState<Record<string, string>>(() => ({
    [INITIAL_CONVERSATION_ID]: "",
  }));

  const [messagesByConversationId, setMessagesByConversationId] = useState<Record<string, ChatMessage[]>>(() => ({}));

  const [agentPreferenceByConversationId, setAgentPreferenceByConversationId] = useState<
    Record<string, ComposerAgentPreference>
  >({});

  /** After first client effect: restored from localStorage or default; avoids overwriting storage before read. */
  const [hasHydratedChatTabs, setHasHydratedChatTabs] = useState(false);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isLogoutInFlight, setIsLogoutInFlight] = useState(false);
  const moreMenuContainerRef = useRef<HTMLDivElement | null>(null);

  /** IDs of assistant messages that should reveal with the typewriter effect. */
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());

  const handleTypingComplete = useCallback((messageId: string) => {
    setAnimatingMessageIds((previous) => {
      const next = new Set(previous);
      next.delete(messageId);
      return next;
    });
  }, []);

  /** Set when a conversation is created via "New"; drives slide-in on tab + panel */
  const [enteringConversationId, setEnteringConversationId] = useState<string | null>(null);

  const enterAnimationClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatTabListRef = useRef<HTMLDivElement | null>(null);

  const activeDraft = draftsByConversationId[activeConversationId] ?? "";
  const messagesForActiveConversation = messagesByConversationId[activeConversationId] ?? [];
  const activeAgentPreference =
    agentPreferenceByConversationId[activeConversationId] ?? DEFAULT_COMPOSER_AGENT_PREFERENCE;
  const hasConversationMessages = messagesForActiveConversation.length > 0;

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (enterAnimationClearTimeoutRef.current !== null) {
        clearTimeout(enterAnimationClearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const persisted = readPersistedChatTabsFromStorage();
    if (persisted !== null) {
      setConversations([...persisted.conversations]);
      setActiveConversationId(persisted.activeConversationId);
      setDraftsByConversationId(() => {
        const next: Record<string, string> = {};
        for (const conversation of persisted.conversations) {
          next[conversation.id] = "";
        }
        return next;
      });
      setMessagesByConversationId(() => {
        const next: Record<string, ChatMessage[]> = {};
        for (const conversation of persisted.conversations) {
          next[conversation.id] = [];
        }
        return next;
      });
    }
    setHasHydratedChatTabs(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedChatTabs) {
      return;
    }
    writePersistedChatTabsToStorage({
      version: PERSISTED_CHAT_TABS_SCHEMA_VERSION,
      conversations,
      activeConversationId,
    });
  }, [activeConversationId, conversations, hasHydratedChatTabs]);

  useEffect(() => {
    const element = messagesScrollRef.current;
    if (!element || !hasConversationMessages) {
      return;
    }
    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
  }, [activeConversationId, hasConversationMessages, messagesForActiveConversation]);

  const isAnyMessageAnimating = animatingMessageIds.size > 0;

  useEffect(() => {
    const element = messagesScrollRef.current;
    if (!element || !isAnyMessageAnimating) {
      return;
    }

    let frameId: number;

    const scrollTick = () => {
      element.scrollTop = element.scrollHeight;
      frameId = requestAnimationFrame(scrollTick);
    };

    frameId = requestAnimationFrame(scrollTick);

    return () => cancelAnimationFrame(frameId);
  }, [isAnyMessageAnimating]);

  useLayoutEffect(() => {
    if (!enteringConversationId) {
      return;
    }

    const list = chatTabListRef.current;
    if (!list) {
      return;
    }

    let isCancelled = false;

    const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const runScroll = (): void => {
      const startScroll = list.scrollLeft;
      const startTime = performance.now();

      const tick = (now: number): void => {
        if (isCancelled) {
          return;
        }
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / CHAT_TAB_ENTER_DURATION_MS);
        const eased = easeInOutCubic(t);
        const targetScroll = Math.max(0, list.scrollWidth - list.clientWidth);
        list.scrollLeft = startScroll + (targetScroll - startScroll) * eased;
        if (t < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    };

    const startId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isCancelled) {
          runScroll();
        }
      });
    });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(startId);
    };
  }, [enteringConversationId]);

  const setActiveDraft = useCallback(
    (value: string) => {
      setDraftsByConversationId((previous) => ({
        ...previous,
        [activeConversationId]: value,
      }));
    },
    [activeConversationId],
  );

  const applyStarterPromptToComposer = useCallback(
    (prompt: string) => {
      setActiveDraft(prompt);
    },
    [setActiveDraft],
  );

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const node = moreMenuContainerRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  const handleWorkspaceLogout = useCallback(async () => {
    if (isLogoutInFlight) {
      return;
    }
    setIsLogoutInFlight(true);
    setIsMoreMenuOpen(false);
    try {
      queryClient.clear();
      clearPersistedChatWorkspaceTabs();
      await logout();
    } finally {
      setIsLogoutInFlight(false);
    }
  }, [isLogoutInFlight, logout, queryClient]);

  const handleAgentPreferenceChange = useCallback((preference: ComposerAgentPreference) => {
    setAgentPreferenceByConversationId((previous) => ({
      ...previous,
      [activeConversationId]: preference,
    }));
  }, [activeConversationId]);

  const handleSendChatMessage = useCallback(
    (plainText: string) => {
      const trimmedText = plainText.trim();
      if (!trimmedText) {
        return;
      }

      const conversationId = activeConversationId;
      const messageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: messageId,
        role: "user",
        text: trimmedText,
        routingPreference: activeAgentPreference,
      };

      const historyAfterUser: ChatMessage[] = [
        ...(messagesByConversationId[conversationId] ?? []),
        userMessage,
      ];

      setMessagesByConversationId((previous) => ({
        ...previous,
        [conversationId]: [...(previous[conversationId] ?? []), userMessage],
      }));

      setDraftsByConversationId((previous) => ({
        ...previous,
        [conversationId]: "",
      }));

      const apiMessages: ChatCompletionMessagePayload[] = historyAfterUser
        .filter((message) => message.text.trim().length > 0)
        .map((message) => ({
          role: message.role,
          content: message.text.trim(),
        }));

      setRepliesInFlight((previous) => ({
        ...previous,
        [conversationId]: (previous[conversationId] ?? 0) + 1,
      }));

      queueMicrotask(() => {
        void requestAssistantReply(conversationId, apiMessages, {
          onStatus: (statusMessage) => {
            setStatusByConversationId((previous) => ({ ...previous, [conversationId]: statusMessage }));
          },
          onSuccess: (assistantText) => {
            const assistantMessageId =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `assistant-${Date.now()}`;

            setAnimatingMessageIds((previous) => new Set(previous).add(assistantMessageId));

            setMessagesByConversationId((previous) => ({
              ...previous,
              [conversationId]: [
                ...(previous[conversationId] ?? []),
                {
                  id: assistantMessageId,
                  role: "assistant",
                  text: assistantText,
                },
              ],
            }));
          },
          onComplete: () => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
          },
          onError: (errorMessage) => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
            const fallbackMessage: ChatMessage = {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `assistant-${Date.now()}`,
              role: "assistant",
              text: `Could not get a reply: ${errorMessage}`,
            };
            setMessagesByConversationId((previous) => ({
              ...previous,
              [conversationId]: [...(previous[conversationId] ?? []), fallbackMessage],
            }));
          },
          onAbort: () => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
          },
        });
      });
    },
    [activeAgentPreference, activeConversationId, messagesByConversationId, requestAssistantReply],
  );

  const handleSendVoiceMessage = useCallback(
    (audioBlob: Blob) => {
      const conversationId = activeConversationId;

      const priorMessages: ChatCompletionMessagePayload[] = (messagesByConversationId[conversationId] ?? [])
        .filter((message) => message.text.trim().length > 0)
        .map((message) => ({
          role: message.role,
          content: message.text.trim(),
        }));

      setRepliesInFlight((previous) => ({
        ...previous,
        [conversationId]: (previous[conversationId] ?? 0) + 1,
      }));

      queueMicrotask(() => {
        void sendVoiceMessage(conversationId, audioBlob, priorMessages, {
          onSuccess: ({ transcript, content }) => {
            const userMessageId =
              typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}`;
            const assistantMessageId =
              typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `assistant-${Date.now()}`;

            setAnimatingMessageIds((previous) => new Set(previous).add(assistantMessageId));

            setMessagesByConversationId((previous) => ({
              ...previous,
              [conversationId]: [
                ...(previous[conversationId] ?? []),
                {
                  id: userMessageId,
                  role: "user",
                  text: transcript,
                },
                {
                  id: assistantMessageId,
                  role: "assistant",
                  text: content,
                  isPlainText: true,
                },
              ],
            }));
          },
          onComplete: () => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
          },
          onError: (errorMessage) => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
            const fallbackMessage: ChatMessage = {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `assistant-${Date.now()}`,
              role: "assistant",
              text: `Could not complete voice chat: ${errorMessage}`,
            };
            setMessagesByConversationId((previous) => ({
              ...previous,
              [conversationId]: [...(previous[conversationId] ?? []), fallbackMessage],
            }));
          },
          onAbort: () => {
            setRepliesInFlight((previous) => decrementInFlightCount(previous, conversationId));
            setStatusByConversationId((previous) => removeKey(previous, conversationId));
          },
        });
      });
    },
    [activeConversationId, messagesByConversationId, sendVoiceMessage],
  );

  const handleAddConversation = useCallback(() => {
    const nextIndex = conversations.length + 1;
    const newId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `conv-${Date.now()}`;
    const next: ConversationTab = {
      id: newId,
      title: `Chat ${nextIndex}`,
    };
    if (enterAnimationClearTimeoutRef.current !== null) {
      clearTimeout(enterAnimationClearTimeoutRef.current);
    }
    setEnteringConversationId(newId);
    enterAnimationClearTimeoutRef.current = setTimeout(() => {
      setEnteringConversationId(null);
      enterAnimationClearTimeoutRef.current = null;
    }, CHAT_ENTER_ANIMATION_CLEAR_MS);

    setConversations((previous) => [...previous, next]);
    setDraftsByConversationId((previous) => ({ ...previous, [newId]: "" }));
    setMessagesByConversationId((previous) => ({ ...previous, [newId]: [] }));
    setActiveConversationId(newId);
  }, [conversations.length]);

  const handleRemoveConversation = useCallback(
    (conversationId: string) => {
      if (conversations.length <= 1) {
        return;
      }

      const indexToRemove = conversations.findIndex((c) => c.id === conversationId);
      if (indexToRemove === -1) {
        return;
      }

      const nextList = conversations.filter((c) => c.id !== conversationId);
      setConversations(nextList);

      setDraftsByConversationId((previous) => {
        const nextDrafts = { ...previous };
        delete nextDrafts[conversationId];
        return nextDrafts;
      });

      setMessagesByConversationId((previous) => {
        const nextMessages = { ...previous };
        delete nextMessages[conversationId];
        return nextMessages;
      });

      abortChatForConversation(conversationId);
      abortVoiceForConversation(conversationId);

      if (conversationId !== activeConversationId) {
        return;
      }

      const fallbackIndex = Math.min(indexToRemove, nextList.length - 1);
      const fallbackId = nextList[fallbackIndex]?.id ?? nextList[0]?.id;
      if (fallbackId) {
        setActiveConversationId(fallbackId);
      }
    },
    [abortChatForConversation, abortVoiceForConversation, activeConversationId, conversations],
  );

  return (
    <WorkspaceShell
      topBar={
        <div className="flex min-h-10 items-center gap-2 rounded-xl border border-white/25 bg-white/12 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
          <p id="chat-tabs-heading" className="sr-only">
            {CHAT_TABLIST_LABEL}
          </p>
          <button
            type="button"
            onClick={handleAddConversation}
            aria-label="New conversation"
            title="New conversation"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/20 text-zinc-800 shadow-sm transition hover:bg-white/35"
          >
            <IconPlus className="h-4 w-4" />
          </button>

          <div
            ref={chatTabListRef}
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
            role="tablist"
            aria-labelledby="chat-tabs-heading"
          >
            {conversations.map((conversation, index) => {
              const isActive = conversation.id === activeConversationId;
              const accentClass = TAB_ICON_ACCENT_CLASSES[index % TAB_ICON_ACCENT_CLASSES.length];
              const tabEnterClass = enteringConversationId === conversation.id ? "animate-chat-tab-enter" : "";

              const tabIcon = (
                <span
                  className={`h-5 w-5 shrink-0 rounded-md ${accentClass} shadow-inner ring-1 ring-black/5`}
                  aria-hidden
                />
              );

              if (isActive && conversations.length > 1) {
                return (
                  <div
                    key={conversation.id}
                    role="presentation"
                    className={`flex h-8 min-w-0 shrink-0 items-stretch rounded-lg border border-white/35 bg-white/95 pl-2 shadow-sm ${tabEnterClass}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected
                      onClick={() => setActiveConversationId(conversation.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 text-left transition"
                    >
                      {tabIcon}
                      <span className="max-w-32 truncate text-[12px] font-medium text-zinc-800 sm:max-w-44">
                        {conversation.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${conversation.title}`}
                      className="flex w-8 shrink-0 items-center justify-center rounded-r-lg text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-900"
                      onClick={() => handleRemoveConversation(conversation.id)}
                    >
                      <IconCloseSmall className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={conversation.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`${
                    isActive
                      ? "flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-white/35 bg-white/95 px-2 shadow-sm transition"
                      : "flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-transparent bg-white/14 px-2 text-white/90 transition hover:bg-white/22"
                  } ${tabEnterClass}`.trim()}
                >
                  {tabIcon}
                  <span
                    className={
                      isActive
                        ? "max-w-32 truncate text-left text-[12px] font-medium text-zinc-800 sm:max-w-44"
                        : "max-w-32 truncate text-left text-[12px] font-medium text-white/95 sm:max-w-44"
                    }
                  >
                    {conversation.title}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1 border-l border-white/25 pl-2 sm:gap-1.5 sm:pl-3">
            <Link
              href="/tasks"
              aria-label="Tasks"
              title="Tasks"
              className={TOP_BAR_ICON_LINK_CLASS}
            >
              <IconCheckSquare className="h-4 w-4" />
            </Link>
            <Link
              href="/background-jobs"
              aria-label="Background jobs"
              title="Background jobs"
              className={TOP_BAR_ICON_LINK_CLASS}
            >
              <IconLayers className="h-4 w-4" />
            </Link>
            <Link
              href="/notifications"
              aria-label="Notifications"
              title="Notifications"
              className={`relative ${TOP_BAR_ICON_LINK_CLASS}`}
            >
              <IconBellNav className="h-4 w-4" />
              {topBarNotificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[10px] font-bold tabular-nums leading-none text-white shadow ring-2 ring-black/30">
                  {topBarNotificationCount > 9 ? "9+" : topBarNotificationCount}
                </span>
              ) : null}
            </Link>
          </div>

          <div ref={moreMenuContainerRef} className="relative shrink-0">
            <button
              type="button"
              id="glass-workspace-more-trigger"
              aria-label="Workspace menu"
              title="Workspace menu"
              aria-expanded={isMoreMenuOpen}
              aria-haspopup="true"
              aria-controls={WORKSPACE_MORE_MENU_DOM_ID}
              onClick={() => setIsMoreMenuOpen((open) => !open)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/14 text-white/85 shadow-sm transition hover:bg-white/22 hover:text-white"
            >
              <IconDotsHorizontal className="h-5 w-5" />
            </button>
            {isMoreMenuOpen ? (
              <div
                id={WORKSPACE_MORE_MENU_DOM_ID}
                role="menu"
                aria-labelledby="glass-workspace-more-trigger"
                className="absolute right-0 top-full z-50 mt-1.5 min-w-54 overflow-hidden rounded-xl border border-white/20 bg-zinc-950/95 py-1 shadow-xl ring-1 ring-black/40 backdrop-blur-md"
              >
                {user?.email ? (
                  <p
                    className="truncate border-b border-white/10 px-3 py-2 text-[11px] leading-snug text-white/55"
                    role="none"
                  >
                    Signed in as
                    <span className="mt-0.5 block truncate font-medium text-white/80">{user.email}</span>
                  </p>
                ) : null}
                <Link
                  href="/tasks"
                  role="menuitem"
                  className={WORKSPACE_MENU_LINK_CLASS}
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <IconCheckSquare className="h-4 w-4 shrink-0 text-white/70" />
                  Tasks
                </Link>
                <Link
                  href="/notifications"
                  role="menuitem"
                  className={WORKSPACE_MENU_LINK_CLASS}
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <IconBellNav className="h-4 w-4 shrink-0 text-white/70" />
                  Notifications
                </Link>
                <Link
                  href="/background-jobs"
                  role="menuitem"
                  className={WORKSPACE_MENU_LINK_CLASS}
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <IconLayers className="h-4 w-4 shrink-0 text-white/70" />
                  Background jobs
                </Link>
                <div className="my-1 h-px bg-white/10" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={WORKSPACE_MENU_LOGOUT_CLASS}
                  disabled={isLogoutInFlight}
                  onClick={() => {
                    void handleWorkspaceLogout();
                  }}
                >
                  {isLogoutInFlight ? "Signing out…" : "Log out"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      }
    >
      <div
        key={activeConversationId}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain ${
          enteringConversationId === activeConversationId ? "animate-chat-panel-enter" : ""
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-black/40 px-2 pt-3 backdrop-blur-sm sm:px-4 lg:pt-4">
          <div
            className={`flex flex-col items-center overflow-hidden transition-all duration-700 ease-in-out ${
              hasConversationMessages
                ? "pointer-events-none max-h-0 min-h-0 shrink-0 scale-95 opacity-0 blur-[2px]"
                : "flex flex-1 shrink-0 flex-col justify-center gap-10 py-8"
            }`}
          >
            <div className="relative mx-auto shrink-0">
              <Image
                src="/assets/orb.png"
                alt=""
                width={152}
                height={152}
                priority
                aria-hidden
                className="h-36 w-36 object-contain drop-shadow-[0_0_28px_rgba(168,85,247,0.55)] sm:h-40 sm:w-40"
              />
            </div>

            <h1 className="text-center text-xl font-medium tracking-tight text-white sm:text-2xl">
              How can Alina help today?
            </h1>
            <p className="max-w-lg px-4 text-center text-sm text-white/55">
              Tap a starter to fill the composer — connect Gmail, Calendar, or Notion below so the assistant can use
              your tools.
            </p>

            <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => applyStarterPromptToComposer(STARTER_PROMPT_GMAIL_SUMMARY)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-4 py-2.5 text-sm text-white/95 backdrop-blur-md transition hover:bg-black/35"
              >
                <IconMail className="h-4 w-4 shrink-0 text-white/85" />
                Gmail triage
              </button>
              <button
                type="button"
                onClick={() => applyStarterPromptToComposer(STARTER_PROMPT_CALENDAR_SNAPSHOT)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-4 py-2.5 text-sm text-white/95 backdrop-blur-md transition hover:bg-black/35"
              >
                <IconCalendarSimple className="h-4 w-4 shrink-0 text-white/85" />
                Calendar snapshot
              </button>
              <button
                type="button"
                onClick={() => applyStarterPromptToComposer(STARTER_PROMPT_WORKSPACE_CAPABILITIES)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-4 py-2.5 text-sm text-white/95 backdrop-blur-md transition hover:bg-black/35"
              >
                <IconLayers className="h-4 w-4 shrink-0 text-white/85" />
                Plan with my tools
              </button>
            </div>
          </div>

          <div
            ref={messagesScrollRef}
            className={`flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-2 transition-all duration-700 ease-in-out ${
              hasConversationMessages
                ? "flex-1 opacity-100"
                : "max-h-0 shrink-0 overflow-hidden opacity-0"
            }`}
            aria-live="polite"
          >
            <div className="flex-1" />
            {messagesForActiveConversation.map((message, index) => {
              const isLatest = index === messagesForActiveConversation.length - 1;
              const isUser = message.role === "user";

              if (!isUser) {
                return (
                  <div
                    key={message.id}
                    className={isLatest ? "animate-chat-message-enter" : ""}
                  >
                    <AssistantMessage
                      text={message.text}
                      shouldAnimate={animatingMessageIds.has(message.id)}
                      onTypingComplete={() => handleTypingComplete(message.id)}
                      isPlainText={message.isPlainText === true}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex px-1 sm:px-2 justify-end ${isLatest ? "animate-chat-message-enter" : ""}`}
                >
                  <div className="max-w-[min(85%,28rem)] rounded-[1.25rem] rounded-br-md bg-[#7c3aed]/92 px-4 py-2.5 text-left text-[15px] leading-snug text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]">
                    {message.text}
                  </div>
                </div>
              );
            })}

            {(repliesInFlight[activeConversationId] ?? 0) > 0 && (
              <div className="flex items-center gap-2.5 px-2 py-3 sm:px-3 animate-chat-message-enter">
                <Image
                  src="/assets/orb.png"
                  alt=""
                  width={24}
                  height={24}
                  aria-hidden
                  className="h-6 w-6 animate-orb-bounce object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                />
                <span
                  key={statusByConversationId[activeConversationId] ?? "thinking"}
                  className="animate-pulse text-sm font-medium text-white/60 transition-all duration-300"
                >
                  {statusByConversationId[activeConversationId] ?? "Thinking..."}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-2 pb-4 pt-1 sm:px-4">
          <div className="mx-auto flex w-full max-w-2xl justify-center">
            <ChatComposer
              draftValue={activeDraft}
              onDraftChange={setActiveDraft}
              isMinimal={hasConversationMessages}
              onSend={handleSendChatMessage}
              onVoiceMessageSend={handleSendVoiceMessage}
              onConnectGmail={connectGmail}
              onConnectNotion={connectNotion}
              onConnectCalendar={connectCalendar}
              onDisconnectGmail={disconnectGmail}
              onDisconnectNotion={disconnectNotion}
              onDisconnectCalendar={disconnectCalendar}
              agentPreference={activeAgentPreference}
              onAgentPreferenceChange={handleAgentPreferenceChange}
              integrationStatus={{
                isGmailConnected: gmailStatus.isConnected,
                isNotionConnected: notionStatus.isConnected,
                isCalendarConnected: calendarStatus.isConnected,
              }}
            />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
