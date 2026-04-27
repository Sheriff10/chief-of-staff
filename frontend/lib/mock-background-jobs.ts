export const JOB_STATUS_ACTIVE = "active" as const;
export const JOB_STATUS_PAUSED = "paused" as const;
export const JOB_STATUS_ENDED = "ended" as const;

export type JobStatus = typeof JOB_STATUS_ACTIVE | typeof JOB_STATUS_PAUSED | typeof JOB_STATUS_ENDED;

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  [JOB_STATUS_ACTIVE]: "Active",
  [JOB_STATUS_PAUSED]: "Paused",
  [JOB_STATUS_ENDED]: "Ended",
};

export const ACTION_TYPE_EMAIL = "email" as const;
export const ACTION_TYPE_CALENDAR = "calendar" as const;
export const ACTION_TYPE_NOTION = "notion" as const;
export const ACTION_TYPE_CUSTOM = "custom" as const;

export type ActionType =
  | typeof ACTION_TYPE_EMAIL
  | typeof ACTION_TYPE_CALENDAR
  | typeof ACTION_TYPE_NOTION
  | typeof ACTION_TYPE_CUSTOM;

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  [ACTION_TYPE_EMAIL]: "Email",
  [ACTION_TYPE_CALENDAR]: "Calendar",
  [ACTION_TYPE_NOTION]: "Notion",
  [ACTION_TYPE_CUSTOM]: "Custom",
};

export const RUN_OUTCOME_SUCCESS = "success" as const;
export const RUN_OUTCOME_FAILED = "failed" as const;
export const RUN_OUTCOME_SKIPPED = "skipped" as const;

export type RunOutcome =
  | typeof RUN_OUTCOME_SUCCESS
  | typeof RUN_OUTCOME_FAILED
  | typeof RUN_OUTCOME_SKIPPED;

export const RUN_OUTCOME_LABEL: Record<RunOutcome, string> = {
  [RUN_OUTCOME_SUCCESS]: "Success",
  [RUN_OUTCOME_FAILED]: "Failed",
  [RUN_OUTCOME_SKIPPED]: "Skipped",
};

export const TRACE_STEP_INTENT = "intent" as const;
export const TRACE_STEP_TOOL = "tool" as const;
export const TRACE_STEP_APPROVAL = "approval" as const;
export const TRACE_STEP_EMIT = "emit" as const;

export type TraceStepKind =
  | typeof TRACE_STEP_INTENT
  | typeof TRACE_STEP_TOOL
  | typeof TRACE_STEP_APPROVAL
  | typeof TRACE_STEP_EMIT;

export interface ScheduleAction {
  readonly actionType: ActionType;
  readonly label: string;
}

export interface BackgroundJob {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly scheduleDescription: string;
  readonly timezoneLabel: string;
  readonly actions: readonly ScheduleAction[];
  readonly status: JobStatus;
  readonly nextRunIso: string | null;
  /** Inclusive: schedule may first run at or after this instant. */
  readonly scheduleStartsAtIso?: string;
  /** Exclusive: no run at or after this instant. */
  readonly scheduleEndsAtIso?: string;
  readonly createdAtIso: string;
  readonly endedAtIso?: string;
}

export interface AgentTraceStep {
  readonly id: string;
  readonly agentLabel: string;
  readonly stepKind: TraceStepKind;
  readonly title: string;
  readonly detail: string;
  readonly atIso: string;
}

export interface JobRun {
  readonly id: string;
  readonly jobId: string;
  readonly jobTitle: string;
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
  readonly outcome: RunOutcome;
  readonly detail: string;
  readonly durationMs: number;
  readonly traces: readonly AgentTraceStep[];
}

