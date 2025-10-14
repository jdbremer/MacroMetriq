import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/utils/supabase';

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('150');
  const [carbs, setCarbs] = useState('200');
  const [fats, setFats] = useState('65');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setCalories(data.calories.toString());
      setProtein(data.protein.toString());
      setCarbs(data.carbs.toString());
      setFats(data.fats.toString());
    }
  };

  const saveGoals = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const newGoals = {
      user_id: user.id,
      calories: parseInt(calories) || 2000,
      protein: parseInt(protein) || 150,
      carbs: parseInt(carbs) || 200,
      fats: parseInt(fats) || 65,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('goals')
      .upsert(newGoals, { onConflict: 'user_id' });

    if (!error) {
      // Update today's daily_goals snapshot
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_goals')
        .upsert({
          user_id: user.id,
          date: today,
          calories: newGoals.calories,
          protein: newGoals.protein,
          carbs: newGoals.carbs,
          fats: newGoals.fats,
        }, { onConflict: 'user_id,date' });
    }

    setLoading(false);
    if (!error) {
      router.back();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>‹</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={{ color: '#EAEAEA' }}>Goals</ThemedText>
        <ThemedView style={styles.placeholder} />
      </ThemedView>

      <ScrollView style={styles.content}>
        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Daily Calories</ThemedText>
          <TextInput
            style={styles.input}
            value={calories}
            onChangeText={setCalories}
            keyboardType="numeric"
            placeholder="2000"
            placeholderTextColor="#999"
          />
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Protein (g)</ThemedText>
          <TextInput
            style={styles.input}
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            placeholder="150"
            placeholderTextColor="#999"
          />
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Carbs (g)</ThemedText>
          <TextInput
            style={styles.input}
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="numeric"
            placeholder="200"
            placeholderTextColor="#999"
          />
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Fats (g)</ThemedText>
          <TextInput
            style={styles.input}
            value={fats}
            onChangeText={setFats}
            keyboardType="numeric"
            placeholder="65"
            placeholderTextColor="#999"
          />
        </ThemedView>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={saveGoals}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.saveButtonText}>Save Goals</ThemedText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#EAEAEA',
  },
  placeholder: {
    width: 48,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#EAEAEA',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#EAEAEA',
    fontSize: 16,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  saveButton: {
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#EAEAEA',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
