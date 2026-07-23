"""Farq-free demo food catalog for bootstrap training + nutrition seed.

Image sources (no Farq):
1. Foodish public meal photos (https://foodish-api.com)
2. Procedural synthetic images as offline fallback
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DemoFood:
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
    image_urls: tuple[str, ...]
    # RGB hint for synthetic fallback plates
    plate_color: tuple[int, int, int] = (180, 140, 90)


DEMO_FOODS: tuple[DemoFood, ...] = (
    DemoFood(
        item_identity="demo.burger",
        name_en="Cheeseburger",
        name_ar="برغر جبن",
        calories_kcal=540,
        protein_g=25,
        carbs_g=40,
        fat_g=31,
        serving_size_g=220,
        serving_label_en="burger",
        serving_label_ar="برغر",
        category="american",
        image_urls=(
            "https://foodish-api.com/images/burger/burger1.jpg",
            "https://foodish-api.com/images/burger/burger2.jpg",
            "https://foodish-api.com/images/burger/burger3.jpg",
            "https://foodish-api.com/images/burger/burger4.jpg",
        ),
        plate_color=(160, 100, 60),
    ),
    DemoFood(
        item_identity="demo.pizza",
        name_en="Pizza",
        name_ar="بيتزا",
        calories_kcal=266,
        protein_g=11,
        carbs_g=33,
        fat_g=10,
        serving_size_g=100,
        serving_label_en="slice",
        serving_label_ar="شريحة",
        category="italian",
        image_urls=(
            "https://foodish-api.com/images/pizza/pizza1.jpg",
            "https://foodish-api.com/images/pizza/pizza2.jpg",
            "https://foodish-api.com/images/pizza/pizza3.jpg",
            "https://foodish-api.com/images/pizza/pizza4.jpg",
        ),
        plate_color=(200, 140, 70),
    ),
    DemoFood(
        item_identity="demo.pasta",
        name_en="Pasta",
        name_ar="باستا",
        calories_kcal=350,
        protein_g=15,
        carbs_g=45,
        fat_g=12,
        serving_size_g=300,
        serving_label_en="plate",
        serving_label_ar="صحن",
        category="italian",
        image_urls=(
            "https://foodish-api.com/images/pasta/pasta1.jpg",
            "https://foodish-api.com/images/pasta/pasta2.jpg",
            "https://foodish-api.com/images/pasta/pasta3.jpg",
        ),
        plate_color=(190, 120, 50),
    ),
    DemoFood(
        item_identity="demo.rice",
        name_en="Rice Bowl",
        name_ar="صحن أرز",
        calories_kcal=230,
        protein_g=6,
        carbs_g=45,
        fat_g=3,
        serving_size_g=200,
        serving_label_en="bowl",
        serving_label_ar="وعاء",
        category="asian",
        image_urls=(
            "https://foodish-api.com/images/rice/rice1.jpg",
            "https://foodish-api.com/images/rice/rice2.jpg",
            "https://foodish-api.com/images/rice/rice3.jpg",
        ),
        plate_color=(230, 220, 180),
    ),
    DemoFood(
        item_identity="demo.dessert",
        name_en="Dessert",
        name_ar="حلويات",
        calories_kcal=320,
        protein_g=4,
        carbs_g=45,
        fat_g=14,
        serving_size_g=120,
        serving_label_en="serving",
        serving_label_ar="حصة",
        category="dessert",
        image_urls=(
            "https://foodish-api.com/images/dessert/dessert1.jpg",
            "https://foodish-api.com/images/dessert/dessert2.jpg",
            "https://foodish-api.com/images/dessert/dessert3.jpg",
        ),
        plate_color=(120, 70, 50),
    ),
    DemoFood(
        item_identity="demo.samosa",
        name_en="Samosa",
        name_ar="سمبوسة",
        calories_kcal=250,
        protein_g=5,
        carbs_g=28,
        fat_g=14,
        serving_size_g=80,
        serving_label_en="piece",
        serving_label_ar="قطعة",
        category="snack",
        image_urls=(
            "https://foodish-api.com/images/samosa/samosa1.jpg",
            "https://foodish-api.com/images/samosa/samosa2.jpg",
            "https://foodish-api.com/images/samosa/samosa3.jpg",
        ),
        plate_color=(200, 160, 80),
    ),
    DemoFood(
        item_identity="demo.biryani",
        name_en="Biryani",
        name_ar="برياني",
        calories_kcal=450,
        protein_g=22,
        carbs_g=55,
        fat_g=16,
        serving_size_g=350,
        serving_label_en="plate",
        serving_label_ar="صحن",
        category="indian",
        image_urls=(
            "https://foodish-api.com/images/biryani/biryani1.jpg",
            "https://foodish-api.com/images/biryani/biryani2.jpg",
            "https://foodish-api.com/images/biryani/biryani3.jpg",
        ),
        plate_color=(210, 170, 90),
    ),
    DemoFood(
        item_identity="demo.butter_chicken",
        name_en="Butter Chicken",
        name_ar="دجاج بالزبدة",
        calories_kcal=490,
        protein_g=28,
        carbs_g=18,
        fat_g=34,
        serving_size_g=300,
        serving_label_en="plate",
        serving_label_ar="صحن",
        category="indian",
        image_urls=(
            "https://foodish-api.com/images/butter-chicken/butter-chicken1.jpg",
            "https://foodish-api.com/images/butter-chicken/butter-chicken2.jpg",
            "https://foodish-api.com/images/butter-chicken/butter-chicken3.jpg",
        ),
        plate_color=(180, 80, 40),
    ),
    DemoFood(
        item_identity="demo.dosa",
        name_en="Dosa",
        name_ar="دوسا",
        calories_kcal=280,
        protein_g=6,
        carbs_g=40,
        fat_g=10,
        serving_size_g=200,
        serving_label_en="plate",
        serving_label_ar="صحن",
        category="indian",
        image_urls=(
            "https://foodish-api.com/images/dosa/dosa1.jpg",
            "https://foodish-api.com/images/dosa/dosa2.jpg",
            "https://foodish-api.com/images/dosa/dosa3.jpg",
        ),
        plate_color=(220, 190, 120),
    ),
    DemoFood(
        item_identity="demo.idly",
        name_en="Idli",
        name_ar="إدلي",
        calories_kcal=150,
        protein_g=5,
        carbs_g=28,
        fat_g=2,
        serving_size_g=120,
        serving_label_en="serving",
        serving_label_ar="حصة",
        category="indian",
        image_urls=(
            "https://foodish-api.com/images/idly/idly1.jpg",
            "https://foodish-api.com/images/idly/idly2.jpg",
            "https://foodish-api.com/images/idly/idly3.jpg",
        ),
        plate_color=(240, 235, 220),
    ),
)
