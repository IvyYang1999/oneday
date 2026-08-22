/**
 * Preserve the one-shot timeline guide for genuinely new installations only.
 * Existing settings files predate the flag, so treating a missing value there
 * as "seen" prevents an upgrade from unexpectedly replaying onboarding.
 */
export function resolveTimelineOnboardingSeen(
  stored: boolean | undefined,
  hasPersistedSettings: boolean
): boolean {
  return stored ?? hasPersistedSettings
}

export type TimelineOnboardingDecision = "show" | "consume" | "defer"

/** Decide without touching persistence; the caller claims `show` synchronously. */
export function decideTimelineOnboarding(
  seen: boolean,
  entryCount: number,
  errorCount: number,
  hasAvailableHighlighter: boolean
): TimelineOnboardingDecision {
  if (seen) return "defer"
  if (entryCount > 0) return "consume"
  if (errorCount > 0 || !hasAvailableHighlighter) return "defer"
  return "show"
}
