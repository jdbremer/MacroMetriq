import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, InteractionManager, Platform, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/utils/supabase';
import BarcodeScanner from '@/components/BarcodeScanner';

interface Ingredient {
  name: string;
  servingMultiplier: number;
  gramWeight?: number;
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
  servingSize?: string;
  gramWeight?: number;
}

interface RecentFood extends NutritionData {
  servingMultiplier: number;
}

// Check if USDA food has actual serving size data
// Most USDA branded foods have servingSize, so we'll show all results
const hasServingSize = (food: any): boolean => {
  // Always return true for USDA foods since they typically have serving info
  return true;
};

// USDA FoodData Central mapping
const mapUSDAToForm = (food: any): NutritionData => {
  const nutrients = food.foodNutrients || [];

  const getNutrient = (nutrientId: number) => {
    const nutrient = nutrients.find((n: any) => n.nutrientId === nutrientId);
    return nutrient ? Number(nutrient.value || 0) : 0;
  };

  // USDA Nutrient IDs
  // 1008 = Energy (kcal)
  // 1003 = Protein
  // 1005 = Carbohydrate
  // 1079 = Fiber
  // 2000 = Sugars, total
  // 1004 = Total lipid (fat)
  // 1258 = Fatty acids, total saturated
  // 1257 = Fatty acids, total trans
  // 1292 = Fatty acids, total monounsaturated
  // 1293 = Fatty acids, total polyunsaturated

  const monounsaturated = getNutrient(1292);
  const polyunsaturated = getNutrient(1293);

  // Extract serving size from USDA API
  let servingSize = '100g';
  let gramWeight = 100;

  if (food.servingSize && food.servingSizeUnit) {
    servingSize = `${food.servingSize}${food.servingSizeUnit}`;
    gramWeight = Number(food.servingSize) || 100;
  } else if (food.servingSize) {
    servingSize = `${food.servingSize}g`;
    gramWeight = Number(food.servingSize) || 100;
  } else if (food.foodPortions && food.foodPortions.length > 0) {
    const portion = food.foodPortions[0];
    if (portion.gramWeight) {
      gramWeight = Number(portion.gramWeight);
      servingSize = `${portion.gramWeight}g`;
      if (portion.modifier) {
        servingSize = `${portion.gramWeight}g (${portion.modifier})`;
      }
    }
  }

  return {
    name: food.description || 'Unknown Food',
    calories: Math.round(getNutrient(1008)),
    protein: Number(getNutrient(1003).toFixed(1)),
    carbs: Number(getNutrient(1005).toFixed(1)),
    fiber: Number(getNutrient(1079).toFixed(1)),
    sugars: Number(getNutrient(2000).toFixed(1)),
    totalFat: Number(getNutrient(1004).toFixed(1)),
    saturatedFat: Number(getNutrient(1258).toFixed(1)),
    transFat: Number(getNutrient(1257).toFixed(1)),
    unsaturatedFat: Number((monounsaturated + polyunsaturated).toFixed(1)),
    servingSize,
    gramWeight,
  };
};

