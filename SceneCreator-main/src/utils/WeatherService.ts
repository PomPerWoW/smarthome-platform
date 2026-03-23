export interface WeatherData {
  temperature: number;
  temperatureUnit: string;
  weatherCode: number;
  weatherDescription: string;
  weatherIcon: string;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
  locationName: string;
}
 
// WMO Weather interpretation codes
// https://open-meteo.com/en/docs
const WMO_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: 'Clear sky', icon: '\u2600' },
  1: { description: 'Mainly clear', icon: '\u26C5' },
  2: { description: 'Partly cloudy', icon: '\u26C5' },
  3: { description: 'Overcast', icon: '\u2601' },
  45: { description: 'Fog', icon: '\uD83C\uDF2B' },
  48: { description: 'Rime fog', icon: '\uD83C\uDF2B' },
  51: { description: 'Light drizzle', icon: '\uD83C\uDF26' },
  53: { description: 'Moderate drizzle', icon: '\uD83C\uDF26' },
  55: { description: 'Dense drizzle', icon: '\uD83C\uDF26' },
  61: { description: 'Slight rain', icon: '\uD83C\uDF27' },
  63: { description: 'Moderate rain', icon: '\uD83C\uDF27' },
  65: { description: 'Heavy rain', icon: '\uD83C\uDF27' },
  71: { description: 'Slight snow', icon: '\uD83C\uDF28' },
  73: { description: 'Moderate snow', icon: '\uD83C\uDF28' },
  75: { description: 'Heavy snow', icon: '\uD83C\uDF28' },
  80: { description: 'Slight showers', icon: '\uD83C\uDF26' },
  81: { description: 'Moderate showers', icon: '\uD83C\uDF27' },
  82: { description: 'Violent showers', icon: '\uD83C\uDF27' },
  95: { description: 'Thunderstorm', icon: '\u26C8' },
  96: { description: 'Thunderstorm w/ hail', icon: '\u26C8' },
  99: { description: 'Thunderstorm w/ hail', icon: '\u26C8' },
};
 
function getWeatherInfo(code: number): { description: string; icon: string } {
  return WMO_CODES[code] || { description: 'Unknown', icon: '?' };
}
 
interface GeoLocation {
  latitude: number;
  longitude: number;
  name: string;
}
 
async function getUserLocation(): Promise<GeoLocation> {
  // Use IP-based geolocation
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          name: data.city || 'Unknown',
        };
      }
    }
  } catch (error) {
    console.error("Failed to get user location:", error);
  }
  // Default fallback
  return { latitude: 13.7563, longitude: 100.5018, name: 'Bangkok' };
}
 
export async function fetchWeatherData(): Promise<WeatherData> {
  const location = await getUserLocation();
 
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
    `&temperature_unit=celsius`;
 
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
 
  const data = await response.json();
  const current = data.current;
  const weatherInfo = getWeatherInfo(current.weather_code);
 
  return {
    temperature: Math.round(current.temperature_2m),
    temperatureUnit: '\u00B0C',
    weatherCode: current.weather_code,
    weatherDescription: weatherInfo.description,
    weatherIcon: weatherInfo.icon,
    windSpeed: current.wind_speed_10m,
    humidity: current.relative_humidity_2m,
    isDay: current.is_day === 1,
    locationName: location.name,
  };
}