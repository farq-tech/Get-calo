# Colab (Private repo)

Because `farq-sa/Get-calo` is **private**, open Colab like this:

1. Download `colab_train_calora.ipynb` from the repo (GitHub → file → Download / or from PR).
2. Open https://colab.research.google.com
3. File → Upload notebook → select `colab_train_calora.ipynb`
4. Runtime → GPU (T4)
5. Create a GitHub PAT: https://github.com/settings/tokens → classic → scope `repo`
6. Paste Farq + Calora + GitHub token in cell 1
7. Runtime → Run all

Expected time: **1–2.5 hours**. Downloads at the end: `best.onnx`, `labels.json`, `nutrition.sqlite`.
