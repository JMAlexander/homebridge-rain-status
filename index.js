const axios = require('axios');

class RainStatusPlatform {
  constructor(log, config, api) {
    this.log.info('🔔🔔🔔 RainStatus platform constructor called');
    this.log.info('🔔🔔🔔 Constructor parameters:');
    this.log.info('🔔🔔🔔   - log type:', typeof log);
    this.log.info('🔔🔔🔔   - config type:', typeof config);
    this.log.info('🔔🔔🔔   - api type:', typeof api);
    
    this.log = log;
    this.config = config;
    this.api = api;
    
    this.log.info('🔔🔔🔔 Config received:', JSON.stringify(this.config, null, 2));
    //this.log.info('🔔🔔🔔 API object keys:', Object.keys(this.api));
    
    // Accessory storage
    this.sensors = [];
    
    // Platform-level state management
    this.currentRainState = false;
    this.previousRainState = false;
    
    // Platform-level polling management
    this.pollingIntervals = {};
    this.isPolling = false;
    
    // Google Nest pattern: track bound characteristics for getValue() calls
    this.boundCharacteristics = [];
    
    // API configuration
    this.currentRainUrl = `https://api.weather.gov/points/${this.config.latitude},${this.config.longitude}`;
    this.previousRainUrl = 'https://data.rcc-acis.org/StnData';
    
    this.log.info('🔔🔔🔔 URLs configured:');
    this.log.info('🔔🔔🔔   - Current rain URL:', this.currentRainUrl);
    this.log.info('🔔🔔🔔   - Previous rain URL:', this.previousRainUrl);
    this.log.info('🔔🔔🔔 RainStatus platform constructor completed');
  }

  // Modern Homebridge method: called after all accessories are configured
  didFinishLaunching() {
    this.log.info('🔔🔔🔔 didFinishLaunching method called!');
    this.log.info('🔔🔔🔔 Current state:');
    this.log.info('🔔🔔🔔   - sensors.length:', this.sensors.length);
    this.log.info('🔔🔔🔔   - isPolling:', this.isPolling);
    this.log.info('🔔🔔🔔   - config keys:', Object.keys(this.config));
    
    // Create accessories if they don't exist
    if (this.sensors.length === 0) {
      this.log.info('🔔🔔🔔 No existing accessories found, creating new ones...');
      this.createAccessories();
    } else {
      this.log.info('🔔🔔🔔 Existing accessories found, skipping creation');
    }
    
    // Start platform-level polling after accessories are created
    if (!this.isPolling) {
      this.log.info('🔔🔔🔔 Starting platform-level polling...');
      this.startPlatformPolling();
    } else {
      this.log.info('🔔🔔🔔 Platform-level polling already active');
    }
    
    this.log.info('🔔🔔🔔 didFinishLaunching method completed');
  }

  createAccessories() {
    this.log.info('🔔🔔🔔 createAccessories method called!');
    this.log.info('🔔🔔🔔 Config analysis:');
    this.log.info('🔔🔔🔔   - current_rain exists:', !!this.config.current_rain);
    this.log.info('🔔🔔🔔   - previous_rain exists:', !!this.config.previous_rain);
    this.log.info('🔔🔔🔔   - Full config:', JSON.stringify(this.config, null, 2));
    
    // Create current rain sensor if configured
    if (this.config.current_rain) {
      const currentConfig = this.config.current_rain;
      this.log.info('🔔🔔🔔 Creating current rain sensor with config:', JSON.stringify(currentConfig, null, 2));
      this.createCurrentRainSensor(
        currentConfig.name || 'Current Rain Status',
        currentConfig.station_id || 'KPHL'
      );
    } else {
      this.log.warn('🔔🔔🔔 No current_rain configuration found, skipping current rain sensor');
    }

    // Create previous rainfall sensor if configured
    if (this.config.previous_rain) {
      const previousConfig = this.config.previous_rain;
      this.log.info('🔔🔔🔔 Creating previous rainfall sensor with config:', JSON.stringify(previousConfig, null, 2));
      this.createPreviousRainSensor(
        previousConfig.name || 'Previous Rainfall',
        previousConfig.station_id || 'PHL',
        {
          previous_day_threshold: previousConfig.previous_day_threshold || 0.1,
          two_day_threshold: previousConfig.two_day_threshold || 0.25
        }
      );
    } else {
      this.log.warn('🔔🔔🔔 No previous_rain configuration found, skipping previous rainfall sensor');
    }
    
    this.log.info(`🔔🔔🔔 Finished creating accessories. Total sensors: ${this.sensors.length}`);
    this.log.info('🔔🔔🔔 createAccessories method completed');
  }

