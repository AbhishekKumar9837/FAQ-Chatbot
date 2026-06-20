"""
FAQ Chatbot — Flask Backend
============================
Uses NLTK for NLP preprocessing and a pure-Python/NumPy TF-IDF + Cosine
Similarity engine to match user queries against a predefined FAQ dataset.
(scikit-learn / scipy are NOT required — pure stdlib + numpy only.)

Endpoints:
  GET  /          → Serve the chat UI
  POST /ask       → { "question": "..." } → { "answer": "...", "score": 0.82, "matched_question": "..." }
  GET  /faqs      → Return all FAQs
  POST /faqs      → Add a new FAQ
  DELETE /faqs/<id> → Delete a FAQ by ID
"""

import json
import os
import re
import string

import math
from collections import Counter

import nltk
import numpy as np
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # Enable CORS for development

# Confidence threshold — if the best match score is below this, the bot
# responds with a fallback message. Configurable via environment variable.
THRESHOLD = float(os.environ.get("THRESHOLD", 0.25))

# Path to the FAQ data file (same directory as this script)
FAQ_FILE = os.path.join(os.path.dirname(__file__), "faq_data.json")

# ---------------------------------------------------------------------------
# NLTK downloads (run once; silently skips if already present)
# ---------------------------------------------------------------------------
def download_nltk_resources():
    resources = ["punkt", "stopwords", "wordnet", "omw-1.4", "punkt_tab"]
    for resource in resources:
        try:
            nltk.download(resource, quiet=True)
        except Exception:
            pass  # Offline or already downloaded — continue gracefully

download_nltk_resources()

# ---------------------------------------------------------------------------
# NLP Preprocessing
# ---------------------------------------------------------------------------
lemmatizer = WordNetLemmatizer()
stop_words = set(stopwords.words("english"))


def preprocess(text: str) -> str:
    """
    Full NLP preprocessing pipeline:
      1. Lowercase
      2. Remove punctuation
      3. Tokenize
      4. Remove stopwords
      5. Lemmatize
    Returns a cleaned string ready for TF-IDF vectorization.
    """
    # Step 1: Lowercase
    text = text.lower()

    # Step 2: Remove punctuation
    text = text.translate(str.maketrans("", "", string.punctuation))

    # Step 3: Remove extra whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Step 4: Tokenize
    tokens = word_tokenize(text)

    # Step 5: Remove stopwords and non-alphabetic tokens
    tokens = [t for t in tokens if t.isalpha() and t not in stop_words]

    # Step 6: Lemmatize
    tokens = [lemmatizer.lemmatize(t) for t in tokens]

    return " ".join(tokens)


# ---------------------------------------------------------------------------
# Pure-Python TF-IDF + Cosine Similarity (no scipy / scikit-learn needed)
# ---------------------------------------------------------------------------

def _build_tfidf(corpus: list[str]):
    """
    Build a TF-IDF matrix from a list of preprocessed document strings.
    Returns (vocab, idf_vector, tfidf_matrix) where tfidf_matrix is an
    ndarray of shape (n_docs, vocab_size).
    """
    # Tokenise each document
    tokenised = [doc.split() for doc in corpus]
    n_docs = len(tokenised)

    # Build vocabulary
    vocab = sorted(set(tok for doc in tokenised for tok in doc))
    word2idx = {w: i for i, w in enumerate(vocab)}
    V = len(vocab)

    # Term frequency matrix  (n_docs × V)
    tf_matrix = np.zeros((n_docs, V), dtype=np.float64)
    for d_idx, tokens in enumerate(tokenised):
        counts = Counter(tokens)
        for tok, cnt in counts.items():
            tf_matrix[d_idx, word2idx[tok]] = cnt / len(tokens)

    # Inverse document frequency vector (with smoothing like sklearn)
    df = np.sum(tf_matrix > 0, axis=0)          # document frequency per term
    idf = np.log((1 + n_docs) / (1 + df)) + 1   # smooth IDF

    # TF-IDF matrix
    tfidf = tf_matrix * idf

    # L2-normalise each row so cosine similarity = dot product
    norms = np.linalg.norm(tfidf, axis=1, keepdims=True)
    norms[norms == 0] = 1
    tfidf_normed = tfidf / norms

    return word2idx, idf, tfidf_normed


def _vectorize(query: str, word2idx: dict, idf: np.ndarray, V: int) -> np.ndarray:
    """
    Convert a preprocessed query string into a TF-IDF vector using the
    vocabulary and IDF built from the FAQ corpus.
    """
    tokens = query.split()
    vec = np.zeros(V, dtype=np.float64)
    if not tokens:
        return vec
    counts = Counter(tokens)
    for tok, cnt in counts.items():
        if tok in word2idx:
            tf = cnt / len(tokens)
            vec[word2idx[tok]] = tf * idf[word2idx[tok]]
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


