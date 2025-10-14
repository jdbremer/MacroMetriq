import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/utils/supabase';
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    preloadMeals();
  }, []);
  
  const preloadMeals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const dateStr = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dateStr);
    
    if (data) {
      const meals = data.map(m => ({
        id: m.id,
        name: m.name,
        hour: m.hour,
        calories: Number(m.calories),
        protein: Number(m.protein),
        carbs: Number(m.carbs),
        fiber: Number(m.fiber),
        sugars: Number(m.sugars),
        totalFat: Number(m.total_fat),
        saturatedFat: Number(m.saturated_fat),
        transFat: Number(m.trans_fat),
        unsaturatedFat: Number(m.unsaturated_fat),
      }));
      
      const totals = meals.reduce((acc, meal) => ({
        calories: acc.calories + meal.calories,
        protein: acc.protein + meal.protein,
        carbs: acc.carbs + meal.carbs,
      }), { calories: 0, protein: 0, carbs: 0 });
      
      await AsyncStorage.setItem(`meals_${user.id}_${dateStr}`, JSON.stringify(meals));
      await AsyncStorage.setItem('mealTotals', JSON.stringify(totals));
    }
  };

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="account-settings" options={{ headerShown: false }} />
        <Stack.Screen name="recipes" options={{ headerShown: false }} />
        <Stack.Screen name="recipe-builder" options={{ headerShown: false }} />
        <Stack.Screen name="goals" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
