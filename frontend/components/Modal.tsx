"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Uses the browser's native <dialog>, which already handles the Escape key,
 * focus trapping and the dark backdrop for us.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // Clicking the backdrop (outside the white box) closes the dialog.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      aria-labelledby="modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-ink shadow-2xl"
    >
      {/* Only render the content while open, so forms start fresh every time. */}
      {open && (
        <div className="animate-pop-in">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 id="modal-title" className="text-base font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
