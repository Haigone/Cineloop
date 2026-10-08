import type { AppNotification, NotificationKind, UserPreferences } from "./types";

const PREFERENCE_FOR: Record<NotificationKind, keyof UserPreferences | null> = {
  "friend-activity": "notifyFriendActivity",
  suggestion: "notifySuggestions",
  "watch-party": "notifyWatchParty",
  system: null,
};

/** Notifications the user still wants to see. System messages always pass. */
export function filterNotifications(list: AppNotification[], prefs: UserPreferences): AppNotification[] {
  return list.filter((n) => {
    const key = PREFERENCE_FOR[n.kind];
    return key === null || prefs[key] === true;
  });
}
