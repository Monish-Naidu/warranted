import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

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

export function ClaimsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["claims", status],
    queryFn: () => api.claims(status || undefined),
  });

  return (
    <>
      <div className="page-head">
        <h1>Claims</h1>
        <p>
          Warranty service requests from homeowners. Triage proposes a
          determination with citations; you decide.
        </p>
      </div>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`btn ${status === f.value ? "primary" : ""}`}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="empty">Loading claims…</div>
      ) : !data || data.claims.length === 0 ? (
        <div className="card empty">No claims match that filter.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Claim</th>
                <th>Lot</th>
                <th>Trade</th>
                <th>Severity</th>
                <th>Status</th>
                <th className="num">Filed</th>
              </tr>
            </thead>
            <tbody>
              {data.claims.map(({ claim, home, community }) => (
                <tr
                  key={claim.id}
                  className="clickable"
                  onClick={() => navigate(`/claims/${claim.id}`)}
                >
                  <td className="mono">{claim.reference}</td>
                  <td>
                    <div style={{ fontWeight: 550 }}>{claim.title}</div>
                    {claim.room && <div className="faint">{claim.room}</div>}
                  </td>
                  <td>
                    {home.lotNumber}
                    <div className="faint">{community.name}</div>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>
                    {claim.trade?.replace(/_/g, " ") ?? (
                      <span className="faint">untriaged</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        SEVERITY_CLASS[claim.assessedSeverity ?? claim.reportedSeverity] ?? ""
                      }`}
                    >
                      {claim.assessedSeverity ?? claim.reportedSeverity}
                    </span>
                  </td>
                  <td>
                    <span className="badge">{claim.status.replace(/_/g, " ")}</span>
                  </td>
                  <td className="num mono">{claim.reportedOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
