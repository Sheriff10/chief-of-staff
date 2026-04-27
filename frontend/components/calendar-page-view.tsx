"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useMemo, useState } from "react";

const WEEK_STARTS_ON_SUNDAY = 0;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const TASK_STATUS_TODO = "todo" as const;
const TASK_STATUS_IN_PROGRESS = "in_progress" as const;
const TASK_STATUS_BLOCKED = "blocked" as const;
const TASK_STATUS_DONE = "done" as const;

type TaskStatus =
  | typeof TASK_STATUS_TODO
  | typeof TASK_STATUS_IN_PROGRESS
  | typeof TASK_STATUS_BLOCKED
  | typeof TASK_STATUS_DONE;

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TASK_STATUS_TODO]: "To do",
  [TASK_STATUS_IN_PROGRESS]: "In progress",
  [TASK_STATUS_BLOCKED]: "Blocked",
  [TASK_STATUS_DONE]: "Done",
};

type MarkerTone = "orange" | "emerald" | "sky" | "rose";

const MARKER_SWATCH_CLASS: Record<MarkerTone, string> = {
  orange: "bg-orange-400 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
  emerald: "bg-emerald-400 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
  sky: "bg-sky-400 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
  rose: "bg-rose-400 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
};

interface DemoScheduledEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  markers: readonly MarkerTone[];
}

interface DemoTask {
  id: string;
  title: string;
  dueLabel: string;
  status: TaskStatus;
}

const DEMO_TASKS: DemoTask[] = [
  {
    id: "task-1",
    title: "Draft investor update",
    dueLabel: "Apr 21",
    status: TASK_STATUS_IN_PROGRESS,
  },
  {
    id: "task-2",
    title: "Expense report — March",
    dueLabel: "Apr 22",
    status: TASK_STATUS_TODO,
  },
  {
    id: "task-3",
    title: "Design sync notes → Notion",
    dueLabel: "Apr 20",
    status: TASK_STATUS_DONE,
  },
  {
    id: "task-4",
    title: "Unblock API credentials",
    dueLabel: "Apr 23",
    status: TASK_STATUS_BLOCKED,
  },
  {
    id: "task-5",
    title: "Review hiring pipeline",
    dueLabel: "Apr 24",
    status: TASK_STATUS_TODO,
  },
];

function buildDemoSchedule(anchor: Date): DemoScheduledEvent[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  return [
    {
      id: "ev-1",
      title: "Creature Workshop",
      start: new Date(y, m, 9, 10, 0),
      end: new Date(y, m, 9, 12, 0),
      markers: ["orange", "sky"],
    },
    {
      id: "ev-2",
      title: "Design review",
      start: new Date(y, m, 10, 14, 0),
      end: new Date(y, m, 10, 15, 30),
      markers: ["emerald"],
    },
    {
      id: "ev-3",
      title: "Founders Meeting",
      start: new Date(y, m, 15, 14, 0),
      end: new Date(y, m, 15, 16, 0),
      markers: ["orange", "rose"],
    },
    {
      id: "ev-4",
      title: "Team Meeting",
      start: new Date(y, m, 15, 10, 0),
      end: new Date(y, m, 15, 12, 0),
      markers: ["sky", "emerald"],
    },
    {
      id: "ev-5",
      title: "Investor prep",
      start: new Date(y, m, 21, 9, 0),
      end: new Date(y, m, 21, 12, 30),
      markers: ["orange", "emerald", "sky"],
    },
    {
      id: "ev-6",
      title: "Quarterly review",
      start: new Date(y, m, 25, 11, 0),
      end: new Date(y, m, 25, 12, 0),
      markers: ["rose"],
    },
  ];
}

function getCalendarWeeks(visibleMonth: Date): Date[][] {
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON_SUNDAY });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON_SUNDAY });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function getEventsForDay(day: Date, events: DemoScheduledEvent[]): DemoScheduledEvent[] {
  return events.filter((event) => isSameDay(event.start, day));
}

