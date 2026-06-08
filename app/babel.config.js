module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin replaces the old reanimated plugin in RN 0.81 / Reanimated 4.
    plugins: ['react-native-worklets/plugin'],
  };
};
