export const theme = {
  bg: "#0E1116",
  surface: "#161B22",
  surface2: "#1C232C",
  border: "#2A323D",
  text: "#E6EDF3",
  textDim: "#8B98A5",
  textFaint: "#5C6773",
  accent: "#F0883E",
  critical: "#F85149",
  criticalBg: "#2D1315",
  warning: "#D29922",
  warningBg: "#2B2413",
  ok: "#3FB950",
  okBg: "#12261A",
  info: "#58A6FF",
  radius: 12,
} as const;

/** Countdown urgency, used for the warranty clocks on the home screen. */
export function urgencyColor(daysRemaining: number): string {
  if (daysRemaining < 0) return theme.textFaint;
  if (daysRemaining <= 30) return theme.critical;
  if (daysRemaining <= 90) return theme.warning;
  return theme.ok;
}

export function formatDays(days: number): string {
  if (days < 0) return "expired";
  if (days === 0) return "last day";
  if (days === 1) return "1 day left";
  if (days < 60) return `${days} days left`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months left`;
  return `${Math.floor(months / 12)} years left`;
}
