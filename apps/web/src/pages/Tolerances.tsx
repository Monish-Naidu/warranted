/**
 * The performance standard: the second of the two documents triage is
 * grounded in.
 *
 * Without it, "there is a crack in my drywall" has no defensible answer. With
 * it, the answer is "hairline cracks under 1/8 inch are expected first-year
 * shrinkage, addressed once at the 11-month visit."
 *
 * The page leads with which table is actually in force, because the built-in
 * set is a placeholder standing in for the copyrighted NAHB guidelines. It is
 * fine to develop against and wrong to rely on commercially, and a portal that
 * presented it as the builder's own standard would be quietly misleading the
 * person who has to defend a denial with it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRADES } from "@warranted/shared";
import { useMemo, useState } from "react";
import { api, type ToleranceRow } from "../api";
import { ErrorState, PageSkeleton } from "../components/States";

export function TolerancesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tolerances"],
    queryFn: api.tolerances,
  });

  const importBuiltIn = useMutation({
    mutationFn: api.importBuiltInTolerances,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tolerances"] }),
  });

  const rows = data?.usingBuiltIn ? data.builtIn : (data?.tolerances ?? []);

  const byTrade = useMemo(() => {
    const map = new Map<string, ToleranceRow[]>();
    for (const row of rows) {
      const list = map.get(row.trade);
      if (list) list.push(row);
      else map.set(row.trade, [row]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <>
      <div className="page-head">
        <h1>Performance standard</h1>
        <p>
          The thresholds that decide whether a condition is a defect or is
          within acceptable tolerance. Triage cites these alongside your
          warranty document.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton rows={4} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load the standard"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {data.usingBuiltIn ? (
            <div className="alert warning" style={{ marginBottom: "var(--space-5)" }}>
              <div className="alert-bar" aria-hidden />
              <div className="alert-body">
                <div className="alert-meta">
                  <span className="badge warning">
                    <span className="dot" aria-hidden />
                    placeholder in use
                  </span>
                </div>
                <div className="alert-text">
                  You have not published your own standard, so triage is using a
                  built-in set of {data.builtInCount} widely-cited
                  approximations. They stand in for the NAHB Residential
                  Construction Performance Guidelines, which are copyrighted.
                  Before relying on any determination commercially, license the
                  NAHB guidelines, adopt your own published standard, or use an
                  applicable state standard.
                </div>
                <div className="row" style={{ marginTop: "var(--space-3)" }}>
                  <button
                    className="btn primary sm"
                    onClick={() => importBuiltIn.mutate()}
                    disabled={importBuiltIn.isPending}
                  >
                    {importBuiltIn.isPending
                      ? "Copying…"
                      : "Copy these in as a starting point"}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => setShowForm((v) => !v)}
                  >
                    Add my own
                  </button>
                </div>
                {importBuiltIn.isError && (
                  <div className="error-note" style={{ marginTop: "var(--space-3)" }}>
                    {(importBuiltIn.error as Error).message}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="stat-row">
              <div className="stat is-ok" style={{ "--row": 0 } as React.CSSProperties}>
                <div className="stat-value">{data.tolerances.length}</div>
                <div className="stat-label">Your own published thresholds</div>
              </div>
              <div
                className="stat"
                style={{ "--row": 1 } as React.CSSProperties}
              >
                <div className="stat-value">
                  {data.tolerances.filter((t) => t.isZeroTolerance).length}
                </div>
                <div className="stat-label">
                  Zero tolerance, no acceptable amount at any size
                </div>
              </div>
            </div>
          )}

          {!data.usingBuiltIn && (
            <div className="row" style={{ marginBottom: "var(--space-4)" }}>
              <button
                className="btn primary sm"
                onClick={() => setShowForm((v) => !v)}
              >
                {showForm ? "Cancel" : "Add a threshold"}
              </button>
            </div>
          )}

          {showForm && <ToleranceForm onDone={() => setShowForm(false)} />}

          <div className="stack" style={{ marginTop: "var(--space-4)" }}>
            {byTrade.map(([trade, list]) => (
              <section key={trade} className="card card-pad-lg">
                <h2 className="section-title" style={{ marginBottom: "var(--space-3)" }}>
                  {trade.replace(/_/g, " ")}
                </h2>
                <div className="clause-list">
                  {list.map((row) => (
                    <ToleranceRowCard
                      key={row.id ?? row.code}
                      row={row}
                      editable={!data.usingBuiltIn}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ToleranceRowCard({
  row,
  editable,
}: {
  row: ToleranceRow;
  editable: boolean;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deleteTolerance(row.id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tolerances"] }),
  });

  return (
    <div className={`clause ${row.isZeroTolerance ? "is-exclusion" : ""}`}>
      <div className="clause-head">
        <span className="mono faint">{row.code}</span>
        <span className="cell-strong">{row.condition}</span>
        {row.isZeroTolerance && (
          <span className="badge critical">
            <span className="dot" aria-hidden />
            zero tolerance
          </span>
        )}
        {row.measurementUnit && row.measurementMax !== null && (
          <span className="badge mono">
            &gt; {row.measurementMax} {row.measurementUnit}
            {row.measurementOver ? ` / ${row.measurementOver}` : ""}
          </span>
        )}
        {editable && row.id && (
          <button
            type="button"
            className="btn ghost sm danger"
            style={{ marginLeft: "auto" }}
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            Remove
          </button>
        )}
      </div>
      <p className="clause-body">
        <strong>Defect when {row.threshold}.</strong>
        {row.notes ? ` ${row.notes}` : ""}
      </p>
      {row.source && (
        <p className="clause-body faint" style={{ marginTop: "var(--space-1)" }}>
          Source: {row.source}
        </p>
      )}
    </div>
  );
}

function ToleranceForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const empty = {
    code: "",
    trade: "drywall",
    condition: "",
    threshold: "",
    measurementUnit: "",
    measurementMax: "",
    measurementOver: "",
    typicalWindowMonths: "12",
    isZeroTolerance: false,
    notes: "",
    source: "",
  };
  const [form, setForm] = useState(empty);

  const save = useMutation({
    mutationFn: () =>
      api.createTolerance({
        code: form.code,
        trade: form.trade as never,
        condition: form.condition,
        threshold: form.threshold,
        measurementUnit: (form.measurementUnit || null) as never,
        measurementMax: form.measurementMax ? Number(form.measurementMax) : null,
        measurementOver: form.measurementOver || null,
        typicalWindowMonths: Number(form.typicalWindowMonths),
        isZeroTolerance: form.isZeroTolerance,
        notes: form.notes || null,
        source: form.source || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tolerances"] });
      setForm(empty);
      onDone();
    },
  });

  return (
    <div className="card card-pad-lg">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="field">
          <label>
            Code<span className="req"> *</span>
          </label>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="drywall.crack"
            required
          />
          <div className="field-hint">
            What a citation points at. Keep it stable once claims reference it.
          </div>
        </div>

        <div className="field">
          <label>
            Trade<span className="req"> *</span>
          </label>
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
        </div>

        <div className="field form-full">
          <label>
            Condition<span className="req"> *</span>
          </label>
          <input
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            placeholder="Cracks in drywall walls or ceilings"
            required
          />
          <div className="field-hint">
            Phrase it the way a homeowner would describe it.
          </div>
        </div>

        <div className="field form-full">
          <label>
            Threshold<span className="req"> *</span>
          </label>
          <input
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            placeholder='Wider than 1/8"'
            required
          />
        </div>

        <div className="field">
          <label>Measure in</label>
          <select
            value={form.measurementUnit}
            onChange={(e) => setForm({ ...form, measurementUnit: e.target.value })}
          >
            <option value="">Not dimensional</option>
            <option value="inch">inch</option>
            <option value="degree">degree</option>
            <option value="count">count</option>
            <option value="percent">percent</option>
          </select>
          <div className="field-hint">
            Leave blank when it needs human judgment rather than a number.
          </div>
        </div>

        <div className="field">
          <label>Defect above</label>
          <input
            type="number"
            step="any"
            min={0}
            value={form.measurementMax}
            onChange={(e) => setForm({ ...form, measurementMax: e.target.value })}
            placeholder="0.125"
          />
        </div>

        <div className="field">
          <label>Measured over</label>
          <input
            value={form.measurementOver}
            onChange={(e) => setForm({ ...form, measurementOver: e.target.value })}
            placeholder="32 inches"
          />
        </div>

        <div className="field">
          <label>Typical window (months)</label>
          <input
            type="number"
            min={0}
            max={240}
            value={form.typicalWindowMonths}
            onChange={(e) =>
              setForm({ ...form, typicalWindowMonths: e.target.value })
            }
          />
        </div>

        <div className="field form-full">
          <label className="claim-pick" style={{ background: "transparent", border: "none", padding: 0 }}>
            <input
              type="checkbox"
              checked={form.isZeroTolerance}
              onChange={(e) =>
                setForm({ ...form, isZeroTolerance: e.target.checked })
              }
            />
            Zero tolerance: no acceptable amount, at any size
          </label>
          <div className="field-hint">
            For life-safety and water intrusion. Overrides any measurement.
          </div>
        </div>

        <div className="field form-full">
          <label>Notes</label>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Standard practice is a single repair at the 11-month visit."
          />
        </div>

        <div className="field form-full">
          <label>Source</label>
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Sandoval Homes Performance Standard, 2026 rev. B, p. 4"
          />
          <div className="field-hint">
            When a homeowner challenges a threshold, this is the answer.
          </div>
        </div>

        <div className="form-full row">
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save threshold"}
          </button>
          <button type="button" className="btn ghost" onClick={onDone}>
            Cancel
          </button>
        </div>

        {save.isError && (
          <div className="form-full error-note" style={{ marginBottom: 0 }}>
            {(save.error as Error).message}
          </div>
        )}
      </form>
    </div>
  );
}
