/**
 * The warranty document, and the clauses drawn from it.
 *
 * This is the most consequential thing in setup and the easiest to rush. Every
 * coverage decision the product proposes cites this document, and a
 * determination that quotes §3.0(b) back to a homeowner ends an argument where
 * one that says "not covered" starts one.
 *
 * The clause list is not filing. `citations[].reference` in a triage proposal
 * points at these headings, and an uncited proposal is forced to
 * `needsHumanReview` in code. Tagging is what turns "the warranty says
 * something about maintenance" into a citation a coordinator can read aloud.
 *
 * Extraction proposes; a human saves. Same rule as triage, for a sharper
 * reason: a bad triage proposal misjudges one claim, and a bad clause tag is
 * quietly wrong on every claim that cites it afterwards.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRADES, WARRANTY_TIERS } from "@warranted/shared";
import { useRef, useState } from "react";
import {
  api,
  type CoverageTerm,
  type SuggestedClause,
  type WarrantyDocumentSummary,
} from "../api";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

export function WarrantyDocPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["warrantyDocuments"],
    queryFn: api.warrantyDocuments,
  });

  const documents = data?.documents ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Warranty document</h1>
        <p>
          Your limited warranty, broken into clauses. Every coverage decision
          the system proposes cites one of them by heading, so this is what
          turns a denial into something you can defend.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton rows={3} />
      ) : isError ? (
        <ErrorState
          title="Couldn't load the document"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {documents.length === 0 ? (
            <EmptyState title="No warranty document on file">
              Until one is loaded, triage falls back to the standard 1-2-10
              structure and the tolerance table, and flags every claim for
              review because it cannot cite you.
            </EmptyState>
          ) : (
            <div className="stack" style={{ marginBottom: "var(--space-8)" }}>
              {documents.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}

          <section className="section">
            <h2 className="section-title">
              {documents.length === 0 ? "Load a document" : "Load another"}
            </h2>
            <UploadForm />
          </section>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------- upload

function UploadForm() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [text, setText] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);

  const extract = useMutation({
    mutationFn: (file: File) => api.extractDocumentFile(file),
    onSuccess: (result) => {
      setText(result.text);
      setFileNote(
        `Read ${result.text.length.toLocaleString()} characters from ${result.filename}${
          result.pages ? ` (${result.pages} pages)` : ""
        }. Check it below before saving.`,
      );
      if (!title) setTitle(result.filename.replace(/\.[^.]+$/, ""));
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.createWarrantyDocument({
        title,
        effectiveDate: effectiveDate || null,
        extractedText: text,
        homeId: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warrantyDocuments"] });
      setTitle("");
      setEffectiveDate("");
      setText("");
      setFileNote(null);
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  return (
    <div className="card card-pad-lg">
      <div className="field">
        <label htmlFor="doc-file">Upload a PDF or text file</label>
        <input
          id="doc-file"
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,text/plain,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) extract.mutate(file);
          }}
        />
        <div className="field-hint">
          Only the text is kept. The file itself is not stored, and the text is
          what triage reads.
        </div>
        {extract.isPending && (
          <div className="field-hint">Reading the file…</div>
        )}
        {extract.isError && (
          <div className="error-note" style={{ marginTop: "var(--space-2)" }}>
            {(extract.error as Error).message}
          </div>
        )}
        {fileNote && (
          <div className="field-hint" style={{ color: "var(--ok)" }}>
            {fileNote}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="doc-title">
              Title<span className="req"> *</span>
            </label>
            <input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Limited Warranty (2026 program)"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="doc-date">Effective date</label>
            <input
              id="doc-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="doc-text">
            Document text<span className="req"> *</span>
          </label>
          <textarea
            id="doc-text"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the warranty text here, or upload a file above."
            required
          />
          <div className="field-hint">
            {text.length.toLocaleString()} characters
          </div>
        </div>

        <button className="btn primary" disabled={save.isPending || !text.trim()}>
          {save.isPending ? "Saving…" : "Save document"}
        </button>

        {save.isError && (
          <div className="error-note" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
            {(save.error as Error).message}
          </div>
        )}
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ clauses

function DocumentCard({ doc }: { doc: WarrantyDocumentSummary }) {
  const queryClient = useQueryClient();
  const [proposals, setProposals] = useState<SuggestedClause[] | null>(null);

  const suggest = useMutation({
    mutationFn: () => api.suggestClauses(doc.id),
    onSuccess: (result) => setProposals(result.terms),
  });

  const grants = doc.terms.filter((t) => t.isCoverage);
  const excludes = doc.terms.filter((t) => !t.isCoverage);

  return (
    <article className="card card-pad-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="lot-title">{doc.title}</div>
          <div className="lot-meta">
            {doc.effectiveDate ? `Effective ${doc.effectiveDate} · ` : ""}
            {doc.textLength.toLocaleString()} characters ·{" "}
            {doc.terms.length} clause{doc.terms.length === 1 ? "" : "s"} tagged
          </div>
        </div>
        <div className="row" style={{ gap: "var(--space-2)" }}>
          <span className="badge ok">{grants.length} grant</span>
          <span className="badge critical">{excludes.length} exclude</span>
        </div>
      </div>

      {doc.terms.length === 0 && (
        <div className="alert warning" style={{ marginTop: "var(--space-4)" }}>
          <div className="alert-bar" aria-hidden />
          <div className="alert-body alert-text">
            No clauses tagged yet. Triage can still read the full text, but it
            has no reviewed clause to cite, so it will flag everything for
            review.
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: "var(--space-4)" }}>
        <button
          className="btn primary"
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending}
        >
          {suggest.isPending ? "Reading the document…" : "Extract clauses with AI"}
        </button>
        <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
          Proposals only. Nothing is saved until you review them.
        </span>
      </div>

      {suggest.isError && (
        <div className="error-note" style={{ marginTop: "var(--space-3)" }}>
          {(suggest.error as Error).message}
        </div>
      )}

      {proposals && (
        <ProposalReview
          documentId={doc.id}
          proposals={proposals}
          onDone={() => {
            setProposals(null);
            queryClient.invalidateQueries({ queryKey: ["warrantyDocuments"] });
          }}
          onCancel={() => setProposals(null)}
        />
      )}

      {doc.terms.length > 0 && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <h3 className="section-title">Tagged clauses</h3>
          <div className="clause-list">
            {doc.terms.map((term) => (
              <SavedClause key={term.id} term={term} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * The review step. Every proposal starts unchecked in the sense that it is
 * editable and individually removable before anything is written.
 */
