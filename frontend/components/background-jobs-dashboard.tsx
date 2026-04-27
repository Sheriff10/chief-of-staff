"use client";

import { BackgroundJobsScheduledSection } from "./background-jobs-scheduled-section";
import { BackgroundJobsHistorySection } from "./background-jobs-history-section";
import { BackgroundJobsStats } from "./background-jobs-stats";
import {
  useBackgroundJobsQuery,
  useDeleteBackgroundJobMutation,
  useStopBackgroundJobMutation,
} from "@/hooks/use-background-jobs";
import { MOCK_BACKGROUND_JOBS, MOCK_JOB_RUNS } from "@/lib/mock-background-jobs";

const STATUS_PULSE_CLASS = "animate-pulse";

export function BackgroundJobsDashboard() {
  const { data, isPending, isFetching, isError, error, refetch } = useBackgroundJobsQuery();
  const stopJob = useStopBackgroundJobMutation();
  const deleteJob = useDeleteBackgroundJobMutation();

  // While the first request is in flight, `data` is undefined — do not fall back to mock data
  // (that made every refresh look like demo data). Mocks are only for failed API loads.
  const displayJobs = isError ? MOCK_BACKGROUND_JOBS : (data?.jobs ?? []);
  const displayRuns = isError ? MOCK_JOB_RUNS : (data?.runs ?? []);
  const totalRunsThisWeek = displayRuns.length;
  const isLive = Boolean(!isError && data);
  const isInitialLoading = isPending && !isError;
  const isStatusLoading = isInitialLoading || (isFetching && !data);
  const queryErrorMessage =
    isError && error instanceof Error ? error.message : isError ? "Request failed" : null;

  const onStop = (jobId: string) => {
    stopJob.mutate(jobId, {
      onError: (err) => {
        window.alert(err instanceof Error ? err.message : "Could not stop the schedule.");
      },
    });
  };

  const onDelete = (jobId: string) => {
    deleteJob.mutate(jobId, {
      onError: (err) => {
        window.alert(err instanceof Error ? err.message : "Could not delete the schedule.");
      },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto overflow-x-hidden pb-10 pt-1">
      <div
        className={`shrink-0 rounded-xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-[13px] text-white/85 ${
          isStatusLoading ? STATUS_PULSE_CLASS : ""
        }`}
        role="status"
      >
        <p className="font-medium text-white">
          {isInitialLoading ? "Loading schedules…" : isLive ? "Schedules and runs" : "Background jobs"}
        </p>
        <p className="mt-1 text-white/65">
          {isLive
            ? "Data is loaded from the API for your signed-in account."
            : queryErrorMessage
              ? `Could not load from API (${queryErrorMessage}). Showing demo data. `
              : isInitialLoading
                ? "Fetching your schedules and run history."
                : "Demo data. "}
          {queryErrorMessage ? (
            <button
              type="button"
              className="ml-0 font-medium text-emerald-200 underline decoration-emerald-400/50"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </button>
          ) : null}
        </p>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-10 ${isInitialLoading ? STATUS_PULSE_CLASS : ""}`}
      >
        <div className="shrink-0">
          <BackgroundJobsStats jobs={displayJobs} totalRunsThisWeek={totalRunsThisWeek} />
        </div>

        <div className="shrink-0 border-t border-white/10 pt-2">
          <BackgroundJobsScheduledSection
            jobs={displayJobs}
            canManage={isLive}
            onStopJob={onStop}
            onDeleteJob={onDelete}
            pendingStopJobId={stopJob.isPending && stopJob.variables != null ? stopJob.variables : null}
            pendingDeleteJobId={
              deleteJob.isPending && deleteJob.variables != null ? deleteJob.variables : null
            }
          />
        </div>

        <div className="shrink-0 border-t border-white/10 pt-2">
          <BackgroundJobsHistorySection runs={displayRuns} />
        </div>
      </div>
    </div>
  );
}
