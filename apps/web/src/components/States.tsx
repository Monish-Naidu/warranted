/**
 * Loading, empty, and error presentation.
 *
 * Every query in the portal has three failure-adjacent states and previously
 * only rendered one of them ("Loading…"). A coordinator who can't tell an
 * empty result from a dead API will assume the empty one, which in this
 * product means assuming there is no exposure.
 */

import type { ReactNode } from "react";
import { IconAlert, IconInbox } from "./Icon";

export function Skeleton({
  width,
  height = 12,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** Stat tiles + a few rows — the shape most pages settle into. */
export function PageSkeleton({ stats = 0, rows = 4 }: { stats?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {stats > 0 && (
        <div className="stat-row">
          {Array.from({ length: stats }, (_, i) => (
            <Skeleton key={i} className="skeleton-card" height={92} />
          ))}
        </div>
      )}

      <div className="stack">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="skeleton-card" height={72} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card empty">
      <div className="empty-icon">{icon ?? <IconInbox size={20} />}</div>
      <div className="empty-title">{title}</div>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "The request didn't complete.";

  return (
    <div className="card empty" role="alert">
      <div className="empty-icon" style={{ color: "var(--critical)" }}>
        <IconAlert size={20} />
      </div>
      <div className="empty-title">{title}</div>
      <p>{message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
