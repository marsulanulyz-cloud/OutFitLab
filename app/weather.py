import httpx

URL = "https://api.open-meteo.com/v1/forecast"
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
SNOW_CODES = {71, 73, 75, 77, 85, 86}


async def get_weather(lat: float, lon: float) -> dict | None:
    """Open-Meteo не требует ключа. При любой ошибке возвращает None — генерация не блокируется."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "auto",
        "forecast_days": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(URL, params=params)
            r.raise_for_status()
            d = r.json()
        cur, day = d["current"], d["daily"]
        code = cur["weather_code"]
        prob = (day["precipitation_probability_max"] or [0])[0] or 0
        if code in SNOW_CODES:
            condition = "snow"
        elif code in RAIN_CODES or cur["precipitation"] > 0.1 or prob >= 50:
            condition = "rain"
        else:
            condition = "dry"
        return {
            "temp_c": round(cur["temperature_2m"]),
            "feels_like_c": round(cur["apparent_temperature"]),
            "t_min": round(day["temperature_2m_min"][0]),
            "t_max": round(day["temperature_2m_max"][0]),
            "rain_prob": prob,
            "wind_kmh": round(cur["wind_speed_10m"]),
            "condition": condition,
        }
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None
