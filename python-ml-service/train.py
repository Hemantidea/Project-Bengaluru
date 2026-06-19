# python-ml-service/train.py
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score

# Load cleaned data
df = pd.read_csv("cleaned_astram_train.csv")

# Extract temporal features
df['start_datetime'] = pd.to_datetime(df['start_datetime'])
df['hour'] = df['start_datetime'].dt.hour
df['day_of_week'] = df['start_datetime'].dt.dayofweek

# Define features and target variable
features = ['latitude', 'longitude', 'event_cause', 'vehicle_tier', 'hour', 'day_of_week']
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

# Build the pipeline with optimized Random Forest parameters
model_pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('regressor', RandomForestRegressor(
        n_estimators=150, 
        max_depth=16, 
        min_samples_split=5, 
        random_state=42, 
        n_jobs=-1
    ))
])

# Split into 80% train and 20% validation sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train the model
print("Training the predictive model pipeline...")
model_pipeline.fit(X_train, y_train)

# Evaluate model performance
predictions = model_pipeline.predict(X_test)
mae = mean_absolute_error(y_test, predictions)
r2 = r2_score(y_test, predictions)

print("\n--- Accuracy Metrics ---")
print(f"Mean Absolute Error (MAE): {mae:.2f} minutes")
print(f"R-squared Score (R²): {r2:.4f}")

# Save the complete pipeline
joblib.dump(model_pipeline, 'traffic_model.pkl')
print("\nSaved pipeline successfully as 'traffic_model.pkl'")