import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "warranted.token";

/**
 * On a physical device, `localhost` is the phone, not the dev machine. Expo
 * exposes the host it's serving from, so derive the API base from that and
 * fall back to the configured URL for simulators.
 */
function resolveBaseUrl(): string {
  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)
    ?.apiUrl;

  const hostUri = Constants.expoConfig?.hostUri;

  if (hostUri && Platform.OS !== "web") {
    const host = String(hostUri).split(":")[0];
    if (host) return `http://${host}:3001`;
  }

  return configured ?? "http://localhost:3001";
}

export const API_BASE = resolveBaseUrl();

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    if (response.status === 401) await setToken(null);
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------

export interface TierCoverage {
  tier: "workmanship" | "systems" | "structural";
  startDate: string;
  endDate: string;
  months: number;
  active: boolean;
  daysRemaining: number;
  expiringSoon: boolean;
}

export interface HomeMilestone {
  kind: "orientation" | "thirty_day" | "eleven_month";
  status: string;
  dueDate: string;
  scheduledFor: string | null;
  daysUntilDue: number | null;
  isLastChance: boolean;
}

export interface HomeSummary {
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
    finalCoverageDate: string;
    tiers: TierCoverage[];
  };
  milestones: HomeMilestone[];
  nextMilestone: HomeMilestone | null;
}

export interface ClaimSummary {
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
    reportedOn: string;
  };
  home: { id: string; lotNumber: string; addressLine1: string };
  community: { id: string; name: string };
}

export interface PhotoUploadResult {
  photo: { id: string; fileUrl: string; geoVerified: boolean | null };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; fullName: string; role: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),

  me: () => request<{ user: { id: string; fullName: string; role: string } }>("/auth/me"),

  homes: () => request<{ homes: HomeSummary[] }>("/homes"),

  claims: () => request<{ claims: ClaimSummary[] }>("/claims"),

  claim: (id: string) =>
    request<{
      claim: ClaimSummary["claim"];
      photos: Array<{ id: string; fileUrl: string }>;
      events: Array<{
        id: string;
        kind: string;
        note: string | null;
        toStatus: string | null;
        createdAt: string;
      }>;
      determinations: Array<{ id: string; outcome: string; reason: string }>;
    }>(`/claims/${id}`),

  createClaim: (input: {
    homeId: string;
    title: string;
    description: string;
    room?: string;
    reportedSeverity: string;
    photoIds: string[];
  }) =>
    request<{ claim: { id: string; reference: string } }>("/claims", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Uploads a photo with its EXIF timestamp and coordinates.
   *
   * The metadata is the point: an upload time proves nothing, but a capture
   * time and a geotag near the lot turn a photo into evidence.
   */
  uploadPhoto: async (params: {
    homeId: string;
    uri: string;
    metadata: {
      takenAt: string | null;
      latitude: number | null;
      longitude: number | null;
      width: number | null;
      height: number | null;
    };
  }): Promise<PhotoUploadResult> => {
    const token = await getToken();
    const form = new FormData();
    form.append("homeId", params.homeId);
    form.append("metadata", JSON.stringify(params.metadata));
    form.append("file", {
      uri: params.uri,
      name: `claim-${Date.now()}.jpg`,
      type: "image/jpeg",
    } as unknown as Blob);

    const response = await fetch(`${API_BASE}/api/claims/photos`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new ApiError(
        body?.error?.message ?? "Upload failed.",
        response.status,
      );
    }

    return response.json() as Promise<PhotoUploadResult>;
  },
};
