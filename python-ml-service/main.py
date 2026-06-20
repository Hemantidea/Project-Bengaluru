# python-ml-service/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import pandas as pd
from datetime import datetime

app = FastAPI()

# Allow cross-origin requests from Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained XGBoost pipeline
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, 'traffic_model.pkl')

model = joblib.load(model_path)

# Define request schema matching Minute Zero properties
class TrafficPredictionRequest(BaseModel):
    latitude: float
    longitude: float
    event_cause: str
    vehicle_tier: str
    requires_road_closure: bool
    start_datetime: str # ISO Timestamp String

@app.post("/predict")
def predict_traffic(req: TrafficPredictionRequest):
    # Parse date and extract engineered features
    dt = datetime.fromisoformat(req.start_datetime.replace("Z", "+00:00"))
    hour = dt.hour
    day_of_week = dt.weekday()
    
    # Calculate engineered features matching train dataset
    dist_to_center = ((req.latitude - 12.9772)**2 + (req.longitude - 77.5708)**2)**0.5
    is_rush_hour = 1 if (8 <= hour <= 11) or (17 <= hour <= 20) else 0

    # Build input DataFrame
    input_df = pd.DataFrame([{
        'latitude': req.latitude,
        'longitude': req.longitude,
        'dist_to_center': dist_to_center,
        'event_cause': req.event_cause,
        'vehicle_tier': req.vehicle_tier,
        'hour': hour,
        'day_of_week': day_of_week,
        'is_rush_hour': is_rush_hour
    }])

    # Predict duration (minutes)
    predicted_duration = float(model.predict(input_df)[0])

    # Calculate Event Severity Score (ESS)
    cause_weights = {
        'political_rally': 50, 'public_event': 20, 'accident': 30, 
        'water_logging': 25, 'tree_fall': 15, 'vehicle_breakdown': 10, 
        'pot_holes': 10, 'others': 5
    }
    base_weight = cause_weights.get(req.event_cause, 10)
    
    # Calculate duration and peak hour multipliers
    duration_mult = 1.0 if predicted_duration < 120 else (1.5 if predicted_duration <= 240 else 2.0)
    peak_mult = 1.5 if is_rush_hour == 1 else 0.8
    closure_penalty = 20 if req.requires_road_closure else 0
    
    # Math: (Base * Duration Mult * Peak Mult) + Penalty
    ess_score = (base_weight * duration_mult * peak_mult) + closure_penalty

    # Determine resource allocations based on ESS Score
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
        "resources": {
            "manpower": manpower,
            "barricades": barricades,
            "specialized": specialized
        }
    }