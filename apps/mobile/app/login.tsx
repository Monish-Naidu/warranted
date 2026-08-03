import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, setToken } from "@/api";
import { theme } from "@/theme";

export default function Login() {
  const [email, setEmail] = useState("owner.lot42@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(email.trim(), password);
      await setToken(token);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brand}>Warranted</Text>
          </View>

          <Text style={styles.tagline}>
            Your home came with a warranty. This is where you use it — before it
            runs out.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.textFaint}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
            placeholderTextColor={theme.textFaint}
            onSubmitEditing={submit}
          />

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#1A1005" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Demo: owner.lot42@example.com{"\n"}Password: warranted-demo-2026
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 24, paddingTop: 60, gap: 4 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  brandMark: {
    width: 26,
    height: 14,
    borderRadius: 3,
    backgroundColor: theme.accent,
  },
  brand: { color: theme.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  tagline: { color: theme.textDim, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  label: { color: theme.textDim, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.text,
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 26,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#1A1005", fontSize: 16, fontWeight: "700" },
  error: {
    backgroundColor: theme.criticalBg,
    color: theme.critical,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    fontSize: 14,
  },
  hint: { color: theme.textFaint, fontSize: 12, marginTop: 28, lineHeight: 19 },
});
