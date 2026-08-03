import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type SubBackcharge, type SubScorecardRow } from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

/**
 * What each column means, in the words a coordinator would use. These are the
 * distinctions the page turns on, and none of them are guessable from a
 * one-word header.
 */
const COLUMN_HELP = {
  lots: "Homes this subcontractor has been assigned to.",
  claims: "Warranty claims charged against this subcontractor.",
  open: "Their warranty is still open and nobody has billed them yet. This is money you can still recover, and the only column here you can act on today.",
  inFlight: "Billed but not yet settled, including anything they are disputing.",
  collected: "Money actually recovered and received.",
  lost: "Unrecoverable. Their warranty closed before the claim, nobody recorded who did the work, or it was written off.",
  recovery:
    "Of the money already resolved, how much came back. Open and in-flight amounts are excluded, since nobody has collected them yet.",
} as const;

const STATUS_LABELS: Record<string, string> = {
  recoverable: "Ready to bill",
  issued: "Billed",
  disputed: "Disputed",
  collected: "Collected",
  expired: "Sub warranty expired",
  no_sub_assigned: "No sub of record",
  written_off: "Written off",
};

const STATUS_CLASS: Record<string, string> = {
  recoverable: "accent",
  issued: "info",
  disputed: "warning",
  collected: "ok",
  expired: "critical",
  no_sub_assigned: "critical",
  written_off: "critical",
};

