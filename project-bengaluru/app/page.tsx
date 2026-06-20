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
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [eventType, setEventType] = useState<'planned' | 'unplanned'>('unplanned');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInactive, setIsInactive] = useState(false);

  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const LRef = useRef<any>(null);
  const inactivityTimerRef = useRef<any>(null);

  const resetInactivityTimer = () => {
    if (isInactive) {
      setIsInactive(false); 
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    inactivityTimerRef.current = setTimeout(() => {
      setIsInactive(true);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance("Tactical system standby mode activated due to inactivity.");
        window.speechSynthesis.speak(msg);
      }
    }, 720000); 
  };

  useEffect(() => {
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    
    resetInactivityTimer();
    
    return () => {
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
      window.removeEventListener('scroll', resetInactivityTimer);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isInactive]);

  useEffect(() => {
    fetch('/api/health').catch(e => console.error(e));

    const keepAliveInterval = setInterval(() => {
      if (!isInactive) {
        fetch('/api/health')
          .then(res => res.json())
          .then(data => console.log("Heartbeat success:", data))
          .catch(err => console.error(err));
      }
    }, 600000); 

    return () => clearInterval(keepAliveInterval);
  }, [isInactive]);

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView([latitude, longitude - 0.01], 13);
    }
  };

  const formatCauseLabel = (rawCause: string) => {
    const causeLabels: Record<string, string> = {
      vehicle_breakdown: "Vehicle Breakdown",
      water_logging: "Water Logging",
      accident: "Accident / Collision",
      tree_fall: "Tree Fall",
      pot_holes: "Severe Pothole",
      sudden_gathering: "Sudden Gathering",
      public_event: "Planned Public Event",
      political_rally: "Political Rally",
      festival: "Festival",
      sports_event: "Sports Event",
      construction: "Construction Activity"
    };
    return causeLabels[rawCause] || rawCause.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const speakDispatch = (data: any) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && voiceEnabled) {
      window.speechSynthesis.cancel();
      
      const message = `Alert. Congestion detected at ${data.guessed_landmark || "General Corridor"}. ` +
                      `Estimated clearance duration is ${data.event.duration_minutes} minutes. ` +
                      `Event Severity Score is ${data.event.ess_score}. ` +
                      `Tactical deployment mandated. Dispatching ${data.resources.manpower} officers, and ${data.resources.barricades} barricades. ` +
                      `Upstream detour routes are now active.`;
      
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Microsoft Zira") || v.lang === "en-US");
      if (preferredVoice) utterance.voice = preferredVoice;

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSearchLocation = async () => {
    if (!searchQuery) return;
    setSearchLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ", Bengaluru")}&format=json&limit=1`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Bengaluru-Traffic-Command-Center-Prototype'
        }
      });
      const data = await res.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        
        setLatitude(lat);
        setLongitude(lon);
        
        if (mapRef.current) {
          mapRef.current.setView([lat, lon - 0.01], 13);
        }
      } else {
        alert("Location not found. Try adding nearby keywords (e.g. Majestic, Agara, HSR).");
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced Autocomplete
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ", Bengaluru")}&format=json&limit=5`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Bengaluru-Traffic-Command-Center-Autocomplete'
          }
        });
        const data = await res.json();
        if (data) {
          setSuggestions(data);
        }
      } catch (err) {
        console.error("Autocomplete query failed:", err);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectSuggestion = (sug: any) => {
    const lat = parseFloat(sug.lat);
    const lon = parseFloat(sug.lon);
    
    setLatitude(lat);
    setLongitude(lon);
    setSearchQuery(sug.display_name.split(',')[0]); 
    setSuggestions([]);
    
    if (mapRef.current) {
      mapRef.current.setView([lat, lon - 0.01], 13);
    }
  };

  // Initialize Leaflet Map safely in NextJS Client
  useEffect(() => {
    if (typeof window !== 'undefined' && !mapRef.current) {
      import('leaflet').then((L) => {
        LRef.current = L;

        mapRef.current = L.map('leaflet-container', { zoomControl: false }).setView([latitude, longitude], 12);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }).addTo(mapRef.current);

        L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

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
    setPredictionData(null); 
    clearMarkers();
    updateMapView(latitude, longitude);

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          latitude,
          longitude,
          event_cause: cause,
          vehicle_tier: tier,
          requires_road_closure: closure,
          start_datetime: new Date().toISOString(),
          description: description,
          address: ""
        }),
      });

      const data = await response.json();
      setPredictionData(data);

      speakDispatch(data);

      const L = LRef.current;
      if (L && mapRef.current) {
        const redIcon = L.icon({
          iconUrl: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const yellowIcon = L.divIcon({
          html: '<div style="font-size: 24px; line-height: 1; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.35));">🚧</div>',
          className: 'custom-leaflet-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const greenIcon = L.divIcon({
          html: '<div style="font-size: 20px; line-height: 1; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.35));">🟢</div>',
          className: 'custom-leaflet-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        // 1. Plot Red Incident Pin (Using clean formatting helper for cause)
        const incidentMarker = L.marker([latitude, longitude], { icon: redIcon }).addTo(mapRef.current);
        incidentMarker.bindPopup(`<b>Bottleneck</b><br>${formatCauseLabel(cause)}`).openPopup();
        markersRef.current.push(incidentMarker);

        // 2. Plot Red Congestion Impact Zone (Circle)
        const computedRadius = (data.event.ess_score || 30) * 12;
        const congestionCircle = L.circle([latitude, longitude], {
          color: '#f43f5e',
          fillColor: '#f43f5e',
          fillOpacity: 0.12,
          radius: computedRadius,
          weight: 1.5
        }).addTo(mapRef.current);
        markersRef.current.push(congestionCircle);

        // 3. Plot Yellow Checkpoints & Green Outlets
        if (data.upstream_diversions && data.safe_outlets) {
          const checkpoints = data.upstream_diversions;
          const outlets = data.safe_outlets;

          checkpoints.forEach((junc: any) => {
            const detourMarker = L.marker([junc.latitude, junc.longitude], { icon: yellowIcon }).addTo(mapRef.current);
            detourMarker.bindPopup(`<b>Checkpoint Barricade</b><br>${junc.name}`);
            markersRef.current.push(detourMarker);
          });

          outlets.forEach((junc: any) => {
            const outletMarker = L.marker([junc.latitude, junc.longitude], { icon: greenIcon }).addTo(mapRef.current);
            outletMarker.bindPopup(`<b>Dispersal Outlet</b><br>${junc.name}`);
            markersRef.current.push(outletMarker);
          });

          // 4. Draw 3 Independent, Street-Snapped Diversion Channels Routing OUTWARD
          for (let i = 0; i < checkpoints.length; i++) {
            const start = checkpoints[i];
            const end = outlets[i];
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

            try {
              const osrmRes = await fetch(osrmUrl);
              const osrmData = await osrmRes.json();

              if (osrmData.routes && osrmData.routes.length > 0) {
                const routeCoords = osrmData.routes[0].geometry.coordinates.map((coord: any) => [coord[1], coord[0]]);

                const detourRoute = L.polyline(routeCoords, {
                  color: '#06b6d4', 
                  weight: 5,
                  opacity: 0.85,
                  lineJoin: 'round',
                  dashArray: '10, 15', 
                  className: 'flowing-detour-path' 
                }).addTo(mapRef.current);

                markersRef.current.push(detourRoute);
              }
            } catch (err) {
              console.error(`OSRM routing failed for path ${i}:`, err);
              const fallbackLine = L.polyline([[start.latitude, start.longitude], [end.latitude, end.longitude]], {
                color: '#38bdf8',
                weight: 3,
                dashArray: '6, 8',
                opacity: 0.8
              }).addTo(mapRef.current);
              markersRef.current.push(fallbackLine);
            }
          }
        }
      }
    } catch (error) {
      console.error("Prediction Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`relative h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800 ${loading ? 'cursor-wait' : ''}`}>
      
      {/* Global CSS Style tag for OSRM Route Flow Animation */}
      <style jsx global>{`
        @keyframes flow-detour {
          to {
            stroke-dashoffset: -25;
          }
        }
        .flowing-detour-path {
          animation: flow-detour 1.4s linear infinite;
        }
      `}</style>

      {/* Map Background Container */}
      <div id="leaflet-container" className="absolute inset-0 h-full w-full bg-slate-200" />

      {/* Floating Map Legend (Top Right) - Responsive Inset */}
      <div className="absolute top-4 right-4 z-[1000] flex w-52 flex-col rounded-lg border-4 border-slate-200/50 bg-[#eef3fa]/95 shadow-lg backdrop-blur-md select-none max-md:hidden">
        {/* Title bar for Legend */}
        <div className="relative flex items-center justify-between border-b border-[#144783] bg-gradient-to-r from-[#1c64b5] via-[#4899e0] to-[#1c64b5] px-2.5 py-1 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/5 to-transparent h-1/2 pointer-events-none" />
          <span className="text-[11px] font-bold z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">Tactical Legend</span>
        </div>
        
        <div className="flex flex-col gap-2 p-3 text-[11px] font-bold text-slate-700">
          <div className="flex items-center gap-2 p-1">
            <img src="https://maps.google.com/mapfiles/ms/icons/red-dot.png" className="h-4 w-4 object-contain" alt="Incident Bottleneck" />
            <span>Incident Bottleneck</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">⭕</span>
            <span>Impact Radius (ESS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">🚧</span>
            <span>Checkpoint Barricade</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">🟢</span>
            <span>Dispersal Outlet</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-6 rounded bg-[#06b6d4]"></span>
            <span>Bypass Route (OSRM)</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-4 top-4 z-[2000] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#5293e1] via-[#1056b2] to-[#04337a] border-[3px] border-white/60 shadow-[0_3px_10px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] cursor-pointer hover:brightness-110 active:scale-95 transition-all md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="5" width="16" height="3" rx="1.5" />
          <rect x="4" y="10.5" width="16" height="3" rx="1.5" />
          <rect x="4" y="16" width="16" height="3" rx="1.5" />
        </svg>
      </button>

      {/* Floating Control Panel - Fixed dynamic translate logic to prevent tablet clipping */}
      <div className={`absolute bottom-4 left-4 top-4 z-[1000] flex w-[calc(100vw-32px)] md:w-[400px] flex-col rounded-lg border-[5px] border-slate-200/50 bg-[#eef3fa]/95 shadow-[0_10px_35px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform duration-300 ease-in-out max-md:absolute max-md:left-4 ${sidebarOpen ? 'translate-x-0' : 'max-md:-translate-x-[calc(100%+24px)]'}`}>
        
        <div className="relative flex select-none items-center justify-between border-b border-[#144783] bg-gradient-to-r from-[#1c64b5] via-[#4899e0] to-[#1c64b5] px-3.5 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          {/* Glass Gloss stripe */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/5 to-transparent h-1/2 pointer-events-none" />
          <div className="flex items-center gap-1.5 z-10">
            <span className="text-sm">🛡️</span>
            <span className="text-xs font-bold tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">GRID-Lock Control Center</span>
          </div>
          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded bg-red-600/80 border border-red-700/50 text-white text-[10px] font-bold h-4 w-6 flex items-center justify-center hover:bg-red-600 md:hidden z-20 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
          >
            X
          </button>
        </div>

        {/* Scrollable Window Body */}
        <div className="relative flex-1 overflow-hidden">
          
          {isInactive && (
            <div className="absolute inset-0 z-[3000] flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center backdrop-blur-md animate-fade-in select-none">
              <span className="text-5xl mb-4">💤</span>
              <h2 className="text-sm font-bold text-sky-400 uppercase tracking-wider">Tactical System Standby</h2>
              <p className="text-[11px] text-slate-400 mt-2 max-w-[240px] leading-relaxed">
                Heartbeat pings suspended after 12 minutes of inactivity to allow the Render server to safely sleep.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsInactive(false);
                  resetInactivityTimer();
                }}
                className="mt-6 rounded border border-[#003C74] bg-gradient-to-b from-[#5CA6FF] to-[#2B67C8] px-6 py-2 text-xs font-bold text-white shadow hover:brightness-105 active:scale-95"
              >
                Wake Up System 🔄
              </button>
            </div>
          )}

          <div className="absolute inset-0 overflow-y-auto p-5 flex flex-col gap-4">
            {/* Quick Search Geocoder */}
            <div className="relative flex flex-col gap-1.5 border-b border-slate-300 pb-4">
              <label className="text-xs font-bold text-[#144783]">Search Place / Landmark</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Type 3+ letters: e.g. Majestic, Agara..."
                  className="flex-1 rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  disabled={searchLoading}
                  onClick={handleSearchLocation}
                  className="rounded border border-[#707070] bg-gradient-to-b from-[#f2f7fc] via-[#ebeef4] to-[#cfd8e2] px-4 text-xs font-semibold text-slate-800 shadow-[0_1px_1px_rgba(0,0,0,0.1)] hover:from-[#fcfdff] hover:to-[#e2ecf5] active:scale-95 disabled:opacity-50"
                >
                  {searchLoading ? '...' : 'Search'}
                </button>
              </div>

              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-14 z-[2000] mt-1 max-h-48 overflow-y-auto rounded border border-[#7f9db9] bg-white shadow-xl">
                  {suggestions.map((sug, idx) => (
                    <li
                      key={idx}
                      onClick={() => handleSelectSuggestion(sug)}
                      className="cursor-pointer border-b border-slate-100 px-3 py-2 text-xs hover:bg-[#316ac5] hover:text-white text-slate-800 last:border-none"
                    >
                      {sug.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Event Classification Segmented Toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#144783]">Event Classification</label>
              <div className="grid grid-cols-2 gap-1 rounded border border-[#7f9db9] bg-[#dcebf4] p-0.5 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]">
                <button
                  type="button"
                  onClick={() => setEventType('unplanned')}
                  className={`rounded py-1.5 text-xs font-bold transition-all ${
                    eventType === 'unplanned' 
                      ? 'bg-gradient-to-b from-[#e3f0fc] to-[#adc7e8] border border-[#7f9db9] text-[#144783] shadow-md' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Unplanned
                </button>
                <button
                  type="button"
                  onClick={() => setEventType('planned')}
                  className={`rounded py-1.5 text-xs font-bold transition-all ${
                    eventType === 'planned' 
                    ? 'bg-gradient-to-b from-[#e3f0fc] to-[#adc7e8] border border-[#7f9db9] text-[#144783] shadow-md' 
                    : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Planned
                </button>
              </div>
            </div>

            <form onSubmit={handlePredict} className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#144783]">Spatial Coordinates</span>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="text-[10px] font-bold text-[#1a5fb4] hover:text-[#316ac5] hover:underline cursor-pointer"
                >
                  Recenter Map 🔄
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 -mt-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none"
                    value={latitude}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setLatitude(val);
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none"
                    value={longitude}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setLongitude(val);
                    }}
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-[#144783]">Operator Remarks / Description</label>
                <textarea
                  placeholder="e.g. tree fall on MG Road near Metro station..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none h-14 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#144783]">Incident Cause / Type</label>
                <select
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  className="w-full rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none"
                >
                  {eventType === 'unplanned' ? (
                    <>
                      <option value="vehicle_breakdown">Vehicle Breakdown</option>
                      <option value="water_logging">Water Logging</option>
                      <option value="accident">Accident / Collision</option>
                      <option value="tree_fall">Tree Fall</option>
                      <option value="pot_holes">Severe Pothole</option>
                    </>
                  ) : (
                    <>
                      <option value="public_event">Planned Public Event (Rally/Festival/Match)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#144783]">Vehicle Weight Category</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full rounded border border-[#7f9db9] bg-white px-3 py-1.5 text-xs text-slate-800 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] focus:border-[#316ac5] focus:outline-none"
                >
                  <option value="Tier_3_Light">Tier 3 (Light Two/Three Wheeler)</option>
                  <option value="Tier_2_Medium">Tier 2 (Medium Cars/SUVs)</option>
                  <option value="Tier_1_Heavy">Tier 1 (Heavy BMTC Bus/Truck/LCV)</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="closure"
                    checked={closure}
                    onChange={(e) => setClosure(e.target.checked)}
                    className="h-4 w-4 rounded border-[#7f9db9] bg-white accent-[#316ac5]"
                  />
                  <label htmlFor="closure" className="text-xs font-bold text-[#144783] select-none">
                    Requires Road Closure
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="voice"
                    checked={voiceEnabled}
                    onChange={(e) => setVoiceEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-[#7f9db9] bg-white accent-[#316ac5]"
                  />
                  <label htmlFor="voice" className="text-xs font-bold text-[#144783] select-none">
                    Voice Dispatch 🔊
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded border border-[#003C74] bg-gradient-to-b from-[#5CA6FF] to-[#2B67C8] py-2.5 font-bold text-white shadow shadow-sky-500/20 transition-all hover:brightness-105 active:translate-y-px disabled:opacity-60"
              >
                {loading ? 'Processing Decisions...' : 'Predict & Deploy Resources'}
              </button>
            </form>

            {loading && (
              <div className="flex flex-col gap-4 border-t border-slate-300 pt-4 animate-pulse">
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-16 rounded border border-slate-300/60 bg-slate-300/40 p-3 shadow-inner"></div>
                  <div className="h-16 rounded border border-slate-300/60 bg-slate-300/40 p-3 shadow-inner"></div>
                </div>
                <div className="h-24 rounded border border-slate-300/60 bg-slate-300/40 p-4 shadow-inner"></div>
                <div className="h-12 rounded border border-slate-300/60 bg-slate-300/40 p-4 shadow-inner"></div>
                <div className="h-28 rounded border border-slate-300/60 bg-slate-300/40 p-4 shadow-inner"></div>
              </div>
            )}

            {predictionData && !loading && (
              <div className="flex flex-col gap-4 border-t border-slate-300 pt-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded border border-[#7f9db9] bg-[#f4f2e8] p-3 shadow-inner">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Est. Duration</span>
                    <p className="text-xl font-bold text-[#144783]">{predictionData.event.duration_minutes}m</p>
                  </div>
                  <div className="rounded border border-[#7f9db9] bg-[#f4f2e8] p-3 shadow-inner">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Severity (ESS)</span>
                    <p className="text-xl font-bold text-red-600">{predictionData.event.ess_score}</p>
                  </div>
                </div>

                <div className="rounded border border-[#7f9db9] bg-[#f4f2e8] p-4 shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Deployment Mandate</span>
                  <div className="mt-2 flex flex-col gap-1.5 text-xs text-slate-800">
                    <div className="flex justify-between border-b border-slate-300/30 pb-1">
                      <span className="font-semibold">👮 Traffic Police:</span>
                      <span className="font-bold text-[#144783]">{predictionData.resources.manpower} Officers</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-300/30 pb-1">
                      <span className="font-semibold">🚧 Barricading Unit:</span>
                      <span className="font-bold text-[#144783]">{predictionData.resources.barricades} Gates</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">🚛 Tow Assets:</span>
                      <span className="font-bold text-[#144783]">{predictionData.resources.specialized}</span>
                    </div>
                  </div>
                </div>
                
                <div className="rounded border border-[#7f9db9] bg-[#f4f2e8] p-4 shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Parsed Location Remark</span>
                  <p className="text-xs font-bold text-[#144783] mt-1">
                    📍 {predictionData.guessed_landmark || "General Corridor Delay"}
                  </p>
                </div>
                
                <div className="rounded border border-[#7f9db9] bg-[#f4f2e8] p-4 shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recommended Upstream Detours</span>
                  <ol className="mt-2 flex flex-col gap-1 text-xs text-slate-800 list-decimal list-inside">
                    {predictionData.upstream_diversions.map((junc: any) => (
                      <li key={junc.id} className="truncate rounded border border-[#b7b7b7] bg-white px-2 py-1 shadow-sm mt-1">
                        {junc.name} <span className="text-slate-500 font-semibold">({Math.round(junc.distance_meters)}m)</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}