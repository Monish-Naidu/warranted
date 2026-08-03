import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DETERMINATION_OUTCOMES, type DeterminationOutcome } from "@warranted/shared";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AiAssessmentRow, type ClaimDetail } from "../api";

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

export function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => api.claim(claimId!),
    enabled: Boolean(claimId),
  });

  const triage = useMutation({
    mutationFn: () => api.triage(claimId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["claim", claimId] }),
  });

  if (isLoading) return <div className="empty">Loading claim…</div>;
  if (!data) return <div className="empty">Couldn't load that claim.</div>;

  const { claim, photos, events, assessments, determinations, backcharges } = data;
  const latest = assessments[0] ?? null;
  const decided = determinations.length > 0;

  return (
    <>
      <div className="page-head">
        <Link to="/claims" className="muted" style={{ fontSize: 13 }}>
          ← Claims
        </Link>
        <h1 style={{ marginTop: 8 }}>
          <span className="mono faint" style={{ fontSize: 16 }}>
            {claim.reference}
          </span>{" "}
          {claim.title}
        </h1>
        <p>
          {claim.room ? `${claim.room} · ` : ""}filed {claim.reportedOn} ·{" "}
          <span className="badge">{claim.status.replace(/_/g, " ")}</span>
        </p>
      </div>

      <section className="section">
        <h2 className="section-title">What the homeowner reported</h2>
        <div className="card" style={{ whiteSpace: "pre-wrap" }}>
          {claim.description}
        </div>
      </section>

      {photos.length > 0 && (
        <section className="section">
          <h2 className="section-title">Photos</h2>
          <div className="photo-grid">
            {photos.map((photo) => (
              <div key={photo.id}>
                <img src={photo.fileUrl} alt="" loading="lazy" />
                <div className="photo-meta">
                  {photo.exifTakenAt
                    ? `Taken ${new Date(photo.exifTakenAt).toLocaleString()}`
                    : "No EXIF timestamp"}
                  {/* Geo verification kills the "that photo isn't of this house"
                      dispute before it starts. */}
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
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Triage</h2>
        {latest ? (
          <AssessmentCard assessment={latest} />
        ) : (
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
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
              <div className="error-note" style={{ marginTop: 12, marginBottom: 0 }}>
                {(triage.error as Error).message}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Determination</h2>
        {decided ? (
          <div className="card">
            {determinations.map((d) => (
              <div key={d.id}>
                <span className="badge ok">
                  {OUTCOME_LABELS[d.outcome as DeterminationOutcome] ?? d.outcome}
                </span>
                <p style={{ marginBottom: 4 }}>{d.reason}</p>
                <div className="faint" style={{ fontSize: 12 }}>
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
                style={{ marginTop: 12, background: "var(--surface-2)" }}
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
                <p style={{ marginBottom: 0 }}>{b.rationale}</p>
              </div>
            ))}
          </div>
        ) : (
          <DeterminationForm claimId={claim.id} assessment={latest} />
        )}
      </section>

      <section className="section">
        <h2 className="section-title">History</h2>
        <div className="card">
          {events.map((event) => (
            <div key={event.id} className="timeline-item">
              <span className="badge">{event.kind.replace(/_/g, " ")}</span>
              <div style={{ flex: 1 }}>
                {event.note && <div>{event.note}</div>}
                <div className="faint" style={{ fontSize: 12 }}>
                  {new Date(event.createdAt).toLocaleString()}
                  {event.toStatus && ` · → ${event.toStatus.replace(/_/g, " ")}`}
                </div>
              </div>
            </div>
          ))}
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
        {a.isEmergency && <span className="badge critical">emergency</span>}
        <span className="badge" style={{ textTransform: "capitalize" }}>
          {a.trade.replace(/_/g, " ")}
        </span>
        <span className="badge">{a.tier}</span>
        <span className="badge">{a.severity}</span>
        <span className="badge mono">{Math.round(a.confidence * 100)}% confidence</span>
        {a.needsHumanReview && (
          <span className="badge warning">needs a closer look</span>
        )}
        <span className="faint" style={{ marginLeft: "auto", fontSize: 12 }}>
          {a.model}
        </span>
      </div>

      <div className="ai-body">
        <p style={{ marginTop: 0 }}>{a.summary}</p>

        <div className="section" style={{ marginBottom: 16 }}>
          <h3 className="section-title">Observed</h3>
          <p style={{ margin: 0 }} className="muted">
            {a.observedCondition}
          </p>
        </div>

        {a.toleranceCheck?.applies && (
          <div className="section" style={{ marginBottom: 16 }}>
            <h3 className="section-title">Tolerance check</h3>
            <div className="muted">
              {a.toleranceCheck.standard} — defect when {a.toleranceCheck.threshold}.
              {a.toleranceCheck.estimatedMeasurement
                ? ` Estimated: ${a.toleranceCheck.estimatedMeasurement}.`
                : " No scale reference in the photos, so no measurement was estimated."}{" "}
              {a.toleranceCheck.withinTolerance === true && (
                <strong>Within tolerance — not a defect.</strong>
              )}
              {a.toleranceCheck.withinTolerance === false && (
                <strong>Exceeds tolerance.</strong>
              )}
            </div>
          </div>
        )}

        {a.citations.length > 0 && (
          <div className="section" style={{ marginBottom: 16 }}>
            <h3 className="section-title">Cited</h3>
            {a.citations.map((citation, i) => (
              <div className="citation" key={i}>
                <div className="mono faint">
                  {citation.source.replace(/_/g, " ")} · {citation.reference}
                </div>
                <q>{citation.quote}</q>
              </div>
            ))}
          </div>
        )}

        {a.possibleDuplicateOfClaimIds.length > 0 && (
          <div className="alert warning" style={{ marginBottom: 16 }}>
            <div className="alert-bar" aria-hidden />
            <div className="alert-body">
              Possibly a repeat of {a.possibleDuplicateOfClaimIds.length} earlier
              claim(s) on this home. A repeat visit for unresolved work is
              charged differently than a new claim.
            </div>
          </div>
        )}

        <div className="section" style={{ marginBottom: 0 }}>
          <h3 className="section-title">Recommends</h3>
          <div>
            <span className="badge">
              {OUTCOME_LABELS[a.proposedOutcome as DeterminationOutcome] ??
                a.proposedOutcome}
            </span>
            <p style={{ marginBottom: 0 }}>{a.recommendedNextStep}</p>
          </div>
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

  return (
    <div className="card">
      {assessment && (
        <p className="muted" style={{ marginTop: 0 }}>
          Triage proposed{" "}
          <strong>{OUTCOME_LABELS[assessment.proposedOutcome as DeterminationOutcome]}</strong>.
          Accept it or change it — either way your decision is what counts, and
          the difference is recorded.
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
      </div>

      <div className="field">
        <label htmlFor="reason">
          Reason — this is what the homeowner and, if it ever comes to it, their
          attorney will read
        </label>
        <textarea
          id="reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
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
        <div className="error-note" style={{ marginTop: 12, marginBottom: 0 }}>
          {(submit.error as Error).message}
        </div>
      )}
    </div>
  );
}
