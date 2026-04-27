export const NOTIFICATION_CATEGORY_EMAIL = "email" as const;
export const NOTIFICATION_CATEGORY_CALENDAR = "calendar" as const;
export const NOTIFICATION_CATEGORY_AGENT = "agent" as const;
export const NOTIFICATION_CATEGORY_SYSTEM = "system" as const;
export const NOTIFICATION_CATEGORY_BACKGROUND_JOB = "background_job" as const;

export type NotificationCategory =
  | typeof NOTIFICATION_CATEGORY_EMAIL
  | typeof NOTIFICATION_CATEGORY_CALENDAR
  | typeof NOTIFICATION_CATEGORY_AGENT
  | typeof NOTIFICATION_CATEGORY_SYSTEM
  | typeof NOTIFICATION_CATEGORY_BACKGROUND_JOB;

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  [NOTIFICATION_CATEGORY_EMAIL]: "Email",
  [NOTIFICATION_CATEGORY_CALENDAR]: "Calendar",
  [NOTIFICATION_CATEGORY_AGENT]: "Agent",
  [NOTIFICATION_CATEGORY_SYSTEM]: "System",
  [NOTIFICATION_CATEGORY_BACKGROUND_JOB]: "Scheduled job",
};

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: NotificationCategory;
  readonly createdAtIso: string;
  readonly isRead: boolean;
}

export const MOCK_NOTIFICATIONS: readonly NotificationItem[] = [
  {
    id: "ntf-1",
    title: "Draft ready for approval",
    body: "Morning partner email — ready to send to partner@mail.com after you confirm.",
    category: NOTIFICATION_CATEGORY_AGENT,
    createdAtIso: "2026-04-23T16:42:00.000Z",
    isRead: false,
  },
  {
    id: "ntf-2",
    title: "Meeting moved",
    body: "Design sync shifted to 3:00 PM — Chief of Staff updated your calendar.",
    category: NOTIFICATION_CATEGORY_CALENDAR,
    createdAtIso: "2026-04-23T14:05:00.000Z",
    isRead: false,
  },
  {
    id: "ntf-3",
    title: "Weekly rollup completed",
    body: "Metrics snapshot was written to your Notion database.",
    category: NOTIFICATION_CATEGORY_AGENT,
    createdAtIso: "2026-04-23T09:12:00.000Z",
    isRead: false,
  },
  {
    id: "ntf-4",
    title: "Gmail connected",
    body: "Your inbox is linked — you can ask about threads and drafts.",
    category: NOTIFICATION_CATEGORY_SYSTEM,
    createdAtIso: "2026-04-22T11:00:00.000Z",
    isRead: true,
  },
  {
    id: "ntf-5",
    title: "Low-priority digest archived",
    body: "Security newsletter was filed per your rules.",
    category: NOTIFICATION_CATEGORY_EMAIL,
    createdAtIso: "2026-04-21T08:30:00.000Z",
    isRead: true,
  },
];

export function countUnreadNotifications(items: readonly NotificationItem[]): number {
  return items.filter((item) => !item.isRead).length;
}
