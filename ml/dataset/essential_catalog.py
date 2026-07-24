"""Essential everyday food/drink classes for Calora training (Farq-free).

Images are resolved at build time via Wikimedia Commons search.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EssentialFood:
    item_identity: str
    name_en: str
    name_ar: str
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    serving_size_g: float
    serving_label_en: str
    serving_label_ar: str
    category: str
    search_query: str
    plate_color: tuple[int, int, int] = (180, 140, 90)


ESSENTIAL_FOODS: tuple[EssentialFood, ...] = (
    # Fruits
    EssentialFood("essential.apple", "Apple", "تفاحة", 95, 0.5, 25, 0.3, 182, "medium", "حبة متوسطة", "fruit", "red apple fruit", (200, 40, 40)),
    EssentialFood("essential.banana", "Banana", "موزة", 105, 1.3, 27, 0.4, 118, "medium", "حبة متوسطة", "fruit", "banana fruit yellow", (230, 200, 50)),
    EssentialFood("essential.orange", "Orange", "برتقالة", 62, 1.2, 15, 0.2, 131, "medium", "حبة متوسطة", "fruit", "orange fruit", (240, 140, 30)),
    EssentialFood("essential.strawberry", "Strawberry", "فراولة", 49, 1, 12, 0.5, 152, "cup", "كوب", "fruit", "strawberry fruit", (220, 40, 60)),
    EssentialFood("essential.watermelon", "Watermelon", "بطيخ", 46, 0.9, 12, 0.2, 154, "cup", "كوب", "fruit", "watermelon slices", (40, 160, 70)),
    EssentialFood("essential.grapes", "Grapes", "عنب", 104, 1.1, 27, 0.2, 151, "cup", "كوب", "fruit", "grapes fruit bunch", (120, 40, 140)),
    EssentialFood("essential.mango", "Mango", "مانجو", 99, 1.4, 25, 0.6, 165, "cup", "كوب", "fruit", "mango fruit", (240, 180, 40)),
    EssentialFood("essential.dates", "Dates", "تمر", 66, 0.5, 18, 0, 24, "3 pieces", "3 حبات", "fruit", "dates fruit medjool", (90, 50, 20)),
    # Vegetables / sides
    EssentialFood("essential.salad", "Mixed Salad", "سلطة مشكلة", 35, 2, 7, 0.3, 100, "bowl", "طبق", "vegetable", "mixed green salad bowl", (80, 160, 60)),
    EssentialFood("essential.tomato", "Tomato", "طماطم", 22, 1.1, 4.8, 0.2, 123, "medium", "حبة متوسطة", "vegetable", "tomato vegetable red", (200, 40, 30)),
    EssentialFood("essential.cucumber", "Cucumber", "خيار", 16, 0.7, 3.6, 0.1, 104, "medium", "حبة متوسطة", "vegetable", "cucumber vegetable", (60, 140, 50)),
    EssentialFood("essential.carrot", "Carrot", "جزر", 25, 0.6, 6, 0.1, 61, "medium", "حبة متوسطة", "vegetable", "carrot vegetable", (230, 120, 30)),
    EssentialFood("essential.fries", "French Fries", "بطاطس مقلية", 365, 4, 48, 17, 117, "medium", "حصة متوسطة", "fast_food", "french fries", (230, 180, 60)),
    EssentialFood("essential.broccoli", "Broccoli", "بروكلي", 55, 3.7, 11, 0.6, 156, "cup", "كوب", "vegetable", "broccoli vegetable", (40, 120, 50)),
    # Proteins
    EssentialFood("essential.grilled_chicken", "Grilled Chicken", "دجاج مشوي", 165, 31, 0, 3.6, 100, "100g", "100غ", "protein", "grilled chicken breast", (180, 120, 70)),
    EssentialFood("essential.fried_chicken", "Fried Chicken", "دجاج مقلي", 320, 20, 12, 20, 120, "piece", "قطعة", "fast_food", "fried chicken piece", (170, 110, 50)),
    EssentialFood("essential.steak", "Steak", "ستيك لحم", 350, 36, 0, 22, 150, "steak", "قطعة", "protein", "beef steak cooked", (120, 40, 30)),
    EssentialFood("essential.fish", "Grilled Fish", "سمك مشوي", 180, 28, 0, 7, 120, "fillet", "فيليه", "protein", "grilled fish fillet", (200, 180, 140)),
    EssentialFood("essential.eggs", "Boiled Eggs", "بيض مسلوق", 156, 13, 1.1, 11, 100, "2 eggs", "بيضتان", "protein", "boiled eggs", (240, 230, 200)),
    EssentialFood("essential.omelette", "Omelette", "عجة", 200, 14, 2, 15, 120, "omelette", "عجة", "protein", "omelette eggs", (230, 200, 120)),
    # Meals
    EssentialFood("essential.burger", "Cheeseburger", "برغر جبن", 540, 28, 40, 28, 220, "burger", "برغر", "fast_food", "cheeseburger", (160, 100, 60)),
    EssentialFood("essential.pizza", "Pizza", "بيتزا", 285, 12, 36, 10, 107, "slice", "شريحة", "meal", "pizza margherita", (200, 140, 70)),
    EssentialFood("essential.pasta", "Pasta", "باستا", 350, 15, 45, 12, 300, "plate", "صحن", "meal", "spaghetti pasta plate", (190, 120, 50)),
    EssentialFood("essential.rice", "Rice Bowl", "صحن أرز", 206, 4.3, 45, 0.4, 158, "cup", "كوب", "grain", "cooked white rice bowl", (230, 220, 180)),
    EssentialFood("essential.shawarma", "Shawarma", "شاورما", 520, 28, 45, 24, 280, "wrap", "سندويتش", "meal", "shawarma sandwich", (170, 100, 50)),
    EssentialFood("essential.falafel", "Falafel", "فلافل", 420, 14, 48, 18, 220, "sandwich", "سندويتش", "meal", "falafel sandwich", (150, 100, 40)),
    EssentialFood("essential.hummus", "Hummus", "حمص", 270, 10, 24, 16, 150, "plate", "صحن", "meal", "hummus plate", (210, 180, 120)),
    EssentialFood("essential.kabsa", "Kabsa", "كبسة", 650, 35, 70, 22, 400, "plate", "طبق", "meal", "kabsa rice chicken", (210, 160, 80)),
    EssentialFood("essential.biryani", "Biryani", "برياني", 580, 28, 72, 18, 380, "plate", "طبق", "meal", "biryani rice", (210, 170, 90)),
    EssentialFood("essential.sushi", "Sushi", "سوشي", 250, 12, 38, 5, 150, "6 pieces", "6 قطع", "meal", "sushi platter", (240, 220, 200)),
    EssentialFood("essential.sandwich", "Sandwich", "سندويتش", 350, 18, 35, 14, 200, "sandwich", "سندويتش", "meal", "sandwich food", (180, 140, 90)),
    EssentialFood("essential.soup", "Soup", "شوربة", 180, 10, 28, 3, 250, "bowl", "طبق", "meal", "soup bowl", (180, 100, 50)),
    EssentialFood("essential.nuggets", "Chicken Nuggets", "ناجتس دجاج", 280, 14, 18, 16, 100, "6 pieces", "6 قطع", "fast_food", "chicken nuggets", (200, 150, 70)),
    # Drinks — everyday Gulf / home staples
    EssentialFood("essential.water", "Water", "ماء", 0, 0, 0, 0, 250, "glass", "كوب", "drink", "glass of drinking water", (180, 210, 230)),
    EssentialFood("essential.arabic_coffee", "Arabic Coffee", "قهوة عربية", 5, 0, 1, 0, 60, "cup", "فنجان", "drink", "arabic coffee dallah cup", (180, 150, 100)),
    EssentialFood("essential.karak", "Karak Tea", "شاي كرك", 120, 4, 18, 3.5, 200, "cup", "كوب", "drink", "karak chai tea milk", (140, 90, 40)),
    EssentialFood("essential.tea", "Tea", "شاي", 40, 0, 10, 0, 200, "cup", "كوب", "drink", "black tea cup", (120, 70, 30)),
    EssentialFood("essential.green_tea", "Green Tea", "شاي أخضر", 2, 0, 0, 0, 240, "cup", "كوب", "drink", "green tea cup", (160, 180, 100)),
    EssentialFood("essential.mint_tea", "Mint Tea", "شاي بالنعناع", 30, 0, 7, 0, 200, "cup", "كوب", "drink", "mint tea moroccan", (100, 140, 70)),
    EssentialFood("essential.coffee", "Black Coffee", "قهوة سادة", 5, 0.3, 0, 0, 240, "cup", "فنجان", "drink", "black coffee cup", (40, 25, 15)),
    EssentialFood("essential.cappuccino", "Cappuccino", "كابتشينو", 120, 6, 10, 6, 180, "cup", "كوب", "drink", "cappuccino foam", (200, 180, 150)),
    EssentialFood("essential.latte", "Latte", "لاتيه", 150, 8, 12, 7, 240, "cup", "كوب", "drink", "latte coffee cup", (210, 190, 160)),
    EssentialFood("essential.iced_coffee", "Iced Coffee", "آيس كوفي", 180, 4, 30, 4, 350, "cup", "كوب", "drink", "iced coffee glass", (120, 80, 50)),
    EssentialFood("essential.laban", "Laban", "لبن", 90, 6, 10, 2.5, 200, "cup", "كوب", "drink", "laban buttermilk drink", (240, 240, 235)),
    EssentialFood("essential.milk", "Milk", "حليب", 150, 8, 12, 8, 244, "cup", "كوب", "drink", "glass of milk", (245, 245, 245)),
    EssentialFood("essential.chocolate_milk", "Chocolate Milk", "حليب بالشوكولاتة", 190, 8, 26, 5, 250, "cup", "كوب", "drink", "chocolate milk glass", (90, 50, 30)),
    EssentialFood("essential.orange_juice", "Orange Juice", "عصير برتقال", 110, 2, 26, 0.3, 240, "glass", "كوب", "drink", "orange juice glass", (240, 150, 40)),
    EssentialFood("essential.apple_juice", "Apple Juice", "عصير تفاح", 114, 0.2, 28, 0.3, 240, "glass", "كوب", "drink", "apple juice glass", (220, 160, 50)),
    EssentialFood("essential.mango_juice", "Mango Juice", "عصير مانجو", 130, 1, 32, 0.5, 240, "glass", "كوب", "drink", "mango juice glass", (240, 180, 40)),
    EssentialFood("essential.lemonade", "Lemonade", "ليمونادة", 100, 0.5, 26, 0, 240, "glass", "كوب", "drink", "lemonade glass lemon", (230, 220, 100)),
    EssentialFood("essential.lemon_mint", "Lemon Mint", "ليمون نعناع", 70, 0.5, 17, 0, 300, "glass", "كوب", "drink", "lemon mint drink", (160, 200, 120)),
    EssentialFood("essential.cola", "Cola / Pepsi", "كولا / بيبسي", 140, 0, 39, 0, 330, "can", "علبة", "drink", "pepsi cola can", (20, 20, 20)),
    EssentialFood("essential.diet_cola", "Diet Cola", "كولا دايت", 0, 0, 0, 0, 330, "can", "علبة", "drink", "diet coke can", (40, 40, 40)),
    EssentialFood("essential.sprite", "Sprite / 7up", "سفن أب / سبرايت", 140, 0, 38, 0, 330, "can", "علبة", "drink", "sprite soda can", (200, 220, 200)),
    EssentialFood("essential.energy_drink", "Energy Drink", "مشروب طاقة", 160, 0, 40, 0, 250, "can", "علبة", "drink", "energy drink can red bull", (20, 80, 160)),
    EssentialFood("essential.vimto", "Vimto", "فيمتو", 90, 0, 22, 0, 250, "glass", "كوب", "drink", "vimto soft drink purple", (100, 30, 90)),
    EssentialFood("essential.hot_chocolate", "Hot Chocolate", "هوت شوكلت", 240, 8, 30, 10, 240, "cup", "كوب", "drink", "hot chocolate mug", (90, 50, 25)),
    EssentialFood("essential.smoothie", "Smoothie", "سموثي", 220, 4, 45, 2, 300, "cup", "كوب", "drink", "fruit smoothie", (180, 60, 100)),
    EssentialFood("essential.protein_shake", "Protein Shake", "بروتين شيك", 180, 25, 8, 3, 300, "shake", "كوب", "drink", "protein shake bottle", (200, 200, 210)),
    # Breakfast / bakery / dessert
    EssentialFood("essential.croissant", "Croissant", "كرواسون", 230, 5, 26, 12, 57, "piece", "قطعة", "bakery", "croissant pastry", (210, 160, 80)),
    EssentialFood("essential.pancake", "Pancakes", "بان كيك", 350, 8, 48, 14, 150, "2 pancakes", "2 قطع", "breakfast", "pancakes butter", (230, 190, 120)),
    EssentialFood("essential.waffle", "Waffle", "وافل", 280, 7, 40, 10, 75, "waffle", "واحدة", "breakfast", "waffle breakfast", (200, 150, 80)),
    EssentialFood("essential.bread", "Bread", "خبز", 80, 3, 15, 1, 30, "slice", "شريحة", "bakery", "fresh bread loaf", (210, 170, 100)),
    EssentialFood("essential.ice_cream", "Ice Cream", "آيس كريم", 180, 3, 22, 10, 80, "scoop", "كرة", "dessert", "ice cream scoop", (250, 220, 220)),
    EssentialFood("essential.cake", "Cake", "كيك", 350, 4, 48, 16, 80, "slice", "شريحة", "dessert", "chocolate cake slice", (90, 50, 30)),
    EssentialFood("essential.donut", "Donut", "دونات", 300, 4, 35, 16, 60, "piece", "قطعة", "dessert", "donut glazed", (200, 140, 80)),
    EssentialFood("essential.kunafa", "Kunafa", "كنافة", 420, 8, 48, 22, 120, "piece", "قطعة", "dessert", "kunafa dessert", (200, 140, 60)),
    EssentialFood("essential.chocolate", "Chocolate", "شوكولاتة", 250, 3, 28, 14, 45, "bar", "لوح", "dessert", "chocolate bar", (70, 35, 20)),
    EssentialFood("essential.yogurt", "Yogurt", "زبادي", 100, 9, 8, 3.5, 170, "cup", "كوب", "dairy", "yogurt cup", (245, 245, 240)),
)
