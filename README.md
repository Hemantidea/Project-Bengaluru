# <img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=900&size=45&duration=2000&pause=500&color=00E7FF&center=true&vCenter=true&width=1400&height=80&lines=PROJECT+BENGALURU;PREDICT+%E2%80%A2+DISPATCH+%E2%80%A2+CLEAR;AI+FOR+URBAN+MOBILITY;GRIDLOCK+HACKATHON+2.0" />
<img width="1672" height="941" alt="ChatGPT Image Jun 20, 2026, 11_45_22 AM" src="https://github.com/user-attachments/assets/40f6f571-53bd-41d8-9726-eee753db99da" />




# 🚧 GRID-Lock: Active Spatio-Temporal Resource Dispatch

> **An Intelligent Command Center for Real-time Traffic Mitigation, Incident Forecasting, and Automated Upstream Diversion Planning.**

---

## ⚡ System Architecture at a Glance

<img height="450" alt="Order Validation Workflow-2026-06-20-061332" src="https://github.com/user-attachments/assets/9f857b9e-48c7-4edf-aecb-6c19b4c9284c" />

---

## 🚀 Core Features

*   **⚡ Minute-Zero Predictive AI:** Utilizes an optimized **XGBoost Regressor pipeline** ($R^2 = 0.41$) to forecast precise incident clearance durations based on spatial coordinates, local rush-hour profiles, distance to city core, and vehicle tier classifications.
*   **⚖️ Dynamic Event Severity Scoring (ESS):** Replaces historical deployment guesswork with a strict mathematical resource heuristic. ESS translates predicted clearing times, road closure requirements, and peak hours into exact field requirements (Officer count, Barricades, Specialized towing assets).
*   **📍 Spatially Intelligent Upstream Detours:** Powered by **PostGIS Geography Indexes**, the database instantly computes the **3 nearest upstream intersections** relative to the bottleneck. Placing early barriers here redirects incoming vehicles *before* they enter the bottleneck zone, preventing network-wide gridlock.
*   **🗺️ Interactive GIS Dashboard:** Beautiful, dark-themed **Leaflet/OpenStreetMap** command console allowing operators to click coordinates, log active incidents, and instantly visualize tactical resource mandates.

---

## 🛠️ Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React / Next.js (App Router), Tailwind CSS | Command Console Dashboard UI |
| **Database** | PostgreSQL (Neon serverless), PostGIS | Spatial Datastore & Geography Indexing |
| **ORM** | Prisma 7 | Type-safe Database client & Migrations |
| **ML Engine** | Python, Scikit-Learn, XGBoost, Joblib | Predictive Duration Modeling |
| **Web API** | FastAPI, Pydantic, Uvicorn | Microservice REST Endpoints |
| **Hosting** | Vercel (Frontend), Render/Railway (Backend) | Cloud Continuous Integration |

---

## 💻 Local Quickstart

### 1. Python ML Service Setup
Navigate to the machine learning folder, install packages, and spin up the FastAPI server:
```bash
cd python-ml-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Next.js Frontend Setup
Navigate to the Next.js directory, configure your database schema, seed your coordinates, and boot the web server:
```bash
cd nextjs-frontend/project-bengaluru
npm install

# Build Prisma engine and seed 294 Bengaluru junctions
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed

# Run local development server
npm run dev
```
Open [project-bengaluru.vercel.app](https://project-bengaluru.vercel.app/) to view the interactive dashboard.

---

## 📊 Tactical Machine Learning Rationale

Instead of training a fragile, high-overhead neural network, we engineered a fast, lightweight **XGBoost Regressor Pipeline** optimized with spatial and temporal domain features:
*   **`dist_to_center`**: Euclidean coordinate offset from Bengaluru's Majestic hub (`12.9772, 77.5708`).
*   **`is_rush_hour`**: Boolean binary flag capturing high-density congestion windows (08:00-11:00 and 17:00-20:00).
*   **`vehicle_tier`**: Dimension-reduction grouping (Heavy, Medium, Light) representing physical road occupancy metrics.

```
--- Model Performance ---
Mean Absolute Error (MAE): 85.25 minutes
R-squared Score (R²): 0.4130
```

---

## 📂 Repository Structure

```text
bengaluru-traffic/
├── python-ml-service/            # FastAPI, XGBoost, Preprocessing
│   ├── main.py                   # API endpoints
│   ├── train_boosted.py          # Training pipeline & Feature Engineering
│   ├── traffic_model.pkl         # Saved serialized ML model
│   └── requirements.txt
└── project-bengaluru/        # Next.js, Prisma, Leaflet Dashboard
    ├── app/
    │   ├── api/predict/      # Next API predictive router
    │   └── page.tsx          # Live mapping control room UI
    ├── prisma/
    │   ├── schema.prisma     // Spatial models
    │   └── seed.ts           // Imports 294 Bengaluru junctions
    └── package.json
```
```