import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ExposureWindow, type Lot } from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

/** How `warranty_start_source` reads to a coordinator. */
const START_SOURCE_LABELS: Record<string, string> = {
  closing_date: "Closing date",
  certificate_of_occupancy: "Certificate of occupancy",
  possession_date: "Possession date",
  first_occupancy: "First occupancy",
  manual_override: "Manual override",
};

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
          label="11-month reviews unscheduled"
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
            Every trade is either back to back with your warranty or already
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
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          By lot
        </h2>

        {/* Sticky: with ten lots on screen the legend scrolls away exactly
            when you start needing it. */}
        <div className="legend-bar">
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
          Your warranty to the homeowner runs from closing. Your
          subcontractors' warranties to you run from their own completion,
          often months earlier. The gap is work you still owe the homeowner but
          can no longer charge back.
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
        <span className="legend-swatch boundary" aria-hidden />
        Sub warranty ends
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
 * Worst first. A lot with an undocumented trade outranks everything, because
 * that is the bus-factor failure and no amount of exposure elsewhere is as
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
      : { cls: "", text: `11-month review in ${dueIn ?? "n/a"}d` };

  return (
    <article
      className={`lot-card ${lot.undocumentedTrades > 0 ? "has-critical" : ""}`}
      style={{ "--row": row } as React.CSSProperties}
    >
      <header className="lot-head">
        <div style={{ minWidth: 0 }}>
          <div className="lot-title">Lot {lot.lotNumber}</div>
          <div className="lot-meta">
            {lot.address} · {lot.community}
            {lot.plan ? ` · ${lot.plan}` : ""}
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

      <WarrantyStart lot={lot} />

      <div className="lot-body">
        {lot.exposure.length === 0 ? (
          <p className="muted" style={{ padding: "var(--space-3) 0" }}>
            No subcontractor assignments recorded.
          </p>
        ) : (
          <div className="clock-list">
            {[...lot.exposure]
              // Undocumented first, then longest tail. Same logic as the lot
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
 * The warranty start date, with the record of which date it came from.
 *
 * Closing, certificate of occupancy, and possession routinely differ, and
 * warranty documents disagree about which one governs. It is the most
 * disputed field in the domain, which is why the schema stores the source and
 * a note rather than deriving the date. Showing only the date threw away the
 * half a coordinator needs when a homeowner argues their coverage ran longer.
 */
function WarrantyStart({ lot }: { lot: Lot }) {
  const source = START_SOURCE_LABELS[lot.warrantyStartSource] ?? lot.warrantyStartSource;

  const candidates = [
    { label: "Closing", value: lot.closingDate },
    { label: "Certificate of occupancy", value: lot.certificateOfOccupancyDate },
    { label: "Possession", value: lot.possessionDate },
  ].filter((c) => c.value);

  // Worth calling out only when the candidates actually disagree; on a
  // build-to-order they are usually the same week and the detail is noise.
  const disagree =
    new Set(candidates.map((c) => c.value)).size > 1 ? candidates : null;

  return (
    <div className="warranty-start">
      <div className="warranty-start-main">
        <span className="warranty-start-label">Warranty start</span>
        <span className="warranty-start-date mono">{lot.warrantyStartDate}</span>
        <span className="badge">{source}</span>
        {disagree && <span className="badge warning">dates differ</span>}
      </div>

      {(lot.warrantyStartNote || disagree) && (
        <details className="warranty-start-detail">
          <summary>Why this date</summary>
          <div className="warranty-start-body">
            {disagree && (
              <dl className="date-list">
                {disagree.map((c) => (
                  <div key={c.label}>
                    <dt>{c.label}</dt>
                    <dd className="mono">{c.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {lot.warrantyStartNote && (
              <p className="muted">{lot.warrantyStartNote}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * One trade's two clocks on a single track.
 *
 * The track spans the builder's whole obligation for this trade: warranty
 * start through the end of the tier that covers it. The solid segment is the
 * part the subcontractor's own warranty still backs, and the hatched tail is
 * what the builder carries alone.
 *
 * The denominator is the full builder window, not the exposed span. Using the
 * exposed span made every bar render 100% red, which is how the first version
 * managed to draw a 30-day tail and a 272-day tail identically.
 *
 * Each row is scaled to its own trade, so a 1-year drywall bar and a 2-year
 * plumbing bar are both full width and the "today" marks sit at different
 * points. That is why the tier length and the end dates are printed rather
 * than left to a tooltip.
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

  const elapsed = daysBetween(warrantyStart, todayIso());
  const todayPct = (elapsed / totalDays) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  // A gridline every year, so a two-year track reads as two years at a glance
  // rather than as a longer version of a one-year track.
  const yearPct = (365 / totalDays) * 100;

  const label = w.unknown
    ? `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: no completion date on record. The entire ${totalDays}-day builder window is unrecoverable.`
    : exposedDays > 0
      ? `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: sub warranty ends ${w.subCoverageEnd}, your obligation runs to ${w.builderCoverageEnd}. ${exposedDays} of ${totalDays} days exposed.`
      : `${w.trade.replace(/_/g, " ")}, ${w.subcontractorName}: covered back to back through ${w.builderCoverageEnd}.`;

  return (
    <div className="clock" style={{ "--row": row } as React.CSSProperties}>
      <div className="clock-trade">
        <div className="clock-trade-name">{w.trade.replace(/_/g, " ")}</div>
        <div className="clock-sub">{w.subcontractorName}</div>
      </div>

      <div className="clock-plot">
        <div
          className="clock-track"
          role="img"
          aria-label={label}
          title={label}
          style={
            {
              "--year-pct": `${yearPct}%`,
              // Gridlines only help when they are countable. A ten-year
              // structural window would draw nine of them into 24 pixels.
              "--tick-color": yearPct >= 12 ? "var(--border)" : "transparent",
            } as React.CSSProperties
          }
        >
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

        {/* The dates the bar is drawn from. Without them the reader has no way
            to tell that two rows on the same lot are on different scales. */}
        <div className="clock-axis">
          <span>{warrantyStart}</span>
          {!w.unknown && w.subCoverageEnd && coveredPct > 16 && coveredPct < 88 && (
            <span
              className="clock-axis-mark"
              style={{ left: `${coveredPct}%` }}
              title={`${w.subcontractorName}'s warranty ends ${w.subCoverageEnd}`}
            >
              sub ends {w.subCoverageEnd}
            </span>
          )}
          <span>{w.builderCoverageEnd}</span>
        </div>
      </div>

      <div className="clock-figure">
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
        <div className="clock-window">of {totalDays}d</div>
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
