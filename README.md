# Homebridge Rain Switch

This Homebridge plugin creates a switch that turns on when rainfall exceeds a specified threshold. It uses the ACIS weather data system to pull precipitation at a specified weather station from the previous day.

## Installation

1. Install Homebridge if you haven't already:
```bash
npm install -g homebridge
```

2. Install this plugin:
```bash
npm install -g homebridge-rain-switch
```

3. Add the platform to your Homebridge config.json:
```json
{
  "platforms": [
    {
      "platform": "RainSwitch",
      "name": "Rain Switch",
      "station_id": "PHL",
      "rain_threshold": 0.1,
      "check_interval": 60
    }
  ]
}
```

## Configuration

- `name`: The name of the switch in HomeKit (default: "Rain Switch")
- `station_id`: The ACIS weather station ID (default: "PHL" for Philadelphia)
- `rain_threshold`: Amount of rain in inches that will trigger the switch (default: 0.1)
- `check_interval`: How often to check for rain in minutes (default: 60, minimum: 15)

## Features

- Creates a switch that turns on when rainfall exceeds the threshold
- Automatically updates based on the configured check interval
- Logs rainfall amounts and switch state changes
- Can be manually controlled through HomeKit
- Uses reliable ACIS weather data

## Finding Your Station ID

To find your local weather station ID:
1. Visit the [ACIS Station Metadata](https://data.rcc-acis.org/StnMeta)
2. Search for your location
3. Use the station ID in your configuration

## Troubleshooting

If the switch isn't updating:
1. Check the Homebridge logs for any error messages
2. Verify your station ID is correct
3. Ensure your check interval isn't too frequent (minimum 15 minutes)
4. Check your internet connection

## License

MIT 