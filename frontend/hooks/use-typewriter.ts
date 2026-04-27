"use client";

import { useEffect, useRef, useState } from "react";

const CHARS_PER_TICK = 3;
const TICK_INTERVAL_MS = 18;

interface TypewriterResult {
  displayedText: string;
  isTyping: boolean;
}

/**
 * Progressively reveals `fullText` to simulate a streaming / typewriter effect.
 * Returns the currently visible slice and whether the animation is still running.
 */
export function useTypewriter(fullText: string, shouldAnimate: boolean): TypewriterResult {
  const [charIndex, setCharIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setCharIndex(fullText.length);
      return;
    }

    setCharIndex(0);

    intervalRef.current = setInterval(() => {
      setCharIndex((previous) => {
        const next = previous + CHARS_PER_TICK;
        if (next >= fullText.length) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return fullText.length;
        }
        return next;
      });
    }, TICK_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fullText, shouldAnimate]);

  const displayedText = fullText.slice(0, charIndex);
  const isTyping = charIndex < fullText.length;

  return { displayedText, isTyping };
}
