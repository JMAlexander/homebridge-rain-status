const axios = require('axios');

let Accessory, Service, Characteristic, uuid;

// Base class for Rain Status accessories - matches Google Nest pattern
class RainStatusAccessory {
  constructor(log, name, accessoryType, platform, api) {
    // Store references
    this.log = log;
    this.name = name;
    this.accessoryType = accessoryType; // 'current' or 'previous'
    this.platform = platform;
    this.api = api;
    
    this.log.info(`🔔🔔🔔 Initializing ${accessoryType} rain accessory: ${name}`);
    
    // Generate UUID for this accessory
    const id = this.api.hap.uuid.generate('rain-status.' + accessoryType + '.' + name);
    
    // Call parent Accessory constructor (will be set up in module.exports)
    Accessory.call(this, name, id);
    this.uuid_base = id;
    
    // Set up AccessoryInformation service
    this.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'Rain Status Plugin')
      .setCharacteristic(Characteristic.Model, 'Rain Sensor')
      .setCharacteristic(Characteristic.Name, name)
      .setCharacteristic(Characteristic.SerialNumber, accessoryType + '-' + Date.now());
    
    // Initialize boundCharacteristics array for this accessory instance
    this.boundCharacteristics = [];
    
    this.log.info(`🔔🔔🔔 Base accessory ${name} initialized with UUID: ${id}`);
  }
  
  // Google Nest pattern: getServices method
  getServices() {
    return this.services;
  }
  
  // Google Nest pattern: bindCharacteristic method
  bindCharacteristic(service, characteristic, desc, getFunc, setFunc, format) {
    this.log.debug(`🔔🔔🔔 Binding characteristic ${desc} for ${this.name}`);
    
    const actual = service.getCharacteristic(characteristic)
      .on('get', function (callback) {
        const val = getFunc.bind(this)();
        this.log.debug(`🔔🔔🔔 ${desc} getter called, returning: ${val}`);
        if (callback) callback(null, val);
      }.bind(this))
      .on('change', function (change) {
        let disp = change.newValue;
        if (format && disp !== null) {
          disp = format(disp);
        }
        this.log.debug(`🔔🔔🔔 ${desc} for ${this.name} changed to: ${disp}`);
      }.bind(this));
      
    if (setFunc) {
      actual.on('set', setFunc.bind(this));
    }
    
    // Track bound characteristics for getValue() calls
    this.boundCharacteristics.push([service, characteristic]);
    
    this.log.debug(`🔔🔔🔔 Characteristic ${desc} bound successfully. Total bound: ${this.boundCharacteristics.length}`);
    return actual;
  }
  
  // Google Nest pattern: updateData method
  updateData() {
    this.log.info(`🔔🔔🔔 updateData called for ${this.name}, triggering ${this.boundCharacteristics.length} characteristics`);
    
    this.boundCharacteristics.map(function (c) {
      c[0].getCharacteristic(c[1]).getValue();
    });
  }
}

// Current Rain Accessory - extends base class
class CurrentRainAccessory extends RainStatusAccessory {
  constructor(log, name, platform, api) {
    // Call parent constructor
    super(log, name, 'current', platform, api);
    
    this.log.info(`🔔🔔🔔 Creating CurrentRainAccessory: ${name}`);
    
    // Create OccupancySensor service
    const sensorService = this.addService(Service.OccupancySensor, name);
    
    // Bind the OccupancyDetected characteristic
    this.bindCharacteristic(
      sensorService, 
      Characteristic.OccupancyDetected, 
      'Current Rain Status',
      this.getCurrentRainState.bind(this),
      null,
      (value) => value ? 'Rain Detected' : 'No Rain'
    );
    
    this.log.info(`🔔🔔🔔 CurrentRainAccessory ${name} created with OccupancySensor service`);
    
    // Call updateData once at the end of constructor (Google Nest pattern)
    this.updateData();
  }
  
  // Getter method for current rain state - TEMPORARILY HARDCODED TO TRUE FOR TESTING
  getCurrentRainState() {
    const actualState = this.platform.currentRainState;
    const testState = true; // TEMPORARY: Always return true for testing
    this.log.debug(`🔔🔔🔔 getCurrentRainState called, actual: ${actualState}, returning TEST: ${testState}`);
    return testState;
  }
}

