# GymTracker

GymTracker is an offline-only workout logging app for iOS and Android, built with React
Native and Expo. There is no backend, no account system, and no cloud sync - all data
lives on the device. The app is dark-mode only and is designed around one core promise:
logging a set should take 2-3 seconds. Bundle identifier:
`com.konradmalinowski.gymtracker`. Minimum OS: iOS 15+, Android 8 / API 26+.

The project is at the P0 (project foundation) phase of its roadmap: the scaffold,
tooling, and CI are in place, but no feature screens exist yet. See
[docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Prerequisites

- Node 24.x (matches the version pinned in `.github/workflows/ci.yml`; no `.nvmrc` is
  committed yet, so install this manually if you use nvm/fnm/volta)
- npm (the project's package manager - do not use yarn or pnpm, there is no lockfile
  for them)
- Expo CLI - no global install needed, `npx expo` is used throughout and via the npm
  scripts below
- EAS CLI (`npm install -g eas-cli`) - only required if you're building through EAS
  (`eas build`); not needed for local development. You'll need `eas login` before
  any EAS command will work.
- Xcode (for iOS Simulator) and/or Android Studio with an emulator configured (for
  Android), or the Expo Go app on a physical device for a quick start without either

## Install

```bash
npm ci
```

Use `npm ci`, not `npm install` - it installs exactly what's in `package-lock.json`.
The project has `legacy-peer-deps=true` set in `.npmrc` (a peer conflict from
expo-router's optional web-preview dependencies, irrelevant to this mobile-only app).

## Run

```bash
npm start        # start the Metro dev server, then choose a platform interactively
npm run ios      # start and open in the iOS Simulator
npm run android  # start and open in an Android emulator
```

Scan the QR code from `npm start` with the Expo Go app to run on a physical device
instead.

## Scripts

| Script                 | What it does                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `npm run typecheck`    | `tsc --noEmit` - strict mode, no unchecked indexed access                                |
| `npm run lint`         | ESLint over the whole project, including the architecture-layering rules (see CLAUDE.md) |
| `npm run format`       | Prettier, writes changes                                                                 |
| `npm run format:check` | Prettier, check only (what CI runs)                                                      |
| `npm test`             | Jest once                                                                                |
| `npm run test:watch`   | Jest in watch mode                                                                       |
| `npm run test:ci`      | Jest with coverage, non-interactive (what CI runs)                                       |
| `npm run doctor`       | `expo-doctor` - checks the Expo project config and dependency compatibility              |
| `npm run audit:ci`     | `npm audit --audit-level=high` (what CI runs)                                            |

All of these run in CI on every push and PR to `main` (`.github/workflows/ci.yml`).

## Commit convention

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, etc. - see `commitlint.config.js` for the full
allowed type list and the 120-character header limit). This isn't just a style
guideline: a Husky `commit-msg` hook runs `commitlint` on every commit and **rejects
the commit outright** if the message doesn't conform. A `pre-commit` hook also runs
`lint-staged` (ESLint + Prettier on staged files) before a commit is allowed through.
If a commit fails either hook, fix the message or the flagged files and commit again -
there's no way to proceed with a non-conforming commit short of `--no-verify`, which
should not be used.

## Architecture

This README covers how to run the project. For how it's built and why - the layering
rules, the folder structure, the module dependency graph, the data model, and the
reasoning behind the major technical decisions - see:

- [CLAUDE.md](CLAUDE.md) - the condensed reference every contributor or agent should
  read before touching the codebase
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - the full architecture document
- [docs/ROADMAP.md](docs/ROADMAP.md) - the phased build plan
- [docs/adr/](docs/adr/) - individual architecture decision records
