/**
 * Loading, empty, and error presentation.
 *
 * Every query in the portal has three failure-adjacent states and previously
 * only rendered one of them ("Loading…"). A coordinator who can't tell an
 * empty result from a dead API will assume the empty one, which in this
 * product means assuming there is no exposure.
 */

import type { ReactNode } from "react";
import { IconAlert } from "./Icon";

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

/**
 * The empty-state illustration.
 *
 * Two stacked bars — the builder's clock over the sub's shorter one, the same
 * shape as the brand mark and the exposure chart. A generic inbox glyph would
 * say nothing; this at least keeps the page's subject on screen when there is
 * no data to draw.
 */
function EmptyArt({ tone = "neutral" }: { tone?: "neutral" | "ok" }) {
  const accent = tone === "ok" ? "var(--ok)" : "var(--text-faint)";
  return (
    <svg
      width="112"
      height="64"
      viewBox="0 0 112 64"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <rect
        x="8"
        y="16"
        width="96"
        height="14"
        rx="4"
        fill="var(--surface-2)"
        stroke="var(--border)"
      />
      <rect x="8" y="16" width="58" height="14" rx="4" fill={accent} opacity="0.18" />
      <rect
        x="8"
        y="38"
        width="70"
        height="14"
        rx="4"
        fill="var(--surface-2)"
        stroke="var(--border)"
      />
      <rect x="8" y="38" width="30" height="14" rx="4" fill={accent} opacity="0.18" />
      <path
        d="M66 10v46"
        stroke={accent}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        opacity="0.6"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  children,
  icon,
  tone,
}: {
  title: string;
  children?: ReactNode;
  /** Overrides the default illustration — pass a glyph for a compact slot. */
  icon?: ReactNode;
  tone?: "neutral" | "ok";
}) {
  return (
    <div className="card empty">
      {icon ? (
        <div className="empty-icon">{icon}</div>
      ) : (
        <EmptyArt tone={tone} />
      )}
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
