import React, { useEffect } from "react";

/** In-place controls leave the real artwork visible and interactive above them. */
export function StudioEditor({
  title,
  className = "",
  onClose,
  children,
}: {
  title: string;
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const back = (event: Event) => {
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") back(event);
    };
    document.addEventListener("latse:back", back);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("latse:back", back);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <section className={`studio-editor ${className}`} aria-label={title}>
      <header className="studio-editor-heading">
        <h2>{title}</h2>
        <button onClick={onClose}>Done</button>
      </header>
      <div className="studio-editor-content">{children}</div>
    </section>
  );
}
