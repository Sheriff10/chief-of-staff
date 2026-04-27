"use client";

import { useState } from "react";

import {
  AGENT_OPTIONS,
  type Task,
  type TaskStatus,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useTasksQuery,
  useUpdateTaskMutation,
} from "@/hooks/use-tasks";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function IconRobot({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3H7a2 2 0 00-2 2v1m0 0H3m2 0v10a2 2 0 002 2h10a2 2 0 002-2V6m0 0h2m-2 0V5a2 2 0 00-2-2h-2M9 3h6M9 3V1m6 2V1M9 12h.01M15 12h.01"
      />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; pill: string; column: string }> = {
  not_started: {
    label: "Not started",
    pill: "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/25",
    column: "border-zinc-500/20",
  },
  in_progress: {
    label: "In progress",
    pill: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30",
    column: "border-amber-500/20",
  },
  done: {
    label: "Done",
    pill: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/25",
    column: "border-emerald-500/20",
  },
};

const AGENT_LABEL: Record<string, string> = Object.fromEntries(
  AGENT_OPTIONS.map((a) => [a.value, a.label]),
);

const STATUS_ORDER: TaskStatus[] = ["not_started", "in_progress", "done"];

// ─── Task form modal ───────────────────────────────────────────────────────────

interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  project: string;
  assigned_agent: string;
}

const EMPTY_FORM: TaskFormValues = {
  title: "",
  description: "",
  status: "not_started",
  project: "",
  assigned_agent: "",
};

interface TaskFormModalProps {
  initial?: Partial<TaskFormValues>;
  onSave: (values: TaskFormValues) => void;
  onClose: () => void;
  isSaving: boolean;
  mode: "create" | "edit";
  allProjects: string[];
}

