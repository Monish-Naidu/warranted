import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

export function PatternsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["patterns"],
    queryFn: api.patterns,
  });

  return (
    <>
      <div className="page-head">
        <h1>Plan patterns</h1>
        <p>
          Plans repeat, so defects repeat with them. A trade failing on
          several homes of one plan is a design or installation problem, not a
          run of bad luck. It should surface at home six, not home thirty.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton rows={5} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load patterns"
          error={error}
          onRetry={() => refetch()}
        />
      ) : data.patterns.length === 0 ? (
        <EmptyState title="No repeating patterns yet">
          A pattern appears once the same trade is claimed on two or more homes
          of the same plan.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">
              Defect patterns by plan and trade, {data.patterns.length} rows
            </caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Trade</th>
                <th scope="col" className="num">
                  Homes affected
                </th>
                <th scope="col" className="num">
                  Homes on plan
                </th>
                <th scope="col" className="num">
                  Incidence
                </th>
                <th scope="col" className="num">
                  Total claims
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.patterns]
                // Highest incidence first: the point of the page is to find
                // the systemic defect, not to browse.
                .sort((a, b) => (b.incidenceRate ?? 0) - (a.incidenceRate ?? 0))
                .map((p, i) => (
                  <tr key={`${p.planName}-${p.trade}-${i}`}>
                    <td className="cell-strong">
                      {p.planName}
                      {p.elevation ? ` ${p.elevation}` : ""}
                    </td>
                    <td className="cap">{p.trade.replace(/_/g, " ")}</td>
                    <td className="num mono">{p.affectedHomes}</td>
                    <td className="num mono">{p.homesOnPlan}</td>
                    <td className="num">
                      <span
                        className={`badge ${
                          (p.incidenceRate ?? 0) >= 0.15 ? "critical" : "warning"
                        }`}
                      >
                        {p.incidenceRate === null
                          ? "–"
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
