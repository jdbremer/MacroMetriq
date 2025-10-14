import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ProgressBar } from '@/components/ProgressBar';
import { supabase } from '@/utils/supabase';
import BarcodeScanner from '@/components/BarcodeScanner';

interface NutritionData {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  sugars: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  unsaturatedFat: number;
}

interface RecentFood extends NutritionData {
  servingMultiplier: number;
}

interface Meal extends NutritionData {
  id: string;
  hour: number;
}

// OpenFoodFacts product subset
type OFFProduct = {
  product_name?: string;
  brands?: string;
  generic_name?: string;
  serving_size?: string;
  nutriments?: Record<string, any>;
};

const mapOpenFoodFactsToForm = (p: OFFProduct): NutritionData => {
  const n = p?.nutriments ?? {};

  // Prefer per-serving if available, otherwise fall back to per-100g
  const pick = (keyServing: string, key100g: string) => {
    const val = n[keyServing] ?? n[key100g] ?? 0;
    // Ensure number and round to 1 decimal where applicable
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number((isNaN(num) ? 0 : num).toFixed(1));
  };

  // kcal: use energy-kcal_* first, else convert from kJ if present
  const energyServing = n['energy-kcal_serving'] ?? (n['energy_serving'] ? n['energy_serving'] / 4.184 : undefined);
  const energy100g = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : undefined);
  const kcal = Math.round(
      (typeof energyServing === 'number' ? energyServing :
          typeof energy100g === 'number' ? energy100g : 0) || 0
  );

  const name = (p?.product_name?.trim() || p?.generic_name?.trim() || (p?.brands ? `${p.brands} (Unknown Product)` : 'Unknown Product'));

  return {
    name,
    calories: kcal,
    protein: pick('proteins_serving', 'proteins_100g'),
    carbs: pick('carbohydrates_serving', 'carbohydrates_100g'),
    fiber: pick('fiber_serving', 'fiber_100g'),
    sugars: pick('sugars_serving', 'sugars_100g'),
    totalFat: pick('fat_serving', 'fat_100g'),
    saturatedFat: pick('saturated-fat_serving', 'saturated-fat_100g'),
    transFat: pick('trans-fat_serving', 'trans-fat_100g'),
    unsaturatedFat: Number(
        (
            (n['monounsaturated-fat_serving'] ?? n['monounsaturated-fat_100g'] ?? 0) +
            (n['polyunsaturated-fat_serving'] ?? n['polyunsaturated-fat_100g'] ?? 0)
        ).toFixed?.(1) ?? 0
    ),
  };
};

