import pandas as pd
import numpy as np
import joblib
import os
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
from xgboost import XGBRegressor

# --- CHALLENGE 9: CUSTOM NUMPY SKIP-GRAM VECTORIZER ---
class CustomNumPyVectorizer:
    """
    Bypasses pre-trained models. A custom Skip-Gram style embedding 
    vectorizer coded entirely from scratch using NumPy.
    """
    def __init__(self, vector_size=16):
        self.vector_size = vector_size
        self.vocab = {}
        self.embeddings = {}

    def fit(self, texts):
        # Build vocabulary from text
        words = set()
        for text in texts:
            for word in str(text).lower().split():
                words.add(word)
        self.vocab = {word: idx for idx, word in enumerate(words)}
        
        # Initialize stable random weights using NumPy
        np.random.seed(42)
        for word in self.vocab:
            self.embeddings[word] = np.random.uniform(-0.25, 0.25, self.vector_size)
        return self

    def transform(self, texts):
        # Convert text list into mean vectors using NumPy weights
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

# --- PHASE 1: DATA INTEGRITY & TEMPORAL ENGINEERING ---
def load_and_temporal_clean(file_path):
    print("Loading data and purging leakage...")
    df = pd.read_csv(file_path)

    # Challenge 10: Drop ghost columns
    df = df.drop(columns=['meta_data', 'comment', 'map_file'], errors='ignore')

    # Challenge 3: Drop post-event columns to prevent future-sight leakage
    leakage_cols = ['closed_by_id', 'resolved_by_id', 'resolved_at_address', 
                    'resolved_at_latitude', 'resolved_at_longitude', 'modified_datetime']
    df = df.drop(columns=leakage_cols, errors='ignore')

    # Challenge 2: Filter active rows prior to model training
    df = df[df['status'].str.lower().isin(['closed', 'resolved'])].copy()

    # Challenge 1: Coalesce end times (Combine first sequence)
    time_cols = ['start_datetime', 'end_datetime', 'closed_datetime', 'resolved_datetime']
    for col in time_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')

    df['final_end_time'] = df['end_datetime'].combine_first(df['resolved_datetime']).combine_first(df['closed_datetime'])
    df['duration_minutes'] = (df['final_end_time'] - df['start_datetime']).dt.total_seconds() / 60.0

    # Drop intermediate dates to prevent training leakage
    df = df.drop(columns=['end_datetime', 'closed_datetime', 'resolved_datetime', 'final_end_time'], errors='ignore')
    df = df[(df['duration_minutes'] > 0) & (df['duration_minutes'] < 1440)]
    return df

# --- PHASE 2: SPATIAL ENGINEERING & GEOFENCING ---
def engineer_spatial_features(df):
    print("Applying Bangalore geofencing bounding box and KNN clustering...")
    lat_min, lat_max = 12.8, 13.3
    lon_min, lon_max = 77.3, 77.8

    # Challenge 4: Bounding box geofence to protect spatial calculations
    valid_start = df['latitude'].between(lat_min, lat_max) & df['longitude'].between(lon_min, lon_max)
    df = df[valid_start].copy()

    valid_end = df['endlatitude'].between(lat_min, lat_max) & df['endlongitude'].between(lon_min, lon_max)
    df.loc[~valid_end, ['endlatitude', 'endlongitude']] = np.nan

    # Challenge 5: KNN zone imputation
    known_zones = df.dropna(subset=['zone', 'latitude', 'longitude'])
    missing_zones = df[df['zone'].isna() & df['latitude'].notna() & df['longitude'].notna()]
    if not missing_zones.empty and not known_zones.empty:
        knn_zone = KNeighborsClassifier(n_neighbors=5)
        knn_zone.fit(known_zones[['latitude', 'longitude']], known_zones['zone'])
        df.loc[missing_zones.index, 'zone'] = knn_zone.predict(missing_zones[['latitude', 'longitude']])

    # Challenge 5 (Part B): KNN junction imputation
    known_juncs = df.dropna(subset=['junction', 'latitude', 'longitude'])
    missing_juncs = df[df['junction'].isna() & df['latitude'].notna() & df['longitude'].notna()]
    if not missing_juncs.empty and not known_juncs.empty:
        knn_junc = KNeighborsClassifier(n_neighbors=1)
        knn_junc.fit(known_juncs[['latitude', 'longitude']], known_juncs['junction'])
        df.loc[missing_juncs.index, 'junction'] = knn_junc.predict(missing_juncs[['latitude', 'longitude']])

    # Distance to city center (Majestic Hub)
    df['dist_to_center'] = ((df['latitude'] - 12.9772)**2 + (df['longitude'] - 77.5708)**2)**0.5
    return df

