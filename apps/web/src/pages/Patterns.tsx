import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function PatternsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["patterns"],
    queryFn: api.patterns,
  });

  return (
    <>
      <div className="page-head">
        <h1>Plan patterns</h1>
        <p>
          Plans repeat, so defects repeat with them. A trade failing on several
          homes of the same plan is a design or installation problem, not a run
          of bad luck — and it should surface at home six, not home thirty.
        </p>
      </div>

      {isLoading ? (
        <div className="empty">Loading…</div>
      ) : !data || data.patterns.length === 0 ? (
        <div className="card empty">
          No repeating patterns yet. A pattern appears once the same trade is
          claimed on two or more homes of the same plan.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Trade</th>
                <th className="num">Homes affected</th>
                <th className="num">Homes on plan</th>
                <th className="num">Incidence</th>
                <th className="num">Total claims</th>
              </tr>
            </thead>
            <tbody>
              {data.patterns.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 550 }}>
                    {p.planName}
                    {p.elevation ? ` ${p.elevation}` : ""}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>
                    {p.trade.replace(/_/g, " ")}
                  </td>
                  <td className="num mono">{p.affectedHomes}</td>
                  <td className="num mono">{p.homesOnPlan}</td>
                  <td className="num">
                    <span
                      className={`badge ${
                        (p.incidenceRate ?? 0) >= 0.15 ? "critical" : "warning"
                      }`}
                    >
                      {p.incidenceRate === null
                        ? "—"
                        : `${Math.round(p.incidenceRate * 100)}%`}
                    </span>
                  </td>
                  <td className="num mono">{p.claimCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
