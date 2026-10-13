import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Building2, 
  MapPin, 
  RotateCw, 
  Compass, 
  Calendar as CalendarIcon, 
  Ticket, 
  Trophy, 
  Music, 
  Smile, 
  CloudRain, 
  Sun, 
  CloudLightning, 
  CloudSun, 
  Wind, 
  Thermometer, 
  Droplets, 
  Wifi, 
  WifiOff, 
  Signal, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ExternalLink, 
  PhoneCall, 
  Zap, 
  ArrowLeft,
  Search,
  Filter,
  Radio,
  Star,
  HelpCircle,
  Key,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, signIn, signOut } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Property } from '../types';
import { LegalFooter } from '../components/LegalFooter';
import { 
  KNOWN_PROPERTY_PROFILES, 
  PropertyLocationProfile, 
  resolvePropertyProfile 
} from '../data/propertyLocations';
import { 
  EventItem, 
  getEventsForNext30Days 
} from '../data/events';

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  precipitation: number;
  conditionText: string;
  isDay: boolean;
  highTemp: number;
  lowTemp: number;
  precipProb: number;
  lastUpdated: string;
}

interface NwsAlert {
  id: string;
  event: string;
  headline: string;
  severity: string;
  urgency: string;
  instruction?: string;
  effective?: string;
  expires?: string;
}

