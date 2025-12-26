import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid, Alert } from 'react-native';

const { Pc60fwModule } = NativeModules;
const eventEmitter = new NativeEventEmitter(Pc60fwModule);

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

class Pc60fwService {
  constructor() {
    this.eventEmitter = eventEmitter;
    this.subscriptions = [];
    this.isInitialized = false;
    this.currentDeviceModel = null;
    this.connectionPromise = null;
    this.connectionTimeout = null;
  }

  // Initialize Bluetooth service with permission check
  initBleService = async () => {
    try {
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions denied');
      }
      
      const result = await Pc60fwModule.initBleService();
      this.isInitialized = true;
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
    return Pc60fwModule.startScan();
  };

  // Stop scanning for devices
  stopScan = () => {
    return Pc60fwModule.stopScan();
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
    
    // Detect device model based on name
    const deviceModel = this.detectDeviceModel(deviceName);
    this.currentDeviceModel = deviceModel;
    
    console.log(`Connecting to device: ${deviceName} (${deviceAddress}) with model: ${deviceModel}`);
    
    // Set connection timeout (30 seconds)
    return new Promise((resolve, reject) => {
      this.connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout - device not responding'));
      }, 30000);
      
      Pc60fwModule.connectToDevice(deviceAddress, deviceModel)
        .then(result => {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          resolve(result);
        })
        .catch(error => {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
          reject(error);
        });
    });
  };

  // Improved device model detection
  detectDeviceModel = (deviceName) => {
    const name = deviceName.toLowerCase();
    console.log('Detecting model for device:', deviceName);
    
    // PC-60FW series
    if (name.includes('pc-60fw')) return 1;
    if (name.includes('pc-60nw')) {
      if (name.includes('wps')) return 18; // Bluetooth.MODEL_PC60NW_WPS
      if (name.includes('-1')) return 3;
      return 2;
    }
    if (name.includes('pc66b')) return 4;
    
    // PF series
    if (name.includes('pf-10')) {
      if (name.includes('aw1')) return 15;
      if (name.includes('aw')) return 14;
      if (name.includes('bw1')) return 17;
      if (name.includes('bw')) return 16;
      return 5;
    }
    if (name.includes('pf-20')) {
      if (name.includes('aw')) return 19;
      if (name.includes('b')) return 20;
      return 6;
    }
    
    // Oxy series - FIXED: More specific detection
    if (name.includes('oxyfit')) return 21;
    if (name.includes('oxy')) return 7;
    
    // POD series
    if (name.includes('pod-2')) return 8;
    if (name.includes('pod-1')) return 9;
    
    // S series
    if (name.includes('s5')) return 10;
    if (name.includes('s6')) {
      if (name.includes('s6w1')) return 22;
      return 11;
    }
    if (name.includes('s7')) {
      if (name.includes('s7bw')) return 13;
      return 12;
    }
    
    console.log('Using default model PC60FW for device:', deviceName);
    return 1; // Default to PC60FW
  };

  // Disconnect from device
  disconnect = () => {
    // Clear connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    return Pc60fwModule.disconnect();
  };

  // Get device info
  getDeviceInfo = () => {
    if (!this.isInitialized) {
      throw new Error('BLE service not initialized');
    }
    return Pc60fwModule.getDeviceInfo();
  };

  // Get battery level
  getBatteryLevel = () => {
    if (!this.isInitialized) {
      throw new Error('BLE service not initialized');
    }
    return Pc60fwModule.getBatteryLevel();
  };

  // Get current device model
  getCurrentDeviceModel = () => {
    return this.currentDeviceModel;
  };

  // Event listeners
  onBleStateChanged = (callback) => {
    const subscription = this.eventEmitter.addListener('onBleStateChanged', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onDeviceInfo = (callback) => {
    const subscription = this.eventEmitter.addListener('onDeviceInfo', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRtParam = (callback) => {
    const subscription = this.eventEmitter.addListener('onRtParam', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onRtWave = (callback) => {
    const subscription = this.eventEmitter.addListener('onRtWave', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onBatteryLevel = (callback) => {
    const subscription = this.eventEmitter.addListener('onBatteryLevel', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onWorkingStatus = (callback) => {
    const subscription = this.eventEmitter.addListener('onWorkingStatus', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onDeviceFound = (callback) => {
    const subscription = this.eventEmitter.addListener('onDeviceFound', (payload) => {
      console.log('Device found event received:', payload);
      callback(payload);
    });
    this.subscriptions.push(subscription);
    return subscription;
  };

  onServiceInitialized = (callback) => {
    const subscription = this.eventEmitter.addListener('onServiceInitialized', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  onBleDeviceReady = (callback) => {
    const subscription = this.eventEmitter.addListener('onBleDeviceReady', callback);
    this.subscriptions.push(subscription);
    return subscription;
  };

  // Check if service is initialized
  isServiceInitialized = () => {
    return this.isInitialized;
  };

  // Remove all listeners
  removeAllListeners = () => {
    // Clear timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    this.subscriptions.forEach(subscription => subscription.remove());
    this.subscriptions = [];
  };
}

export default new Pc60fwService();