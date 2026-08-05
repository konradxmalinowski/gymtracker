module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          alias: {
            '@/features': './features',
            '@/components': './components',
            '@/database': './database',
            '@/services': './services',
            '@/theme': './theme',
            '@/types': './types',
            '@/utils': './utils',
            '@/hooks': './hooks',
            '@/navigation': './navigation',
            '@/repositories': './repositories',
            '@/stores': './stores',
            '@/domain': './domain',
            '@/i18n': './i18n',
          },
        },
      ],
      // react-native-reanimated/plugin must always be listed last.
      'react-native-worklets/plugin',
    ],
  };
};
