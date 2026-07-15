import type { HTMLAttributes, ReactNode } from "react";

/** Bordered panel with an uppercase header — the base unit of both dashboards. */
export function Panel({
  title,
  children,
  className = "",
  bodyClassName = "",
  action,
  bodyProps,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: ReactNode;
  /** Extra attributes for the body div — e.g. tabIndex/role to make a
   *  scrollable body keyboard-focusable. */
  bodyProps?: HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-[#1a1a19] ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
          {title}
        </h2>
        {action}
      </div>
      <div {...bodyProps} className={`p-3.5 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#a9a79b]">
      {children}
    </span>
  );
}

export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-[#898781]">{label}</span>
      <span className="text-base font-semibold text-white">{value}</span>
    </div>
  );
}
