import type { ReactNode } from 'react';

interface PanelProps {
  readonly title: string;
  readonly id?: string;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Panel({ title, id, meta, actions, className, children }: PanelProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section className={className ? `panel ${className}` : 'panel'} aria-labelledby={headingId} id={id}>
      <header className="panel__header">
        <h2 className="panel__title" id={headingId}>
          {title}
        </h2>
        {meta ? <div className="panel__meta">{meta}</div> : null}
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
