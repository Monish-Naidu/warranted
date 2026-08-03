import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { getToken } from "@/api";
import { theme } from "@/theme";

/** Decides where to land on cold start, once the stored token is read. */
export default function Index() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    getToken().then((token) => setState(token ? "in" : "out"));
  }, []);

  if (state === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return <Redirect href={state === "in" ? "/(tabs)" : "/login"} />;
}
