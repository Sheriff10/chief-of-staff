"use client";

import Image from "next/image";

import { GlassWorkspace } from "../components/glass-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useGmailIntegration } from "@/hooks/use-gmail-integration";

function LoginScreen({ onConnectGmail }: { onConnectGmail: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
      <Image
        src="/assets/orb.png"
        alt=""
        width={152}
        height={152}
        priority
        aria-hidden
        className="h-40 w-40 object-contain drop-shadow-[0_0_28px_rgba(168,85,247,0.55)]"
      />

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Alina</h1>
        <p className="max-w-sm text-sm text-white/60">
          Connect your Gmail to get started. Your AI assistant will help manage your inbox, calendar, and tasks.
        </p>
      </div>

      <button
        type="button"
        onClick={onConnectGmail}
        className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-medium text-white shadow-[0_8px_32px_-8px_rgba(124,58,237,0.5)] backdrop-blur-md transition hover:border-white/30 hover:bg-white/15"
      >
        <Image
          src="/icons/integrations/gmail.svg"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
          unoptimized
        />
        Connect Gmail to continue
      </button>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const { connectGmail } = useGmailIntegration();

  return (
    <div className="wrap box-border flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-cover bg-center bg-no-repeat bg-[url('/assets/ai-bg.jpg')]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-white/25 bg-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150">
        {isLoading ? null : isAuthenticated ? <GlassWorkspace /> : <LoginScreen onConnectGmail={connectGmail} />}
      </div>
    </div>
  );
}
