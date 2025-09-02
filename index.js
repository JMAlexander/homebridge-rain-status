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
    
    this.log.info(`Initializing ${accessoryType} rain accessory: ${name}`);
    
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
  }
  
  // Google Nest pattern: getServices method
  getServices() {
    return this.services;
  }
  
  // Google Nest pattern: bindCharacteristic method
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
        this.log.debug(`${desc} for ${this.name} changed to: ${disp}`);
      }.bind(this));
      
    if (setFunc) {
      actual.on('set', setFunc.bind(this));
    }
    
    // Track bound characteristics for getValue() calls
    this.boundCharacteristics.push([service, characteristic]);
    
    return actual;
  }
  
  // Google Nest pattern: updateData method
  updateData() {
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
    
    // Create ContactSensor service
    const sensorService = this.addService(Service.ContactSensor, name);
    
    // Bind the ContactSensorState characteristic
    this.bindCharacteristic(
      sensorService, 
      Characteristic.ContactSensorState, 
      'Current Rain Status',
      this.getCurrentRainState.bind(this),
      null,
      (value) => value === 1 ? 'Rain Detected' : 'No Rain'
    );
    
    this.log.info(`Current rain sensor created: ${name}`);
    
    // Call updateData once at the end of constructor (Google Nest pattern)
    this.updateData();
  }
  
  // Getter method for current rain state
  getCurrentRainState() {
    const state = this.platform.currentRainState ? 1 : 0; // Convert boolean to ContactSensorState (1=contact, 0=no contact)
    return state;
  }
}

// Previous Rain Accessory - extends base class  
class PreviousRainAccessory extends RainStatusAccessory {
  constructor(log, name, platform, api) {
    // Call parent constructor
    super(log, name, 'previous', platform, api);
    
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
    
    this.log.info(`Previous rainfall sensor created: ${name}`);
    
    // Call updateData once at the end of constructor (Google Nest pattern)
    this.updateData();
  }
  
  // Getter method for previous rain state
  getPreviousRainState() {
    const state = this.platform.previousRainState;
    return state;
  }
}

class RainStatusPlatform {
  constructor(log, config, api) {
    // Safety check for log parameter - provide fallback if undefined
    if (!log) {
      console.log('WARNING: log parameter is undefined, using console.log as fallback');
      this.log = {
        info: (msg) => console.log(`[INFO] ${msg}`),
        debug: (msg) => console.log(`[DEBUG] ${msg}`),
        warn: (msg) => console.log(`[WARN] ${msg}`),
        error: (msg) => console.log(`[ERROR] ${msg}`)
      };
    } else {
      this.log = log;
    }
    
    this.config = config;
    this.api = api;
    
    // Google Nest pattern: Accessory lookup storage
    this.accessoryLookup = {};
    
    // Platform-level state management
    this.currentRainState = false;
    this.previousRainState = false;
    
    // Platform-level polling management
    this.pollingIntervals = {};
    this.isPolling = false;
    
    // API configuration
    if (this.config.current_rain && this.config.current_rain.station_id) {
      this.currentRainUrl = `https://api.weather.gov/stations/${this.config.current_rain.station_id}/observations/latest`;
    } else {
      this.currentRainUrl = 'https://api.weather.gov/stations/KPHL/observations/latest';
    }
    this.previousRainUrl = 'https://data.rcc-acis.org/StnData';
    
    this.log.info('RainStatus platform initialized');
  }

  // Google Nest pattern: accessories method that returns accessory instances
  accessories(callback) {
    const foundAccessories = this.createAccessories();
    
    // Start polling after accessories are created
    this.startPlatformPolling();
    
    this.log.info(`Returning ${foundAccessories.length} accessories to Homebridge`);
    
    if (callback) {
      callback(foundAccessories);
    }
    
    return foundAccessories;
  }

  createAccessories() {
    const foundAccessories = [];
    
    // Create current rain sensor if configured
    if (this.config.current_rain) {
      const currentName = this.config.current_rain.name || 'Current Rain Status';
      const currentAccessory = new CurrentRainAccessory(this.log, currentName, this, this.api);
      
      this.accessoryLookup[currentName] = currentAccessory;
      foundAccessories.push(currentAccessory);
    } else {
      this.log.warn('No current_rain configuration found, skipping current rain sensor');
    }
    
    // Create previous rain sensor if configured
    if (this.config.previous_rain) {
      const previousName = this.config.previous_rain.name || 'Previous Rainfall';
      const previousAccessory = new PreviousRainAccessory(this.log, previousName, this, this.api);
      
      this.accessoryLookup[previousName] = previousAccessory;
      foundAccessories.push(previousAccessory);
    } else {
      this.log.warn('No previous_rain configuration found, skipping previous rainfall sensor');
    }
    
    this.log.info(`Created ${foundAccessories.length} accessory instances`);
    
    return foundAccessories;
  }



