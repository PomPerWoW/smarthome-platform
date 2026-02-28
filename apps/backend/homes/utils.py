import requests
import logging
from datetime import datetime, time

logger = logging.getLogger(__name__)

def get_coords():
    """
    Fetch latitude and longitude using ip-api.com.
    Returns a tuple (lat, lon) or (None, None) if failed.
    """
    try:
        response = requests.get('http://ip-api.com/json/', timeout=10)
        data = response.json()
        
        if data['status'] == 'success':
            return data['lat'], data['lon']
        else:
            logger.error(f"Failed to get coordinates: {data.get('message')}")
            return None, None
            
    except Exception as e:
        logger.error(f"Error fetching coordinates: {e}")
        return None, None

def get_solar_times(lat, lon):
    """
    Fetch sunrise and sunset times for a given location and date.
    Returns a dictionary with 'sunrise' and 'sunset' times (datetime.time objects),
    or None if failed.
    """
    if lat is None or lon is None:
        return None

    try:
        url = f"https://api.sunrise-sunset.org/json?lat={lat}&lng={lon}&formatted=0"
        response = requests.get(url, timeout=10)
        data = response.json()

        if data['status'] == 'OK':
            results = data['results']
            sunrise_str = results['sunrise']
            sunset_str = results['sunset']
            
            sunrise_dt = datetime.fromisoformat(sunrise_str)
            sunset_dt = datetime.fromisoformat(sunset_str)

            return {
                'sunrise': sunrise_dt,
                'sunset': sunset_dt
            }
        else:
            logger.error(f"Failed to get solar times: {data.get('status')}")
            return None

    except Exception as e:
        logger.error(f"Error fetching solar times: {e}")
        return None
