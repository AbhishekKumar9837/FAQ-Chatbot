# FAQ Chatbot 🤖

An AI-powered FAQ Chatbot for **Technology & Software Products**, built with Python Flask, NLTK NLP, and TF-IDF + Cosine Similarity.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🧠 NLP Engine | NLTK tokenization, stopword removal, lemmatization |
| 📊 Similarity | TF-IDF Vectorizer + Cosine Similarity (Scikit-learn) |
| 🎯 Confidence Threshold | Configurable (default: 0.25) |
| 🎤 Speech-to-Text | Web Speech API (Chrome/Edge) |
| 🔊 Text-to-Speech | Web Speech API (all modern browsers) |
| 🌗 Dark/Light Mode | Persisted in localStorage |
| 📋 FAQ Manager | Add / Delete / Search / Filter by category |
| 📜 Export | Download conversation as `.txt` |
| 📱 Responsive | Mobile + Desktop |

---

## 🗂 Project Structure

```
FAQ Chatbot/
├── app.py              # Flask app + NLP engine
├── faq_data.json       # 35 FAQ entries (Technology topic)
├── requirements.txt    # Python dependencies
├── README.md
├── static/
│   ├── style.css       # Dark glassmorphism UI
│   └── script.js       # Chat logic, Voice I/O
└── templates/
    └── index.html      # Chat interface
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.9+
- pip

### 1. Clone / Download the project

```bash
cd "FAQ Chatbot"
```

### 2. Create a virtual environment (recommended)

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

```bash
python app.py
```

### 5. Open in browser

```
http://127.0.0.1:5000
```

---

## 🔧 Configuration

Set the confidence threshold via environment variable:

```bash
set THRESHOLD=0.30     # Windows
export THRESHOLD=0.30  # Linux/macOS
python app.py
```

---

## 🌐 API Reference

### `POST /ask`
Ask a question.

**Request:**
```json
{ "question": "How do I reset my password?" }
```

**Response (matched):**
```json
{
  "answer": "Click on the 'Forgot Password' link...",
  "score": 0.8241,
  "matched_question": "How can I reset my password?",
  "category": "Account",
  "matched": true
}
```

**Response (no match):**
```json
{
  "answer": "Sorry, I couldn't find a suitable answer...",
  "score": 0.04,
  "matched_question": null,
  "matched": false
}
```

---

### `GET /faqs`
Returns all FAQ entries as a JSON array.

### `POST /faqs`
Add a new FAQ.

**Body:**
```json
{ "question": "...", "answer": "...", "category": "Billing" }
```

### `DELETE /faqs/<id>`
Delete a FAQ by numeric ID.

---

## 🧠 NLP Pipeline

```
User Input
    ↓
Lowercase
    ↓
Remove Punctuation
    ↓
Tokenize (NLTK word_tokenize)
    ↓
Remove Stopwords (NLTK English)
    ↓
Lemmatize (WordNetLemmatizer)
    ↓
TF-IDF Vectorize (Scikit-learn)
    ↓
Cosine Similarity vs all FAQs
    ↓
Best Match → Answer
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| Flask | Web framework |
| flask-cors | CORS support |
| nltk | NLP preprocessing |
| scikit-learn | TF-IDF + Cosine Similarity |
| numpy | Numerical operations |
| pandas | (available for data ops) |

---

## 🏷️ FAQ Categories

- **Account** — password, profile, login, language
- **Security** — 2FA, data privacy, hacking
- **Billing** — plans, payments, refunds, invoices, free trial
- **Installation** — desktop, mobile, OS support, updates
- **Features** — offline, sync, export, sharing, file size, integrations
- **Troubleshooting** — crashes, slow app, notifications
- **Support** — contact, hours, feature requests
- **Developer** — API access, rate limits

---

## 📝 License

MIT © 2024 FAQ Chatbot Project
