import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarcodeScanner from '@/components/BarcodeScanner';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

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

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const currentHour = new Date().getHours();

  const dailyTotals = useMemo(() => {
    return meals.reduce((acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
    }), { calories: 0, protein: 0, carbs: 0 });
  }, [meals]);

  const getMealsForHour = (hour: number) => meals.filter(m => m.hour === hour);

  const addMeal = () => {
    if (nutritionForm.name.trim()) {
      const newMeal: Meal = {
        ...nutritionForm,
        id: Date.now().toString(),
        hour: selectedHour,
      };
      setMeals(prev => [...prev, newMeal]);
      resetModal();
    }
  };

  const updateMeal = () => {
    if (editingMeal && nutritionForm.name.trim()) {
      setMeals(prev => prev.map(m =>
          m.id === editingMeal.id ? { ...nutritionForm, id: m.id, hour: m.hour } : m
      ));
      setEditModalVisible(false);
      setEditingMeal(null);
      resetForm();
    }
  };

  const deleteMeal = (id: string) => {
    setMeals(prev => prev.filter(m => m.id !== id));
    setEditModalVisible(false);
    setEditingMeal(null);
  };

  const resetModal = () => {
    setModalVisible(false);
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

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

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
        setSelectedHour((h) => (typeof h === 'number' ? h : new Date().getHours()));
        setModalVisible(true); // reopen only after fields are ready
      } else {
        Alert.alert('Product not found', `No nutrition information for barcode ${barcode}.`);
        setModalVisible(true);
      }
    } catch (e: any) {
      if (!isMounted.current) return;
      if (e?.name === 'AbortError') {
        Alert.alert('Timeout', 'Fetching product info took too long. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to fetch product information.');
      }
      setModalVisible(true);
    } finally {
      clearTimeout(timeoutId);
      if (isMounted.current) setLoading(false);
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
    setEditModalVisible(true);
  };

  return (
      <ThemedView style={styles.container}>
        <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <ThemedText type="title">Meals</ThemedText>
          <ThemedView style={styles.macroSummary}>
            <ThemedView style={styles.macroItem}>
              <ThemedText style={styles.macroValue}>{dailyTotals.calories}</ThemedText>
              <ThemedText style={styles.macroLabel}>Calories</ThemedText>
            </ThemedView>
            <ThemedView style={styles.macroItem}>
              <ThemedText style={styles.macroValue}>{dailyTotals.protein}g</ThemedText>
              <ThemedText style={styles.macroLabel}>Protein</ThemedText>
            </ThemedView>
            <ThemedView style={styles.macroItem}>
              <ThemedText style={styles.macroValue}>{dailyTotals.carbs}g</ThemedText>
              <ThemedText style={styles.macroLabel}>Carbs</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {hours.map(hour => (
              <ThemedView key={hour} style={[styles.hourRow, hour === currentHour && styles.currentHourRow]}>
                <ThemedView style={styles.timeSection}>
                  <ThemedText type="defaultSemiBold" style={hour === currentHour && styles.currentHourText}>
                    {formatHour(hour)}
                  </ThemedText>
                </ThemedView>

                <ThemedView style={styles.mealsSection}>
                  {getMealsForHour(hour).map((meal) => (
                      <TouchableOpacity key={meal.id} onPress={() => openEditModal(meal)}>
                        <ThemedView style={styles.mealItem}>
                          <ThemedText>{meal.name}</ThemedText>
                        </ThemedView>
                      </TouchableOpacity>
                  ))}
                </ThemedView>

                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                      setSelectedHour(hour);
                      setModalVisible(true);
                    }}
                >
                  <ThemedText style={styles.addButtonText}>+</ThemedText>
                </TouchableOpacity>
              </ThemedView>
          ))}
        </ScrollView>

        <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={resetModal}>
          <ThemedView style={styles.modalOverlay}>
            <ScrollView style={styles.modalScrollView}>
              <ThemedView style={styles.modalContent}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Add meal for {formatHour(selectedHour)}
                </ThemedText>

                {loading && (
                    <ThemedText style={{ textAlign: 'center', marginBottom: 8 }}>
                      ⏳ Loading nutrition…
                    </ThemedText>
                )}

                <TouchableOpacity style={styles.scanButton} onPress={openScanner} disabled={loading}>
                  <ThemedText style={styles.scanButtonText}>
                    {loading ? '⏳ Please wait…' : '📷 Scan Barcode'}
                  </ThemedText>
                </TouchableOpacity>

                <TextInput
                    style={styles.textInput}
                    placeholder="Food name"
                    placeholderTextColor="#999"
                    value={nutritionForm.name}
                    onChangeText={(text) => setNutritionForm(prev => ({ ...prev, name: text }))}
                />

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
                  <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={resetModal}>
                    <ThemedText>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButton, styles.addButton2]} onPress={addMeal}>
                    <ThemedText style={styles.buttonText}>Add</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </ThemedView>
            </ScrollView>
          </ThemedView>
        </Modal>

        <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
          <ThemedView style={styles.modalOverlay}>
            <ScrollView style={styles.modalScrollView}>
              <ThemedView style={styles.modalContent}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Edit Meal
                </ThemedText>

                <TextInput
                    style={styles.textInput}
                    placeholder="Food name"
                    placeholderTextColor="#999"
                    value={nutritionForm.name}
                    onChangeText={(text) => setNutritionForm(prev => ({ ...prev, name: text }))}
                />

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

        {showScanner && (
          <Modal animationType="slide" visible={showScanner} onRequestClose={handleCloseScanner}>
            <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} onClose={handleCloseScanner} />
          </Modal>
        )}
      </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3A3A3C',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: 'rgba(58,58,60,0.95)',
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
    color: '#FFFFFF',
  },
  macroLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
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
    borderBottomColor: '#121212',
    backgroundColor: 'transparent',
  },
  currentHourRow: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: -16,
    paddingHorizontal: 32,
  },
  currentHourText: {
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(58,58,60,0.95)',
    padding: 8,
    marginVertical: 2,
    borderRadius: 8,
    borderColor: '#121212',
    borderWidth: 1,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
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
    backgroundColor: '#3A3A3C',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 60,
    borderColor: '#121212',
    borderWidth: 1,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    marginBottom: 12,
    borderColor: '#121212',
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
  scanButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    borderColor: '#121212',
    borderWidth: 1,
  },
  scanButtonText: {
    color: '#FFFFFF',
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
    backgroundColor: '#000000',
  },
  deleteButton: {
    backgroundColor: '#CC0000',
  },
  buttonText: {
    color: '#FFFFFF',
  },
});
