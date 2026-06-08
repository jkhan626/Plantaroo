// Metro config wrapped by Sentry so source maps upload during EAS builds.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
