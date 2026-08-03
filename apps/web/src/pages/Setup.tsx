/**
 * Setup: the way a builder's own data gets into the product.
 *
 * Ordered as onboarding actually happens, because each step depends on the one
 * before it. A home needs a community, an assignment needs a home and a
 * subcontractor. The page makes that order visible rather than presenting five
 * equal forms and letting the user discover the dependency by hitting an
 * error.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRADES, WARRANTY_START_SOURCES } from "@warranted/shared";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const START_SOURCE_LABELS: Record<string, string> = {
  closing_date: "Closing date",
  certificate_of_occupancy: "Certificate of occupancy",
  possession_date: "Possession date",
  first_occupancy: "First occupancy",
  manual_override: "Manual override",
};

export function SetupPage() {
  return (
    <>
      <div className="page-head">
        <h1>Setup</h1>
        <p>
          Communities, plans, subcontractors, and homes. Each step depends on
          the one above it.
        </p>
      </div>

      <Readiness />

      <div className="stack" style={{ gap: "var(--space-4)" }}>
        <Step n={1} title="Communities" hint="Where you build.">
          <CommunityForm />
        </Step>

        <Step
          n={2}
          title="Plans"
          hint="Record the elevation separately. Two elevations of one plan can fail in different places, and pattern detection reads this."
        >
          <PlanForm />
        </Step>

        <Step
          n={3}
          title="Subcontractors"
          hint="The warranty term is theirs, from their contract. It starts at their completion, not at closing."
        >
          <SubcontractorForm />
        </Step>

        <Step
          n={4}
          title="Homes"
          hint="Warranty tiers and the milestone schedule are created automatically from the start date."
        >
          <HomeForm />
        </Step>

        <Step
          n={5}
          title="Trade assignments"
          hint="Who did what, and when they finished. The completion date is what makes a trade backchargeable."
        >
          <AssignmentForm />
        </Step>
      </div>
    </>
  );
}

/**
 * What is configured and what is not.
 *
 * The gap this closes: a builder who has just signed up opens the exposure
 * board, sees nothing, and cannot tell whether the product is broken or simply
 * empty. Blocking gaps are marked as such, because "no communities" stops
 * everything downstream while "no warranty document" only makes every
 * determination uncitable, which needs saying differently.
 */
function Readiness() {
  const { data } = useQuery({ queryKey: ["readiness"], queryFn: api.readiness });
  if (!data) return null;

  const pct = Math.round((data.complete / data.total) * 100);
  const allDone = data.complete === data.total;

  return (
    <section className="card card-pad-lg readiness">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="cell-strong">
            {allDone
              ? "Everything is configured"
              : `${data.complete} of ${data.total} configured`}
          </div>
          <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {data.blockedOn.length > 0
              ? "The red items stop everything downstream from working."
              : allDone
                ? "Nothing is missing."
                : "Nothing is blocked. The remaining items affect quality, not function."}
          </div>
        </div>
        <span className={`badge ${allDone ? "ok" : data.blockedOn.length > 0 ? "critical" : "warning"}`}>
          {pct}%
        </span>
      </div>

      <div className="readiness-bar">
        <div className="readiness-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="readiness-steps">
        {data.steps.map((step) => {
          const blocking = step.blocking && !step.done;
          return (
            <Link
              key={step.key}
              to={step.href}
              className={`readiness-step ${step.done ? "is-done" : ""} ${
                blocking ? "is-blocking" : ""
              }`}
            >
              <span className="readiness-check" aria-hidden>
                {step.done ? "✓" : blocking ? "!" : ""}
              </span>
              <span>
                <span className="readiness-label">
                  {step.label}
                  {step.count > 0 && (
                    <span className="badge mono">{step.count}</span>
                  )}
                </span>
                {!step.done && <span className="readiness-why">{step.why}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="setup-step">
      <div className="setup-step-head">
        <span className="setup-step-n">{n}</span>
        <div>
          <h2 className="setup-step-title">{title}</h2>
          <p className="setup-step-hint">{hint}</p>
        </div>
      </div>
      <div className="setup-step-body">{children}</div>
    </section>
  );
}

/** Shared save/feedback wiring, so each form below is only its fields. */
function useCreate<TInput>(
  fn: (input: TInput) => Promise<unknown>,
  invalidate: string[][],
  onDone?: () => void,
) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setSaved("Saved");
      onDone?.();
      setTimeout(() => setSaved(null), 2500);
    },
  });

  return { mutation, saved };
}

function Feedback({
  saved,
  error,
}: {
  saved: string | null;
  error: unknown;
}) {
  if (error) {
    return (
      <div className="error-note" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
        {error instanceof Error ? error.message : "Could not save."}
      </div>
    );
  }
  if (saved) {
    return (
      <span className="badge ok" style={{ marginLeft: "var(--space-2)" }}>
        {saved}
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------- community

function CommunityForm() {
  const [form, setForm] = useState({ name: "", city: "", state: "", postalCode: "" });
  const { mutation, saved } = useCreate(api.createCommunity, [["communities"], ["readiness"]], () =>
    setForm({ name: "", city: "", state: "", postalCode: "" }),
  );

  const { data } = useQuery({ queryKey: ["communities"], queryFn: api.communities });

  return (
    <>
      <ExistingChips items={(data?.communities ?? []).map((c) => c.name)} />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            name: form.name,
            city: form.city,
            state: form.state.toUpperCase(),
            postalCode: form.postalCode || null,
          });
        }}
      >
        <Field label="Name" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="City" required>
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
        </Field>
        <Field label="State" required>
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            maxLength={2}
            placeholder="TX"
            required
          />
        </Field>
        <Field label="ZIP">
          <input
            value={form.postalCode}
            onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
          />
        </Field>
        <SubmitRow busy={mutation.isPending} saved={saved} error={mutation.error} />
      </form>
    </>
  );
}

