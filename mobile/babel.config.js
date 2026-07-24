const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required in npm workspaces: expo-router lives in mobile/node_modules only,
      // so babel-preset-expo's hasModule('expo-router') check fails at repo root.
      expoRouterBabelPlugin,
      'react-native-reanimated/plugin',
    ],
  };
};
