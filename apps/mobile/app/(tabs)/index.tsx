import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, setToken, type HomeSummary, type TierCoverage } from "@/api";
import { formatDays, theme, urgencyColor } from "@/theme";

const TIER_LABELS: Record<TierCoverage["tier"], string> = {
  workmanship: "Workmanship & materials",
  systems: "Plumbing, electrical & HVAC",
  structural: "Major structural",
};

const TIER_BLURB: Record<TierCoverage["tier"], string> = {
  workmanship: "Drywall, paint, trim, doors, flooring, fixtures",
  systems: "Pipes, wiring, heating and cooling",
  structural: "Foundation, framing, roof structure",
};

export default function MyHome() {
  const [homes, setHomes] = useState<HomeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { homes } = await api.homes();
      setHomes(homes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your home.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.secondaryBtn}
          onPress={async () => {
            await setToken(null);
            router.replace("/login");
          }}
        >
          <Text style={styles.secondaryBtnText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (!homes) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.textDim}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      {homes.map((home) => (
        <HomeCard key={home.id} home={home} />
      ))}
    </ScrollView>
  );
}

function HomeCard({ home }: { home: HomeSummary }) {
  const elevenMonth = home.milestones.find((m) => m.kind === "eleven_month");
  const workmanship = home.warranty.tiers.find((t) => t.tier === "workmanship");

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={styles.address}>{home.address.line1}</Text>
        <Text style={styles.addressSub}>
          {home.address.city}, {home.address.state} · Lot {home.lotNumber} ·{" "}
          {home.community.name}
        </Text>
      </View>

      {/*
        The deadline banner. The 11-month review is the last practical chance to
        file against the workmanship year — the biggest bucket of coverage — and
        it is the single thing homeowners most often miss.
      */}
      {elevenMonth &&
        elevenMonth.status !== "completed" &&
        elevenMonth.daysUntilDue !== null &&
        elevenMonth.daysUntilDue <= 120 && (
          <View
            style={[
              styles.banner,
              {
                backgroundColor:
                  elevenMonth.daysUntilDue <= 45 ? theme.criticalBg : theme.warningBg,
                borderColor:
                  elevenMonth.daysUntilDue <= 45 ? theme.critical : theme.warning,
              },
            ]}
          >
            <Ionicons
              name="alarm-outline"
              size={20}
              color={elevenMonth.daysUntilDue <= 45 ? theme.critical : theme.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {elevenMonth.daysUntilDue < 0
                  ? "Your 11-month review is overdue"
                  : `Your 11-month review is due in ${elevenMonth.daysUntilDue} days`}
              </Text>
              <Text style={styles.bannerBody}>
                This is the last practical chance to report anything covered by
                the one-year workmanship warranty — drywall, paint, trim, doors,
                flooring, fixtures. Walk the house and report what you find.
              </Text>
            </View>
          </View>
        )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What's still covered</Text>
        {home.warranty.tiers.map((tier) => (
          <TierRow key={tier.tier} tier={tier} />
        ))}
        <Text style={styles.footnote}>
          Coverage started {home.warranty.startDate} (
          {home.warranty.startSource.replace(/_/g, " ")}).
        </Text>
      </View>

      <Pressable
        style={styles.primaryBtn}
        onPress={() => router.push({ pathname: "/claim/new", params: { homeId: home.id } })}
      >
        <Ionicons name="camera" size={19} color="#1A1005" />
        <Text style={styles.primaryBtnText}>Report a problem</Text>
      </Pressable>

      {workmanship && workmanship.daysRemaining >= 0 && (
        <Text style={styles.tip}>
          Not sure if something counts? Report it anyway. It costs you nothing,
          and you have {formatDays(workmanship.daysRemaining)} on the workmanship
          warranty.
        </Text>
      )}
    </View>
  );
}

function TierRow({ tier }: { tier: TierCoverage }) {
  const color = urgencyColor(tier.daysRemaining);
  const total = tier.months * 30.44;
  const pct = Math.max(0, Math.min(1, tier.daysRemaining / total));

  return (
    <View style={styles.tierRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.tierName}>{TIER_LABELS[tier.tier]}</Text>
        <Text style={styles.tierBlurb}>{TIER_BLURB[tier.tier]}</Text>
        <View style={styles.track}>
          <View
            style={[styles.trackFill, { width: `${pct * 100}%`, backgroundColor: color }]}
          />
        </View>
      </View>
      <View style={{ alignItems: "flex-end", minWidth: 92 }}>
        <Text style={[styles.tierDays, { color }]}>
          {formatDays(tier.daysRemaining)}
        </Text>
        <Text style={styles.tierEnd}>{tier.endDate}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 48, gap: 28 },
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  errorText: { color: theme.critical, textAlign: "center", fontSize: 15 },

  address: { color: theme.text, fontSize: 21, fontWeight: "700", letterSpacing: -0.4 },
  addressSub: { color: theme.textDim, fontSize: 13, marginTop: 3 },

  banner: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: theme.radius,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  bannerTitle: { color: theme.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  bannerBody: { color: theme.textDim, fontSize: 13, lineHeight: 19 },

  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 16,
  },
  cardTitle: { color: theme.text, fontWeight: "700", fontSize: 15 },

  tierRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tierName: { color: theme.text, fontSize: 14, fontWeight: "600" },
  tierBlurb: { color: theme.textFaint, fontSize: 12, marginTop: 1, marginBottom: 7 },
  track: {
    height: 5,
    backgroundColor: theme.surface2,
    borderRadius: 3,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: 3 },
  tierDays: { fontSize: 13, fontWeight: "700" },
  tierEnd: { color: theme.textFaint, fontSize: 11, marginTop: 2 },

  footnote: { color: theme.textFaint, fontSize: 11, lineHeight: 16 },

  primaryBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#1A1005", fontSize: 16, fontWeight: "700" },

  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  secondaryBtnText: { color: theme.text, fontWeight: "600" },

  tip: { color: theme.textFaint, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
