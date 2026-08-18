const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

/**
 * The 11 features from ARCHITECTURE.md section 9. Kept as a single list so
 * the cross-feature barrel-only zones below can be generated instead of
 * hand-written 11x10 times.
 */
const FEATURES = [
  'onboarding',
  'profile',
  'exercise-library',
  'plans',
  'workout-logging',
  'rest-timer',
  'records',
  'statistics',
  'body-metrics',
  'calendar',
  'data-transfer',
  'home',
];

// Cross-feature imports are only allowed through a feature's public index.ts
// barrel (ARCHITECTURE.md section 3.1, rule 4). `from` must stay a plain,
// non-glob directory here - eslint-plugin-import's no-restricted-paths
// treats a zone's `except` entries as invalid unless their glob-ness matches
// `from`, so mixing glob and absolute paths in a single zone silently
// disables the exception. One absolute-path zone per (feature, otherFeature)
// pair sidesteps that entirely.
const crossFeatureBarrelZones = FEATURES.flatMap((feature) =>
  FEATURES.filter((other) => other !== feature).map((other) => ({
    target: `./features/${feature}`,
    from: `./features/${other}`,
    except: ['index.ts'],
    message: `Cross-feature imports must go through "@/features/${other}" (its index.ts barrel), not into its internals.`,
  })),
);

module.exports = [
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'ios/**', 'android/**', '**/*.gitkeep'],
  },

  ...expoConfig,

  {
    // Root-level tooling config files run in plain Node, not the RN/browser
    // globals eslint-config-expo assumes for app code (metro.config.js gets
    // this from eslint-config-expo itself; the others don't).
    name: 'gymtracker/node-config-files',
    files: ['tailwind.config.js', 'babel.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    name: 'gymtracker/architecture-layering',
    rules: {
      // Prevents import cycles anywhere in the project (ARCHITECTURE.md
      // section 9.1: "cycles are prevented mechanically by
      // eslint-plugin-import's no-cycle rule set to error").
      'import/no-cycle': 'error',

      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // Load-bearing rule (ARCHITECTURE.md section 9): components/ may
            // never import from features/ - it has zero domain knowledge.
            {
              target: './components',
              from: './features',
              message:
                'components/ is cross-feature and domain-free (ARCHITECTURE.md section 9). A component that needs domain knowledge belongs in the feature, not here.',
            },

            // Rule 3: presentation never imports a repository directly - it
            // goes through feature services via hooks.
            {
              target: ['./app', './components'],
              from: './repositories',
              message:
                'Presentation never imports a repository directly (ARCHITECTURE.md section 3.1, rule 3). Call a feature service through a hook instead.',
            },
            {
              target: ['./features/*/screens', './features/*/components'],
              from: './features/*/repository',
              message:
                'Presentation never imports a repository directly (ARCHITECTURE.md section 3.1, rule 3). Call a feature service through a hook instead.',
            },

            ...crossFeatureBarrelZones,
          ],
        },
      ],
    },
  },

  {
    name: 'gymtracker/domain-purity',
    files: ['domain/**/*.ts', 'features/*/domain/**/*.ts'],
    rules: {
      // Rule 1: domain imports nothing from React, Expo or SQLite.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-native', 'react-native/*', 'expo', 'expo-*', '@expo/*'],
              message:
                'The domain layer must not import React, React Native or Expo (ARCHITECTURE.md section 3.1, rule 1). Domain code is pure TypeScript.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'gymtracker/sqlite-boundary',
    rules: {
      // Rule 2: nothing outside database/ and **/repository/*.ts may touch a
      // SQLite handle.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-sqlite',
              message:
                "expo-sqlite may only be imported from database/ or a feature's repository/*.ts (ARCHITECTURE.md section 3.1, rule 2).",
            },
          ],
          patterns: [
            {
              group: ['expo-sqlite/*'],
              message:
                "expo-sqlite may only be imported from database/ or a feature's repository/*.ts (ARCHITECTURE.md section 3.1, rule 2).",
            },
          ],
        },
      ],
    },
  },
  {
    name: 'gymtracker/sqlite-boundary-exemptions',
    files: ['database/**/*.ts', '**/repository/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  {
    name: 'gymtracker/unit-conversion-boundary',
    rules: {
      // ARCHITECTURE.md section 8: weights are persisted in kg, lengths in
      // cm; unit conversion only ever happens in domain/Weight.ts and
      // domain/Length.ts. Banning the known conversion factors everywhere
      // else catches the copy-pasted-constant version of this mistake -
      // the most common way it actually happens.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=2.20462]',
          message: 'kg<->lb conversion factors only belong in domain/Weight.ts.',
        },
        {
          selector: 'Literal[value=0.45359237]',
          message: 'kg<->lb conversion factors only belong in domain/Weight.ts.',
        },
        {
          selector: 'Literal[value=2.54]',
          message: 'cm<->in conversion factors only belong in domain/Length.ts.',
        },
        {
          selector: 'Literal[value=0.393701]',
          message: 'cm<->in conversion factors only belong in domain/Length.ts.',
        },
      ],
    },
  },
  {
    name: 'gymtracker/unit-conversion-boundary-exemptions',
    files: ['domain/Weight.ts', 'domain/Length.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  prettierConfig,
];
