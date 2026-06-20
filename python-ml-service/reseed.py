import pandas as pd

df = pd.read_csv("cleaned_astram_train.csv")

# Group by coordinates to ensure absolute spatial uniqueness
junctions = df[df['junction'].notna() & (df['junction'] != 'NULL') & (df['junction'] != '')]
junction_seed = junctions.groupby(['latitude', 'longitude']).first().reset_index()

# Save seed
junction_seed.to_json("junction_seed.json", orient="records")
print(f"Generated unique coordinate seed file with {len(junction_seed)} junctions.")