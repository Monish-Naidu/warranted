import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DETERMINATION_OUTCOMES, type DeterminationOutcome } from "@warranted/shared";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AiAssessmentRow } from "../api";
import { IconArrowLeft } from "../components/Icon";
import { ErrorState, PageSkeleton } from "../components/States";

const OUTCOME_LABELS: Record<DeterminationOutcome, string> = {
  covered: "Covered — we do the work",
  not_covered_excluded: "Not covered — excluded by the warranty",
  not_covered_expired: "Not covered — coverage expired",
  not_covered_tolerance: "Not covered — within tolerance",
  homeowner_maintenance: "Homeowner maintenance",
  manufacturer_warranty: "Manufacturer warranty",
  insurance_claim: "Insurance claim",
  goodwill: "Goodwill — not covered, doing it anyway",
};

const STATUS_CLASS: Record<string, string> = {
  submitted: "info",
  triaged: "accent",
  approved: "ok",
  scheduled: "ok",
  denied: "critical",
};

export function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => api.claim(claimId!),
    enabled: Boolean(claimId),
  });

  const triage = useMutation({
    mutationFn: () => api.triage(claimId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["claim", claimId] }),
  });

  if (isLoading) return <PageSkeleton rows={4} />;
  if (isError || !data) {
    return (
      <ErrorState
        title="Couldn't load that claim"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  const { claim, photos, events, assessments, determinations, backcharges } = data;
  const latest = assessments[0] ?? null;
  const decided = determinations.length > 0;

  return (
    <>
      <div className="page-head">
        <Link to="/claims" className="breadcrumb">
          <IconArrowLeft size={14} />
          Claims
        </Link>
        <h1>{claim.title}</h1>
        <div
          className="row"
          style={{ marginTop: "var(--space-2)", gap: "var(--space-2)" }}
        >
          <span className="badge mono">{claim.reference}</span>
          <span className={`badge ${STATUS_CLASS[claim.status] ?? ""}`}>
            {claim.status.replace(/_/g, " ")}
          </span>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {claim.room ? `${claim.room} · ` : ""}filed {claim.reportedOn}
          </span>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">What the homeowner reported</h2>
        <div className="card card-pad-lg" style={{ whiteSpace: "pre-wrap" }}>
          {claim.description}
        </div>
      </section>

      {photos.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Photos</h2>
            <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
              {photos.length} on file
            </span>
          </div>
          <div className="photo-grid">
            {photos.map((photo) => (
              <figure key={photo.id} style={{ margin: 0 }}>
                <img src={photo.fileUrl} alt="" loading="lazy" />
                <figcaption className="photo-meta">
                  {photo.exifTakenAt
                    ? `Taken ${new Date(photo.exifTakenAt).toLocaleString()}`
                    : "No EXIF timestamp"}
                  {/* Geo verification kills the "that photo isn't of this house"
                      dispute before it starts. A null geotag is "not
                      checkable" and is deliberately not shown as a failure. */}
                  {photo.geoVerified === true && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--ok)" }}>location verified</span>
                    </>
                  )}
                  {photo.geoVerified === false && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--critical)" }}>
                        {photo.distanceFromHomeMeters
                          ? `${Math.round(photo.distanceFromHomeMeters)}m from the lot`
                          : "location mismatch"}
                      </span>
                    </>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Triage</h2>
        {latest ? (
          <AssessmentCard assessment={latest} />
        ) : (
          <div className="card card-pad-lg">
            <p className="muted">
              This claim hasn't been triaged yet. Triage reads the photos
              against your warranty document and the performance tolerance
              table, then proposes a determination with citations.
            </p>
            <button
              className="btn primary"
              onClick={() => triage.mutate()}
              disabled={triage.isPending}
            >
              {triage.isPending ? "Analyzing…" : "Run triage"}
            </button>
            {triage.isError && (
              <div
                className="error-note"
                style={{ marginTop: "var(--space-3)", marginBottom: 0 }}
              >
                {(triage.error as Error).message}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Determination</h2>
        {decided ? (
          <div className="card card-pad-lg stack">
            {determinations.map((d) => (
              <div key={d.id}>
                <span className="badge ok" style={{ marginBottom: "var(--space-2)" }}>
                  {OUTCOME_LABELS[d.outcome as DeterminationOutcome] ?? d.outcome}
                </span>
                <p style={{ marginTop: "var(--space-2)" }}>{d.reason}</p>
                <div className="faint" style={{ fontSize: "var(--text-xs)" }}>
                  {new Date(d.createdAt).toLocaleString()}
                  {d.agreedWithAi === true && " · agreed with triage"}
                  {d.agreedWithAi === false && " · overrode triage"}
                </div>
              </div>
            ))}

            {backcharges.map((b) => (
              <div
                key={b.id}
                className="card"
                style={{ background: "var(--surface-inset)", boxShadow: "none" }}
              >
                <span
                  className={`badge ${
                    b.status === "recoverable"
                      ? "ok"
                      : b.status === "expired" || b.status === "no_sub_assigned"
                        ? "critical"
                        : ""
                  }`}
                >
                  backcharge: {b.status.replace(/_/g, " ")}
                </span>
                <p style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
                  {b.rationale}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <DeterminationForm claimId={claim.id} assessment={latest} />
        )}
      </section>

      <section className="section">
        <h2 className="section-title">History</h2>
        <div className="card card-pad-lg">
          <div className="timeline">
            {events.map((event) => (
              <div key={event.id} className="timeline-item">
                <span className="badge">{event.kind.replace(/_/g, " ")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {event.note && <div>{event.note}</div>}
                  <div className="faint" style={{ fontSize: "var(--text-xs)" }}>
                    {new Date(event.createdAt).toLocaleString()}
                    {event.toStatus && ` · → ${event.toStatus.replace(/_/g, " ")}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function AssessmentCard({ assessment: a }: { assessment: AiAssessmentRow }) {
  return (
    <div className="ai-card">
      <div className="ai-head">
        <span className="badge info">Triage proposal</span>
        {a.isEmergency && (
          <span className="badge critical">
            <span className="dot" aria-hidden />
            emergency
          </span>
        )}
        <span className="badge cap">{a.trade.replace(/_/g, " ")}</span>
        <span className="badge">{a.tier}</span>
        <span className="badge">{a.severity}</span>
        <span className="badge mono">{Math.round(a.confidence * 100)}% confidence</span>
        {a.needsHumanReview && (
          <span className="badge warning">needs a closer look</span>
        )}
        <span
          className="faint"
          style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}
        >
          {a.model}
        </span>
      </div>

      <div className="ai-body">
        <p className="ai-lede">{a.summary}</p>

        <div className="ai-block">
          <h3 className="ai-block-title">Observed</h3>
          <p className="muted">{a.observedCondition}</p>
        </div>

        {a.toleranceCheck?.applies && (
          <div className="ai-block">
            <h3 className="ai-block-title">Tolerance check</h3>
            <div className="muted">
              {a.toleranceCheck.standard} — defect when {a.toleranceCheck.threshold}.
              {a.toleranceCheck.estimatedMeasurement
                ? ` Estimated: ${a.toleranceCheck.estimatedMeasurement}.`
                : " No scale reference in the photos, so no measurement was estimated."}{" "}
              {a.toleranceCheck.withinTolerance === true && (
                <strong style={{ color: "var(--ok)" }}>
                  Within tolerance — not a defect.
                </strong>
              )}
              {a.toleranceCheck.withinTolerance === false && (
                <strong style={{ color: "var(--critical)" }}>
                  Exceeds tolerance.
                </strong>
              )}
            </div>
          </div>
        )}

        {a.citations.length > 0 && (
          <div className="ai-block">
            <h3 className="ai-block-title">Cited</h3>
            {a.citations.map((citation, i) => (
              <div className="citation" key={i}>
                <div className="citation-source">
                  {citation.source.replace(/_/g, " ")} · {citation.reference}
                </div>
                <q>{citation.quote}</q>
              </div>
            ))}
          </div>
        )}

        {a.possibleDuplicateOfClaimIds.length > 0 && (
          <div className="alert warning" style={{ marginBottom: "var(--space-5)" }}>
            <div className="alert-bar" aria-hidden />
            <div className="alert-body alert-text">
              Possibly a repeat of {a.possibleDuplicateOfClaimIds.length} earlier
              claim(s) on this home. A repeat visit for unresolved work is
              charged differently than a new claim.
            </div>
          </div>
        )}

        <div className="ai-block">
          <h3 className="ai-block-title">Recommends</h3>
          <span className="badge accent">
            {OUTCOME_LABELS[a.proposedOutcome as DeterminationOutcome] ??
              a.proposedOutcome}
          </span>
          <p style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
            {a.recommendedNextStep}
          </p>
        </div>
      </div>
    </div>
  );
}

function DeterminationForm({
  claimId,
  assessment,
}: {
  claimId: string;
  assessment: AiAssessmentRow | null;
}) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<DeterminationOutcome>(
    (assessment?.proposedOutcome as DeterminationOutcome) ?? "covered",
  );
  const [reason, setReason] = useState(assessment?.summary ?? "");
  const [cost, setCost] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.determine(claimId, {
        outcome,
        reason,
        tier: (assessment?.tier as "workmanship" | null) ?? null,
        trade: (assessment?.trade as never) ?? null,
        aiAssessmentId: assessment?.id ?? null,
        // Recording agreement vs override is what turns coordinator decisions
        // into labeled data for evaluating triage quality.
        agreedWithAi: assessment ? outcome === assessment.proposedOutcome : null,
        responsibleSubcontractorId: null,
        estimatedCostCents: cost ? Math.round(Number(cost) * 100) : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["claim", claimId] }),
  });

  const overriding =
    assessment !== null && outcome !== assessment.proposedOutcome;

  return (
    <div className="card card-pad-lg">
      {assessment && (
        <p className="muted">
          Triage proposed{" "}
          <strong>
            {OUTCOME_LABELS[assessment.proposedOutcome as DeterminationOutcome]}
          </strong>
          . Accept it or change it — either way your decision is what counts,
          and the difference is recorded.
        </p>
      )}

      <div className="field">
        <label htmlFor="outcome">Determination</label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as DeterminationOutcome)}
        >
          {DETERMINATION_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
        {overriding && (
          <div className="field-hint" style={{ color: "var(--warning)" }}>
            This overrides the triage proposal. The override is recorded against
            it.
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="reason">Reason</label>
        <textarea
          id="reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <div className="field-hint">
          This is what the homeowner and, if it ever comes to it, their attorney
          will read.
        </div>
      </div>

      <div className="field">
        <label htmlFor="cost">Estimated cost (USD, optional)</label>
        <input
          id="cost"
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          style={{ maxWidth: 200 }}
        />
      </div>

      <button
        className="btn primary"
        onClick={() => submit.mutate()}
        disabled={submit.isPending || reason.trim().length === 0}
      >
        {submit.isPending ? "Recording…" : "Record determination"}
      </button>

      {submit.isError && (
        <div
          className="error-note"
          style={{ marginTop: "var(--space-3)", marginBottom: 0 }}
        >
          {(submit.error as Error).message}
        </div>
      )}
    </div>
  );
}
