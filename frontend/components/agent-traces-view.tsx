"use client";

import demoPayload from "@/data/agent-trace-runs-demo.json";
import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  buildCurvedEdgePathD,
  getWorkflowLayoutConstants,
  layoutAgentWorkflowGraph,
  type AgentTraceRunJson,
  type AgentTraceRunsPayloadJson,
} from "@/lib/agent-workflow-graph";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const EMPTY_STATE_MESSAGE = "Select a run to see how agents connected to produce the output.";

/** Demo file matches `AgentTraceRunsPayloadJson`; swap for `fetch()` when API exists */
const DEMO_AGENT_TRACE_RUNS: AgentTraceRunJson[] = (demoPayload as AgentTraceRunsPayloadJson).runs.filter(
  (run) => run.workflow.schema_version === WORKFLOW_GRAPH_SCHEMA_VERSION,
);

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function StatusPill({ status }: { status: AgentTraceRunJson["status"] }) {
  const styles: Record<AgentTraceRunJson["status"], string> = {
    completed: "bg-emerald-500/20 text-emerald-200/95",
    running: "bg-amber-500/20 text-amber-200/95",
    failed: "bg-red-500/20 text-red-200/95",
  };
  const labels: Record<AgentTraceRunJson["status"], string> = {
    completed: "Done",
    running: "Running",
    failed: "Failed",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

interface WorkflowGraphSvgProps {
  run: AgentTraceRunJson;
}

function WorkflowGraphSvg({ run }: WorkflowGraphSvgProps) {
  const rawGraphId = useId();
  const graphDomId = rawGraphId.replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `wf-grad-${graphDomId}`;
  const arrowMarkerId = `wf-arrow-${graphDomId}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidthPx, setCanvasWidthPx] = useState(320);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const resize = (): void => {
      const width = element.getBoundingClientRect().width;
      setCanvasWidthPx(Math.max(280, Math.floor(width)));
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => layoutAgentWorkflowGraph(run.workflow, canvasWidthPx), [canvasWidthPx, run.workflow]);

  const { nodeWidthPx, nodeHeightPx } = getWorkflowLayoutConstants();

  const edgePaths = useMemo(() => {
    return run.workflow.edges.map((edge, index) => {
      const from = layout.positions.get(edge.from);
      const to = layout.positions.get(edge.to);
      if (!from || !to) {
        return null;
      }
      const pathD = buildCurvedEdgePathD(from, to, index);
      return (
        <path
          key={`${edge.from}-${edge.to}-${index}`}
          d={pathD}
          stroke={`url(#${gradientId})`}
          strokeWidth={2}
          fill="none"
          markerEnd={`url(#${arrowMarkerId})`}
        />
      );
    });
  }, [arrowMarkerId, gradientId, layout.positions, run.workflow.edges]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl border border-white/10 bg-black/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/50">Workflow graph</p>
      <svg
        width="100%"
        height={layout.viewHeightPx}
        viewBox={`0 0 ${layout.viewWidthPx} ${layout.viewHeightPx}`}
        preserveAspectRatio="xMidYMin meet"
        className="block text-white"
        role="img"
        aria-label="Agent workflow graph"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(167, 139, 250)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="rgb(96, 165, 250)" stopOpacity={0.95} />
          </linearGradient>
          <marker
            id={arrowMarkerId}
            markerWidth={7}
            markerHeight={7}
            refX={6}
            refY={3.5}
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="rgb(147, 197, 253)" />
          </marker>
        </defs>

        {edgePaths}

        {run.workflow.nodes.map((node) => {
          const pos = layout.positions.get(node.id);
          if (!pos) {
            return null;
          }
          const left = pos.x - nodeWidthPx / 2;
          const top = pos.y - nodeHeightPx / 2;
          const subtitle = node.subtitle ?? "";
          return (
            <g key={node.id}>
              <rect
                x={left}
                y={top}
                width={nodeWidthPx}
                height={nodeHeightPx}
                rx={12}
                fill="rgba(255,255,255,0.07)"
                stroke="rgba(255,255,255,0.18)"
              />
              <text
                x={pos.x}
                y={pos.y - (subtitle ? 6 : 2)}
                textAnchor="middle"
                fill="rgba(255,255,255,0.94)"
                fontSize={13}
                fontWeight={600}
              >
                {node.label}
              </text>
              {subtitle ? (
                <text x={pos.x} y={pos.y + 12} textAnchor="middle" fill="rgba(255,255,255,0.48)" fontSize={10}>
                  {subtitle}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/45 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-white/45">Final output</p>
        <p className="mt-1 text-sm font-medium text-white/92">{run.output_label}</p>
      </div>
    </div>
  );
}

export interface AgentTracesViewProps {
  onExit: () => void;
}

export function AgentTracesView({ onExit }: AgentTracesViewProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const selectedRun = useMemo(
    () => DEMO_AGENT_TRACE_RUNS.find((run) => run.id === selectedRunId) ?? null,
    [selectedRunId],
  );

  const handleSelectRun = useCallback((runId: string): void => {
    setSelectedRunId((previous) => (previous === runId ? previous : runId));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10  shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <header className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Agent traces</p>
          <h2 className="truncate text-lg font-semibold text-white/95">Runs &amp; workflow</h2>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/18 bg-black/35 px-3 py-1.5 text-sm font-medium text-white/92 transition hover:border-white/28 hover:bg-black/45"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden />
          Back to chat
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-2 pb-4 lg:flex-row lg:gap-5 ">
        <section
          aria-labelledby="agent-traces-list-heading"
          className="flex min-h-0 max-h-[38vh] shrink-0 flex-col overflow-hidden lg:max-h-none lg:w-80"
        >
          <h3 id="agent-traces-list-heading" className="sr-only">
            Agent task runs
          </h3>
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
            {DEMO_AGENT_TRACE_RUNS.map((run) => {
              const isSelected = run.id === selectedRunId;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectRun(run.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-violet-400/45 bg-violet-500/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-white/10 bg-black/35 hover:border-white/18 hover:bg-black/48"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-white/92">{run.title}</p>
                      <StatusPill status={run.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/58">{run.preview}</p>
                    <p className="mt-2 text-[11px] text-white/40">{run.finished_label}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-live="polite" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {selectedRun ? (
            <WorkflowGraphSvg run={selectedRun} />
          ) : (
            <div className="flex min-h-48 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-black/45 px-6 py-10 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-white/58">{EMPTY_STATE_MESSAGE}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
