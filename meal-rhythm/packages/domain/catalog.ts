import { Candidate, Food } from './models';

// Development catalog only: approximate cooked-food values, not a licensed clinical dataset.
// The source label is included in all API responses. Production requires a reviewed catalog file.
export const catalogVersion = 'demo-foods-2026-09-v1';
const food = (id: string, name: string, category: string, energy: number, protein: number, fiber: number, water: number, allergens: string[] = [], aliases: string[] = []): Food =>
  ({ id, name, category, per100g: { energy, protein, fiber, water }, allergens, aliases, source: '开发参考数据，待营养数据审核' });
export const foods: Food[] = [
  food('rice', '米饭', 'grain', 130, 2.7, 0.4, 68, [], ['饭', '白饭']),
  food('chicken', '鸡胸肉', 'protein', 165, 31, 0, 65, [], ['鸡肉', '鸡']),
  food('broccoli', '西兰花', 'vegetable', 35, 2.4, 3.3, 89, [], ['蔬菜', '青菜']),
  food('tofu', '豆腐', 'protein', 80, 8, 1, 85, ['soy', '大豆', '豆类']),
  food('egg', '鸡蛋', 'protein', 155, 13, 0, 75, ['egg', '鸡蛋'], ['蛋']),
  food('oats', '燕麦', 'grain', 71, 2.5, 1.7, 84, ['gluten', '麸质'], ['燕麦粥']),
  food('yogurt', '原味酸奶', 'dairy', 63, 5.3, 0, 85, ['milk', '乳', '牛奶'], ['酸奶']),
  food('apple', '苹果', 'fruit', 52, 0.3, 2.4, 86),
  food('beef', '瘦牛肉', 'protein', 200, 29, 0, 65, [], ['牛肉', '牛']),
  food('noodles', '面条', 'grain', 138, 4.5, 1.8, 65, ['gluten', '麸质', '小麦'], ['面']),
  food('salmon', '三文鱼', 'protein', 208, 20, 0, 64, ['fish', '鱼']),
  food('water', '饮用水', 'water', 0, 0, 0, 100, [], ['水'])
];
export const candidates: Candidate[] = [
  { id: 'chicken-bowl', title: '鸡肉饭配西兰花', items: [{ foodId: 'chicken', grams: 120 }, { foodId: 'rice', grams: 150 }, { foodId: 'broccoli', grams: 200 }], scene: 'takeaway', minutes: 15, substitution: '可在食物列表中换成已确认安全的蛋白质来源' },
  { id: 'tofu-bowl', title: '豆腐蔬菜饭', items: [{ foodId: 'tofu', grams: 200 }, { foodId: 'rice', grams: 150 }, { foodId: 'broccoli', grams: 200 }], scene: 'home', minutes: 15, substitution: '主食份量可按饥饿程度调整' },
  { id: 'yogurt-oats', title: '酸奶燕麦和苹果', items: [{ foodId: 'yogurt', grams: 200 }, { foodId: 'oats', grams: 180 }, { foodId: 'apple', grams: 150 }], scene: 'convenience', minutes: 5, substitution: '不适合乳制品时选择其他已筛选的组合' },
  { id: 'beef-noodles', title: '牛肉面加蔬菜', items: [{ foodId: 'beef', grams: 100 }, { foodId: 'noodles', grams: 180 }, { foodId: 'broccoli', grams: 150 }], scene: 'takeaway', minutes: 15, substitution: '酱汁和用油无法确认时保持范围估算' },
  { id: 'salmon-bowl', title: '三文鱼蔬菜饭', items: [{ foodId: 'salmon', grams: 120 }, { foodId: 'rice', grams: 150 }, { foodId: 'broccoli', grams: 200 }], scene: 'home', minutes: 20, substitution: '可以减少主食或增加蔬菜' }
];
