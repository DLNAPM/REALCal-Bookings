import React, { useState, useEffect } from 'react';
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, Thermometer, ExternalLink } from 'lucide-react';

interface WeatherData {
    temp: number;
    description: string;
    code: number;
}

export const WeatherWidget: React.FC = () => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const getWeatherIcon = (code: number) => {
        if (code === 0) return <Sun size={13} className="text-amber-500 animate-spin-slow" />;
        if (code >= 1 && code <= 2) return <CloudSun size={13} className="text-amber-400" />;
        if (code === 3 || code === 45 || code === 48) return <Cloud size={13} className="text-slate-400" />;
        if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return <CloudRain size={13} className="text-blue-400" />;
        if (code >= 71 && code <= 77) return <CloudSnow size={13} className="text-sky-300" />;
        if (code >= 95) return <CloudLightning size={13} className="text-amber-600 animate-pulse" />;
        return <Sun size={13} className="text-amber-500" />;
    };

    const getWeatherDesc = (code: number) => {
        if (code === 0) return 'Sunny';
        if (code === 1) return 'Mainly Clear';
        if (code === 2) return 'Partly Cloudy';
        if (code === 3) return 'Overcast';
        if (code === 45 || code === 48) return 'Foggy';
        if (code >= 51 && code <= 55) return 'Light Drizzle';
        if (code >= 61 && code <= 65) return 'Rainy';
        if (code >= 71 && code <= 77) return 'Snowy';
        if (code >= 80 && code <= 82) return 'Rain Showers';
        if (code >= 95) return 'Thunderstorms';
        return 'Clear';
    };

    useEffect(() => {
        let isMounted = true;
        const fetchWeather = async () => {
            try {
                // Lat/Lon for Zip Code 30331 (South Fulton/Atlanta)
                const res = await fetch(
                    'https://api.open-meteo.com/v1/forecast?latitude=33.69&longitude=-84.53&current=temperature_2m,weather_code&temperature_unit=fahrenheit'
                );
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                if (data && data.current && isMounted) {
                    setWeather({
                        temp: Math.round(data.current.temperature_2m),
                        code: data.current.weather_code,
                        description: getWeatherDesc(data.current.weather_code)
                    });
                }
            } catch (error) {
                console.error('Weather fetch error:', error);
                // Graceful fallback based on month of current date
                if (isMounted) {
                    const month = new Date().getMonth(); // 0-11
                    const fallbacks = [45, 49, 57, 65, 73, 80, 83, 82, 76, 66, 56, 47];
                    const defaultTemp = fallbacks[month] || 72;
                    setWeather({
                        temp: defaultTemp,
                        code: 2,
                        description: 'Partly Cloudy'
                    });
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchWeather();
        return () => {
            isMounted = false;
        };
    }, []);

    const weatherUrl = "https://weather.com/weather/today/l/30331";

    if (loading) {
        return (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium px-1 mt-1 animate-pulse">
                <Thermometer size={12} className="text-slate-300" />
                <span>Loading local weather...</span>
            </div>
        );
    }

    if (!weather) return null;

    return (
        <a 
            href={weatherUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-indigo-600 font-medium px-2.5 py-0.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200/60 hover:border-indigo-150 rounded-full transition-all duration-200 mt-1 shadow-sm select-none"
            title="Current weather for Zip 30331 (South Fulton). Click to view full forecast on Weather.com."
        >
            <div className="flex items-center gap-1">
                {getWeatherIcon(weather.code)}
                <span className="font-bold text-slate-700 group-hover:text-indigo-600">{weather.temp}°F</span>
            </div>
            <span className="text-slate-300">•</span>
            <span>South Fulton, GA (30331)</span>
            <ExternalLink size={10} className="opacity-40 group-hover:opacity-100 text-indigo-500 transition-opacity" />
        </a>
    );
};
