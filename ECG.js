import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  PermissionsAndroid,
  Platform,
  Alert,
  StyleSheet,
  Dimensions,
  Image
} from 'react-native';
import PulsebitExService from './bridging/PulsebitEx';
import globalStyles from './globalStyles';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const Ecg = ({ navigation }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bluetoothAvailable, setBluetoothAvailable] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [realTimeData, setRealTimeData] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  const eventListeners = useRef([]);

  // === Setup event listeners ===
  useEffect(() => {
    checkBluetoothAvailability();
    setupEventListeners();
    
    return () => {
      // Cleanup listeners
      eventListeners.current.forEach(listener => {
        try {
          listener.remove();
        } catch (e) {
          // Ignore
        }
      });
      eventListeners.current = [];
    };
  }, []);

  const checkBluetoothAvailability = async () => {
    try {
      const available = await PulsebitExService.isBluetoothAvailable();
      setBluetoothAvailable(available);
      if (!available) {
        setErrorMessage('Bluetooth is not available on this device');
      }
    } catch (error) {
      console.warn('Bluetooth check error:', error);
      setBluetoothAvailable(false);
    }
  };

  const setupEventListeners = () => {
    if (!PulsebitExService.isAvailable()) {
      setErrorMessage('PulsebitEx module not available');
      return;
    }

    const listeners = [
      PulsebitExService.addListener('deviceFound', handleDeviceFound),
      PulsebitExService.addListener('deviceInfo', handleDeviceInfo),
      PulsebitExService.addListener('deviceInfoError', handleDeviceInfoError),
      PulsebitExService.addListener('scanStopped', handleScanStopped),
      PulsebitExService.addListener('bleStateChanged', handleBleStateChanged),
      PulsebitExService.addListener('deviceReady', handleDeviceReady),
      PulsebitExService.addListener('serviceStatus', handleServiceStatus),
      PulsebitExService.addListener('connectionStatusChanged', handleConnectionStatusChanged),
      PulsebitExService.addListener('pulsebitReadFileComplete', handleEcgFileData),
      PulsebitExService.addListener('pulsebitGetFileList', handleFileList),
      PulsebitExService.addListener('progress', handleProgress),
      PulsebitExService.addListener('ecgFileError', handleEcgFileError),
      PulsebitExService.addListener('fileListError', handleFileListError),
    ];

    eventListeners.current = listeners;
  };

  // === Enhanced Event Handlers ===
  const handleDeviceFound = (device) => {
    console.log('Device found:', device);
    if (device && device.macAddress) {
      setDevices(prev => {
        if (!prev.find(d => d.macAddress === device.macAddress)) {
          return [...prev, {
            ...device,
            name: device.name || 'PulsebitEX Device',
            address: device.macAddress
          }];
        }
        return prev;
      });
    }
  };

  const handleDeviceInfo = (info) => {
    console.log('Device info received:', info);
    setIsLoading(false);
    setDeviceInfo(info);
    Alert.alert('Device Connected', 'PulsebitEX device connected successfully!');
  };

  const handleDeviceInfoError = (error) => {
    setIsLoading(false);
    setErrorMessage('Failed to retrieve device info: ' + error.error);
    console.error('Device info error:', error);
  };

  const handleScanStopped = () => {
    console.log('Scan stopped');
    setIsScanning(false);
    if (devices.length === 0) {
      setErrorMessage('No PulsebitEX devices found. Please make sure the device is turned on and nearby.');
    }
  };

  const handleBleStateChanged = (data) => {
    console.log('BLE State Changed:', data);
    setIsConnected(data.connected);
    if (!data.connected) {
      setDeviceInfo(null);
      setRealTimeData(null);
      setFileList([]);
      setErrorMessage('Device disconnected');
    }
  };

  const handleDeviceReady = (data) => {
    console.log('Device Ready:', data);
    setIsConnected(true);
    setErrorMessage('');
    
    // Auto-fetch device info when ready
    setTimeout(() => {
      PulsebitExService.getDeviceInfo().catch(error => {
        console.error('Auto-fetch device info failed:', error);
      });
    }, 1000);
  };

  const handleConnectionStatusChanged = (data) => {
    console.log('Connection status changed:', data);
    setIsConnected(data.connected);
    if (data.connected) {
      setErrorMessage('');
    }
  };

  const handleServiceStatus = (data) => {
    console.log('Service Status:', data);
  };

  const handleFileList = (data) => {
    console.log('File list received:', data);
    setIsLoading(false);
    if (data.fileList && data.fileList.length > 0) {
      setFileList(data.fileList);
      Alert.alert('Files Found', `Found ${data.fileList.length} ECG file(s)`);
      
      // Auto-read first file
      if (data.fileList.length > 0) {
        readFile(data.fileList[0]);
      }
    } else {
      Alert.alert('No Files', 'No ECG files found on device');
    }
  };

  const handleEcgFileData = (data) => {
    console.log('ECG File Data Received:', data);
    setIsLoading(false);
    setRealTimeData(data);
    
    // Show diagnosis summary if available
    if (data.diagnosisSummary) {
      Alert.alert('ECG Analysis Complete', data.diagnosisSummary);
    }
  };

  const handleEcgFileError = (error) => {
    setIsLoading(false);
    setErrorMessage('Error reading ECG file: ' + error.error);
    console.error('ECG file error:', error);
  };

  const handleFileListError = (error) => {
    setIsLoading(false);
    setErrorMessage('Error getting file list: ' + error.error);
    console.error('File list error:', error);
  };

  const handleProgress = (data) => {
    console.log('Progress:', data);
  };

  // === Enhanced Connection Logic ===
  const initializeSDK = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      await PulsebitExService.initializeSDK();
      console.log('SDK initialized successfully');
    } catch (error) {
      setErrorMessage('Failed to initialize SDK: ' + error.message);
      console.error('SDK initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startScan = async () => {
    try {
      setErrorMessage('');
      setDevices([]);
      
      // Check Bluetooth availability
      await checkBluetoothAvailability();
      if (!bluetoothAvailable) {
        setErrorMessage('Bluetooth is not available. Please enable Bluetooth and try again.');
        return;
      }

      // Initialize SDK first
      await initializeSDK();
      
      setIsScanning(true);
      setShowDeviceModal(true);
      
      await PulsebitExService.startScan();
      console.log('Scan started');

      // Auto stop scan after 15 seconds
      setTimeout(() => {
        if (isScanning) {
          stopScan();
        }
      }, 15000);
    } catch (error) {
      console.error('Scan error:', error);
      setErrorMessage('Failed to start scanning: ' + error.message);
      setIsScanning(false);
    }
  };

  const stopScan = async () => {
    try {
      await PulsebitExService.stopScan();
      setIsScanning(false);
      console.log('Scan stopped');
    } catch (error) {
      console.error('Stop scan error:', error);
    }
  };

// In ECG.js, update connectToDevice function
const connectToDevice = async (device) => {
  if (!device || !device.macAddress) {
    setErrorMessage('No valid device selected');
    return;
  }

  try {
    setIsLoading(true);
    setErrorMessage('');

    // Wait for service to be ready
    const serviceReadyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('BLE Service not ready')), 10000);
      const listener = PulsebitExService.addListener('serviceStatus', (data) => {
        if (data.status === 'service_ready') {
          clearTimeout(timeout);
          listener.remove();
          resolve();
        }
      });
    });

    await serviceReadyPromise;

    // Start connection
    await PulsebitExService.connectDevice(device.name, device.macAddress);

    // Wait for any of the connection confirmation events
    const connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout. Please try again.')), 15000);

      const listeners = [
        PulsebitExService.addListener('deviceReady', (data) => {
          clearTimeout(timeout);
          listeners.forEach(l => l.remove());
          resolve(data);
        }),
        PulsebitExService.addListener('connectionStatusChanged', (data) => {
          if (data.connected) {
            clearTimeout(timeout);
            listeners.forEach(l => l.remove());
            resolve(data);
          }
        }),
        PulsebitExService.addListener('onDeviceConnected', (data) => {
          clearTimeout(timeout);
          listeners.forEach(l => l.remove());
          resolve(data);
        })
      ];
    });

    const result = await connectionPromise;

    // Connected
    setIsConnected(true);
    setIsLoading(false);
    setShowDeviceModal(false);
    Alert.alert('Device Connected', `${device.name} connected successfully!`);

  } catch (error) {
    console.error('Connection error:', error);
    setErrorMessage('Failed to connect: ' + error.message);
    setIsLoading(false);
  }
};


  const disconnectDevice = async () => {
    try {
      await PulsebitExService.disconnectDevice();
      setIsConnected(false);
      setDeviceInfo(null);
      setRealTimeData(null);
      setFileList([]);
      setErrorMessage('');
      console.log('Device disconnected');
    } catch (error) {
      console.error('Disconnection error:', error);
      setErrorMessage('Failed to disconnect device: ' + error.message);
    }
  };

  const getDeviceInfo = async () => {
    if (!isConnected) {
      setErrorMessage('Please connect to a device first');
      return;
    }

    try {
      setIsLoading(true);
      await PulsebitExService.getDeviceInfo();
    } catch (error) {
      setErrorMessage('Failed to get device info: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileList = async () => {
    if (!isConnected) {
      setErrorMessage('Please connect to a device first');
      return;
    }

    try {
      setIsLoading(true);
      setFileList([]);
      await PulsebitExService.getFileList();
    } catch (error) {
      setErrorMessage('Failed to get file list: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const readFile = async (fileName) => {
    if (!isConnected) {
      setErrorMessage('Please connect to a device first');
      return;
    }

    try {
      setIsLoading(true);
      await PulsebitExService.readFile(fileName);
    } catch (error) {
      setErrorMessage('Failed to read file: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const readAllFiles = async () => {
    if (!isConnected) {
      setErrorMessage('Please connect to a device first');
      return;
    }

    try {
      setIsLoading(true);
      await PulsebitExService.readAllFiles();
    } catch (error) {
      setErrorMessage('Failed to read files: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => navigation?.navigate?.('Home');

  // === UI Components ===
  const renderConnectionStatus = () => (
    <View style={styles.connectionStatus}>
      <View style={[styles.statusIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
      <Text style={styles.statusText}>
        {isConnected ? 'Connected to PulsebitEX' : 'Disconnected'}
      </Text>
      <TouchableOpacity 
        style={styles.connectButtonSmall} 
        onPress={isConnected ? disconnectDevice : () => setShowDeviceModal(true)}
      >
        <Text style={styles.connectButtonTextSmall}>
          {isConnected ? 'Disconnect' : 'Connect'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDeviceControls = () => (
    <View style={styles.controlsContainer}>
      <TouchableOpacity
        style={[styles.controlButton, (!isConnected || isLoading) && styles.disabledButton]}
        onPress={getDeviceInfo}
        disabled={!isConnected || isLoading}
      >
        <Text style={styles.controlButtonText}>Get Device Info</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.controlButton, (!isConnected || isLoading) && styles.disabledButton]}
        onPress={getFileList}
        disabled={!isConnected || isLoading}
      >
        <Text style={styles.controlButtonText}>Get ECG Files</Text>
      </TouchableOpacity>

      {fileList.length > 0 && (
        <TouchableOpacity
          style={[styles.controlButton, (!isConnected || isLoading) && styles.disabledButton]}
          onPress={readAllFiles}
          disabled={!isConnected || isLoading}
        >
          <Text style={styles.controlButtonText}>Read All Files</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderDeviceConnectionModal = () => (
    <Modal visible={showDeviceModal} transparent animationType="slide" onRequestClose={() => setShowDeviceModal(false)}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Connect to PulsebitEX Device</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={globalStyles.primaryColor.color} />
          ) : (
            <>
              <Text style={styles.modalText}>
                {isConnected ? 'Connected to PulsebitEX' : isScanning ? 'Scanning for devices...' : 'Select a device to connect'}
              </Text>

              {!isConnected && (
                <>
                  <ScrollView style={styles.deviceList}>
                    {devices.length === 0 ? (
                      <Text style={styles.noDevicesText}>
                        {isScanning ? 'Scanning...' : 'No devices found. Make sure your PulsebitEX is turned on and nearby.'}
                      </Text>
                    ) : (
                      devices.map((device, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.deviceItem}
                          onPress={() => connectToDevice(device)}
                        >
                          <Text style={styles.deviceName}>{device.name || 'PulsebitEX Device'}</Text>
                          <Text style={styles.deviceAddress}>{device.macAddress}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>

                  <View style={styles.modalButtons}>
                    {!isScanning && (
                      <TouchableOpacity style={styles.scanButton} onPress={startScan}>
                        <Text style={styles.scanButtonText}>Scan Again</Text>
                      </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeviceModal(false)}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderRealTimeData = () => {
    if (!realTimeData) return null;

    return (
      <View style={styles.realTimeContainer}>
        <Text style={styles.realTimeTitle}>ECG Data Analysis</Text>
        
        {realTimeData.fileName && (
          <Text style={styles.dataText}>File: {realTimeData.fileName}</Text>
        )}
        
        {realTimeData.hr && (
          <Text style={styles.dataText}>Heart Rate: {realTimeData.hr} bpm</Text>
        )}
        
        {realTimeData.recordingTime && (
          <Text style={styles.dataText}>Recording Time: {realTimeData.recordingTime} seconds</Text>
        )}
        
        {realTimeData.waveData && (
          <Text style={styles.dataText}>Data Points: {realTimeData.waveData.length}</Text>
        )}
        
        {realTimeData.diagnosisSummary && (
          <View style={styles.diagnosisContainer}>
            <Text style={styles.diagnosisTitle}>Analysis Results:</Text>
            <Text style={styles.diagnosisText}>{realTimeData.diagnosisSummary}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderFileList = () => {
    if (fileList.length === 0) return null;

    return (
      <View style={styles.fileListContainer}>
        <Text style={styles.fileListTitle}>ECG Files on Device ({fileList.length})</Text>
        <ScrollView style={styles.fileScrollView}>
          {fileList.map((file, index) => (
            <TouchableOpacity
              key={index}
              style={styles.fileItem}
              onPress={() => readFile(file)}
            >
              <Text style={styles.fileName}>{file}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Image style={styles.backIcon} source={require('./assets/icon_back.png')} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ECG Monitoring</Text>
      </View>

      {errorMessage ? (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>{errorMessage}</Text>
        </View>
      ) : null}

      {renderConnectionStatus()}
      {renderDeviceControls()}
      {renderFileList()}
      {renderRealTimeData()}

      {renderDeviceConnectionModal()}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={globalStyles.primaryColor.color} />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ebf2f9',
  },
  header: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.08,
    backgroundColor: globalStyles.primaryColor.color,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  backIcon: {
    width: SCREEN_WIDTH * 0.06,
    height: SCREEN_WIDTH * 0.06,
    resizeMode: 'contain',
    tintColor: '#fff',
  },
  headerTitle: {
    color: 'white',
    fontSize: SCREEN_WIDTH * 0.05,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: SCREEN_WIDTH * 0.08,
  },
  warningContainer: {
    backgroundColor: '#ffebee',
    padding: 15,
    margin: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  warningText: {
    color: '#d32f2f',
    fontSize: 14,
    fontWeight: '500',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  connectButtonSmall: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  connectButtonTextSmall: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  controlButton: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 140,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
   disabledButton: {
    opacity: 0.5,
  },
  deviceList: {
    maxHeight: 200,
    width: '100%',
    marginVertical: 10,
  },
  noDevicesText: {
    textAlign: 'center',
    color: '#666',
    marginVertical: 20,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  diagnosisContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  diagnosisTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  diagnosisText: {
    fontSize: 12,
    lineHeight: 16,
  },
  fileListContainer: {
    backgroundColor: '#fff',
    padding: 15,
    margin: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    maxHeight: 200,
  },
  fileListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  fileScrollView: {
    maxHeight: 150,
  },
  fileItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fileName: {
    fontSize: 14,
    color: '#333',
  },
  realTimeContainer: {
    backgroundColor: '#fff',
    padding: 15,
    margin: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  realTimeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  dataText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  deviceItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
    width: '100%',
  },
  deviceName: {
    fontWeight: '600',
    fontSize: 16,
  },
  deviceAddress: {
    color: '#666',
    fontSize: 12,
  },
  scanButton: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
});

export default Ecg;