/**
 * The schedule board.
 *
 * `docs/DOMAIN.md` puts scheduling above adjudication as the real bottleneck:
 * deciding whether a crack is covered takes two minutes, getting a homeowner,
 * a superintendent, and a sub into one two-hour window takes two weeks.
 *
 * So the page is built around the two things that actually go wrong. Claims
 * are grouped by home when booking, because five trips to one house for five
 * small defects is the failure mode. And an unconfirmed visit is called out
 * rather than shown as booked, because an unconfirmed appointment is a truck
 * roll waiting to be wasted.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AppointmentRow, type ClaimRow } from "../api";
import { IconCheck } from "../components/Icon";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

export function SchedulePage() {
  const [showPast, setShowPast] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["appointments", showPast],
    queryFn: () => api.appointments(showPast),
  });

  // Everything approved but not yet on the calendar. This is the queue.
  const { data: claims } = useQuery({
    queryKey: ["claims", ""],
    queryFn: () => api.claims(),
  });

  const unscheduled = useMemo(
    () =>
      (claims?.claims ?? []).filter(({ claim }) =>
        ["approved", "triaged", "under_review"].includes(claim.status),
      ),
    [claims],
  );

  const appointments = data?.appointments ?? [];
  const unconfirmed = appointments.filter(
    (a) => !a.homeownerConfirmed && !a.completedAt,
  );

  return (
    <>
      <div className="page-head">
        <h1>Schedule</h1>
        <p>
          Visits, and the claims still waiting for one. Batching several claims
          on a home into a single visit is the difference between one trip and
          five.
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton stats={2} rows={4} />
      ) : isError || !data ? (
        <ErrorState
          title="Couldn't load the schedule"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <div className="stat-row">
            <div
              className={`stat ${unscheduled.length > 0 ? "is-warning" : ""}`}
              style={{ "--row": 0 } as React.CSSProperties}
            >
              <div className="stat-value">{unscheduled.length}</div>
              <div className="stat-label">Claims waiting to be scheduled</div>
            </div>
            <div
              className={`stat ${unconfirmed.length > 0 ? "is-warning" : ""}`}
              style={{ "--row": 1 } as React.CSSProperties}
            >
              <div className="stat-value">{unconfirmed.length}</div>
              <div className="stat-label">
                Booked but not confirmed by the homeowner
              </div>
            </div>
          </div>

          <section className="section">
            <h2 className="section-title">Waiting to be scheduled</h2>
            {unscheduled.length === 0 ? (
              <EmptyState title="Nothing waiting" tone="ok" icon={<IconCheck size={20} />}>
                Every open claim either has a visit booked or is still being
                decided.
              </EmptyState>
            ) : (
              <BookingQueue claims={unscheduled} />
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">
                {showPast ? "All visits" : "Upcoming visits"}
              </h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowPast((v) => !v)}
              >
                {showPast ? "Upcoming only" : "Include past"}
              </button>
            </div>

            {appointments.length === 0 ? (
              <EmptyState title="No visits booked">
                Book one from the queue above.
              </EmptyState>
            ) : (
              <div className="stack">
                {appointments.map((appointment, i) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    row={i}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

/**
 * Claims grouped by home, because the batching decision is per home. Seeing
 * "Lot 42, three claims" is what prompts one visit instead of three.
 */
function BookingQueue({ claims }: { claims: ClaimRow[] }) {
  const byHome = useMemo(() => {
    const map = new Map<string, { label: string; homeId: string; claims: ClaimRow[] }>();
    for (const row of claims) {
      const existing = map.get(row.home.id);
      if (existing) existing.claims.push(row);
      else
        map.set(row.home.id, {
          homeId: row.home.id,
          label: `Lot ${row.home.lotNumber} · ${row.community.name}`,
          claims: [row],
        });
    }
    return [...map.values()].sort((a, b) => b.claims.length - a.claims.length);
  }, [claims]);

  return (
    <div className="stack">
      {byHome.map((group, i) => (
        <BookingGroup key={group.homeId} group={group} row={i} />
      ))}
    </div>
  );
}

