import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ScorecardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["scorecard"],
    queryFn: api.scorecard,
  });

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
        <div className="empty">Loading…</div>
      ) : !data || data.subcontractors.length === 0 ? (
        <div className="card empty">No subcontractors on file.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Trade</th>
                <th className="num">Lots</th>
                <th className="num">Claims</th>
                <th className="num">Recovered</th>
                <th className="num">Unrecovered</th>
                <th className="num">Recovery</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {data.subcontractors.map((sub) => {
                const insuranceLapsed =
                  sub.insuranceExpiresOn !== null &&
                  new Date(sub.insuranceExpiresOn) < new Date();

                return (
                  <tr key={sub.id}>
                    <td style={{ fontWeight: 550 }}>{sub.companyName}</td>
                    <td style={{ textTransform: "capitalize" }}>
                      {sub.primaryTrade.replace(/_/g, " ")}
                    </td>
                    <td className="num mono">{sub.lotsWorked}</td>
                    <td className="num mono">{sub.claimCount}</td>
                    <td className="num mono">{usd(sub.recoverableCents)}</td>
                    <td
                      className="num mono"
                      style={{
                        color:
                          sub.unrecoverableCents > 0 ? "var(--critical)" : undefined,
                      }}
                    >
                      {usd(sub.unrecoverableCents)}
                    </td>
                    <td className="num mono">
                      {sub.recoveryRate === null
                        ? "—"
                        : `${Math.round(sub.recoveryRate * 100)}%`}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {sub.undocumentedAssignments > 0 && (
                          <span className="badge critical">
                            {sub.undocumentedAssignments} undocumented
                          </span>
                        )}
                        {insuranceLapsed && (
                          <span className="badge critical">insurance lapsed</span>
                        )}
                        {sub.undocumentedAssignments === 0 && !insuranceLapsed && (
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
      )}
    </>
  );
}
