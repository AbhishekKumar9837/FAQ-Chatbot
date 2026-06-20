#!/usr/bin/env bash
# build.sh — Run by Render during the build phase
# Downloads NLTK data packages needed by app.py
set -o errexit

pip install -r requirements.txt

python -c "
import nltk
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)
nltk.download('stopwords', quiet=True)
nltk.download('wordnet', quiet=True)
nltk.download('omw-1.4', quiet=True)
print('NLTK data downloaded successfully.')
"
