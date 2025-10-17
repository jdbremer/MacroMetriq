import { ScrollView, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ProgressBar } from '@/components/ProgressBar';
import { useRef, useState, useEffect, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

export default function DashboardScreen() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const [healthData, setHealthData] = useState({
    steps: 8547,
    distance: 3.2,
    calories: 420
  });
  const [mealTotals, setMealTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugars: 0,
    saturated_fat: 0,
    trans_fat: 0,
    unsaturated_fat: 0
  });
  const [activities, setActivities] = useState([
    { name: 'Morning Run', duration: 30, date: 'Today' },
    { name: 'Strength Training', duration: 45, date: 'Yesterday' }
  ]);
  const [goals, setGoals] = useState<{ calories: number; protein: number; carbs: number; fats: number; created_at: string } | null>(null);

  useEffect(() => {
    const loadMealTotals = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use local timezone date (same as meals tab)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      const cacheKey = `meals_${user.id}_${today}`;

      // Load from AsyncStorage first
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const cachedMeals = JSON.parse(cached);
        const totals = cachedMeals.reduce((acc, m) => ({
          calories: acc.calories + Number(m.calories),
          protein: acc.protein + Number(m.protein),
          carbs: acc.carbs + Number(m.carbs),
          fat: acc.fat + Number(m.totalFat),
          fiber: acc.fiber + Number(m.fiber),
          sugars: acc.sugars + Number(m.sugars),
          saturated_fat: acc.saturated_fat + Number(m.saturatedFat),
          trans_fat: acc.trans_fat + Number(m.transFat),
          unsaturated_fat: acc.unsaturated_fat + Number(m.unsaturatedFat),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, saturated_fat: 0, trans_fat: 0, unsaturated_fat: 0 });
        setMealTotals({
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fat: Math.round(totals.fat),
          fiber: Math.round(totals.fiber),
          sugars: Math.round(totals.sugars),
          saturated_fat: Math.round(totals.saturated_fat),
          trans_fat: Math.round(totals.trans_fat),
          unsaturated_fat: Math.round(totals.unsaturated_fat),
        });
      }
      
      const { data } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today);
      
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

        const totals = meals.reduce((acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.totalFat,
          fiber: acc.fiber + m.fiber,
          sugars: acc.sugars + m.sugars,
          saturated_fat: acc.saturated_fat + m.saturatedFat,
          trans_fat: acc.trans_fat + m.transFat,
          unsaturated_fat: acc.unsaturated_fat + m.unsaturatedFat,
        }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, saturated_fat: 0, trans_fat: 0, unsaturated_fat: 0 });

        setMealTotals(totals);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(meals));
      }
    };
    const loadAll = () => {
      loadMealTotals();
      loadGoals();
    };
    loadAll();
    const interval = setInterval(loadAll, 2000);
    return () => clearInterval(interval);
  }, []);
  
  const loadGoals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Use local timezone date (same as meals tab)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Check if daily goals snapshot exists for today
    const { data: dailyGoals } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();
    
    if (dailyGoals) {
      setGoals(dailyGoals);
      return;
    }
    
    // If no snapshot exists, get current goals and create snapshot
    const { data: currentGoals } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (currentGoals) {
      await supabase
        .from('daily_goals')
        .insert({
          user_id: user.id,
          date: today,
          calories: currentGoals.calories,
          protein: currentGoals.protein,
          carbs: currentGoals.carbs,
          fats: currentGoals.fats,
        });
      
      setGoals(currentGoals);
    }
  };
  

  
  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [140, 80],
    extrapolate: 'clamp',
  });


  


  return (
    <ThemedView style={styles.container}>
      <Animated.View style={[styles.header, { height: headerHeight, paddingTop: insets.top + 20 }]}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title" style={{ color: '#EAEAEA' }}>MacroMetriq</ThemedText>
        </ThemedView>
      </Animated.View>
      
      <Animated.ScrollView 
        style={styles.scrollView}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
      <ThemedView style={styles.quickActionsSection}>
        <ThemedText type="subtitle" style={{ textAlign: 'center', marginBottom: 12, color: '#EAEAEA' }}>
          Quick Actions
        </ThemedText>
        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton}>
            <ThemedText style={styles.buttonText}>Check In</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/meals', params: { openModal: 'true' } })}>
            <ThemedText style={styles.buttonText}>Log Food</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.todaysStatsContainer}>
        <ThemedText type="subtitle" style={{ textAlign: 'center', marginBottom: 16, color: '#EAEAEA' }}>
          Today's Stats
        </ThemedText>
        
        <ThemedText style={styles.sectionLabel}>Fitness</ThemedText>
        <ThemedView style={styles.statsContainer}>
          <ThemedView style={styles.statCard}>
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{healthData.steps.toLocaleString()}</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Steps</ThemedText>
          </ThemedView>
          <ThemedView style={styles.statCard}>
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{healthData.distance}</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Miles</ThemedText>
          </ThemedView>
          <ThemedView style={styles.statCard}>
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{healthData.calories}</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Calories</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedText style={[styles.sectionLabel, { marginTop: 16 }]}>Meal</ThemedText>
        <ThemedView style={styles.statsContainer}>
          <ThemedView style={styles.statCard}>
            <ProgressBar current={mealTotals.calories} goal={goals?.calories || null} color="#FF9800" />
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{mealTotals.calories}</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Calories</ThemedText>
          </ThemedView>
          <ThemedView style={styles.statCard}>
            <ProgressBar current={mealTotals.protein} goal={goals?.protein || null} color="#F50057" />
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{mealTotals.protein}g</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Protein</ThemedText>
          </ThemedView>
          <ThemedView style={styles.statCard}>
            <ProgressBar current={mealTotals.carbs} goal={goals?.carbs || null} color="#76FF03" />
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{mealTotals.carbs}g</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Carbs</ThemedText>
          </ThemedView>
          <ThemedView style={styles.statCard}>
            <ProgressBar current={mealTotals.fat} goal={goals?.fats || null} color="#00E5FF" />
            <ThemedText type="subtitle" style={{ textAlign: 'center', color: '#EAEAEA' }}>{mealTotals.fat}g</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#9E9E9E' }}>Fat</ThemedText>
          </ThemedView>
        </ThemedView>
        <ThemedView style={styles.additionalNutrition}>
          <ThemedView style={styles.nutritionRow}>
            <ThemedText style={styles.nutritionItem}>Fiber: {mealTotals.fiber}g</ThemedText>
            <ThemedText style={styles.nutritionItem}>Sugars: {mealTotals.sugars}g</ThemedText>
          </ThemedView>
          <ThemedView style={styles.nutritionRow}>
            <ThemedText style={styles.nutritionItem}>Saturated Fat: {mealTotals.saturated_fat}g</ThemedText>
            <ThemedText style={styles.nutritionItem}>Trans Fat: {mealTotals.trans_fat}g</ThemedText>
          </ThemedView>
          <ThemedText style={styles.nutritionItem}>Unsaturated Fat: {mealTotals.unsaturated_fat}g</ThemedText>
        </ThemedView>
      </ThemedView>

        <ThemedView style={styles.recentActivitiesSection}>
          <ThemedText type="subtitle" style={{ textAlign: 'center', marginBottom: 12, color: '#EAEAEA' }}>Recent Activities</ThemedText>
          {activities.length > 0 ? activities.map((activity, index) => (
            <ThemedView key={index} style={styles.activityItem}>
              <ThemedText type="defaultSemiBold" style={{ color: '#EAEAEA' }}>{activity.name}</ThemedText>
              <ThemedText style={{ color: '#9E9E9E' }}>{activity.duration} min • {activity.date}</ThemedText>
            </ThemedView>
          )) : (
            <ThemedView style={styles.activityItem}>
              <ThemedText type="defaultSemiBold" style={{ color: '#EAEAEA' }}>No recent activities</ThemedText>
              <ThemedText style={{ color: '#9E9E9E' }}>Start a workout to see activities here</ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  scrollView: {
    flex: 1,
    paddingTop: 160,
    paddingHorizontal: 16,
  },
  todaysStatsContainer: {
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderColor: '#2A2A2A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#EAEAEA',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'transparent',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  section: {
    marginBottom: 24,
  },
  quickActionsSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderColor: '#2A2A2A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionButton: {
    width: 120,
    paddingVertical: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 15,
    alignItems: 'center',
  },
  activityItem: {
    padding: 12,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  buttonText: {
    color: '#EAEAEA',
  },
  recentActivitiesSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderRadius: 12,
    padding: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  emoji: {
    fontSize: 24,
    marginLeft: 8,
    marginTop: -4,
  },
  additionalNutrition: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    backgroundColor: 'transparent',
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  nutritionItem: {
    fontSize: 12,
    marginBottom: 4,
    color: '#9E9E9E',
  },
});
