# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MacroMetriq is a React Native mobile app built with Expo for tracking nutrition and fitness. The app uses Supabase for backend services and includes 3D visualization features for fitness tracking.

## Key Commands

### Development
- `npm install` - Install dependencies
- `npm start` or `npx expo start` - Start Expo development server
- `npm run ios` - Run on iOS simulator
- `npm run android` - Run on Android emulator
- `npm run web` - Run web version
- `npm run lint` - Run ESLint

### iOS Development
- Pod dependencies are managed in `ios/Podfile`
- After adding native modules, run `cd ios && pod install`

## Architecture

### Routing
- Uses Expo Router with file-based routing
- Main entry point: `index.js` (loads polyfills before Expo Router)
- Root layout: `app/_layout.tsx` (handles auth, theme, navigation stack)
- Tab-based navigation in `app/(tabs)/` for main screens (dashboard, meals, fitness, more)
- Modal/stack screens at `app/` root level (login, recipes, account-settings, goals)

### Authentication & Data
- Supabase client configured in `utils/supabase.ts`
- Uses AsyncStorage for session persistence on mobile (web uses default localStorage)
- Database tables: `meals`, `goals`, `daily_goals`
- Meal data is cached in AsyncStorage with key pattern: `meals_{userId}_{date}`
- Daily goals are snapshotted per day to preserve historical goal changes

### State Management
- Uses React hooks and local state
- AsyncStorage for offline caching and performance optimization
- Meal totals preloaded in `app/_layout.tsx` on app start
- Dashboard polls for updates every 2 seconds and loads from cache first

### Polyfills & Compatibility
- `utils/polyfills.ts` provides Base64 (atob/btoa) and TextEncoder/TextDecoder for React Native
- Polyfills imported at top of `index.js` and `app/(tabs)/fitness.tsx` before other modules
- Required for GLTFLoader and Supabase compatibility in React Native

### 3D Rendering (Fitness Screen)
- Uses `@react-three/fiber` for 3D rendering with Three.js
- GLTF model loading via `three-stdlib/GLTFLoader`
- Custom camera controls with pan, zoom, and rotation gestures
- Metro bundler configured to handle `.glb`, `.gltf`, `.bin`, `.ktx2` assets
- Model normalization ensures consistent sizing across different GLB files

### UI Components
- Theme-aware components in `components/` (ThemedText, ThemedView)
- Custom ProgressBar component for macro tracking with animated circular progress
- BarcodeScanner component for food barcode scanning
- Dark mode support via `@react-navigation/native` theming

### Platform-Specific Code
- Camera permissions configured in `app.json` for iOS/Android
- Health data integration via `react-native-health` (iOS only)
- Vision Camera setup for barcode scanning

## Important Implementation Details

### Adding New Features
- Paths use `@/*` alias (tsconfig.json) - maps to project root
- File naming: screens use PascalCase (e.g., `dashboard.tsx`), utilities use camelCase
- Always import polyfills first in files using Base64 or 3D features

### Database Schema
- User-specific data filtered by `user_id` from Supabase auth
- Meals include: calories, protein, carbs, fiber, sugars, total_fat, saturated_fat, trans_fat, unsaturated_fat
- Date fields use ISO format: `YYYY-MM-DD`

### Performance Considerations
- Meal data cached in AsyncStorage to avoid repeated Supabase queries
- Dashboard uses cache-first loading strategy
- 3D models normalized on load to standard size for consistent performance
