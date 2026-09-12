import { DEV_DATA_BASE } from './apiConfig';
// BloodPressure.js
import React, {useState, useMemo, useEffect, useRef} from 'react';
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
  Platform,
  RefreshControl,
} from 'react-native';
import Svg, {
  Polyline,
  Line as SvgLine,
  Circle,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import globalStyles from './globalStyles';
import Bp2Module from './bridging/Bp2Module';
import axios from 'axios';
import { enqueueReading, drainOutbox } from './bpOutbox';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// API Configuration - Same as iOS
const API_BASE_URL = DEV_DATA_BASE;
const DEV_TYPE = 'bp';

// Configure axios to include credentials
axios.defaults.withCredentials = true;

// Function to store device data - Same as iOS
// BP readings are now delivered through the durable outbox (bpOutbox.js): a reading is persisted
// to SQLite at capture and retried until a confirmed server success, so a failed/offline POST no
// longer loses the reading (the previous fire-and-forget storeDeviceData threw after 3 in-memory
// retries and the reading was dropped). See storeMeasurementData below.

// Function to fetch historical data - Same as iOS
const fetchHistoricalData = async (days = 7) => {
  try {
    console.log(`📥 Fetching historical BP data for last ${days} days`);
    const response = await axios.get(
      `${API_BASE_URL}/devices/getUserReadingData?deviceType=bp&days=${days}`,
      { withCredentials: true }
    );
    if (response.data.success) {
      console.log(`✅ Loaded ${response.data.data.records.length} historical records`);
      return response.data.data.records;
    }
    return [];
  } catch (error) {
    console.error('❌ Error fetching historical data:', error);
    throw error;
  }
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const getMarkerLeftPercent = systolic => {
  const min = 90;
  const max = 180;
  const v = clamp(systolic, min, max);
  return ((v - min) / (max - min)) * 100;
};

// Enhanced BPChart component with dynamic X labels
function BPChart({width, data, xLabels}) {
  const padding = {left: 10, right: 48, top: 18, bottom: 26};
  const w = width - 2;
  const h = SCREEN_HEIGHT * 0.22;
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const Y_MIN = 60;
  const Y_MAX = 160;
  const bracketLabels = [160, 135, 110, 85, 60];

  if (!data || data.length < 2) {
    return (
      <Svg width={w} height={h}>
        <Rect x="0" y="0" width={w} height={h} fill="#ffffff" rx="6" />
        <SvgText
          x={w / 2}
          y={h / 2}
          fontSize="12"
          fill="#7a7a7a"
          textAnchor="middle">
          Not enough data to show chart
        </SvgText>
      </Svg>
    );
  }

  const xFor = i => padding.left + (chartW / (data.length - 1)) * i;
  const yFor = val => padding.top + (Y_MAX - val) * (chartH / (Y_MAX - Y_MIN));

  const sysPoints = data.map((d, i) => `${xFor(i)},${yFor(d.systolic)}`).join(' ');
  const diaPoints = data.map((d, i) => `${xFor(i)},${yFor(d.diastolic)}`).join(' ');

  const diaAreaPoints = useMemo(() => {
    const topLine = data.map((d, i) => `${xFor(i)},${yFor(d.diastolic)}`).join(' ');
    const bottomRight = `${padding.left + chartW},${padding.top + chartH}`;
    const bottomLeft = `${padding.left},${padding.top + chartH}`;
    return `${topLine} ${bottomRight} ${bottomLeft}`;
  }, [chartW, chartH, data]);

  const todayX = xFor(data.length - 1);
  const todaySysY = yFor(data[data.length - 1].systolic);
  const todayDiaY = yFor(data[data.length - 1].diastolic);

  return (
    <Svg width={w} height={h}>
      <Rect x="0" y="0" width={w} height={h} fill="#ffffff" rx="6" />

      {[0.25, 0.5, 0.75].map(p => (
        <SvgLine
          key={`grid-${p}`}
          x1={padding.left}
          x2={padding.left + chartW}
          y1={padding.top + chartH * p}
          y2={padding.top + chartH * p}
          stroke="#e9ecef"
          strokeWidth="1"
        />
      ))}

      <SvgLine
        x1={padding.left}
        x2={padding.left + chartW}
        y1={yFor(120)}
        y2={yFor(120)}
        stroke="#7acb6a"
        strokeWidth="1.5"
      />
      <SvgLine
        x1={padding.left}
        x2={padding.left + chartW}
        y1={yFor(80)}
        y2={yFor(80)}
        stroke="#7acb6a"
        strokeWidth="1.5"
      />

      <Polygon points={diaAreaPoints} fill="#dfe4ea" opacity="0.5" />
      <Polyline points={diaPoints} fill="none" stroke="#7f8c8d" strokeWidth="1.5" />
      <Polyline points={sysPoints} fill="none" stroke="#4a4a4a" strokeWidth="1.5" />

      {data.map((d, i) => (
        <Circle
          key={`sys-dot-${i}`}
          cx={xFor(i)}
          cy={yFor(d.systolic)}
          r="4"
          fill="#ffffff"
          stroke="#4a4a4a"
          strokeWidth="1.5"
        />
      ))}

      {data.map((d, i) => {
        const cx = xFor(i);
        const cy = yFor(d.diastolic);
        const size = 6;
        const points = `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`;
        return (
          <Polygon key={`dia-tri-${i}`} points={points} fill="#4a4a4a" opacity="0.8" />
        );
      })}

      <SvgLine
        x1={padding.left + chartW + 10}
        x2={padding.left + chartW + 10}
        y1={padding.top}
        y2={padding.top + chartH}
        stroke="#7aa9c9"
        strokeWidth="2"
      />
      <Circle
        cx={padding.left + chartW + 10}
        cy={todaySysY}
        r="6"
        stroke="#0d6ea5"
        strokeWidth="2"
        fill="#ffffff"
      />
      <Polygon
        points={`${padding.left + chartW + 10},${todayDiaY - 6} ${padding.left + chartW + 4},${todayDiaY + 6} ${padding.left + chartW + 16},${todayDiaY + 6}`}
        fill="#0d6ea5"
      />

      {bracketLabels.map(val => (
        <React.Fragment key={`br-${val}`}>
          <SvgLine
            x1={padding.left + chartW + 6}
            x2={padding.left + chartW + 14}
            y1={yFor(val)}
            y2={yFor(val)}
            stroke="#7aa9c9"
            strokeWidth="2"
          />
          <SvgText
            x={padding.left + chartW + 18}
            y={yFor(val) + 4}
            fill="#7a7a7a"
            fontSize="10">
            {val}
          </SvgText>
        </React.Fragment>
      ))}

      <SvgLine
        x1={todayX}
        x2={todayX}
        y1={padding.top}
        y2={padding.top + chartH}
        stroke="#9ec6dd"
        strokeWidth="2"
      />

      {xLabels.map((lab, i) => (
        <SvgText
          key={`x-${lab}-${i}`}
          x={xFor(i)}
          y={padding.top + chartH + 18}
          fontSize="10"
          fill="#7a7a7a"
          textAnchor="middle">
          {lab}
        </SvgText>
      ))}
    </Svg>
  );
}

// Enhanced BPMChart component with dynamic X labels
function BPMChart({width, data, xLabels}) {
  const padding = {left: 10, right: 48, top: 18, bottom: 26};
  const w = width - 2;
  const h = SCREEN_HEIGHT * 0.22;
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const bpmVals = (data ?? []).map(d => Number(d.bpm)).filter(v => Number.isFinite(v));
  const rawMin = bpmVals.length ? Math.min(...bpmVals) : 50;
  const rawMax = bpmVals.length ? Math.max(...bpmVals) : 90;

  let Y_MIN = Math.max(40, Math.floor((rawMin - 5) / 5) * 5);
  let Y_MAX = Math.min(140, Math.ceil((rawMax + 5) / 5) * 5);
  if (Y_MAX - Y_MIN < 20) { Y_MIN = Math.max(40, Y_MIN - 5); Y_MAX = Math.min(140, Y_MAX + 5); }

  const bracketLabels = [];
  for (let v = Math.ceil(Y_MAX / 10) * 10; v >= Y_MIN; v -= 10) {
    bracketLabels.push(v);
  }

  if (!data || data.length < 2) {
    return (
      <Svg width={w} height={h}>
        <Rect x="0" y="0" width={w} height={h} fill="#ffffff" rx="6" />
        <SvgText
          x={w / 2}
          y={h / 2}
          fontSize="12"
          fill="#7a7a7a"
          textAnchor="middle">
          Not enough data to show chart
        </SvgText>
      </Svg>
    );
  }

  const xFor = i => padding.left + (chartW / (data.length - 1)) * i;
  const yFor = val => padding.top + (Y_MAX - Number(val)) * (chartH / (Y_MAX - Y_MIN));

  const bpmPoints = data.map((d, i) => `${xFor(i)},${yFor(d.bpm)}`).join(' ');
  const todayX = xFor(data.length - 1);
  const todayY = yFor(data[data.length - 1].bpm);

  return (
    <Svg width={w} height={h}>
      <Rect x="0" y="0" width={w} height={h} fill="#ffffff" rx="6" />

      {[0.25, 0.5, 0.75].map(p => (
        <SvgLine
          key={`grid-bpm-${p}`}
          x1={padding.left}
          x2={padding.left + chartW}
          y1={padding.top + chartH * p}
          y2={padding.top + chartH * p}
          stroke="#e9ecef"
          strokeWidth="1"
        />
      ))}

      {72 >= Y_MIN && 72 <= Y_MAX && (
        <SvgLine
          x1={padding.left}
          x2={padding.left + chartW}
          y1={yFor(72)}
          y2={yFor(72)}
          stroke="#7acb6a"
          strokeWidth="1.5"
        />
      )}

      <Polyline points={bpmPoints} fill="none" stroke="#4a4a4a" strokeWidth="1.5" />

      {data.map((d, i) => (
        <Circle
          key={`bpm-dot-${i}`}
          cx={xFor(i)}
          cy={yFor(d.bpm)}
          r="4"
          fill="#ffffff"
          stroke="#4a4a4a"
          strokeWidth="1.5"
        />
      ))}

      <SvgLine
        x1={padding.left + chartW + 10}
        x2={padding.left + chartW + 10}
        y1={padding.top}
        y2={padding.top + chartH}
        stroke="#7aa9c9"
        strokeWidth="2"
      />
      <Circle
        cx={padding.left + chartW + 10}
        cy={todayY}
        r="6"
        stroke="#0d6ea5"
        strokeWidth="2"
        fill="#ffffff"
      />

      {bracketLabels.map(val => (
        <React.Fragment key={`bpm-br-${val}`}>
          <SvgLine
            x1={padding.left + chartW + 6}
            x2={padding.left + chartW + 14}
            y1={yFor(val)}
            y2={yFor(val)}
            stroke="#7aa9c9"
            strokeWidth="2"
          />
          <SvgText
            x={padding.left + chartW + 18}
            y={yFor(val) + 4}
            fill="#7a7a7a"
            fontSize="10">
            {val}
          </SvgText>
        </React.Fragment>
      ))}

      <SvgLine
        x1={todayX}
        x2={todayX}
        y1={padding.top}
        y2={padding.top + chartH}
        stroke="#9ec6dd"
        strokeWidth="2"
      />

      {xLabels.map((lab, i) => (
        <SvgText
          key={`x-bpm-${lab}-${i}`}
          x={xFor(i)}
          y={padding.top + chartH + 18}
          fontSize="10"
          fill="#7a7a7a"
          textAnchor="middle">
          {lab}
        </SvgText>
      ))}
    </Svg>
  );
}

export default function BloodPressure({navigation}) {
  const [activeTab, setActiveTab] = useState('LIST');

  // connection & device state
  const [isConnected, setIsConnected] = useState(false);
  const [deviceModel, setDeviceModel] = useState(-1);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [realTimeData, setRealTimeData] = useState(null);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [bluetoothAvailable, setBluetoothAvailable] = useState(false);

  // NEW: API State Management (from iOS)
  const [historicalData, setHistoricalData] = useState([]);
  const [filterDays, setFilterDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);

  // dynamic list of BP readings (most recent first)
  const [bloodPressureData, setBloodPressureData] = useState([]);
  const [deviceList, setDeviceList] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showConnectButton, setShowConnectButton] = useState(false);
  // Add this with your other useRef declarations at the top of the component
const measurementProcessedRef = useRef(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimeoutRef = useRef(null);
  const measurementTimeoutRef = useRef(null);
  const eventListeners = useRef([]);
  const connectedDeviceRef = useRef({
    name: null,
    id: null,
    batteryLevel: null
  });

  // Toast Management - Same as iOS
  const showToastMessage = (message, duration = 2000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    setShowToast(true);
    toastTimeoutRef.current = setTimeout(() => setShowToast(false), duration);
  };

  // Data Storage - Same as iOS
  const storeMeasurementData = async (reading) => {
    try {
      const currentDevice = connectedDeviceRef.current;
      const now = new Date();

      // Persist to the durable outbox at capture. timestamp + measuredAt are both baked here
      // (capture time) so a reading delivered later still dates to when it was measured, not
      // received — the measured_at fix. The outbox retries until a confirmed server success.
      const rec = {
        devId: currentDevice?.id || 'bp_device_001',
        devName: currentDevice?.name || 'Blood Pressure Monitor',
        systolic: reading.systolic,
        diastolic: reading.diastolic,
        pulse: reading.bpm,
        mean: reading.mean,
        timestamp: now.toISOString(), // dedup key (server keys on user+devType+timestamp)
        measuredAt: Math.floor(now.getTime() / 1000), // epoch s — measurement time
        date: reading.date,
        time: reading.time,
        deviceInfo: {
          name: currentDevice?.name || 'Blood Pressure Monitor',
          id: currentDevice?.id || 'unknown_device_id',
          batteryLevel: currentDevice?.batteryLevel,
          type: 'viatom',
        },
      };

      await enqueueReading(rec); // durable — survives a failed/offline POST, no data loss
      drainOutbox(); // deliver now if online; the row stays until a confirmed success
      loadHistoricalData(filterDays);
    } catch (error) {
      // Reaching here means the SQLite enqueue itself failed (rare) — that's the only path that
      // could lose a reading now, so surface it. A network failure does NOT reach here: the
      // reading is safely queued and retried, no alarming prompt needed.
      console.error('❌ Failed to queue BP reading:', error);
      Alert.alert(
        'Could not save reading',
        'This reading could not be saved to the device. Please try measuring again.',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
    }
  };

  // Historical Data Management - Same as iOS
  const loadHistoricalData = async (days = 7) => {
    try {
      setIsLoading(true);
      const data = await fetchHistoricalData(days);
      const formattedData = data.map(item => ({
        id: item.id,
        date: new Date(item.createdAt).toLocaleDateString(),
        time: new Date(item.createdAt).toLocaleTimeString(),
        systolic: item.data.systolic,
        diastolic: item.data.diastolic,
        bpm: item.data.pulse,
        mean: item.data.mean,
        timestamp: item.createdAt
      }));
      
      // Sort by timestamp in descending order (newest first) when loading
      const sortedData = formattedData.sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB - dateA; // Descending order (newest first)
      });
      
      setHistoricalData(sortedData);
      setFilterDays(days);
    } catch (error) {
      console.error('Error loading historical data:', error);
      showToastMessage('Failed to load historical data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistoricalData(filterDays);
  };

  const generateXLabels = (data) => {
    if (!data || data.length === 0) return ['No Data'];
    const dates = data.map(item => {
      const date = new Date(item.timestamp || item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const uniqueDates = [...new Set(dates)].slice(-7);
    return uniqueDates;
  };

  const getDisplayData = () => {
    return [...historicalData].sort((a, b) => {
      const dateA = new Date(a.timestamp || a.date);
      const dateB = new Date(b.timestamp || b.date);
      return dateB - dateA;
    });
  };

  // Data Processing for Charts
  const displayData = getDisplayData();
  const chartData = [...historicalData].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.date);
    const dateB = new Date(b.timestamp || b.date);
    return dateA - dateB;
  });
  const xLabels = generateXLabels(chartData);

  useEffect(() => {
    checkBluetoothAvailability();
    loadHistoricalData(7); // Load historical data on component mount
  }, []);

  // Drain any queued BP readings on mount and whenever this screen regains focus — so a reading
  // captured while offline is delivered as soon as connectivity returns and the user comes back.
  useEffect(() => {
    drainOutbox();
    const unsub = navigation?.addListener?.('focus', () => {
      drainOutbox();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [navigation]);

  const checkBluetoothAvailability = async () => {
    try {
      const available = await Bp2Module.isBluetoothAvailable();
      setBluetoothAvailable(available);

      if (!available) {
        Alert.alert(
          'Bluetooth Unavailable',
          'Please enable Bluetooth to use blood pressure monitoring features.',
          [{text: 'OK'}],
        );
      }
    } catch (error) {
      setBluetoothAvailable(false);
    }
  };

  useEffect(() => {
    if (!bluetoothAvailable) return;

    const initializeService = async () => {
      try {
        await Bp2Module.initService();

        // Attach listeners (store them so we can remove on cleanup)
        const listeners = [
          Bp2Module.addListener(Bp2Module.EVENTS.ON_BP2_INFO, handleDeviceInfo),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_BP2_RT_DATA,
            handleRealTimeData,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_BP2_FILE_LIST,
            handleFileList,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_BP2_READING_PROGRESS,
            handleReadingProgress,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_BP2_READ_FILE_COMPLETE,
            handleReadFileComplete,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_DEVICE_CONNECTED,
            handleDeviceConnected,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_DEVICE_FOUND,
            handleDeviceFound,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_SCAN_STATUS_CHANGED,
            handleScanStatusChanged,
          ),
          Bp2Module.addListener(
            Bp2Module.EVENTS.ON_CONNECTION_STATUS_CHANGED,
            handleConnectionStatusChanged,
          ),
          Bp2Module.addListener(Bp2Module.EVENTS.ON_BP2_CONFIG, handleConfig),
        ];

        eventListeners.current = listeners;
      } catch (error) {
        Alert.alert('Error', 'Failed to initialize blood pressure service');
      }
    };

    initializeService();

    return () => {
      // cleanup listeners & disconnect
      eventListeners.current.forEach(listener => {
        try {
          listener.remove();
        } catch (e) {
          // ignore
        }
      });
      eventListeners.current = [];

      try {
        Bp2Module.disconnect();
      } catch (err) {
        // ignore
      }
    };
  }, [bluetoothAvailable]);

  /* ---------------------------
     Event handlers (incoming)
     --------------------------- */

  const handleDeviceInfo = payload => {
    setDeviceInfo(payload);
  };

  const handleRealTimeData = (payload) => {
  console.log('📡 Real-time data:', JSON.stringify(payload, null, 2));
  setRealTimeData(payload);

  try {
    if (!payload || typeof payload !== 'object') return;

    const paramDataType = payload.paramDataType;
    const bpData = payload.bpData;
    const status = payload.status || {};

    // 🔋 Battery monitoring
    if (status.percent !== undefined) {
      setBatteryLevel(status.percent);
      if (connectedDeviceRef.current) {
        connectedDeviceRef.current.batteryLevel = status.percent;
      }
      if (status.percent <= 20) {
        showToastMessage(`Low Battery: ${status.percent}%`, 3000);
      }
    }

    // 🩺 Measurement status
    const deviceStatus = status.deviceStatus;
    if (deviceStatus !== undefined) {
      if (deviceStatus === 4) {
        // BP Measuring - reset flags when new measurement starts
        if (!isMeasuring) {
          console.log("🩺 BP measurement started (auto-detected)");
          setIsMeasuring(true);
          measurementProcessedRef.current = false; // Reset the processed flag
        }
      } else if (deviceStatus === 5) {
        // BP Measure End
        console.log("✅ BP measurement ended");
        // Don't set isMeasuring to false here - wait for the final reading
      }
    }

    // ✅ Final BP result - Store to backend ONLY ONCE
    if (paramDataType === 1 && bpData) {
      const sys = bpData.sys ?? 0;
      const dia = bpData.dia ?? 0;
      const pr = bpData.pr ?? 0;
      const result = bpData.result ?? 0;

      if (sys === 0 && dia === 0) return;

      // ⚠️ FIX: Check if we've already processed this final reading
      if (measurementProcessedRef.current) {
        console.log('🔄 Skipping duplicate final reading - already processed');
        return;
      }

      // Mark as processed immediately to prevent duplicates
      measurementProcessedRef.current = true;

      const now = new Date();
      const newReading = {
        id: Date.now(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        systolic: sys,
        diastolic: dia,
        bpm: pr,
        mean: Math.round((sys + 2 * dia) / 3), // Calculate mean pressure
        timestamp: now.toISOString(),
        deviceName: connectedDeviceRef.current?.name,
        deviceId: connectedDeviceRef.current?.id
      };

      console.log('💾 Storing final reading to backend:', newReading);

      // Store to backend API
      storeMeasurementData(newReading);
      
      // Also update local state for immediate UI update
      // setBloodPressureData((prev) => [newReading, ...prev].slice(0, 7));
      
      // Set measuring to false only after processing the final reading
      setIsMeasuring(false);

      let msg = `${sys}/${dia} mmHg, Pulse ${pr} BPM`;
      if (result === 1) msg += ' - High';
      else if (result === 0) msg += ' - Normal';
      showToastMessage(`✅ Measurement Complete: ${msg}`, 4000);
    }
  } catch (e) {
    console.error('Error processing real-time data:', e);
    setIsMeasuring(false);
    measurementProcessedRef.current = false; // Reset on error
  }
};

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (measurementTimeoutRef.current) {
        clearTimeout(measurementTimeoutRef.current);
      }
    };
  }, []);

  const handleFileList = (payload) => {
    setIsLoading(false);
    
    const fileNames = payload?.fileNames;
    if (fileNames && fileNames.length > 0) {
        console.log('Files found:', fileNames);
        
        Alert.alert(
            'Files Found', 
            `Found ${fileNames.length} file(s) on device. Would you like to download them?`,
            [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Download All', onPress: () => downloadAllFiles(fileNames)}
            ]
        );
    } else {
        Alert.alert('No Files', 'No historical data files found on the device');
    }
  };

  const downloadAllFiles = async (fileNames) => {
    try {
        setIsLoading(true);
        for (const fileName of fileNames) {
            try {
                await Bp2Module.readFile(fileName);
            } catch (error) {
                console.error(`Error reading file ${fileName}:`, error);
            }
        }
    } catch (error) {
        console.error('Error downloading files:', error);
        Alert.alert('Error', 'Failed to download files: ' + error.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleReadingProgress = payload => {
    // payload.progress etc. you can show a progress bar if needed
  };

  const handleReadFileComplete = payload => {
    // Received file content from device
  };

  const handleDeviceConnected = async (payload) => {
    try {
      const model = payload?.model ?? -1;
      const connected = payload?.connected ?? true;
      setDeviceModel(model);
      setIsConnected(Boolean(connected));

      if (connected) {
        try { await Bp2Module.stopScan(); } catch {}
        setScanning(false);
        setDeviceList([]);
        setShowDeviceModal(false);
        setIsLoading(false);

        // Update connected device reference
        const deviceInfo = {
          name: payload.name || 'BP Device',
          id: payload.address || 'unknown',
          batteryLevel: batteryLevel
        };
        connectedDeviceRef.current = deviceInfo;

        try {
          Bp2Module.getInfo();
          await Bp2Module.startRealTime();
          console.log("✅ Auto realtime stream started after connection");
        } catch (e) {
          console.warn("Failed to start realtime automatically:", e);
        }
      }
    } catch (e) {
      console.warn('handleDeviceConnected parse error', e);
      setIsLoading(false);
    }
  };

  const handleDeviceFound = payload => {
    try {
      const device = payload;
      setDeviceList(prev => {
        const exists = prev.some(
          d =>
            (d.address && device.address && d.address === device.address) ||
            (d.name && device.name && d.name === device.name),
        );
        if (exists) return prev;
        return [...prev, device];
      });
    } catch (e) {
      console.warn('handleDeviceFound parse error', e);
    }
  };

  const handleScanStatusChanged = payload => {
    const scanningFlag = payload?.scanning ?? payload?.isScanning ?? null;
    if (scanningFlag !== null) setScanning(Boolean(scanningFlag));
  };

  const handleConnectionStatusChanged = payload => {
    const connected = payload?.connected ?? null;
    if (connected !== null) {
      setIsConnected(Boolean(connected));
      if (!connected) {
        setDeviceModel(-1);
        setRealTimeData(null);
        connectedDeviceRef.current = { name: null, id: null, batteryLevel: null };
      }
    }
  };

  const handleConfig = payload => {
    // config result
  };

  /* ---------------------------
     Actions (outgoing to native)
     --------------------------- */

  const connectToDevice = async (device = null) => {
    if (!bluetoothAvailable) {
      Alert.alert('Bluetooth Unavailable', 'Please enable Bluetooth first');
      return;
    }

    try {
      setIsLoading(true);

      try {
        await Bp2Module.stopScan();
        setScanning(false);
      } catch (stopError) {
        console.warn('Failed to stop previous scan:', stopError);
      }

      if (!device || !device.address) {
        setDeviceList([]);
        await Bp2Module.startScan();
        setScanning(true);
        setIsLoading(false);
        return;
      }

      setDeviceList([]);
      setSelectedDevice(device);

      try {
        await Bp2Module.connect(
          device.name || 'BP Device',
          device.address,
          device.model,
        );
        setIsLoading(false);
      } catch (connectError) {
        console.error('Connection failed:', connectError);
        Alert.alert(
          'Connection Failed',
          `Could not connect to ${
            device.name || 'device'
          }. Please make sure the device is in pairing mode and try again.`,
          [{text: 'OK'}],
        );
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Connection process error:', error);
      Alert.alert(
        'Connection Error',
        'Failed to start device connection process. Please try again.',
        [{text: 'OK'}],
      );
      setScanning(false);
      setIsLoading(false);
    }
  };

  const disconnectDevice = async () => {
    try {
        await Bp2Module.disconnect();
        setIsConnected(false);
        setRealTimeData(null);
        connectedDeviceRef.current = { name: null, id: null, batteryLevel: null };
    } catch (error) {
        Alert.alert('Error', 'Failed to disconnect device');
    }
  };

  const getHistoricalData = async () => {
    if (!isConnected) {
        Alert.alert('Error', 'Please connect to a device first');
        return;
    }

    try {
        setIsLoading(true);
        
        const timeout = setTimeout(() => {
            setIsLoading(false);
            Alert.alert('Timeout', 'Device did not respond to file list request');
        }, 5000);

        await Bp2Module.getFileList();
        
        clearTimeout(timeout);
    } catch (error) {
        setIsLoading(false);
        Alert.alert('Error', 'Failed to retrieve historical data: ' + error.message);
    }
  };

  const handleBack = () => navigation?.navigate?.('Home');

  /* ---------------------------
     UI pieces - Enhanced with iOS features
     --------------------------- */

  // Enhanced Connection Status Component
 const renderConnectionStatus = () => (
  <View style={styles.deviceRow}>
    <View style={styles.deviceInfoContainer}>
      <View style={[styles.deviceImageContainer, { borderColor: globalStyles.primaryColor.color }]}>
        <Image
          source={require('./assets/device_bp.png')}
          style={styles.deviceImage}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.deviceTextContainer}>
        <Text style={styles.deviceName} numberOfLines={1} ellipsizeMode="tail">
          {connectedDeviceRef.current?.name || 'Blood Pressure Monitor'}
        </Text>
        <Text style={[styles.connectedText, { color: globalStyles.primaryColor.color }]}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    </View>
    
    {batteryLevel !== null && (
      <View style={[styles.batteryPill, { borderColor: '#E5E7EB' }]}>
        <Text style={styles.batteryText}>{batteryLevel}%</Text>
      </View>
    )}
  </View>
);
  // Enhanced Real-time Data Display with Live Pressure
  const renderRealTimeData = () => {
    if (!realTimeData) return null;

    return (
      <View style={styles.realTimeContainer}>
        <Text style={styles.realTimeTitle}>
          {realTimeData.paramDataType === 0 ? 'Live Measurement' : 'Measurement Result'}
        </Text>

        {realTimeData.paramDataType === 0 && realTimeData.bpData && (
          <>
            {/* Live Pressure Display */}
            <View style={styles.livePressureContainer}>
              <Text style={styles.livePressureLabel}>CURRENT PRESSURE</Text>
              <Text style={[
                styles.livePressureValue,
                { color: realTimeData.bpData.pressure > 180 ? '#e74c3c' : 
                        realTimeData.bpData.pressure > 120 ? '#f39c12' : '#3498db' }
              ]}>
                {Math.round(realTimeData.bpData.pressure)} mmHg
              </Text>
              <View style={styles.pressureTrend}>
                <Text style={styles.pressureTrendText}>
                  {realTimeData.bpData.isDeflate ? '🔽 Deflating' : '🔼 Inflating'}
                </Text>
              </View>
            </View>

            <View style={styles.measurementDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <Text style={[
                  styles.detailValue,
                  { color: realTimeData.bpData.isPulse ? '#e74c3c' : '#2ecc71' }
                ]}>
                  {realTimeData.bpData.isPulse ? 'Pulse Detected 💓' : 'Measuring...'}
                </Text>
              </View>
            </View>
          </>
        )}

        {realTimeData.paramDataType === 1 && realTimeData.bpData && (
          <View style={styles.resultContainer}>
            <View style={styles.resultRow}>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>SYSTOLIC</Text>
                <Text style={styles.resultValue}>{realTimeData.bpData.sys}</Text>
                <Text style={styles.resultUnit}>mmHg</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>DIASTOLIC</Text>
                <Text style={styles.resultValue}>{realTimeData.bpData.dia}</Text>
                <Text style={styles.resultUnit}>mmHg</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>PULSE</Text>
                <Text style={styles.resultValue}>{realTimeData.bpData.pr}</Text>
                <Text style={styles.resultUnit}>BPM</Text>
              </View>
            </View>
            
            <View style={styles.resultStatus}>
              <Text style={[
                styles.statusText,
                { color: realTimeData.bpData.result === 0 ? '#27ae60' : '#e74c3c' }
              ]}>
                {realTimeData.bpData.result === 0 ? 'Normal' : 'High Blood Pressure'}
              </Text>
            </View>
          </View>
        )}

        {isMeasuring && (
          <View style={styles.measuringIndicator}>
            <ActivityIndicator size="small" color={globalStyles.primaryColor.color} />
            <Text style={styles.measuringText}>Measurement in progress...</Text>
          </View>
        )}
      </View>
    );
  };

  // Enhanced Device Connection Modal
  const renderDeviceConnectionModal = () => (
    <Modal
      visible={showDeviceModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowDeviceModal(false)}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Connect to BP2 Device</Text>

          {isLoading ? (
            <View style={{alignItems: 'center', padding: 20}}>
              <ActivityIndicator size="large" color={globalStyles.primaryColor.color} />
              <Text style={{marginTop: 10}}>Connecting...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.modalText}>
                {isConnected
                  ? 'Connected to BP2 Device'
                  : scanning
                  ? 'Scanning for devices...'
                  : 'Select a device to connect'}
              </Text>

              {!isConnected && (
                <>
                  <ScrollView style={{maxHeight: 200, width: '100%', marginVertical: 10}}>
                    {deviceList.length === 0 ? (
                      <Text style={{textAlign: 'center', color: '#666', marginVertical: 10}}>
                        {scanning ? 'Scanning for devices...' : 'No devices found. Tap "Scan" to search.'}
                      </Text>
                    ) : (
                      deviceList.map((d, idx) => (
                        <TouchableOpacity
                          key={`${d.address ?? idx}`}
                          style={styles.deviceItem}
                          onPress={() => connectToDevice(d)}>
                          <View style={styles.deviceIcon}>
                            <Text style={styles.deviceIconText}>🩺</Text>
                          </View>
                          <View style={styles.deviceInfo}>
                            <Text style={styles.deviceName}>{d.name ?? 'Unknown Device'}</Text>
                            {d.address && (
                              <Text style={styles.deviceAddress}>{d.address}</Text>
                            )}
                          </View>
                          <View style={styles.connectIndicator}>
                            <Text style={styles.connectIndicatorText}>Connect</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>

                  {!scanning && (
                    <TouchableOpacity
                      style={styles.connectButton}
                      onPress={() => connectToDevice(null)}>
                      <Text style={styles.connectButtonText}>Scan for Devices</Text>
                    </TouchableOpacity>
                  )}

                  {scanning && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={async () => {
                        try {
                          await Bp2Module.stopScan();
                          setScanning(false);
                        } catch (e) {
                          console.warn('Failed to stop scan:', e);
                        }
                      }}>
                      <Text style={styles.cancelButtonText}>Stop Scanning</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowDeviceModal(false);
                  if (scanning) {
                    Bp2Module.stopScan().catch(e => console.warn('Failed to stop scan:', e));
                    setScanning(false);
                  }
                }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // Enhanced Device Controls
  const renderDeviceControls = () => (
    <View style={styles.controlsContainer}>
      <TouchableOpacity
        style={styles.controlButton}
        onPress={() => setShowDeviceModal(true)}
        disabled={isLoading}>
        <Text style={styles.controlButtonText}>
          {isConnected ? 'Change Device' : 'Connect Device'}
        </Text>
      </TouchableOpacity>

      {/* <TouchableOpacity
        style={styles.controlButton}
        onPress={getHistoricalData}
        disabled={!isConnected || isLoading}>
        <Text style={styles.controlButtonText}>
          {isLoading ? 'Loading...' : 'Get History'}
        </Text>
      </TouchableOpacity> */}

      {isConnected && (
        <TouchableOpacity
          style={[styles.controlButton, {minWidth: 100}]}
          onPress={disconnectDevice}>
          <Text style={styles.controlButtonText}>Disconnect</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Filter Modal for Graph View
  const renderFilterModal = () => (
    <Modal
      visible={showFilterModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowFilterModal(false)}>
      <View style={styles.filterModalContainer}>
        <View style={styles.filterModalContent}>
          <Text style={styles.filterModalTitle}>Filter Data</Text>
          <Text style={styles.filterModalSubtitle}>Show data for:</Text>
          
          {[7, 14, 30, 90].map(days => (
            <TouchableOpacity
              key={days}
              style={[
                styles.filterOption,
                filterDays === days && styles.filterOptionActive
              ]}
              onPress={() => {
                setFilterDays(days);
                loadHistoricalData(days);
                setShowFilterModal(false);
              }}>
              <Text style={[
                styles.filterOptionText,
                filterDays === days && styles.filterOptionTextActive
              ]}>
                Last {days} Days
              </Text>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity
            style={styles.filterCancelButton}
            onPress={() => setShowFilterModal(false)}>
            <Text style={styles.filterCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Image
            style={styles.backIcon}
            source={require('./assets/icon_back.png')}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blood pressure</Text>
      </View>

      {!bluetoothAvailable && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            Bluetooth is unavailable. Please enable Bluetooth to use this feature.
          </Text>
        </View>
      )}

      {bluetoothAvailable && renderConnectionStatus()}
      {bluetoothAvailable && renderDeviceControls()}
      {bluetoothAvailable && renderRealTimeData()}

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

      {activeTab === 'LIST' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[globalStyles.primaryColor.color]}
            />
          }
          showsVerticalScrollIndicator={false}>
          {displayData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No blood pressure readings yet.</Text>
              <Text style={styles.emptyStateSubtext}>
                Connect a device and take a measurement to see your data here.
              </Text>
            </View>
          ) : (
            displayData.map(item => (
              <View key={item.id} style={styles.dayBlock}>
                <View style={styles.dateHeader}>
                  <Text style={styles.dateHeaderText}>{item.date}</Text>
                </View>

                <View style={styles.card}>
                  <Text style={styles.timeText}>{item.time}</Text>
                  <View style={styles.row}>
                    <Text style={styles.bpText}>
                      {item.systolic}/{item.diastolic}
                      <Text style={styles.unit}> mmHg</Text>
                    </Text>
                    <Text style={styles.bpmText}>
                      {item.bpm}
                      <Text style={styles.unitSmall}> bpm</Text>
                    </Text>
                  </View>

                  <View style={styles.colorBarWrapper}>
                    <View style={[styles.colorSegment, {backgroundColor: '#50b36d'}]} />
                    <View style={[styles.colorSegment, {backgroundColor: '#9bd47d'}]} />
                    <View style={[styles.colorSegment, {backgroundColor: '#ffd060'}]} />
                    <View style={[styles.colorSegment, {backgroundColor: '#ffa43b'}]} />
                    <View style={[styles.colorSegment, {backgroundColor: '#ff7a2b'}]} />

                    <View
                      style={[
                        styles.marker,
                        {left: `${getMarkerLeftPercent(item.systolic)}%`},
                      ]}
                    />
                  </View>
                  
                  {item.deviceName && (
                    <Text style={styles.deviceInfoText}>
                      From: {item.deviceName}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <View style={{flex: 1}}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            style={styles.filterFab}
            onPress={() => setShowFilterModal(true)}>
            <Svg width={28} height={28} viewBox="0 0 24 24">
              <Polygon points="4,5 20,5 14,12 14,18 10,20 10,12" fill="#ffffff" />
            </Svg>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.graphScrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[globalStyles.primaryColor.color]}
              />
            }
            showsVerticalScrollIndicator={false}>
            {chartData.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No chart data available.</Text>
                <Text style={styles.emptyStateSubtext}>
                  Take some measurements to see your blood pressure trends.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.graphCard}>
                  <View style={styles.graphHeader}>
                    <View style={[styles.iconCircle, {backgroundColor: '#7acb6a'}]}>
                      <Text style={styles.iconText}>👤</Text>
                    </View>
                    <Text style={styles.graphTitleBlue}>BLOOD PRESSURE</Text>
                    <View style={{flex: 1}} />
                    <Text style={styles.legendRight}>SYS ○ / DIA ▲</Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.infoRow}>
                    <View style={{flex: 1}}>
                      <Text style={styles.smallMuted}>Today</Text>
                      <Text style={styles.smallMuted}>
                        {chartData[chartData.length - 1]?.time ?? '—'}
                      </Text>
                      <Text style={styles.goalText}>Your goal: SYS 120 / DIA 80</Text>
                    </View>
                    <Text style={styles.bigReading}>
                      {chartData[chartData.length - 1]
                        ? `${chartData[chartData.length - 1].systolic}/${chartData[chartData.length - 1].diastolic}`
                        : '—/—'}{' '}
                      <Text style={styles.mmHg}>mmHg</Text>
                    </Text>
                  </View>

                  <BPChart
                    width={SCREEN_WIDTH - 20}
                    data={chartData}
                    xLabels={xLabels}
                  />
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
                      <Text style={styles.smallMuted}>Today</Text>
                      <Text style={styles.smallMuted}>
                        {chartData[chartData.length - 1]?.time ?? '—'}
                      </Text>
                      <Text style={styles.goalText}>Your goal: 72</Text>
                    </View>
                    <Text style={styles.bigReadingRight}>
                      {chartData[chartData.length - 1] ? `${chartData[chartData.length - 1].bpm}` : '—'}{' '}
                      <Text style={styles.mmHg}>bpm</Text>
                    </Text>
                  </View>

                  <BPMChart
                    width={SCREEN_WIDTH - 20}
                    data={chartData}
                    xLabels={xLabels}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}

      {renderDeviceConnectionModal()}
      {renderFilterModal()}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={globalStyles.primaryColor.color} />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      {showToast && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

// Enhanced Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ebf2f9',
  },
  header: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.08,
    minHeight: 60, // Added minimum height
    backgroundColor: globalStyles.primaryColor.color,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.max(15, SCREEN_WIDTH * 0.04), // Made responsive
    paddingTop: Platform.OS === 'ios' ? 40 : 10, // Added iOS status bar handling
  },
  backIcon: {
    width: Math.max(24, SCREEN_WIDTH * 0.06), // Added minimum size
    height: Math.max(24, SCREEN_WIDTH * 0.06), // Added minimum size
    resizeMode: 'contain',
    tintColor: '#fff',
  },
  headerTitle: {
    color: 'white',
    fontSize: Math.max(16, SCREEN_WIDTH * 0.045), // Added minimum size
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: SCREEN_WIDTH * 0.08,
  },
  
  // Enhanced Connection Status Styles
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Math.max(12, SCREEN_WIDTH * 0.03), // Made responsive
    backgroundColor: '#fff',
    margin: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
  },
  deviceName: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    fontWeight: '600',
    color: '#333',
  },
  deviceImageContainer: {
    width: Math.max(40, SCREEN_WIDTH * 0.1), // Made responsive
    height: Math.max(40, SCREEN_WIDTH * 0.1), // Made responsive
    borderRadius: Math.max(20, SCREEN_WIDTH * 0.05), // Made responsive
    borderWidth: 2,
    marginRight: 12,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  deviceImage: {
    width: '100%',
    height: '100%',
  },
  deviceInfo: {
    marginLeft: 8,
  },
  connectedText: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '500',
  },
  batteryPill: {
    paddingHorizontal: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    paddingVertical: Math.max(4, SCREEN_WIDTH * 0.01), // Made responsive
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#f8f9fa',
    minWidth: 50,
    alignItems: 'center',
  },
  batteryText: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    fontWeight: '600',
    color: '#6b7280',
  },

  // Enhanced Real-time Data Styles
  realTimeContainer: {
    backgroundColor: '#fff',
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    margin: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
  },
  realTimeTitle: {
    fontSize: Math.max(16, SCREEN_WIDTH * 0.045), // Made responsive
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  deviceInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  livePressureContainer: {
    alignItems: 'center',
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 12,
  },
  livePressureLabel: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  livePressureValue: {
    fontSize: Math.max(24, SCREEN_WIDTH * 0.07), // Made responsive
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pressureTrend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressureTrendText: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    color: '#6b7280',
  },
  measurementDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultItem: {
    alignItems: 'center',
    flex: 1,
  },
  resultLabel: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 4,
  },
  resultValue: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06), // Made responsive
    fontWeight: 'bold',
    color: '#333',
  },
  resultUnit: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    color: '#6b7280',
  },
  resultDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e5e7eb',
  },
  resultStatus: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
  },
  statusText: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '600',
  },

  // Enhanced Device List Styles
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  deviceIcon: {
    width: Math.max(36, SCREEN_WIDTH * 0.09), // Made responsive
    height: Math.max(36, SCREEN_WIDTH * 0.09), // Made responsive
    borderRadius: Math.max(18, SCREEN_WIDTH * 0.045), // Made responsive
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 18,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTextContainer: {
    flex: 1,
  },
  deviceAddress: {
    color: '#666',
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    marginTop: 2,
  },
  connectIndicator: {
    paddingHorizontal: Math.max(10, SCREEN_WIDTH * 0.025), // Made responsive
    paddingVertical: Math.max(5, SCREEN_WIDTH * 0.012), // Made responsive
    backgroundColor: globalStyles.primaryColor.color,
    borderRadius: 16,
  },
  connectIndicatorText: {
    color: '#fff',
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    fontWeight: '600',
  },

  // Filter Modal Styles
  filterModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  filterModalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '80%',
    maxWidth: 300,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  filterModalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  filterOption: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterOptionActive: {
    backgroundColor: globalStyles.primaryColor.color,
    borderColor: globalStyles.primaryColor.color,
  },
  filterOptionText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterCancelButton: {
    padding: 16,
    marginTop: 8,
  },
  filterCancelText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },

  // Enhanced Empty State
  emptyState: {
    padding: Math.max(30, SCREEN_WIDTH * 0.1), // Made responsive
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Device Info in List
  deviceInfoText: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    color: '#6b7280',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Keep existing styles and add new ones as needed
  warningContainer: {
    backgroundColor: '#ffebee',
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    margin: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  warningText: {
    color: '#d32f2f',
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '500',
    lineHeight: 18,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap', // Added wrap for small screens
    padding: Math.max(8, SCREEN_WIDTH * 0.03), // Made responsive
    backgroundColor: '#fff',
    margin: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
    gap: 8, // Added gap for wrapped items
  },
  controlButton: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    paddingVertical: Math.max(8, SCREEN_HEIGHT * 0.012), // Made responsive
    borderRadius: 6,
    minWidth: Math.max(120, SCREEN_WIDTH * 0.3), // Made responsive
    alignItems: 'center',
    marginVertical: 4, // Added vertical margin for wrapping
  },
  controlButtonText: {
    color: '#fff',
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: Math.max(16, SCREEN_WIDTH * 0.05), // Made responsive
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: Math.max(16, SCREEN_WIDTH * 0.05), // Made responsive
    borderRadius: 12,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: Math.max(18, SCREEN_WIDTH * 0.05), // Made responsive
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    marginBottom: 20,
    textAlign: 'center',
  },
  connectButton: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: Math.max(16, SCREEN_WIDTH * 0.04), // Made responsive
    paddingVertical: Math.max(10, SCREEN_HEIGHT * 0.015), // Made responsive
    borderRadius: 5,
    marginBottom: 10,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    fontWeight: '600',
  },
  cancelButton: {
    padding: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
  },
  cancelButtonText: {
    color: '#666',
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: globalStyles.primaryColor.color,
    paddingVertical: Math.max(8, SCREEN_HEIGHT * 0.012), // Made responsive
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Math.max(6, SCREEN_HEIGHT * 0.01), // Made responsive
  },
  tabText: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    color: '#ddd',
    fontWeight: '500',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#00d4a1',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    paddingTop: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
    paddingBottom: Math.max(16, SCREEN_HEIGHT * 0.02), // Made responsive
  },
  dayBlock: {
    marginBottom: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
  },
  dateHeader: {
    backgroundColor: '#c0c4c9',
    paddingVertical: Math.max(4, SCREEN_HEIGHT * 0.006), // Made responsive
    paddingHorizontal: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    borderRadius: 4,
    marginBottom: Math.max(4, SCREEN_HEIGHT * 0.005), // Made responsive
  },
  dateHeaderText: {
    color: '#fff',
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  timeText: {
    color: '#7a7a7a',
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    marginBottom: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
    flexWrap: 'wrap', // Added wrap for small screens
  },
  bpText: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06), // Made responsive
    fontWeight: 'bold',
    color: '#4a4a4a',
    flex: 1,
  },
  bpmText: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06), // Made responsive
    fontWeight: 'bold',
    color: '#4a4a4a',
  },
  unit: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.03), // Made responsive
    fontWeight: 'normal',
    color: '#7a7a7a',
  },
  unitSmall: {
    fontSize: Math.max(10, SCREEN_WIDTH * 0.028), // Made responsive
    fontWeight: 'normal',
    color: '#7a7a7a',
  },
  colorBarWrapper: {
    height: Math.max(16, SCREEN_HEIGHT * 0.02), // Made responsive
    backgroundColor: '#f1f2f6',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    marginTop: 8,
  },
  colorSegment: {
    flex: 1,
    height: '100%',
  },
  marker: {
    position: 'absolute',
    top: -Math.max(4, SCREEN_HEIGHT * 0.005), // Made responsive
    width: Math.max(8, SCREEN_WIDTH * 0.02), // Made responsive
    height: Math.max(24, SCREEN_HEIGHT * 0.03), // Made responsive
    backgroundColor: '#4a4a4a',
    borderRadius: 2,
    transform: [{translateX: -Math.max(4, SCREEN_WIDTH * 0.01)}], // Made responsive
  },
  filterFab: {
    position: 'absolute',
    right: Math.max(16, SCREEN_WIDTH * 0.05), // Made responsive
    top: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
    width: Math.max(44, SCREEN_WIDTH * 0.12), // Made responsive
    height: Math.max(44, SCREEN_WIDTH * 0.12), // Made responsive
    borderRadius: Math.max(22, SCREEN_WIDTH * 0.06), // Made responsive
    backgroundColor: globalStyles.primaryColor.color,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
    elevation: 5,
  },
  graphScrollContent: {
    paddingHorizontal: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    paddingTop: Math.max(8, SCREEN_HEIGHT * 0.01), // Made responsive
    paddingBottom: Math.max(16, SCREEN_HEIGHT * 0.02), // Made responsive
  },
  graphCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    marginBottom: Math.max(12, SCREEN_HEIGHT * 0.02), // Made responsive
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SCREEN_HEIGHT * 0.01,
  },
  iconCircle: {
    width: Math.max(32, SCREEN_WIDTH * 0.08), // Made responsive
    height: Math.max(32, SCREEN_WIDTH * 0.08), // Made responsive
    borderRadius: Math.max(16, SCREEN_WIDTH * 0.04), // Made responsive
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SCREEN_WIDTH * 0.03,
  },
  iconText: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
  },
  graphTitleBlue: {
    color: '#4a90e2',
    fontSize: Math.max(14, SCREEN_WIDTH * 0.04), // Made responsive
    fontWeight: 'bold',
  },
  legendRight: {
    color: '#7a7a7a',
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginBottom: SCREEN_HEIGHT * 0.01,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SCREEN_HEIGHT * 0.01,
  },
  smallMuted: {
    color: '#7a7a7a',
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
  },
  goalText: {
    color: '#7a7a7a',
    fontSize: Math.max(10, SCREEN_WIDTH * 0.03), // Made responsive
    marginTop: SCREEN_HEIGHT * 0.005,
  },
  bigReading: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06), // Made responsive
    fontWeight: 'bold',
    color: '#4a4a4a',
  },
  bigReadingRight: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06), // Made responsive
    fontWeight: 'bold',
    color: '#4a4a4a',
    textAlign: 'right',
  },
  mmHg: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.03), // Made responsive
    fontWeight: 'normal',
    color: '#7a7a7a',
  },
  measuringIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 5,
  },
  measuringText: {
    marginLeft: 10,
    color: '#1976d2',
    fontWeight: '500',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: Math.max(20, SCREEN_WIDTH * 0.05), // Made responsive
    right: Math.max(20, SCREEN_WIDTH * 0.05), // Made responsive
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: Math.max(12, SCREEN_WIDTH * 0.04), // Made responsive
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 1000,
  },
  toastText: {
    color: 'white',
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035), // Made responsive
    fontWeight: '500',
    textAlign: 'center',
  },
});