function ProposalReview({
  documentId,
  proposals,
  onDone,
  onCancel,
}: {
  documentId: string;
  proposals: SuggestedClause[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SuggestedClause[]>(proposals);

  const save = useMutation({
    mutationFn: () =>
      api.saveClauses(
        documentId,
        draft.map((d) => ({
          heading: d.heading,
          body: d.body,
          tier: d.tier as never,
          trade: d.trade as never,
          isCoverage: d.isCoverage,
          pageNumber: d.pageNumber,
        })),
      ),
    onSuccess: onDone,
  });

  const update = (i: number, patch: Partial<SuggestedClause>) =>
    setDraft((d) => d.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  return (
    <div className="proposal-review">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="cell-strong">
            {draft.length} proposed clause{draft.length === 1 ? "" : "s"}
          </div>
          <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Edit anything that is wrong, drop anything that is not a clause,
            then save. These become the citations on every future
            determination.
          </div>
        </div>
        <div className="row" style={{ gap: "var(--space-2)" }}>
          <button className="btn ghost sm" onClick={onCancel}>
            Discard
          </button>
          <button
            className="btn primary sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || draft.length === 0}
          >
            {save.isPending ? "Saving…" : `Save ${draft.length}`}
          </button>
        </div>
      </div>

      {save.isError && (
        <div className="error-note" style={{ marginTop: "var(--space-3)" }}>
          {(save.error as Error).message}
        </div>
      )}

      <div className="clause-list" style={{ marginTop: "var(--space-4)" }}>
        {draft.map((clause, i) => (
          <div key={i} className="clause is-draft">
            <div className="form-grid">
              <div className="field form-full">
                <label>Heading</label>
                <input
                  value={clause.heading}
                  onChange={(e) => update(i, { heading: e.target.value })}
                />
              </div>
              <div className="field form-full">
                <label>Body</label>
                <textarea
                  rows={3}
                  value={clause.body}
                  onChange={(e) => update(i, { body: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Grants or excludes</label>
                <select
                  value={clause.isCoverage ? "grants" : "excludes"}
                  onChange={(e) =>
                    update(i, { isCoverage: e.target.value === "grants" })
                  }
                >
                  <option value="grants">Grants coverage</option>
                  <option value="excludes">Excludes</option>
                </select>
              </div>
              <div className="field">
                <label>Tier</label>
                <select
                  value={clause.tier ?? ""}
                  onChange={(e) => update(i, { tier: e.target.value || null })}
                >
                  <option value="">None</option>
                  {WARRANTY_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Trade</label>
                <select
                  value={clause.trade ?? ""}
                  onChange={(e) => update(i, { trade: e.target.value || null })}
                >
                  <option value="">None</option>
                  {TRADES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Page</label>
                <input
                  type="number"
                  min={1}
                  value={clause.pageNumber ?? ""}
                  onChange={(e) =>
                    update(i, {
                      pageNumber: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="form-full">
                <button
                  type="button"
                  className="btn ghost sm danger"
                  onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}
                >
                  Not a clause, drop it
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedClause({ term }: { term: CoverageTerm }) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deleteClause(term.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["warrantyDocuments"] }),
  });

  return (
    <div className={`clause ${term.isCoverage ? "" : "is-exclusion"}`}>
      <div className="clause-head">
        <span className="cell-strong">{term.heading}</span>
        <span className={`badge ${term.isCoverage ? "ok" : "critical"}`}>
          {term.isCoverage ? "grants" : "excludes"}
        </span>
        {term.tier && <span className="badge">{term.tier}</span>}
        {term.trade && (
          <span className="badge cap">{term.trade.replace(/_/g, " ")}</span>
        )}
        {term.pageNumber && (
          <span className="badge mono">p{term.pageNumber}</span>
        )}
        <button
          type="button"
          className="btn ghost sm danger"
          style={{ marginLeft: "auto" }}
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          Remove
        </button>
      </div>
      <p className="clause-body">{term.body}</p>
    </div>
  );
}
