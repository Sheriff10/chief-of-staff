"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authenticatedFetch } from "@/lib/authenticated-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type TaskStatus = "not_started" | "in_progress" | "done";

export const AGENT_OPTIONS = [
  { value: "orchestrator", label: "Orchestrator" },
  { value: "email_agent", label: "Email Agent" },
  { value: "calendar_agent", label: "Calendar Agent" },
  { value: "notion_agent", label: "Notion Agent" },
] as const;

export type AgentOption = (typeof AGENT_OPTIONS)[number]["value"];

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  project: string | null;
  assigned_agent: string | null;
  created_at: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  project?: string | null;
  assigned_agent?: string | null;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  project?: string | null;
  assigned_agent?: string | null;
}

export const TASKS_QUERY_KEY = ["tasks"] as const;

async function fetchTasks(project?: string): Promise<Task[]> {
  const url = new URL(`${API_BASE_URL}/tasks`);
  if (project) url.searchParams.set("project", project);
  const res = await authenticatedFetch(url.toString());
  if (!res.ok) throw new Error(`Tasks ${res.status}`);
  return res.json() as Promise<Task[]>;
}

export function useTasksQuery(project?: string) {
  return useQuery({
    queryKey: project ? [...TASKS_QUERY_KEY, project] : TASKS_QUERY_KEY,
    queryFn: () => fetchTasks(project),
  });
}

function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskCreatePayload) => {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create failed (${res.status})`);
      }
      return res.json() as Promise<Task>;
    },
    onSettled: () => void invalidateTasks(queryClient),
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: TaskUpdatePayload & { id: string }) => {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update failed (${res.status})`);
      }
      return res.json() as Promise<Task>;
    },
    onSettled: () => void invalidateTasks(queryClient),
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (res.status === 404) throw new Error("Task not found.");
      if (res.status !== 204) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
    },
    onSettled: () => void invalidateTasks(queryClient),
  });
}
