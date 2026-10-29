import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared presentational pieces for the signed-in app. No data access or actions here.

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="space-y-2">
      {eyebrow && <p className="text-sm font-medium text-accent-text">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {description && <div className="max-w-2xl text-muted">{description}</div>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6 ${className}`} {...props} />;
}

export function SectionCard({ id, children }: { id: string; children: ReactNode }) {
  return <Card id={id} className="scroll-mt-24">{children}</Card>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-surface-muted p-5 text-sm">
    <p className="font-medium">{title}</p>
    {children && <div className="mt-1 text-muted">{children}</div>}
    {action && <div className="mt-3">{action}</div>}
  </div>;
}

const buttonStyles = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line bg-surface hover:bg-surface-muted",
};

export function ButtonLink({ variant = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${buttonStyles[variant]} ${className}`} {...props} />;
}

export function LoadingBlock({ label }: { label: string }) {
  return <div role="status" className="space-y-3" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="h-8 w-1/3 animate-pulse rounded bg-surface-muted" />
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map(index => <div key={index} className="h-28 animate-pulse rounded-xl bg-surface-muted" />)}
    </div>
  </div>;
}
