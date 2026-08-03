import type {
  CreateDeterminationInput,
  SessionUser,
} from "@warranted/shared";

const TOKEN_KEY = "warranted.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // An expired token shouldn't strand the user on a broken screen.
    if (response.status === 401) setToken(null);
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      body?.error?.code ?? "unknown",
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// response shapes — mirrored from the API routes
// ---------------------------------------------------------------------------

export interface ExposureWindow {
  assignmentId: string;
  subcontractorId: string;
  subcontractorName: string;
  trade: string;
  builderCoverageEnd: string;
  subCoverageEnd: string | null;
  exposureStart: string | null;
  exposureEnd: string | null;
  exposureDays: number;
  currentlyExposed: boolean;
  closingSoon: boolean;
  daysUntilSubExpiry: number | null;
  unknown: boolean;
}

export interface ExposureAlert {
  severity: "critical" | "warning";
  trade: string;
  subcontractorName: string;
  assignmentId: string;
  message: string;
  daysUntilSubExpiry: number | null;
  exposureDays: number;
  homeId: string;
  lotLabel: string;
}

export interface Lot {
  homeId: string;
  lotNumber: string;
  address: string;
  community: string;
  plan: string | null;
  warrantyStartDate: string;
  /** Which date started the clock — never derived, always recorded. */
  warrantyStartSource: string;
  warrantyStartNote: string | null;
  /** The competing dates. They routinely differ; showing them is the point. */
  closingDate: string | null;
  certificateOfOccupancyDate: string | null;
  possessionDate: string | null;
  elevenMonth: {
    dueDate: string | null;
    status: string;
    scheduled: boolean;
    daysUntilDue: number | null;
  };
  exposure: ExposureWindow[];
  totalExposureDays: number;
  undocumentedTrades: number;
}

export interface ExposureResponse {
  alerts: ExposureAlert[];
  lots: Lot[];
  summary: {
    lots: number;
    criticalAlerts: number;
    warningAlerts: number;
    undocumentedAssignments: number;
    lotsWithUnscheduledElevenMonth: number;
  };
}

export interface ClaimRow {
  claim: {
    id: string;
    reference: string;
    title: string;
    description: string;
    room: string | null;
    status: string;
    reportedSeverity: string;
    assessedSeverity: string | null;
    trade: string | null;
    tier: string | null;
    reportedOn: string;
    createdAt: string;
  };
  home: { id: string; lotNumber: string; addressLine1: string };
  community: { id: string; name: string };
}

export interface AiAssessmentRow {
  id: string;
  model: string;
  trade: string;
  tier: string;
  severity: string;
  isEmergency: boolean;
  proposedOutcome: string;
  confidence: number;
  needsHumanReview: boolean;
  summary: string;
  observedCondition: string;
  recommendedNextStep: string;
  citations: Array<{ source: string; reference: string; quote: string }>;
  toleranceCheck: {
    applies: boolean;
    standard: string;
    threshold: string;
    estimatedMeasurement: string | null;
    withinTolerance: boolean | null;
  } | null;
  possibleDuplicateOfClaimIds: string[];
  createdAt: string;
}

export interface ClaimDetail {
  claim: ClaimRow["claim"] & { homeId: string };
  photos: Array<{
    id: string;
    fileUrl: string;
    exifTakenAt: string | null;
    geoVerified: boolean | null;
    distanceFromHomeMeters: number | null;
  }>;
  events: Array<{
    id: string;
    kind: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    createdAt: string;
  }>;
  assessments: AiAssessmentRow[];
  determinations: Array<{
    id: string;
    outcome: string;
    reason: string;
    agreedWithAi: boolean | null;
    createdAt: string;
  }>;
  backcharges: Array<{
    id: string;
    status: string;
    rationale: string;
    daysLate: number | null;
    amountCents: number | null;
  }>;
}

export interface SubBackcharge {
  id: string;
  claimId: string;
  claimReference: string;
  claimTitle: string;
  trade: string | null;
  lotNumber: string;
  status: string;
  amountCents: number | null;
  rationale: string;
  daysLate: number | null;
}

export interface SubScorecardRow {
  id: string;
  companyName: string;
  primaryTrade: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  insuranceExpiresOn: string | null;
  lotsWorked: number;
  undocumentedAssignments: number;
  claimCount: number;
  /** Sub's warranty still open and nobody has billed them. Actionable. */
  openCents: number;
  /** Billed but unsettled. Chase. */
  inFlightCents: number;
  collectedCents: number;
  /** Expired, no sub of record, or written off. The leak. */
  lostCents: number;
  recoveryRate: number | null;
  backcharges: SubBackcharge[];
}

// ---------------------------------------------------------------------------

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: SessionUser }>("/auth/me"),

  exposure: () => request<ExposureResponse>("/builder/exposure"),

  scorecard: () =>
    request<{ subcontractors: SubScorecardRow[] }>(
      "/builder/subcontractors/scorecard",
    ),

  patterns: () =>
    request<{
      patterns: Array<{
        planName: string;
        elevation: string | null;
        trade: string;
        claimCount: number;
        affectedHomes: number;
        homesOnPlan: number;
        incidenceRate: number | null;
      }>;
    }>("/builder/patterns"),

  claims: (status?: string) =>
    request<{ claims: ClaimRow[] }>(
      `/claims${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),

  claim: (id: string) => request<ClaimDetail>(`/claims/${id}`),

  triage: (id: string) =>
    request<{ assessment: AiAssessmentRow }>(`/claims/${id}/triage`, {
      method: "POST",
    }),

  determine: (id: string, input: CreateDeterminationInput) =>
    request<{ determination: unknown; backcharge: unknown }>(
      `/claims/${id}/determination`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  /**
   * Backfill a completion date on an assignment that never got one.
   *
   * `sub_warranty_start` deliberately defaults to `completed_at` rather than
   * to the home's warranty start, so recording this one date is what
   * establishes the subcontractor's window and makes the trade backchargeable.
   */
  updateAssignment: (assignmentId: string, input: { completedAt: string }) =>
    request<{ assignment: unknown }>(`/builder/assignments/${assignmentId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  scheduleMilestone: (homeId: string, kind: string, scheduledFor: string) =>
    request<{ milestone: unknown }>(
      `/homes/${homeId}/milestones/${kind}/schedule`,
      { method: "POST", body: JSON.stringify({ scheduledFor }) },
    ),
};
