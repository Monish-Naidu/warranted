import type {
  CreateCommunityInput,
  CreateCoverageTermInput,
  CreateWarrantyDocumentInput,
  CreateDeterminationInput,
  CreateHomeInput,
  CreatePlanInput,
  CreateSubAssignmentInput,
  CreateSubcontractorInput,
  CreateToleranceInput,
  ScheduleAppointmentInput,
  SessionUser,
  UpdateAppointmentInput,
  UpdateBackchargeInput,
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

export interface WarrantyDocument {
  id: string;
  title: string;
  effectiveDate: string | null;
  extractedText: string | null;
  homeId: string | null;
}

export interface WarrantyDocumentSummary {
  id: string;
  title: string;
  effectiveDate: string | null;
  homeId: string | null;
  textLength: number;
  terms: CoverageTerm[];
}

export interface CoverageTerm {
  id: string;
  documentId: string;
  heading: string;
  body: string;
  tier: string | null;
  trade: string | null;
  isCoverage: boolean;
  pageNumber: number | null;
}

/** A proposal, not a saved clause. Nothing persists until a human saves it. */
export interface SuggestedClause {
  heading: string;
  body: string;
  tier: string | null;
  trade: string | null;
  isCoverage: boolean;
  pageNumber: number | null;
}

export interface ReadinessStep {
  key: string;
  label: string;
  href: string;
  count: number;
  done: boolean;
  /** True when nothing downstream can work until this exists. */
  blocking: boolean;
  why: string;
}

/** A proposal, not a saved threshold. Nothing persists until a human saves it. */
export interface SuggestedTolerance {
  code: string;
  trade: string;
  condition: string;
  threshold: string;
  measurementUnit: string | null;
  measurementMax: number | null;
  measurementOver: string | null;
  typicalWindowMonths: number;
  isZeroTolerance: boolean;
  notes: string | null;
}

/** A row of the performance standard. `id` is absent on built-in placeholders. */
export interface ToleranceRow {
  id?: string;
  code: string;
  trade: string;
  condition: string;
  threshold: string;
  measurementUnit: string | null;
  measurementMax: number | null;
  measurementOver: string | null;
  typicalWindowMonths: number;
  isZeroTolerance: boolean;
  notes: string | null;
  source: string | null;
}

export interface CommunityRow {
  id: string;
  name: string;
  city: string;
  state: string;
  postalCode: string | null;
}

export interface PlanRow {
  id: string;
  name: string;
  elevation: string | null;
  squareFeet: number | null;
}

export interface SubcontractorRow {
  id: string;
  companyName: string;
  primaryTrade: string;
  defaultWarrantyMonths: number;
}

/** Mirrors the flat shape `GET /api/homes` actually returns. */
export interface HomeListRow {
  id: string;
  lotNumber: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  community: { id: string; name: string };
  plan: { id: string; name: string; elevation: string | null } | null;
  warranty: {
    startDate: string;
    startSource: string;
    startNote: string | null;
  };
}

export interface AppointmentRow {
  id: string;
  scheduledFor: string;
  windowMinutes: number;
  homeownerConfirmed: boolean;
  completedAt: string | null;
  notes: string | null;
  home: { id: string; lotNumber: string; address: string; community: string };
  subcontractor: {
    id: string;
    companyName: string;
    phone: string | null;
    email: string | null;
  } | null;
  claims: Array<{
    claimId: string;
    reference: string;
    title: string;
    trade: string | null;
    status: string;
  }>;
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

  // ------------------------------------------------------ warranty document

  warrantyDocuments: () =>
    request<{ documents: WarrantyDocumentSummary[] }>("/admin/warranty-documents"),

  warrantyDocument: (id: string) =>
    request<{ document: WarrantyDocument; terms: CoverageTerm[] }>(
      `/admin/warranty-documents/${id}`,
    ),

  createWarrantyDocument: (input: CreateWarrantyDocumentInput) =>
    request<{ document: WarrantyDocument }>("/admin/warranty-documents", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Send a file up and get its text back. Nothing is stored by this call: the
   * text lands in the form for review, and only saving the document persists
   * it.
   */
  extractDocumentFile: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const token = getToken();
    const response = await fetch("/api/admin/extract-file", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        payload?.error?.message ?? "Could not read that file.",
        response.status,
        payload?.error?.code ?? "unknown",
      );
    }
    return response.json() as Promise<{
      text: string;
      pages: number | null;
      filename: string;
    }>;
  },

  suggestTolerances: (text: string, title: string) =>
    request<{ tolerances: SuggestedTolerance[]; model: string; latencyMs: number }>(
      "/admin/tolerances/suggest",
      { method: "POST", body: JSON.stringify({ text, title }) },
    ),

  saveTolerances: (tolerances: CreateToleranceInput[]) =>
    request<{ saved: number; skipped: number }>("/admin/tolerances/batch", {
      method: "POST",
      body: JSON.stringify({ tolerances }),
    }),

  suggestClauses: (documentId: string) =>
    request<{ terms: SuggestedClause[]; model: string; latencyMs: number }>(
      `/admin/warranty-documents/${documentId}/suggest-terms`,
      { method: "POST" },
    ),

  saveClauses: (documentId: string, terms: CreateCoverageTermInput[]) =>
    request<{ terms: CoverageTerm[] }>(
      `/admin/warranty-documents/${documentId}/terms`,
      { method: "POST", body: JSON.stringify({ terms }) },
    ),

  deleteClause: (id: string) =>
    request<{ ok: boolean }>(`/admin/coverage-terms/${id}`, { method: "DELETE" }),

  readiness: () =>
    request<{
      steps: ReadinessStep[];
      complete: number;
      total: number;
      blockedOn: string[];
    }>("/admin/readiness"),

  // ---------------------------------------------------------- tolerances

  tolerances: () =>
    request<{
      tolerances: ToleranceRow[];
      usingBuiltIn: boolean;
      builtInCount: number;
      builtIn: ToleranceRow[];
    }>("/admin/tolerances"),

  importBuiltInTolerances: () =>
    request<{ imported: number }>("/admin/tolerances/import-built-in", {
      method: "POST",
    }),

  createTolerance: (input: CreateToleranceInput) =>
    request<{ tolerance: ToleranceRow }>("/admin/tolerances", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteTolerance: (id: string) =>
    request<{ ok: boolean }>(`/admin/tolerances/${id}`, { method: "DELETE" }),

  // ------------------------------------------------------------------ setup

  communities: () =>
    request<{ communities: CommunityRow[] }>("/admin/communities"),

  createCommunity: (input: CreateCommunityInput) =>
    request<{ community: CommunityRow }>("/admin/communities", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  plans: () => request<{ plans: PlanRow[] }>("/admin/plans"),

  createPlan: (input: CreatePlanInput) =>
    request<{ plan: PlanRow }>("/admin/plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createSubcontractor: (input: CreateSubcontractorInput) =>
    request<{ subcontractor: unknown }>("/admin/subcontractors", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createHome: (input: CreateHomeInput) =>
    request<{ home: { id: string } }>("/admin/homes", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createAssignment: (
    homeId: string,
    input: Omit<CreateSubAssignmentInput, "homeId">,
  ) =>
    request<{ assignment: unknown }>(`/builder/homes/${homeId}/assignments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** The picker list, not the scorecard. */
  subcontractorList: () =>
    request<{ subcontractors: SubcontractorRow[] }>("/builder/subcontractors"),

  homes: () => request<{ homes: HomeListRow[] }>("/homes"),

  // ------------------------------------------------------------- scheduling

  appointments: (includePast = false) =>
    request<{ appointments: AppointmentRow[] }>(
      `/appointments${includePast ? "?past=true" : ""}`,
    ),

  scheduleAppointment: (input: ScheduleAppointmentInput) =>
    request<{ appointment: unknown }>("/appointments", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateAppointment: (id: string, input: UpdateAppointmentInput) =>
    request<{ appointment: unknown }>(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  cancelAppointment: (id: string) =>
    request<{ ok: boolean }>(`/appointments/${id}`, { method: "DELETE" }),

  // ------------------------------------------------------------- backcharge

  updateBackcharge: (id: string, input: UpdateBackchargeInput) =>
    request<{ backcharge: unknown }>(`/builder/backcharges/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
