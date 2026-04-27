"use client";

import Image from "next/image";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import {
  useVoiceRecorder,
  VOICE_WAVEFORM_BAR_COUNT,
} from "@/hooks/use-voice-recorder";

import { AttachFilesModal } from "./attach-files-modal";

const RECORDING_STRIP_BAR_GAP_PX = 2;
const RECORDING_STRIP_BAR_WIDTH_PX = 2;
const RECORDING_STRIP_BAR_MIN_HEIGHT_PX = 4;
const RECORDING_STRIP_BAR_MAX_HEIGHT_PX = 32;

const CHAT_COMPOSER_SETTINGS_MENU_ID = "chat-composer-settings-menu";
const CHAT_COMPOSER_OPTIONS_MENU_ID = "chat-composer-options-menu";
const SETTINGS_MENU_ARIA_LABEL = "Connect integrations";
const OPTIONS_MENU_ARIA_LABEL = "Choose response agent";
const OPTIONS_BUTTON_VISIBLE_LABEL = "Options";
const AGENT_OPTION_AUTO_LABEL = "Auto";
const AGENT_OPTION_EMAIL_LABEL = "Email Agent";
const AGENT_OPTION_CALENDAR_LABEL = "Calendar Agent";
const AGENT_OPTION_NOTION_LABEL = "Notion Agent";
const SETTINGS_BUTTON_VISIBLE_LABEL = "Settings";
const SETTINGS_MENU_CONNECT_GMAIL_LABEL = "Connect Gmail";
const SETTINGS_MENU_CONNECT_NOTION_LABEL = "Connect Notion";
const SETTINGS_MENU_CONNECT_CALENDAR_LABEL = "Connect Calendar";
const SETTINGS_MENU_DISCONNECT_GMAIL_LABEL = "Disconnect Gmail";
const SETTINGS_MENU_DISCONNECT_NOTION_LABEL = "Disconnect Notion";
const SETTINGS_MENU_DISCONNECT_CALENDAR_LABEL = "Disconnect Calendar";

const INTEGRATION_ICON_GMAIL_SRC = "/icons/integrations/gmail.svg";
const INTEGRATION_ICON_GOOGLE_CALENDAR_SRC = "/icons/integrations/google-calendar.svg";
const INTEGRATION_ICON_NOTION_SRC = "/icons/integrations/notion.svg";
const INTEGRATION_MENU_ICON_PX = 20;

const ATTACH_BUTTON_VISIBLE_LABEL = "Attach";
const ATTACH_BUTTON_ARIA_LABEL = "Attach files";

/** Which specialized agent should handle the next reply (`auto` lets the orchestrator decide). */
export type ComposerAgentPreference = "auto" | "email" | "calendar" | "notion";

export const DEFAULT_COMPOSER_AGENT_PREFERENCE: ComposerAgentPreference = "auto";

function formatRecordingDuration(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function IconSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="url(#chat-composer-sparkle)"
        d="M12 2l1.2 5.4L18 9l-4.8 1.6L12 16l-1.2-5.4L6 9l4.8-1.6L12 2z"
      />
      <defs>
        <linearGradient
          id="chat-composer-sparkle"
          x1="6"
          y1="2"
          x2="18"
          y2="16"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e879f9" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    </svg>
  );
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function RecordingWaveformStrip({ levels }: { levels: number[] }) {
  return (
    <div
      className="flex min-h-10 w-full min-w-0 flex-1 items-end justify-between overflow-hidden px-1"
      style={{ gap: RECORDING_STRIP_BAR_GAP_PX }}
      aria-hidden
    >
      {levels.map((level, index) => {
        const heightPx =
          RECORDING_STRIP_BAR_MIN_HEIGHT_PX +
          level * (RECORDING_STRIP_BAR_MAX_HEIGHT_PX - RECORDING_STRIP_BAR_MIN_HEIGHT_PX);
        return (
          <span
            key={index}
            className="shrink-0 rounded-full bg-linear-to-t from-fuchsia-500/50 to-fuchsia-300/95 shadow-[0_0_6px_rgba(232,121,249,0.35)]"
            style={{
              width: RECORDING_STRIP_BAR_WIDTH_PX,
              height: `${heightPx}px`,
            }}
          />
        );
      })}
    </div>
  );
}

