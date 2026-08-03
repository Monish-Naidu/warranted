import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@warranted/shared";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "./api";
import {
  IconClipboard,
  IconGauge,
  IconGrid,
  IconSignOut,
  IconUsers,
} from "./components/Icon";
import { PageSkeleton } from "./components/States";
import { ThemeToggle } from "./components/ThemeToggle";
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
    return (
      <div className="main">
        <PageSkeleton stats={4} rows={3} />
      </div>
    );
  }

  return <Shell user={data.user} />;
}

const NAV = [
  { to: "/exposure", label: "Exposure", Icon: IconGauge },
  { to: "/claims", label: "Claims", Icon: IconClipboard },
  { to: "/subcontractors", label: "Subcontractors", Icon: IconUsers },
  { to: "/patterns", label: "Plan patterns", Icon: IconGrid },
];

function Shell({ user }: { user: SessionUser }) {
  const navigate = useNavigate();

  // The critical-alert count rides on the Exposure nav item so it's visible
  // from every page — this is the number the coordinator is employed to drive
  // to zero. It reuses the cached exposure query, so it costs no extra fetch.
  const { data: exposure } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
  });
  const criticalCount = exposure?.summary.criticalAlerts ?? 0;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          Warranted
        </div>

        <div className="nav-group">
          <div className="nav-label">Portfolio</div>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
              <Icon size={16} />
              {label}
              {to === "/exposure" && criticalCount > 0 && (
                <span className="nav-count critical">{criticalCount}</span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar" aria-hidden>
              {initials(user.fullName)}
            </span>
            <span className="user-chip-text">
              <span className="user-chip-name">{user.fullName}</span>
              <span className="user-chip-role">
                {user.role.replace(/_/g, " ")}
              </span>
            </span>
          </div>

          <div className="row" style={{ gap: "var(--space-1)" }}>
            <ThemeToggle />
            <button
              type="button"
              className="btn ghost sm"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => {
                setToken(null);
                navigate("/login");
                window.location.reload();
              }}
            >
              <IconSignOut size={15} />
            </button>
          </div>
        </div>
      </nav>

      <main className="main" id="main">
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
