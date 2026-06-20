'use client';

import { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export default function Page() {
  const [latitude, setLatitude] = useState(12.9716); 
  const [longitude, setLongitude] = useState(77.5946); 
  const [cause, setCause] = useState('vehicle_breakdown');
  const [tier, setTier] = useState('Tier_2_Medium');
  const [closure, setClosure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [predictionData, setPredictionData] = useState<any>(null);

  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const LRef = useRef<any>(null);

  // Initialize Leaflet Map safely in SSR
  useEffect(() => {
    if (typeof window !== 'undefined' && !mapRef.current) {
      import('leaflet').then((L) => {
        LRef.current = L;

        // Create Leaflet Map Instance
        mapRef.current = L.map('leaflet-container').setView([latitude, longitude], 12);

        // Load OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }).addTo(mapRef.current);

        // Click handler to update coordinates
        mapRef.current.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          setLatitude(parseFloat(lat.toFixed(6)));
          setLongitude(parseFloat(lng.toFixed(6)));
        });
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const updateMapView = (lat: number, lon: number) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon - 0.01], 13);
    }
  };
  const clearMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((marker) => {
      mapRef.current.removeLayer(marker);
    });
    markersRef.current = [];
  };

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMarkers();
    updateMapView(latitude, longitude);

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: "unplanned",
          latitude,
          longitude,
          event_cause: cause,
          vehicle_tier: tier,
          requires_road_closure: closure,
          start_datetime: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      setPredictionData(data);

      const L = LRef.current;
      if (L && mapRef.current) {
        // Red Marker Icon for Incident Bottleneck
        const redIcon = L.icon({
          iconUrl: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        // Yellow Marker Icon for Upstream Detours
        const yellowIcon = L.icon({
          iconUrl: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        // 1. Plot Red Incident Pin
        const incidentMarker = L.marker([latitude, longitude], { icon: redIcon }).addTo(mapRef.current);
        incidentMarker.bindPopup(`<b>Bottleneck</b><br>${cause}`).openPopup();
        markersRef.current.push(incidentMarker);

        // 2. Plot Yellow Upstream Junction Pins
        if (data.upstream_diversions) {
          data.upstream_diversions.forEach((junction: any) => {
            const detourMarker = L.marker([junction.latitude, junction.longitude], { icon: yellowIcon }).addTo(mapRef.current);
            detourMarker.bindPopup(`<b>Upstream Diversion Node</b><br>${junction.name}`);
            markersRef.current.push(detourMarker);
          });
        }
      }
    } catch (error) {
      console.error("Prediction Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-[#3A6EA5] font-sans text-black">
      {/* Map Background Container */}
      <div id="leaflet-container" className="absolute inset-0 h-full w-full bg-[#5A8FD8]" />

      {/* Floating Panel (Left Sidebar) */}
      <div className="absolute top-4 bottom-4 left-4 z-[1000] flex w-96 flex-col gap-4 overflow-y-auto border-[3px] border-[#ffffff] bg-[#ECE9D8] p-4 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff,4px_4px_12px_rgba(0,0,0,0.35)]">
        <div>
          <h1 className="text-xl font-bold text-[#003399]">GRID-Lock Controller</h1>
          <p className="mt-1 text-xs text-[#404040]">Real-time Spatio-Temporal Resource Dispatch</p>
        </div>

        <form onSubmit={handlePredict} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-[#003399]">Latitude</label>
              <input
                type="number"
                step="any"
                className="w-full border-2 border-[#7F9DB9] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-[#316AC5]"
                value={latitude}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setLatitude(val);
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#003399]">Longitude</label>
              <input
                type="number"
                step="any"
                className="w-full border-2 border-[#7F9DB9] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-[#316AC5]"
                value={longitude}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setLongitude(val);
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#003399]">Incident Cause</label>
            <select
              value={cause}
              onChange={(e) => setCause(e.target.value)}
              className="w-full border-2 border-[#7F9DB9] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-[#316AC5]"
            >
              <option value="vehicle_breakdown">Vehicle Breakdown</option>
              <option value="water_logging">Water Logging</option>
              <option value="accident">Accident / Collision</option>
              <option value="tree_fall">Tree Fall</option>
              <option value="pot_holes">Severe Pothole</option>
              <option value="political_rally">Political Rally</option>
              <option value="public_event">Cricket / Public Event</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#003399]">Vehicle Weight Category</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full border-2 border-[#7F9DB9] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-[#316AC5]"
            >
              <option value="Tier_3_Light">Tier 3 (Light Two/Three Wheeler)</option>
              <option value="Tier_2_Medium">Tier 2 (Medium Cars/SUVs)</option>
              <option value="Tier_1_Heavy">Tier 1 (Heavy BMTC Bus/Truck/LCV)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="closure"
              checked={closure}
              onChange={(e) => setClosure(e.target.checked)}
              className="h-4 w-4 border border-[#7F9DB9] accent-[#316AC5]"
            />
            <label htmlFor="closure" className="text-xs font-bold text-[#003399] select-none">
              Requires Road Closure
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-[#003C74] bg-gradient-to-b from-[#5CA6FF] to-[#2B67C8] py-2.5 font-bold text-white shadow active:translate-y-px disabled:opacity-60"
          >
            {loading ? 'Processing Decisions...' : 'Predict & Deploy Resources'}
          </button>
        </form>

        {predictionData && (
          <div className="flex flex-col gap-4 border-t-2 border-[#7F9DB9] pt-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="border-2 border-[#7F9DB9] bg-[#F4F2E8] p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#505050]">Est. Duration</span>
                <p className="text-xl font-bold text-[#003399]">{predictionData.event.duration_minutes}m</p>
              </div>
              <div className="border-2 border-[#7F9DB9] bg-[#F4F2E8] p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#505050]">Severity (ESS)</span>
                <p className="text-xl font-bold text-[#B00000]">{predictionData.event.ess_score}</p>
              </div>
            </div>

            <div className="border-2 border-[#7F9DB9] bg-[#F4F2E8] p-4">
              <span className="text-[10px] uppercase tracking-wider text-[#505050] font-semibold">Deployment Mandate</span>
              <div className="mt-2 flex flex-col gap-1.5 text-xs text-black">
                <div className="flex justify-between">
                  <span>👮 Traffic Police:</span>
                  <span className="font-bold">{predictionData.resources.manpower} Officers</span>
                </div>
                <div className="flex justify-between">
                  <span>🚧 Barricading Unit:</span>
                  <span className="font-bold">{predictionData.resources.barricades} Gates</span>
                </div>
                <div className="flex justify-between">
                  <span>🚛 Tow Assets:</span>
                  <span className="font-bold">{predictionData.resources.specialized}</span>
                </div>
              </div>
            </div>

            <div className="border-2 border-[#7F9DB9] bg-[#F4F2E8] p-4">
              <span className="text-[10px] uppercase tracking-wider text-[#505050] font-semibold">Recommended Upstream Detours</span>
              <ol className="mt-2 flex flex-col gap-1 text-xs text-black list-decimal list-inside">
                {predictionData.upstream_diversions.map((junc: any) => (
                  <li key={junc.id} className="truncate rounded border border-[#B7B7B7] bg-white px-2 py-1">
                    {junc.name} <span className="text-[#404040]">({Math.round(junc.distance_meters)}m)</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}