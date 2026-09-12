import { DEV_DATA_BASE } from './apiConfig';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  FlatList,
  RefreshControl
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import globalStyles from './globalStyles';
import BottomBar from './BottomBar';
import OxyfitService from './bridging/OxyfitModule';
import SQLite from 'react-native-sqlite-storage';
import axios from 'axios';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const BRAND = globalStyles.primaryColor.color || '#50b48d';

// SQLite database setup
const db = SQLite.openDatabase(
  { name: 'oxygen_sessions.db', location: 'default' },
  () => console.log('✅ Oxygen SQLite DB opened'),
  (err) => console.error('❌ Oxygen SQLite error:', err)
);

// API configuration
const API_BASE_URL = DEV_DATA_BASE;
const DEV_TYPE = 'spo2';

export default function OxygenSaturation({ navigation }) {
  const [activeTab, setActiveTab] = useState('LIST');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceList, setDeviceList] = useState([]);
  const [realTimeData, setRealTimeData] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [serviceInitialized, setServiceInitialized] = useState(false);
  const [bluetoothAvailable, setBluetoothAvailable] = useState(true);
  const [isAutoModeEnabled, setIsAutoModeEnabled] = useState(false);
  const [manualPollingInterval, setManualPollingInterval] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Live oxygen data from device
  const [oxygenReadings, setOxygenReadings] = useState([]);
  const [waveformData, setWaveformData] = useState([]);
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [spo2, setSpo2] = useState(0);
  const [pulseRate, setPulseRate] = useState(0);
  const [perfusionIndex, setPerfusionIndex] = useState(0);
  const [deviceState, setDeviceState] = useState(0);
  
  // Session management
  const [sessionCards, setSessionCards] = useState([]);
  const sessionRef = useRef({ startTs: null, endTs: null, spo2: [], pr: [], pi: [] });
  const nextCardId = useRef(1);
  const searchingSinceRef = useRef(null);
  const SESSION_GAP_MS = 4000;
  
  const eventListeners = useRef([]);

  // Initialize database
  const initDB = () => {
    db.transaction(tx => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS oxygen_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          startTs INTEGER,
          endTs INTEGER,
          avgSpO2 REAL,
          minSpO2 REAL,
          maxSpO2 REAL,
          avgPR REAL,
          minPR REAL,
          maxPR REAL,
          avgPI REAL,
          readingsCount INTEGER
        );`
      );
    });
  };

  // Load existing sessions on mount
  useEffect(() => {
    initDB();
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM oxygen_sessions ORDER BY id DESC',
        [],
        (_, { rows }) => {
          const existing = [];
          for (let i = 0; i < rows.length; i++) existing.push(rows.item(i));
          setSessionCards(existing);
          nextCardId.current = existing.length + 1;
        }
      );
    });
  }, []);

  // API function to store device data
  const storeDeviceData = async (deviceData) => {
    try {
      await axios.post(`${API_BASE_URL}/devices/data`, deviceData, {
        withCredentials: true,
        headers: {'Content-Type': 'application/json'}
      });
      console.log('✅ Device data sent to backend');
    } catch (error) {
      console.error('Error storing device data:', error);
    }
  };

  // Session finalization
  const finalizeSessionIfAny = () => {
    const s = sessionRef.current;
    const hasPayload = (s.spo2.length || s.pr.length);
    
    if (s.startTs && hasPayload) {
      const card = {
        id: nextCardId.current++,
        startTs: s.startTs,
        endTs: s.endTs || s.startTs,
        avgSpO2: safeAvg(s.spo2),
        minSpO2: safeMin(s.spo2),
        maxSpO2: safeMax(s.spo2),
        avgPR: safeAvg(s.pr),
        minPR: safeMin(s.pr),
        maxPR: safeMax(s.pr),
        avgPI: safeAvg(s.pi),
        readingsCount: s.spo2.length
      };
      
      setSessionCards((prev) => [card, ...prev]);

      // Save to local SQLite
      db.transaction(tx => {
        tx.executeSql(
          `INSERT INTO oxygen_sessions (startTs, endTs, avgSpO2, minSpO2, maxSpO2, avgPR, minPR, maxPR, avgPI, readingsCount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            card.startTs,
            card.endTs,
            card.avgSpO2,
            card.minSpO2,
            card.maxSpO2,
            card.avgPR,
            card.minPR,
            card.maxPR,
            card.avgPI,
            card.readingsCount
          ],
          () => console.log('✅ Oxygen session stored in SQLite'),
          (_, err) => console.error('❌ Oxygen insert error:', err)
        );
      });

      // Send to backend API
      const deviceData = {
        devId: 'oxyfit_device_001',
        devType: DEV_TYPE,
        data: {
          spo2: card.avgSpO2,
          pulse: card.avgPR,
          pi: card.avgPI,
          timestamp: new Date(card.startTs).toISOString(),
          duration: card.endTs - card.startTs,
          minSpo2: card.minSpO2,
          maxSpo2: card.maxSpo2,
          minPulse: card.minPR,
          maxPulse: card.maxPR,
          deviceInfo: {
            name: 'Oxyfit-WPS 0218',
            batteryLevel: batteryLevel,
            type: 'oxyfit'
          }
        }
      };
      storeDeviceData(deviceData);
    }
    
    sessionRef.current = { startTs: null, endTs: null, spo2: [], pr: [], pi: [] };
    searchingSinceRef.current = null;
  };

  // Helper functions for calculations
  const safeAvg = (arr) => (arr.length ? Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1)) : null);
  const safeMin = (arr) => (arr.length ? Math.min(...arr) : null);
  const safeMax = (arr) => (arr.length ? Math.max(...arr) : null);

  // Cleanup manual polling on unmount or disconnect
  useEffect(() => {
    return () => {
      if (manualPollingInterval) {
        clearInterval(manualPollingInterval);
      }
    };
  }, [manualPollingInterval]);

  useEffect(() => {
    console.log('Oxygen component mounted - initializing service');
    initializeService();
    
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    console.log('Service state updated:', {
      serviceInitialized,
      bluetoothAvailable,
      isLoading,
      isConnected
    });
  }, [serviceInitialized, bluetoothAvailable, isLoading, isConnected]);

  const cleanup = () => {
    console.log('Cleaning up oxygen monitor...');
    
    // Finalize any ongoing session
    finalizeSessionIfAny();
    
    // Cleanup listeners
    eventListeners.current.forEach(listener => {
      try {
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
        }
      } catch (e) {
        console.warn('Error removing listener:', e);
      }
    });
    eventListeners.current = [];
    
    // Stop any ongoing operations
    try {
      OxyfitService.removeAllListeners();
      if (OxyfitService.isDeviceConnected()) {
        OxyfitService.disconnect().catch(console.warn);
      }
      if (OxyfitService.isScanning) {
        OxyfitService.stopScan();
      }
    } catch (err) {
      console.warn('Error cleaning up:', err);
    }
  };

  useEffect(() => {
    if (isLoading && !serviceInitialized) {
      const timer = setTimeout(() => {
        console.log('Checking service initialization status...');
        if (OxyfitService.isServiceInitialized && OxyfitService.isServiceInitialized()) {
          console.log('Service was initialized but event missed, updating state');
          setServiceInitialized(true);
          setIsLoading(false);
        }
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, serviceInitialized]);

  const initializeService = async () => {
    if (serviceInitialized || isLoading) {
      console.log('Service already initialized or initializing, skipping...');
      return;
    }
    
    try {
      setIsLoading(true);
      console.log('Initializing oxygen monitoring service...');
      
      await OxyfitService.initBleService();

      if (eventListeners.current.length === 0) {
      const listeners = [
        OxyfitService.onBleStateChanged(handleBleStateChanged),
        OxyfitService.onDeviceInfo(handleDeviceInfo),
        OxyfitService.onRealTimeParams(handleRealTimeParams), // Primary data source
        OxyfitService.onRealTimeWaveform(handleRealTimeWaveform), // Primary waveform source
        OxyfitService.onPPGData(handlePPGData),
        OxyfitService.onAccelerometerData(handleAccelerometerData),
        OxyfitService.onSettingsUpdated(handleSettingsUpdated),
        OxyfitService.onFactoryReset(handleFactoryReset),
        OxyfitService.onDeviceFound(handleDeviceFound),
        OxyfitService.onServiceInitialized(handleServiceInitialized),
        OxyfitService.onBleDeviceReady(handleBleDeviceReady),
        
        // Keep auto mode listeners as fallback but they won't be used primarily
        OxyfitService.onRealTimeParamsAuto(handleRealTimeParams),
        OxyfitService.onRealTimeWaveformAuto(handleRealTimeWaveform),
        OxyfitService.onPPGDataAuto(handlePPGData),
      ];
        eventListeners.current = listeners;
        console.log('Event listeners set up:', eventListeners.current.length);
      }
      
      console.log('Oxygen monitoring service initialization process started');
      
      setTimeout(() => {
        if (!serviceInitialized && isLoading) {
          console.log('Safety timeout: forcing service to initialized state');
          setServiceInitialized(true);
          setIsLoading(false);
        }
      }, 10000);
      
    } catch (error) {
      console.error("Failed to initialize oxygen monitoring service:", error);
      Alert.alert(
        "Initialization Error", 
        "Failed to initialize oxygen monitoring service. Please check Bluetooth permissions and try again."
      );
      setBluetoothAvailable(false);
      setIsLoading(false);
    }
  };

  const handleBleStateChanged = (payload) => {
    console.log('BLE State Changed:', payload);
    const connected = payload?.connected || false;
    setIsConnected(connected);
    
    if (connected) {
      setIsLoading(false);
      console.log('Device connected successfully, preparing for auto mode...');
      
      setTimeout(() => {
        enableAutoMode();
      }, 1500);
      
      setTimeout(() => {
        getDeviceInfo();
      }, 1000);
    } else {
      // Finalize session on disconnect
      finalizeSessionIfAny();
      
      setRealTimeData(null);
      setDeviceInfo(null);
      setOxygenReadings([]);
      setWaveformData([]);
      setIsAutoModeEnabled(false);
      setIsLoading(false);
      setBatteryLevel(0);
      setSpo2(0);
      setPulseRate(0);
      setPerfusionIndex(0);
      setDeviceState(0);
      
      console.log('Device disconnected');
    }
  };

  const handleDeviceInfo = (payload) => {
    console.log('Device Info:', payload);
    setDeviceInfo(payload);
  };

  const validateVitalData = (payload) => {
    if (!payload) return null;
    
    const validated = { ...payload };
    
    if (payload.spo2 === 255 || payload.spo2 > 100 || payload.spo2 < 0) {
      validated.spo2 = 0;
    }
    
    if (payload.pr === 65535 || payload.pr > 250 || payload.pr < 0) {
      validated.pr = 0;
    }
    
    if (payload.pi > 20 || payload.pi < 0) {
      validated.pi = 0;
    }
    
    return validated;
  };

  const handleRealTimeParams = (payload) => {
    console.log('Real-time Params (Raw):', payload);
    const validatedData = validateVitalData(payload);
    console.log('Real-time Params (Validated):', validatedData);
    
    if (validatedData) {
      updateVitalSigns(validatedData);
      processOxygenReading(validatedData);
    }
  };

  const handleRealTimeParamsAuto = (payload) => {
    console.log('Real-time Params (Auto Mode):', payload);
    updateVitalSigns(payload);
    processOxygenReading(payload);
  };

  const updateVitalSigns = (payload) => {
    if (!payload) return;
    
    const validSpo2 = (payload.spo2 > 0 && payload.spo2 <= 100) ? payload.spo2 : 0;
    const validPulseRate = (payload.pr > 0 && payload.pr <= 250) ? payload.pr : 0;
    const validPi = (payload.pi >= 0 && payload.pi <= 20) ? payload.pi : 0;
    
    if (validSpo2 > 0 || validPulseRate > 0) {
      setSpo2(validSpo2);
      setPulseRate(validPulseRate);
      setPerfusionIndex(validPi);
      setBatteryLevel(payload.battery || 0);
      setDeviceState(payload.state || 0);
      
      setRealTimeData({
        ...payload,
        spo2: validSpo2,
        pr: validPulseRate,
        pi: validPi
      });

      // Session management
      const ts = Date.now();
      if (!sessionRef.current.startTs) {
        sessionRef.current.startTs = ts;
      }
      sessionRef.current.endTs = ts;
      
      if (validSpo2 > 0) {
        sessionRef.current.spo2.push(validSpo2);
      }
      if (validPulseRate > 0) {
        sessionRef.current.pr.push(validPulseRate);
      }
      if (validPi > 0) {
        sessionRef.current.pi.push(validPi);
      }

      // Reset searching timer when we get valid data
      searchingSinceRef.current = null;
    } else {
      // Handle searching/no contact state
      const now = Date.now();
      const hasPayload = (sessionRef.current.spo2.length || sessionRef.current.pr.length);
      
      if (hasPayload) {
        if (!searchingSinceRef.current) {
          searchingSinceRef.current = now;
        } else if (now - searchingSinceRef.current >= SESSION_GAP_MS) {
          finalizeSessionIfAny();
        }
      }
    }
  };

  const processOxygenReading = (payload) => {
    const validSpo2 = (payload.spo2 > 0 && payload.spo2 <= 100);
    const validPulseRate = (payload.pr > 0 && payload.pr <= 250);
    
    if (validSpo2 && validPulseRate) {
      const newReading = {
        id: Date.now(),
        timestamp: Date.now(),
        spo2: payload.spo2,
        pr: payload.pr,
        pi: payload.pi,
        battery: payload.battery,
      };
      
      setOxygenReadings(prev => {
        const updated = [newReading, ...prev].slice(0, 50);
        return updated;
      });
    }
  };

  const handleRealTimeWaveform = (payload) => {
    if (payload.waveData && payload.waveData.length > 0) {
      setWaveformData(prev => {
        const updated = [...prev, ...payload.waveData].slice(-100);
        return updated;
      });
    }
  };

  const handleRealTimeWaveformAuto = (payload) => {
    if (payload.waveData && payload.waveData.length > 0) {
      setWaveformData(prev => {
        const updated = [...prev, ...payload.waveData].slice(-100);
        return updated;
      });
    }
  };

  const handlePPGData = (payload) => {
    console.log('PPG Data:', payload);
  };

  const handlePPGDataAuto = (payload) => {
    console.log('PPG Data (Auto):', payload);
  };

  const handleAccelerometerData = (payload) => {
    console.log('Accelerometer Data:', payload);
  };

  const handleSettingsUpdated = (payload) => {
    console.log('Settings Updated:', payload);
    
    if (payload.connected && !isConnected) {
      setIsConnected(true);
      setIsLoading(false);
      setShowDeviceModal(false);
      
      console.log('Device connected via settings update, enabling auto mode...');
      enableAutoMode();
      
      setTimeout(() => {
        getDeviceInfo();
      }, 1000);
    }
  };

  const handleFactoryReset = (payload) => {
    console.log('Factory Reset:', payload);
    if (payload.success) {
      Alert.alert('Success', 'Device factory reset completed');
    } else {
      Alert.alert('Error', 'Factory reset failed');
    }
  };

  const handleDeviceFound = (payload) => {
    console.log('Device found:', payload);
    
    const deviceName = payload.name || 'Unknown Device';
    const deviceAddress = payload.address || '';
    
    if (!deviceAddress) {
      console.log('No address found for device:', payload);
      return;
    }
    
    setDeviceList(prev => {
      const exists = prev.some(device => device.address === deviceAddress);
      if (!exists) {
        console.log('Adding new device to list:', deviceName, deviceAddress);
        return [...prev, {
          name: deviceName,
          address: deviceAddress,
          rssi: payload.rssi || 0,
          rawData: payload
        }];
      }
      return prev;
    });
  };

  const handleServiceInitialized = (payload) => {
    console.log('Service initialized received:', payload);
    
    const initialized = typeof payload === 'boolean' ? payload : payload?.initialized;
    
    console.log('Setting service initialized to:', initialized);
    setServiceInitialized(initialized);
    setIsLoading(false);
    
    if (initialized) {
      console.log('BLE service confirmed as initialized, stopping loading');
    }
  };

  const handleBleDeviceReady = (payload) => {
    console.log('BLE Device Ready:', payload);
    if (payload.connected) {
      setIsConnected(true);
      setIsLoading(false);
      setShowDeviceModal(false);
      
      console.log('Device ready, preparing for data streaming...');
      
      setTimeout(() => {
        getDeviceInfo();
      }, 1000);
    }
  };

  const scanForDevices = async () => {
    if (!serviceInitialized) {
      Alert.alert('Error', 'Service not initialized. Please wait for initialization to complete.');
      return;
    }
    
    try {
      setIsScanning(true);
      setDeviceList([]);
      console.log('Starting device scan...');
      await OxyfitService.startScan();
      
      setTimeout(() => {
        OxyfitService.stopScan();
        setIsScanning(false);
        console.log('Device scan completed');
      }, 10000);
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Scan Error', 'Failed to scan for devices. Please check Bluetooth and try again.');
      setIsScanning(false);
    }
  };

// In connectToDevice method in Oxygen.js, simplify the post-connection logic:

const connectToDevice = async (device) => {
  try {
    setIsLoading(true);
    console.log('Attempting to connect to device:', device.name, device.address);
    
    await OxyfitService.stopScan();
    setIsScanning(false);
    
    await OxyfitService.connectToDevice(device.address, device.name);
    
    console.log('Connection request sent successfully, waiting for device ready...');
    
    // Start data streaming immediately after connection
    setTimeout(() => {
      enableAutoMode(); // This will now use manual polling
    }, 1000);
    
  } catch (error) {
    console.error('Connection error:', error);
    setIsLoading(false);
    // ... error handling
  }
};

  const disconnectDevice = async () => {
    try {
      setIsLoading(true);
      await OxyfitService.disconnect();
      setIsConnected(false);
      setShowDeviceModal(false);
      setRealTimeData(null);
      setDeviceInfo(null);
      setOxygenReadings([]);
      setWaveformData([]);
      setIsAutoModeEnabled(false);
      setIsLoading(false);
      console.log('Device disconnected successfully');
    } catch (error) {
      console.error('Disconnection error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to disconnect device');
    }
  };

  const getDeviceInfo = async () => {
    try {
      await OxyfitService.getDeviceInfo();
    } catch (error) {
      console.error('Error getting device info:', error);
    }
  };

const enableAutoMode = async () => {
  if (!isConnected) {
    console.log('Cannot enable data streaming: device not connected');
    return;
  }
  
  try {
    console.log('Starting manual data streaming...');
    
    // This will now use manual polling instead of auto mode
    await OxyfitService.enableAutoMode(true, false, false, false);
    setIsAutoModeEnabled(false); // Important: set to false since we're using manual polling
    
    console.log('Manual data streaming started successfully');
    
  } catch (error) {
    console.error('Error starting data streaming:', error);
    
    // Even if there's an error, start manual polling as fallback
    console.log('Starting fallback manual polling');
    startManualPolling();
  }
};

const startManualPolling = () => {
  console.log('Starting manual data polling');
  
  if (manualPollingInterval) {
    clearInterval(manualPollingInterval);
  }
  
  const pollingInterval = setInterval(() => {
    if (isConnected) {
      OxyfitService.getRealTimeParams().catch(console.error);
      OxyfitService.getRealTimeWaveform().catch(console.error);
    } else {
      clearInterval(pollingInterval);
    }
  }, 2000);
  
  setManualPollingInterval(pollingInterval);
};

  useEffect(() => {
    if (isConnected && !isAutoModeEnabled) {
      console.log('Device connected but auto mode not enabled, enabling now...');
      const autoModeTimer = setTimeout(() => {
        enableAutoMode();
      }, 2000);
      
      return () => clearTimeout(autoModeTimer);
    }
  }, [isConnected, isAutoModeEnabled]);

  const disableAutoMode = async () => {
    try {
      await OxyfitService.disableAutoMode();
      setIsAutoModeEnabled(false);
      console.log('Auto mode disabled');
    } catch (error) {
      console.error('Error disabling auto mode:', error);
    }
  };

  const handleBack = () => {
    navigation.navigate('Home');
  };

  // Auto-start scanning when modal opens
  useEffect(() => {
    if (showDeviceModal && serviceInitialized && !isConnected) {
      const timer = setTimeout(() => {
        scanForDevices();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [showDeviceModal, serviceInitialized, isConnected]);

  // Refresh function for pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    // Reload sessions from database
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM oxygen_sessions ORDER BY id DESC',
        [],
        (_, { rows }) => {
          const existing = [];
          for (let i = 0; i < rows.length; i++) existing.push(rows.item(i));
          setSessionCards(existing);
          setRefreshing(false);
        }
      );
    });
  };

  // Get display data sorted by timestamp (newest first)
  const getDisplayData = () => {
    return [...sessionCards].sort((a, b) => {
      const dateA = new Date(a.startTs);
      const dateB = new Date(b.startTs);
      return dateB - dateA;
    });
  };

  // Prepare chart data (oldest first for chronological charts)
  const displayData = getDisplayData();
  const chartData = [...sessionCards]
    .filter(item => item.avgSpO2 != null && item.avgPR != null && !isNaN(item.avgSpO2) && !isNaN(item.avgPR))
    .sort((a, b) => {
      const dateA = new Date(a.startTs);
      const dateB = new Date(b.startTs);
      return dateA - dateB;
    });

  // Helper function to generate X labels for charts
  const generateXLabels = (data) => {
    if (!data || data.length === 0) return [];
    
    return data.map((item, index) => {
      const date = new Date(item.startTs);
      
      if (data.length <= 5) {
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
    });
  };

  const xLabels = generateXLabels(chartData);
  const hasEnoughChartData = chartData.length >= 2;

  // Render functions for the new UI
const renderDeviceHeader = () => (
  <View style={styles.deviceRow}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        style={styles.deviceImage}
        source={require('./assets/Oxyfit.jpg')} // Add your device image in assets
        resizeMode="contain"
      />
      <View>
        <Text style={styles.deviceName}>Oxyfit-WPS 0218</Text>
        <Text style={[styles.connectedText, { color: BRAND }]}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    </View>
    <View style={[styles.batteryPill, { borderColor: '#E5E7EB' }]}>
      <Text style={styles.batteryText}>{batteryLevel > 0 ? `${batteryLevel}%` : '--'}</Text>
    </View>
  </View>
);

  const renderOxygenCards = () => (
    <View style={styles.parallelCards}>
      {/* Oxygen Level card */}
      <View style={styles.smallCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Oxygen Level</Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={[styles.bigValue, { color: BRAND }]}>
            {spo2 > 0 ? spo2 : '--'}
          </Text>
          <Text style={styles.bigUnit}>%</Text>
        </View>
        <View style={styles.piRow}>
          <Text style={[styles.piText, { borderColor: '#E5E7EB' }]}>
            PI: {perfusionIndex > 0 ? `${perfusionIndex.toFixed(1)}%` : '--'}
          </Text>
        </View>
      </View>

      {/* Pulse Rate card */}
      <View style={styles.smallCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Pulse Rate</Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={[styles.bigValue, { color: BRAND }]}>
            {pulseRate > 0 ? pulseRate : '--'}
          </Text>
          <Text style={styles.bigUnit}>/min</Text>
        </View>
      </View>
    </View>
  );

  const renderSessionCard = ({ item }) => {
    const durSec = Math.max(1, Math.round((item.endTs - item.startTs) / 1000));
    return (
      <View style={styles.sessionCard}>
        <Text style={styles.sessionTitle}>Session #{item.id}</Text>
        <Text style={styles.sessionSub}>
          {new Date(item.startTs).toLocaleString()} → {new Date(item.endTs).toLocaleString()}  ({durSec}s)
        </Text>
        <View style={{ height: 8 }} />
        <View style={styles.rowWrap}>
          <Text style={[styles.badge, { color: BRAND }]}>Avg SpO₂: <Text style={styles.badgeVal}>{item.avgSpO2 ?? '--'}</Text></Text>
          <Text style={[styles.badge, { color: BRAND }]}>Min SpO₂: <Text style={styles.badgeVal}>{item.minSpO2 ?? '--'}</Text></Text>
          <Text style={[styles.badge, { color: BRAND }]}>Max SpO₂: <Text style={styles.badgeVal}>{item.maxSpO2 ?? '--'}</Text></Text>
        </View>
        <View style={[styles.rowWrap, { marginTop: 4 }]}>
          <Text style={[styles.badge, { color: BRAND }]}>Avg PR: <Text style={styles.badgeVal}>{item.avgPR ?? '--'}</Text></Text>
          <Text style={[styles.badge, { color: BRAND }]}>Min PR: <Text style={styles.badgeVal}>{item.minPR ?? '--'}</Text></Text>
          <Text style={[styles.badge, { color: BRAND }]}>Max PR: <Text style={styles.badgeVal}>{item.maxPR ?? '--'}</Text></Text>
        </View>
        <Text style={styles.sessionSub}>Readings: <Text style={styles.badgeVal}>{item.readingsCount}</Text></Text>
      </View>
    );
  };

  const renderListContent = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[BRAND]}
        />
      }>
      
      {sessionCards.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>
            All Sessions ({sessionCards.length})
          </Text>
        </View>
      )}

      {sessionCards.length === 0 ? (
        <View style={{padding: 20, alignItems: 'center'}}>
          <Text style={{color: '#666'}}>No oxygen readings yet.</Text>
        </View>
      ) : (
        <>
          {displayData.map(item => (
            <View key={item.id}>
              {renderSessionCard({ item })}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );

  const renderGraphContent = () => (
    <ScrollView
      contentContainerStyle={styles.graphScrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[BRAND]}
        />
      }>
      
      <View style={styles.graphCard}>
        <View style={styles.graphHeader}>
          <View style={[styles.iconCircle, {backgroundColor: BRAND}]}>
            <Text style={styles.iconText}>O₂</Text>
          </View>
          <Text style={styles.graphTitleBlue}>OXYGEN LEVEL</Text>
          <View style={{flex: 1}} />
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={{flex: 1}}>
            <Text style={styles.smallMuted}>Latest</Text>
            <Text style={styles.smallMuted}>
              {displayData[0] ? new Date(displayData[0].startTs).toLocaleTimeString() : '--'}
            </Text>
            <Text style={styles.goalText}>
              Your goal: 95% or higher
            </Text>
          </View>
          <Text style={styles.bigReading}>
            {displayData[0] ? `${displayData[0].avgSpO2}` : '--'}{' '}
            <Text style={styles.percent}>%</Text>
          </Text>
        </View>

        {hasEnoughChartData ? (
          <LineChart
            data={{
              labels: xLabels,
              datasets: [
                {
                  data: chartData.map(d => d.avgSpO2),
                },
              ],
            }}
            width={screenWidth - 40}
            height={220}
            yAxisSuffix="%"
            yAxisInterval={1}
            fromZero={false}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => BRAND,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: BRAND,
              },
            }}
            bezier
            style={{ borderRadius: 16, marginVertical: 8 }}
          />
        ) : (
          <View style={styles.noChartData}>
            <Text style={styles.noChartDataText}>
              {chartData.length === 0 ? "No data" : "Need 2+ readings for chart"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.graphCard}>
        <View style={styles.graphHeader}>
          <View style={[styles.iconCircle, {backgroundColor: '#cfecc5'}]}>
            <Text style={[styles.iconText, {color: '#59b54b'}]}>♥</Text>
          </View>
          <Text style={styles.graphTitleBlue}>PULSE RATE</Text>
          <View style={{flex: 1}} />
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={{flex: 1}}>
            <Text style={styles.smallMuted}>Latest</Text>
            <Text style={styles.smallMuted}>
              {displayData[0] ? new Date(displayData[0].startTs).toLocaleTimeString() : '--'}
            </Text>
            <Text style={styles.goalText}>Your goal: 60-100 bpm</Text>
          </View>
          <Text style={styles.bigReadingRight}>
            {displayData[0] ? `${displayData[0].avgPR}` : '--'}{' '}
            <Text style={styles.bpm}>bpm</Text>
          </Text>
        </View>

        {hasEnoughChartData ? (
          <LineChart
            data={{
              labels: xLabels,
              datasets: [
                {
                  data: chartData.map(d => d.avgPR),
                },
              ],
            }}
            width={screenWidth - 40}
            height={220}
            yAxisSuffix=" bpm"
            yAxisInterval={1}
            fromZero={false}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => BRAND,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: BRAND,
              },
            }}
            bezier
            style={{ borderRadius: 16, marginVertical: 8 }}
          />
        ) : (
          <View style={styles.noChartData}>
            <Text style={styles.noChartDataText}>
              {chartData.length === 0 ? "No data" : "Need 2+ readings for chart"}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderDeviceModal = () => (
    <Modal 
      visible={showDeviceModal} 
      transparent 
      animationType="slide"
      onRequestClose={() => setShowDeviceModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Connect to Oxygen Monitor</Text>
          
          {isLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={styles.modalText}>Connecting...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.modalText}>
                {isConnected
                  ? `Connected to Oxyfit-WPS 0218`
                  : isScanning
                  ? 'Scanning for devices...'
                  : 'Select a device to connect'}
              </Text>

              {!isConnected && (
                <>
                  <ScrollView style={styles.deviceList}>
                    {deviceList.length === 0 ? (
                      <Text style={styles.noDevicesText}>
                        {isScanning ? 'Scanning for devices...' : 'No devices found. Tap "Scan" to search.'}
                      </Text>
                    ) : (
                      deviceList.map((device, index) => (
                        <TouchableOpacity 
                          key={device.address || index}
                          style={styles.deviceItem}
                          onPress={() => connectToDevice(device)}
                          disabled={isLoading}
                        >
                          <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                          <Text style={styles.deviceAddress}>{device.address}</Text>
                          <Text style={styles.deviceRssi}>RSSI: {device.rssi}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>

                  {!isScanning ? (
                    <TouchableOpacity 
                      style={styles.scanButton} 
                      onPress={scanForDevices}
                      disabled={isLoading}
                    >
                      <Text style={styles.scanButtonText}>Scan for Devices</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={styles.cancelButton} 
                      onPress={() => {
                        OxyfitService.stopScan();
                        setIsScanning(false);
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Stop Scanning</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => {
                  setShowDeviceModal(false);
                  if (isScanning) {
                    OxyfitService.stopScan();
                    setIsScanning(false);
                  }
                }}
                disabled={isLoading}
              >
                <Text style={styles.cancelButtonText}>
                  {isConnected ? 'Close' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderContent = () => {
    if (!serviceInitialized || !bluetoothAvailable) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={styles.loadingText}>
            {!bluetoothAvailable 
              ? 'Bluetooth unavailable. Please enable Bluetooth.' 
              : 'Initializing oxygen monitoring service...'}
          </Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {isConnected ? (
          <>
            {renderDeviceHeader()}
            {renderOxygenCards()}
            
            {/* Tab Container */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'LIST' && styles.activeTab]}
                onPress={() => setActiveTab('LIST')}>
                <Text style={[styles.tabText, activeTab === 'LIST' && styles.activeTabText]}>
                  LIST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'GRAPH' && styles.activeTab]}
                onPress={() => setActiveTab('GRAPH')}>
                <Text style={[styles.tabText, activeTab === 'GRAPH' && styles.activeTabText]}>
                  GRAPH
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content based on active tab */}
            {activeTab === 'LIST' ? renderListContent() : renderGraphContent()}
          </>
        ) : (
          <>
            <View style={styles.disconnectedContainer}>
              <Text style={styles.disconnectedText}>Device Disconnected</Text>
              <TouchableOpacity 
                style={styles.connectButton} 
                onPress={() => setShowDeviceModal(true)}
              >
                <Text style={styles.connectButtonText}>Connect Device</Text>
              </TouchableOpacity>
            </View>

            {/* Tab Container for Disconnected State */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'LIST' && styles.activeTab]}
                onPress={() => setActiveTab('LIST')}>
                <Text style={[styles.tabText, activeTab === 'LIST' && styles.activeTabText]}>
                  LIST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'GRAPH' && styles.activeTab]}
                onPress={() => setActiveTab('GRAPH')}>
                <Text style={[styles.tabText, activeTab === 'GRAPH' && styles.activeTabText]}>
                  GRAPH
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content based on active tab */}
            {activeTab === 'LIST' ? renderListContent() : renderGraphContent()}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: BRAND }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Image
              style={styles.backIcon}
              source={require('./assets/icon_back.png')}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Oxygen</Text>
        </View>
      </SafeAreaView>

      {/* Main Content */}
      {renderContent()}

      {/* Device Connection Modal */}
      {renderDeviceModal()}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={styles.loadingText}>
            {isConnected ? 'Measuring...' : serviceInitialized ? 'Connecting...' : 'Initializing...'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  
  // Header styles
  header: {
    width: '100%',
    height: screenHeight * 0.08,
    backgroundColor: BRAND,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  backIcon: {
    width: screenWidth * 0.06,
    height: screenWidth * 0.06,
    resizeMode: 'contain',
    tintColor: '#fff',
  },
  headerTitle: {
    color: 'white',
    fontSize: screenWidth * 0.05,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: screenWidth * 0.08,
  },

  // Center container
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // Disconnected state
  disconnectedContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  disconnectedText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  connectButton: {
    backgroundColor: BRAND,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Device row
  deviceRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    margin: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  deviceImage: {
    width: 42,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    marginRight: 10,
  },
  deviceName: { color: '#111827', fontSize: 16, fontWeight: '700' },
  connectedText: { fontSize: 12, marginTop: 2 },
  batteryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1
  },
  batteryText: { color: '#374151', fontWeight: '700' },

  // Parallel cards container
  parallelCards: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 12,
    paddingHorizontal: 12
  },

  // Small cards for Oxygen Level and Pulse Rate
  smallCard: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    width: '48%',
    alignItems: 'center'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  cardTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center'
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 6
  },
  bigValue: { fontSize: 34, fontWeight: '900' },
  bigUnit: { color: '#6B7280', fontSize: 18, marginLeft: 4, marginBottom: 2 },
  piRow: { marginTop: 4 },
  piText: {
    color: '#374151',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12
  },

  // Tab Container
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: BRAND,
    paddingVertical: screenHeight * 0.01,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#fff',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },

  // Scroll views
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 10,
  },
  graphScrollContent: {
    padding: 10,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#f8f9fa',
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: BRAND,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },

  // Session cards
  sessionCard: { 
    marginTop: 12, 
    borderRadius: 12, 
    padding: 12, 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    marginHorizontal: 12
  },
  sessionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sessionSub: { color: '#6B7280', marginTop: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  badge: { marginRight: 12 },
  badgeVal: { color: '#111827' },

  // Graph styles
  graphCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  graphTitleBlue: {
    color: '#2c80ff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  smallMuted: {
    color: '#666',
    fontSize: 12,
  },
  goalText: {
    color: '#2c80ff',
    fontSize: 12,
    marginTop: 4,
  },
  bigReading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  bigReadingRight: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
  },
  percent: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#666',
  },
  bpm: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#666',
  },
  noChartData: {
    height: screenHeight * 0.22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noChartDataText: {
    color: '#7a7a7a',
    fontSize: 12,
  },

  // Modal Styles
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
    maxHeight: '80%',
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
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scanButton: {
    backgroundColor: BRAND,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    width: '100%',
    maxHeight: 200,
    marginBottom: 15,
  },
  noDevicesText: {
    textAlign: 'center',
    color: '#666',
    padding: 20,
  },
  deviceItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancelButton: {
    padding: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },

  // Loading Overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
});