function TaskFormModal({ initial, onSave, onClose, isSaving, mode, allProjects }: TaskFormModalProps) {
  const [form, setForm] = useState<TaskFormValues>({ ...EMPTY_FORM, ...initial });

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 shadow-2xl ring-1 ring-black/40">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-white">
            {mode === "create" ? "New task" : "Edit task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-white/55">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What needs to be done?"
              required
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-white/30 outline-none ring-0 transition focus:border-violet-400/50 focus:bg-white/8"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-white/55">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Add details…"
              rows={3}
              className="resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-white/30 outline-none transition focus:border-violet-400/50 focus:bg-white/8"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-white/55">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as TaskStatus)}
                className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-[14px] text-white outline-none transition focus:border-violet-400/50"
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-white/55">Project</label>
              <input
                type="text"
                value={form.project}
                onChange={(e) => set("project", e.target.value)}
                placeholder="e.g. Q2 launch"
                list="project-suggestions"
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-white/30 outline-none transition focus:border-violet-400/50 focus:bg-white/8"
              />
              <datalist id="project-suggestions">
                {allProjects.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-white/55">Assign to agent</label>
            <select
              value={form.assigned_agent}
              onChange={(e) => set("assigned_agent", e.target.value)}
              className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-[14px] text-white outline-none transition focus:border-violet-400/50"
            >
              <option value="">— Unassigned —</option>
              {AGENT_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/60 transition hover:bg-white/8 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !form.title.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-medium text-white shadow transition hover:bg-violet-500 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task card ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  isDeleting: boolean;
}

function TaskCard({ task, onEdit, onDelete, onStatusChange, isDeleting }: TaskCardProps) {
  const meta = STATUS_META[task.status];

  const nextStatus: Record<TaskStatus, TaskStatus> = {
    not_started: "in_progress",
    in_progress: "done",
    done: "not_started",
  };

  return (
    <div
      className={`group flex flex-col gap-2.5 rounded-xl border bg-black/40 p-3.5 shadow-sm transition hover:bg-black/55 ${meta.column}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-white/90">{task.title}</p>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white/90"
            aria-label="Edit task"
          >
            <IconEdit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={isDeleting}
            className="rounded-md p-1 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
            aria-label="Delete task"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {task.description ? (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-white/50">{task.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {task.project ? (
          <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-200/80 ring-1 ring-violet-500/20">
            {task.project}
          </span>
        ) : null}
        {task.assigned_agent ? (
          <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-200/80 ring-1 ring-sky-500/20">
            <IconRobot className="h-3 w-3" />
            {AGENT_LABEL[task.assigned_agent] ?? task.assigned_agent}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onStatusChange(task.id, nextStatus[task.status])}
        className={`mt-0.5 self-start rounded-full px-2 py-0.5 text-[11px] font-medium transition hover:scale-105 ${meta.pill}`}
      >
        {meta.label}
      </button>
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  deletingId: string | null;
}

function Column({ status, tasks, onEdit, onDelete, onStatusChange, deletingId }: ColumnProps) {
  const meta = STATUS_META[status];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{meta.label}</h3>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/45">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto pb-1">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-[12px] text-white/25">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              isDeleting={deletingId === task.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export function TasksDashboard() {
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: tasks = [], isError, error, isPending, refetch } = useTasksQuery();
  const createTask = useCreateTaskMutation();
  const updateTask = useUpdateTaskMutation();
  const deleteTask = useDeleteTaskMutation();

  const allProjects = Array.from(
    new Set(tasks.map((t) => t.project).filter((p): p is string => Boolean(p))),
  ).sort();

  const displayedTasks = projectFilter
    ? tasks.filter((t) => t.project === projectFilter)
    : tasks;

  const tasksByStatus = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, displayedTasks.filter((t) => t.status === s)]),
  ) as Record<TaskStatus, Task[]>;

  const handleCreate = (values: { title: string; description: string; status: TaskStatus; project: string; assigned_agent: string }) => {
    createTask.mutate(
      {
        title: values.title,
        description: values.description || null,
        status: values.status,
        project: values.project || null,
        assigned_agent: values.assigned_agent || null,
      },
      { onSuccess: () => setIsCreateOpen(false) },
    );
  };

  const handleEdit = (values: { title: string; description: string; status: TaskStatus; project: string; assigned_agent: string }) => {
    if (!editingTask) return;
    updateTask.mutate(
      {
        id: editingTask.id,
        title: values.title,
        description: values.description || null,
        status: values.status,
        project: values.project || null,
        assigned_agent: values.assigned_agent || null,
      },
      { onSuccess: () => setEditingTask(null) },
    );
  };

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    updateTask.mutate({ id: taskId, status });
  };

  const handleDelete = (taskId: string) => {
    if (!window.confirm("Delete this task?")) return;
    deleteTask.mutate(taskId);
  };

  const errorMessage = isError && error instanceof Error ? error.message : isError ? "Failed to load tasks" : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pt-1">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-medium text-white shadow transition hover:bg-violet-500"
        >
          <IconPlus className="h-4 w-4" />
          New task
        </button>

        {allProjects.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-white/40">Project:</span>
            <button
              type="button"
              onClick={() => setProjectFilter("")}
              className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition ${
                !projectFilter
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:bg-white/8 hover:text-white/80"
              }`}
            >
              All
            </button>
            {allProjects.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProjectFilter(p === projectFilter ? "" : p)}
                className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition ${
                  projectFilter === p
                    ? "bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/30"
                    : "text-white/50 hover:bg-white/8 hover:text-white/80"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-[12px] text-rose-300">
            {errorMessage}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </p>
        ) : null}

        {isPending ? (
          <span className="text-[12px] animate-pulse text-white/40">Loading…</span>
        ) : null}
      </div>

      {/* Kanban board */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden sm:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={tasksByStatus[s]}
            onEdit={setEditingTask}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            deletingId={deleteTask.isPending && typeof deleteTask.variables === "string" ? deleteTask.variables : null}
          />
        ))}
      </div>

      {/* Create modal */}
      {isCreateOpen ? (
        <TaskFormModal
          mode="create"
          allProjects={allProjects}
          isSaving={createTask.isPending}
          onSave={handleCreate}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}

      {/* Edit modal */}
      {editingTask ? (
        <TaskFormModal
          mode="edit"
          initial={{
            title: editingTask.title,
            description: editingTask.description ?? "",
            status: editingTask.status,
            project: editingTask.project ?? "",
            assigned_agent: editingTask.assigned_agent ?? "",
          }}
          allProjects={allProjects}
          isSaving={updateTask.isPending}
          onSave={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      ) : null}
    </div>
  );
}
