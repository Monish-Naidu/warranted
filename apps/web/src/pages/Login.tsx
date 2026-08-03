import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("coordinator@sandovalhomes.example");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      navigate("/exposure");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="hint-row" style={{ marginBottom: "var(--space-5)" }}>
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark" aria-hidden />
            Warranted
          </div>
          <ThemeToggle />
        </div>

        <h1 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>
          Builder portal
        </h1>
        <p className="muted" style={{ marginBottom: "var(--space-5)" }}>
          Warranty coverage, subcontractor exposure, and scheduling for your
          communities.
        </p>

        {error && (
          <div className="error-note" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="hint">
          <div style={{ marginBottom: "var(--space-1)" }}>
            Demo accounts (run <span className="mono">pnpm db:seed</span>):
          </div>
          <div className="mono">coordinator@sandovalhomes.example</div>
          <div className="mono">admin@sandovalhomes.example</div>
          <div style={{ marginTop: "var(--space-1)" }}>
            Password: <span className="mono">warranted-demo-2026</span>
          </div>
        </div>
      </form>
    </div>
  );
}