function BookingGroup({
  group,
  row,
}: {
  group: { label: string; homeId: string; claims: ClaimRow[] };
  row: number;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(() =>
    group.claims.map((c) => c.claim.id),
  );
  const [when, setWhen] = useState("");
  const [subcontractorId, setSubcontractorId] = useState("");
  const [open, setOpen] = useState(false);

  const { data: subs } = useQuery({
    queryKey: ["subcontractorList"],
    queryFn: api.subcontractorList,
    enabled: open,
  });

  const book = useMutation({
    mutationFn: () =>
      api.scheduleAppointment({
        homeId: group.homeId,
        claimIds: selected,
        subcontractorId: subcontractorId || null,
        scheduledFor: new Date(when).toISOString(),
        windowMinutes: 120,
        notes: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      setOpen(false);
    },
  });

  return (
    <div className="card" style={{ "--row": row } as React.CSSProperties}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="cell-strong">{group.label}</div>
          <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {group.claims.length} claim{group.claims.length === 1 ? "" : "s"} waiting
            {group.claims.length > 1 && " · batch them into one visit"}
          </div>
        </div>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "Book a visit"}
        </button>
      </div>

      <div className="stack" style={{ marginTop: "var(--space-3)", gap: "var(--space-2)" }}>
        {group.claims.map(({ claim }) => (
          <label key={claim.id} className="claim-pick">
            <input
              type="checkbox"
              checked={selected.includes(claim.id)}
              disabled={!open}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, claim.id]
                    : s.filter((x) => x !== claim.id),
                )
              }
            />
            <span className="mono faint">{claim.reference}</span>
            <span style={{ flex: 1 }}>{claim.title}</span>
            {claim.trade && (
              <span className="badge cap">{claim.trade.replace(/_/g, " ")}</span>
            )}
          </label>
        ))}
      </div>

      {open && (
        <form
          className="form-grid"
          style={{ marginTop: "var(--space-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (when && selected.length > 0) book.mutate();
          }}
        >
          <div className="field">
            <label>When</label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Subcontractor</label>
            <select
              value={subcontractorId}
              onChange={(e) => setSubcontractorId(e.target.value)}
            >
              <option value="">Decide later</option>
              {subs?.subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.companyName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-full row">
            <button
              className="btn primary"
              disabled={!when || selected.length === 0 || book.isPending}
            >
              {book.isPending
                ? "Booking…"
                : `Book ${selected.length} claim${selected.length === 1 ? "" : "s"}`}
            </button>
            {selected.length === 0 && (
              <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
                Pick at least one claim.
              </span>
            )}
          </div>
          {book.isError && (
            <div className="form-full error-note" style={{ marginBottom: 0 }}>
              {(book.error as Error).message}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  row,
}: {
  appointment: AppointmentRow;
  row: number;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["claims"] });
  };

  const complete = useMutation({
    mutationFn: () => api.updateAppointment(appointment.id, { completed: true }),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelAppointment(appointment.id),
    onSuccess: invalidate,
  });

  const when = new Date(appointment.scheduledFor);
  const done = Boolean(appointment.completedAt);
  const past = when.getTime() < Date.now();

  return (
    <article
      className={`card appointment ${done ? "is-done" : ""}`}
      style={{ "--row": row } as React.CSSProperties}
    >
      <div className="appointment-head">
        <div>
          <div className="cell-strong">
            Lot {appointment.home.lotNumber} · {appointment.home.address}
          </div>
          <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {when.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {" · "}
            {appointment.windowMinutes} minute window
            {appointment.subcontractor
              ? ` · ${appointment.subcontractor.companyName}`
              : " · no subcontractor assigned"}
          </div>
        </div>

        <div className="row" style={{ gap: "var(--space-2)" }}>
          {done ? (
            <span className="badge ok">completed</span>
          ) : appointment.homeownerConfirmed ? (
            <span className="badge ok">
              <span className="dot" aria-hidden />
              confirmed
            </span>
          ) : (
            <span className="badge warning">
              <span className="dot" aria-hidden />
              awaiting homeowner
            </span>
          )}
          {!done && past && <span className="badge critical">past due</span>}
        </div>
      </div>

      {appointment.claims.length > 0 && (
        <div className="appointment-claims">
          {appointment.claims.map((claim) => (
            <Link
              key={claim.claimId}
              to={`/claims/${claim.claimId}`}
              className="appointment-claim"
            >
              <span className="mono faint">{claim.reference}</span>
              <span>{claim.title}</span>
            </Link>
          ))}
          {appointment.claims.length > 1 && (
            <span className="badge accent">
              {appointment.claims.length} claims in one visit
            </span>
          )}
        </div>
      )}

      {appointment.notes && (
        <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
          {appointment.notes}
        </p>
      )}

      {!done && (
        <div className="row" style={{ marginTop: "var(--space-3)" }}>
          <button
            className="btn sm"
            onClick={() => complete.mutate()}
            disabled={complete.isPending}
          >
            {complete.isPending ? "Saving…" : "Mark visit complete"}
          </button>
          <button
            className="btn ghost sm danger"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            Cancel visit
          </button>
          {!appointment.homeownerConfirmed && (
            <span className="faint" style={{ fontSize: "var(--text-xs)" }}>
              Only the homeowner can confirm, from their app.
            </span>
          )}
        </div>
      )}
    </article>
  );
}
