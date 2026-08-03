import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE, api } from "@/api";
import { theme } from "@/theme";

type Detail = Awaited<ReturnType<typeof api.claim>>;

/** Plain-language versions of the internal event kinds. */
const EVENT_COPY: Record<string, string> = {
  submitted: "You reported this",
  ai_triaged: "Your builder's system reviewed it",
  determined: "Your builder made a decision",
  status_changed: "Status updated",
  photo_added: "Photo added",
};

export default function ClaimDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .claim(String(id))
      .then(setDetail)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Couldn't load that claim."),
      );
  }, [id]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.critical }}>{error}</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const { claim, photos, events, determinations } = detail;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.scroll}>
      <View>
        <Text style={styles.reference}>{claim.reference}</Text>
        <Text style={styles.title}>{claim.title}</Text>
        <Text style={styles.meta}>
          {claim.room ? `${claim.room} · ` : ""}reported {claim.reportedOn}
        </Text>
      </View>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }}>
          <View style={styles.photoStrip}>
            {photos.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: `${API_BASE}${photo.fileUrl}` }}
                style={styles.photo}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What you told us</Text>
        <Text style={styles.body}>{claim.description}</Text>
      </View>

      {determinations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your builder's decision</Text>
          {determinations.map((d) => (
            <View key={d.id} style={{ gap: 6 }}>
              <Text style={styles.outcome}>{d.outcome.replace(/_/g, " ")}</Text>
              <Text style={styles.body}>{d.reason}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progress</Text>
        {events.map((event) => (
          <View key={event.id} style={styles.event}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>
                {EVENT_COPY[event.kind] ?? event.kind.replace(/_/g, " ")}
              </Text>
              {event.note && <Text style={styles.eventNote}>{event.note}</Text>}
              <Text style={styles.eventTime}>
                {new Date(event.createdAt).toLocaleString()}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 48, gap: 18 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },

  reference: { color: theme.textFaint, fontSize: 12, fontWeight: "600" },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", marginTop: 3, letterSpacing: -0.3 },
  meta: { color: theme.textDim, fontSize: 13, marginTop: 4 },

  photoStrip: { flexDirection: "row", gap: 10, paddingHorizontal: 18 },
  photo: {
    width: 220,
    height: 165,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },

  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: theme.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  body: { color: theme.text, fontSize: 15, lineHeight: 22 },
  outcome: { color: theme.accent, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },

  event: { flexDirection: "row", gap: 11 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.accent,
    marginTop: 6,
  },
  eventTitle: { color: theme.text, fontSize: 14, fontWeight: "600" },
  eventNote: { color: theme.textDim, fontSize: 13, marginTop: 2, lineHeight: 19 },
  eventTime: { color: theme.textFaint, fontSize: 11, marginTop: 3 },
});
