"use client";

import Image from "next/image";
import { memo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useTypewriter } from "@/hooks/use-typewriter";

interface AssistantMessageProps {
  text: string;
  /** When true the text is revealed progressively with the orb animation. */
  shouldAnimate: boolean;
  /** Fired once the typewriter finishes so the parent can mark the message as "done". */
  onTypingComplete?: () => void;
  /** Voice/TTS turns: show literal text, do not parse markdown. */
  isPlainText?: boolean;
}

function InlineOrb() {
  return (
    <Image
      src="/assets/orb.png"
      alt=""
      width={20}
      height={20}
      aria-hidden
      className="ml-1 inline-block h-5 w-5 animate-orb-spin object-contain align-middle drop-shadow-[0_0_10px_rgba(168,85,247,0.65)]"
    />
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  text,
  shouldAnimate,
  onTypingComplete,
  isPlainText = false,
}: AssistantMessageProps) {
  const { displayedText, isTyping } = useTypewriter(text, shouldAnimate);
  const hasNotifiedRef = useRef(false);

  useEffect(() => {
    if (!isTyping && shouldAnimate && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onTypingComplete?.();
    }
  }, [isTyping, shouldAnimate, onTypingComplete]);

  return (
    <div className="flex justify-start px-1 sm:px-2">
      <div className="assistant-markdown max-w-[min(90%,40rem)] px-1 py-1 text-left text-[15px] leading-relaxed text-white/95">
        {isPlainText ? (
          <p className="whitespace-pre-wrap">{displayedText}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayedText}</ReactMarkdown>
        )}

        {isTyping && <InlineOrb />}
      </div>
    </div>
  );
});
