import { create } from 'zustand';

export interface SavedMeal {
  id: string;
  name: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
  confidence: number;
  imageUri?: string;
  savedAt: string;
}

interface MealState {
  meals: SavedMeal[];
  addMeal: (meal: Omit<SavedMeal, 'id' | 'savedAt'>) => SavedMeal;
  clearMeals: () => void;
}

export const useMealStore = create<MealState>((set) => ({
  meals: [],
  addMeal: (meal) => {
    const saved: SavedMeal = {
      ...meal,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
    };
    set((state) => ({ meals: [saved, ...state.meals] }));
    return saved;
  },
  clearMeals: () => set({ meals: [] }),
}));
