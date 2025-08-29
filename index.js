const axios = require('axios');

class RainStatusPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.switches = [];
    this.pollingIntervals = {};
    this.boundCharacteristics = []; // Google Nest pattern: track bound characteristics

    if (!config) {
      log.warn('No configuration found for RainStatus');
      return;
    }

    this.log.info('Initializing RainStatus platform...');
    this.log.debug('Configuration:', JSON.stringify(config, null, 2));

    if (api) {
      this.api.on('didFinishLaunching', () => {
        this.log.info('Homebridge finished launching, initializing switches...');
        this.initializeSwitches();
      });
    }
  }

  initializeSwitches() {
    // Initialize current rain status switch if configured
    if (this.config.current_rain) {
      const currentConfig = this.config.current_rain;
      this.log.debug('Initializing current rain switch with config:', JSON.stringify(currentConfig, null, 2));
      this.createCurrentRainSwitch(
        currentConfig.name || 'Current Rain Status',
        currentConfig.station_id || 'KPHL',
        (currentConfig.check_interval || 5) * 60 * 1000
      );
    } else {
      this.log.warn('No current_rain configuration found, skipping current rain switch');
    }

    // Initialize previous rainfall switch if configured
    if (this.config.previous_rain) {
      const previousConfig = this.config.previous_rain;
      this.log.debug('Initializing previous rainfall switch with config:', JSON.stringify(previousConfig, null, 2));
      this.createPreviousRainSwitch(
        previousConfig.name || 'Previous Rainfall',
        previousConfig.station_id || 'PHL',
        {
          previous_day_threshold: previousConfig.previous_day_threshold || 0.1,
          two_day_threshold: previousConfig.two_day_threshold || 0.25
        },
        (previousConfig.check_interval || 60) * 60 * 1000
      );
    } else {
      this.log.warn('No previous_rain configuration found, skipping previous rainfall switch');
    }
  }

  createCurrentRainSwitch(name, stationId, checkInterval) {
    this.log.info(`Creating current rain status sensor: ${name}`);
    this.log.debug(`Station ID: ${stationId}, Check interval: ${checkInterval / 60000} minutes`);
    
    const accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(name));
    const sensorService = new this.api.hap.Service.OccupancySensor(name);
    
    // Store the current rain state for the sensor
    this.currentRainState = false;
    
    // Bind the characteristic using Google Nest pattern
    this.bindCharacteristic(sensorService, this.api.hap.Characteristic.OccupancyDetected, 'Current Rain Status', 
      () => this.currentRainState, null, (value) => value ? 'Rain Detected' : 'No Rain');

    accessory.addService(sensorService);
    this.api.registerPlatformAccessories('homebridge-rain-status', 'RainStatus', [accessory]);
    this.log.info(`Successfully registered current rain sensor accessory: ${name}`);
    this.switches.push(accessory);

    // Start polling for current rain status
    this.startCurrentRainPolling(accessory, stationId, checkInterval);
  }

  createPreviousRainSwitch(name, stationId, rainThresholds, checkInterval) {
    this.log.info(`Creating previous rainfall sensor: ${name}`);
    this.log.debug(`Station ID: ${stationId}, Previous day threshold: ${rainThresholds.previous_day_threshold} inches, Two-day threshold: ${rainThresholds.two_day_threshold} inches, Check interval: ${checkInterval / 60000} minutes`);
    
    const accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(name));
    const sensorService = new this.api.hap.Service.ContactSensor(name);
    
    // Store the previous rain state for the sensor
    this.previousRainState = false;
    
    // Bind the characteristic using Google Nest pattern
    this.bindCharacteristic(sensorService, this.api.hap.Characteristic.ContactSensorState, 'Previous Rainfall', 
      () => this.previousRainState ? 1 : 0, null, (value) => value === 1 ? 'Rain Threshold Met' : 'Rain Threshold Not Met');

    accessory.addService(sensorService);
    this.api.registerPlatformAccessories('homebridge-rain-status', 'RainStatus', [accessory]);
    this.log.info(`Successfully registered previous rainfall sensor accessory: ${name}`);
    this.switches.push(accessory);

    // Start polling for previous rainfall
    this.startPreviousRainPolling(accessory, stationId, rainThresholds, checkInterval);
  }

  async checkCurrentRain(accessory, stationId, retryCount = 0) {
    this.log.debug(`Starting current rain check for station ${stationId} (attempt ${retryCount + 1})`);
    
    try {
      const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      this.log.debug(`Making API request to: ${obsUrl}`);
      
      const obsResponse = await axios.get(obsUrl, {
        headers: {
          'User-Agent': 'Homebridge-Rain-Status/1.0.0 (https://github.com/jeffalexander/homebridge-rain-status)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      this.log.debug('API response received:', JSON.stringify(obsResponse.data, null, 2));

      if (!obsResponse?.data?.properties) {
        throw new Error('Invalid API response structure');
      }

      const properties = obsResponse.data.properties;
      const weatherDescription = properties.textDescription?.toLowerCase() || '';
      
      if (!weatherDescription) {
        throw new Error('No weather description available');
      }

      this.log.debug(`Weather description: ${weatherDescription}`);

      const weatherTerms = [
        'rain', 'drizzle', 'shower', 'precipitation',
        'mist', 'fog', 'drizzle', 'light rain',
        'ra', 'dz', 'shra', 'fzra', 'br', 'fg'
      ];
      
      const isRaining = weatherTerms.some(term => weatherDescription.includes(term));
      this.log.debug(`Rain detection result: ${isRaining ? 'Rain detected' : 'No rain'}`);
      
      const sensorService = accessory.getService(this.api.hap.Service.OccupancySensor);
      const currentState = sensorService.getCharacteristic(this.api.hap.Characteristic.OccupancyDetected).value;
      
      // Update the stored state
      this.currentRainState = isRaining;
      
      if (currentState !== isRaining) {
        this.log.info(`Weather conditions changed: ${isRaining ? 'Rain detected' : 'No rain'}`);
        this.log.info(`Weather description: ${weatherDescription}`);
      } else {
        this.log.debug(`Weather conditions unchanged: ${isRaining ? 'Still raining' : 'Still no rain'}`);
      }
      
      // TESTING: Force sensor to NOT detected (false) to verify HomeKit updates
      this.log.info('🧪 TESTING: Forcing sensor to NOT detected for HomeKit sync test');
      this.currentRainState = false;

      // Google Nest pattern: Call updateData() to trigger HomeKit getValue() calls
      this.log.info('🔔 Calling updateData() to trigger HomeKit monitoring');
      this.updateData();

      this.log.debug('Current rain check completed successfully');

    } catch (error) {
      if (error.response) {
        this.log.error(`API responded with error status: ${error.response.status}`);
        this.log.debug('Error response:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.status === 429) {
          this.log.warn('Rate limit exceeded, will retry with backoff');
        } else if (error.response.status >= 500) {
          this.log.warn('Server error, will retry with backoff');
        }
      } else if (error.request) {
        this.log.error('No response received from API');
        this.log.debug('Request details:', error.request);
      } else {
        this.log.error(`Request setup error: ${error.message}`);
      }

      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        this.log.warn(`Error checking current rain, retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.checkCurrentRain(accessory, stationId, retryCount + 1);
      }
      this.log.error('Error checking current rain after 3 retries:', error.message);
    }
  }

  async checkPreviousRain(accessory, stationId, rainThresholds) {
    this.log.debug(`Starting previous rainfall check for station ${stationId}`);
    
    try {
      // Calculate dates: we want yesterday and the day before yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const dayBeforeYesterday = new Date(today);
      dayBeforeYesterday.setDate(today.getDate() - 2);

      // Format as YYYY-MM-DD
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];

      // Request data for the past 2 days (day before yesterday to yesterday)
      this.log.debug(`Requesting rainfall data for ${dayBeforeYesterdayStr} and ${yesterdayStr}`);
      const requestBody = {
        sid: stationId,
        sdate: dayBeforeYesterdayStr,
        edate: yesterdayStr,
        elems: [{ name: 'pcpn', interval: 'dly' }],
        meta: ['name']
      };
      
      this.log.debug('Making ACIS API request with body:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post('https://data.rcc-acis.org/StnData', requestBody, {
        headers: { 'Content-Type': 'application/json' }
      });

      this.log.debug('ACIS API response:', JSON.stringify(response.data, null, 2));

      let previousDayRain = 0;
      let twoDayRain = 0;
      if (response.data && response.data.data) {
        for (const [date, value] of response.data.data) {
          if (value !== null) {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              if (date === yesterdayStr) {
                previousDayRain = parsedValue;
                this.log.debug(`Yesterday (${date}) rainfall: ${value} inches`);
              }
              if (date === yesterdayStr || date === dayBeforeYesterdayStr) {
                twoDayRain += parsedValue;
              }
            } else {
              this.log.warn(`Invalid rainfall value for ${date}: ${value}`);
            }
          }
        }
      }

      this.log.info(`Previous day rainfall: ${previousDayRain.toFixed(2)} inches`);
      this.log.info(`Two-day total rainfall: ${twoDayRain.toFixed(2)} inches`);
      
      const sensorService = accessory.getService(this.api.hap.Service.ContactSensor);
      const currentState = sensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState).value;
      const newState = previousDayRain > rainThresholds.previous_day_threshold || twoDayRain > rainThresholds.two_day_threshold;
      
      // Update the stored state
      this.previousRainState = newState;
      
      if (currentState !== newState) {
        this.log.info(`Rain conditions ${newState ? 'met' : 'not met'}: Previous day > ${rainThresholds.previous_day_threshold}" (${previousDayRain.toFixed(2)}") OR Two-day total > ${rainThresholds.two_day_threshold}" (${twoDayRain.toFixed(2)}")`);
      } else {
        this.log.debug(`Rain status unchanged: ${newState ? 'Still meeting conditions' : 'Still not meeting conditions'}`);
      }
      
      // TESTING: Force contact sensor to CONTACT_DETECTED (1) to verify HomeKit updates
      this.log.info('🧪 TESTING: Forcing contact sensor to CONTACT_DETECTED for HomeKit sync test');
      this.previousRainState = true;

      // Google Nest pattern: Call updateData() to trigger HomeKit getValue() calls
      this.log.info('🔔 Calling updateData() to trigger HomeKit monitoring');
      this.updateData();

    } catch (error) {
      this.log.error('Error checking previous rainfall:', error.message);
      if (error.response) {
        this.log.debug('Error response:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  startCurrentRainPolling(accessory, stationId, checkInterval) {
    this.log.info(`Starting current rain polling for station ${stationId}`);
    this.log.debug(`Polling interval: ${checkInterval / 60000} minutes`);
    
    const intervalId = setInterval(() => {
      this.log.debug('Polling interval triggered - checking current rain...');
      this.checkCurrentRain(accessory, stationId).catch(error => {
        this.log.error('Current rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals[accessory.UUID] = intervalId;
    
    // Initial check
    this.log.debug('Performing initial current rain check...');
    this.checkCurrentRain(accessory, stationId).catch(error => {
      this.log.error('Initial current rain check failed:', error.message);
    });
  }

  startPreviousRainPolling(accessory, stationId, rainThresholds, checkInterval) {
    this.log.info(`Starting previous rainfall polling for station ${stationId}`);
    this.log.debug(`Polling interval: ${checkInterval / 60000} minutes, Previous day threshold: ${rainThresholds.previous_day_threshold} inches, Two-day threshold: ${rainThresholds.two_day_threshold} inches`);
    
    const intervalId = setInterval(() => {
      this.log.debug('Polling interval triggered - checking previous rainfall...');
      this.checkPreviousRain(accessory, stationId, rainThresholds).catch(error => {
        this.log.error('Previous rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals[accessory.UUID] = intervalId;
    
    // Initial check
    this.log.debug('Performing initial previous rainfall check...');
    this.checkPreviousRain(accessory, stationId, rainThresholds).catch(error => {
      this.log.error('Initial previous rainfall check failed:', error.message);
    });
  }

  unload() {
    this.log.info('Unloading RainStatus platform...');
    // Clear all polling intervals
    Object.entries(this.pollingIntervals).forEach(([uuid, intervalId]) => {
      this.log.debug(`Clearing polling interval for accessory ${uuid}`);
      clearInterval(intervalId);
    });
    this.pollingIntervals = {};
    this.log.info('Stopped all polling intervals');
  }

  // Google Nest pattern: Bind characteristic with getter and change handler
  bindCharacteristic(service, characteristic, desc, getFunc, setFunc, format) {
    const actual = service.getCharacteristic(characteristic)
      .on('get', function (callback) {
        const val = getFunc.bind(this)();
        if (callback) callback(null, val);
      }.bind(this))
      .on('change', function (change) {
        let disp = change.newValue;
        if (format && disp !== null) {
          disp = format(disp);
        }
        this.log.debug(desc + ' for ' + this.name + ' is: ' + disp);
      }.bind(this));
    if (setFunc) {
      actual.on('set', setFunc.bind(this));
    }
    
    // Google Nest pattern: track bound characteristics for getValue() calls
    this.boundCharacteristics.push([service, characteristic]);
    
    return actual;
  }

  // Google Nest pattern: Update data by calling getValue() on all bound characteristics
  updateData() {
    this.boundCharacteristics.map(function (c) {
      c[0].getCharacteristic(c[1]).getValue();
    });
  }

  configureAccessory(accessory) {
    this.log.info(`Configuring existing accessory: ${accessory.displayName}`);
    this.log.debug(`Accessory UUID: ${accessory.UUID}`);
    
    // Handle existing accessories that might still be switches
    // They will be updated to sensors on the next restart
    this.switches.push(accessory);
  }
}

module.exports = (api) => {
  api.registerPlatform('homebridge-rain-status', 'RainStatus', RainStatusPlatform);
}; 