export const MOCK_BACKGROUND_JOBS: readonly BackgroundJob[] = [
  {
    id: "job-email-digest",
    title: "Morning partner email",
    instruction:
      "Send a short status email to partner@mail.com every weekday at 10:00 AM and attach tomorrow’s calendar conflicts.",
    scheduleDescription: "Weekdays at 10:00 AM",
    timezoneLabel: "America/Los_Angeles",
    actions: [
      { actionType: ACTION_TYPE_EMAIL, label: "Email partner@mail.com" },
      { actionType: ACTION_TYPE_CALENDAR, label: "Attach next-day conflicts" },
    ],
    status: JOB_STATUS_ACTIVE,
    nextRunIso: "2026-04-24T17:00:00.000Z",
    createdAtIso: "2026-04-01T12:00:00.000Z",
  },
  {
    id: "job-weekly-rollups",
    title: "Weekly metrics rollup",
    instruction: "Compile inbox and calendar metrics into a Notion page every Monday.",
    scheduleDescription: "Every Monday at 9:00 AM",
    timezoneLabel: "America/Los_Angeles",
    actions: [
      { actionType: ACTION_TYPE_EMAIL, label: "Digest to leadership@" },
      { actionType: ACTION_TYPE_NOTION, label: "Update Metrics DB" },
    ],
    status: JOB_STATUS_ACTIVE,
    nextRunIso: "2026-04-28T16:00:00.000Z",
    createdAtIso: "2026-03-15T09:30:00.000Z",
  },
  {
    id: "job-meeting-prep",
    title: "Meeting prep brief",
    instruction: "Draft a one-page brief before the executive stand-up.",
    scheduleDescription: "Weekdays at 8:30 AM",
    timezoneLabel: "America/Los_Angeles",
    actions: [{ actionType: ACTION_TYPE_CALENDAR, label: "Attach stand-up agenda" }],
    status: JOB_STATUS_PAUSED,
    nextRunIso: "2026-04-23T15:30:00.000Z",
    createdAtIso: "2026-02-10T14:00:00.000Z",
  },
  {
    id: "job-q1-automation",
    title: "Q1 investor automation",
    instruction: "Weekly package for investors — superseded by new CRM workflow.",
    scheduleDescription: "Ended",
    timezoneLabel: "America/Los_Angeles",
    actions: [
      { actionType: ACTION_TYPE_EMAIL, label: "Mail investors@" },
      { actionType: ACTION_TYPE_NOTION, label: "Snapshot funnel" },
    ],
    status: JOB_STATUS_ENDED,
    nextRunIso: null,
    createdAtIso: "2025-12-01T09:00:00.000Z",
    endedAtIso: "2026-03-31T23:59:59.000Z",
  },
  {
    id: "job-beta-digest",
    title: "Beta pilot digest",
    instruction: "Daily Slack-style summary for the beta cohort (pilot concluded).",
    scheduleDescription: "Ended",
    timezoneLabel: "America/Los_Angeles",
    actions: [
      { actionType: ACTION_TYPE_EMAIL, label: "Cohort inbox" },
      { actionType: ACTION_TYPE_CUSTOM, label: "Summarize feedback" },
    ],
    status: JOB_STATUS_ENDED,
    nextRunIso: null,
    createdAtIso: "2026-01-05T08:00:00.000Z",
    endedAtIso: "2026-04-15T18:00:00.000Z",
  },
];

const TRACE_RUN_501: readonly AgentTraceStep[] = [
  {
    id: "t501-a",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_INTENT,
    title: "Classified run",
    detail: "Scheduled job job-email-digest · intent = outbound_status_email",
    atIso: "2026-04-23T17:00:02.100Z",
  },
  {
    id: "t501-b",
    agentLabel: "Calendar agent",
    stepKind: TRACE_STEP_TOOL,
    title: "Fetched conflicts",
    detail: "calendar.list_events(day=2026-04-25) → 2 blocking holds",
    atIso: "2026-04-23T17:00:05.400Z",
  },
  {
    id: "t501-c",
    agentLabel: "Draft agent",
    stepKind: TRACE_STEP_TOOL,
    title: "Draft body",
    detail: "compose_email(template=status_plain, recipients=[partner@mail.com])",
    atIso: "2026-04-23T17:00:11.200Z",
  },
  {
    id: "t501-d",
    agentLabel: "Approval gate",
    stepKind: TRACE_STEP_APPROVAL,
    title: "Queued for user",
    detail: "Write held until approval node confirms send",
    atIso: "2026-04-23T17:00:14.800Z",
  },
  {
    id: "t501-e",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_EMIT,
    title: "Run finished",
    detail: "Outcome success · artifacts: draft_id=em_9dx2",
    atIso: "2026-04-23T17:00:18.450Z",
  },
];

const TRACE_RUN_500: readonly AgentTraceStep[] = [
  {
    id: "t500-a",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_INTENT,
    title: "Classified run",
    detail: "Scheduled job job-email-digest",
    atIso: "2026-04-22T17:00:01.800Z",
  },
  {
    id: "t500-b",
    agentLabel: "Gmail tool",
    stepKind: TRACE_STEP_TOOL,
    title: "Sent message",
    detail: "gmail.send(thread=…, approved=true)",
    atIso: "2026-04-22T17:00:12.100Z",
  },
  {
    id: "t500-c",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_EMIT,
    title: "Run finished",
    detail: "Outcome success",
    atIso: "2026-04-22T17:00:14.200Z",
  },
];

const TRACE_RUN_499: readonly AgentTraceStep[] = [
  {
    id: "t499-a",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_INTENT,
    title: "Classified run",
    detail: "Scheduled job job-weekly-rollups",
    atIso: "2026-04-21T16:00:04.000Z",
  },
  {
    id: "t499-b",
    agentLabel: "Notion MCP",
    stepKind: TRACE_STEP_TOOL,
    title: "Upsert blocked",
    detail: "notion.pages.update timeout after 30s — circuit broke",
    atIso: "2026-04-21T16:02:34.000Z",
  },
  {
    id: "t499-c",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_EMIT,
    title: "Run finished",
    detail: "Outcome failed · retry_policy=next_window",
    atIso: "2026-04-21T16:02:41.900Z",
  },
];

