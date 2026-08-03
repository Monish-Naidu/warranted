import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

const FILTERS = [
  { value: "", label: "All" },
  { value: "submitted", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "denied", label: "Denied" },
];

const SEVERITY_CLASS: Record<string, string> = {
  emergency: "critical",
  urgent: "warning",
  routine: "",
  cosmetic: "",
};

const STATUS_CLASS: Record<string, string> = {
  submitted: "info",
  triaged: "accent",
  approved: "ok",
  scheduled: "ok",
  denied: "critical",
  closed: "",
};

export function ClaimsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["claims", status],
    queryFn: () => api.claims(status || undefined),
  });

  // Client-side filter over the already-fetched page. The list is small
  // enough that a round trip per keystroke would be the slower option.
  const rows = useMemo(() => {
    const all = data?.claims ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(({ claim, home, community }) =>
      [
        claim.reference,
        claim.title,
        claim.room,
        claim.trade,
        home.lotNumber,
        community.name,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [data, query]);

  return (
    <>
      <div className="page-head">
        <h1>Claims</h1>
        <p>
          Warranty service requests from homeowners. Triage proposes a
          determination with citations; you decide.
        </p>
      </div>

      <div
        className="row"
        style={{ marginBottom: "var(--space-4)", gap: "var(--space-3)" }}
      >
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reference, lot, trade…"
          aria-label="Search claims"
          style={{ maxWidth: 260 }}
        />
      </div>

      {isLoading ? (
        <PageSkeleton rows={6} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load claims"
          error={error}
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No claims match">
          {query
            ? `Nothing matches "${query}" in this view.`
            : "Nothing in this status right now."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">
              Warranty claims, {rows.length} shown
            </caption>
            <thead>
              <tr>
                <th scope="col">Ref</th>
                <th scope="col">Claim</th>
                <th scope="col">Lot</th>
                <th scope="col">Trade</th>
                <th scope="col">Severity</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Filed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ claim, home, community }) => {
                const open = () => navigate(`/claims/${claim.id}`);
                const severity =
                  claim.assessedSeverity ?? claim.reportedSeverity;

                return (
                  <tr
                    key={claim.id}
                    className="clickable"
                    onClick={open}
                    // Rows are the primary navigation on this page, so they
                    // have to be reachable without a mouse.
                    tabIndex={0}
                    role="link"
                    aria-label={`Open claim ${claim.reference}: ${claim.title}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open();
                      }
                    }}
                  >
                    <td className="mono faint">{claim.reference}</td>
                    <td>
                      <div className="cell-strong">{claim.title}</div>
                      {claim.room && <div className="cell-sub">{claim.room}</div>}
                    </td>
                    <td>
                      <div className="cell-strong">{home.lotNumber}</div>
                      <div className="cell-sub">{community.name}</div>
                    </td>
                    <td className="cap">
                      {claim.trade?.replace(/_/g, " ") ?? (
                        <span className="faint">untriaged</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${SEVERITY_CLASS[severity] ?? ""}`}>
                        {severity}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${STATUS_CLASS[claim.status] ?? ""}`}
                      >
                        {claim.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="num mono faint">{claim.reportedOn}</td>
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
