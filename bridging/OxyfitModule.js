import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid, Alert } from 'react-native';

const { OxyfitModule } = NativeModules;
const eventEmitter = new NativeEventEmitter(OxyfitModule);

// Request Bluetooth permissions for Android
const requestBluetoothPermissions = async () => {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        if (
          granted['android.permission.BLUETOOTH_SCAN'] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted['android.permission.ACCESS_FINE_LOCATION'] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert(
            'Permissions Required',
            'Bluetooth permissions are needed to connect to oxygen monitoring devices'
          );
          return false;
        }
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permissions Required',
            'Location permission is needed to scan for oxygen monitoring devices'
          );
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    console.warn('Permission check error:', err);
    return false;
  }
};

class OxyfitService {
  constructor() {
    this.eventEmitter = eventEmitter;
    this.subscriptions = [];
    this.isInitialized = false;
    this.currentDeviceModel = null;
    this.connectionPromise = null;
    this.connectionTimeout = null;
    this.isAutoModeEnabled = false;
    this.deviceConnected = false;
    this.currentDeviceAddress = null;
    this.currentDeviceName = null;
    this.pollingInterval = null;
    
    // State management
    this.state = {
      isConnected: false,
      isScanning: false,
      isLoading: false,
      deviceInfo: null,
      realTimeData: null,
      waveformData: [],
      oxygenReadings: [],
      batteryLevel: 0,
      spo2: 0,
      pulseRate: 0,
      perfusionIndex: 0,
      deviceState: 0
    };
  }