class FAQEngine:
    """Manages the FAQ dataset and performs TF-IDF similarity matching."""

    def __init__(self, faq_file: str):
        self.faq_file = faq_file
        self.faqs = []
        self.word2idx = {}
        self.idf = np.array([])
        self.tfidf_matrix = None
        self._load_and_build()

    def _load_and_build(self):
        """Load FAQs from JSON and (re)build the TF-IDF index."""
        with open(self.faq_file, "r", encoding="utf-8") as f:
            self.faqs = json.load(f)
        self._build_index()

    def _build_index(self):
        """Preprocess all FAQ questions and build the pure-Python TF-IDF matrix."""
        if not self.faqs:
            self.tfidf_matrix = None
            return
        processed_questions = [preprocess(faq["question"]) for faq in self.faqs]
        self.word2idx, self.idf, self.tfidf_matrix = _build_tfidf(processed_questions)

    def find_best_match(self, user_query: str):
        """
        Preprocess the user query, vectorize it, and compute cosine similarity
        (dot product of L2-normalised vectors) against all FAQ vectors.
        Returns the best matching FAQ and its score.
        """
        if self.tfidf_matrix is None or len(self.tfidf_matrix) == 0:
            return None, 0.0

        processed_query = preprocess(user_query)
        if not processed_query.strip():
            return None, 0.0

        V = len(self.word2idx)
        query_vec = _vectorize(processed_query, self.word2idx, self.idf, V)

        # Cosine similarity = dot product (rows already L2-normalised)
        similarities = self.tfidf_matrix @ query_vec

        best_idx = int(np.argmax(similarities))
        best_score = float(similarities[best_idx])

        return self.faqs[best_idx], best_score

    def get_all_faqs(self):
        return self.faqs

    def add_faq(self, question: str, answer: str, category: str = "General"):
        """Add a new FAQ, persist to file, and rebuild the index."""
        new_id = max((f["id"] for f in self.faqs), default=0) + 1
        new_faq = {"id": new_id, "question": question, "answer": answer, "category": category}
        self.faqs.append(new_faq)
        self._save()
        self._build_index()
        return new_faq

    def delete_faq(self, faq_id: int):
        """Delete a FAQ by ID, persist to file, and rebuild the index."""
        original_len = len(self.faqs)
        self.faqs = [f for f in self.faqs if f["id"] != faq_id]
        if len(self.faqs) == original_len:
            return False  # Not found
        self._save()
        self._build_index()
        return True

    def _save(self):
        """Persist the current FAQ list to the JSON file."""
        with open(self.faq_file, "w", encoding="utf-8") as f:
            json.dump(self.faqs, f, indent=2, ensure_ascii=False)


# Initialize the FAQ engine at startup
engine = FAQEngine(FAQ_FILE)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Serve the main chat UI."""
    return render_template("index.html")


@app.route("/ask", methods=["POST"])
def ask():
    """
    Accepts a JSON body: { "question": "user query here" }
    Returns:
      - On success: { "answer": "...", "score": 0.82, "matched_question": "..." }
      - On low confidence: { "answer": "Sorry...", "score": 0.12, "matched_question": null }
    """
    data = request.get_json(force=True)
    user_question = data.get("question", "").strip()

    if not user_question:
        return jsonify({"error": "Question cannot be empty."}), 400

    best_faq, score = engine.find_best_match(user_question)

    if best_faq and score >= THRESHOLD:
        return jsonify({
            "answer": best_faq["answer"],
            "score": round(score, 4),
            "matched_question": best_faq["question"],
            "category": best_faq.get("category", ""),
            "matched": True
        })
    else:
        return jsonify({
            "answer": "Sorry, I couldn't find a suitable answer for your question. Please try rephrasing or contact our support team.",
            "score": round(score, 4) if best_faq else 0.0,
            "matched_question": None,
            "category": None,
            "matched": False
        })


@app.route("/faqs", methods=["GET"])
def get_faqs():
    """Return the full FAQ list grouped by category."""
    return jsonify(engine.get_all_faqs())


@app.route("/faqs", methods=["POST"])
def add_faq():
    """
    Add a new FAQ.
    Body: { "question": "...", "answer": "...", "category": "..." }
    """
    data = request.get_json(force=True)
    question = data.get("question", "").strip()
    answer = data.get("answer", "").strip()
    category = data.get("category", "General").strip()

    if not question or not answer:
        return jsonify({"error": "Both question and answer are required."}), 400

    new_faq = engine.add_faq(question, answer, category)
    return jsonify(new_faq), 201


@app.route("/faqs/<int:faq_id>", methods=["DELETE"])
def delete_faq(faq_id):
    """Delete a FAQ by its numeric ID."""
    success = engine.delete_faq(faq_id)
    if success:
        return jsonify({"message": f"FAQ #{faq_id} deleted successfully."}), 200
    else:
        return jsonify({"error": f"FAQ #{faq_id} not found."}), 404


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 55)
    print("  FAQ Chatbot Server")
    print(f"  Loaded {len(engine.faqs)} FAQs | Threshold: {THRESHOLD}")
    print("  Visit http://127.0.0.1:5000")
    print("=" * 55)
    app.run(debug=True, port=5000)
