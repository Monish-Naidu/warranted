import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type ClaimSummary } from "@/api";
import { theme } from "@/theme";

/** Homeowner-facing wording. The internal status values are builder jargon. */
const STATUS_COPY: Record<string, { label: string; color: string }> = {
  submitted: { label: "Sent to your builder", color: theme.info },
  triaged: { label: "Being reviewed", color: theme.info },
  under_review: { label: "Being reviewed", color: theme.info },
  approved: { label: "Approved — scheduling", color: theme.ok },
  scheduled: { label: "Visit scheduled", color: theme.ok },
  in_progress: { label: "Work under way", color: theme.ok },
  completed: { label: "Work finished", color: theme.ok },
  verified: { label: "Resolved", color: theme.textFaint },
  denied: { label: "Not covered", color: theme.critical },
  referred: { label: "Sent elsewhere", color: theme.warning },
  withdrawn: { label: "Withdrawn", color: theme.textFaint },
};

export default function Claims() {
  const [claims, setClaims] = useState<ClaimSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { claims } = await api.claims();
      setClaims(claims);
    } catch {
      setClaims([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!claims) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.list}
      data={claims}
      keyExtractor={(item) => item.claim.id}
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
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing reported yet</Text>
          <Text style={styles.emptyBody}>
            When you find something wrong, photograph it and report it. Even
            small things — a sticking door, a hairline crack — are worth
            recording while the warranty is open.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const status = STATUS_COPY[item.claim.status] ?? {
          label: item.claim.status,
          color: theme.textDim,
        };
        return (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/claim/${item.claim.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.claim.title}</Text>
              <Text style={styles.meta}>
                {item.claim.room ? `${item.claim.room} · ` : ""}
                reported {item.claim.reportedOn} · {item.claim.reference}
              </Text>
            </View>
            <View style={[styles.pill, { borderColor: status.color }]}>
              <Text style={[styles.pillText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  row: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  title: { color: theme.text, fontSize: 15, fontWeight: "600" },
  meta: { color: theme.textFaint, fontSize: 12, marginTop: 3 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  emptyBody: {
    color: theme.textDim,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
});
