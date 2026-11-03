"use client";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import Icon from "./Icon";
export default function Modal({
  open,
  title,
  subtitle,
  onDismiss,
  returnFocusRef,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    const previous = document.body.style.overflow;
    const trigger =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!dialog.open) dialog.showModal();
    const body = dialog.querySelector<HTMLElement>(".modal-body");
    if (body) body.scrollTop = 0;
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previous;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);
  return (
    <dialog
      ref={ref}
      className="tool-dialog"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          onDismiss();
      }}
    >
      <header className="modal-header">
        <div>
          <p className="eyebrow">RESEARCH WORKSPACE</p>
          <h2 id={titleId}>{title}</h2>
          {subtitle && (
            <p id={subtitleId} className="modal-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          className="modal-close"
          aria-label="창 닫기"
          onClick={onDismiss}
          autoFocus
        >
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
