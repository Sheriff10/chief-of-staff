"use client";

import Link from "next/link";

const FEATURED_EVENT_TITLE = "Founders Meeting";
const FEATURED_EVENT_DATE_LINE = "Tuesday, January 2";
const FEATURED_EVENT_TIME_LINE = "2 PM - 4 PM";

const DUMMY_ACTIVITIES = [
  { subject: "Re: Q2 invoice bundle", action: "Triaged & labeled", ago: "12m ago" },
  { subject: "Notes — Product sync", action: "Draft reply sent", ago: "48m ago" },
  { subject: "Low-priority security digest", action: "Archived + rule", ago: "Today" },
];

const MAX_ACTIVITY_ROWS = 2;

const DUMMY_STATS = [
  { label: "Tasks closed", value: "12", hint: "this week" },
  { label: "Inbox handled", value: "8", hint: "today" },
  { label: "Est. time back", value: "2.4h", hint: "rolling 7d" },
  { label: "Agent runs", value: "24", hint: "today" },
];

function IconGiftTag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="#dc2626"
        d="M4 9a2 2 0 012-2h2.5a2 2 0 011.6.8L12 11l2.9-3.2A2 2 0 0116.5 7H19a2 2 0 012 2v2.5a2 2 0 01-.6 1.4l-7 8.2a2 2 0 01-3.08 0l-7-8.2A2 2 0 014 11.5V9z"
      />
      <path fill="#fca5a5" d="M8 5h2v4H8z" />
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

function IconCalendarSmall({ className }: { className?: string }) {
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

function IconClockSmall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconBellSmall({ className }: { className?: string }) {
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

export interface DashboardSidebarProps {
  isAgentTracesOpen: boolean;
  onAgentTracesToggle: () => void;
}

export function DashboardSidebar({ isAgentTracesOpen, onAgentTracesToggle }: DashboardSidebarProps) {
  const visibleActivities = DUMMY_ACTIVITIES.slice(0, MAX_ACTIVITY_ROWS);

  return (
    <aside
      className="flex max-h-[min(260px,38vh)] min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border border-white/12 bg-black/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md lg:max-h-full lg:w-72 lg:shrink-0 lg:self-stretch"
      aria-label="Dashboard — stats, calendar, and agent activity"
    >
      <div className="shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Context</p>
        <p className="mt-0.5 text-sm font-medium text-white/85">Today · overview</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-black/35 p-3">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">Quick stats</h2>
        <ul className="grid grid-cols-2 gap-2">
          {DUMMY_STATS.map((stat) => (
            <li key={stat.label} className="rounded-lg border border-white/5 bg-white/4 px-3 py-2">
              <p className="text-[11px] leading-tight text-white/45">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-white">{stat.value}</p>
              <p className="mt-1 text-[10px] leading-tight text-white/35">{stat.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sidebar-calendar-heading">
        <h2 id="sidebar-calendar-heading" className="sr-only">
          Next calendar event
        </h2>
        <div className="rounded-2xl border border-white/12 bg-black/35 px-4 pb-4 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
              <IconGiftTag className="h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
            </span>
            <button
              type="button"
              className="rounded-md p-1 text-white/45 transition hover:bg-white/10 hover:text-white/90"
              aria-label="Event options"
            >
              <IconDotsHorizontal className="h-5 w-5" />
            </button>
          </div>

          <h3 className="mt-1 text-xl font-bold leading-snug tracking-tight text-white/95">{FEATURED_EVENT_TITLE}</h3>

          <div className="mt-3 space-y-2 text-sm font-medium text-white/78">
            <div className="flex items-center gap-2">
              <IconCalendarSmall className="h-4 w-4 shrink-0 text-white/45" />
              <span>{FEATURED_EVENT_DATE_LINE}</span>
            </div>
            <div className="flex items-center gap-2">
              <IconClockSmall className="h-4 w-4 shrink-0 text-white/45" />
              <span>{FEATURED_EVENT_TIME_LINE}</span>
            </div>
          </div>

          <div className="my-4 h-px bg-white/10" />

          <Link
            href="/calendar"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/8 px-4 py-2.5 text-sm font-medium text-white/92 shadow-sm transition hover:border-white/28 hover:bg-white/14"
          >
            <IconBellSmall className="h-4 w-4 text-white/75" aria-hidden />
            View all calendar
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-black/35 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Recent Agents activities</h2>
          <button
            type="button"
            onClick={onAgentTracesToggle}
            aria-pressed={isAgentTracesOpen}
            className={`shrink-0 text-[11px] font-medium underline-offset-2 transition ${
              isAgentTracesOpen
                ? "rounded-md bg-violet-500/25 px-2 py-0.5 text-white"
                : "text-violet-300/95 hover:text-white hover:underline"
            }`}
          >
            {isAgentTracesOpen ? "Close" : "More"}
          </button>
        </div>
        <ul className="grid grid-rows-2 gap-2">
          {visibleActivities.map((activity) => (
            <li
              key={activity.subject}
              className="min-h-0 rounded-lg border border-white/5 bg-white/4 px-3 py-2"
            >
              <p className="line-clamp-2 text-sm leading-snug text-white/88">{activity.subject}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-200/90">{activity.action}</span>
                <span>{activity.ago}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
