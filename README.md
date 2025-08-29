# Homebridge Rain Status

This Homebridge plugin combines two rain-related functionalities into a single plugin:
1. Current rain status monitoring using the National Weather Service (NWS) API
2. Previous rainfall monitoring using the ACIS weather data system

## Features

### Current Rain Status
- Creates a read-only switch that turns on when it's currently raining
- Uses real-time weather data from the National Weather Service
- Detects various types of precipitation (rain, drizzle, showers, etc.)
- Configurable check interval (minimum 1 minute)

### Previous Rainfall
- Creates a read-only switch that turns on when rainfall exceeds a specified threshold
- Uses ACIS weather data to check the previous 48 hours of rainfall
- Configurable rain threshold and check interval
- State is automatically updated based on rainfall data

## Installation

1. Install Homebridge if you haven't already:
```bash
npm install -g homebridge
```

2. Install this plugin:
```bash
npm install -g homebridge-rain-status
```

3. Add the platform to your Homebridge config.json:
```json
{
  "platforms": [
    {
      "platform": "RainStatus",
      "current_rain": {
        "name": "Current Rain Status",
        "station_id": "KPHL",
        "check_interval": 5
      },
      "previous_rain": {
        "name": "Previous Rainfall",
        "station_id": "PHL",
        "previous_day_threshold": 0.1,
        "two_day_threshold": 0.25,
        "check_interval": 60
      }
    }
  ]
}
```

## Configuration

### Current Rain Status
- `name`: The name of the switch in HomeKit (default: "Current Rain Status")
- `station_id`: The NWS weather station ID (default: "KPHL" for Philadelphia)
- `check_interval`: How often to check for current rain in minutes (default: 5, minimum: 1)

### Previous Rainfall
- `name`: The name of the switch in HomeKit (default: "Previous Rainfall")
- `station_id`: The ACIS weather station ID (default: "PHL" for Philadelphia)
- `previous_day_threshold`: Amount of rain in the previous day that will trigger the switch (default: 0.1)
- `two_day_threshold`: Amount of rain in the previous two days combined that will trigger the switch (default: 0.25)
- `check_interval`: How often to check for rain in minutes (default: 60, minimum: 15)

## Finding Your Station IDs

### NWS Station ID (for current rain)
1. Visit https://www.weather.gov/
2. Enter your location
3. Look for the "Observations" section
4. Find the nearest station ID

Common NWS station IDs:
- KPHL: Philadelphia International Airport
- KNYC: New York City
- KLAX: Los Angeles International Airport
- KORD: Chicago O'Hare International Airport

### ACIS Station ID (for previous rainfall)
1. Visit the [ACIS Station Metadata](https://data.rcc-acis.org/StnMeta)
2. Search for your location
3. Use the station ID in your configuration

## Troubleshooting

If the switches aren't updating:
1. Check the Homebridge logs for any error messages
2. Verify your station IDs are correct
3. Ensure your check intervals aren't too frequent
4. Check your internet connection

## License

MIT 