function RecordingComposerBody({
  levels,
  elapsedMs,
  onCancel,
  onSendVoice,
  layout,
}: {
  levels: number[];
  elapsedMs: number;
  onCancel: () => void;
  onSendVoice: () => void;
  layout: "minimal" | "full";
}) {
  const shellPad =
    layout === "minimal" ? "px-3 py-3 sm:px-4 sm:py-3.5" : "px-4 py-4 sm:px-5 sm:py-4";

  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${shellPad}`}>
      <button
        type="button"
        aria-label="Cancel recording"
        onClick={onCancel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-white/55 transition hover:border-white/15 hover:bg-white/10 hover:text-white"
      >
        <IconTrash className="h-5 w-5" />
      </button>

      <div className="flex min-h-13 min-w-0 flex-1 items-center gap-3 rounded-[1.35rem] border border-fuchsia-400/25 bg-black/45 px-4 py-3 shadow-inner shadow-black/30 backdrop-blur-md">
        <span
          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.75)]"
          aria-hidden
        />
        <span className="w-13 shrink-0 tabular-nums text-[15px] font-medium tracking-tight text-white/95">
          {formatRecordingDuration(elapsedMs)}
        </span>
        <RecordingWaveformStrip levels={levels} />
      </div>

      <button
        type="button"
        aria-label="Send voice message"
        onClick={onSendVoice}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_6px_20px_-4px_rgba(124,58,237,0.65)] transition hover:bg-[#6d28d9]"
      >
        <IconSend className="h-5 w-5 -translate-y-px" />
      </button>
    </div>
  );
}

function VoiceInputButton({
  onRequestRecord,
  disabled,
}: {
  onRequestRecord: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Record voice message"
      disabled={disabled}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onRequestRecord}
    >
      <IconMic className="h-5 w-5" />
    </button>
  );
}

export interface IntegrationStatus {
  isGmailConnected?: boolean;
  isNotionConnected?: boolean;
  isCalendarConnected?: boolean;
}

interface ChatComposerSettingsTriggerProps {
  onConnectGmail?: () => void;
  onConnectNotion?: () => void;
  onConnectCalendar?: () => void;
  onDisconnectGmail?: () => void;
  onDisconnectNotion?: () => void;
  onDisconnectCalendar?: () => void;
  integrationStatus?: IntegrationStatus;
}

function ConnectionDot({ isConnected }: { isConnected?: boolean }) {
  if (!isConnected) {
    return null;
  }
  return (
    <span
      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
      aria-label="Connected"
    />
  );
}

function ChatComposerSettingsTrigger({
  onConnectGmail,
  onConnectNotion,
  onConnectCalendar,
  onDisconnectGmail,
  onDisconnectNotion,
  onDisconnectCalendar,
  integrationStatus,
}: ChatComposerSettingsTriggerProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const node = containerReference.current;
      if (!node || node.contains(event.target as Node)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  const handleMenuItemActivate = useCallback((handler?: () => void) => {
    setIsMenuOpen(false);
    handler?.();
  }, []);

  const menuItemClassName =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none";

  const hasAnyConnection =
    integrationStatus?.isGmailConnected ||
    integrationStatus?.isNotionConnected ||
    integrationStatus?.isCalendarConnected;

  return (
    <div ref={containerReference} className="relative">
      <button
        type="button"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-controls={isMenuOpen ? CHAT_COMPOSER_SETTINGS_MENU_ID : undefined}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/10 hover:text-white"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span className="relative">
          <IconSliders className="h-4 w-4" />
          {hasAnyConnection ? (
            <span
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
              aria-hidden
            />
          ) : null}
        </span>
        {SETTINGS_BUTTON_VISIBLE_LABEL}
      </button>
      {isMenuOpen ? (
        <div
          id={CHAT_COMPOSER_SETTINGS_MENU_ID}
          role="menu"
          aria-label={SETTINGS_MENU_ARIA_LABEL}
          className="absolute bottom-full left-0 z-50 mb-2 flex min-w-54 flex-col gap-0.5 rounded-xl border border-white/15 bg-zinc-950/95 py-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md"
        >
          <button
            role="menuitem"
            type="button"
            className={menuItemClassName}
            onClick={() =>
              handleMenuItemActivate(
                integrationStatus?.isGmailConnected ? onDisconnectGmail : onConnectGmail,
              )
            }
          >
            <Image
              src={INTEGRATION_ICON_GMAIL_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            {integrationStatus?.isGmailConnected
              ? SETTINGS_MENU_DISCONNECT_GMAIL_LABEL
              : SETTINGS_MENU_CONNECT_GMAIL_LABEL}
            <ConnectionDot isConnected={integrationStatus?.isGmailConnected} />
          </button>
          <button
            role="menuitem"
            type="button"
            className={menuItemClassName}
            onClick={() =>
              handleMenuItemActivate(
                integrationStatus?.isNotionConnected ? onDisconnectNotion : onConnectNotion,
              )
            }
          >
            <Image
              src={INTEGRATION_ICON_NOTION_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            {integrationStatus?.isNotionConnected
              ? SETTINGS_MENU_DISCONNECT_NOTION_LABEL
              : SETTINGS_MENU_CONNECT_NOTION_LABEL}
            <ConnectionDot isConnected={integrationStatus?.isNotionConnected} />
          </button>
          <button
            role="menuitem"
            type="button"
            className={menuItemClassName}
            onClick={() =>
              handleMenuItemActivate(
                integrationStatus?.isCalendarConnected ? onDisconnectCalendar : onConnectCalendar,
              )
            }
          >
            <Image
              src={INTEGRATION_ICON_GOOGLE_CALENDAR_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            {integrationStatus?.isCalendarConnected
              ? SETTINGS_MENU_DISCONNECT_CALENDAR_LABEL
              : SETTINGS_MENU_CONNECT_CALENDAR_LABEL}
            <ConnectionDot isConnected={integrationStatus?.isCalendarConnected} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ChatComposerOptionsTriggerProps {
  preference: ComposerAgentPreference;
  onPreferenceChange: (preference: ComposerAgentPreference) => void;
}

function ChatComposerOptionsTrigger({
  preference,
  onPreferenceChange,
}: ChatComposerOptionsTriggerProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const node = containerReference.current;
      if (!node || node.contains(event.target as Node)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  const menuItemClassName =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none";

  const rowClassName = (isSelected: boolean) =>
    `${menuItemClassName}${isSelected ? " bg-white/10" : ""}`;

  const handlePick = useCallback(
    (nextPreference: ComposerAgentPreference) => {
      onPreferenceChange(nextPreference);
      setIsMenuOpen(false);
    },
    [onPreferenceChange],
  );

  return (
    <div ref={containerReference} className="relative">
      <button
        type="button"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-controls={isMenuOpen ? CHAT_COMPOSER_OPTIONS_MENU_ID : undefined}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/10 hover:text-white"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <IconGrid className="h-4 w-4 text-white/80" />
        {OPTIONS_BUTTON_VISIBLE_LABEL}
      </button>
      {isMenuOpen ? (
        <div
          id={CHAT_COMPOSER_OPTIONS_MENU_ID}
          role="menu"
          aria-label={OPTIONS_MENU_ARIA_LABEL}
          className="absolute bottom-full right-0 z-50 mb-2 flex min-w-60 flex-col gap-0.5 rounded-xl border border-white/15 bg-zinc-950/95 py-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md sm:left-0 sm:right-auto"
        >
          <button
            role="menuitemradio"
            type="button"
            aria-checked={preference === "auto"}
            className={rowClassName(preference === "auto")}
            onClick={() => handlePick("auto")}
          >
            <span className="flex w-5 shrink-0 justify-center text-fuchsia-300">
              {preference === "auto" ? <IconCheck className="h-4 w-4" /> : null}
            </span>
            <IconSparkle className="h-5 w-5 shrink-0" />
            <span>{AGENT_OPTION_AUTO_LABEL}</span>
          </button>
          <button
            role="menuitemradio"
            type="button"
            aria-checked={preference === "email"}
            className={rowClassName(preference === "email")}
            onClick={() => handlePick("email")}
          >
            <span className="flex w-5 shrink-0 justify-center text-fuchsia-300">
              {preference === "email" ? <IconCheck className="h-4 w-4" /> : null}
            </span>
            <Image
              src={INTEGRATION_ICON_GMAIL_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            <span>{AGENT_OPTION_EMAIL_LABEL}</span>
          </button>
          <button
            role="menuitemradio"
            type="button"
            aria-checked={preference === "calendar"}
            className={rowClassName(preference === "calendar")}
            onClick={() => handlePick("calendar")}
          >
            <span className="flex w-5 shrink-0 justify-center text-fuchsia-300">
              {preference === "calendar" ? <IconCheck className="h-4 w-4" /> : null}
            </span>
            <Image
              src={INTEGRATION_ICON_GOOGLE_CALENDAR_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            <span>{AGENT_OPTION_CALENDAR_LABEL}</span>
          </button>
          <button
            role="menuitemradio"
            type="button"
            aria-checked={preference === "notion"}
            className={rowClassName(preference === "notion")}
            onClick={() => handlePick("notion")}
          >
            <span className="flex w-5 shrink-0 justify-center text-fuchsia-300">
              {preference === "notion" ? <IconCheck className="h-4 w-4" /> : null}
            </span>
            <Image
              src={INTEGRATION_ICON_NOTION_SRC}
              alt=""
              width={INTEGRATION_MENU_ICON_PX}
              height={INTEGRATION_MENU_ICON_PX}
              className="h-5 w-5 shrink-0 object-contain"
              unoptimized
            />
            <span>{AGENT_OPTION_NOTION_LABEL}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ChatComposerProps {
  draftValue: string;
  onDraftChange: (value: string) => void;
  /** After the first send, drops sparkle + footer actions — textarea, mic, send only (iMessage-style). */
  isMinimal: boolean;
  /** Disables send (and optionally recording) while a reply is streaming. */
  isSendDisabled?: boolean;
  onSend: (plainText: string) => void;
  /** Called after the user confirms a voice recording with Send. */
  onVoiceMessageSend?: (audioBlob: Blob) => void;
  onConnectGmail?: () => void;
  onConnectNotion?: () => void;
  onConnectCalendar?: () => void;
  onDisconnectGmail?: () => void;
  onDisconnectNotion?: () => void;
  onDisconnectCalendar?: () => void;
  /** Called after the user selects files from the attach modal (picker or drag-and-drop). */
  onFilesAttached?: (files: File[]) => void;
  agentPreference: ComposerAgentPreference;
  onAgentPreferenceChange: (preference: ComposerAgentPreference) => void;
  integrationStatus?: IntegrationStatus;
}

export function ChatComposer({
  draftValue,
  onDraftChange,
  isMinimal,
  isSendDisabled = false,
  onSend,
  onVoiceMessageSend,
  onConnectGmail,
  onConnectNotion,
  onConnectCalendar,
  onDisconnectGmail,
  onDisconnectNotion,
  onDisconnectCalendar,
  onFilesAttached,
  agentPreference,
  onAgentPreferenceChange,
  integrationStatus,
}: ChatComposerProps) {
  const {
    levels: voiceLevels,
    isRecording,
    errorMessage: voiceErrorMessage,
    elapsedMs: voiceElapsedMs,
    startRecording,
    cancelRecording,
    finishRecording,
  } = useVoiceRecorder(VOICE_WAVEFORM_BAR_COUNT);

  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);

  const handleAttachModalClose = useCallback(() => {
    setIsAttachModalOpen(false);
  }, []);

  const handleMicClick = useCallback(() => {
    void startRecording();
  }, [startRecording]);

  const handleCancelVoice = useCallback(() => {
    void cancelRecording();
  }, [cancelRecording]);

  const handleSendVoice = useCallback(async () => {
    const blob = await finishRecording();
    if (blob && onVoiceMessageSend) {
      onVoiceMessageSend(blob);
    }
  }, [finishRecording, onVoiceMessageSend]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onDraftChange(event.target.value);
    },
    [onDraftChange],
  );

  const handleSend = useCallback(() => {
    if (isSendDisabled) {
      return;
    }
    const trimmed = draftValue.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
  }, [draftValue, isSendDisabled, onSend]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isSendDisabled) {
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      event.preventDefault();
      handleSend();
    },
    [handleSend, isSendDisabled],
  );

  const chromeShellClassName =
    "w-full max-w-2xl rounded-[1.65rem] border border-fuchsia-400/35 bg-black/30 shadow-[0_0_0_1px_rgba(168,85,247,0.25),0_12px_48px_-12px_rgba(126,34,206,0.55)] backdrop-blur-md transition-[border-radius,box-shadow,padding] duration-500 ease-out";

  const errorBanner =
    voiceErrorMessage && !isRecording ? (
      <p className="mt-2 max-w-2xl px-1 text-center text-[13px] text-red-400/95" role="alert">
        {voiceErrorMessage}
      </p>
    ) : null;

  if (isRecording) {
    return (
      <div className="flex w-full flex-col items-center">
        <div
          className={`${chromeShellClassName} ${isMinimal ? "rounded-[1.75rem]" : ""}`}
          role="region"
          aria-label="Recording voice message"
        >
          <RecordingComposerBody
            levels={voiceLevels}
            elapsedMs={voiceElapsedMs}
            onCancel={handleCancelVoice}
            onSendVoice={() => {
              void handleSendVoice();
            }}
            layout={isMinimal ? "minimal" : "full"}
          />
        </div>
        {errorBanner}
      </div>
    );
  }

  if (isMinimal) {
    return (
      <div className="flex w-full flex-col items-center">
        <div className={`${chromeShellClassName} rounded-[1.75rem]`}>
          <label className="sr-only" htmlFor="chat-input-minimal">
            Message
          </label>
          <div className="flex items-end gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
            <textarea
              id="chat-input-minimal"
              rows={1}
              placeholder="Message"
              value={draftValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={isSendDisabled}
              className="max-h-36 min-h-11 w-full flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-snug text-white placeholder:text-white/45 outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:py-3"
            />
            <div className="flex shrink-0 items-center gap-2 pb-1 sm:gap-2.5 sm:pb-1.5">
              <VoiceInputButton onRequestRecord={handleMicClick} disabled={isSendDisabled} />
              <button
                type="button"
                aria-label="Send"
                onClick={handleSend}
                disabled={isSendDisabled}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_6px_20px_-4px_rgba(124,58,237,0.65)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconSend className="h-5 w-5 -translate-y-px" />
              </button>
            </div>
          </div>
        </div>
        {errorBanner}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center">
      <div className={chromeShellClassName}>
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <div className="flex gap-3 p-5 pb-4">
          <IconSparkle className="mt-1 h-5 w-5 shrink-0" />
          <textarea
            id="chat-input"
            rows={3}
            placeholder="Ask Anything..."
            value={draftValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isSendDisabled}
            className="min-h-18 w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder:text-white/45 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-1 text-sm text-white/75">
            <button
              type="button"
              aria-label={ATTACH_BUTTON_ARIA_LABEL}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/10 hover:text-white"
              onClick={() => setIsAttachModalOpen(true)}
            >
              <IconPaperclip className="h-4 w-4" />
              {ATTACH_BUTTON_VISIBLE_LABEL}
            </button>
            <span className="mx-1 hidden h-5 w-px bg-white/20 sm:inline" aria-hidden />
            <ChatComposerSettingsTrigger
              onConnectGmail={onConnectGmail}
              onConnectNotion={onConnectNotion}
              onConnectCalendar={onConnectCalendar}
              onDisconnectGmail={onDisconnectGmail}
              onDisconnectNotion={onDisconnectNotion}
              onDisconnectCalendar={onDisconnectCalendar}
              integrationStatus={integrationStatus}
            />
            <span className="mx-1 hidden h-5 w-px bg-white/20 sm:inline" aria-hidden />
            <ChatComposerOptionsTrigger
              preference={agentPreference}
              onPreferenceChange={onAgentPreferenceChange}
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <VoiceInputButton onRequestRecord={handleMicClick} disabled={isSendDisabled} />
            <button
              type="button"
              aria-label="Send"
              onClick={handleSend}
              disabled={isSendDisabled}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_6px_20px_-4px_rgba(124,58,237,0.65)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconSend className="h-5 w-5 -translate-y-px" />
            </button>
          </div>
        </div>
      </div>
      {errorBanner}
      <AttachFilesModal
        isOpen={isAttachModalOpen}
        onClose={handleAttachModalClose}
        onFilesSelected={onFilesAttached}
      />
    </div>
  );
}
