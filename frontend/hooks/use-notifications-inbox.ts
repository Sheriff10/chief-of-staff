"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  NOTIFICATIONS_INBOX_QUERY_KEY,
  NOTIFICATIONS_UNREAD_COUNT_QUERY_KEY,
} from "@/lib/notifications-query-keys";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  NOTIFICATION_CATEGORY_AGENT,
  NOTIFICATION_CATEGORY_BACKGROUND_JOB,
  NOTIFICATION_CATEGORY_CALENDAR,
  NOTIFICATION_CATEGORY_EMAIL,
  NOTIFICATION_CATEGORY_SYSTEM,
  type NotificationCategory,
  type NotificationItem,
} from "@/lib/mock-notifications";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

interface ApiNotificationRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly is_read: boolean;
  readonly created_at_iso: string;
}

function mapCategory(raw: string): NotificationCategory {
  switch (raw) {
    case NOTIFICATION_CATEGORY_EMAIL:
      return NOTIFICATION_CATEGORY_EMAIL;
    case NOTIFICATION_CATEGORY_CALENDAR:
      return NOTIFICATION_CATEGORY_CALENDAR;
    case NOTIFICATION_CATEGORY_AGENT:
      return NOTIFICATION_CATEGORY_AGENT;
    case NOTIFICATION_CATEGORY_SYSTEM:
      return NOTIFICATION_CATEGORY_SYSTEM;
    case NOTIFICATION_CATEGORY_BACKGROUND_JOB:
      return NOTIFICATION_CATEGORY_BACKGROUND_JOB;
    default:
      return NOTIFICATION_CATEGORY_SYSTEM;
  }
}

function mapRow(row: ApiNotificationRow): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: mapCategory(row.category),
    isRead: row.is_read,
    createdAtIso: row.created_at_iso,
  };
}

async function fetchNotificationsInbox(): Promise<readonly NotificationItem[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/notifications`);
  if (!response.ok) {
    throw new Error("Could not load notifications.");
  }
  const data = (await response.json()) as ApiNotificationRow[];
  return data.map(mapRow);
}

function invalidateNotificationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_INBOX_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_COUNT_QUERY_KEY });
}

export function useNotificationsInbox() {
  const queryClient = useQueryClient();

  const inboxQuery = useQuery({
    queryKey: NOTIFICATIONS_INBOX_QUERY_KEY,
    queryFn: fetchNotificationsInbox,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await authenticatedFetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Mark as read failed.");
      }
    },
    onSettled: () => {
      invalidateNotificationQueries(queryClient);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedFetch(`${API_BASE_URL}/notifications/read-all`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Mark all as read failed.");
      }
    },
    onSettled: () => {
      invalidateNotificationQueries(queryClient);
    },
  });

  const loadError =
    inboxQuery.isError && inboxQuery.error instanceof Error
      ? inboxQuery.error.message
      : inboxQuery.isError
        ? "Could not load notifications."
        : null;

  return {
    items: inboxQuery.data ?? [],
    isLoading: inboxQuery.isPending,
    loadError,
    refresh: inboxQuery.refetch,
    markAsRead: (notificationId: string) => {
      markAsReadMutation.mutate(notificationId);
    },
    markAllAsRead: () => {
      markAllAsReadMutation.mutate();
    },
  };
}