function formatEventRange(event: DemoScheduledEvent): string {
  const dateLine = format(event.start, "MMMM d, yyyy");
  if (isSameDay(event.start, event.end)) {
    return `${dateLine}, ${format(event.start, "h:mm a")} – ${format(event.end, "h:mm a")}`;
  }
  return `${format(event.start, "MMMM d, yyyy, h:mm a")} – ${format(event.end, "MMMM d, yyyy, h:mm a")}`;
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function getStatusBadgeClasses(status: TaskStatus): string {
  switch (status) {
    case TASK_STATUS_DONE:
      return "bg-emerald-500/15 text-emerald-200/95 ring-emerald-400/25";
    case TASK_STATUS_IN_PROGRESS:
      return "bg-sky-500/15 text-sky-100/95 ring-sky-400/25";
    case TASK_STATUS_BLOCKED:
      return "bg-rose-500/15 text-rose-100/95 ring-rose-400/25";
    default:
      return "bg-white/8 text-white/78 ring-white/12";
  }
}

export function CalendarPageView() {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date();
    return today;
  });
  const [eventSearch, setEventSearch] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  const allEvents = useMemo(() => buildDemoSchedule(visibleMonth), [visibleMonth]);

  const dayHasEvent = useMemo(() => {
    const set = new Set<string>();
    for (const event of allEvents) {
      set.add(format(event.start, "yyyy-MM-dd"));
    }
    return set;
  }, [allEvents]);

  const weeks = useMemo(() => getCalendarWeeks(visibleMonth), [visibleMonth]);

  const eventsForSelectedDay = useMemo(
    () => getEventsForDay(selectedDay, allEvents),
    [selectedDay, allEvents],
  );

  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) {
      return eventsForSelectedDay;
    }
    return eventsForSelectedDay.filter((event) => event.title.toLowerCase().includes(query));
  }, [eventsForSelectedDay, eventSearch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1 pb-4 pt-2 sm:px-2">
      <section
        aria-labelledby="custom-calendar-heading"
        className="rounded-2xl border border-white/12 bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-5"
      >
        <h2 id="custom-calendar-heading" className="sr-only">
          Month view
        </h2>

        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setVisibleMonth((previous) => subMonths(previous, 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/6 text-white/75 transition hover:border-white/25 hover:bg-white/12 hover:text-white"
            aria-label="Previous month"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 text-center text-lg font-semibold tracking-tight text-white/95">
            {format(visibleMonth, "MMMM yyyy")}
          </p>
          <button
            type="button"
            onClick={() => setVisibleMonth((previous) => addMonths(previous, 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/6 text-white/75 transition hover:border-white/25 hover:bg-white/12 hover:text-white"
            aria-label="Next month"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-2 text-center">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/38">
              {label}
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          {weeks.map((week) => (
            <div key={week[0].toISOString()} className="grid grid-cols-7 gap-2">
              {week.map((day) => {
                const inMonth = isSameMonth(day, visibleMonth);
                const selected = isSameDay(day, selectedDay);
                const today = isToday(day);
                const dayKey = format(day, "yyyy-MM-dd");
                const hasEvent = dayHasEvent.has(dayKey);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day);
                      if (!isSameMonth(day, visibleMonth)) {
                        setVisibleMonth(startOfMonth(day));
                      }
                    }}
                    className={`relative flex min-h-13 flex-col items-center justify-center rounded-2xl text-sm font-medium transition ${
                      selected
                        ? "bg-linear-to-b from-orange-500 via-rose-500 to-rose-600 text-white shadow-[0_10px_28px_-12px_rgba(249,115,22,0.55)]"
                        : today
                          ? "ring-2 ring-rose-400/75 ring-offset-2 ring-offset-zinc-950 bg-white/6 text-white/90 hover:bg-white/10"
                          : "bg-white/6 text-white/88 hover:bg-white/11"
                    } ${!inMonth && !selected ? "text-white/30" : ""} `.trim()}
                  >
                    <span className={`relative z-1 ${!inMonth && !selected ? "opacity-55" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {hasEvent ? (
                      <span
                        className={`absolute bottom-2 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full ${
                          selected ? "bg-white/90" : "bg-fuchsia-400/90"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/12 bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-5">
        <p className="text-xs text-white/40">
          Showing all {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
          {eventsForSelectedDay.length > 0 ? (
            <span className="text-white/28"> · {format(selectedDay, "MMM d")}</span>
          ) : null}
        </p>

        <ul className="mt-4 space-y-1">
          {filteredEvents.length === 0 ? (
            <li className="rounded-xl border border-white/8 bg-white/3 px-4 py-8 text-center text-sm text-white/45">
              {eventsForSelectedDay.length === 0
                ? "No events on this day."
                : "No events match your search."}
            </li>
          ) : (
            filteredEvents.map((event) => {
              const isHighlighted = highlightedEventId === event.id;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setHighlightedEventId(event.id)}
                    className={`flex w-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                      isHighlighted
                        ? "border-white/18 bg-white/9"
                        : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold leading-snug text-white/92">{event.title}</span>
                      <span className="flex shrink-0 gap-1 pt-0.5">
                        {event.markers.map((tone, markerIndex) => (
                          <span
                            key={`${event.id}-m-${markerIndex}`}
                            className={`h-2.5 w-2.5 rounded-sm ${MARKER_SWATCH_CLASS[tone]}`}
                            aria-hidden
                          />
                        ))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-white/48">
                      <IconClock className="h-4 w-4 shrink-0 text-white/35" />
                      <span>{formatEventRange(event)}</span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="relative mt-5">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={eventSearch}
            onChange={(event) => setEventSearch(event.target.value)}
            placeholder="Search for events..."
            className="w-full rounded-xl border border-white/12 bg-black/35 py-3 pl-10 pr-4 text-sm text-white/90 shadow-inner placeholder:text-white/35 focus:border-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            aria-label="Search events"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/12 bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Tasks</h3>
        <ul className="mt-3 divide-y divide-white/8">
          {DEMO_TASKS.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">{task.title}</p>
                <p className="mt-0.5 text-[11px] text-white/38">Due {task.dueLabel}</p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ${getStatusBadgeClasses(task.status)}`}
              >
                {TASK_STATUS_LABEL[task.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
