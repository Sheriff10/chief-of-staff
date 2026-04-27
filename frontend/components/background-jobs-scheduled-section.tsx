"use client";

import { useMemo, useState } from "react";

import { ScheduleJobCard } from "./schedule-job-card";
import { ScheduleJobsAllModal } from "./schedule-jobs-all-modal";
import {
  isOngoingSchedule,
  type BackgroundJob,
} from "@/lib/mock-background-jobs";

const SCHEDULE_PREVIEW_CARD_LIMIT = 3;

function sortOngoingByNextRun(jobs: readonly BackgroundJob[]): BackgroundJob[] {
  return [...jobs].sort((jobA, jobB) => {
    const timeA = jobA.nextRunIso ? new Date(jobA.nextRunIso).getTime() : 0;
    const timeB = jobB.nextRunIso ? new Date(jobB.nextRunIso).getTime() : 0;
    return timeA - timeB;
  });
}

interface BackgroundJobsScheduledSectionProps {
  readonly jobs: readonly BackgroundJob[];
  readonly canManage?: boolean;
  readonly onStopJob?: (jobId: string) => void;
  readonly onDeleteJob?: (jobId: string) => void;
  readonly pendingStopJobId?: string | null;
  readonly pendingDeleteJobId?: string | null;
}

export function BackgroundJobsScheduledSection({
  jobs,
  canManage = false,
  onStopJob,
  onDeleteJob,
  pendingStopJobId = null,
  pendingDeleteJobId = null,
}: BackgroundJobsScheduledSectionProps) {
  const [isAllModalOpen, setIsAllModalOpen] = useState(false);

  const previewJobs = useMemo(() => {
    const ongoing = jobs.filter(isOngoingSchedule);
    return sortOngoingByNextRun(ongoing).slice(0, SCHEDULE_PREVIEW_CARD_LIMIT);
  }, [jobs]);

  return (
    <section aria-labelledby="bg-jobs-scheduled-heading" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="bg-jobs-scheduled-heading" className="text-sm font-semibold text-white/90">
            Scheduled jobs
          </h2>
          <p className="mt-0.5 text-[13px] text-white/50">
            Each schedule can include multiple actions (email, calendar, Notion, and more). Tell Chief of Staff once—e.g.
            “email x@mail.com every day at 10am”.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAllModalOpen(true)}
          className="shrink-0 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-medium text-white/90 shadow-sm transition hover:border-white/30 hover:bg-white/16"
        >
          View all
        </button>
      </div>

      {previewJobs.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/25 px-4 py-8 text-center text-[13px] text-white/50">
          No upcoming schedules in this preview.
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-3">
          {previewJobs.map((job) => (
            <li key={job.id}>
              <ScheduleJobCard
                job={job}
                density="comfortable"
                canManage={canManage}
                onStopJob={onStopJob}
                onDeleteJob={onDeleteJob}
                isStopPending={pendingStopJobId === job.id}
                isDeletePending={pendingDeleteJobId === job.id}
              />
            </li>
          ))}
        </ul>
      )}

      <ScheduleJobsAllModal
        isOpen={isAllModalOpen}
        jobs={jobs}
        onClose={() => setIsAllModalOpen(false)}
        canManage={canManage}
        onStopJob={onStopJob}
        onDeleteJob={onDeleteJob}
        pendingStopJobId={pendingStopJobId}
        pendingDeleteJobId={pendingDeleteJobId}
      />
    </section>
  );
}
