import * as Localization from 'expo-localization';

/**
 * Reads the device's primary locale tag (e.g. `"pl-PL"`). Not used to select
 * a catalog yet - v1 ships English UI only regardless of device locale
 * (D-11) - but reading it now means number/date formatting and a future
 * catalog switch have a real signal to consume instead of adding device-
 * locale plumbing as a separate later change.
 */
export function getDeviceLocale(): string {
  return Localization.getLocales()[0]?.languageTag ?? 'en-US';
}
