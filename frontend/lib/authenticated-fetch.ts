import { mergeAuthHeaders } from "@/lib/auth-session";

/** API calls with credentials + Bearer token when stored (cross-origin prod). */
export function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = mergeAuthHeaders(init?.headers);
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
