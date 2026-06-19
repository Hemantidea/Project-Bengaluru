# python-ml-service/preprocess.py
import pandas as pd
import numpy as np

# Load raw dataset
df = pd.read_csv("raw_astram.csv")

# Parse date columns
date_cols = ['start_datetime', 'end_datetime', 'resolved_datetime', 'closed_datetime']
for col in date_cols:
    if col in df.columns:
        df[col] = pd.to_datetime(df[col], errors='coerce')

# Fallback duration calculation (minutes)
df['final_end_time'] = df['end_datetime'].fillna(df['resolved_datetime']).fillna(df['closed_datetime'])
df['duration_minutes'] = (df['final_end_time'] - df['start_datetime']).dt.total_seconds() / 60.0

# Remove active/unfinished events and negative durations
train_df = df[df['status'].str.lower() != 'active'].copy()
train_df = train_df[(train_df['duration_minutes'] > 0) & (train_df['duration_minutes'] < 1440)]

# Geofence to Bengaluru boundaries
lat_min, lat_max = 12.80, 13.25
lon_min, lon_max = 77.40, 77.85
train_df = train_df[
    (train_df['latitude'] >= lat_min) & (train_df['latitude'] <= lat_max) &
    (train_df['longitude'] >= lon_min) & (train_df['longitude'] <= lon_max)
]

# Standardize vehicle classifications
def get_vehicle_tier(veh):
    if not isinstance(veh, str):
        return 'Tier_3_Light'
    veh = veh.lower().strip()
    if any(h in veh for h in ['heavy_vehicle', 'lcv', 'bus', 'bmtc', 'ksrtc', 'truck', 'lorry']):
        return 'Tier_1_Heavy'
    elif any(m in veh for m in ['car', 'private', '4 wheeler']):
        return 'Tier_2_Medium'
    return 'Tier_3_Light'

train_df['vehicle_tier'] = train_df['veh_type'].apply(get_vehicle_tier)

# Save cleaned file for model training
train_df.to_csv("cleaned_astram_train.csv", index=False)

# Extract unique spatial junctions for database seed file
junctions = df[df['junction'].notna() & (df['junction'] != 'NULL') & (df['junction'] != '')]
junction_seed = junctions.groupby('junction').agg({
    'latitude': 'mean',
    'longitude': 'mean'
}).reset_index()

# Save seed list
junction_seed.to_json("junction_seed.json", orient="records")

print("Files generated successfully:")
print("- python-ml-service/cleaned_astram_train.csv")
print("- python-ml-service/junction_seed.json")