const TRACE_RUN_498: readonly AgentTraceStep[] = [
  {
    id: "t498-a",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_INTENT,
    title: "Classified run",
    detail: "Scheduled job job-email-digest",
    atIso: "2026-04-21T17:00:02.000Z",
  },
  {
    id: "t498-b",
    agentLabel: "Policy guard",
    stepKind: TRACE_STEP_APPROVAL,
    title: "Holiday hold",
    detail: "calendar.is_holidays=true → outbound sends suppressed",
    atIso: "2026-04-21T17:00:03.100Z",
  },
  {
    id: "t498-c",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_EMIT,
    title: "Run skipped",
    detail: "Outcome skipped",
    atIso: "2026-04-21T17:00:03.500Z",
  },
];

const TRACE_RUN_497: readonly AgentTraceStep[] = [
  {
    id: "t497-a",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_INTENT,
    title: "Classified run",
    detail: "Scheduled job job-meeting-prep",
    atIso: "2026-04-19T15:30:01.000Z",
  },
  {
    id: "t497-b",
    agentLabel: "Calendar agent",
    stepKind: TRACE_STEP_TOOL,
    title: "Linked brief",
    detail: "calendar.attach_notes(event_id=standup, doc=brief_md)",
    atIso: "2026-04-19T15:30:44.000Z",
  },
  {
    id: "t497-c",
    agentLabel: "Orchestrator",
    stepKind: TRACE_STEP_EMIT,
    title: "Run finished",
    detail: "Outcome success",
    atIso: "2026-04-19T15:31:02.400Z",
  },
];

export const MOCK_JOB_RUNS: readonly JobRun[] = [
  {
    id: "run-501",
    jobId: "job-email-digest",
    jobTitle: "Morning partner email",
    startedAtIso: "2026-04-23T17:00:02.100Z",
    finishedAtIso: "2026-04-23T17:00:18.450Z",
    outcome: RUN_OUTCOME_SUCCESS,
    detail: "Draft created and queued for approval (2 recipients).",
    durationMs: 16350,
    traces: TRACE_RUN_501,
  },
  {
    id: "run-500",
    jobId: "job-email-digest",
    jobTitle: "Morning partner email",
    startedAtIso: "2026-04-22T17:00:01.800Z",
    finishedAtIso: "2026-04-22T17:00:14.200Z",
    outcome: RUN_OUTCOME_SUCCESS,
    detail: "Sent after approval.",
    durationMs: 12400,
    traces: TRACE_RUN_500,
  },
  {
    id: "run-499",
    jobId: "job-weekly-rollups",
    jobTitle: "Weekly metrics rollup",
    startedAtIso: "2026-04-21T16:00:04.000Z",
    finishedAtIso: "2026-04-21T16:02:41.900Z",
    outcome: RUN_OUTCOME_FAILED,
    detail: "Notion MCP timeout after 30s — retry scheduled.",
    durationMs: 157900,
    traces: TRACE_RUN_499,
  },
  {
    id: "run-498",
    jobId: "job-email-digest",
    jobTitle: "Morning partner email",
    startedAtIso: "2026-04-21T17:00:02.000Z",
    finishedAtIso: "2026-04-21T17:00:03.500Z",
    outcome: RUN_OUTCOME_SKIPPED,
    detail: "Holiday calendar blocked automated sends.",
    durationMs: 1500,
    traces: TRACE_RUN_498,
  },
  {
    id: "run-497",
    jobId: "job-meeting-prep",
    jobTitle: "Meeting prep brief",
    startedAtIso: "2026-04-19T15:30:01.000Z",
    finishedAtIso: "2026-04-19T15:31:02.400Z",
    outcome: RUN_OUTCOME_SUCCESS,
    detail: "Brief attached to calendar event notes.",
    durationMs: 61400,
    traces: TRACE_RUN_497,
  },
];

export function countJobsByStatus(jobs: readonly BackgroundJob[]): Record<JobStatus, number> {
  return jobs.reduce(
    (accumulator, job) => {
      accumulator[job.status] += 1;
      return accumulator;
    },
    { [JOB_STATUS_ACTIVE]: 0, [JOB_STATUS_PAUSED]: 0, [JOB_STATUS_ENDED]: 0 },
  );
}

export function isOngoingSchedule(job: BackgroundJob): boolean {
  return job.status === JOB_STATUS_ACTIVE || job.status === JOB_STATUS_PAUSED;
}

export function partitionSchedulesByLifecycle(jobs: readonly BackgroundJob[]): {
  ongoing: BackgroundJob[];
  ended: BackgroundJob[];
} {
  const ongoing: BackgroundJob[] = [];
  const ended: BackgroundJob[] = [];
  for (const job of jobs) {
    if (isOngoingSchedule(job)) {
      ongoing.push(job);
    } else if (job.status === JOB_STATUS_ENDED) {
      ended.push(job);
    }
  }
  return { ongoing, ended };
}