// --------------------------------------------------------------------- plan

function PlanForm() {
  const [form, setForm] = useState({ name: "", elevation: "", squareFeet: "" });
  const { mutation, saved } = useCreate(api.createPlan, [["plans"], ["readiness"]], () =>
    setForm({ name: "", elevation: "", squareFeet: "" }),
  );

  const { data } = useQuery({ queryKey: ["plans"], queryFn: api.plans });

  return (
    <>
      <ExistingChips
        items={(data?.plans ?? []).map((p) =>
          p.elevation ? `${p.name} ${p.elevation}` : p.name,
        )}
      />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            name: form.name,
            elevation: form.elevation || null,
            squareFeet: form.squareFeet ? Number(form.squareFeet) : null,
          });
        }}
      >
        <Field label="Plan name" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="Elevation">
          <input
            value={form.elevation}
            onChange={(e) => setForm({ ...form, elevation: e.target.value })}
            placeholder="B"
          />
        </Field>
        <Field label="Square feet">
          <input
            type="number"
            value={form.squareFeet}
            onChange={(e) => setForm({ ...form, squareFeet: e.target.value })}
          />
        </Field>
        <SubmitRow busy={mutation.isPending} saved={saved} error={mutation.error} />
      </form>
    </>
  );
}

// ----------------------------------------------------------- subcontractor

function SubcontractorForm() {
  const empty = {
    companyName: "",
    primaryTrade: "drywall",
    contactName: "",
    email: "",
    phone: "",
    insuranceExpiresOn: "",
    defaultWarrantyMonths: "12",
  };
  const [form, setForm] = useState(empty);
  const { mutation, saved } = useCreate(
    api.createSubcontractor,
    [["scorecard"], ["subcontractorList"], ["readiness"]],
    () => setForm(empty),
  );

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({
          companyName: form.companyName,
          primaryTrade: form.primaryTrade as never,
          contactName: form.contactName || null,
          email: form.email || null,
          phone: form.phone || null,
          insuranceExpiresOn: form.insuranceExpiresOn || null,
          defaultWarrantyMonths: Number(form.defaultWarrantyMonths),
          active: true,
        });
      }}
    >
      <Field label="Company" required>
        <input
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          required
        />
      </Field>
      <Field label="Trade" required>
        <select
          value={form.primaryTrade}
          onChange={(e) => setForm({ ...form, primaryTrade: e.target.value })}
        >
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Contact">
        <input
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Phone">
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </Field>
      <Field
        label="Insurance expires"
        hint="A lapsed certificate turns a backcharge into a write-off."
      >
        <input
          type="date"
          value={form.insuranceExpiresOn}
          onChange={(e) => setForm({ ...form, insuranceExpiresOn: e.target.value })}
        />
      </Field>
      <Field label="Warranty term (months)" required>
        <input
          type="number"
          min={0}
          max={240}
          value={form.defaultWarrantyMonths}
          onChange={(e) =>
            setForm({ ...form, defaultWarrantyMonths: e.target.value })
          }
          required
        />
      </Field>
      <SubmitRow busy={mutation.isPending} saved={saved} error={mutation.error} />
    </form>
  );
}

// --------------------------------------------------------------------- home