export default function MealsScreen() {
  const insets = useSafeAreaInsets();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedHour, setSelectedHour] = useState(0);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [nutritionForm, setNutritionForm] = useState<NutritionData>({
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fiber: 0,
    sugars: 0,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    unsaturatedFat: 0,
  });
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [foodHistory, setFoodHistory] = useState<RecentFood[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [baseNutrition, setBaseNutrition] = useState<NutritionData | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [goals, setGoals] = useState<{ calories: number; protein: number; carbs: number; fats: number; created_at: string } | null>(null);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [nutritionModalVisible, setNutritionModalVisible] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMounted = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasScrolled = useRef(false);
  const [mealsLoaded, setMealsLoaded] = useState(false);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  
  useFocusEffect(
    useCallback(() => {
      setAnimKey(prev => prev + 1);
    }, [])
  );
  
  // Pre-compute date strings and current hour
  const selectedDateStr = useMemo(() => selectedDate.toISOString().split('T')[0], [selectedDate]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentHour = useMemo(() => new Date().getHours(), []);
  const isToday = selectedDateStr === todayStr;

  useEffect(() => {
    // Batch state updates
    setMealsLoaded(false);
    setLoadedDate(null);
    
    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      loadMeals();
      loadGoals();
    });
  }, [selectedDateStr]);

  useEffect(() => {
    loadFoodHistory();
    loadRecipes();
  }, []);

  useEffect(() => {
    if (!hasScrolled.current && scrollViewRef.current && isToday && meals.length > 0) {
      // Use InteractionManager for better performance
      InteractionManager.runAfterInteractions(() => {
        const hourRowHeight = 60;
        const screenHeight = 800;
        const targetY = (currentHour * hourRowHeight) - (screenHeight / 2) + (hourRowHeight / 2);
        scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
        hasScrolled.current = true;
      });
    }
  }, [meals, isToday, currentHour]);

  const loadMeals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cacheKey = `meals_${user.id}_${selectedDateStr}`;

    // Load from cache first and update UI immediately
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const cachedMeals = JSON.parse(cached);
      setMeals(cachedMeals);
      setMealsLoaded(true);
      setLoadedDate(selectedDateStr);
    } else {
      setMeals([]);
      setMealsLoaded(true);
      setLoadedDate(selectedDateStr);
    }

    // Sync with database in background
    const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', selectedDateStr);

    if (error) {
      console.error('Error loading meals:', error);
      return;
    }

    if (data) {
      const meals = data.map(m => ({
        id: m.id,
        name: m.name,
        hour: m.hour,
        calories: Math.round(Number(m.calories)),
        protein: Math.round(Number(m.protein)),
        carbs: Math.round(Number(m.carbs)),
        fiber: Math.round(Number(m.fiber)),
        sugars: Math.round(Number(m.sugars)),
        totalFat: Math.round(Number(m.total_fat)),
        saturatedFat: Math.round(Number(m.saturated_fat)),
        transFat: Math.round(Number(m.trans_fat)),
        unsaturatedFat: Math.round(Number(m.unsaturated_fat)),
      }));
      
      // Only update if data changed
      if (JSON.stringify(meals) !== cached) {
        setMeals(meals);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(meals));
      }
    }
  };

  const loadFoodHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cacheKey = `recent_foods_${user.id}`;

    // Load from cache first
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      setFoodHistory(JSON.parse(cached));
    }

    const { data, error } = await supabase
        .from('recent_foods')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error) {
      console.error('Error loading food history:', error);
      return;
    }

    if (data) {
      const foods = data.map(f => ({
        name: f.name,
        calories: Number(f.calories),
        protein: Number(f.protein),
        carbs: Number(f.carbs),
        fiber: Number(f.fiber),
        sugars: Number(f.sugars),
        totalFat: Number(f.total_fat),
        saturatedFat: Number(f.saturated_fat),
        transFat: Number(f.trans_fat),
        unsaturatedFat: Number(f.unsaturated_fat),
        servingMultiplier: Number(f.serving_multiplier),
      }));
      setFoodHistory(foods);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(foods));
    }
  };

  const loadRecipes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cacheKey = `recipes_${user.id}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      setRecipes(parsedCache);
    }

    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

    if (error) {
      console.error('Error loading recipes:', error);
      return;
    }

    if (data) {
      const recipes = data.map(r => ({
        ...r,
        ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients
      }));
      setRecipes(recipes);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(recipes));
    }
  };

  const loadGoals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if daily goals snapshot exists for this date
    const { data: dailyGoals } = await supabase
        .from('daily_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', selectedDateStr)
        .single();

    if (dailyGoals) {
      setGoals(dailyGoals);
      return;
    }

    // Only for today or future dates, check current goals and create snapshot
    if (isToday || selectedDateStr > todayStr) {
      const { data: currentGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .single();

      if (currentGoals) {
        // Create snapshot and set goals
        await supabase
            .from('daily_goals')
            .insert({
              user_id: user.id,
              date: selectedDateStr,
              calories: currentGoals.calories,
              protein: currentGoals.protein,
              carbs: currentGoals.carbs,
              fats: currentGoals.fats,
            })
            .select()
            .single();
        setGoals(currentGoals);
      } else {
        setGoals(null);
      }
    } else {
      // Past dates without snapshots have no goals
      setGoals(null);
    }
  };


  const params = useLocalSearchParams();

  useEffect(() => () => { isMounted.current = false; }, []);

  useEffect(() => {
    if (params.openModal === 'true') {
      setSelectedHour(currentHour);
      setModalVisible(true);
    }
  }, [params.openModal, currentHour]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Optimize daily totals calculation
  const dailyTotals = useMemo(() => {
    if (meals.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, saturatedFat: 0, transFat: 0, unsaturatedFat: 0 };
    }
    
    let calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, sugars = 0, saturatedFat = 0, transFat = 0, unsaturatedFat = 0;
    
    for (const meal of meals) {
      calories += meal.calories;
      protein += meal.protein;
      carbs += meal.carbs;
      fat += meal.totalFat;
      fiber += meal.fiber;
      sugars += meal.sugars;
      saturatedFat += meal.saturatedFat;
      transFat += meal.transFat;
      unsaturatedFat += meal.unsaturatedFat;
    }
    
    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      fiber: Math.round(fiber),
      sugars: Math.round(sugars),
      saturatedFat: Math.round(saturatedFat),
      transFat: Math.round(transFat),
      unsaturatedFat: Math.round(unsaturatedFat),
    };
  }, [meals]);

  useEffect(() => {
    if (isToday) {
      AsyncStorage.setItem('mealTotals', JSON.stringify(dailyTotals));
    }
  }, [dailyTotals, isToday]);

  // Memoize date formatting
  const formatDate = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();
    const tomorrowStr = tomorrow.toDateString();
    
    return (date: Date) => {
      const dateStr = date.toDateString();
      if (dateStr === todayStr) return 'Today';
      if (dateStr === yesterdayStr) return 'Yesterday';
      if (dateStr === tomorrowStr) return 'Tomorrow';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
  }, []);

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    
    // Batch state updates to prevent multiple re-renders
    requestAnimationFrame(() => {
      setSelectedDate(newDate);
      hasScrolled.current = false; // Reset scroll flag for new date
    });
  };

  // Optimize meals by hour grouping
  const mealsByHour = useMemo(() => {
    if (meals.length === 0) return {};
    
    const byHour: Record<number, Meal[]> = {};
    for (const meal of meals) {
      const hour = meal.hour;
      if (!byHour[hour]) byHour[hour] = [];
      byHour[hour].push(meal);
    }
    return byHour;
  }, [meals]);

  const getMealsForHour = (hour: number) => mealsByHour[hour] || [];

  const addMeal = async () => {
    if (!nutritionForm.name.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const dateStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('meals')
        .insert({
          user_id: user.id,
          name: nutritionForm.name,
          date: dateStr,
          hour: selectedHour,
          calories: Math.round(nutritionForm.calories),
          protein: Math.round(nutritionForm.protein),
          carbs: Math.round(nutritionForm.carbs),
          fiber: Math.round(nutritionForm.fiber),
          sugars: Math.round(nutritionForm.sugars),
          total_fat: Math.round(nutritionForm.totalFat),
          saturated_fat: Math.round(nutritionForm.saturatedFat),
          trans_fat: Math.round(nutritionForm.transFat),
          unsaturated_fat: Math.round(nutritionForm.unsaturatedFat),
        })
        .select()
        .single();

    if (error) {
      Alert.alert('Error', 'Failed to save meal');
      return;
    }

    if (data) {
      // Only add to local state if viewing today
      if (isToday) {
        setMeals(prev => [...prev, {
          id: data.id,
          name: data.name,
          hour: data.hour,
          calories: Number(data.calories),
          protein: Number(data.protein),
          carbs: Number(data.carbs),
          fiber: Number(data.fiber),
          sugars: Number(data.sugars),
          totalFat: Number(data.total_fat),
          saturatedFat: Number(data.saturated_fat),
          transFat: Number(data.trans_fat),
          unsaturatedFat: Number(data.unsaturated_fat),
        }]);
      }

      // Add to recent foods (upsert)
      await supabase
          .from('recent_foods')
          .upsert({
            user_id: user.id,
            name: nutritionForm.name,
            calories: nutritionForm.calories,
            protein: nutritionForm.protein,
            carbs: nutritionForm.carbs,
            fiber: nutritionForm.fiber,
            sugars: nutritionForm.sugars,
            total_fat: nutritionForm.totalFat,
            saturated_fat: nutritionForm.saturatedFat,
            trans_fat: nutritionForm.transFat,
            unsaturated_fat: nutritionForm.unsaturatedFat,
            serving_multiplier: servingMultiplier,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,name' });

      loadFoodHistory();
    }

    resetModal();
  };

  const updateMeal = async () => {
    if (!editingMeal || !nutritionForm.name.trim()) return;

    const { error } = await supabase
        .from('meals')
        .update({
          name: nutritionForm.name,
          calories: Math.round(nutritionForm.calories),
          protein: Math.round(nutritionForm.protein),
          carbs: Math.round(nutritionForm.carbs),
          fiber: Math.round(nutritionForm.fiber),
          sugars: Math.round(nutritionForm.sugars),
          total_fat: Math.round(nutritionForm.totalFat),
          saturated_fat: Math.round(nutritionForm.saturatedFat),
          trans_fat: Math.round(nutritionForm.transFat),
          unsaturated_fat: Math.round(nutritionForm.unsaturatedFat),
        })
        .eq('id', editingMeal.id);

    if (error) {
      Alert.alert('Error', 'Failed to update meal');
      return;
    }

    setMeals(prev => prev.map(m =>
        m.id === editingMeal.id ? { ...nutritionForm, id: m.id, hour: m.hour } : m
    ));
    loadFoodHistory();
    setEditModalVisible(false);
    setEditingMeal(null);
    setServingMultiplier(1);
    setBaseNutrition(null);
    resetForm();
  };

  const deleteMeal = async (id: string) => {
    const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', id);

    if (error) {
      Alert.alert('Error', 'Failed to delete meal');
      return;
    }

    setMeals(prev => prev.filter(m => m.id !== id));
    setEditModalVisible(false);
    setEditingMeal(null);
    setServingMultiplier(1);
    setBaseNutrition(null);
  };

  const resetModal = () => {
    setModalVisible(false);
    setShowManualForm(false);
    setShowHistory(false);
    setShowRecipes(false);
    setShowSearch(false);
    setSearchResults([]);
    setSearchQuery('');
    setServingMultiplier(1);
    setBaseNutrition(null);
    setLoading(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    resetForm();
  };

  const resetForm = () => {
    setNutritionForm({
      name: '',
      calories: 0,
      protein: 0,
      carbs: 0,
      fiber: 0,
      sugars: 0,
      totalFat: 0,
      saturatedFat: 0,
      transFat: 0,
      unsaturatedFat: 0,
    });
  };

  // Memoize hour formatting
  const formatHour = useMemo(() => {
    const hourCache: Record<number, string> = {};
    for (let i = 0; i < 24; i++) {
      const period = i >= 12 ? 'PM' : 'AM';
      const displayHour = i === 0 ? 12 : i > 12 ? i - 12 : i;
      hourCache[i] = `${displayHour}:00 ${period}`;
    }
    return (hour: number) => hourCache[hour];
  }, []);

  // --- OpenFoodFacts helpers ----------------------------------------------------
  const OFF_BASES = [
    'https://world.openfoodfacts.org/api/v2/product',
    'https://world.openfoodfacts.org/api/v0/product',
  ] as const;

// Build a few candidate barcodes that OFF might store for the same item
  const buildBarcodeCandidates = (code: string): string[] => {
    const c = (code || '').replace(/[^0-9]/g, '');
    const candidates = new Set<string>();
    if (!c) return [];
    candidates.add(c);
    // OFF often stores UPC-A as EAN-13 with a leading 0
    if (c.length === 12) candidates.add('0' + c);
    // Also try stripping a single leading 0 in case we scanned EAN-13 for a UPC-A item
    if (c.length === 13 && c.startsWith('0')) candidates.add(c.slice(1));
    // Keep the original order preference
    return Array.from(candidates);
  };

  const offFetch = async (barcode: string, controller: AbortController) => {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      // OFF asks for a descriptive UA; some infra rejects generic defaults
      'User-Agent': 'EvolveApp/1.0 (contact: support@macrometriq.local)',
    };

    // Prefer v2 (newer), fall back to v0
    for (const base of OFF_BASES) {
      const url = `${base}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,generic_name,serving_size,nutriments`;
      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) continue;
        const json = await res.json();
        if (json?.status === 1 && json?.product) return json;
      } catch (e) {
        // swallow and try next base unless aborted
        if ((e as any)?.name === 'AbortError') throw e;
      }
    }
    return null;
  };
// ----------------------------------------------------------------------------

  const lookupBarcode = async (barcode: string) => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // abort only

    try {
      const candidates = buildBarcodeCandidates(barcode);
      let data: any = null;

      for (const cand of candidates) {
        data = await offFetch(cand, controller);
        if (data) break;
      }

      if (!isMounted.current) return;

      if (data?.status === 1 && data?.product) {
        const mapped = mapOpenFoodFactsToForm(data.product as OFFProduct);
        setNutritionForm(mapped);
        setBaseNutrition(mapped);
        setServingMultiplier(1);
        setSelectedHour((h) => (typeof h === 'number' ? h : new Date().getHours()));
        setShowManualForm(true);
        setLoading(false);
        setModalVisible(true);
      } else {
        setLoading(false);
        Alert.alert('Product not found', `No nutrition information for barcode ${barcode}.`);
        setModalVisible(true);
      }
    } catch (e: any) {
      if (!isMounted.current) return;
      setLoading(false);
      if (e?.name === 'AbortError') {
        Alert.alert('Timeout', 'Fetching product info took too long. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to fetch product information.');
      }
      setModalVisible(true);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const openScanner = () => {
    setModalVisible(false);
    setShowScanner(true);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setShowScanner(false);
    lookupBarcode(barcode);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    setModalVisible(true);
  };

  const openEditModal = (meal: Meal) => {
    setEditingMeal(meal);
    setNutritionForm({ ...meal });

    // Find base nutrition from history
    const historyItem = foodHistory.find(f => f.name === meal.name);
    if (historyItem) {
      const baseFood = {
        name: historyItem.name,
        calories: Math.round(historyItem.calories / historyItem.servingMultiplier),
        protein: Number((historyItem.protein / historyItem.servingMultiplier).toFixed(1)),
        carbs: Number((historyItem.carbs / historyItem.servingMultiplier).toFixed(1)),
        fiber: Number((historyItem.fiber / historyItem.servingMultiplier).toFixed(1)),
        sugars: Number((historyItem.sugars / historyItem.servingMultiplier).toFixed(1)),
        totalFat: Number((historyItem.totalFat / historyItem.servingMultiplier).toFixed(1)),
        saturatedFat: Number((historyItem.saturatedFat / historyItem.servingMultiplier).toFixed(1)),
        transFat: Number((historyItem.transFat / historyItem.servingMultiplier).toFixed(1)),
        unsaturatedFat: Number((historyItem.unsaturatedFat / historyItem.servingMultiplier).toFixed(1)),
      };
      setBaseNutrition(baseFood);
      const multiplier = baseFood.calories > 0 ? meal.calories / baseFood.calories : 1;
      setServingMultiplier(Number(multiplier.toFixed(2)));
    } else {
      setBaseNutrition(null);
      setServingMultiplier(1);
    }

    setEditModalVisible(true);
  };

  return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemedView style={styles.container}>
          <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
            <ThemedView style={styles.titleRow}>
              <TouchableOpacity
                  style={styles.actionsButton}
                  onPress={() => setActionsMenuOpen(!actionsMenuOpen)}
              >
                <ThemedText style={styles.actionsButtonText}>Actions</ThemedText>
              </TouchableOpacity>
              <ThemedText type="title" style={{ color: '#EAEAEA' }}>Meals</ThemedText>
              <ThemedView style={{ width: 80 }} />
            </ThemedView>
            {actionsMenuOpen && (
                <ThemedView style={styles.actionsMenu}>
                  <TouchableOpacity
                      style={styles.actionMenuItem}
                      onPress={() => {
                        setActionsMenuOpen(false);
                        setSelectedHour(currentHour);
                        setShowManualForm(false);
                        setShowHistory(false);
                        setShowRecipes(false);
                        setModalVisible(true);
                        loadRecipes();
                      }}
                  >
                    <ThemedText style={styles.actionMenuText}>Quick Add</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                      style={styles.actionMenuItem}
                      onPress={() => {
                        setActionsMenuOpen(false);
                        router.push('/recipes');
                      }}
                  >
                    <ThemedText style={styles.actionMenuText}>Recipes</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                      style={styles.actionMenuItem}
                      onPress={() => {
                        setActionsMenuOpen(false);
                        setNutritionModalVisible(true);
                      }}
                  >
                    <ThemedText style={styles.actionMenuText}>Nutrition</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
            )}
            <ThemedView style={styles.macroSummary}>
              <ThemedView style={styles.macroItem}>
                <ProgressBar key={`cal-${animKey}`} current={dailyTotals.calories} goal={goals?.calories || null} color="#FF9800" />
                <ThemedText style={styles.macroValue}>{dailyTotals.calories}</ThemedText>
                <ThemedText style={styles.macroLabel}>Calories</ThemedText>
              </ThemedView>
              <ThemedView style={styles.macroItem}>
                <ProgressBar key={`pro-${animKey}`} current={dailyTotals.protein} goal={goals?.protein || null} color="#F50057" />
                <ThemedText style={styles.macroValue}>{dailyTotals.protein}g</ThemedText>
                <ThemedText style={styles.macroLabel}>Protein</ThemedText>
              </ThemedView>
              <ThemedView style={styles.macroItem}>
                <ProgressBar key={`carb-${animKey}`} current={dailyTotals.carbs} goal={goals?.carbs || null} color="#76FF03" />
                <ThemedText style={styles.macroValue}>{dailyTotals.carbs}g</ThemedText>
                <ThemedText style={styles.macroLabel}>Carbs</ThemedText>
              </ThemedView>
              <ThemedView style={styles.macroItem}>
                <ProgressBar key={`fat-${animKey}`} current={dailyTotals.fat} goal={goals?.fats || null} color="#00E5FF" />
                <ThemedText style={styles.macroValue}>{dailyTotals.fat}g</ThemedText>
                <ThemedText style={styles.macroLabel}>Fat</ThemedText>
              </ThemedView>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.dateNavigation}>
            <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
              <ThemedText style={styles.dateArrowText}>‹</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCalendarVisible(true)}>
              <ThemedText style={styles.dateText}>{formatDate(selectedDate)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
              <ThemedText style={styles.dateArrowText}>›</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          <ScrollView ref={scrollViewRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {hours.map(hour => {
              const isCurrentHour = hour === currentHour && isToday && mealsLoaded && loadedDate === selectedDateStr;
              const hourMeals = getMealsForHour(hour);
              
              return (
                  <ThemedView key={hour} style={[styles.hourRow, isCurrentHour && styles.currentHourRow]}>
                    <ThemedView style={styles.timeSection}>
                      <ThemedText type="defaultSemiBold" style={[{ color: '#EAEAEA' }, isCurrentHour && styles.currentHourText]}>
                        {formatHour(hour)}
                      </ThemedText>
                    </ThemedView>

                    <ThemedView style={styles.mealsSection}>
                      {hourMeals.map((meal) => (
                          <Swipeable
                              key={meal.id}
                              renderRightActions={() => (
                                  <ThemedView style={styles.deleteActionContainer}>
                                    <TouchableOpacity
                                        style={styles.deleteAction}
                                        onPress={() => deleteMeal(meal.id)}
                                    >
                                      <ThemedText style={styles.deleteActionText}>🗑️</ThemedText>
                                    </TouchableOpacity>
                                  </ThemedView>
                              )}
                              overshootRight={false}
                              friction={2}
                          >
                            <TouchableOpacity
                                onPress={() => openEditModal(meal)}
                                activeOpacity={1}
                                onPressIn={(e) => setSwipeStartX(e.nativeEvent.pageX)}
                                onPressOut={(e) => {
                                  if (swipeStartX !== null && Math.abs(e.nativeEvent.pageX - swipeStartX) > 10) {
                                    e.preventDefault();
                                  }
                                  setSwipeStartX(null);
                                }}
                            >
                              <ThemedView style={styles.mealItem}>
                                <ThemedText style={{ color: '#EAEAEA' }}>{meal.name}</ThemedText>
                              </ThemedView>
                            </TouchableOpacity>
                          </Swipeable>
                      ))}
                    </ThemedView>

                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => {
                          setSelectedHour(hour);
                          setShowManualForm(false);
                          setShowHistory(false);
                          setShowRecipes(false);
                          setModalVisible(true);
                          loadRecipes();
                        }}
                    >
                      <ThemedText style={styles.addButtonText}>+</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
              );
            })}
          </ScrollView>

          <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={resetModal}>
            <ThemedView style={styles.modalOverlay}>
              <ScrollView style={styles.modalScrollView}>
                <ThemedView style={styles.modalContent}>
                  <ThemedView style={styles.modalHeader}>
                    <ThemedText type="subtitle" style={[styles.modalTitle, { color: '#EAEAEA' }]}>
                      Add meal for {formatHour(selectedHour)}
                    </ThemedText>
                    <TouchableOpacity onPress={resetModal} style={styles.closeButton}>
                      <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>

                  {loading && (
                      <ThemedText style={{ textAlign: 'center', marginBottom: 8, color: '#EAEAEA' }}>
                        ⏳ Loading nutrition…
                      </ThemedText>
                  )}

                  {!showManualForm && !showHistory && !showRecipes && !showSearch ? (
                      <>
                        <TouchableOpacity style={styles.manualButton} onPress={() => setShowSearch(true)}>
                          <ThemedText style={styles.scanButtonText}>🔍 Search</ThemedText>
                        </TouchableOpacity>
                        {Platform.OS !== 'web' && (
                            <TouchableOpacity style={styles.scanButton} onPress={openScanner} disabled={loading}>
                              <ThemedText style={styles.scanButtonText}>
                                {loading ? '⏳ Please wait…' : '📷 Scan Barcode'}
                              </ThemedText>
                            </TouchableOpacity>
                        )}
                        {foodHistory.length > 0 && (
                            <TouchableOpacity style={styles.manualButton} onPress={() => setShowHistory(true)}>
                              <ThemedText style={styles.scanButtonText}>🕐 Recent Foods</ThemedText>
                            </TouchableOpacity>
                        )}
                        {recipes.length > 0 && (
                            <TouchableOpacity style={styles.manualButton} onPress={() => setShowRecipes(true)}>
                              <ThemedText style={styles.scanButtonText}>📖 From Recipe</ThemedText>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.manualButton} onPress={() => setShowManualForm(true)}>
                          <ThemedText style={styles.scanButtonText}>✏️ Manual Add</ThemedText>
                        </TouchableOpacity>
                      </>
                  ) : showSearch && !showHistory && !showRecipes && !showManualForm ? (
                      <>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Search foods..."
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={(text) => {
                              setSearchQuery(text);
                              if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                              if (text.trim().length > 2) {
                                setSearchLoading(true);
                                searchTimeoutRef.current = setTimeout(async () => {
                                  try {
                                    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(text)}&search_simple=1&action=process&json=1&page_size=20`);
                                    const data = await res.json();
                                    setSearchResults(data.products || []);
                                  } catch (e) {
                                    console.error('Search error:', e);
                                  }
                                  setSearchLoading(false);
                                }, 500);
                              } else {
                                setSearchResults([]);
                                setSearchLoading(false);
                              }
                            }}
                        />
                        {searchLoading && (
                            <ThemedText style={{ textAlign: 'center', marginBottom: 8, color: '#EAEAEA' }}>⏳ Searching...</ThemedText>
                        )}
                        <ThemedView style={styles.searchResultsContainer}>
                          <ScrollView style={styles.searchResultsList} nestedScrollEnabled={true}>
                            {searchResults.map((product, idx) => {
                              const mapped = mapOpenFoodFactsToForm(product);
                              return (
                                  <TouchableOpacity
                                      key={idx}
                                      style={styles.historyItem}
                                      onPress={() => {
                                        setNutritionForm(mapped);
                                        setBaseNutrition(mapped);
                                        setServingMultiplier(1);
                                        setShowSearch(false);
                                        setSearchResults([]);
                                        setShowManualForm(true);
                                      }}
                                  >
                                    <ThemedText style={styles.historyItemName}>{mapped.name}</ThemedText>
                                    <ThemedText style={styles.historyItemDetails}>
                                      {mapped.calories} cal • {mapped.protein}g protein
                                    </ThemedText>
                                  </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </ThemedView>
                        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setShowSearch(false); setSearchResults([]); }}>
                          <ThemedText style={{ color: '#EAEAEA' }}>Back</ThemedText>
                        </TouchableOpacity>
                      </>
                  ) : showRecipes && !showHistory && !showManualForm && !showSearch ? (
                      <>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Search recipes..."
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <ScrollView style={styles.historyList}>
                          {recipes
                              .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                              .map((recipe, idx) => (
                                  <TouchableOpacity
                                      key={idx}
                                      style={styles.historyItem}
                                      onPress={() => {
                                        const recipeData = {
                                          name: recipe.name,
                                          calories: Number(recipe.calories),
                                          protein: Number(recipe.protein),
                                          carbs: Number(recipe.carbs),
                                          fiber: Number(recipe.fiber),
                                          sugars: Number(recipe.sugars),
                                          totalFat: Number(recipe.total_fat),
                                          saturatedFat: Number(recipe.saturated_fat),
                                          transFat: Number(recipe.trans_fat),
                                          unsaturatedFat: Number(recipe.unsaturated_fat),
                                        };
                                        setNutritionForm(recipeData);
                                        setBaseNutrition(recipeData);
                                        setServingMultiplier(1);
                                        setShowRecipes(false);
                                        setShowManualForm(true);
                                      }}
                                  >
                                    <ThemedText style={styles.historyItemName}>{recipe.name}</ThemedText>
                                    <ThemedText style={styles.historyItemDetails}>
                                      {recipe.calories} cal • {recipe.protein}g protein • {Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0} ingredients
                                    </ThemedText>
                                  </TouchableOpacity>
                              ))}
                        </ScrollView>
                        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowRecipes(false)}>
                          <ThemedText style={{ color: '#EAEAEA' }}>Back</ThemedText>
                        </TouchableOpacity>
                      </>
                  ) : showHistory ? (
                      <>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Search foods..."
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <ScrollView style={styles.historyList}>
                          {foodHistory
                              .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                              .map((food, idx) => (
                                  <TouchableOpacity
                                      key={idx}
                                      style={styles.historyItem}
                                      onPress={() => {
                                        const baseFood = {
                                          name: food.name,
                                          calories: Math.round(food.calories / food.servingMultiplier),
                                          protein: Number((food.protein / food.servingMultiplier).toFixed(1)),
                                          carbs: Number((food.carbs / food.servingMultiplier).toFixed(1)),
                                          fiber: Number((food.fiber / food.servingMultiplier).toFixed(1)),
                                          sugars: Number((food.sugars / food.servingMultiplier).toFixed(1)),
                                          totalFat: Number((food.totalFat / food.servingMultiplier).toFixed(1)),
                                          saturatedFat: Number((food.saturatedFat / food.servingMultiplier).toFixed(1)),
                                          transFat: Number((food.transFat / food.servingMultiplier).toFixed(1)),
                                          unsaturatedFat: Number((food.unsaturatedFat / food.servingMultiplier).toFixed(1)),
                                        };
                                        setNutritionForm(food);
                                        setBaseNutrition(baseFood);
                                        setServingMultiplier(food.servingMultiplier);
                                        setShowHistory(false);
                                        setShowManualForm(true);
                                      }}
                                  >
                                    <ThemedText style={styles.historyItemName}>{food.name}</ThemedText>
                                    <ThemedText style={styles.historyItemDetails}>
                                      {food.calories} cal • {food.protein}g protein • {food.servingMultiplier}x
                                    </ThemedText>
                                  </TouchableOpacity>
                              ))}
                        </ScrollView>
                        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowHistory(false)}>
                          <ThemedText style={{ color: '#EAEAEA' }}>Back</ThemedText>
                        </TouchableOpacity>
                      </>
                  ) : (
                      <>
                        {baseNutrition && (
                            <ThemedView style={styles.servingSection}>
                              <ThemedText style={styles.fieldLabel}>Serving Size</ThemedText>
                              <ThemedView style={styles.servingControls}>
                                <TouchableOpacity
                                    style={styles.servingButton}
                                    onPress={() => {
                                      const newMultiplier = Math.max(0.25, servingMultiplier - 0.25);
                                      setServingMultiplier(newMultiplier);
                                      setNutritionForm({
                                        ...baseNutrition,
                                        calories: Math.round(baseNutrition.calories * newMultiplier),
                                        protein: Number((baseNutrition.protein * newMultiplier).toFixed(1)),
                                        carbs: Number((baseNutrition.carbs * newMultiplier).toFixed(1)),
                                        fiber: Number((baseNutrition.fiber * newMultiplier).toFixed(1)),
                                        sugars: Number((baseNutrition.sugars * newMultiplier).toFixed(1)),
                                        totalFat: Number((baseNutrition.totalFat * newMultiplier).toFixed(1)),
                                        saturatedFat: Number((baseNutrition.saturatedFat * newMultiplier).toFixed(1)),
                                        transFat: Number((baseNutrition.transFat * newMultiplier).toFixed(1)),
                                        unsaturatedFat: Number((baseNutrition.unsaturatedFat * newMultiplier).toFixed(1)),
                                      });
                                    }}
                                >
                                  <ThemedText style={styles.servingButtonText}>-</ThemedText>
                                </TouchableOpacity>
                                <ThemedText style={styles.servingValue}>{servingMultiplier}x</ThemedText>
                                <TouchableOpacity
                                    style={styles.servingButton}
                                    onPress={() => {
                                      const newMultiplier = servingMultiplier + 0.25;
                                      setServingMultiplier(newMultiplier);
                                      setNutritionForm({
                                        ...baseNutrition,
                                        calories: Math.round(baseNutrition.calories * newMultiplier),
                                        protein: Number((baseNutrition.protein * newMultiplier).toFixed(1)),
                                        carbs: Number((baseNutrition.carbs * newMultiplier).toFixed(1)),
                                        fiber: Number((baseNutrition.fiber * newMultiplier).toFixed(1)),
                                        sugars: Number((baseNutrition.sugars * newMultiplier).toFixed(1)),
                                        totalFat: Number((baseNutrition.totalFat * newMultiplier).toFixed(1)),
                                        saturatedFat: Number((baseNutrition.saturatedFat * newMultiplier).toFixed(1)),
                                        transFat: Number((baseNutrition.transFat * newMultiplier).toFixed(1)),
                                        unsaturatedFat: Number((baseNutrition.unsaturatedFat * newMultiplier).toFixed(1)),
                                      });
                                    }}
                                >
                                  <ThemedText style={styles.servingButtonText}>+</ThemedText>
                                </TouchableOpacity>
                              </ThemedView>
                            </ThemedView>
                        )}
                        <ThemedText style={styles.fieldLabel}>Food Name</ThemedText>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Food name"
                            placeholderTextColor="#999"
                            value={nutritionForm.name}
                            onChangeText={(text) => setNutritionForm(prev => ({ ...prev, name: text }))}
                        />

                        <ThemedView style={styles.nutritionRow}>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Calories</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Calories"
                                placeholderTextColor="#999"
                                value={nutritionForm.calories.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, calories: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Protein (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Protein (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.protein.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, protein: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                        </ThemedView>

                        <ThemedView style={styles.nutritionRow}>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Carbs (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Carbs (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.carbs.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, carbs: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Fiber (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Fiber (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.fiber.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, fiber: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                        </ThemedView>

                        <ThemedText style={styles.fieldLabel}>Sugars (g)</ThemedText>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Sugars (g)"
                            placeholderTextColor="#999"
                            value={nutritionForm.sugars.toString()}
                            onChangeText={(text) => setNutritionForm(prev => ({ ...prev, sugars: parseFloat(text) || 0 }))}
                            keyboardType="numeric"
                        />

                        <ThemedView style={styles.nutritionRow}>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Total Fat (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Total Fat (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.totalFat.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, totalFat: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Saturated Fat (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Saturated Fat (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.saturatedFat.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, saturatedFat: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                        </ThemedView>

                        <ThemedView style={styles.nutritionRow}>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Trans Fat (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Trans Fat (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.transFat.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, transFat: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                          <ThemedView style={styles.halfInput}>
                            <ThemedText style={styles.fieldLabel}>Unsaturated Fat (g)</ThemedText>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Unsaturated Fat (g)"
                                placeholderTextColor="#999"
                                value={nutritionForm.unsaturatedFat.toString()}
                                onChangeText={(text) => setNutritionForm(prev => ({ ...prev, unsaturatedFat: parseFloat(text) || 0 }))}
                                keyboardType="numeric"
                            />
                          </ThemedView>
                        </ThemedView>

                        <ThemedView style={styles.modalButtons}>
                          <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={resetModal}>
                            <ThemedText style={{ color: '#EAEAEA' }}>Cancel</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.modalButton, styles.addButton2]} onPress={addMeal}>
                            <ThemedText style={styles.buttonText}>Add</ThemedText>
                          </TouchableOpacity>
                        </ThemedView>
                      </>
                  )}
                </ThemedView>
              </ScrollView>
            </ThemedView>
          </Modal>

          <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
            <ThemedView style={styles.modalOverlay}>
              <ScrollView style={styles.modalScrollView}>
                <ThemedView style={styles.modalContent}>
                  <ThemedView style={styles.modalHeader}>
                    <ThemedText type="subtitle" style={[styles.modalTitle, { color: '#EAEAEA' }]}>
                      Edit Meal
                    </ThemedText>
                    <TouchableOpacity onPress={() => { setEditModalVisible(false); setEditingMeal(null); setServingMultiplier(1); setBaseNutrition(null); }} style={styles.closeButton}>
                      <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>

                  {baseNutrition && (
                      <ThemedView style={styles.servingSection}>
                        <ThemedText style={styles.fieldLabel}>Serving Size</ThemedText>
                        <ThemedView style={styles.servingControls}>
                          <TouchableOpacity
                              style={styles.servingButton}
                              onPress={() => {
                                const newMultiplier = Math.max(0.25, servingMultiplier - 0.25);
                                setServingMultiplier(newMultiplier);
                                setNutritionForm({
                                  ...baseNutrition,
                                  calories: Math.round(baseNutrition.calories * newMultiplier),
                                  protein: Number((baseNutrition.protein * newMultiplier).toFixed(1)),
                                  carbs: Number((baseNutrition.carbs * newMultiplier).toFixed(1)),
                                  fiber: Number((baseNutrition.fiber * newMultiplier).toFixed(1)),
                                  sugars: Number((baseNutrition.sugars * newMultiplier).toFixed(1)),
                                  totalFat: Number((baseNutrition.totalFat * newMultiplier).toFixed(1)),
                                  saturatedFat: Number((baseNutrition.saturatedFat * newMultiplier).toFixed(1)),
                                  transFat: Number((baseNutrition.transFat * newMultiplier).toFixed(1)),
                                  unsaturatedFat: Number((baseNutrition.unsaturatedFat * newMultiplier).toFixed(1)),
                                });
                              }}
                          >
                            <ThemedText style={styles.servingButtonText}>-</ThemedText>
                          </TouchableOpacity>
                          <ThemedText style={styles.servingValue}>{servingMultiplier}x</ThemedText>
                          <TouchableOpacity
                              style={styles.servingButton}
                              onPress={() => {
                                const newMultiplier = servingMultiplier + 0.25;
                                setServingMultiplier(newMultiplier);
                                setNutritionForm({
                                  ...baseNutrition,
                                  calories: Math.round(baseNutrition.calories * newMultiplier),
                                  protein: Number((baseNutrition.protein * newMultiplier).toFixed(1)),
                                  carbs: Number((baseNutrition.carbs * newMultiplier).toFixed(1)),
                                  fiber: Number((baseNutrition.fiber * newMultiplier).toFixed(1)),
                                  sugars: Number((baseNutrition.sugars * newMultiplier).toFixed(1)),
                                  totalFat: Number((baseNutrition.totalFat * newMultiplier).toFixed(1)),
                                  saturatedFat: Number((baseNutrition.saturatedFat * newMultiplier).toFixed(1)),
                                  transFat: Number((baseNutrition.transFat * newMultiplier).toFixed(1)),
                                  unsaturatedFat: Number((baseNutrition.unsaturatedFat * newMultiplier).toFixed(1)),
                                });
                              }}
                          >
                            <ThemedText style={styles.servingButtonText}>+</ThemedText>
                          </TouchableOpacity>
                        </ThemedView>
                      </ThemedView>
                  )}

                  <ThemedText style={styles.fieldLabel}>Food Name</ThemedText>
                  <TextInput
                      style={styles.textInput}
                      placeholder="Food name"
                      placeholderTextColor="#999"
                      value={nutritionForm.name}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, name: text }))}
                  />

                  <ThemedView style={styles.nutritionRow}>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Calories</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Calories"
                          placeholderTextColor="#999"
                          value={nutritionForm.calories.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, calories: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Protein (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Protein (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.protein.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, protein: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                  </ThemedView>

                  <ThemedView style={styles.nutritionRow}>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Carbs (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Carbs (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.carbs.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, carbs: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Fiber (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Fiber (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.fiber.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, fiber: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                  </ThemedView>

                  <ThemedText style={styles.fieldLabel}>Sugars (g)</ThemedText>
                  <TextInput
                      style={styles.textInput}
                      placeholder="Sugars (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.sugars.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, sugars: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                  />

                  <ThemedView style={styles.nutritionRow}>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Total Fat (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Total Fat (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.totalFat.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, totalFat: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Saturated Fat (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Saturated Fat (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.saturatedFat.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, saturatedFat: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                  </ThemedView>

                  <ThemedView style={styles.nutritionRow}>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Trans Fat (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Trans Fat (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.transFat.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, transFat: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                    <ThemedView style={styles.halfInput}>
                      <ThemedText style={styles.fieldLabel}>Unsaturated Fat (g)</ThemedText>
                      <TextInput
                          style={styles.textInput}
                          placeholder="Unsaturated Fat (g)"
                          placeholderTextColor="#999"
                          value={nutritionForm.unsaturatedFat.toString()}
                          onChangeText={(text) => setNutritionForm(prev => ({ ...prev, unsaturatedFat: parseFloat(text) || 0 }))}
                          keyboardType="numeric"
                      />
                    </ThemedView>
                  </ThemedView>

                  <ThemedView style={styles.modalButtons}>
                    <TouchableOpacity
                        style={[styles.modalButton, styles.deleteButton]}
                        onPress={() => editingMeal && deleteMeal(editingMeal.id)}
                    >
                      <ThemedText style={styles.buttonText}>Delete</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.addButton2]} onPress={updateMeal}>
                      <ThemedText style={styles.buttonText}>Save</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                </ThemedView>
              </ScrollView>
            </ThemedView>
          </Modal>

          <Modal animationType="fade" transparent visible={calendarVisible} onRequestClose={() => setCalendarVisible(false)}>
            <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setCalendarVisible(false)}>
              <ThemedView style={styles.calendarContent}>
                <ThemedView style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => {
                    const newMonth = new Date(calendarMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setCalendarMonth(newMonth);
                  }} style={styles.calendarArrow}>
                    <ThemedText style={styles.calendarArrowText}>‹</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowYearPicker(!showYearPicker)} style={styles.calendarTitleButton}>
                    <ThemedText type="subtitle" style={styles.calendarTitle}>
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </ThemedText>
                    <ThemedText style={styles.dropdownArrow}>{showYearPicker ? '▲' : '▼'}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    const newMonth = new Date(calendarMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setCalendarMonth(newMonth);
                  }} style={styles.calendarArrow}>
                    <ThemedText style={styles.calendarArrowText}>›</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
                <TouchableOpacity
                    style={styles.todayButton}
                    onPress={() => {
                      setSelectedDate(new Date());
                      setCalendarMonth(new Date());
                      setCalendarVisible(false);
                    }}
                >
                  <ThemedText style={styles.todayButtonText}>Today</ThemedText>
                </TouchableOpacity>
                {showYearPicker && (
                    <ScrollView style={styles.yearPicker}>
                      {Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i).map(year => (
                          <TouchableOpacity
                              key={year}
                              style={styles.yearItem}
                              onPress={() => {
                                const newMonth = new Date(calendarMonth);
                                newMonth.setFullYear(year);
                                setCalendarMonth(newMonth);
                                setShowYearPicker(false);
                              }}
                          >
                            <ThemedText style={[
                              styles.yearText,
                              year === calendarMonth.getFullYear() && styles.yearTextSelected,
                            ]}>
                              {year}
                            </ThemedText>
                          </TouchableOpacity>
                      ))}
                    </ScrollView>
                )}
                <ThemedView style={styles.calendarGrid}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <ThemedText key={i} style={styles.calendarDayLabel}>{day}</ThemedText>
                  ))}
                  {(() => {
                    const year = calendarMonth.getFullYear();
                    const month = calendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const days = [];
                    for (let i = 0; i < firstDay; i++) days.push(null);
                    for (let i = 1; i <= daysInMonth; i++) days.push(i);
                    return days.map((day, i) => (
                        <TouchableOpacity
                            key={i}
                            style={[
                              styles.calendarDay,
                              day === selectedDate.getDate() &&
                              month === selectedDate.getMonth() &&
                              year === selectedDate.getFullYear() &&
                              styles.calendarDaySelected,
                            ]}
                            onPress={() => {
                              if (day) {
                                const newDate = new Date(year, month, day);
                                setSelectedDate(newDate);
                                setCalendarVisible(false);
                              }
                            }}
                            disabled={!day}
                        >
                          <ThemedText style={[
                            styles.calendarDayText,
                            day === selectedDate.getDate() &&
                            month === selectedDate.getMonth() &&
                            year === selectedDate.getFullYear() &&
                            styles.calendarDayTextSelected,
                          ]}>
                            {day || ''}
                          </ThemedText>
                        </TouchableOpacity>
                    ));
                  })()}
                </ThemedView>
              </ThemedView>
            </TouchableOpacity>
          </Modal>

          {actionsMenuOpen && (
              <TouchableOpacity
                  style={styles.menuOverlay}
                  activeOpacity={1}
                  onPress={() => setActionsMenuOpen(false)}
              />
          )}

          <Modal animationType="slide" transparent visible={nutritionModalVisible} onRequestClose={() => setNutritionModalVisible(false)}>
            <ThemedView style={styles.modalOverlay}>
              <ThemedView style={styles.nutritionModalContent}>
                <ThemedView style={styles.modalHeader}>
                  <ThemedText type="subtitle" style={styles.modalTitle}>
                    Nutrition for {formatDate(selectedDate)}
                  </ThemedText>
                  <TouchableOpacity onPress={() => setNutritionModalVisible(false)} style={styles.closeButton}>
                    <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                  </TouchableOpacity>
                </ThemedView>

                <ThemedView style={styles.nutritionSection}>
                  <ThemedText style={styles.nutritionSectionTitle}>Macros</ThemedText>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Calories:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.calories}</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Protein:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.protein}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Carbs:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.carbs}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Fat:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.fat}g</ThemedText>
                  </ThemedView>
                </ThemedView>

                <ThemedView style={styles.nutritionSection}>
                  <ThemedText style={styles.nutritionSectionTitle}>Additional</ThemedText>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Fiber:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.fiber}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Sugars:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.sugars}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Saturated Fat:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.saturatedFat}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Trans Fat:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.transFat}g</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.nutritionItemRow}>
                    <ThemedText style={styles.nutritionItemLabel}>Unsaturated Fat:</ThemedText>
                    <ThemedText style={styles.nutritionItemValue}>{dailyTotals.unsaturatedFat}g</ThemedText>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            </ThemedView>
          </Modal>

          {showScanner && (
            <Modal animationType="slide" visible={showScanner} onRequestClose={handleCloseScanner}>
              <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} onClose={handleCloseScanner} />
            </Modal>
          )}
        </ThemedView>
      </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  actionsButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionsButtonText: {
    color: '#EAEAEA',
    fontWeight: 'bold',
    fontSize: 14,
  },
  actionsMenu: {
    position: 'absolute',
    top: 60,
    left: 20,
    backgroundColor: '#121212',
    borderRadius: 8,
    borderColor: '#2A2A2A',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  actionMenuItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  actionMenuText: {
    color: '#EAEAEA',
    fontSize: 14,
  },
  macroSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  macroItem: {
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  macroValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  macroLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  dateArrow: {
    padding: 8,
  },
  dateArrowText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 100,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: 'transparent',
  },
  currentHourRow: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: -16,
    paddingHorizontal: 32,
  },
  currentHourText: {
    color: '#EAEAEA',
    fontWeight: 'bold',
  },
  timeSection: {
    width: 80,
    backgroundColor: 'transparent',
  },
  mealsSection: {
    flex: 1,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  mealItem: {
    backgroundColor: 'rgba(18,18,18,0.95)',
    padding: 8,
    marginVertical: 2,
    borderRadius: 8,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  deleteActionContainer: {
    justifyContent: 'center',
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  deleteAction: {
    backgroundColor: '#CC0000',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 20,
    borderRadius: 8,
    borderColor: '#121212',
    borderWidth: 1,
    marginLeft: -8,
  },
  deleteActionText: {
    fontSize: 20,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#EAEAEA',
    fontSize: 18,
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlignVertical: 'center',
    marginTop: -2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 60,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#EAEAEA',
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#EAEAEA',
    marginBottom: 12,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  halfInput: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'transparent',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 4,
    marginLeft: 4,
  },
  scanButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  manualButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  scanButtonText: {
    color: '#EAEAEA',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addButton2: {
    backgroundColor: '#2A2A2A',
  },
  deleteButton: {
    backgroundColor: '#CC0000',
  },
  buttonText: {
    color: '#EAEAEA',
  },
  historyList: {
    maxHeight: 300,
    marginBottom: 12,
  },
  searchResultsContainer: {
    height: 250,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  searchResultsList: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  historyItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#EAEAEA',
  },
  historyItemDetails: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  servingSection: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  servingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  servingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  servingButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  servingValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 20,
    color: '#EAEAEA',
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContent: {
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 20,
    width: 340,
    height: 420,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  calendarArrow: {
    padding: 8,
  },
  calendarArrowText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  calendarTitleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  calendarTitle: {
    textAlign: 'center',
    color: '#EAEAEA',
  },
  dropdownArrow: {
    fontSize: 10,
    marginLeft: 6,
    color: '#EAEAEA',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'transparent',
  },
  calendarDayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 8,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  calendarDaySelected: {
    backgroundColor: '#2A2A2A',
  },
  calendarDayText: {
    fontSize: 14,
    color: '#EAEAEA',
  },
  calendarDayTextSelected: {
    color: '#EAEAEA',
    fontWeight: 'bold',
  },
  yearPicker: {
    maxHeight: 200,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  yearItem: {
    padding: 12,
    alignItems: 'center',
  },
  yearText: {
    fontSize: 16,
    color: '#EAEAEA',
  },
  yearTextSelected: {
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  todayButton: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 12,
  },
  todayButtonText: {
    color: '#EAEAEA',
    fontWeight: 'bold',
    fontSize: 14,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  nutritionModalContent: {
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 100,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  nutritionSection: {
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  nutritionSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#EAEAEA',
  },
  nutritionItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: 'transparent',
  },
  nutritionItemLabel: {
    fontSize: 16,
    color: '#9E9E9E',
  },
  nutritionItemValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
});

