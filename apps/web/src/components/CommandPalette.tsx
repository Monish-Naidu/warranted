/**
 * ⌘K search across the portal.
 *
 * Reads from the react-query cache rather than fetching: by the time a
 * coordinator reaches for search, the exposure board, the claim list, and the
 * scorecard are already loaded, and hitting the network again would make the
 * palette feel slower than the navigation it replaces. `staleTime` on the
 * queries keeps them warm.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { IconClipboard, IconGauge, IconSearch, IconUsers } from "./Icon";

type Result = {
  id: string;
  group: "Lots" | "Claims" | "Subcontractors" | "Go to";
  title: string;
  subtitle: string;
  to: string;
  icon: "lot" | "claim" | "sub";
  haystack: string;
};

const PAGES: Result[] = [
  {
    id: "page-exposure",
    group: "Go to",
    title: "Exposure",
    subtitle: "Two-clock board and alerts",
    to: "/exposure",
    icon: "lot",
    haystack: "exposure alerts clocks board",
  },
  {
    id: "page-claims",
    group: "Go to",
    title: "Claims",
    subtitle: "Warranty service requests",
    to: "/claims",
    icon: "claim",
    haystack: "claims service requests triage",
  },
  {
    id: "page-subs",
    group: "Go to",
    title: "Subcontractors",
    subtitle: "Scorecard and recovery",
    to: "/subcontractors",
    icon: "sub",
    haystack: "subcontractors subs scorecard recovery backcharge",
  },
  {
    id: "page-patterns",
    group: "Go to",
    title: "Plan patterns",
    subtitle: "Repeating defects by plan",
    to: "/patterns",
    icon: "sub",
    haystack: "plan patterns defects repeating",
  },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Only fetch while the palette is open; otherwise these ride whatever the
  // pages have already cached.
  const { data: exposure } = useQuery({
    queryKey: ["exposure"],
    queryFn: api.exposure,
    enabled: open,
  });
  const { data: claims } = useQuery({
    queryKey: ["claims", ""],
    queryFn: () => api.claims(),
    enabled: open,
  });
  const { data: scorecard } = useQuery({
    queryKey: ["scorecard"],
    queryFn: api.scorecard,
    enabled: open,
  });

  const everything = useMemo<Result[]>(() => {
    const lots: Result[] = (exposure?.lots ?? []).map((lot) => ({
      id: `lot-${lot.homeId}`,
      group: "Lots",
      title: `Lot ${lot.lotNumber} — ${lot.address}`,
      subtitle: [
        lot.community,
        lot.plan,
        // Summed across every trade on the lot, so it is trade-days rather
        // than elapsed days — worth naming, since "939d exposed" on a home
        // with a one-year warranty reads as a bug.
        lot.undocumentedTrades > 0
          ? `${lot.undocumentedTrades} undocumented`
          : `${lot.totalExposureDays} trade-days exposed`,
      ]
        .filter(Boolean)
        .join(" · "),
      to: "/exposure",
      icon: "lot",
      haystack: `lot ${lot.lotNumber} ${lot.address} ${lot.community} ${lot.plan ?? ""}`,
    }));

    const claimResults: Result[] = (claims?.claims ?? []).map(
      ({ claim, home, community }) => ({
        id: `claim-${claim.id}`,
        group: "Claims",
        title: `${claim.reference} — ${claim.title}`,
        subtitle: [
          `Lot ${home.lotNumber}`,
          community.name,
          claim.trade?.replace(/_/g, " "),
          claim.status.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" · "),
        to: `/claims/${claim.id}`,
        icon: "claim",
        haystack: `${claim.reference} ${claim.title} ${claim.room ?? ""} ${claim.trade ?? ""} ${home.lotNumber} ${community.name} ${claim.status}`,
      }),
    );

    const subs: Result[] = (scorecard?.subcontractors ?? []).map((sub) => ({
      id: `sub-${sub.id}`,
      group: "Subcontractors",
      title: sub.companyName,
      subtitle: [
        sub.primaryTrade.replace(/_/g, " "),
        `${sub.lotsWorked} lots`,
        sub.undocumentedAssignments > 0
          ? `${sub.undocumentedAssignments} undocumented`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      to: "/subcontractors",
      icon: "sub",
      haystack: `${sub.companyName} ${sub.primaryTrade}`,
    }));

    return [...PAGES, ...lots, ...claimResults, ...subs];
  }, [exposure, claims, scorecard]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return everything.slice(0, 12);
    const terms = needle.split(/\s+/);
    return everything
      .filter((r) => {
        const hay = `${r.title} ${r.subtitle} ${r.haystack}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 20);
  }, [everything, query]);

  // Reset per opening, and whenever the result set changes under the cursor.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // The input mounts with the palette, so focus after paint.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const choose = useCallback(
    (result: Result | undefined) => {
      if (!result) return;
      onClose();
      navigate(result.to);
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) =>
          results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        choose(results[active]);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, choose, onClose]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="palette-input-row">
          <IconSearch size={18} className="faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lots, claims, subcontractors…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={results[active]?.id}
          />
        </div>

        <div
          className="palette-results"
          id="palette-results"
          role="listbox"
          ref={listRef}
        >
          {results.length === 0 ? (
            <div
              className="faint"
              style={{ padding: "var(--space-6)", textAlign: "center" }}
            >
              Nothing matches “{query}”.
            </div>
          ) : (
            results.map((result, i) => {
              const showGroup = result.group !== lastGroup;
              lastGroup = result.group;
              return (
                <div key={result.id}>
                  {showGroup && (
                    <div className="palette-group-label">{result.group}</div>
                  )}
                  <button
                    type="button"
                    id={result.id}
                    role="option"
                    aria-selected={i === active}
                    className="palette-item"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(result)}
                  >
                    <ResultIcon kind={result.icon} />
                    <span className="palette-item-main">
                      <span className="palette-item-title">{result.title}</span>
                      <span className="palette-item-sub">{result.subtitle}</span>
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultIcon({ kind }: { kind: Result["icon"] }) {
  const style = { flex: "none", color: "var(--text-faint)" };
  if (kind === "claim") return <IconClipboard size={16} className="faint" />;
  if (kind === "sub") return <IconUsers size={16} className="faint" />;
  return <IconGauge size={16} className="faint" />;
}

/** Owns the ⌘K / Ctrl-K binding so the shell only has to render the palette. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
