import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ExposureWindow, type Lot } from "../api";

import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

export function ExposurePage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
  });

  if (isLoading) return <ExposureHead skeleton />;
  if (isError || !data) {
    return (
      <>
        <ExposureHead />
        <ErrorState
          title="Couldn't load exposure"
          error={error}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  const { alerts, lots, summary } = data;

  return (
    <>
      <ExposureHead />

      <div className="stat-row">
        <Stat
          row={0}
          value={summary.criticalAlerts}
          label="Critical alerts"
          tone={summary.criticalAlerts > 0 ? "critical" : undefined}
        />
        <Stat
          row={1}
          value={summary.warningAlerts}
          label="Warnings"
          tone={summary.warningAlerts > 0 ? "warning" : undefined}
        />
        <Stat
          row={2}
          value={summary.undocumentedAssignments}
          label="Trades with no completion date"
          tone={summary.undocumentedAssignments > 0 ? "critical" : undefined}
        />
        <Stat
          row={3}
          value={summary.lotsWithUnscheduledElevenMonth}
          label="11-month reviews due, unscheduled"
          tone={
            summary.lotsWithUnscheduledElevenMonth > 0 ? "warning" : undefined
          }
        />
        <Stat row={4} value={summary.lots} label="Homes under warranty" />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Alerts</h2>
          {alerts.length > 0 && (
            <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
              {alerts.length} open
            </span>
          )}
        </div>

        {alerts.length === 0 ? (
          <EmptyState title="No exposure alerts" tone="ok">
            Every trade is either back-to-back with your warranty or already
            closed out.
          </EmptyState>
        ) : (
          alerts.map((alert, i) => (
            <div
              key={`${alert.assignmentId}-${alert.trade}`}
              className={`alert ${alert.severity}`}
              style={{ "--row": i } as React.CSSProperties}
            >
              <div className="alert-bar" aria-hidden />
              <div className="alert-body">
                <div className="alert-meta">
                  <span className={`badge ${alert.severity}`}>
                    <span className="dot" aria-hidden />
                    {alert.severity}
                  </span>
                  <span className="cap">{alert.trade.replace(/_/g, " ")}</span>
                  <span className="faint" aria-hidden>
                    ·
                  </span>
                  <span>{alert.subcontractorName}</span>
                  {alert.daysUntilSubExpiry !== null && (
                    <>
                      <span className="faint" aria-hidden>
                        ·
                      </span>
                      <span>
                        {alert.daysUntilSubExpiry < 0
                          ? `sub warranty closed ${Math.abs(alert.daysUntilSubExpiry)}d ago`
                          : `${alert.daysUntilSubExpiry}d left on sub warranty`}
                      </span>
                    </>
                  )}
                </div>
                <div className="alert-text">{alert.message}</div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">By lot</h2>
          <ClockLegend />
        </div>

        {lots.length === 0 ? (
          <EmptyState title="No homes under warranty">
            Homes appear here once they have a warranty start date on record.
          </EmptyState>
        ) : (
          [...lots]
            .sort(riskFirst)
            .map((lot, i) => <LotCard key={lot.homeId} lot={lot} row={i} />)
        )}
      </section>
    </>
  );
}

function ExposureHead({ skeleton }: { skeleton?: boolean }) {
  return (
    <>
      <div className="page-head">
        <h1>Exposure</h1>
        <p>
          Your warranty to the homeowner runs from closing. Your subcontractors'
          warranties to you run from <em>their</em> completion — often months
          earlier. Everything below is the gap between those two clocks: work
          you still owe the homeowner but can no longer charge back.
        </p>
      </div>
      {skeleton && <PageSkeleton stats={5} rows={3} />}
    </>
  );
}

function Stat({
  value,
  label,
  tone,
  row = 0,
}: {
  value: number;
  label: string;
  tone?: "critical" | "warning";
  row?: number;
}) {
  return (
    <div
      className={`stat ${tone ? `is-${tone}` : ""}`}
      style={{ "--row": row } as React.CSSProperties}
    >
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ClockLegend() {
  return (
    <div className="clock-legend">
      <span className="clock-legend-item">
        <span className="legend-swatch covered" aria-hidden />
        Sub covers
      </span>
      <span className="clock-legend-item">
        <span className="legend-swatch exposed" aria-hidden />
        You carry alone
      </span>
      <span className="clock-legend-item">
        <span className="legend-swatch unknown" aria-hidden />
        Undocumented
      </span>
      <span className="clock-legend-item">
        <span className="legend-swatch today" aria-hidden />
        Today
      </span>
    </div>
  );
}

/**
 * Worst first. A lot with an undocumented trade outranks everything — that is
 * the bus-factor failure, and no amount of exposure elsewhere is as
 * unrecoverable. After that, raw exposure days, then an overdue 11-month.
 */
function riskFirst(a: Lot, b: Lot): number {
  if (a.undocumentedTrades !== b.undocumentedTrades) {
    return b.undocumentedTrades - a.undocumentedTrades;
  }
  if (a.totalExposureDays !== b.totalExposureDays) {
    return b.totalExposureDays - a.totalExposureDays;
  }
  const aDue = a.elevenMonth.daysUntilDue ?? Number.POSITIVE_INFINITY;
  const bDue = b.elevenMonth.daysUntilDue ?? Number.POSITIVE_INFINITY;
  return aDue - bDue;
}

function LotCard({ lot, row }: { lot: Lot; row: number }) {
  const queryClient = useQueryClient();

  const schedule = useMutation({
    mutationFn: () => {
      // Two weeks out is a realistic default for a coordinator booking a visit.
      const when = new Date();
      when.setDate(when.getDate() + 14);
      when.setHours(10, 0, 0, 0);
      return api.scheduleMilestone(lot.homeId, "eleven_month", when.toISOString());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exposure"] }),
  });

  const dueIn = lot.elevenMonth.daysUntilDue;
  const elevenMonthBadge = lot.elevenMonth.scheduled
    ? { cls: "ok", text: "11-month scheduled" }
    : dueIn !== null && dueIn <= 60
      ? {
          cls: "critical",
          text:
            dueIn < 0
              ? `11-month review ${Math.abs(dueIn)}d overdue`
              : `11-month review due in ${dueIn}d`,
        }
      : { cls: "", text: `11-month review in ${dueIn ?? "—"}d` };

  return (
    <article
      className={`lot-card ${lot.undocumentedTrades > 0 ? "has-critical" : ""}`}
      style={{ "--row": row } as React.CSSProperties}
    >
      <header className="lot-head">
        <div style={{ minWidth: 0 }}>
          <div className="lot-title">
            Lot {lot.lotNumber} — {lot.address}
          </div>
          <div className="lot-meta">
            {lot.community}
            {lot.plan ? ` · ${lot.plan}` : ""} · warranty started{" "}
            <span className="mono">{lot.warrantyStartDate}</span>
          </div>
        </div>

        <div className="lot-actions">
          {lot.undocumentedTrades > 0 && (
            <span className="badge critical">
              <span className="dot" aria-hidden />
              {lot.undocumentedTrades} undocumented
            </span>
          )}
          <span className={`badge ${elevenMonthBadge.cls}`}>
            {elevenMonthBadge.text}
          </span>
          {!lot.elevenMonth.scheduled && (
            <button
              className="btn primary sm"
              onClick={() => schedule.mutate()}
              disabled={schedule.isPending}
            >
              {schedule.isPending ? "Scheduling…" : "Schedule"}
            </button>
          )}
        </div>
      </header>

      <div className="lot-body">
        {lot.exposure.length === 0 ? (
          <p className="muted" style={{ padding: "var(--space-3) 0" }}>
            No subcontractor assignments recorded.
          </p>
        ) : (
          <div className="clock-list">
            {[...lot.exposure]
              // Undocumented first, then longest tail — same logic as the lot
              // sort, applied within the card.
              .sort(
                (a, b) =>
                  Number(b.unknown) - Number(a.unknown) ||
                  b.exposureDays - a.exposureDays,
              )
              .map((window, i) => (
                <ClockBar
                  key={window.assignmentId}
                  window={window}
                  warrantyStart={lot.warrantyStartDate}
                  row={i}
                />
              ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * One trade's two clocks on a single track.
 *
 * The track spans the builder's whole obligation for this trade — warranty
 * start through the end of the tier that covers it. The solid segment is the
 * part the subcontractor's own warranty still backs; the hatched tail is what
 * the builder carries alone.
 *
 * The denominator is the *full builder window*, not the exposed span. Using
 * the exposed span made every bar render 100% red, which is how the previous
 * version managed to draw a 30-day tail and a 272-day tail identically.
 */
function ClockBar({
  window: w,
  warrantyStart,
  row,
}: {
  window: ExposureWindow;
  warrantyStart: string;
  row: number;
}) {
  const totalDays = Math.max(1, daysBetween(warrantyStart, w.builderCoverageEnd));
  const exposedDays = Math.min(Math.max(w.exposureDays, 0), totalDays);
  const exposedPct = (exposedDays / totalDays) * 100;
  const coveredPct = 100 - exposedPct;

  // Where "now" falls in the window. Off-track values are simply not drawn.
  const elapsed = daysBetween(warrantyStart, todayIso());
  const todayPct = (elapsed / totalDays) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  const label = w.unknown
    ? `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: no completion date on record. The entire ${totalDays}-day builder window is unrecoverable.`
    : exposedDays > 0
      ? `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: sub warranty ends ${w.subCoverageEnd}, your obligation runs to ${w.builderCoverageEnd}. ${exposedDays} of ${totalDays} days exposed.`
      : `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: covered back-to-back through ${w.builderCoverageEnd}.`;

  return (
    <div className="clock" style={{ "--row": row } as React.CSSProperties}>
      <div className="clock-trade">
        <div className="clock-trade-name">{w.trade.replace(/_/g, " ")}</div>
        <div className="clock-sub">{w.subcontractorName}</div>
      </div>

      <div className="clock-track" role="img" aria-label={label} title={label}>
        {w.unknown ? (
          <div className="clock-unknown" />
        ) : (
          <>
            <div className="clock-covered" style={{ width: `${coveredPct}%` }} />
            {exposedDays > 0 && (
              <div className="clock-exposed" style={{ width: `${exposedPct}%` }} />
            )}
          </>
        )}
        {showToday && (
          <div className="clock-today" style={{ left: `${todayPct}%` }} />
        )}
      </div>

      <div>
        <div
          className={`clock-days ${
            w.unknown ? "unknown" : exposedDays > 0 ? "exposed" : "covered"
          }`}
        >
          {w.unknown
            ? "undocumented"
            : exposedDays > 0
              ? `${exposedDays}d exposed`
              : "covered"}
        </div>
        <div
          className="faint"
          style={{
            fontSize: "var(--text-2xs)",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          of {totalDays}d
        </div>
      </div>
    </div>
  );
}

/** UTC-noon anchored, matching `packages/warranty/src/dates.ts`. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
