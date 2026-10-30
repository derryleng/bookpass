import { useEffect, useRef, type ReactNode } from "react";
import { btn } from "./cls";
import { I } from "./Icon";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** A modal dialog on the browser's own <dialog>, which brings focus handling and Escape to close. */
export function Dialog({ title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="m-auto max-h-[calc(100vh-32px)] w-[min(520px,calc(100vw-32px))] flex-col rounded-[14px] border border-line bg-surface p-0 text-fg shadow-[0_20px_60px_rgb(0_0_0/30%)] backdrop:bg-[rgb(10_12_18/50%)] open:flex"
      onCancel={(e) => (e.preventDefault(), onClose())}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex flex-none items-center gap-2.5 px-5 pt-4.5 pb-1.5">
        <h2 className="flex-1 text-[17px] leading-tight font-semibold">
          {title}
        </h2>
        <button
          className={btn("ghost square")}
          onClick={onClose}
          aria-label="Close"
        >
          <I n="xmark" />
        </button>
      </div>
      <section className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pt-2 pb-3 last:pb-5">
        {children}
      </section>
      {footer && (
        <footer className="flex flex-none items-center gap-2 px-5 pt-3 pb-5">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
