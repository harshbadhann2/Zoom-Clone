"use client";

import { useCallback, useRef, useState } from "react";

/** Small "snackbar" message at the bottom of the screen that hides itself after 3 seconds. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  const toast = (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      {message && (
        <div className="animate-pop-in rounded-xl bg-[#1f2329] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {message}
        </div>
      )}
    </div>
  );

  return { toast, showToast };
}
