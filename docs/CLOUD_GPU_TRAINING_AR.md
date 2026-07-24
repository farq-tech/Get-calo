# تدريب Calora على GPU بدون جهاز خاص

ما تحتاج لابتوب قوي. استخدم **Google Colab** (مجاني تقريباً) أو RunPod (مدفوع ورخيص).

---

## الخيار الموصى به: Google Colab (مجاني)

### الوقت المتوقع
| المرحلة | على Colab T4 |
|---------|--------------|
| بناء الداتاسيت من Farq | 15–40 دقيقة |
| تدريب YOLO 50 epoch | 30–90 دقيقة |
| تصدير ONNX | 2–5 دقائق |
| **المجموع** | تقريباً **1–2.5 ساعة** |

### الخطوات

1. افتح Google Colab: https://colab.research.google.com  
2. Runtime → **Change runtime type** → GPU (T4) → Save  
3. ارفع الملف `ml/cloud/colab_train_calora.ipynb` (File → Upload notebook)  
   أو انسخ خلايا الملف `ml/cloud/colab_train_calora.py` في notebook جديد.  
4. في الخلية الأولى ضع أسرارك (لا تشاركها):

```text
FARQ_SUPABASE_URL=https://mpgbvtaguerncgbzvpwg.supabase.co
FARQ_SUPABASE_SERVICE_KEY=...
CALORIE_SUPABASE_URL=https://ajwsmbysakuukgfewaei.supabase.co
CALORIE_SUPABASE_SERVICE_KEY=...
```

5. شغّل كل الخلايا بالترتيب.  
6. في النهاية حمّل من Colab:
   - `best.onnx`
   - `labels.json`
   - `nutrition.sqlite`
   - `manifest.json`

7. ضعها في المشروع:

```bash
mkdir -p mobile/assets/models
cp best.onnx labels.json nutrition.sqlite mobile/assets/models/
```

8. ابنِ تطبيق مخصص (مو Expo Go) عشان ONNX:

```bash
cd mobile && npx expo prebuild && npx expo run:android
# أو EAS build
```

---

## خيار أسرع مدفوع: RunPod / Vast.ai

- استأجر GPU مثل RTX 4090 أو A40 (~$0.3–0.6/ساعة).
- ارفع سكربت `ml/cloud/train_remote.sh`.
- عادة يخلص التدريب في **20–45 دقيقة**.

```bash
# على الجهاز السحابي بعد استنساخ الريبو
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp /path/to/.env .env   # فيه FARQ_* و CALORIE_*
bash cloud/train_remote.sh
```

---

## ليش مو على جهازك؟

التدريب السابق على CPU في السحابة كان بطيء جداً (~ساعة لكل epoch).  
GPU يسرّع غالباً **10×–50×**.

---

## ملاحظة عن الجودة

النموذج المبكر `v0.1.0-early-epoch5` ضعيف (توقف مبكراً).  
بعد Colab بـ 50–100 epoch راح يصير عندك نموذج قابل للاختبار الحقيقي.
