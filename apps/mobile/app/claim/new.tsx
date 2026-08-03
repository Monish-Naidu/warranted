import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "@/api";
import { theme } from "@/theme";

const SEVERITIES = [
  { value: "emergency", label: "Emergency", hint: "Leak, no heat/AC, no power, gas" },
  { value: "urgent", label: "Urgent", hint: "Hard to live with" },
  { value: "routine", label: "Routine", hint: "Needs fixing, can wait" },
  { value: "cosmetic", label: "Cosmetic", hint: "Finish or appearance" },
] as const;

interface PendingPhoto {
  localUri: string;
  uploadedId: string | null;
  uploading: boolean;
  geoVerified: boolean | null;
}

export default function NewClaim() {
  const { homeId } = useLocalSearchParams<{ homeId: string }>();

  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("routine");
  const [submitting, setSubmitting] = useState(false);

  /**
   * Capture a photo and attach its provenance.
   *
   * The EXIF capture time and the device's coordinates are what turn a photo
   * into evidence. Upload time proves nothing — a builder can always argue a
   * picture was taken somewhere else, or long before it was reported. Both are
   * best-effort: a denied location permission degrades the record, it does not
   * block the claim.
   */
  async function addPhoto(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Warranted needs camera access to photograph the problem."
          : "Warranted needs photo access to attach an existing picture.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, exif: true })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            exif: true,
            mediaTypes: ["images"],
          });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const index = photos.length;
    setPhotos((prev) => [
      ...prev,
      { localUri: asset.uri, uploadedId: null, uploading: true, geoVerified: null },
    ]);

    // Prefer the photo's own EXIF coordinates; fall back to where the device
    // is now, which for a photo just taken is the same place.
    let latitude: number | null = null;
    let longitude: number | null = null;
    const exif = asset.exif as Record<string, unknown> | undefined;

    if (typeof exif?.GPSLatitude === "number" && typeof exif?.GPSLongitude === "number") {
      latitude = exif.GPSLatitude;
      longitude = exif.GPSLongitude;
    } else {
      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.granted) {
        try {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          // Location is a nice-to-have; a claim without it still stands.
        }
      }
    }

    const takenAtRaw = exif?.DateTimeOriginal ?? exif?.DateTime;
    const takenAt =
      typeof takenAtRaw === "string"
        ? // EXIF writes "2026:08:02 14:31:05"; ISO needs dashes in the date half.
          new Date(takenAtRaw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")).toISOString()
        : new Date().toISOString();

    try {
      const { photo } = await api.uploadPhoto({
        homeId: String(homeId),
        uri: asset.uri,
        metadata: {
          takenAt,
          latitude,
          longitude,
          width: asset.width ?? null,
          height: asset.height ?? null,
        },
      });
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === index
            ? { ...p, uploadedId: photo.id, uploading: false, geoVerified: photo.geoVerified }
            : p,
        ),
      );
    } catch (e) {
      setPhotos((prev) => prev.filter((_, i) => i !== index));
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.");
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const { claim } = await api.createClaim({
        homeId: String(homeId),
        title: title.trim(),
        description: description.trim(),
        room: room.trim() || undefined,
        reportedSeverity: severity,
        photoIds: photos.map((p) => p.uploadedId).filter((id): id is string => Boolean(id)),
      });
      router.replace(`/claim/${claim.id}`);
    } catch (e) {
      Alert.alert("Couldn't send", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length > 0 &&
    !photos.some((p) => p.uploading) &&
    !submitting;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Photograph the problem, then describe it in your own words. Your
          builder sees exactly this.
        </Text>

        <View style={styles.photoRow}>
          {photos.map((photo, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri: photo.localUri }} style={styles.thumb} />
              {photo.uploading && (
                <View style={styles.thumbOverlay}>
                  <ActivityIndicator color={theme.text} />
                </View>
              )}
              {photo.geoVerified === true && (
                <View style={styles.geoBadge}>
                  <Ionicons name="location" size={11} color={theme.ok} />
                </View>
              )}
            </View>
          ))}

          <Pressable style={styles.addPhoto} onPress={() => addPhoto("camera")}>
            <Ionicons name="camera-outline" size={24} color={theme.textDim} />
            <Text style={styles.addPhotoText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.addPhoto} onPress={() => addPhoto("library")}>
            <Ionicons name="images-outline" size={24} color={theme.textDim} />
            <Text style={styles.addPhotoText}>Library</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>What's wrong?</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Crack above the living room doorway"
          placeholderTextColor={theme.textFaint}
          maxLength={160}
        />

        <Text style={styles.label}>Where in the house?</Text>
        <TextInput
          style={styles.input}
          value={room}
          onChangeText={setRoom}
          placeholder="Living room"
          placeholderTextColor={theme.textFaint}
          maxLength={80}
        />

        <Text style={styles.label}>Describe it</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="When did you first notice it? Has it changed since? Anything that makes it better or worse?"
          placeholderTextColor={theme.textFaint}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>How urgent is it?</Text>
        <View style={{ gap: 8 }}>
          {SEVERITIES.map((option) => {
            const selected = severity === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.severity, selected && styles.severitySelected]}
                onPress={() => setSeverity(option.value)}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={19}
                  color={selected ? theme.accent : theme.textFaint}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.severityLabel}>{option.label}</Text>
                  <Text style={styles.severityHint}>{option.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {severity === "emergency" && (
          <View style={styles.emergencyNote}>
            <Text style={styles.emergencyText}>
              Emergencies get a 24-hour response. If there's active water,
              sewage, gas, or no power, call your builder directly as well —
              don't wait on the app.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#1A1005" />
          ) : (
            <Text style={styles.submitText}>Send to my builder</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Your photos are timestamped and matched to your address, so there's a
          clear record of what you reported and when.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 60, gap: 4 },
  lead: { color: theme.textDim, fontSize: 14, lineHeight: 21, marginBottom: 18 },

  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  thumbWrap: { position: "relative" },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  thumbOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  geoBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: theme.okBg,
    borderRadius: 8,
    padding: 3,
  },
  addPhoto: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  addPhotoText: { color: theme.textDim, fontSize: 11 },

  label: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 7,
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 16,
  },
  textarea: { minHeight: 110, paddingTop: 12 },

  severity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 13,
  },
  severitySelected: { borderColor: theme.accent },
  severityLabel: { color: theme.text, fontSize: 15, fontWeight: "600" },
  severityHint: { color: theme.textFaint, fontSize: 12, marginTop: 1 },

  emergencyNote: {
    backgroundColor: theme.criticalBg,
    borderWidth: 1,
    borderColor: theme.critical,
    borderRadius: 10,
    padding: 13,
    marginTop: 12,
  },
  emergencyText: { color: theme.text, fontSize: 13, lineHeight: 19 },

  submit: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 26,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: "#1A1005", fontSize: 16, fontWeight: "700" },

  footnote: {
    color: theme.textFaint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 14,
  },
});
