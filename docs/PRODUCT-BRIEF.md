# GymTracker - Product Brief (source of truth from stakeholder)

Working name: GymTracker.

This document is the original product and technical brief provided by the
project owner. It is the primary input for architecture planning. Where this
brief is explicit (tech stack, offline-only, no backend, dark mode only), that
decision is final and should not be re-opened during architecture discovery -
architecture-agent should validate it against real constraints and fill in
what the brief leaves open (exact schema, module boundaries, navigation
graph, component inventory, sync-readiness interfaces), not replace it.

## Mission

Build a production-quality mobile application that could realistically be
published on Google Play and the Apple App Store. Not a demo app.

Core focus: the fastest and simplest workout logging experience possible.
A user must be able to log a set in 2-3 seconds.

The project must be clean, modular, scalable, and easy to maintain.

## General rules

- Never create placeholder code.
- Never leave TODOs.
- Never simplify features unless explicitly requested.
- Build production-quality code.
- Use strict TypeScript. Avoid `any`.
- Use reusable components.
- Follow SOLID principles where appropriate.
- Prefer composition over inheritance.
- Keep files reasonably small.
- Separate business logic from UI.
- Build everything feature-by-feature; every feature complete before moving on.

## Tech stack (fixed, do not change)

- React Native
- Expo
- TypeScript (strict)
- Expo Router
- Zustand
- TanStack Query
- Expo SQLite
- React Hook Form
- Zod
- MMKV
- FlashList
- React Native Reanimated
- Gesture Handler
- Victory Native (or another actively maintained chart library - open to
  architecture-agent's recommendation if Victory Native has maintenance
  concerns, but must be justified)
- React Native SVG
- Expo Notifications
- Expo Haptics
- Expo FileSystem
- NativeWind

## Architecture

Clean Architecture. Modular, feature-based structure. Example top-level
folders: app/, assets/, components/, database/, features/, hooks/,
navigation/, repositories/, services/, stores/, theme/, types/, utils/.

Each feature should contain: components, hooks, screens, services, types,
repository.

## Application style

Dark mode ONLY. Minimalistic, modern, premium. Inspired by Hevy, Strong,
Apple Fitness, Linear, Notion.

Colors:
- Primary background: almost black
- Cards: dark gray
- Text: white
- Secondary text: gray
- Accent color: subtle only (blue or green)

Large rounded corners. Soft shadows where appropriate. Beautiful spacing.
Native feeling. Smooth animations. No unnecessary visual clutter.

## Onboarding

No authentication. No backend. No account creation. No cloud. Offline only.

First launch: user chooses a nickname and optional avatar. Stored locally.

## Database

Primary database: SQLite. Everything must work offline. Prepare repository
interfaces for future synchronization. Do NOT implement a backend.

## Home screen

Show: current workout plan, Quick Start, last workout, training streak,
latest personal record, weekly summary.

## Workout plans

Unlimited workout plans (e.g. Upper Lower, Push Pull Legs, Arnold Split,
Powerlifting, Full Body, 5x5). Each plan contains unlimited workout days
(e.g. Upper A, Upper B, Lower A, Lower B, Push, Pull, Legs).

Flow: Workout Plan -> choose day (e.g. Upper A) -> Start Workout.

The plan never expires; it is reused indefinitely.

Allow: duplicate plan, duplicate day, rename, delete, reorder (drag & drop).

## Exercise database

Use the Free Exercise DB (open source, GitHub). Each exercise contains:
English name, Polish name (if a common translation exists - otherwise show
English only), thumbnail, gallery, instructions, primary muscles, secondary
muscles, equipment, difficulty, body part.

Display convention: "Bench Press (Wyciskanie sztangi lezac)" when a common
Polish name exists, otherwise just "Bench Press".

## Videos

Every exercise should include multiple YouTube video URLs (not embedded
downloads) for technique reference, e.g. from Jeff Nippard, Renaissance
Periodization, Jeremy Ethier, Squat University, Athlean-X.

## Search

Instant search by exercise name, muscle, equipment, body part, favorites,
gym/home equipment context.

## Exercise details screen

Name, Polish translation (if available), images, instructions, equipment,
primary muscles, secondary muscles, videos, previous workout, personal
record, progress chart, notes.

## Custom exercises

Allow user-created exercises: name, muscle group, equipment, notes.

## Favorites

Allow starring exercises. Favorites appear first in lists.

## Workout screen (most important screen)

Design for one-hand usage. Large buttons. Minimal taps.

Each exercise displays: previous workout, previous best, current sets,
weight, reps, optional RPE, completed state.

Each completed set automatically: starts the rest timer, saves immediately,
triggers haptic feedback.

## Set types

Warm-up, Normal, Drop Set, Failure, Superset, Assisted, Partial.

## Adding sets

Automatically duplicate previous values (e.g. Set 1: 80kg x8 -> New Set
pre-filled 80kg x8; user only edits if necessary).

Quick adjustment buttons: +1 rep, -1 rep, +1.25kg, +2.5kg, +5kg, +10kg. Avoid
typing whenever possible.

## Rest timer

Automatic; starts after completing a set. Configurable globally and
per-exercise. Support sound, vibration, and notifications.

## Progressive overload

Always display: previous weight, previous reps, best weight, best reps,
estimated next progression.

## Notes

Exercise notes and workout notes.

## Workout summary

After finishing a workout, show: duration, exercises, sets, volume,
estimated calories (optional), new PRs.

## Statistics

Beautiful charts. Show: workout frequency, workout duration, training
volume, exercise progression, estimated 1RM, personal records, muscle group
volume, monthly statistics, yearly statistics.

## Body measurements

Track: weight, body fat, chest, waist, neck, arms, forearms, thighs, calves,
progress photos, history.

## Calendar

Monthly calendar showing completed workouts, workout duration, volume,
which workout day was used.

## Data

Auto-save everything. Support CSV export, JSON export, CSV import, JSON
import.

## Settings

Nickname, avatar, units (kg/lbs, cm/in), timer defaults, export, import.

## Performance

Optimize for very large workout histories: FlashList, memoization, lazy
loading, avoid unnecessary renders.

## Gestures

Swipe left: delete set. Swipe right: edit set. Drag: reorder exercises.

## UX principles

Every action should require as few taps as possible. Avoid modal spam.
Avoid confirmation dialogs unless the action is destructive. Auto-save
frequently. If the application closes unexpectedly, the in-progress workout
must be recoverable.

## Delivery process required by stakeholder

Before any code is written, the stakeholder wants an accepted architecture
package covering: complete architecture, SQLite schema, repositories,
navigation, folder structure, reusable UI components, theming system, data
models, and a written explanation of architectural decisions. Implementation
then proceeds feature-by-feature, one complete and production-ready feature
at a time, with a Git commit (Conventional Commits: feat:, fix:, refactor:,
chore:) after every completed feature. Git usage must never be skipped.
