"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Uses the browser's native <dialog>, which already handles the Escape key,
 * focus trapping and the backdrop for us. Styled like Zoom's dialogs:
 * large rounded corners, bold title, no header divider.
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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-0 text-ink shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
    >
      {/* Only render the content while open, so forms start fresh every time. */}
      {open && (
        <div className="animate-pop-in p-6 sm:p-8">
          <h2 id="modal-title" className="mb-5 text-xl font-semibold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