export default function RecipeBuilderScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [addIngredientModalVisible, setAddIngredientModalVisible] = useState(false);
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
  const [showManualForm, setShowManualForm] = useState(false);
  const [foodHistory, setFoodHistory] = useState<RecentFood[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [baseNutrition, setBaseNutrition] = useState<NutritionData | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    if (params.recipeId) {
      loadRecipe(params.recipeId as string);
    }
    loadFoodHistory();
    loadRecipes();
    return () => { isMounted.current = false; };
  }, [params.recipeId]);


  const loadRecipe = async (id: string) => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return;

    setRecipeName(data.name);
    setIngredients(typeof data.ingredients === 'string' ? JSON.parse(data.ingredients) : data.ingredients);
  };

  const loadFoodHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const cacheKey = `recent_foods_${user.id}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      setFoodHistory(JSON.parse(cached));
    }
    
    const { data: mealsData } = await supabase
      .from('meals')
      .select('name')
      .eq('user_id', user.id);
    
    const mealNames = new Set(mealsData?.map(m => m.name) || []);
    
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
      const foods = data
        .filter(f => mealNames.has(f.name))
        .map(f => ({
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
        ...r,
        ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients
      }));
      setRecipes(recipes);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(recipes));
    }
  };

  const lookupBarcode = async (barcode: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
      const json = await res.json();

      if (json?.status === 1 && json?.product) {
        const p = json.product;
        const n = p.nutriments || {};
        const ingredient: Ingredient = {
          name: p.product_name || 'Unknown Product',
          servingMultiplier: 1,
          calories: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
          protein: Number((n.proteins_serving || n.proteins_100g || 0).toFixed(1)),
          carbs: Number((n.carbohydrates_serving || n.carbohydrates_100g || 0).toFixed(1)),
          fiber: Number((n.fiber_serving || n.fiber_100g || 0).toFixed(1)),
          sugars: Number((n.sugars_serving || n.sugars_100g || 0).toFixed(1)),
          totalFat: Number((n.fat_serving || n.fat_100g || 0).toFixed(1)),
          saturatedFat: Number((n['saturated-fat_serving'] || n['saturated-fat_100g'] || 0).toFixed(1)),
          transFat: Number((n['trans-fat_serving'] || n['trans-fat_100g'] || 0).toFixed(1)),
          unsaturatedFat: Number(((n['monounsaturated-fat_serving'] || 0) + (n['polyunsaturated-fat_serving'] || 0)).toFixed(1)),
        };
        setIngredients(prev => [...prev, ingredient]);
      } else {
        Alert.alert('Product not found', `No nutrition information for barcode ${barcode}.`);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to fetch product information.');
    } finally {
      setLoading(false);
    }
  };

  const openScanner = () => {
    setShowScanner(true);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setShowScanner(false);
    lookupBarcode(barcode);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };


  const updateServingMultiplier = (index: number, multiplier: number) => {
    setIngredients(prev => prev.map((ing, i) => {
      if (i !== index) return ing;
      const base = {
        ...ing,
        calories: Math.round(ing.calories / ing.servingMultiplier),
        protein: Number((ing.protein / ing.servingMultiplier).toFixed(1)),
        carbs: Number((ing.carbs / ing.servingMultiplier).toFixed(1)),
        fiber: Number((ing.fiber / ing.servingMultiplier).toFixed(1)),
        sugars: Number((ing.sugars / ing.servingMultiplier).toFixed(1)),
        totalFat: Number((ing.totalFat / ing.servingMultiplier).toFixed(1)),
        saturatedFat: Number((ing.saturatedFat / ing.servingMultiplier).toFixed(1)),
        transFat: Number((ing.transFat / ing.servingMultiplier).toFixed(1)),
        unsaturatedFat: Number((ing.unsaturatedFat / ing.servingMultiplier).toFixed(1)),
      };
      return {
        ...base,
        servingMultiplier: multiplier,
        calories: Math.round(base.calories * multiplier),
        protein: Number((base.protein * multiplier).toFixed(1)),
        carbs: Number((base.carbs * multiplier).toFixed(1)),
        fiber: Number((base.fiber * multiplier).toFixed(1)),
        sugars: Number((base.sugars * multiplier).toFixed(1)),
        totalFat: Number((base.totalFat * multiplier).toFixed(1)),
        saturatedFat: Number((base.saturatedFat * multiplier).toFixed(1)),
        transFat: Number((base.transFat * multiplier).toFixed(1)),
        unsaturatedFat: Number((base.unsaturatedFat * multiplier).toFixed(1)),
      };
    }));
  };

  const removeIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const totals = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + ing.calories,
    protein: acc.protein + ing.protein,
    carbs: acc.carbs + ing.carbs,
    fiber: acc.fiber + ing.fiber,
    sugars: acc.sugars + ing.sugars,
    totalFat: acc.totalFat + ing.totalFat,
    saturatedFat: acc.saturatedFat + ing.saturatedFat,
    transFat: acc.transFat + ing.transFat,
    unsaturatedFat: acc.unsaturatedFat + ing.unsaturatedFat,
  }), { calories: 0, protein: 0, carbs: 0, fiber: 0, sugars: 0, totalFat: 0, saturatedFat: 0, transFat: 0, unsaturatedFat: 0 });

  const saveRecipe = async () => {
    if (!recipeName.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('Error', 'Please add at least one ingredient');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const recipeData = {
      user_id: user.id,
      name: recipeName,
      ingredients: JSON.stringify(ingredients),
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fiber: totals.fiber,
      sugars: totals.sugars,
      total_fat: totals.totalFat,
      saturated_fat: totals.saturatedFat,
      trans_fat: totals.transFat,
      unsaturated_fat: totals.unsaturatedFat,
      updated_at: new Date().toISOString(),
    };

    if (params.recipeId) {
      const { error } = await supabase
        .from('recipes')
        .update(recipeData)
        .eq('id', params.recipeId);
      if (error) {
        console.error('Update error:', error);
        Alert.alert('Error', `Failed to update recipe: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from('recipes').insert(recipeData);
      if (error) {
        console.error('Insert error:', error);
        Alert.alert('Error', `Failed to save recipe: ${error.message}`);
        return;
      }
    }

    await AsyncStorage.removeItem('recipes');
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>‹</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.titleText}>{params.recipeId ? 'Edit Recipe' : 'New Recipe'}</ThemedText>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerCancelButton}>
          <ThemedText style={styles.headerCancelButtonText}>Cancel</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={styles.macroSummary}>
        <ThemedView style={styles.macroItem}>
          <ThemedText style={styles.macroValue}>{totals.calories}</ThemedText>
          <ThemedText style={styles.macroLabel}>Calories</ThemedText>
        </ThemedView>
        <ThemedView style={styles.macroItem}>
          <ThemedText style={styles.macroValue}>{totals.protein}g</ThemedText>
          <ThemedText style={styles.macroLabel}>Protein</ThemedText>
        </ThemedView>
        <ThemedView style={styles.macroItem}>
          <ThemedText style={styles.macroValue}>{totals.carbs}g</ThemedText>
          <ThemedText style={styles.macroLabel}>Carbs</ThemedText>
        </ThemedView>
        <ThemedView style={styles.macroItem}>
          <ThemedText style={styles.macroValue}>{totals.totalFat}g</ThemedText>
          <ThemedText style={styles.macroLabel}>Fat</ThemedText>
        </ThemedView>
      </ThemedView>

      <ScrollView style={styles.content}>
        <TextInput
          style={styles.nameInput}
          placeholder="Recipe name"
          placeholderTextColor="#999"
          value={recipeName}
          onChangeText={setRecipeName}
        />

        <TouchableOpacity style={styles.scanButton} onPress={() => setAddIngredientModalVisible(true)}>
          <ThemedText style={styles.scanButtonText}>+ Add Ingredient</ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.sectionTitle}>Ingredients ({ingredients.length})</ThemedText>
        {ingredients.map((ing, idx) => (
          <ThemedView key={idx} style={styles.ingredientCard}>
            <ThemedView style={styles.ingredientHeader}>
              <ThemedText style={styles.ingredientName}>{ing.name}</ThemedText>
              <TouchableOpacity onPress={() => removeIngredient(idx)}>
                <ThemedText style={styles.removeButton}>✕</ThemedText>
              </TouchableOpacity>
            </ThemedView>
            <ThemedView style={styles.servingControls}>
              <TouchableOpacity
                style={styles.servingButton}
                onPress={() => updateServingMultiplier(idx, Math.max(0.25, ing.servingMultiplier - 0.25))}
              >
                <ThemedText style={styles.servingButtonText}>-</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.servingValue}>{ing.servingMultiplier}x</ThemedText>
              <TouchableOpacity
                style={styles.servingButton}
                onPress={() => updateServingMultiplier(idx, ing.servingMultiplier + 0.25)}
              >
                <ThemedText style={styles.servingButtonText}>+</ThemedText>
              </TouchableOpacity>
            </ThemedView>
            <ThemedText style={styles.ingredientNutrition}>
              {ing.calories} cal • {ing.protein}g protein • {ing.carbs}g carbs
            </ThemedText>
          </ThemedView>
        ))}

        <TouchableOpacity style={styles.saveButton} onPress={saveRecipe}>
          <ThemedText style={styles.saveButtonText}>Save Recipe</ThemedText>
        </TouchableOpacity>
      </ScrollView>

      <Modal animationType="slide" transparent visible={addIngredientModalVisible} onRequestClose={() => setAddIngredientModalVisible(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView}>
            <ThemedView style={styles.modalContent}>
              <ThemedView style={styles.modalHeader}>
                <ThemedText type="subtitle" style={[styles.modalTitle, { color: '#FFFFFF' }]}>Add Ingredient</ThemedText>
                <TouchableOpacity onPress={() => {
                  setAddIngredientModalVisible(false);
                  setShowManualForm(false);
                  setShowHistory(false);
                  setShowRecipes(false);
                  setShowSearch(false);
                  setSearchResults([]);
                  setSearchQuery('');
                  setServingMultiplier(1);
                  setBaseNutrition(null);
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
                }} style={styles.closeButton}>
                  <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                </TouchableOpacity>
              </ThemedView>

              {loading && (
                <ThemedText style={{ textAlign: 'center', marginBottom: 8 }}>
                  ⏳ Loading nutrition…
                </ThemedText>
              )}

              {!showManualForm && !showHistory && !showSearch && !showRecipes ? (
                <>
                  <TouchableOpacity style={styles.manualButton} onPress={() => setShowSearch(true)}>
                    <ThemedText style={styles.scanButtonText}>🔍 Search</ThemedText>
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity style={styles.manualButton} onPress={openScanner} disabled={loading}>
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
              ) : showSearch && !showHistory && !showManualForm && !showRecipes ? (
                <>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Search foods..."
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={async () => {
                      console.log('[Recipe Builder] Search submitted:', searchQuery);
                      if (searchQuery.trim().length > 2) {
                        setSearchLoading(true);
                        try {
                          const apiKey = 'rMin6NojFBwrfeRUGfKgdAf8NnAPYAThJHIrJEqE';
                          const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(searchQuery)}&pageSize=50&api_key=${apiKey}`;
                          console.log('[Recipe Builder] Fetching:', url);
                          const res = await fetch(url);
                          const data = await res.json();
                          const foods = data.foods || [];
                          console.log('[Recipe Builder] Results:', foods.length, 'foods');
                          console.log('[Recipe Builder] Setting search results...');
                          setSearchResults(foods);
                          console.log('[Recipe Builder] Search results state updated');
                        } catch (e) {
                          console.error('[Recipe Builder] Search error:', e);
                          setSearchResults([]);
                        }
                        setSearchLoading(false);
                      } else {
                        console.log('[Recipe Builder] Query too short');
                      }
                    }}
                    returnKeyType="search"
                  />
                  {searchLoading && (
                    <ThemedText style={{ textAlign: 'center', marginBottom: 8, color: '#EAEAEA' }}>⏳ Searching...</ThemedText>
                  )}
                  {!searchLoading && searchResults.length === 0 && searchQuery.length > 0 && (
                    <ThemedText style={{ textAlign: 'center', marginBottom: 8, color: '#9E9E9E' }}>No products found</ThemedText>
                  )}
                  {searchResults.length > 0 && (
                    <ThemedView style={styles.searchResultsContainer}>
                      <ScrollView style={styles.searchResultsList} nestedScrollEnabled={true}>
                        {searchResults.map((product, idx) => {
                          const mapped = mapUSDAToForm(product);
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
                                setSearchQuery('');
                                setShowManualForm(true);
                              }}
                            >
                              <ThemedText style={styles.historyItemName}>{mapped.name}</ThemedText>
                              <ThemedText style={styles.historyItemDetails}>
                                {mapped.servingSize} • {mapped.calories} cal • {mapped.protein}g protein
                              </ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </ThemedView>
                  )}
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setShowSearch(false);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                  >
                    <ThemedText style={styles.backButtonModalText}>Back</ThemedText>
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
                    <ThemedText style={styles.backButtonModalText}>Back</ThemedText>
                  </TouchableOpacity>
                </>
              ) : showHistory && !showManualForm && !showSearch && !showRecipes ? (
                <>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Search recent foods..."
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
                            {food.calories} cal • {food.protein}g protein • {food.servingMultiplier}x serving
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                  <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowHistory(false)}>
                    <ThemedText style={styles.backButtonModalText}>Back</ThemedText>
                  </TouchableOpacity>
                </>
              ) : showManualForm ? (
                <>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Food name"
                    placeholderTextColor="#999"
                    value={nutritionForm.name}
                    onChangeText={(text) => setNutritionForm(prev => ({ ...prev, name: text }))}
                  />

                  {baseNutrition && (
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
                  )}

                  <ThemedView style={styles.nutritionRow}>
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Calories"
                      placeholderTextColor="#999"
                      value={nutritionForm.calories.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, calories: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Protein (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.protein.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, protein: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                  </ThemedView>

                  <ThemedView style={styles.nutritionRow}>
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Carbs (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.carbs.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, carbs: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Fiber (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.fiber.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, fiber: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                  </ThemedView>

                  <TextInput
                    style={styles.textInput}
                    placeholder="Sugars (g)"
                    placeholderTextColor="#999"
                    value={nutritionForm.sugars.toString()}
                    onChangeText={(text) => setNutritionForm(prev => ({ ...prev, sugars: parseFloat(text) || 0 }))}
                    keyboardType="numeric"
                  />

                  <ThemedView style={styles.nutritionRow}>
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Total Fat (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.totalFat.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, totalFat: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Saturated Fat (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.saturatedFat.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, saturatedFat: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                  </ThemedView>

                  <ThemedView style={styles.nutritionRow}>
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Trans Fat (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.transFat.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, transFat: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.textInput, styles.halfInput]}
                      placeholder="Unsaturated Fat (g)"
                      placeholderTextColor="#999"
                      value={nutritionForm.unsaturatedFat.toString()}
                      onChangeText={(text) => setNutritionForm(prev => ({ ...prev, unsaturatedFat: parseFloat(text) || 0 }))}
                      keyboardType="numeric"
                    />
                  </ThemedView>

                  <ThemedView style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowManualForm(false)}>
                      <ThemedText style={styles.backButtonModalText}>Back</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.addButton2]} onPress={() => {
                      if (nutritionForm.name.trim()) {
                        const ingredient: Ingredient = {
                          ...nutritionForm,
                          servingMultiplier: servingMultiplier,
                        };
                        setIngredients(prev => [...prev, ingredient]);
                        setAddIngredientModalVisible(false);
                        setShowManualForm(false);
                        setShowHistory(false);
                        setShowRecipes(false);
                        setShowSearch(false);
                        setSearchResults([]);
                        setSearchQuery('');
                        setServingMultiplier(1);
                        setBaseNutrition(null);
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
                      }
                    }}>
                      <ThemedText style={styles.buttonText}>Add</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                </>
              ) : null}
            </ThemedView>
          </ScrollView>
        </ThemedView>
      </Modal>

      {showScanner && (
        <Modal animationType="slide" visible={showScanner} onRequestClose={handleCloseScanner}>
          <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} onClose={handleCloseScanner} />
        </Modal>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 32, fontWeight: 'bold', color: '#EAEAEA' },
  titleText: { color: '#FFFFFF' },
  headerCancelButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerCancelButtonText: {
    color: '#EAEAEA',
    fontWeight: 'bold',
    fontSize: 14,
  },
  macroSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
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
  content: { flex: 1, padding: 20 },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#EAEAEA',
    fontSize: 18,
    marginBottom: 16,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  scanButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  scanButtonText: { color: '#FFFFFF', fontSize: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#EAEAEA' },
  ingredientCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  ingredientName: { fontSize: 16, fontWeight: 'bold', flex: 1, color: '#EAEAEA' },
  removeButton: { fontSize: 20, color: '#CC0000', padding: 4 },
  servingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  servingButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#2A2A2A',
    borderWidth: 1,
  },
  servingButtonText: { fontSize: 18, fontWeight: 'bold', color: '#EAEAEA' },
  servingValue: { fontSize: 16, fontWeight: 'bold', marginHorizontal: 16, color: '#EAEAEA' },
  ingredientNutrition: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },
  saveButton: {
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveButtonText: { color: '#EAEAEA', fontWeight: 'bold', fontSize: 16 },
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
    textAlign: 'center',
  },
  closeButton: { position: 'absolute', right: 0, padding: 4 },
  closeButtonText: { fontSize: 24, color: '#EAEAEA' },
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
  searchResultsContainer: {
    height: 450,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  searchResultsList: {
    flex: 1,
  },
  historyList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  historyItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
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
    backgroundColor: '#CC0000',
  },
  addButton2: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: '#EAEAEA',
  },
  backButtonModalText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
