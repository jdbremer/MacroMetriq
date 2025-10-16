# MacroMetriq

A comprehensive nutrition tracking mobile app built with React Native and Expo that helps users log meals, track macros, scan barcodes, create recipes, and visualize fitness progress with 3D models.

## Features

- **Meal Tracking**: Log meals with detailed nutrition information (calories, protein, carbs, fiber, sugars, fats)
- **Food Search**: Search the USDA FoodData Central database with 350,000+ foods
- **Barcode Scanning**: Scan product barcodes using OpenFoodFacts API
- **Recipe Builder**: Create custom recipes with multiple ingredients
- **Meal History**: Quick access to previously logged foods
- **3D Fitness Visualization**: Interactive 3D body model viewer with gesture controls
- **User Authentication**: Secure login/signup with Supabase
- **Offline Support**: Local caching with AsyncStorage

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or later) - [Download here](https://nodejs.org/)
- **npm** or **yarn** package manager
- **Expo CLI**: `npm install -g expo-cli`
- **iOS Development** (Mac only):
  - Xcode (latest version from App Store)
  - CocoaPods: `sudo gem install cocoapods`
  - iOS Simulator (included with Xcode)
- **Android Development**:
  - Android Studio
  - Android SDK
  - Android Emulator (configured via Android Studio)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd macrometriq
```

### 2. Install Dependencies

```bash
npm install
```

**Note**: This project uses native modules (Three.js, react-native-gesture-handler, react-native-reanimated) that require a **development build**. You cannot use Expo Go for this app.

### 3. Install Git Hooks

```bash
bash scripts/install-hooks.sh
```

This installs a pre-commit hook that automatically resets bundle identifiers to defaults before commits.

### 4. Install iOS Dependencies (Mac only)

```bash
cd ios
pod install
cd ..
```

### 5. Set Up Environment Variables

Create a `.env` file in the root directory (or update `utils/supabase.ts` directly):

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

To get these credentials:
1. Create a free account at [Supabase](https://supabase.com)
2. Create a new project
3. Go to Project Settings > API
4. Copy the "Project URL" and "anon/public" key

### 6. Configure Database Schema

In your Supabase project, run these SQL commands in the SQL Editor:

```sql
-- Create meals table
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date TEXT NOT NULL,
  meal_name TEXT NOT NULL,
  meal_type TEXT,
  calories NUMERIC DEFAULT 0,
  protein NUMERIC DEFAULT 0,
  carbs NUMERIC DEFAULT 0,
  fiber NUMERIC DEFAULT 0,
  sugars NUMERIC DEFAULT 0,
  total_fat NUMERIC DEFAULT 0,
  saturated_fat NUMERIC DEFAULT 0,
  trans_fat NUMERIC DEFAULT 0,
  unsaturated_fat NUMERIC DEFAULT 0,
  serving_multiplier NUMERIC DEFAULT 1,
  gram_weight NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recipes table
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  ingredients JSONB NOT NULL,
  calories NUMERIC DEFAULT 0,
  protein NUMERIC DEFAULT 0,
  carbs NUMERIC DEFAULT 0,
  fiber NUMERIC DEFAULT 0,
  sugars NUMERIC DEFAULT 0,
  total_fat NUMERIC DEFAULT 0,
  saturated_fat NUMERIC DEFAULT 0,
  trans_fat NUMERIC DEFAULT 0,
  unsaturated_fat NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own meals"
  ON meals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meals"
  ON meals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meals"
  ON meals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meals"
  ON meals FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own recipes"
  ON recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipes"
  ON recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipes"
  ON recipes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipes"
  ON recipes FOR DELETE
  USING (auth.uid() = user_id);
```

### 7. Add USDA API Key (Optional but Recommended)

The app uses the USDA FoodData Central API for food search. The code includes a demo key, but you should get your own:

1. Request a free API key at [USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup.html)
2. Update the key in `app/(tabs)/meals.tsx` (search for `apiKey` variable)

### 8. Add 3D Model File

Place your GLB 3D model file at:
```
assets/models/model.glb
```

This is used by the Fitness screen (`app/(tabs)/fitness.tsx`). If you don't have a model, you can use any GLB file or comment out the Fitness tab.

## Running the App

Since this app uses native modules, you must create a development build:

### iOS (Mac only)

```bash
# Build and run on iOS simulator
npx expo run:ios

# Or build for physical device
npx expo run:ios --device
```

### Android

```bash
# Build and run on Android emulator
npx expo run:android

# Or build for physical device
npx expo run:android --device
```

### Development Server

After the initial build, you can start the development server:

```bash
npx expo start
```

Then press `i` for iOS or `a` for Android to launch the app on your previously built development build.

## Project Structure

```
macrometriq/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Tab navigation
│   │   ├── fitness.tsx       # 3D model viewer
│   │   ├── index.tsx         # Dashboard
│   │   └── meals.tsx         # Meal tracking (main screen)
│   ├── login.tsx             # Authentication
│   ├── recipe-builder.tsx    # Recipe creation/editing
│   ├── recipes.tsx           # Recipe list
│   └── _layout.tsx           # Root layout
├── assets/
│   └── models/
│       └── model.glb         # 3D body model
├── components/
│   ├── ThemedText.tsx
│   └── ThemedView.tsx
├── utils/
│   ├── supabase.ts           # Supabase client
│   └── polyfills.ts          # Three.js polyfills
├── ios/                      # iOS native code
├── android/                  # Android native code
└── package.json
```

## Key Technologies

- **React Native** with **Expo** (SDK 52)
- **TypeScript** for type safety
- **Expo Router** for file-based navigation
- **Supabase** for backend and authentication
- **@react-three/fiber** for 3D rendering
- **Three.js** for 3D graphics
- **react-native-gesture-handler** for touch gestures
- **react-native-reanimated** for animations
- **AsyncStorage** for local caching
- **USDA FoodData Central API** for food database
- **OpenFoodFacts API** for barcode scanning

## Troubleshooting

### "Cannot use Expo Go" Error
This app requires native modules and cannot run in Expo Go. You must build a development build using `npx expo run:ios` or `npx expo run:android`.

### Pod Install Fails (iOS)
```bash
cd ios
pod deintegrate
pod install
cd ..
```

### Metro Bundler Issues
```bash
# Clear cache and restart
npx expo start --clear
```

### Three.js "global is not defined" Error
Make sure `utils/polyfills.ts` is imported at the top of `app/(tabs)/fitness.tsx`:
```typescript
import '../../utils/polyfills';
```

### Supabase Connection Error
- Verify your `.env` file or `utils/supabase.ts` has correct credentials
- Check Supabase project is active
- Ensure database tables are created with proper RLS policies

### USDA API Rate Limit
The free USDA API key has rate limits. If you hit them:
- Wait a few minutes
- Get your own API key for higher limits
- Implement request throttling

### Android Build Fails
```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

## API Keys Used

- **USDA FoodData Central**: Food nutrition database (get your key at https://fdc.nal.usda.gov/api-key-signup.html)
- **OpenFoodFacts**: Barcode scanning (free, no key required)
- **Supabase**: Backend and authentication (get from your Supabase project)

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]
