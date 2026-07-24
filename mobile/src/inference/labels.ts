import modelLabels from '../../assets/models/labels.json';

export interface ModelClass {
  classId: number;
  itemIdentity: string;
  nameEn: string;
  nameAr: string | null;
  calories: number | null;
  category: string | null;
}

const classes: ModelClass[] = (modelLabels.classes as Array<Record<string, unknown>>).map(
  (row) => ({
    classId: Number(row.class_id),
    itemIdentity: String(row.item_identity),
    nameEn: String(row.name_en),
    nameAr: (row.name_ar as string | null) ?? null,
    calories: row.calories == null ? null : Number(row.calories),
    category: (row.category as string | null) ?? null,
  }),
);

export const MODEL_NUM_CLASSES = classes.length;
export const MODEL_INPUT_SIZE = 640;

export function getModelClasses(): ModelClass[] {
  return classes;
}

export function getModelClass(classId: number): ModelClass | null {
  return classes.find((c) => c.classId === classId) ?? classes[classId] ?? null;
}
