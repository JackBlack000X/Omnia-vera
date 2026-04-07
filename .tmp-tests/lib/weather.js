"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_CITIES = exports.pickPreferredCoordinates = exports.isWeatherCacheUsable = exports.filterWeatherDaysFromToday = exports.weatherCodeToIcon = exports.weatherCodeToColor = exports.WEATHER_FALLBACK_SYMBOL = void 0;
exports.getFallbackCity = getFallbackCity;
exports.setFallbackCity = setFallbackCity;
exports.searchCities = searchCities;
exports.clearWeatherCache = clearWeatherCache;
exports.fetchWeather = fetchWeather;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const Location = __importStar(require("expo-location"));
const weatherCache_1 = require("./weatherCache");
const weatherForecast_1 = require("./weatherForecast");
var weatherSymbols_1 = require("./weatherSymbols");
Object.defineProperty(exports, "WEATHER_FALLBACK_SYMBOL", { enumerable: true, get: function () { return weatherSymbols_1.WEATHER_FALLBACK_SYMBOL; } });
Object.defineProperty(exports, "weatherCodeToColor", { enumerable: true, get: function () { return weatherSymbols_1.weatherCodeToColor; } });
Object.defineProperty(exports, "weatherCodeToIcon", { enumerable: true, get: function () { return weatherSymbols_1.weatherCodeToIcon; } });
var weatherCache_2 = require("./weatherCache");
Object.defineProperty(exports, "filterWeatherDaysFromToday", { enumerable: true, get: function () { return weatherCache_2.filterWeatherDaysFromToday; } });
Object.defineProperty(exports, "isWeatherCacheUsable", { enumerable: true, get: function () { return weatherCache_2.isWeatherCacheUsable; } });
Object.defineProperty(exports, "pickPreferredCoordinates", { enumerable: true, get: function () { return weatherCache_2.pickPreferredCoordinates; } });
const CACHE_KEY = 'weather_cache_v2';
const CITY_KEY = 'weather_fallback_city_v2'; // stores JSON {name, latitude, longitude}
// Known cities for fallback (no GPS)
exports.FALLBACK_CITIES = [
    { name: 'Roma', latitude: 41.9028, longitude: 12.4964 },
    { name: 'Milano', latitude: 45.4642, longitude: 9.19 },
    { name: 'Napoli', latitude: 40.8518, longitude: 14.2681 },
    { name: 'Torino', latitude: 45.0703, longitude: 7.6869 },
    { name: 'Firenze', latitude: 43.7696, longitude: 11.2558 },
    { name: 'Bologna', latitude: 44.4949, longitude: 11.3426 },
    { name: 'Genova', latitude: 44.4056, longitude: 8.9463 },
    { name: 'Venezia', latitude: 45.4408, longitude: 12.3155 },
    { name: 'Palermo', latitude: 38.1157, longitude: 13.3615 },
    { name: 'Zurigo', latitude: 47.3769, longitude: 8.5417 },
    { name: 'Londra', latitude: 51.5074, longitude: -0.1278 },
    { name: 'Parigi', latitude: 48.8566, longitude: 2.3522 },
    { name: 'Berlino', latitude: 52.52, longitude: 13.405 },
    { name: 'New York', latitude: 40.7128, longitude: -74.006 },
];
async function getFallbackCity() {
    try {
        const raw = await async_storage_1.default.getItem(CITY_KEY);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function setFallbackCity(city) {
    if (!city) {
        await async_storage_1.default.removeItem(CITY_KEY);
    }
    else {
        await async_storage_1.default.setItem(CITY_KEY, JSON.stringify(city));
    }
}
async function searchCities(query) {
    if (!query || query.trim().length < 2)
        return [];
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=it`;
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const data = await res.json();
        if (!data.results)
            return [];
        return data.results.map((r) => ({
            name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            latitude: r.latitude,
            longitude: r.longitude,
        }));
    }
    catch {
        return [];
    }
}
async function clearWeatherCache() {
    await async_storage_1.default.removeItem(CACHE_KEY);
}
async function getCoordinates() {
    const savedCity = await getFallbackCity();
    const fallbackCoordinates = savedCity
        ? { latitude: savedCity.latitude, longitude: savedCity.longitude }
        : null;
    // Prefer GPS for the local forecast, then fall back to the saved city.
    try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            const res = await Location.requestForegroundPermissionsAsync();
            status = res.status;
        }
        if (status === 'granted') {
            const loc = await Location.getLastKnownPositionAsync();
            if (loc) {
                return (0, weatherCache_1.pickPreferredCoordinates)({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }, fallbackCoordinates);
            }
            const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
            return (0, weatherCache_1.pickPreferredCoordinates)({ latitude: fresh.coords.latitude, longitude: fresh.coords.longitude }, fallbackCoordinates);
        }
    }
    catch { }
    return fallbackCoordinates;
}
async function getCachedWeather() {
    try {
        const raw = await async_storage_1.default.getItem(CACHE_KEY);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function setCachedWeather(cache) {
    await async_storage_1.default.setItem(CACHE_KEY, JSON.stringify(cache));
}
async function fetchWeather(coordsOverride) {
    const cached = await getCachedWeather();
    const today = new Date().toISOString().split('T')[0];
    const coords = coordsOverride ?? (await getCoordinates());
    const cachedValidDays = cached ? (0, weatherCache_1.filterWeatherDaysFromToday)(cached.days, today) : [];
    if (coords && (0, weatherCache_1.isWeatherCacheUsable)(cached, coords)) {
        if (cachedValidDays.length > 0)
            return cachedValidDays;
    }
    if (!coords) {
        return cachedValidDays.length > 0 ? cachedValidDays : null;
    }
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&hourly=weather_code&timezone=Europe%2FZurich&forecast_days=7`;
        const res = await fetch(url);
        if (!res.ok)
            return cachedValidDays.length > 0 ? cachedValidDays : null;
        const data = await res.json();
        const days = (0, weatherForecast_1.deriveDailyWeatherFromHourly)(data.hourly?.time ?? [], data.hourly?.weather_code ?? []);
        await setCachedWeather({
            latitude: coords.latitude,
            longitude: coords.longitude,
            fetchedAt: Date.now(),
            days,
        });
        return (0, weatherCache_1.filterWeatherDaysFromToday)(days, today);
    }
    catch {
        return cachedValidDays.length > 0 ? cachedValidDays : null;
    }
}
