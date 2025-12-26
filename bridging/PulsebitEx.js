// PulsebitEx.js - Enhanced Version
import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid, Alert } from 'react-native';

const { PulsebitEx } = NativeModules || {};
const pulsebitExEmitter = PulsebitEx ? new NativeEventEmitter(PulsebitEx) : null;

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
            'Bluetooth permissions are needed to connect to ECG devices'
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
            'Location permission is needed to scan for ECG devices'
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

class PulsebitExService {
  constructor() {
    this.listeners = [];
    this.isInitialized = false;
    this.isConnected = false;
    this.currentDevice = null;
    
    if (pulsebitExEmitter) {
      this.setupEventListeners();
    } else {
      console.warn('⚠️ PulsebitEx native module not found. Running in demo mode.');
    }
  }

  setupEventListeners() {
    if (!pulsebitExEmitter) return;

    // Add all the event listeners that match the Kotlin module
    this.addListener('deviceFound', (data) => {
      console.log('Device found:', data);
      // Store device info when found
      this.currentDevice = data;
    });
    
    this.addListener('deviceInfo', (data) => {
      console.log('Device info:', data);
      this.isConnected = true;
    });
    
    this.addListener('pulsebitGetFileList', (data) => {
      console.log('File list:', data.fileList);
    });
    
    this.addListener('pulsebitReadFileComplete', (data) => {
      console.log('ECG File Read Complete:', data);
      this.processEcgData(data);
    });
    
    this.addListener('progress', (data) => console.log('Progress event:', data));
    
    this.addListener('bleStateChanged', (data) => {
      console.log('BLE state changed:', data);
      this.isConnected = data.connected;
      if (!data.connected) {
        this.currentDevice = null;
      }
    });
    
    this.addListener('deviceReady', (data) => {
      console.log('Device ready:', data);
      this.isConnected = true;
      this.currentDevice = data;
    });
    
    this.addListener('serviceStatus', (data) => {
      console.log('Service status:', data);
    });
    
    this.addListener('connectionStatusChanged', (data) => {
      console.log('Connection status changed:', data);
      this.isConnected = data.connected;
      if (!data.connected) {
        this.currentDevice = null;
      }
    });
    
    this.addListener('scanStatusChanged', (data) => {
      console.log('Scan status changed:', data);
    });
    
    this.addListener('connectionRequest', (data) => {
      console.log('Connection requested:', data);
    });
    
    this.addListener('scanStopped', (data) => {
      console.log('Scan stopped:', data);
    });
    
    this.addListener('SDKInitialized', () => {
      console.log('SDK initialized successfully');
      this.isInitialized = true;
    });
    
    this.addListener('SDKError', (err) => console.error('SDK error:', err));
    this.addListener('ecgFileError', (err) => console.error('ECG file error:', err));
    this.addListener('fileListError', (err) => console.error('File list error:', err));
    this.addListener('deviceInfoError', (err) => console.error('Device info error:', err));
  }

  processEcgData(data) {
    if (data.waveData && Array.isArray(data.waveData)) {
      // ⚠️ Do NOT rescale — Kotlin already applied the factor
      data.waveDataMV = data.waveData;
      console.log('Processed ECG wave data (mV):', data.waveDataMV.slice(0, 10));
    }
  }

  addListener(eventName, callback) {
    if (!pulsebitExEmitter) return null;
    const sub = pulsebitExEmitter.addListener(eventName, callback);
    this.listeners.push(sub);
    return sub;
  }

  removeAllListeners() {
    this.listeners.forEach((sub) => sub?.remove());
    this.listeners = [];
  }

  // Check if SDK is available
  isAvailable() {
    return !!PulsebitEx;
  }

  // Check connection status
  isDeviceConnected() {
    return this.isConnected;
  }

  // SDK Methods with permission handling
  async initializeSDK() {
    if (!PulsebitEx) {
      console.warn('PulsebitEx not available, skipping initializeSDK');
      return false;
    }
    
    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) throw new Error('Bluetooth permissions denied');
    
    return PulsebitEx.initializeSDK();
  }

  async startScan() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    return PulsebitEx.startScan();
  }

  async stopScan() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    return PulsebitEx.stopScan();
  }

  // FIXED: Updated to match new Kotlin method signature
  async connectDevice(deviceName, deviceAddress) {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    
    this.currentDevice = { 
      name: deviceName, 
      address: deviceAddress,
      macAddress: deviceAddress 
    };
    
    return PulsebitEx.connectDevice(deviceName, deviceAddress);
  }

  async disconnectDevice() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    this.isConnected = false;
    this.currentDevice = null;
    return PulsebitEx.disconnectDevice();
  }

  async getDeviceInfo() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    if (!this.isConnected) throw new Error('Device not connected');
    return PulsebitEx.getDeviceInfo();
  }

  async getFileList() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    if (!this.isConnected) throw new Error('Device not connected');
    return PulsebitEx.getFileList();
  }

  async readFile(fileName) {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    if (!this.isConnected) throw new Error('Device not connected');
    return PulsebitEx.readFile(fileName);
  }

  async readAllFiles() {
    if (!PulsebitEx) throw new Error('PulsebitEx not available');
    if (!this.isInitialized) throw new Error('SDK not initialized');
    if (!this.isConnected) throw new Error('Device not connected');
    return PulsebitEx.readAllFiles();
  }

  // New utility methods
  async isBluetoothAvailable() {
    if (!PulsebitEx) return false;
    return PulsebitEx.isBluetoothAvailable();
  }

  // Get current device info
  getCurrentDevice() {
    return this.currentDevice;
  }
}

export default new PulsebitExService();