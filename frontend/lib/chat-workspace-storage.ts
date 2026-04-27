/** Same key as persisted chat tabs in the workspace — single source for reads/writes/clear. */
export const CHAT_TABS_LOCAL_STORAGE_KEY = "chief-of-staff.chat-workspace-tabs.v1";

export function clearPersistedChatWorkspaceTabs(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(CHAT_TABS_LOCAL_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage
  }
}
