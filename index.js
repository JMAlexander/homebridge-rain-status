const axios = require('axios');

class RainSwitchPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.switches = [];

    if (!config) {
      log.warn('No configuration found for RainSwitch');
      return;
    }

    this.name = config.name || 'Rain Switch';
    this.stationId = config.station_id || 'PHL';
    this.rainThreshold = config.rain_threshold || 0.1;
    this.checkInterval = (config.check_interval || 60) * 60 * 1000; // Convert to milliseconds

    if (api) {
      this.api.on('didFinishLaunching', () => {
        this.createSwitch();
        this.startPolling();
      });
    }
  }

  createSwitch() {
    // Create a new accessory
    const accessory = new this.api.platformAccessory(this.name, this.api.hap.uuid.generate(this.name));
    
    // Create the switch service
    const switchService = new this.api.hap.Service.Switch(this.name);
    
    // Add the On characteristic
    const onCharacteristic = switchService.getCharacteristic(this.api.hap.Characteristic.On);
    
    // Handle manual control
    onCharacteristic.on('set', (value, callback) => {
      this.log(`Switch manually set to ${value ? 'ON' : 'OFF'}`);
      callback();
    });

    // Add the service to the accessory
    accessory.addService(switchService);

    // Register the accessory
    this.api.registerPlatformAccessories('homebridge-rain-switch', 'RainSwitch', [accessory]);
    
    // Store the accessory
    this.switches.push(accessory);
  }

  async checkRainfall() {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate - 24 * 60 * 60 * 1000); // 24 hours ago

      const response = await axios.post('https://data.rcc-acis.org/StnData', {
        sid: this.stationId,
        sdate: startDate.toISOString().split('T')[0],
        edate: endDate.toISOString().split('T')[0],
        elems: [{ name: 'pcpn', interval: 'dly' }],
        meta: ['name']
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      let totalRainfall = 0;
      if (response.data && response.data.data) {
        for (const [date, value] of response.data.data) {
          if (value !== null) {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              totalRainfall += parsedValue;
	      this.log(`Rainfall value for ${date}: ${value}`);
            } else {
              this.log.warn(`Invalid rainfall value for ${date}: ${value}`);
            }
          }
        }
      }

      this.log(`Total rainfall in last 24 hours: ${totalRainfall.toFixed(2)} inches`);
      
      // Update switch state based on rainfall
      const accessory = this.switches[0];
      if (accessory) {
        const switchService = accessory.getService(this.api.hap.Service.Switch);
        if (switchService) {
          const currentState = switchService.getCharacteristic(this.api.hap.Characteristic.On).value;
          const newState = totalRainfall >= this.rainThreshold;
          
          if (currentState !== newState) {
            this.log(`Rainfall threshold ${this.rainThreshold} inches ${newState ? 'exceeded' : 'not exceeded'}`);
            switchService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(newState);
          }
        }
      }

    } catch (error) {
      this.log.error('Error checking rainfall:', error.message);
    }
  }

  startPolling() {
    // Initial check
    this.checkRainfall();
    
    // Set up interval
    setInterval(() => {
      this.checkRainfall();
    }, this.checkInterval);
  }

  configureAccessory(accessory) {
    this.log('Configuring accessory:', accessory.displayName);
    this.switches.push(accessory);
  }

  accessories(callback) {
    callback(this.switches);
  }
}

module.exports = (api) => {
  api.registerPlatform('homebridge-rain-switch', 'RainSwitch', RainSwitchPlatform);
}; 
