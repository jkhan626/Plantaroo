// Default Expo Metro config. Kept explicit so we have a home for future tweaks.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
