import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@warranted/shared";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "./api";
import { ClaimDetailPage } from "./pages/ClaimDetail";
import { ClaimsPage } from "./pages/Claims";
import { ExposurePage } from "./pages/Exposure";
import { LoginPage } from "./pages/Login";
import { PatternsPage } from "./pages/Patterns";
import { ScorecardPage } from "./pages/Scorecard";

export function App() {
  const hasToken = Boolean(getToken());

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: hasToken,
  });

  if (!hasToken || isError) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (isLoading || !data) {
    return <div className="empty">Loading…</div>;
  }

  return <Shell user={data.user} />;
}

function Shell({ user }: { user: SessionUser }) {
  const navigate = useNavigate();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          Warranted
        </div>

        <NavLink to="/exposure" className="nav-link">
          Exposure
        </NavLink>
        <NavLink to="/claims" className="nav-link">
          Claims
        </NavLink>
        <NavLink to="/subcontractors" className="nav-link">
          Subcontractors
        </NavLink>
        <NavLink to="/patterns" className="nav-link">
          Plan patterns
        </NavLink>

        <div className="sidebar-foot">
          <div style={{ color: "var(--text-dim)", marginBottom: 2 }}>
            {user.fullName}
          </div>
          <div style={{ marginBottom: 10 }}>{user.role.replace(/_/g, " ")}</div>
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => {
              setToken(null);
              navigate("/login");
              window.location.reload();
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/exposure" element={<ExposurePage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
          <Route path="/subcontractors" element={<ScorecardPage />} />
          <Route path="/patterns" element={<PatternsPage />} />
          <Route path="*" element={<Navigate to="/exposure" replace />} />
        </Routes>
      </main>
    </div>
  );
}