export function ScorecardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scorecard"],
    queryFn: api.scorecard,
  });

  const subs = data?.subcontractors ?? [];
  const totalOpen = subs.reduce((s, x) => s + x.openCents + x.inFlightCents, 0);
  const totalLost = subs.reduce((s, x) => s + x.lostCents, 0);

  return (
    <>
      <div className="page-head">
        <h1>Subcontractors</h1>
        <p>
          Warranty cost by subcontractor, split by what you can still recover
          and what is already gone.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton stats={2} rows={5} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load the scorecard"
          error={error}
          onRetry={() => refetch()}
        />
      ) : subs.length === 0 ? (
        <EmptyState title="No subcontractors on file">
          Subcontractors appear here once they are assigned to a lot.
        </EmptyState>
      ) : (
        <>
          <div className="stat-row">
            <div
              className={`stat ${totalOpen > 0 ? "is-warning" : ""}`}
              style={{ "--row": 0 } as React.CSSProperties}
            >
              <div className="stat-value">{usd(totalOpen)}</div>
              <div className="stat-label">
                Still recoverable, not yet collected
              </div>
            </div>
            <div
              className={`stat ${totalLost > 0 ? "is-critical" : ""}`}
              style={{ "--row": 1 } as React.CSSProperties}
            >
              <div className="stat-value">{usd(totalLost)}</div>
              <div className="stat-label">Written off across all trades</div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Subcontractor scorecard, {subs.length} companies. Expand a row
                for the individual backcharges and contact details.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 32 }}>
                    <span className="sr-only">Expand</span>
                  </th>
                  <th scope="col">Company</th>
                  <th scope="col">Trade</th>
                  <th scope="col" className="num">
                    <HelpHeader label="Lots" help={COLUMN_HELP.lots} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="Claims" help={COLUMN_HELP.claims} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="To bill" help={COLUMN_HELP.open} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="In flight" help={COLUMN_HELP.inFlight} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="Collected" help={COLUMN_HELP.collected} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="Lost" help={COLUMN_HELP.lost} />
                  </th>
                  <th scope="col" className="num">
                    <HelpHeader label="Recovery" help={COLUMN_HELP.recovery} />
                  </th>
                  <th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((sub) => (
                  <SubRow key={sub.id} sub={sub} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/** A column header with its definition behind a hoverable marker. */
function HelpHeader({ label, help }: { label: string; help: string }) {
  return (
    <span className="help-header">
      {label}
      <button
        type="button"
        className="help-dot"
        aria-label={`${label}: ${help}`}
        title={help}
      >
        i
      </button>
    </span>
  );
}

function SubRow({ sub }: { sub: SubScorecardRow }) {
  const [open, setOpen] = useState(false);

  const insuranceLapsed =
    sub.insuranceExpiresOn !== null &&
    new Date(sub.insuranceExpiresOn) < new Date();

  const actionable = sub.backcharges.filter(
    (b) => b.status === "recoverable" || b.status === "issued" || b.status === "disputed",
  );

  return (
    <>
      <tr
        className="clickable"
        onClick={() => setOpen((v) => !v)}
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <td>
          <span className={`disclosure ${open ? "is-open" : ""}`} aria-hidden>
            ›
          </span>
        </td>
        <td className="cell-strong">{sub.companyName}</td>
        <td className="cap">{sub.primaryTrade.replace(/_/g, " ")}</td>
        <td className="num mono">{sub.lotsWorked}</td>
        <td className="num mono">{sub.claimCount}</td>
        <td className="num mono money-open">
          {sub.openCents > 0 ? usd(sub.openCents) : <span className="faint">–</span>}
        </td>
        <td className="num mono">
          {sub.inFlightCents > 0 ? (
            usd(sub.inFlightCents)
          ) : (
            <span className="faint">–</span>
          )}
        </td>
        <td className="num mono">
          {sub.collectedCents > 0 ? (
            usd(sub.collectedCents)
          ) : (
            <span className="faint">–</span>
          )}
        </td>
        <td className="num mono money-lost">
          {sub.lostCents > 0 ? usd(sub.lostCents) : <span className="faint">–</span>}
        </td>
        <td className="num">
          <RecoveryMeter rate={sub.recoveryRate} />
        </td>
        <td>
          <div className="row" style={{ gap: "var(--space-1)" }}>
            {sub.openCents > 0 && (
              <span className="badge accent">
                <span className="dot" aria-hidden />
                bill now
              </span>
            )}
            {sub.undocumentedAssignments > 0 && (
              <span className="badge critical">
                <span className="dot" aria-hidden />
                {sub.undocumentedAssignments} undocumented
              </span>
            )}
            {insuranceLapsed && (
              <span className="badge critical">
                <span className="dot" aria-hidden />
                insurance lapsed
              </span>
            )}
            {sub.openCents === 0 &&
              sub.undocumentedAssignments === 0 &&
              !insuranceLapsed && <span className="badge ok">clear</span>}
          </div>
        </td>
      </tr>

      {open && (
        <tr className="detail-row">
          <td colSpan={11}>
            <div className="sub-detail">
              <ContactBlock sub={sub} actionable={actionable} />

              {sub.backcharges.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No backcharges recorded against {sub.companyName}.
                </p>
              ) : (
                <div className="charge-list">
                  {[...sub.backcharges]
                    // Billable first: that is what the row was opened for.
                    .sort(
                      (a, b) =>
                        Number(b.status === "recoverable") -
                          Number(a.status === "recoverable") ||
                        (b.amountCents ?? 0) - (a.amountCents ?? 0),
                    )
                    .map((charge) => (
                      <ChargeRow key={charge.id} charge={charge} />
                    ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Contact details plus a pre-written chase email.
 *
 * The gap this closes is small and entirely real: the coordinator who spots
 * unbilled money has to go find the sub's address somewhere else, and the
 * follow-up doesn't happen. The draft opens in their own mail client with the
 * lots and amounts already filled in, so nothing is sent on their behalf.
 */
function ContactBlock({
  sub,
  actionable,
}: {
  sub: SubScorecardRow;
  actionable: SubBackcharge[];
}) {
  const billable = actionable.filter((b) => b.status === "recoverable");
  const total = billable.reduce((s, b) => s + (b.amountCents ?? 0), 0);

  const subject = `Warranty backcharge: ${billable.length} item${billable.length === 1 ? "" : "s"}, ${usd(total)}`;
  const body = [
    `${sub.contactName ? `${sub.contactName},` : "Hello,"}`,
    "",
    "The following warranty repairs fall inside your warranty period and are being charged back:",
    "",
    ...billable.map(
      (b) =>
        `  Lot ${b.lotNumber} · ${b.claimReference} · ${b.claimTitle} · ${b.amountCents ? usd(b.amountCents) : "amount TBD"}`,
    ),
    "",
    `Total: ${usd(total)}`,
    "",
    "Please confirm receipt and let us know if you would like to review any of these.",
    "",
  ].join("\n");

  const mailto = sub.email
    ? `mailto:${sub.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="contact-block">
      <div className="contact-who">
        {sub.contactName && (
          <div className="cell-strong">{sub.contactName}</div>
        )}
        <div className="contact-links">
          {sub.email && <a href={`mailto:${sub.email}`}>{sub.email}</a>}
          {sub.phone && <a href={`tel:${sub.phone}`}>{sub.phone}</a>}
          {sub.insuranceExpiresOn && (
            <span className="faint">
              insurance to <span className="mono">{sub.insuranceExpiresOn}</span>
            </span>
          )}
        </div>
      </div>

      {billable.length > 0 && mailto && (
        <a className="btn primary sm" href={mailto}>
          Draft backcharge for {usd(total)}
        </a>
      )}
    </div>
  );
}

function ChargeRow({ charge }: { charge: SubBackcharge }) {
  return (
    <div className="charge">
      <div className="charge-head">
        <Link to={`/claims/${charge.claimId}`} className="charge-ref mono">
          {charge.claimReference}
        </Link>
        <span className="charge-title">{charge.claimTitle}</span>
        <span className="badge">Lot {charge.lotNumber}</span>
        <span className={`badge ${STATUS_CLASS[charge.status] ?? ""}`}>
          {STATUS_LABELS[charge.status] ?? charge.status.replace(/_/g, " ")}
        </span>
        {charge.daysLate !== null && charge.daysLate > 0 && (
          <span className="badge critical">{charge.daysLate}d too late</span>
        )}
        <span className="charge-amount mono">
          {charge.amountCents !== null ? usd(charge.amountCents) : "–"}
        </span>
      </div>
      <p className="charge-rationale">{charge.rationale}</p>
    </div>
  );
}

/** Recovery rate as a number plus a bar, so the column is scannable. */
function RecoveryMeter({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="faint">–</span>;

  const pct = Math.round(rate * 100);
  const tone = pct < 40 ? "low" : pct < 75 ? "mid" : "";

  return (
    <span className="meter">
      <span className="mono">{pct}%</span>
      <span
        className="meter-track"
        role="img"
        aria-label={`${pct} percent recovered`}
      >
        <span
          className={`meter-fill ${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
    </span>
  );
}
