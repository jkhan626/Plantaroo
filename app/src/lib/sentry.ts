/**
 * Sentry crash & error reporting. Production-only (disabled in dev), PII
 * stripped to the Firebase UID. The DSN is a public client key — safe in code.
 */
import * as Sentry from '@sentry/react-native';

const DSN =
  'https://8cfa784e4865fa7701d7e01e5eab512a@o4511469974061056.ingest.us.sentry.io/4511530160095232';

export function initSentry() {
  Sentry.init({
    dsn: DSN,
    enabled: !__DEV__,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Keep only the user id — never names/emails/IP.
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}

/** Tag crashes with the signed-in user (id only), or clear on sign-out. */
export function setSentryUser(uid: string | null) {
  Sentry.setUser(uid ? { id: uid } : null);
}

/** Wrap the root component for navigation/performance instrumentation. */
export const wrapWithSentry = Sentry.wrap;
