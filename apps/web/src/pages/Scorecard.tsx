import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function ScorecardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scorecard"],
    queryFn: api.scorecard,
  });

  const totalUnrecovered =
    data?.subcontractors.reduce((sum, s) => sum + s.unrecoverableCents, 0) ?? 0;

  return (
    <>
      <div className="page-head">
        <h1>Subcontractors</h1>
        <p>
          Claim volume, warranty spend, and how much of it you actually
          recovered. The unrecovered column is your leak, itemized by who caused
          it — which is a pricing conversation at the next bid.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton rows={5} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load the scorecard"
          error={error}
          onRetry={() => refetch()}
        />
      ) : data.subcontractors.length === 0 ? (
        <EmptyState title="No subcontractors on file">
          Subcontractors appear here once they're assigned to a lot.
        </EmptyState>
      ) : (
        <>
          {totalUnrecovered > 0 && (
            <div className="stat-row" style={{ marginBottom: "var(--space-5)" }}>
              <div className="stat is-critical">
                <div className="stat-value">{usd(totalUnrecovered)}</div>
                <div className="stat-label">
                  Unrecovered warranty cost across all trades
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Subcontractor scorecard, {data.subcontractors.length} companies
              </caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Trade</th>
                  <th scope="col" className="num">
                    Lots
                  </th>
                  <th scope="col" className="num">
                    Claims
                  </th>
                  <th scope="col" className="num">
                    Recovered
                  </th>
                  <th scope="col" className="num">
                    Unrecovered
                  </th>
                  <th scope="col" className="num">
                    Recovery
                  </th>
                  <th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {data.subcontractors.map((sub) => {
                  const insuranceLapsed =
                    sub.insuranceExpiresOn !== null &&
                    new Date(sub.insuranceExpiresOn) < new Date();

                  return (
                    <tr key={sub.id}>
                      <td className="cell-strong">{sub.companyName}</td>
                      <td className="cap">
                        {sub.primaryTrade.replace(/_/g, " ")}
                      </td>
                      <td className="num mono">{sub.lotsWorked}</td>
                      <td className="num mono">{sub.claimCount}</td>
                      <td className="num mono">{usd(sub.recoverableCents)}</td>
                      <td
                        className="num mono"
                        style={{
                          color:
                            sub.unrecoverableCents > 0
                              ? "var(--critical)"
                              : undefined,
                          fontWeight: sub.unrecoverableCents > 0 ? 650 : undefined,
                        }}
                      >
                        {usd(sub.unrecoverableCents)}
                      </td>
                      <td className="num">
                        <RecoveryMeter rate={sub.recoveryRate} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: "var(--space-1)" }}>
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
                          {sub.undocumentedAssignments === 0 &&
                            !insuranceLapsed && (
                              <span className="badge ok">clear</span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/** Recovery rate as a number plus a bar — the bar is what makes the column
 *  scannable when a dozen subs are listed. */
function RecoveryMeter({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="faint">—</span>;

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