  startPlatformPolling() {
    if (this.isPolling) {
      this.log.warn('Platform polling already started');
      return;
    }

    this.isPolling = true;
    this.log.info('Starting weather data polling...');

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
    
    this.log.info(`Starting current rain polling for station ${stationId} (${checkInterval / 60000} min intervals)`);
    
    const intervalId = setInterval(() => {
      this.checkCurrentRain().catch(error => {
        this.log.error('Current rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals['current_rain'] = intervalId;
    
    // Initial check
    this.checkCurrentRain().catch(error => {
      this.log.error('Initial current rain check failed:', error.message);
    });
  }

  startPreviousRainPolling() {
    const stationId = this.config.previous_rain.station_id;
    const checkInterval = (this.config.previous_rain.check_interval || 60) * 60 * 1000; // Convert minutes to milliseconds
    
    this.log.info(`Starting previous rain polling for station ${stationId} (${checkInterval / 60000} min intervals)`);
    
    const intervalId = setInterval(() => {
      this.checkPreviousRain().catch(error => {
        this.log.error('Previous rain check failed:', error.message);
      });
    }, checkInterval);

    this.pollingIntervals['previous_rain'] = intervalId;
    
    // Initial check
    this.checkPreviousRain().catch(error => {
      this.log.error('Initial previous rain check failed:', error.message);
    });
  }

  // Google Nest pattern: Platform calls updateData() on all accessories
  updateAllAccessories() {
    Object.values(this.accessoryLookup).forEach(accessory => {
      accessory.updateData();
    });
  }

  async checkCurrentRain() {
    const stationId = this.config.current_rain?.station_id || 'KPHL';
    
    try {
      const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      
      const obsResponse = await axios.get(obsUrl, {
        headers: {
          'User-Agent': 'Homebridge-Rain-Status/1.0.0 (https://github.com/jeffalexander/homebridge-rain-status)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!obsResponse?.data?.properties) {
        throw new Error('Invalid API response structure');
      }

      const properties = obsResponse.data.properties;
      const weatherDescription = properties.textDescription?.toLowerCase() || '';
      
      if (!weatherDescription) {
        throw new Error('No weather description available');
      }

      const weatherTerms = [
        'rain', 'drizzle', 'shower', 'precipitation',
        'mist', 'fog', 'drizzle', 'light rain',
        'ra', 'dz', 'shra', 'fzra', 'br', 'fg'
      ];
      
      const isRaining = weatherTerms.some(term => weatherDescription.includes(term));
      
      // Update platform state
      const previousState = this.currentRainState;
      this.currentRainState = isRaining;
      
      if (previousState !== isRaining) {
        this.log.info(`🔔 Current weather: ${isRaining ? 'Rain detected' : 'No rain'} - ${weatherDescription}`);
        this.updateAllAccessories();
      }

    } catch (error) {
      this.log.error('Error checking current rain:', error.message);
    }
  }

  async checkPreviousRain() {
    const stationId = this.config.previous_rain?.station_id || 'PHL';
    const rainThresholds = {
      previous_day_threshold: this.config.previous_rain?.previous_day_threshold || 0.1,
      two_day_threshold: this.config.previous_rain?.two_day_threshold || 0.25
    };
    
    try {
      // Calculate dates in local timezone
      const now = new Date();
      
      // Get local date components to avoid UTC conversion issues
      const yesterdayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const dayBeforeYesterdayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
      const threeDaysAgoLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);

      // Format as YYYY-MM-DD using local date components
      const formatLocalDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const yesterdayStr = formatLocalDate(yesterdayLocal);
      const dayBeforeYesterdayStr = formatLocalDate(dayBeforeYesterdayLocal);
      const threeDaysAgoStr = formatLocalDate(threeDaysAgoLocal);

      // Request data for the past 3 days (excluding today)
      const requestBody = {
        sid: stationId,
        sdate: threeDaysAgoStr,
        edate: yesterdayStr,
        elems: [{ name: 'pcpn', interval: 'dly' }],
        meta: ['name']
      };

      const response = await axios.post('https://data.rcc-acis.org/StnData', requestBody, {
        headers: { 'Content-Type': 'application/json' }
      });

      let previousDayRain = 0;
      let twoDayRain = 0;
      let threeDayRain = 0;
      
      if (response.data && response.data.data) {
        for (const [date, value] of response.data.data) {
          if (value !== null) {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              if (date === yesterdayStr) {
                previousDayRain = parsedValue;
              }
              if (date === yesterdayStr || date === dayBeforeYesterdayStr) {
                twoDayRain += parsedValue;
              }
              if (date === yesterdayStr || date === dayBeforeYesterdayStr || date === threeDaysAgoStr) {
                threeDayRain += parsedValue;
              }
            }
          }
        }
      }

      // Check thresholds
      const previousState = this.previousRainState;
      const newState = (previousDayRain >= rainThresholds.previous_day_threshold) || 
                       (twoDayRain >= rainThresholds.two_day_threshold) ? 1 : 0;
      
      this.previousRainState = newState;
      
      if (previousState !== newState) {
        this.log.info(`🔔 Rainfall totals: Previous day: ${previousDayRain.toFixed(2)}", Two-day: ${twoDayRain.toFixed(2)}", Three-day: ${threeDayRain.toFixed(2)}"`);
        this.log.info(`🔔 Rain conditions ${newState ? 'met' : 'not met'}: Thresholds (${rainThresholds.previous_day_threshold}" / ${rainThresholds.two_day_threshold}")`);
        this.updateAllAccessories();
      }

    } catch (error) {
      this.log.error('Error checking previous rainfall:', error.message);
    }
  }

  // Manual trigger method for testing - set current rain state
  setCurrentRainState(isRaining) {
    this.log.info(`Manual update: Setting current rain state to: ${isRaining}`);
    this.currentRainState = isRaining;
    this.updateAllAccessories();
  }

  unload() {
    this.log.info('Unloading RainStatus platform...');
    // Clear all polling intervals
    Object.entries(this.pollingIntervals).forEach(([key, intervalId]) => {
      clearInterval(intervalId);
    });
    this.pollingIntervals = {};
    this.isPolling = false;
    this.log.info('Stopped all polling intervals');
  }


}

module.exports = (api) => {
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
  
  try {
    api.registerPlatform('homebridge-rain-status', 'RainStatus', RainStatusPlatform);
  } catch (error) {
    console.error('ERROR registering platform:', error.message);
  }
};