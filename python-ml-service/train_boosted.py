import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
from xgboost import XGBRegressor

# Load cleaned data
df = pd.read_csv("cleaned_astram_train.csv")

# Extract base temporal features
df['start_datetime'] = pd.to_datetime(df['start_datetime'])
df['hour'] = df['start_datetime'].dt.hour
df['day_of_week'] = df['start_datetime'].dt.dayofweek

# 1. Feature Engineering: Distance to Bengaluru Majestic Hub (12.9772, 77.5708)
df['dist_to_center'] = ((df['latitude'] - 12.9772)**2 + (df['longitude'] - 77.5708)**2)**0.5

# 2. Feature Engineering: Rush Hour Indicator (8-11 AM or 5-8 PM)
df['is_rush_hour'] = df['hour'].apply(lambda h: 1 if (8 <= h <= 11) or (17 <= h <= 20) else 0)

# Define features and target variable
features = ['latitude', 'longitude', 'dist_to_center', 'event_cause', 'vehicle_tier', 'hour', 'day_of_week', 'is_rush_hour']
X = df[features]
y = df['duration_minutes']

# Preprocess categorical features using One-Hot Encoding
categorical_cols = ['event_cause', 'vehicle_tier']
preprocessor = ColumnTransformer(
    transformers=[
        ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
    ],
    remainder='passthrough'
)

# Build the pipeline with XGBoost Regressor
model_pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('regressor', XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1
    ))
])

# Split into 80% train and 20% validation sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train the model
print("Training the boosted XGBoost model pipeline...")
model_pipeline.fit(X_train, y_train)

# Evaluate model performance
predictions = model_pipeline.predict(X_test)
mae = mean_absolute_error(y_test, predictions)
r2 = r2_score(y_test, predictions)

print("\n--- Boosted Accuracy Metrics ---")
print(f"Mean Absolute Error (MAE): {mae:.2f} minutes")
print(f"R-squared Score (R²): {r2:.4f}")

# Save the complete pipeline over the old model
joblib.dump(model_pipeline, 'traffic_model.pkl')
print("\nSaved boosted pipeline successfully as 'traffic_model.pkl'")