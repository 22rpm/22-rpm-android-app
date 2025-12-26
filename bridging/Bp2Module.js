import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';

const { Bp2Module } = NativeModules;
const bp2Emitter = new NativeEventEmitter(Bp2Module);

// Request Bluetooth permissions for Android
// Request Bluetooth permissions for Android
const requestBluetoothPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      // For Android API 31+ (Android 12+)
      if (Platform.Version >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];
        
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        
        return allGranted;
      } 
      // For Android API < 31
      else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location to use Bluetooth',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }
  return true; // iOS handles permissions differently
};

export default {
  // Methods with error handling
initService: async () => {
  try {
    console.log('Requesting Bluetooth permissions...');
    const hasPermissions = await requestBluetoothPermissions();
    console.log('Permission result:', hasPermissions);
    
    if (!hasPermissions) {
      console.error('Bluetooth permissions were denied');
      throw new Error('Bluetooth permissions denied');
    }
    
    console.log('Initializing service...');
    const result = await Bp2Module.initService();
    console.log('Service initialized successfully:', result);
    return result;
  } catch (error) {
    console.error('initService error details:', error);
    throw error;
  }
},
  
  startScan: async () => {
    try {
      return await Bp2Module.startScan();
    } catch (error) {
      console.error('startScan error:', error);
      throw error;
    }
  },
  
  stopScan: async () => {
    try {
      return await Bp2Module.stopScan();
    } catch (error) {
      console.error('stopScan error:', error);
      throw error;
    }
  },
  connect: async (deviceName, deviceAddress, deviceModel) => {
    try {
        return await Bp2Module.connect(deviceName, deviceAddress, deviceModel);
    } catch (error) {
        console.error('connect error:', error);
        throw error;
    }
},
  
  disconnect: async () => {
    try {
      return await Bp2Module.disconnect();
    } catch (error) {
      console.error('disconnect error:', error);
      throw error;
    }
  },
  
  getInfo: async () => {
    try {
      return await Bp2Module.getInfo();
    } catch (error) {
      console.error('getInfo error:', error);
      throw error;
    }
  },
  
  getConfig: async () => {
    try {
      return await Bp2Module.getConfig();
    } catch (error) {
      console.error('getConfig error:', error);
      throw error;
    }
  },
  
  setConfig: async (soundOn) => {
    try {
      return await Bp2Module.setConfig(soundOn);
    } catch (error) {
      console.error('setConfig error:', error);
      throw error;
    }
  },
  
  startRealTime: async () => {
    try {
      return await Bp2Module.startRealTime();
    } catch (error) {
      console.error('startRealTime error:', error);
      throw error;
    }
  },
  
  stopRealTime: async () => {
    try {
      return await Bp2Module.stopRealTime();
    } catch (error) {
      console.error('stopRealTime error:', error);
      throw error;
    }
  },
  
  getFileList: async () => {
    try {
      return await Bp2Module.getFileList();
    } catch (error) {
      console.error('getFileList error:', error);
      throw error;
    }
  },
  
  readFile: async (fileName) => {
    try {
      return await Bp2Module.readFile(fileName);
    } catch (error) {
      console.error('readFile error:', error);
      throw error;
    }
  },
  
  factoryReset: async () => {
    try {
      return await Bp2Module.factoryReset();
    } catch (error) {
      console.error('factoryReset error:', error);
      throw error;
    }
  },

  // Check if Bluetooth is available
  isBluetoothAvailable: async () => {
    try {
      return await Bp2Module.isBluetoothAvailable();
    } catch (error) {
      console.error('Bluetooth availability check error:', error);
      return false;
    }
  },

  // Get connected device model
  getConnectedDeviceModel: async () => {
    try {
      return await Bp2Module.getConnectedDeviceModel();
    } catch (error) {
      console.error('getConnectedDeviceModel error:', error);
      return -1; // No device connected
    }
  },

  // Event Listeners
  addListener: (eventName, callback) => {
    return bp2Emitter.addListener(eventName, callback);
  },

  // Events - UPDATED WITH NEW EVENTS FROM KOTLIN
// In Bp2Module.js, update the EVENTS object:
EVENTS: {
    ON_BP2_INFO: 'onBp2Info',
    ON_BP2_RT_DATA: 'onBp2RtData',
    ON_BP2_FILE_LIST: 'onBp2FileList',
    ON_BP2_READING_PROGRESS: 'onBp2ReadingProgress',
    ON_BP2_READ_FILE_COMPLETE: 'onBp2ReadFileComplete',
    ON_DEVICE_CONNECTED: 'onDeviceConnected',
    ON_BP2_CONFIG: 'onBp2Config',
    ON_BP2_SET_CONFIG_RESULT: 'onBp2SetConfigResult',
    ON_BP2_FACTORY_RESET_RESULT: 'onBp2FactoryResetResult',
    ON_SCAN_STATUS_CHANGED: 'onScanStatusChanged', // Keep this
    ON_CONNECTION_STATUS_CHANGED: 'onConnectionStatusChanged', // Keep this
    ON_DEVICE_FOUND: 'onDeviceFound',
    // Remove the comment about removing these - they ARE implemented in Kotlin
}
};