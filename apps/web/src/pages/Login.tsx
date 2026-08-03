import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

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
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <span className="brand-mark" aria-hidden />
          Warranted
        </div>

        <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
          Builder portal — warranty coverage, subcontractor exposure, and
          scheduling for your communities.
        </p>

        {error && <div className="error-note">{error}</div>}

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

        <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="hint">
          Demo accounts (run <span className="mono">pnpm db:seed</span>):
          <br />
          <span className="mono">coordinator@sandovalhomes.example</span>
          <br />
          <span className="mono">admin@sandovalhomes.example</span>
          <br />
          Password: <span className="mono">warranted-demo-2026</span>
        </div>
      </form>
    </div>
  );
}