  createCurrentRainSensor(name, stationId) {
    this.log.info(`🔔🔔🔔 createCurrentRainSensor called with name: ${name}, stationId: ${stationId}`);
    
    try {
      this.log.info('🔔🔔🔔 Creating platformAccessory...');
      const accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(name));
      this.log.info('🔔🔔🔔 PlatformAccessory created successfully');
      
      this.log.info('🔔🔔🔔 Creating OccupancySensor service...');
      const sensorService = new this.api.hap.Service.OccupancySensor(name);
      this.log.info('🔔🔔🔔 OccupancySensor service created successfully');
      
      this.log.info('🔔🔔🔔 Binding characteristic...');
      // Bind the characteristic using Google Nest pattern
      this.bindCharacteristic(sensorService, this.api.hap.Characteristic.OccupancyDetected, 'Current Rain Status', 
        () => this.currentRainState, null, (value) => value ? 'Rain Detected' : 'No Rain');
      this.log.info('🔔🔔🔔 Characteristic bound successfully');

      // Add updateData method to the accessory
      accessory.updateData = () => {
        this.log.info(`🔔🔔🔔 Accessory ${name}: updateData called, updating OccupancyDetected to ${this.currentRainState}`);
        sensorService.updateCharacteristic(this.api.hap.Characteristic.OccupancyDetected, this.currentRainState);
      };
      this.log.info('🔔🔔🔔 updateData method added to accessory');

      this.log.info('🔔🔔🔔 Adding service to accessory...');
      accessory.addService(sensorService);
      this.log.info('🔔🔔🔔 Service added to accessory successfully');
      
      this.log.info('🔔🔔🔔 Registering platform accessories...');
      this.api.registerPlatformAccessories('homebridge-rain-status', 'RainStatus', [accessory]);
      this.log.info(`🔔🔔🔔 Successfully registered current rain sensor accessory: ${name}`);
      
      this.log.info('🔔🔔🔔 Adding accessory to sensors array...');
      this.sensors.push(accessory);
      this.log.info(`🔔🔔🔔 Accessory added to sensors array. Total sensors: ${this.sensors.length}`);
      
    } catch (error) {
      this.log.error(`🔔🔔🔔 ERROR creating current rain sensor: ${error.message}`);
      this.log.error(`🔔🔔🔔 Error stack: ${error.stack}`);
    }
  }

  createPreviousRainSensor(name, stationId, rainThresholds) {
    this.log.info(`🔔🔔🔔 createPreviousRainSensor called with name: ${name}, stationId: ${stationId}`);
    this.log.info(`🔔🔔🔔 Rain thresholds: Previous day: ${rainThresholds.previous_day_threshold} inches, Two-day: ${rainThresholds.two_day_threshold} inches`);
    
    try {
      this.log.info('🔔🔔🔔 Creating platformAccessory...');
      const accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(name));
      this.log.info('🔔🔔🔔 PlatformAccessory created successfully');
      
      this.log.info('🔔🔔🔔 Creating ContactSensor service...');
      const sensorService = new this.api.hap.Service.ContactSensor(name);
      this.log.info('🔔🔔🔔 ContactSensor service created successfully');
      
      this.log.info('🔔🔔🔔 Binding characteristic...');
      // Bind the characteristic using Google Nest pattern
      this.bindCharacteristic(sensorService, this.api.hap.Characteristic.ContactSensorState, 'Previous Rainfall', 
        () => this.previousRainState, null, (value) => value === 1 ? 'Rain Threshold Met' : 'Rain Threshold Not Met');
      this.log.info('🔔🔔🔔 Characteristic bound successfully');

      // Add updateData method to the accessory
      accessory.updateData = () => {
        this.log.info(`🔔🔔🔔 Accessory ${name}: updateData called, updating ContactSensorState to ${this.previousRainState}`);
        sensorService.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.previousRainState);
      };
      this.log.info('🔔🔔🔔 updateData method added to accessory');

      this.log.info('🔔🔔🔔 Adding service to accessory...');
      accessory.addService(sensorService);
      this.log.info('🔔🔔🔔 Service added to accessory successfully');
      
      this.log.info('🔔🔔🔔 Registering platform accessories...');
      this.api.registerPlatformAccessories('homebridge-rain-status', 'RainStatus', [accessory]);
      this.log.info(`🔔🔔🔔 Successfully registered previous rainfall sensor accessory: ${name}`);
      
      this.log.info('🔔🔔🔔 Adding accessory to sensors array...');
      this.sensors.push(accessory);
      this.log.info(`🔔🔔🔔 Accessory added to sensors array. Total sensors: ${this.sensors.length}`);
      
    } catch (error) {
      this.log.error(`🔔🔔🔔 ERROR creating previous rainfall sensor: ${error.message}`);
      this.log.error(`🔔🔔🔔 Error stack: ${error.stack}`);
    }
  }

  startPlatformPolling() {
    if (this.isPolling) {
      this.log.warn('Platform polling already started');
      return;
    }

    this.isPolling = true;
    this.log.info('Starting platform-level polling...');

    // Start current rain polling
    if (this.config.current_rain && this.config.current_rain.station_id) {
      this.startCurrentRainPolling();
    }

    // Start previous rain polling  
    if (this.config.previous_rain && this.config.previous_rain.station_id) {
      this.startPreviousRainPolling();
    }
  }

  startCurrentRainPolling() {
    const stationId = this.config.current_rain.station_id;
    const checkInterval = (this.config.current_rain.check_interval || 5) * 60 * 1000; // Convert minutes to milliseconds
    
    this.log.info(`Starting platform-level current rain polling for station ${stationId}`);
    this.log.debug(`Polling interval: ${checkInterval / 60000} minutes`);
    
    const intervalId = setInterval(() => {
      this.log.debug('Platform polling interval triggered - checking current rain...');
      this.checkCurrentRain().catch(error => {
        this.log.error('Platform current rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals['current_rain'] = intervalId;
    
    // Initial check
    this.log.debug('Performing initial platform current rain check...');
    this.checkCurrentRain().catch(error => {
      this.log.error('Initial platform current rain check failed:', error.message);
    });
  }

  startPreviousRainPolling() {
    const stationId = this.config.previous_rain.station_id;
    const checkInterval = (this.config.previous_rain.check_interval || 60) * 60 * 1000; // Convert minutes to milliseconds
    
    this.log.info(`Starting platform-level previous rainfall polling for station ${stationId}`);
    this.log.debug(`Polling interval: ${checkInterval / 60000} minutes`);
    
    const intervalId = setInterval(() => {
      this.log.debug('Platform polling interval triggered - checking previous rainfall...');
      this.checkPreviousRain().catch(error => {
        this.log.error('Platform previous rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals['previous_rain'] = intervalId;
    
    // Initial check
    this.log.debug('Performing initial platform previous rainfall check...');
    this.checkPreviousRain().catch(error => {
      this.log.error('Initial platform previous rainfall check failed:', error.message);
    });
  }

  async checkCurrentRain() {
    this.log.info('🔔 Platform: Checking current rain status...');
    
    try {
      // Get station info first
      const stationResponse = await axios.get(this.currentRainUrl);
      const stationUrl = stationResponse.data.properties.forecast;
      
      // Get current weather
      const weatherResponse = await axios.get(stationUrl);
      const data = weatherResponse.data;
      
      this.log.debug('🔔 Current rain API response:', JSON.stringify(data));
      
      // Check if it's currently raining
      const isRaining = data.properties && 
        data.properties.periods && 
        data.properties.periods.length > 0 &&
        data.properties.periods[0].shortForecast &&
        data.properties.periods[0].shortForecast.toLowerCase().includes('rain');
      
      this.log.info('🔔 Platform: Is it currently raining?', isRaining);
      
      // Update platform-level state
      this.currentRainState = isRaining;
      
      // Google Nest pattern: Platform calls updateData() on all accessories
      this.log.info('🔔 Platform: Calling updateData() on all accessories');
      this.updateAllAccessories();
      
    } catch (error) {
      this.log.error('Platform error checking current rain:', error.message);
    }
  }

  async checkPreviousRain() {
    this.log.info('🔔 Platform: Checking previous rain status...');
    
    try {
      const stationId = this.config.previous_rain.station_id;
      
      // Calculate dates for yesterday and day before yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const dayBeforeYesterday = new Date(today);
      dayBeforeYesterday.setDate(today.getDate() - 2);
      
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
      
      this.log.debug('🔔 Platform: Checking rainfall for:', yesterdayStr, 'and', dayBeforeYesterdayStr);
      
      const requestBody = {
        sid: stationId,
        sdate: dayBeforeYesterdayStr,
        edate: yesterdayStr,
        elems: [{ name: 'pcpn', interval: 'dly' }],
        meta: ['name']
      };
      
      const response = await axios.post(this.previousRainUrl, requestBody, {
        headers: { 'Content-Type': 'application/json' }
      });

      this.log.debug('🔔 Platform: Previous rain API response:', JSON.stringify(response.data));
      
      let previousDayRain = 0;
      let twoDayRain = 0;
      if (response.data && response.data.data) {
        for (const [date, value] of response.data.data) {
          if (value !== null) {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              if (date === yesterdayStr) {
                previousDayRain = parsedValue;
                this.log.debug(`🔔 Platform: Yesterday (${date}) rainfall: ${value} inches`);
              }
              if (date === yesterdayStr || date === dayBeforeYesterdayStr) {
                twoDayRain += parsedValue;
              }
            }
          }
        }
      }

      this.log.info(`🔔 Platform: Previous day rainfall: ${previousDayRain.toFixed(2)} inches`);
      this.log.info(`🔔 Platform: Two-day total rainfall: ${twoDayRain.toFixed(2)} inches`);
      
      // Check thresholds
      const previousDayThreshold = this.config.previous_rain.previous_day_threshold;
      const twoDayThreshold = this.config.previous_rain.two_day_threshold;
      
      const previousDayExceeded = previousDayRain >= previousDayThreshold;
      const twoDayExceeded = (previousDayRain + twoDayRain) >= twoDayThreshold;
      
      this.log.info('🔔 Platform: Previous day threshold exceeded?', previousDayExceeded, `(${previousDayRain} >= ${previousDayThreshold})`);
      this.log.info('🔔 Platform: Two-day threshold exceeded?', twoDayExceeded, `(${previousDayRain + twoDayRain} >= ${twoDayThreshold})`);
      
      // Determine contact sensor state (1 = open/contact detected, 0 = closed/no contact)
      const contactState = (previousDayExceeded || twoDayExceeded) ? 1 : 0;
      
      this.log.info('🔔 Platform: Setting ContactSensorState to:', contactState);
      
      // Update platform-level state
      this.previousRainState = contactState;
      
      // Google Nest pattern: Platform calls updateData() on all accessories
      this.log.info('🔔 Platform: Calling updateData() on all accessories');
      this.updateAllAccessories();
      
    } catch (error) {
      this.log.error('Platform error checking previous rainfall:', error.message);
    }
  }

  // Google Nest pattern: Platform calls updateData() on all accessories
  updateAllAccessories() {
    this.log.info('🔔 Platform: Updating all accessories');
    this.sensors.forEach(accessory => {
      this.log.debug(`🔔 Platform: Calling updateData() on accessory: ${accessory.displayName}`);
      accessory.updateData();
    });
  }

  unload() {
    this.log.info('Unloading RainStatus platform...');
    // Clear all polling intervals
    Object.entries(this.pollingIntervals).forEach(([key, intervalId]) => {
      this.log.debug(`Clearing polling interval for key: ${key}`);
      clearInterval(intervalId);
    });
    this.pollingIntervals = {};
    this.isPolling = false;
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
    this.log.info(`🔔🔔🔔 configureAccessory called for: ${accessory.displayName}`);
    this.log.info(`🔔🔔🔔 Accessory details:`);
    this.log.info(`🔔🔔🔔   - UUID: ${accessory.UUID}`);
    this.log.info(`🔔🔔🔔   - Type: ${accessory.context?.type || 'unknown'}`);
    this.log.info(`🔔🔔🔔   - Services: ${accessory.services?.length || 0}`);
    
    // Handle existing accessories that might still be switches
    // They will be updated to sensors on the next restart
    this.log.info('🔔🔔🔔 Adding accessory to sensors array...');
    this.sensors.push(accessory);
    this.log.info(`🔔🔔🔔 Accessory added. Total sensors: ${this.sensors.length}`);
    
    // Add updateData method to existing accessories if they don't have one
    if (!accessory.updateData) {
      this.log.info(`🔔🔔🔔 Adding updateData method to existing accessory: ${accessory.displayName}`);
      accessory.updateData = () => {
        this.log.info(`🔔🔔🔔 Existing accessory ${accessory.displayName}: updateData called but no specific logic implemented`);
      };
    } else {
      this.log.info(`🔔🔔🔔 Accessory ${accessory.displayName} already has updateData method`);
    }
    
    this.log.info(`🔔🔔🔔 configureAccessory completed for: ${accessory.displayName}`);
  }
}

module.exports = (api) => {
  console.log('🔔🔔🔔 homebridge-rain-status module loading...');
  console.log('🔔🔔🔔 API object received:', typeof api);
  console.log('🔔🔔🔔 API keys:', Object.keys(api));
  
  try {
    console.log('🔔🔔🔔 Registering RainStatus platform...');
    api.registerPlatform('homebridge-rain-status', 'RainStatus', RainStatusPlatform);
    console.log('🔔🔔🔔 RainStatus platform registered successfully');
  } catch (error) {
    console.error('🔔🔔🔔 ERROR registering platform:', error.message);
    console.error('🔔🔔🔔 Error stack:', error.stack);
  }
  
  console.log('🔔🔔🔔 homebridge-rain-status module loaded successfully');
};