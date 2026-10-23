import { useEffect, useRef, type ReactNode } from 'react';
import { I } from './Icon';

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
      className="modal"
      onCancel={(e) => (e.preventDefault(), onClose())}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn ghost square" onClick={onClose} aria-label="Close">
          <I n="xmark" />
        </button>
      </div>
      <div className="modal-body stack">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}