function HomeForm() {
  const { data: communities } = useQuery({
    queryKey: ["communities"],
    queryFn: api.communities,
  });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: api.plans });

  const empty = {
    communityId: "",
    planId: "",
    lotNumber: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    closingDate: "",
    certificateOfOccupancyDate: "",
    possessionDate: "",
    warrantyStartDate: "",
    warrantyStartSource: "closing_date",
    warrantyStartNote: "",
  };
  const [form, setForm] = useState(empty);
  const { mutation, saved } = useCreate(
    api.createHome,
    [["exposure"], ["homes"], ["readiness"]],
    () => setForm(empty),
  );

  const hasCommunity = (communities?.communities.length ?? 0) > 0;

  if (!hasCommunity) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Add a community first. A home has to belong to one.
      </p>
    );
  }

  /*
   * Offering to copy the chosen source's date is the whole reason the three
   * candidate dates sit next to the start date here. It stays a copy rather
   * than a derivation: the coordinator can still enter something else, and
   * whatever they pick is recorded as their choice.
   */
  const candidate =
    form.warrantyStartSource === "closing_date"
      ? form.closingDate
      : form.warrantyStartSource === "certificate_of_occupancy"
        ? form.certificateOfOccupancyDate
        : form.warrantyStartSource === "possession_date"
          ? form.possessionDate
          : "";

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({
          communityId: form.communityId,
          planId: form.planId || null,
          lotNumber: form.lotNumber,
          addressLine1: form.addressLine1,
          addressLine2: null,
          city: form.city,
          state: form.state.toUpperCase(),
          postalCode: form.postalCode,
          latitude: null,
          longitude: null,
          closingDate: form.closingDate || null,
          certificateOfOccupancyDate: form.certificateOfOccupancyDate || null,
          possessionDate: form.possessionDate || null,
          warrantyStartDate: form.warrantyStartDate,
          warrantyStartSource: form.warrantyStartSource as never,
          warrantyStartNote: form.warrantyStartNote || null,
        });
      }}
    >
      <Field label="Community" required>
        <select
          value={form.communityId}
          onChange={(e) => setForm({ ...form, communityId: e.target.value })}
          required
        >
          <option value="">Choose…</option>
          {communities?.communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Plan">
        <select
          value={form.planId}
          onChange={(e) => setForm({ ...form, planId: e.target.value })}
        >
          <option value="">None</option>
          {plans?.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.elevation ? `${p.name} ${p.elevation}` : p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lot number" required>
        <input
          value={form.lotNumber}
          onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
          required
        />
      </Field>
      <Field label="Address" required>
        <input
          value={form.addressLine1}
          onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
          required
        />
      </Field>
      <Field label="City" required>
        <input
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          required
        />
      </Field>
      <Field label="State" required>
        <input
          value={form.state}
          onChange={(e) => setForm({ ...form, state: e.target.value })}
          maxLength={2}
          required
        />
      </Field>
      <Field label="ZIP" required>
        <input
          value={form.postalCode}
          onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
          required
        />
      </Field>

      <div className="form-divider">
        <span>The three dates, and which one governs</span>
      </div>

      <Field label="Closing">
        <input
          type="date"
          value={form.closingDate}
          onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
        />
      </Field>
      <Field label="Certificate of occupancy">
        <input
          type="date"
          value={form.certificateOfOccupancyDate}
          onChange={(e) =>
            setForm({ ...form, certificateOfOccupancyDate: e.target.value })
          }
        />
      </Field>
      <Field label="Possession">
        <input
          type="date"
          value={form.possessionDate}
          onChange={(e) => setForm({ ...form, possessionDate: e.target.value })}
        />
      </Field>

      <Field
        label="Warranty starts from"
        required
        hint="Recorded, never inferred. This is the most disputed field in the domain."
      >
        <select
          value={form.warrantyStartSource}
          onChange={(e) =>
            setForm({ ...form, warrantyStartSource: e.target.value })
          }
          required
        >
          {WARRANTY_START_SOURCES.map((s) => (
            <option key={s} value={s}>
              {START_SOURCE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Warranty start date" required>
        <input
          type="date"
          value={form.warrantyStartDate}
          onChange={(e) => setForm({ ...form, warrantyStartDate: e.target.value })}
          required
        />
        {candidate && candidate !== form.warrantyStartDate && (
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: "var(--space-1)" }}
            onClick={() => setForm({ ...form, warrantyStartDate: candidate })}
          >
            Use {candidate}
          </button>
        )}
      </Field>

      <Field label="Note" full>
        <input
          value={form.warrantyStartNote}
          onChange={(e) => setForm({ ...form, warrantyStartNote: e.target.value })}
          placeholder="Why this date governs, if it is not obvious"
        />
      </Field>

      <SubmitRow busy={mutation.isPending} saved={saved} error={mutation.error} />
    </form>
  );
}

// --------------------------------------------------------------- assignment

function AssignmentForm() {
  const { data: homes } = useQuery({ queryKey: ["homes"], queryFn: api.homes });
  const { data: subs } = useQuery({
    queryKey: ["subcontractorList"],
    queryFn: api.subcontractorList,
  });

  const empty = {
    homeId: "",
    subcontractorId: "",
    trade: "drywall",
    completedAt: "",
    subWarrantyMonths: "12",
    contractReference: "",
    scopeDescription: "",
  };
  const [form, setForm] = useState(empty);
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.createAssignment(form.homeId, {
        subcontractorId: form.subcontractorId,
        trade: form.trade as never,
        scopeDescription: form.scopeDescription || null,
        completedAt: form.completedAt || null,
        subWarrantyStart: null,
        subWarrantyMonths: Number(form.subWarrantyMonths),
        contractReference: form.contractReference || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exposure"] });
      queryClient.invalidateQueries({ queryKey: ["scorecard"] });
      queryClient.invalidateQueries({ queryKey: ["readiness"] });
      setForm(empty);
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2500);
    },
  });

  if ((homes?.homes.length ?? 0) === 0 || (subs?.subcontractors.length ?? 0) === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Add at least one home and one subcontractor first.
      </p>
    );
  }

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Home" required>
        <select
          value={form.homeId}
          onChange={(e) => setForm({ ...form, homeId: e.target.value })}
          required
        >
          <option value="">Choose…</option>
          {homes?.homes.map((home) => (
            <option key={home.id} value={home.id}>
              Lot {home.lotNumber} · {home.community.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Subcontractor" required>
        <select
          value={form.subcontractorId}
          onChange={(e) => {
            const sub = subs?.subcontractors.find((s) => s.id === e.target.value);
            setForm({
              ...form,
              subcontractorId: e.target.value,
              // Their contract's term is the sensible default, and their
              // primary trade is usually the one being assigned.
              trade: sub?.primaryTrade ?? form.trade,
              subWarrantyMonths: String(sub?.defaultWarrantyMonths ?? 12),
            });
          }}
          required
        >
          <option value="">Choose…</option>
          {subs?.subcontractors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.companyName}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Trade" required>
        <select
          value={form.trade}
          onChange={(e) => setForm({ ...form, trade: e.target.value })}
        >
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Completed on"
        hint="Their warranty runs from this date. Without it the trade cannot be backcharged at all."
      >
        <input
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          value={form.completedAt}
          onChange={(e) => setForm({ ...form, completedAt: e.target.value })}
        />
      </Field>

      <Field label="Their warranty (months)" required>
        <input
          type="number"
          min={0}
          max={240}
          value={form.subWarrantyMonths}
          onChange={(e) => setForm({ ...form, subWarrantyMonths: e.target.value })}
          required
        />
      </Field>

      <Field label="PO reference">
        <input
          value={form.contractReference}
          onChange={(e) => setForm({ ...form, contractReference: e.target.value })}
          placeholder="PO-2026-0142"
        />
      </Field>

      <Field label="Scope" full>
        <input
          value={form.scopeDescription}
          onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })}
        />
      </Field>

      {!form.completedAt && (
        <div className="form-full">
          <div className="field-hint" style={{ color: "var(--warning)" }}>
            Without a completion date this trade will show on Missing dates as
            unrecoverable. Save it now if you have it.
          </div>
        </div>
      )}

      <SubmitRow busy={mutation.isPending} saved={saved} error={mutation.error} />
    </form>
  );
}

// ------------------------------------------------------------------ pieces

function Field({
  label,
  children,
  hint,
  required,
  full,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`field ${full ? "form-full" : ""}`}>
      <label>
        {label}
        {required && <span className="req"> *</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function SubmitRow({
  busy,
  saved,
  error,
}: {
  busy: boolean;
  saved: string | null;
  error: unknown;
}) {
  return (
    <div className="form-full">
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <Feedback saved={saved} error={null} />
      </div>
      <Feedback saved={null} error={error} />
    </div>
  );
}

function ExistingChips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="row" style={{ marginBottom: "var(--space-3)" }}>
      <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
        Existing:
      </span>
      {items.map((item) => (
        <span key={item} className="badge">
          {item}
        </span>
      ))}
    </div>
  );
}
