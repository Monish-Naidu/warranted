/**
 * The undocumented-trade worklist.
 *
 * A sub assignment with no completion date is not a cosmetic data gap. The
 * subcontractor's warranty window runs from *their* completion, so without
 * that date there is no provable window, and every dollar of warranty work on
 * that trade is unrecoverable no matter how quickly the claim was filed. It is
 * the bus-factor failure in one column, and the exposure board reports it as a
 * critical alert.
 *
 * Reporting it was never the hard part. This page is the other half: every
 * missing date in one list, with the field to fix it right there.
 *
 * It needs no endpoint of its own. The exposure query already carries an
 * `assignmentId` and an `unknown` flag for exactly these rows, and the PATCH
 * route to backfill the date already exists, so this reads the cache the
 * exposure board already filled.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Lot } from "../api";
import { IconCheck } from "../components/Icon";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

type Gap = {
  assignmentId: string;
  trade: string;
  subcontractorName: string;
  exposureDays: number;
  builderCoverageEnd: string;
  lotNumber: string;
  address: string;
  community: string;
  warrantyStartDate: string;
};

/** Every trade on every lot that has no completion date on record. */
function collectGaps(lots: Lot[]): Gap[] {
  return lots
    .flatMap((lot) =>
      lot.exposure
        .filter((w) => w.unknown)
        .map((w) => ({
          assignmentId: w.assignmentId,
          trade: w.trade,
          subcontractorName: w.subcontractorName,
          exposureDays: w.exposureDays,
          builderCoverageEnd: w.builderCoverageEnd,
          lotNumber: lot.lotNumber,
          address: lot.address,
          community: lot.community,
          warrantyStartDate: lot.warrantyStartDate,
        })),
    )
    // Biggest unrecoverable window first: that is the most money at stake.
    .sort((a, b) => b.exposureDays - a.exposureDays);
}

export function GapsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
  });

  const gaps = data ? collectGaps(data.lots) : [];

  return (
    <>
      <div className="page-head">
        <h1>Missing completion dates</h1>
        <p>
          A subcontractor's warranty runs from the day they finished. Without
          that date there is no window to charge against, so warranty work on
          the trade is unrecoverable however fast the claim arrives. Each one
          below is fixable here.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton rows={4} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load assignments"
          error={error}
          onRetry={() => refetch()}
        />
      ) : gaps.length === 0 ? (
        <EmptyState
          title="Every trade is documented"
          tone="ok"
          icon={<IconCheck size={20} />}
        >
          Every subcontractor assignment on every lot has a completion date, so
          every trade has a provable warranty window.
        </EmptyState>
      ) : (
        <>
          <div className="stat-row">
            <div
              className="stat is-critical"
              style={{ "--row": 0 } as React.CSSProperties}
            >
              <div className="stat-value">{gaps.length}</div>
              <div className="stat-label">
                Trades with no provable backcharge window
              </div>
            </div>
          </div>

          <div className="stack">
            {gaps.map((gap, i) => (
              <GapRow key={gap.assignmentId} gap={gap} row={i} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function GapRow({ gap, row }: { gap: Gap; row: number }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const save = useMutation({
    mutationFn: () => api.updateAssignment(gap.assignmentId, { completedAt: value }),
    onSuccess: () => {
      // The row leaves this list and the lot's bar redraws with a real
      // covered span, both off the same query.
      queryClient.invalidateQueries({ queryKey: ["exposure"] });
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  // A completion date after the builder's obligation ends, or in the future,
  // is a typo rather than a fact. Blocking it here keeps a bad date out of the
  // exposure maths, where it would silently produce a nonsense window.
  const tooLate = value !== "" && value > gap.builderCoverageEnd;
  const inFuture = value !== "" && value > today;
  const invalid = tooLate || inFuture;

  return (
    <div
      className="card gap-row"
      style={{ "--row": row } as React.CSSProperties}
    >
      <div className="gap-main">
        <div className="gap-head">
          <span className="cell-strong">Lot {gap.lotNumber}</span>
          <span className="badge critical">
            <span className="dot" aria-hidden />
            no completion date
          </span>
          <span className="badge cap">{gap.trade.replace(/_/g, " ")}</span>
        </div>
        <div className="gap-meta">
          {gap.subcontractorName} · {gap.address} · {gap.community}
        </div>
        <div className="gap-cost">
          The full <strong>{gap.exposureDays}-day</strong> builder window on
          this trade is unrecoverable, through {gap.builderCoverageEnd}.
        </div>
      </div>

      <form
        className="gap-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid && value) save.mutate();
        }}
      >
        <label htmlFor={`done-${gap.assignmentId}`}>Completed on</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            id={`done-${gap.assignmentId}`}
            type="date"
            value={value}
            max={today}
            onChange={(e) => setValue(e.target.value)}
            required
            aria-describedby={invalid ? `err-${gap.assignmentId}` : undefined}
          />
          <button
            type="submit"
            className="btn primary"
            disabled={!value || invalid || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>

        {invalid && (
          <div className="field-hint" id={`err-${gap.assignmentId}`} role="alert">
            {inFuture
              ? "A completion date can't be in the future."
              : `That's after your obligation ends (${gap.builderCoverageEnd}). Check the date.`}
          </div>
        )}

        {save.isError && (
          <div className="field-hint" style={{ color: "var(--critical)" }}>
            {(save.error as Error).message}
          </div>
        )}
      </form>
    </div>
  );
}
