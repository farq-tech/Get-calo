import type { NutritionItem } from '@/types';
import sample from '../../assets/nutrition.sample.json';

export interface SeedNutritionRow {
  class_id: number;
  item_identity: string;
  name_en: string;
  name_ar: string | null;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size_g: number;
  serving_label_en: string;
  serving_label_ar: string | null;
  category: string | null;
}

export function getBundledNutritionSeed(): SeedNutritionRow[] {
  return sample as SeedNutritionRow[];
}

export function seedRowToNutritionItem(row: SeedNutritionRow): NutritionItem {
  return {
    classId: row.class_id,
    itemIdentity: row.item_identity,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    servingSizeG: row.serving_size_g,
    servingLabelEn: row.serving_label_en,
    servingLabelAr: row.serving_label_ar,
    category: row.category,
  };
}
