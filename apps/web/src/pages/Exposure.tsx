import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ExposureWindow, type Lot } from "../api";

export function ExposurePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
  });

  if (isLoading) return <div className="empty">Loading exposure…</div>;
  if (!data) return <div className="empty">Couldn't load exposure.</div>;

  const { alerts, lots, summary } = data;

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

      <div className="stat-row">
        <div className={`stat ${summary.criticalAlerts > 0 ? "is-critical" : ""}`}>
          <div className="stat-value">{summary.criticalAlerts}</div>
          <div className="stat-label">Critical alerts</div>
        </div>
        <div className={`stat ${summary.warningAlerts > 0 ? "is-warning" : ""}`}>
          <div className="stat-value">{summary.warningAlerts}</div>
          <div className="stat-label">Warnings</div>
        </div>
        <div className={`stat ${summary.undocumentedAssignments > 0 ? "is-critical" : ""}`}>
          <div className="stat-value">{summary.undocumentedAssignments}</div>
          <div className="stat-label">Trades with no completion date</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary.lotsWithUnscheduledElevenMonth}</div>
          <div className="stat-label">11-month reviews due, unscheduled</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary.lots}</div>
          <div className="stat-label">Homes under warranty</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Alerts</h2>
        {alerts.length === 0 ? (
          <div className="card empty">
            No exposure alerts. Every trade is either back-to-back with your
            warranty or already closed out.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={`${alert.assignmentId}-${alert.trade}`}
              className={`alert ${alert.severity}`}
            >
              <div className="alert-bar" aria-hidden />
              <div className="alert-body">
                <div className="alert-meta">
                  <span className={`badge ${alert.severity}`}>
                    {alert.severity}
                  </span>
                  <span style={{ textTransform: "capitalize" }}>{alert.trade}</span>
                  <span className="faint">·</span>
                  <span>{alert.subcontractorName}</span>
                  {alert.daysUntilSubExpiry !== null && (
                    <>
                      <span className="faint">·</span>
                      <span>{alert.daysUntilSubExpiry}d left on sub warranty</span>
                    </>
                  )}
                </div>
                {alert.message}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <h2 className="section-title">By lot</h2>
        {lots.map((lot) => (
          <LotCard key={lot.homeId} lot={lot} />
        ))}
      </section>
    </>
  );
}

function LotCard({ lot }: { lot: Lot }) {
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
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Lot {lot.lotNumber} — {lot.address}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {lot.community}
            {lot.plan ? ` · ${lot.plan}` : ""} · warranty started{" "}
            {lot.warrantyStartDate}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${elevenMonthBadge.cls}`}>
            {elevenMonthBadge.text}
          </span>
          {!lot.elevenMonth.scheduled && (
            <button
              className="btn primary"
              onClick={() => schedule.mutate()}
              disabled={schedule.isPending}
            >
              {schedule.isPending ? "Scheduling…" : "Schedule"}
            </button>
          )}
        </div>
      </div>

      {lot.exposure.length === 0 ? (
        <div className="muted">No subcontractor assignments recorded.</div>
      ) : (
        lot.exposure.map((window) => (
          <ClockBar key={window.assignmentId} window={window} />
        ))
      )}
    </div>
  );
}

/**
 * One trade's two clocks on a single track.
 *
 * The track spans the builder's obligation. The green segment is how much of
 * it the subcontractor's warranty actually covers; the hatched red tail is
 * what the builder carries alone.
 */
function ClockBar({ window: w }: { window: ExposureWindow }) {
  const totalDays = Math.max(
    1,
    daysBetween(w.exposureStart ?? w.builderCoverageEnd, w.builderCoverageEnd) +
      (w.exposureDays > 0 ? 0 : 1),
  );

  // Proportion of the builder window that the sub still covers.
  const coveredPct = w.unknown
    ? 0
    : Math.max(
        0,
        Math.min(100, 100 - (w.exposureDays / Math.max(totalDays, w.exposureDays)) * 100),
      );

  return (
    <div className="clock">
      <div className="clock-trade">
        {w.trade.replace(/_/g, " ")}
        <div className="faint" style={{ fontSize: 11 }}>
          {w.subcontractorName}
        </div>
      </div>

      <div
        className="clock-track"
        title={
          w.unknown
            ? "No completion date on record — no provable backcharge window."
            : `Sub warranty ends ${w.subCoverageEnd}; your obligation runs to ${w.builderCoverageEnd}.`
        }
      >
        {w.unknown ? (
          <div className="clock-unknown" />
        ) : (
          <>
            <div className="clock-covered" style={{ width: `${coveredPct}%` }} />
            {w.exposureDays > 0 && (
              <div className="clock-exposed" style={{ width: `${100 - coveredPct}%` }} />
            )}
          </>
        )}
      </div>

      <div className={`clock-days ${w.exposureDays > 0 ? "exposed" : ""}`}>
        {w.unknown
          ? "undocumented"
          : w.exposureDays > 0
            ? `${w.exposureDays}d exposed`
            : "covered"}
      </div>
    </div>
  );
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