// Previous Rain Accessory - extends base class  
class PreviousRainAccessory extends RainStatusAccessory {
  constructor(log, name, platform, api) {
    // Call parent constructor
    super(log, name, 'previous', platform, api);
    
    this.log.info(`🔔🔔🔔 Creating PreviousRainAccessory: ${name}`);
    
    // Create ContactSensor service
    const sensorService = this.addService(Service.ContactSensor, name);
    
    // Bind the ContactSensorState characteristic
    this.bindCharacteristic(
      sensorService,
      Characteristic.ContactSensorState,
      'Previous Rainfall',
      this.getPreviousRainState.bind(this),
      null,
      (value) => value === 1 ? 'Rain Threshold Met' : 'Rain Threshold Not Met'
    );
    
    this.log.info(`🔔🔔🔔 PreviousRainAccessory ${name} created with ContactSensor service`);
    
    // Call updateData once at the end of constructor (Google Nest pattern)
    this.updateData();
  }
  
  // Getter method for previous rain state - TEMPORARILY HARDCODED TO 1 FOR TESTING
  getPreviousRainState() {
    const actualState = this.platform.previousRainState;
    const testState = 1; // TEMPORARY: Always return 1 (contact detected) for testing
    this.log.debug(`🔔🔔🔔 getPreviousRainState called, actual: ${actualState}, returning TEST: ${testState}`);
    return testState;
  }
}

class RainStatusPlatform {
  constructor(log, config, api) {
    // Safety check for log parameter - provide fallback if undefined
    if (!log) {
      console.log('🔔🔔🔔 WARNING: log parameter is undefined, using console.log as fallback');
      this.log = {
        info: (msg) => console.log(`[INFO] ${msg}`),
        debug: (msg) => console.log(`[DEBUG] ${msg}`),
        warn: (msg) => console.log(`[WARN] ${msg}`),
        error: (msg) => console.log(`[ERROR] ${msg}`)
      };
    } else {
      this.log = log;
    }
    
    this.log.info('🔔🔔🔔 RainStatus platform constructor called');
    this.log.info('🔔🔔🔔 Constructor parameters:');
    this.log.info('🔔🔔🔔   - log type:', typeof log);
    this.log.info('🔔🔔🔔   - config type:', typeof config);
    this.log.info('🔔🔔🔔   - api type:', typeof api);
    
    this.config = config;
    this.api = api;
    
    this.log.info('🔔🔔🔔 Config received:', JSON.stringify(this.config, null, 2));
    
    // Google Nest pattern: Accessory lookup storage
    this.accessoryLookup = {};
    
    // Platform-level state management
    this.currentRainState = false;
    this.previousRainState = false;
    
    // Platform-level polling management
    this.pollingIntervals = {};
    this.isPolling = false;
    
    // API configuration
    // Use station_id from config instead of lat/lng for current rain
    if (this.config.current_rain && this.config.current_rain.station_id) {
      this.currentRainUrl = `https://api.weather.gov/stations/${this.config.current_rain.station_id}/observations/latest`;
    } else {
      this.currentRainUrl = 'https://api.weather.gov/stations/KPHL/observations/latest';
    }
    this.previousRainUrl = 'https://data.rcc-acis.org/StnData';
    
    this.log.info('🔔🔔🔔 URLs configured:');
    this.log.info('🔔🔔🔔   - Current rain URL:', this.currentRainUrl);
    this.log.info('🔔🔔🔔   - Previous rain URL:', this.previousRainUrl);
    
    this.log.info('🔔🔔🔔 RainStatus platform constructor completed');
  }

  // Google Nest pattern: accessories method that returns accessory instances
  accessories(callback) {
    this.log.info('🔔🔔🔔 Platform accessories method called');
    
    const foundAccessories = this.createAccessories();
    
    // Start polling after accessories are created
    this.startPlatformPolling();
    
    this.log.info(`🔔🔔🔔 Returning ${foundAccessories.length} accessories to Homebridge`);
    
    if (callback) {
      callback(foundAccessories);
    }
    
    return foundAccessories;
  }