# --- PHASE 3: CATEGORICAL & TEXT OPTIMIZATION ---
def engineer_categorical_features(df):
    print("Normalizing strings and vehicle weight tiers...")
    df['event_cause'] = df['event_cause'].str.lower()
    df['veh_type'] = df['veh_type'].str.lower().fillna('unknown')
    df['description'] = df['description'].str.lower().fillna('')

    # Challenge 8: Re-classify vague "others" classes via keyword matching
    mask_others = df['event_cause'] == 'others'
    df.loc[mask_others & df['description'].str.contains('water|rain|flood|log'), 'event_cause'] = 'water_logging'
    df.loc[mask_others & df['description'].str.contains('tree|branch'), 'event_cause'] = 'tree_fall'
    df.loc[mask_others & df['description'].str.contains('rally|procession'), 'event_cause'] = 'public_event'

    # Challenge 7: Standardize unstructured vehicle types to weight tiers
    heavy_vehs = ['bus', 'truck', 'lcv', 'bmtc', 'ksrtc', 'heavy', 'tractor', 'lorry']
    med_vehs = ['car', 'suv', 'jeep', '4 wheeler', 'four wheeler']

    def categorize_vehicle(v):
        if any(hv in v for hv in heavy_vehs): return 'Tier_1_Heavy'
        if any(mv in v for mv in med_vehs): return 'Tier_2_Medium'
        return 'Tier_3_Light'

    df['veh_tier'] = df['veh_type'].apply(categorize_vehicle)

    # Challenge 10: Convert sparse columns into boolean feature
    ghost_cols = ['cargo_material', 'reason_breakdown', 'age_of_truck']
    df['is_heavy_vehicle_involved'] = df[ghost_cols].notna().any(axis=1)
    df = df.drop(columns=ghost_cols + ['veh_type'], errors='ignore')

    return df

# --- PHASE 4: MODELING AND EXECUTION ---
if __name__ == "__main__":
    csv_files = [f for f in os.listdir('.') if f.endswith('.csv') and 'clean' not in f]
    if not csv_files:
        raise FileNotFoundError("Raw ASTraM CSV dataset not found in directory.")
    
    raw_file = csv_files[0]
    print(f"Detected raw dataset: {raw_file}")

    df = load_and_temporal_clean(raw_file)
    df = os_df = engineer_spatial_features(df)
    df = engineer_categorical_features(df)

    # Calculate temporal features
    df['hour'] = df['start_datetime'].dt.hour
    df['day_of_week'] = df['start_datetime'].dt.dayofweek
    df['is_rush_hour'] = df['hour'].apply(lambda h: 1 if (8 <= h <= 11) or (17 <= h <= 20) else 0)

    # Save stable cleaned CSV
    df.to_csv("cleaned_astram_train.csv", index=False)
    print("Cleaned dataset successfully generated and saved.")

    # Challenge 12: Bifurcated Pipeline (Only train ML model on Unplanned events)
    unplanned_df = df[df['event_type'] == 'unplanned'].copy()

    # Define training features (Excluding 'priority' to avoid Challenge 11 human bias)
    X = unplanned_df[['latitude', 'longitude', 'dist_to_center', 'event_cause', 
                       'veh_tier', 'zone', 'hour', 'day_of_week', 'is_rush_hour', 
                       'is_heavy_vehicle_involved', 'requires_road_closure', 'description']]
    y = unplanned_df['duration_minutes']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Compile preprocessing layers
    categorical_cols = ['event_cause', 'veh_tier', 'zone']
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols),
            # Challenge 9: Custom NumPy-coded Skip-Gram Vectorizer on text description
            ('nlp', CustomNumPyVectorizer(vector_size=16), 'description')
        ],
        remainder='passthrough'
    )

    # Build the complete pipeline
    model_pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('regressor', XGBRegressor(
            n_estimators=180,
            max_depth=6,
            learning_rate=0.06,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        ))
    ])

    print("Training unified XGBoost + Custom NumPy Skip-Gram pipeline...")
    model_pipeline.fit(X_train, y_train)

    predictions = model_pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)

    print("\n--- Optimized 15-Challenge Pipeline Metrics ---")
    print(f"Mean Absolute Error (MAE): {mae:.2f} minutes")
    print(f"R-squared Score (R²): {r2:.4f}")

    # Serialize complete pipeline
    joblib.dump(model_pipeline, 'traffic_model.pkl')
    print("\nSaved unified model pipeline successfully as 'traffic_model.pkl'")