  // Initialize Bluetooth service with permission check
  initBleService = async () => {
    // Prevent multiple initializations
    if (this.isInitialized) {
      console.log('BLE service already initialized, skipping...');
      return "BLE service already initialized";
    }
    
    try {
      console.log('Initializing BLE service...');
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions denied');
      }
      
      const result = await OxyfitModule.initBleService();
      this.isInitialized = true;
      console.log('BLE service initialized successfully');
      return result;
    } catch (error) {
      console.error('Failed to initialize BLE service:', error);
      throw error;
    }
  };

  // Start scanning for devices
  startScan = async () => {
    if (!this.isInitialized) {
      throw new Error('BLE service not initialized');
    }
    console.log('Starting device scan...');
    this.setState({ isScanning: true });
    return OxyfitModule.startScan();
  };

  // Stop scanning for devices
  stopScan = () => {
    console.log('Stopping device scan...');
    this.setState({ isScanning: false });
    return OxyfitModule.stopScan();
  };

  // Connect to device with model detection
  connectToDevice = async (deviceAddress, deviceName = '') => {
    if (!this.isInitialized) {
      throw new Error('BLE service not initialized');
    }
    
    // Clear any existing connection attempts
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Stop any existing polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Detect device model based on name
    const deviceModel = this.detectDeviceModel(deviceName);
    this.currentDeviceModel = deviceModel;
    this.currentDeviceAddress = deviceAddress;
    this.currentDeviceName = deviceName;
    
    console.log(`Connecting to device: ${deviceName} (${deviceAddress}) with model: ${deviceModel}`);
    this.setState({ isLoading: true });

    return new Promise((resolve, reject) => {
      let connectionResolved = false;
      
      // Set connection timeout (30 seconds)
      this.connectionTimeout = setTimeout(() => {
        if (!connectionResolved) {
          connectionResolved = true;
          this.setState({ isLoading: false });
          reject(new Error('Connection timeout - device not responding'));
        }
      }, 30000);
      
      // Listen for device ready event - PRIMARY SUCCESS EVENT
      const deviceReadyListener = this.onBleDeviceReady((payload) => {
        console.log('BLE Device ready event received:', payload);
        if (payload.connected && !connectionResolved) {
          connectionResolved = true;
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          
          // Remove all listeners
          connectionListener?.remove();
          deviceReadyListener.remove();
          settingsListener?.remove();
          
          this.deviceConnected = true;
          this.setState({ 
            isConnected: true, 
            isLoading: false 
          });
          
          console.log('Device ready and connected successfully');
          resolve(payload);
        }
      });

      // Listen for settings updated event - ALTERNATIVE SUCCESS EVENT
      const settingsListener = this.onSettingsUpdated((payload) => {
        console.log('Settings updated event received:', payload);
        if (payload.connected && !connectionResolved) {
          connectionResolved = true;
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          
          // Remove all listeners
          connectionListener?.remove();
          deviceReadyListener.remove();
          settingsListener.remove();
          
          this.deviceConnected = true;
          this.setState({ 
            isConnected: true, 
            isLoading: false 
          });
          
          console.log('Device connected via settings update');
          resolve(payload);
        }
      });

      // Listen for connection state changes - FALLBACK
      const connectionListener = this.onBleStateChanged((payload) => {
        console.log('BLE State Changed during connection:', payload);
        
        if (payload.connected && !connectionResolved) {
          connectionResolved = true;
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          
          // Remove all listeners
          connectionListener.remove();
          deviceReadyListener.remove();
          settingsListener?.remove();
          
          this.deviceConnected = true;
          this.setState({ 
            isConnected: true, 
            isLoading: false 
          });
          
          console.log('Device connected via state change');
          resolve(payload);
        } else if (payload.state === 0 && !connectionResolved) { // Disconnected
          connectionResolved = true;
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          
          // Remove all listeners
          connectionListener.remove();
          deviceReadyListener.remove();
          settingsListener?.remove();
          
          this.setState({ isLoading: false });
          reject(new Error('Connection failed - device disconnected'));
        }
      });

      // Initiate connection
      OxyfitModule.connectToDevice(deviceAddress, deviceModel)
        .then(result => {
          console.log('Connection request sent successfully:', result);
        })
        .catch(error => {
          if (!connectionResolved) {
            connectionResolved = true;
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
            
            // Remove all listeners
            connectionListener?.remove();
            deviceReadyListener.remove();
            settingsListener?.remove();
            
            this.setState({ isLoading: false });
            console.error('Connection request failed:', error);
            reject(error);
          }
        });
    });
  };

  // Device model detection for OxyFit and related devices
  detectDeviceModel = (deviceName) => {
    const name = deviceName?.toLowerCase() || '';
    console.log('Detecting model for device:', deviceName);
    
    // OxyFit series
    if (name.includes('oxyfit')) {
      if (name.includes('wps')) return 1; // Bluetooth.MODEL_OXYFIT_WPS
      return 13; // Bluetooth.MODEL_OXYFIT
    }
    
    // O2 series
    if (name.includes('o2ring')) return 2;
    if (name.includes('o2m')) {
      if (name.includes('wps')) return 19;
      return 3;
    }
    
    // Baby series
    if (name.includes('babyo2')) {
      if (name.includes('n')) return 5;
      return 4;
    }
    
    // Check series
    if (name.includes('checko2')) return 6;
    
    // Sleep series
    if (name.includes('sleepo2')) return 7;
    if (name.includes('sleepu')) return 10;
    
    // Other models
    if (name.includes('snoreo2') || name.includes('o2band')) return 8;
    if (name.includes('wearo2')) return 9;
    if (name.includes('oxylink')) return 11;
    if (name.includes('kidso2')) {
      if (name.includes('wps')) return 21;
      return 12;
    }
    if (name.includes('oxyring')) return 14;
    
    // BBSM series
    if (name.includes('bbsm')) {
      if (name.includes('s1')) return 15;
      if (name.includes('s2')) return 16;
      if (name.includes('s3')) return 22;
      if (name.includes('bs1')) return 15;
    }
    
    if (name.includes('oxyu')) return 17;
    if (name.includes('ai s100')) return 18;
    if (name.includes('cmring')) return 20;
    
    console.log('Using default model OXYFIT_WPS for device:', deviceName);
    return 1; // Default to OXYFIT_WPS
  };

  // Disconnect from device
  disconnect = async () => {
    // Clear connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    try {
      this.setState({ isLoading: true });
      
      // Disable auto mode before disconnecting
      if (this.isAutoModeEnabled) {
        await OxyfitModule.disableAutoMode();
      }
      
      await OxyfitModule.disconnect();
      
      this.deviceConnected = false;
      this.isAutoModeEnabled = false;
      this.currentDeviceModel = null;
      this.currentDeviceAddress = null;
      this.currentDeviceName = null;
      
      this.setState({
        isConnected: false,
        isLoading: false,
        deviceInfo: null,
        realTimeData: null,
        waveformData: [],
        oxygenReadings: [],
        batteryLevel: 0,
        spo2: 0,
        pulseRate: 0,
        perfusionIndex: 0,
        deviceState: 0
      });
      
      console.log('Device disconnected successfully');
    } catch (error) {
      console.error('Error during disconnect:', error);
      this.setState({ isLoading: false });
      throw error;
    }
  };

  // Get device info
  getDeviceInfo = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      console.log('Requesting device info...');
      return await OxyfitModule.getDeviceInfo();
    } catch (error) {
      console.error('Error getting device info:', error);
      throw error;
    }
  };

  // Get real-time parameters
  getRealTimeParams = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.getRealTimeParams();
    } catch (error) {
      console.error('Error getting real-time params:', error);
      throw error;
    }
  };

  // Get real-time waveform
  getRealTimeWaveform = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.getRealTimeWaveform();
    } catch (error) {
      console.error('Error getting real-time waveform:', error);
      throw error;
    }
  };

  // Get PPG data
  getPPGData = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.getPPGData();
    } catch (error) {
      console.error('Error getting PPG data:', error);
      throw error;
    }
  };

  // Enable manual polling instead of auto mode
  enableAutoMode = async (param = true, wave = true, ppg = false, acc = false) => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      console.log('Starting manual data polling instead of auto mode');
      
      // Set auto mode to false since we're using manual polling
      this.isAutoModeEnabled = false;
      
      // Start manual polling for real-time data
      this.startManualPolling();
      
      console.log('Manual data polling started successfully');
      return "Manual data polling started";
    } catch (error) {
      console.error('Error starting manual polling:', error);
      
      // Even if there's an error, try to start manual polling as fallback
      this.startManualPolling();
      throw error;
    }
  };

  // Start manual polling for real-time data
  startManualPolling = () => {
    console.log('Starting manual data polling');
    
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Poll for real-time data every 2 seconds
    this.pollingInterval = setInterval(() => {
      if (this.deviceConnected && !this.isAutoModeEnabled) {
        // Get real-time parameters
        this.getRealTimeParams().catch(error => {
          console.warn('Error polling real-time params:', error);
        });
        
        // Get waveform data
        this.getRealTimeWaveform().catch(error => {
          console.warn('Error polling waveform data:', error);
        });
      } else {
        // Stop polling if disconnected or auto mode is enabled
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
          console.log('Manual polling stopped');
        }
      }
    }, 2000);
    
    console.log('Manual polling interval set up');
  };

  // Disable manual polling
  disableAutoMode = async () => {
    try {
      // Stop manual polling
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      
      this.isAutoModeEnabled = false;
      console.log('Manual polling stopped successfully');
    } catch (error) {
      console.error('Error stopping manual polling:', error);
      throw error;
    }
  };

  // Update device settings
  updateSetting = async (settingType, value) => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.updateSetting(settingType, value);
    } catch (error) {
      console.error('Error updating setting:', error);
      throw error;
    }
  };

  // Set device time
  setDeviceTime = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.setDeviceTime();
    } catch (error) {
      console.error('Error setting device time:', error);
      throw error;
    }
  };

  // Set motor intensity
  setMotorIntensity = async (intensity) => {
    try {
      await OxyfitModule.setMotorIntensity(intensity);
      console.log(`Motor intensity set to: ${intensity}`);
    } catch (error) {
      console.error('Error setting motor intensity:', error);
      throw error;
    }
  };

  // Set buzzer intensity
  setBuzzerIntensity = async (intensity) => {
    try {
      await OxyfitModule.setBuzzerIntensity(intensity);
      console.log(`Buzzer intensity set to: ${intensity}`);
    } catch (error) {
      console.error('Error setting buzzer intensity:', error);
      throw error;
    }
  };

  // Set oxygen threshold
  setOxygenThreshold = async (threshold) => {
    try {
      await OxyfitModule.setOxygenThreshold(threshold);
      console.log(`Oxygen threshold set to: ${threshold}`);
    } catch (error) {
      console.error('Error setting oxygen threshold:', error);
      throw error;
    }
  };

  // Factory reset
  factoryReset = async () => {
    if (!this.deviceConnected) {
      throw new Error('Device not connected');
    }
    
    try {
      return await OxyfitModule.factoryReset();
    } catch (error) {
      console.error('Error performing factory reset:', error);
      throw error;
    }
  };

  // Get current device model
  getCurrentDeviceModel = () => {
    return this.currentDeviceModel;
  };

  // Get current device address
  getCurrentDeviceAddress = () => {
    return this.currentDeviceAddress;
  };

  // Get current device name
  getCurrentDeviceName = () => {
    return this.currentDeviceName;
  };

  // Check if auto mode is enabled
  isAutoModeEnabled = () => {
    return this.isAutoModeEnabled;
  };

  // Check if device is connected
  isDeviceConnected = () => {
    return this.deviceConnected;
  };

  // Check if service is initialized
  isServiceInitialized = () => {
    return this.isInitialized;
  };

  // State management
  setState = (newState) => {
    this.state = { ...this.state, ...newState };
  };

  getState = () => {
    return { ...this.state };
  };

  // Event listeners
  onBleStateChanged = (callback) => {
    const subscription = this.eventEmitter.addListener('onBleStateChanged', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onDeviceInfo = (callback) => {
    const subscription = this.eventEmitter.addListener('onDeviceInfo', (payload) => {
      console.log('Device info received:', payload);
      this.setState({ deviceInfo: payload });
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRealTimeParams = (callback) => {
    const subscription = this.eventEmitter.addListener('onRealTimeParams', (payload) => {
      console.log('Real-time params received:', payload);
      this.setState({ 
        realTimeData: payload,
        spo2: payload.spo2,
        pulseRate: payload.pr,
        perfusionIndex: payload.pi,
        batteryLevel: payload.battery,
        deviceState: payload.state
      });
      
      // Record oxygen reading if valid
      if (payload.spo2 > 0 && payload.pr > 0) {
        const newReading = {
          id: Date.now(),
          timestamp: Date.now(),
          spo2: payload.spo2,
          pr: payload.pr,
          pi: payload.pi,
          battery: payload.battery,
        };
        
        this.setState(prevState => ({
          oxygenReadings: [newReading, ...prevState.oxygenReadings].slice(0, 50)
        }));
      }
      
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRealTimeParamsAuto = (callback) => {
    const subscription = this.eventEmitter.addListener('onRealTimeParamsAuto', (payload) => {
      console.log('Auto mode real-time params:', payload);
      this.setState({ 
        realTimeData: payload,
        spo2: payload.spo2,
        pulseRate: payload.pr,
        perfusionIndex: payload.pi,
        batteryLevel: payload.battery,
        deviceState: payload.state
      });
      
      // Record oxygen reading if valid
      if (payload.spo2 > 0 && payload.pr > 0) {
        const newReading = {
          id: Date.now(),
          timestamp: Date.now(),
          spo2: payload.spo2,
          pr: payload.pr,
          pi: payload.pi,
          battery: payload.battery,
        };
        
        this.setState(prevState => ({
          oxygenReadings: [newReading, ...prevState.oxygenReadings].slice(0, 50)
        }));
      }
      
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRealTimeWaveform = (callback) => {
    const subscription = this.eventEmitter.addListener('onRealTimeWaveform', (payload) => {
      if (payload.waveData && payload.waveData.length > 0) {
        this.setState(prevState => ({
          waveformData: [...prevState.waveformData, ...payload.waveData].slice(-100)
        }));
      }
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRealTimeWaveformAuto = (callback) => {
    const subscription = this.eventEmitter.addListener('onRealTimeWaveformAuto', (payload) => {
      if (payload.waveData && payload.waveData.length > 0) {
        this.setState(prevState => ({
          waveformData: [...prevState.waveformData, ...payload.waveData].slice(-100)
        }));
      }
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onPPGData = (callback) => {
    const subscription = this.eventEmitter.addListener('onPPGData', (payload) => {
      console.log('PPG data received:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onPPGDataAuto = (callback) => {
    const subscription = this.eventEmitter.addListener('onPPGDataAuto', (payload) => {
      console.log('Auto mode PPG data:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onAccelerometerData = (callback) => {
    const subscription = this.eventEmitter.addListener('onAccelerometerData', (payload) => {
      console.log('Accelerometer data:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onSettingsUpdated = (callback) => {
    const subscription = this.eventEmitter.addListener('onSettingsUpdated', (payload) => {
      console.log('Settings updated:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onFactoryReset = (callback) => {
    const subscription = this.eventEmitter.addListener('onFactoryReset', (payload) => {
      console.log('Factory reset result:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onDeviceFound = (callback) => {
    const subscription = this.eventEmitter.addListener('onDeviceFound', (payload) => {
      console.log('Device found:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onServiceInitialized = (callback) => {
    const subscription = this.eventEmitter.addListener('onServiceInitialized', (payload) => {
      console.log('Service initialized:', payload);
      this.isInitialized = payload.initialized;
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onBleDeviceReady = (callback) => {
    const subscription = this.eventEmitter.addListener('onBleDeviceReady', (payload) => {
      console.log('BLE Device ready:', payload);
      this.deviceConnected = payload.connected;
      this.setState({ isConnected: payload.connected });
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  // Remove all listeners
  removeAllListeners = () => {
    // Clear timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Disable auto mode
    if (this.isAutoModeEnabled) {
      this.disableAutoMode().catch(console.warn);
    }
    
    // Remove all subscriptions
    this.subscriptions.forEach(subscription => {
      try {
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      } catch (e) {
        console.warn('Error removing listener:', e);
      }
    });
    this.subscriptions = [];
    
    console.log('All listeners and polling stopped');
  };
}

export default new OxyfitService();