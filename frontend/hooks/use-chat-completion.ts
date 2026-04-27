"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  addControllerToScopeSet,
  clearMapAndAbortAllControllers,
  removeControllerFromScopeSet,
  abortAllControllersInScope,
} from "@/lib/abort-controller-scope";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export interface ChatCompletionMessagePayload {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionHandlers {
  onSuccess: (assistantText: string) => void;
  onComplete: () => void;
  onError: (message: string) => void;
  /** Fired when this request is aborted (tab closed or workspace unmount). */
  onAbort?: () => void;
  /** Fired each time the backend emits a progress status update. */
  onStatus?: (message: string) => void;
}

function getApiBaseUrl(explicit?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  const base = explicit ?? (typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : DEFAULT_API_BASE_URL);
  return base.replace(/\/$/, "");
}

/**
 * Many parallel /chat requests per tab; closing a tab calls `abortConversation` to cancel all for that scope.
 */
export function useChatCompletion(apiBaseUrl?: string) {
  const abortControllersByScopeRef = useRef<Map<string, Set<AbortController>>>(new Map());

  const abortConversation = useCallback((conversationScopeId: string) => {
    abortAllControllersInScope(abortControllersByScopeRef.current, conversationScopeId);
  }, []);

  const requestAssistantReply = useCallback(
    async (
      conversationScopeId: string,
      messages: ChatCompletionMessagePayload[],
      handlers: CompletionHandlers,
    ): Promise<void> => {
      const byScope = abortControllersByScopeRef.current;
      const controller = new AbortController();
      addControllerToScopeSet(byScope, conversationScopeId, controller);
      const baseUrl = getApiBaseUrl(apiBaseUrl);

      try {
        const response = await authenticatedFetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ messages, client_conversation_id: conversationScopeId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text();
          handlers.onError(detail.length > 0 ? detail : response.statusText);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          handlers.onError("No response body from chat API");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let gotDone = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE events are delimited by double newlines
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const rawEvent of events) {
              const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data: "));
              if (!dataLine) continue;

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
              } catch {
                continue;
              }

              const type = parsed.type;

              if (type === "status" && typeof parsed.message === "string") {
                handlers.onStatus?.(parsed.message);
              } else if (type === "done") {
                const content = parsed.content;
                if (typeof content !== "string") {
                  handlers.onError("Invalid response from chat API");
                  return;
                }
                gotDone = true;
                handlers.onSuccess(content);
                handlers.onComplete();
              } else if (type === "error" && typeof parsed.message === "string") {
                handlers.onError(parsed.message);
                return;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (!gotDone) {
          handlers.onError("Connection closed before response completed");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          handlers.onAbort?.();
          return;
        }
        const message = error instanceof Error ? error.message : "Request failed";
        handlers.onError(message);
      } finally {
        removeControllerFromScopeSet(abortControllersByScopeRef.current, conversationScopeId, controller);
      }
    },
    [apiBaseUrl],
  );

  useEffect(
    () => () => {
      clearMapAndAbortAllControllers(abortControllersByScopeRef.current);
    },
    [],
  );

  return { requestAssistantReply, abortConversation };
}