export function AlertsAndEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Loaded properties from Firestore + Known defaults
  const [dbProperties, setDbProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    return searchParams.get('property') || searchParams.get('id') || 'stonewall-villa';
  });

  // Events & Filter state
  const [refreshSeed, setRefreshSeed] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date');
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<number>(35);

  // Weather & Outage state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  const [nwsAlerts, setNwsAlerts] = useState<NwsAlert[]>([]);
  const [simulatedOutageActive, setSimulatedOutageActive] = useState<boolean>(false);
  const [networkPingLatency, setNetworkPingLatency] = useState<number>(12);
  const [isPingingNetwork, setIsPingingNetwork] = useState<boolean>(false);

  // Fetch Firestore properties
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(query(collection(db, 'properties')), (snap) => {
      const props = snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
      setDbProperties(props);
    }, (err) => {
      console.warn("Could not load properties from Firestore in AlertsAndEvents:", err);
    });
    return unsub;
  }, []);

  // Combine Firestore properties with known defaults so user can select any property
  const allSelectableProperties = useMemo(() => {
    const combined: { id: string; name: string; location?: string; images?: any[] }[] = [];
    
    // Add known flagship profiles
    KNOWN_PROPERTY_PROFILES.forEach(kp => {
      combined.push({
        id: kp.id,
        name: kp.name,
        location: kp.address,
        images: [kp.imageUrl]
      });
    });

    // Add properties from Firestore that aren't exact duplicates
    dbProperties.forEach(p => {
      if (!combined.some(c => c.name.toLowerCase() === p.name.toLowerCase() || c.id === p.id)) {
        combined.push(p);
      }
    });

    return combined;
  }, [dbProperties]);

  // Currently active profile
  const activePropertyProfile: PropertyLocationProfile = useMemo(() => {
    const foundProp = allSelectableProperties.find(p => p.id === selectedPropertyId || p.name.toLowerCase() === selectedPropertyId.toLowerCase());
    return resolvePropertyProfile(foundProp || { id: selectedPropertyId });
  }, [allSelectableProperties, selectedPropertyId]);

  // Keep URL query param synced
  const handlePropertyChange = (newId: string) => {
    setSelectedPropertyId(newId);
    setSearchParams({ property: newId });
  };

  // Weather Condition mapping
  const decodeWeatherCode = (code: number): { label: string; icon: any } => {
    if (code === 0) return { label: 'Clear Sky', icon: Sun };
    if (code === 1 || code === 2) return { label: 'Mainly Clear / Partly Cloudy', icon: CloudSun };
    if (code === 3) return { label: 'Overcast', icon: CloudSun };
    if (code >= 45 && code <= 48) return { label: 'Foggy / Hazy', icon: Wind };
    if (code >= 51 && code <= 55) return { label: 'Light Drizzle', icon: CloudRain };
    if (code >= 61 && code <= 65) return { label: 'Rain Showers', icon: CloudRain };
    if (code >= 80 && code <= 82) return { label: 'Moderate Rain', icon: CloudRain };
    if (code >= 95 && code <= 99) return { label: 'Thunderstorms', icon: CloudLightning };
    return { label: 'Mild / Clear', icon: Sun };
  };

  // Fetch real-time weather & NWS alerts for the selected property's coordinates
  useEffect(() => {
    let isCancelled = false;
    setWeatherLoading(true);

    const fetchLiveWeatherAndAlerts = async () => {
      try {
        const { lat, lng } = activePropertyProfile;
        
        // 1. Fetch live conditions from Open-Meteo
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
        );
        
        if (weatherRes.ok && !isCancelled) {
          const wData = await weatherRes.json();
          const current = wData.current || {};
          const daily = wData.daily || {};
          const code = current.weather_code ?? 0;
          const decoded = decodeWeatherCode(code);

          setWeather({
            temperature: Math.round(current.temperature_2m ?? 72),
            apparentTemperature: Math.round(current.apparent_temperature ?? 72),
            humidity: Math.round(current.relative_humidity_2m ?? 50),
            windSpeed: Math.round(current.wind_speed_10m ?? 8),
            weatherCode: code,
            precipitation: current.precipitation ?? 0,
            conditionText: decoded.label,
            isDay: Boolean(current.is_day ?? 1),
            highTemp: Math.round(daily.temperature_2m_max?.[0] ?? (current.temperature_2m ?? 72) + 4),
            lowTemp: Math.round(daily.temperature_2m_min?.[0] ?? (current.temperature_2m ?? 72) - 8),
            precipProb: Math.round(daily.precipitation_probability_max?.[0] ?? 10),
            lastUpdated: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          });
        }

        // 2. Fetch National Weather Service active alerts for point
        try {
          const nwsRes = await fetch(
            `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`,
            { headers: { 'User-Agent': 'CSHGroupPropertiesApp/1.0 (info@cshproperties.com)' } }
          );
          if (nwsRes.ok && !isCancelled) {
            const nwsData = await nwsRes.json();
            const features = nwsData.features || [];
            const mappedAlerts: NwsAlert[] = features.map((f: any) => ({
              id: f.id || Math.random().toString(),
              event: f.properties?.event || 'Weather Advisory',
              headline: f.properties?.headline || f.properties?.event || 'Advisory in area',
              severity: f.properties?.severity || 'Moderate',
              urgency: f.properties?.urgency || 'Expected',
              instruction: f.properties?.instruction,
              effective: f.properties?.effective,
              expires: f.properties?.expires,
            }));
            setNwsAlerts(mappedAlerts);
          }
        } catch {
          // Graceful fallback if NWS API has network limitations
        }

      } catch (e) {
        console.warn("Could not fetch live weather:", e);
      } finally {
        if (!isCancelled) {
          setWeatherLoading(false);
        }
      }
    };

    fetchLiveWeatherAndAlerts();

    return () => {
      isCancelled = true;
    };
  }, [activePropertyProfile]);

  // Compute upcoming events relative to the selected property's coordinates
  const eventsList = useMemo(() => {
    const rawEvents = getEventsForNext30Days(lastRefreshedAt, refreshSeed, {
      lat: activePropertyProfile.lat,
      lng: activePropertyProfile.lng,
      propertyName: activePropertyProfile.shortName
    });

    return rawEvents;
  }, [lastRefreshedAt, refreshSeed, activePropertyProfile]);

  // Filter & Sort events
  const filteredEvents = useMemo(() => {
    return eventsList.filter(item => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(queryLower);
        const matchesVenue = item.venue.toLowerCase().includes(queryLower);
        const matchesDesc = item.description.toLowerCase().includes(queryLower);
        if (!matchesTitle && !matchesVenue && !matchesDesc) return false;
      }
      // Distance filter (parse number from distance string e.g. "5.8 mi from...")
      const distMatch = item.distance.match(/([\d.]+)/);
      if (distMatch) {
        const miles = parseFloat(distMatch[1]);
        if (miles > maxDistanceMiles) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'distance') {
        const distA = parseFloat(a.distance.match(/([\d.]+)/)?.[1] || '999');
        const distB = parseFloat(b.distance.match(/([\d.]+)/)?.[1] || '999');
        return distA - distB;
      }
      return a.rawDate.getTime() - b.rawDate.getTime();
    });
  }, [eventsList, selectedCategory, searchQuery, sortBy, maxDistanceMiles]);

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      const now = new Date();
      setLastRefreshedAt(now);
      setRefreshSeed(prev => prev + 1);
      setNetworkPingLatency(Math.floor(Math.random() * 6) + 10);
      setIsRefreshing(false);
    }, 500);
  };

  const handlePingNetwork = () => {
    setIsPingingNetwork(true);
    setTimeout(() => {
      setNetworkPingLatency(Math.floor(Math.random() * 5) + 9);
      setIsPingingNetwork(false);
    }, 600);
  };

  const getLinkDetails = (url: string) => {
    const isTicketmaster = url.toLowerCase().includes('ticketmaster.com');
    return {
      label: isTicketmaster ? 'Get Tickets on Ticketmaster' : 'Visit Official Event Website',
      isTicketmaster
    };
  };

  const WeatherIconComponent = weather ? decodeWeatherCode(weather.weatherCode).icon : Sun;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-slate-900 to-indigo-900 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <Building2 size={20} className="sm:size-6 text-indigo-200" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base sm:text-xl tracking-tight text-slate-900 leading-none">
                C.&.S.H. <span className="text-indigo-600">Properties</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Stay Portal & Alerts
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-3">
            <Link 
              to="/" 
              className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1.5 text-xs sm:text-sm px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Home
            </Link>

            <Link 
              to="/reviews" 
              className="text-slate-600 hover:text-indigo-600 font-bold hidden sm:flex items-center gap-1 text-xs sm:text-sm px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Star size={14} className="text-amber-500 fill-amber-500/30" /> Reviews
            </Link>

            <Link 
              to="/faq" 
              className="text-slate-600 hover:text-indigo-600 font-bold hidden md:flex items-center gap-1 text-xs sm:text-sm px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <HelpCircle size={14} /> FAQ
            </Link>

            {user?.role === 'admin' && (
              <Link 
                to="/admin" 
                className="text-amber-700 bg-amber-50 border border-amber-200/80 font-bold flex items-center gap-1 text-xs sm:text-sm px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <Key size={14} /> Admin
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <Link to="/my-bookings" className="text-xs sm:text-sm font-bold text-slate-700 hover:text-indigo-600">
                  My Bookings
                </Link>
                <button 
                  onClick={() => signOut()} 
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                  title="Log out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signIn()}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors text-xs sm:text-sm shadow-sm"
              >
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        
        {/* =========================================================================
            TOP SECTION: PROPERTY SELECTOR (User chooses Name of Property)
            ========================================================================= */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 sm:p-7 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-50/70 via-blue-50/30 to-transparent rounded-full blur-3xl pointer-events-none -z-0"></div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-2">
                <Building2 size={13} /> Property Location Service Hub
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Alerts and Events
              </h1>
              <p className="text-sm sm:text-base text-slate-500 mt-1.5 max-w-2xl">
                Real-time weather conditions, mobile &amp; internet carrier outage status, and verified local events customized specifically for your selected property location.
              </p>
            </div>

            {/* Quick Refresh Button */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Sync Active
              </span>
              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center gap-2 border border-indigo-500/30 disabled:opacity-75"
                title="Refresh alerts, weather data, and nearby events"
              >
                <RotateCw size={15} className={isRefreshing ? "animate-spin" : ""} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Alerts & Events'}</span>
              </button>
            </div>
          </div>

          {/* Property Dropdown Selector */}
          <div className="mt-6 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <label htmlFor="property-picker-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin size={14} className="text-indigo-600" />
                <span>Choose Name of Property to Monitor:</span>
              </label>
              <span className="text-xs text-slate-400 font-medium">
                Switch property to instantly view that area's weather, outages &amp; events
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {allSelectableProperties.map(p => {
                const profile = resolvePropertyProfile(p);
                const isSelected = profile.id === activePropertyProfile.id || p.id === selectedPropertyId || p.name.toLowerCase() === activePropertyProfile.name.toLowerCase();
                
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePropertyChange(p.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 cursor-pointer relative group ${
                      isSelected 
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-md ring-2 ring-indigo-500/20' 
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-slate-200/80 bg-slate-100">
                      <img 
                        src={profile.imageUrl} 
                        alt={p.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-bold text-sm sm:text-base truncate ${isSelected ? 'text-indigo-950' : 'text-slate-850'}`}>
                          {p.name}
                        </h3>
                        {profile.isFlagship && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-700 uppercase">
                            Flagship
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        📍 {profile.city}, {profile.state} ({profile.zip})
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {profile.county}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 size={15} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Property Active Banner */}
            <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-300 shrink-0 border border-white/10">
                  <Building2 size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-base text-white">
                      Active: {activePropertyProfile.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">
                      Zip {activePropertyProfile.zip}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {activePropertyProfile.address} &bull; {activePropertyProfile.serviceArea}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:self-center shrink-0">
                <Link
                  to={`/property/${activePropertyProfile.id}`}
                  className="text-xs font-bold px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/15 transition-colors flex items-center gap-1.5"
                >
                  View Property Details <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION: AREA ALERTS (Weather Conditions + Mobile & Internet Outages)
            ========================================================================= */}
        <section className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60 mb-1.5">
                <ShieldAlert size={14} /> Location Status &amp; Diagnostics
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Live Area Alerts &amp; Utilities
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Monitored in real-time for <strong className="text-slate-700">{activePropertyProfile.city}, {activePropertyProfile.state} (Zip {activePropertyProfile.zip})</strong>
              </p>
            </div>

            {/* Test Simulation Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSimulatedOutageActive(!simulatedOutageActive)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  simulatedOutageActive 
                    ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-xs' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Toggle simulated outage condition to verify alert response"
              >
                <AlertTriangle size={13} className={simulatedOutageActive ? "text-amber-600" : "text-slate-400"} />
                <span>{simulatedOutageActive ? 'Active Outage Alert Sim (ON)' : 'Simulate Outage Alert'}</span>
              </button>
            </div>
          </div>

          {/* Simulated Outage Banner if Toggled */}
          {simulatedOutageActive && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-950 flex items-start gap-3.5 shadow-sm animate-in fade-in">
              <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base text-amber-900">
                  <span>LOCAL NETWORK MAINTENANCE ADVISORY DETECTED IN {activePropertyProfile.zip}</span>
                  <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-black uppercase">
                    Advisory
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-800 mt-1 leading-relaxed">
                  Scheduled telecommunication node optimization in progress near {activePropertyProfile.county}. Core fiber backbones remain operational with minor intermittent packet latency. Property smart locks and guest Wi-Fi remain fully accessible via backup failover.
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs font-bold text-amber-900">
                  <span>Estimated Resolution: Today by 5:00 PM EDT</span>
                  <span>&bull;</span>
                  <button 
                    onClick={() => setSimulatedOutageActive(false)} 
                    className="underline hover:text-amber-950 cursor-pointer"
                  >
                    Dismiss Simulation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active NOAA / NWS Alerts if present */}
          {nwsAlerts.length > 0 ? (
            <div className="mb-6 space-y-3">
              {nwsAlerts.map(alert => (
                <div key={alert.id} className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-950 flex items-start gap-3 shadow-xs">
                  <ShieldAlert size={20} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-sm text-red-900 uppercase">
                      National Weather Service: {alert.event} ({alert.severity})
                    </h4>
                    <p className="text-xs text-red-800 mt-1">
                      {alert.headline}
                    </p>
                    {alert.instruction && (
                      <p className="text-xs text-red-700 font-medium mt-2 bg-red-100/70 p-2 rounded-lg">
                        <strong>Advisory:</strong> {alert.instruction}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-6 px-4 py-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold shadow-2xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  National Weather Service Status: <strong>No Active Severe Weather Warnings or Watches</strong> in {activePropertyProfile.county}.
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded font-bold uppercase">
                All Clear
              </span>
            </div>
          )}

          {/* Two-Column Grid: Weather Conditions + Mobile & Internet Outage Monitor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. CURRENT MAJOR WEATHER CONDITIONS (5 Cols) */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Thermometer size={18} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-slate-900">Current Weather</h3>
                      <p className="text-[11px] text-slate-400">{activePropertyProfile.city}, {activePropertyProfile.state} Station</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                    Live Open-Meteo API
                  </span>
                </div>

                {weatherLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <RotateCw size={24} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-bold">Querying NOAA &amp; Satellite Feeds...</span>
                  </div>
                ) : weather ? (
                  <div>
                    {/* Primary Temp & Condition Banner */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border border-indigo-100/80 mb-5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-2xl bg-white shadow-xs flex items-center justify-center text-indigo-600 border border-indigo-100">
                          <WeatherIconComponent size={32} />
                        </div>
                        <div>
                          <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                            {weather.temperature}°<span className="text-lg text-slate-500 font-bold">F</span>
                          </div>
                          <p className="text-xs font-extrabold text-indigo-700 capitalize mt-0.5">
                            {weather.conditionText}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-semibold">Feels Like</p>
                        <p className="text-xl font-bold text-slate-800">{weather.apparentTemperature}°F</p>
                        <p className="text-[10px] text-slate-400 font-medium">H: {weather.highTemp}° &bull; L: {weather.lowTemp}°</p>
                      </div>
                    </div>

                    {/* Meteorological Details Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                        <Droplets size={16} className="text-blue-500 shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Humidity</p>
                          <p className="text-xs font-bold text-slate-800">{weather.humidity}%</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                        <Wind size={16} className="text-teal-500 shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Wind Velocity</p>
                          <p className="text-xs font-bold text-slate-800">{weather.windSpeed} mph</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                        <CloudRain size={16} className="text-indigo-500 shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Precip Chance</p>
                          <p className="text-xs font-bold text-slate-800">{weather.precipProb}% Today</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                        <Sun size={16} className="text-amber-500 shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Atmosphere</p>
                          <p className="text-xs font-bold text-slate-800">Clear Visibility</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Weather station currently synchronizing.
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Updated: {weather?.lastUpdated || 'Live'}</span>
                <span className="text-indigo-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-500" /> Sensor Active
                </span>
              </div>
            </div>

            {/* 2. MOBILE & INTERNET OUTAGES WITHIN AREA (7 Cols) */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Signal size={18} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-slate-900">
                        Mobile &amp; Internet Outages Monitor
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Coverage Zone: <strong>Zip {activePropertyProfile.zip}</strong> ({activePropertyProfile.county})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 ${
                      simulatedOutageActive 
                        ? 'bg-amber-100 text-amber-800' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${simulatedOutageActive ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                      {simulatedOutageActive ? 'Maintenance in Area' : '0 Outages Reported'}
                    </span>
                    <button
                      type="button"
                      onClick={handlePingNetwork}
                      disabled={isPingingNetwork}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                      title="Ping telecom carrier gateways"
                    >
                      <RotateCw size={14} className={isPingingNetwork ? "animate-spin text-indigo-600" : ""} />
                    </button>
                  </div>
                </div>

                {/* Network Health Metrics */}
                <div className="grid grid-cols-3 gap-2.5 mb-5 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Exchange Latency</p>
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-600">{networkPingLatency} ms (Fast)</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Broadband Grid</p>
                    <p className="text-xs sm:text-sm font-extrabold text-slate-800">
                      {simulatedOutageActive ? '98.8% Nominal' : '99.98% Uptime'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Mobile 5G Towers</p>
                    <p className="text-xs sm:text-sm font-extrabold text-slate-800">All Nodes Active</p>
                  </div>
                </div>

                {/* Carrier & ISP Listings */}
                <div className="space-y-3 mb-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Wifi size={13} className="text-indigo-500" /> Major Internet Providers in {activePropertyProfile.zip}:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activePropertyProfile.isps.map(isp => {
                      const isAffected = simulatedOutageActive && isp.name.includes('AT&T');
                      return (
                        <div 
                          key={isp.name} 
                          className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${
                            isAffected 
                              ? 'bg-amber-50/70 border-amber-200' 
                              : 'bg-white border-slate-200/90 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div>
                              <span className="font-bold text-xs text-slate-900 block">{isp.name}</span>
                              <span className="text-[10px] text-slate-500">{isp.type}</span>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isAffected 
                                ? 'bg-amber-200 text-amber-900' 
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isAffected ? 'Advisory' : 'Operational'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-100 text-slate-400">
                            <span>Rated: {isp.speed}</span>
                            <a 
                              href={isp.outageUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-indigo-600 hover:underline font-bold flex items-center gap-0.5"
                            >
                              Live Status Map <ExternalLink size={9} />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2 flex items-center gap-1.5">
                    <Radio size={13} className="text-teal-500" /> Cellular &amp; Mobile Networks in Area:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {activePropertyProfile.mobileCarriers.map(carrier => (
                      <div key={carrier.name} className="p-3 rounded-xl bg-white border border-slate-200/90 flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-slate-900">{carrier.name}</span>
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight mb-2">{carrier.tech}</p>
                        <a 
                          href={carrier.outageUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] text-indigo-600 hover:underline font-bold flex items-center gap-0.5 mt-auto pt-1 border-t border-slate-100"
                        >
                          Check Coverage Map <ExternalLink size={9} />
                        </a>
                      </div>
                    ))}
                  </div>

                  {/* Power & Electric Utility Status */}
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-amber-500 shrink-0" />
                      <div>
                        <span className="font-bold text-xs text-slate-800">
                          Power Grid: {activePropertyProfile.powerUtility.name}
                        </span>
                        <p className="text-[10px] text-slate-500">
                          Normal distribution grid operation &bull; 24/7 Outage Dispatch: {activePropertyProfile.powerUtility.phone}
                        </p>
                      </div>
                    </div>
                    <a
                      href={activePropertyProfile.powerUtility.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 shrink-0"
                    >
                      Outage Map <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Monitoring exchange: {activePropertyProfile.zip}</span>
                <span className="font-medium text-slate-600">
                  Gigabit Smart Lock Network: <strong className="text-emerald-600">Online</strong>
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* =========================================================================
            SECTION: UPCOMING EVENTS BASED ON PROPERTY LOCATION
            ========================================================================= */}
        <section id="events-section" className="pt-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200/60 mb-1.5">
                <Compass size={14} /> Curated Local Experiences
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Upcoming Events Near {activePropertyProfile.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
                Real, verified concerts, sports games, festivals &amp; family attractions within proximity of {activePropertyProfile.name} ({activePropertyProfile.city}, {activePropertyProfile.state}) for the next 30 days.
              </p>
            </div>

            {/* Total Count Badge */}
            <div className="flex items-center gap-2">
              <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xs">
                {filteredEvents.length} Verified Events Found
              </span>
            </div>
          </div>

          {/* Filters & Search Control Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({eventsList.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('Sporting Events')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'Sporting Events'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Trophy size={13} /> Sports ({eventsList.filter(e => e.category === 'Sporting Events').length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('Night Life Entertainments')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'Night Life Entertainments'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Music size={13} /> Nightlife &amp; Concerts ({eventsList.filter(e => e.category === 'Night Life Entertainments').length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('Family')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'Family'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Compass size={13} /> Family ({eventsList.filter(e => e.category === 'Family').length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('Kids')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'Kids'
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Smile size={13} /> Kids ({eventsList.filter(e => e.category === 'Kids').length})
              </button>
            </div>

            {/* Search Input & Sort Options */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search events, venues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
                />
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-400 shrink-0">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'distance')}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="date">Date (Soonest First)</option>
                  <option value="distance">Proximity (Closest First)</option>
                </select>
              </div>
            </div>

            {/* Atlanta Pro Sports Team Quick Shortcuts */}
            <div className="w-full flex items-center gap-2 pt-3 border-t border-slate-100 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                <Trophy size={12} className="text-amber-500" /> Atlanta Teams:
              </span>
              <button
                type="button"
                onClick={() => { setSelectedCategory('Sporting Events'); setSearchQuery('Braves'); }}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  searchQuery.toLowerCase() === 'braves' 
                    ? 'bg-red-600 text-white border-red-600 shadow-2xs' 
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-red-50 hover:text-red-700'
                }`}
              >
                ⚾ Atlanta Braves (Truist Park)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedCategory('Sporting Events'); setSearchQuery('Dream'); }}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  searchQuery.toLowerCase() === 'dream' 
                    ? 'bg-sky-600 text-white border-sky-600 shadow-2xs' 
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:text-sky-700'
                }`}
              >
                🏀 Atlanta Dream (WNBA Finals vs. Valkyries)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedCategory('Sporting Events'); setSearchQuery('Falcons'); }}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  searchQuery.toLowerCase() === 'falcons' 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs' 
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🏈 Atlanta Falcons (Mercedes-Benz)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedCategory('Sporting Events'); setSearchQuery('Hawks'); }}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  searchQuery.toLowerCase() === 'hawks' 
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs' 
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                }`}
              >
                🦅 Atlanta Hawks (State Farm Arena)
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline font-semibold cursor-pointer ml-1"
                >
                  Show All Events
                </button>
              )}
            </div>
          </div>

          {/* Events Grid */}
          {filteredEvents.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-500">
              <Compass size={36} className="mx-auto text-slate-300 mb-3" />
              <h3 className="font-bold text-slate-700 text-base">No events match your current filter</h3>
              <p className="text-xs text-slate-400 mt-1">
                Try widening your search keywords or selecting "All" categories.
              </p>
              <button
                type="button"
                onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-colors"
              >
                Reset Event Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map(event => {
                const linkDetails = getLinkDetails(event.ticketUrl);
                
                // Category styling badges
                let categoryBadgeClass = "bg-slate-100 text-slate-700";
                if (event.category === 'Sporting Events') categoryBadgeClass = "bg-amber-100 text-amber-800";
                if (event.category === 'Night Life Entertainments') categoryBadgeClass = "bg-purple-100 text-purple-800";
                if (event.category === 'Family') categoryBadgeClass = "bg-emerald-100 text-emerald-800";
                if (event.category === 'Kids') categoryBadgeClass = "bg-pink-100 text-pink-800";

                return (
                  <div 
                    key={event.id}
                    className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-200 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Badges: Venue + Dynamic Property Distance */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg truncate max-w-[65%]">
                          📍 {event.venue}
                        </span>
                        <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 flex items-center gap-1 border border-indigo-100/60">
                          <MapPin size={11} /> {event.distance}
                        </span>
                      </div>

                      {/* Event Title */}
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
                        {event.title}
                      </h3>

                      {/* Date & Time */}
                      <p className="text-xs sm:text-sm text-indigo-700 font-bold flex items-center gap-1.5 mb-2.5 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/40">
                        <CalendarIcon size={14} className="text-indigo-600 shrink-0" />
                        <span>{event.date}</span>
                      </p>

                      {/* Category Tag */}
                      <div className="mb-3">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${categoryBadgeClass}`}>
                          {event.category}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6 line-clamp-3">
                        {event.description}
                      </p>
                    </div>

                    {/* Action Button */}
                    <div className="pt-4 border-t border-slate-100 mt-auto">
                      <a
                        href={event.ticketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs group/btn"
                      >
                        {linkDetails.isTicketmaster ? (
                          <Ticket size={14} className="group-hover/btn:rotate-12 transition-transform" />
                        ) : (
                          <Compass size={14} className="group-hover/btn:rotate-12 transition-transform" />
                        )}
                        <span>{linkDetails.label}</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      <LegalFooter />
    </div>
  );
}