  createAccessories() {
    this.log.info('🔔🔔🔔 createAccessories method called - Google Nest pattern');
    this.log.info('🔔🔔🔔 Config analysis:');
    this.log.info('🔔🔔🔔   - current_rain exists:', !!this.config.current_rain);
    this.log.info('🔔🔔🔔   - previous_rain exists:', !!this.config.previous_rain);
    
    const foundAccessories = [];
    
    // Create current rain sensor if configured
    if (this.config.current_rain) {
      this.log.info('🔔🔔🔔 Current rain configuration found, creating CurrentRainAccessory...');
      const currentName = this.config.current_rain.name || 'Current Rain Status';
      const currentAccessory = new CurrentRainAccessory(this.log, currentName, this, this.api);
      
      this.accessoryLookup[currentName] = currentAccessory;
      foundAccessories.push(currentAccessory);
      this.log.info(`🔔🔔🔔 CurrentRainAccessory created: ${currentName}`);
    } else {
      this.log.warn('🔔🔔🔔 No current_rain configuration found, skipping current rain sensor');
    }
    
    // Create previous rain sensor if configured
    if (this.config.previous_rain) {
      this.log.info('🔔🔔🔔 Previous rain configuration found, creating PreviousRainAccessory...');
      const previousName = this.config.previous_rain.name || 'Previous Rainfall';
      const previousAccessory = new PreviousRainAccessory(this.log, previousName, this, this.api);
      
      this.accessoryLookup[previousName] = previousAccessory;
      foundAccessories.push(previousAccessory);
      this.log.info(`🔔🔔🔔 PreviousRainAccessory created: ${previousName}`);
    } else {
      this.log.warn('🔔🔔🔔 No previous_rain configuration found, skipping previous rainfall sensor');
    }
    
    this.log.info(`🔔🔔🔔 Created ${foundAccessories.length} accessory instances`);
    this.log.info('🔔🔔🔔 createAccessories method completed');
    
    return foundAccessories;
  }

  // REMOVED: createCurrentRainSensor - now using CurrentRainAccessory class
  // REMOVED: createPreviousRainSensor - now using PreviousRainAccessory class
  
  // Legacy method - no longer used in Google Nest pattern
  createCurrentRainSensor(name, stationId) {
    this.log.info(`🔔🔔🔔 createCurrentRainSensor called with name: ${name}, stationId: ${stationId}`);
    
    try {
      this.log.info('🔔🔔🔔 Creating platformAccessory...');
      const accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(name));
      this.log.info('🔔🔔🔔 PlatformAccessory created successfully');
      
      this.log.info('🔔🔔🔔 Creating OccupancySensor service...');
      const sensorService = new this.api.hap.Service.OccupancySensor(name);
      this.log.info('🔔🔔🔔 OccupancySensor service created successfully');
      
      // Initialize bound characteristics array for this accessory
      accessory.boundCharacteristics = [];
      
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
    this.log.info('🔔 Platform: Updating all accessories - Google Nest pattern');
    Object.values(this.accessoryLookup).forEach(accessory => {
      this.log.debug(`🔔 Platform: Calling updateData() on accessory: ${accessory.name}`);
      accessory.updateData();
    });
  }

  // Manual trigger method for testing - set current rain state
  setCurrentRainState(isRaining) {
    this.log.info(`🔔🔔🔔 MANUAL UPDATE: Setting current rain state to: ${isRaining}`);
    this.currentRainState = isRaining;
    this.updateAllAccessories();
    this.log.info(`🔔🔔🔔 MANUAL UPDATE: Current rain state updated to: ${this.currentRainState}`);
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

  // REMOVED: configureAccessory - Google Nest pattern doesn't use platform accessories
  // They create accessories directly, not platform accessories that need to be configured
}

module.exports = (api) => {
  console.log('🔔🔔🔔 homebridge-rain-status module loading...');
  console.log('🔔🔔🔔 API object received:', typeof api);
  
  // Set up global references (Google Nest pattern)
  Accessory = api.hap.Accessory;
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  uuid = api.hap.uuid;
  
  // Set up inheritance for RainStatusAccessory (Google Nest pattern)
  const inherits = require('util').inherits;
  const originalPrototype = RainStatusAccessory.prototype;
  inherits(RainStatusAccessory, Accessory);
  RainStatusAccessory.prototype.parent = Accessory.prototype;
  
  // Restore our custom methods after inherits() call
  for (const methodName in originalPrototype) {
    RainStatusAccessory.prototype[methodName] = originalPrototype[methodName];
  }
  
  console.log('🔔🔔🔔 Inheritance set up for RainStatusAccessory');
  
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