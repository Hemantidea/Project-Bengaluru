from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import pandas as pd
from datetime import datetime
import numpy as np
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CHALLENGE 9: CUSTOM NUMPY VECTORIZER (Namespace definition for Joblib) ---
class CustomNumPyVectorizer:
    """
    Required for deserializing traffic_model.pkl.
    Matches the exact custom Skip-Gram structure in train_optimized.py.
    """
    def __init__(self, vector_size=16):
        self.vector_size = vector_size
        self.vocab = {}
        self.embeddings = {}

    def fit(self, texts):
        words = set()
        for text in texts:
            for word in str(text).lower().split():
                words.add(word)
        self.vocab = {word: idx for idx, word in enumerate(words)}
        np.random.seed(42)
        for word in self.vocab:
            self.embeddings[word] = np.random.uniform(-0.25, 0.25, self.vector_size)
        return self

    def transform(self, texts):
        vectors = []
        for text in texts:
            words = str(text).lower().split()
            word_vecs = [self.embeddings[w] for w in words if w in self.embeddings]
            if len(word_vecs) == 0:
                vectors.append(np.zeros(self.vector_size))
            else:
                vectors.append(np.mean(word_vecs, axis=0))
        return np.array(vectors)

    def fit_transform(self, texts, y=None):
        self.fit(texts)
        return self.transform(texts)

    def get_params(self, deep=True):
        return {"vector_size": self.vector_size}

    def set_params(self, **parameters):
        for parameter, value in parameters.items():
            setattr(self, parameter, value)
        return self

# Load the serial model pipeline safely
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, 'traffic_model.pkl')
model = joblib.load(model_path)

class TrafficPredictionRequest(BaseModel):
    event_type: str  # "planned" or "unplanned"
    latitude: float
    longitude: float
    event_cause: str
    vehicle_tier: str
    requires_road_closure: bool
    start_datetime: str
    description: str
    address: str

@app.post("/predict")
def predict_traffic(req: TrafficPredictionRequest):
    dt = datetime.fromisoformat(req.start_datetime.replace("Z", "+00:00"))
    hour = dt.hour
    day_of_week = dt.weekday()
    
    dist_to_center = ((req.latitude - 12.9772)**2 + (req.longitude - 77.5708)**2)**0.5
    is_rush_hour = 1 if (8 <= hour <= 11) or (17 <= hour <= 20) else 0

    # Challenge 12: Bifurcated Pipeline (Planned vs Unplanned)
    if req.event_type.lower() == "planned":
        # Rule-based duration matching slide guidelines strictly
        planned_durations = {
            'political_rally': 240.0,  # 4 hours
            'festival': 180.0,         # 3 hours
            'sports_event': 180.0,     # 3 hours
            'construction': 300.0      # 5 hours
        }
        predicted_duration = planned_durations.get(req.event_cause.lower(), 120.0)
    else:
        # Machine learning prediction for data-rich unplanned events
        input_df = pd.DataFrame([{
            'latitude': req.latitude,
            'longitude': req.longitude,
            'dist_to_center': dist_to_center,
            'event_cause': req.event_cause.lower(),
            'veh_tier': req.vehicle_tier,
            'zone': 'Central Zone',
            'hour': hour,
            'day_of_week': day_of_week,
            'is_rush_hour': is_rush_hour,
            'is_heavy_vehicle_involved': True if req.vehicle_tier == "Tier_1_Heavy" else False,
            'requires_road_closure': req.requires_road_closure,
            'description': req.description.lower()
        }])
        predicted_duration = float(model.predict(input_df)[0])

    # Simple spatial remark extraction
    import re
    combined = f"{req.description} {req.address}".lower().strip()
    landmark_pattern = r'(\b(?:near|opposite|opp|towards|right of|left of|under|on|at|near to)\s+[\w\s]{2,20}?\s*(?:station|circle|junction|junc|flyover|cross|metro|underpass|layout|road|rd|gate)\b)'
    match = re.search(landmark_pattern, combined)
    guessed_landmark = match.group(1).title() if match else "Unknown Corridor"

    # Base Weight by Cause matching slide terms exactly
    cause_weights = {
        'political_rally': 50,
        'festival': 25,
        'sports_event': 25,
        'construction': 15,
        'sudden_gathering': 30,
        # Unplanned ASTraM logs
        'vehicle_breakdown': 10,
        'water_logging': 25,
        'accident': 30,
        'tree_fall': 15,
        'pot_holes': 10,
        'others': 5
    }
    base_weight = cause_weights.get(req.event_cause.lower(), 10)
    
    # Calculate multipliers
    duration_mult = 1.0 if predicted_duration < 120 else (1.5 if predicted_duration <= 240 else 2.0)
    peak_mult = 1.5 if is_rush_hour == 1 else 0.8
    closure_penalty = 20 if req.requires_road_closure else 0
    
    ess_score = (base_weight * duration_mult * peak_mult) + closure_penalty

    # Resource Deployment Matrix
    if ess_score <= 40:
        manpower, barricades, specialized = 2, 5, "None"
    elif ess_score <= 80:
        manpower, barricades, specialized = 4, 15, "1 Tow Truck"
    elif ess_score <= 120:
        manpower, barricades, specialized = 8, 30, "1 Inspector"
    else:
        manpower, barricades, specialized = 15, 50, "1 Inspector, 1 Tow Truck"

    return {
        "predicted_duration": round(predicted_duration, 1),
        "ess_score": round(ess_score, 1),
        "guessed_landmark": guessed_landmark,
        "resources": {
            "manpower": manpower,
            "barricades": barricades,
            "specialized": specialized
        }
    }

@app.get("/health")
def health_check():
    """Lightweight endpoint for full-stack keep-alive pings."""
    return {"status": "healthy"}