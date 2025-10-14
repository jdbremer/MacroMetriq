import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Ingredient {
  name: string;
  servingMultiplier: number;
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

interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
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

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [])
  );

  const loadRecipes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cacheKey = `recipes_${user.id}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      setRecipes(JSON.parse(cached));
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
        id: r.id,
        name: r.name,
        ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients,
        calories: Number(r.calories),
        protein: Number(r.protein),
        carbs: Number(r.carbs),
        fiber: Number(r.fiber),
        sugars: Number(r.sugars),
        totalFat: Number(r.total_fat),
        saturatedFat: Number(r.saturated_fat),
        transFat: Number(r.trans_fat),
        unsaturatedFat: Number(r.unsaturated_fat),
      }));
      setRecipes(recipes);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(recipes));
    }
  };

  const deleteRecipe = async (id: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) {
      Alert.alert('Error', 'Failed to delete recipe');
      return;
    }
    setRecipes(prev => prev.filter(r => r.id !== id));
    setEditModalVisible(false);
  };

  const filteredRecipes = recipes.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>‹</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Recipes</ThemedText>
        <ThemedView style={styles.placeholder} />
      </ThemedView>

      <ThemedView style={styles.content}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/recipe-builder')}
        >
          <ThemedText style={styles.createButtonText}>+ Create Recipe</ThemedText>
        </TouchableOpacity>

        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <ScrollView style={styles.recipeList}>
          {filteredRecipes.map(recipe => (
            <TouchableOpacity
              key={recipe.id}
              style={styles.recipeItem}
              onPress={() => {
                setEditingRecipe(recipe);
                setEditModalVisible(true);
              }}
            >
              <ThemedText style={styles.recipeName}>{recipe.name}</ThemedText>
              <ThemedText style={styles.recipeDetails}>
                {recipe.calories} cal • {recipe.protein}g protein • {recipe.ingredients.length} ingredients
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ThemedView>

      <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText type="subtitle">{editingRecipe?.name}</ThemedText>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.closeButton}>
                <ThemedText style={styles.closeButtonText}>✕</ThemedText>
              </TouchableOpacity>
            </ThemedView>

            <ThemedText style={styles.nutritionLabel}>Nutrition (Total)</ThemedText>
            <ThemedText>{editingRecipe?.calories} cal • {editingRecipe?.protein}g protein • {editingRecipe?.carbs}g carbs</ThemedText>

            <ThemedText style={styles.ingredientsLabel}>Ingredients:</ThemedText>
            <ScrollView style={styles.ingredientsList}>
              {editingRecipe?.ingredients.map((ing, idx) => (
                <ThemedView key={idx} style={styles.ingredientItem}>
                  <ThemedText>{ing.name} ({ing.servingMultiplier}x)</ThemedText>
                  <ThemedText style={styles.ingredientDetails}>
                    {ing.calories} cal • {ing.protein}g protein
                  </ThemedText>
                </ThemedView>
              ))}
            </ScrollView>

            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={() => editingRecipe && deleteRecipe(editingRecipe.id)}
              >
                <ThemedText style={styles.buttonText}>Delete</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.editButton]}
                onPress={() => {
                  setEditModalVisible(false);
                  router.push({ pathname: '/recipe-builder', params: { recipeId: editingRecipe?.id } });
                }}
              >
                <ThemedText style={styles.buttonText}>Edit</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3A3A3C' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(58,58,60,0.95)',
  },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 32, fontWeight: 'bold' },
  placeholder: { width: 48, backgroundColor: 'transparent' },
  content: { flex: 1, padding: 20, backgroundColor: 'transparent' },
  createButton: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    marginBottom: 16,
    borderColor: '#121212',
    borderWidth: 1,
  },
  recipeList: { flex: 1 },
  recipeItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderColor: '#121212',
    borderWidth: 1,
  },
  recipeName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  recipeDetails: { fontSize: 14, color: '#999' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#3A3A3C',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%',
    borderColor: '#121212',
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  closeButton: { position: 'absolute', right: 0, padding: 4 },
  closeButtonText: { fontSize: 24, color: '#FFFFFF' },
  nutritionLabel: { fontSize: 14, color: '#999', marginTop: 12, marginBottom: 4 },
  ingredientsLabel: { fontSize: 14, color: '#999', marginTop: 16, marginBottom: 8 },
  ingredientsList: { maxHeight: 200, marginBottom: 16 },
  ingredientItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  ingredientDetails: { fontSize: 12, color: '#999', marginTop: 4 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  deleteButton: { backgroundColor: '#CC0000' },
  editButton: { backgroundColor: '#000000' },
  buttonText: { color: '#FFFFFF' },
});
