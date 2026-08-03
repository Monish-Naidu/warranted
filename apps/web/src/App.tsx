import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@warranted/shared";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, getToken, setToken } from "./api";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import {
  IconAlert,
  IconCalendar,
  IconClipboard,
  IconDocument,
  IconGauge,
  IconGrid,
  IconRuler,
  IconSearch,
  IconSettings,
  IconSignOut,
  IconUsers,
} from "./components/Icon";
import { PageSkeleton } from "./components/States";
import { ThemeToggle } from "./components/ThemeToggle";
import { ClaimDetailPage } from "./pages/ClaimDetail";
import { ClaimsPage } from "./pages/Claims";
import { ExposurePage } from "./pages/Exposure";
import { GapsPage } from "./pages/Gaps";
import { LoginPage } from "./pages/Login";
import { PatternsPage } from "./pages/Patterns";
import { SchedulePage } from "./pages/Schedule";
import { SetupPage } from "./pages/Setup";
import { TolerancesPage } from "./pages/Tolerances";
import { WarrantyDocPage } from "./pages/WarrantyDoc";
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
  { to: "/gaps", label: "Missing dates", Icon: IconAlert },
  { to: "/claims", label: "Claims", Icon: IconClipboard },
  { to: "/schedule", label: "Schedule", Icon: IconCalendar },
  { to: "/subcontractors", label: "Subcontractors", Icon: IconUsers },
  { to: "/patterns", label: "Plan patterns", Icon: IconGrid },
];

/** Setup is deliberately below the daily work, not above it. */
const SECONDARY_NAV = [
  { to: "/warranty", label: "Warranty document", Icon: IconDocument },
  { to: "/tolerances", label: "Performance standard", Icon: IconRuler },
  { to: "/setup", label: "Setup", Icon: IconSettings },
];

function Shell({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const palette = useCommandPalette();

  // The critical-alert count rides on the Exposure nav item so it's visible
  // from every page — this is the number the coordinator is employed to drive
  // to zero. It reuses the cached exposure query, so it costs no extra fetch.
  const { data: exposure } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
  });
  const criticalCount = exposure?.summary.criticalAlerts ?? 0;
  const undocumentedCount = exposure?.summary.undocumentedAssignments ?? 0;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="sidebar" aria-label="Primary">
        <NavLink to="/exposure" className="brand" aria-label="Warranted, go to Exposure">
          <span className="brand-mark" aria-hidden />
          Warranted
        </NavLink>

        <button
          type="button"
          className="palette-trigger"
          onClick={() => palette.setOpen(true)}
        >
          <IconSearch size={15} />
          Search
          <kbd>{isApple() ? "⌘K" : "Ctrl K"}</kbd>
        </button>

        <div className="nav-group">
          <div className="nav-label">Portfolio</div>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
              <Icon size={16} />
              {label}
              {to === "/exposure" && criticalCount > 0 && (
                <span className="nav-count critical">{criticalCount}</span>
              )}
              {to === "/gaps" && undocumentedCount > 0 && (
                <span className="nav-count critical">{undocumentedCount}</span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="nav-group">
          <div className="nav-label">Configure</div>
          {SECONDARY_NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
              <Icon size={16} />
              {label}
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
        {/*
          Keyed on pathname so the enter animation replays on navigation and
          not on every state change within a page — a bar chart that re-drew
          itself each time a mutation settled would be unreadable.
        */}
        <div className="page-enter" key={location.pathname}>
          <Routes>
            <Route path="/exposure" element={<ExposurePage />} />
            <Route path="/gaps" element={<GapsPage />} />
            <Route path="/claims" element={<ClaimsPage />} />
            <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/warranty" element={<WarrantyDocPage />} />
            <Route path="/tolerances" element={<TolerancesPage />} />
            <Route path="/subcontractors" element={<ScorecardPage />} />
            <Route path="/patterns" element={<PatternsPage />} />
            <Route path="*" element={<Navigate to="/exposure" replace />} />
          </Routes>
        </div>
      </main>

      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
      />
    </div>
  );
}

/** Only decides which modifier to print in the shortcut hint. */
function isApple(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
