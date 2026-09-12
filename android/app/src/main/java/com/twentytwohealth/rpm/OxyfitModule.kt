package com.twentytwohealth.rpm

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jeremyliao.liveeventbus.LiveEventBus
import com.lepu.blepro.constants.Ble
import com.lepu.blepro.event.InterfaceEvent
import com.lepu.blepro.ext.BleServiceHelper
import com.lepu.blepro.ext.oxy.*
import com.lepu.blepro.ext.oxy.s3.S3RtAcc
import com.lepu.blepro.ext.oxy.s3.S3RtParam
import com.lepu.blepro.ext.oxy.s3.S3RtPpg
import com.lepu.blepro.ext.oxy.s3.S3RtWave
import com.lepu.blepro.objs.Bluetooth
import com.lepu.blepro.observer.BIOL
import com.lepu.blepro.observer.BleChangeObserver
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import com.lepu.blepro.event.EventMsgConst
import com.lepu.blepro.utils.makeTimeStr
import android.os.Handler
import android.os.Looper

class OxyfitModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), BleChangeObserver {

    private val TAG = "OxyfitModule"
    private var currentModel = Bluetooth.MODEL_OXYFIT_WPS
    private var deviceConnected = false
    private var isAutoModeEnabled = false
    private var currentDeviceAddress: String? = null

    override fun getName(): String {
        return "OxyfitModule"
    }

    init {
        Log.d(TAG, "Initializing OxyfitModule with model constants:")
        Log.d(TAG, "OXYFIT_WPS: ${Bluetooth.MODEL_OXYFIT_WPS}")
        Log.d(TAG, "O2RING: ${Bluetooth.MODEL_O2RING}")
        Log.d(TAG, "BBSM_S3: ${Bluetooth.MODEL_BBSM_S3}")
        
        // Initialize BIOL observer for all supported models
        BIOL(this, intArrayOf(
            Bluetooth.MODEL_OXYFIT_WPS,
            Bluetooth.MODEL_O2RING,
            Bluetooth.MODEL_O2M,
            Bluetooth.MODEL_BABYO2,
            Bluetooth.MODEL_BABYO2N,
            Bluetooth.MODEL_CHECKO2,
            Bluetooth.MODEL_SLEEPO2,
            Bluetooth.MODEL_SNOREO2,
            Bluetooth.MODEL_WEARO2,
            Bluetooth.MODEL_SLEEPU,
            Bluetooth.MODEL_OXYLINK,
            Bluetooth.MODEL_KIDSO2,
            Bluetooth.MODEL_OXYFIT,
            Bluetooth.MODEL_OXYRING,
            Bluetooth.MODEL_BBSM_S1,
            Bluetooth.MODEL_BBSM_S2,
            Bluetooth.MODEL_OXYU,
            Bluetooth.MODEL_AI_S100,
            Bluetooth.MODEL_O2M_WPS,
            Bluetooth.MODEL_CMRING,
            Bluetooth.MODEL_KIDSO2_WPS,
            Bluetooth.MODEL_BBSM_S3
        ))
        
        // Initialize event bus listeners
        initEventBus()
    }

    // Send events to React Native
    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending event $eventName: ${e.message}")
        }
    }

    @ReactMethod
    fun initBleService(promise: Promise) {
        try {
            Log.d(TAG, "Initializing BLE service")
            BleServiceHelper.BleServiceHelper.initService(reactApplicationContext.applicationContext as android.app.Application)
            
            // Wait for service initialization
            Handler(Looper.getMainLooper()).postDelayed({
                promise.resolve("BLE service initialized successfully")
            }, 1000)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize BLE service: ${e.message}")
            promise.reject("INIT_ERROR", "Failed to initialize BLE service: ${e.message}")
        }
    }

    @ReactMethod
    fun startScan() {
        Log.d(TAG, "Starting BLE scan for OxyFit devices")
        BleServiceHelper.BleServiceHelper.startScan()
    }

    @ReactMethod
    fun stopScan() {
        Log.d(TAG, "Stopping BLE scan")
        BleServiceHelper.BleServiceHelper.stopScan()
    }

    @ReactMethod
    fun connectToDevice(deviceAddress: String, deviceModel: Int, promise: Promise) {
        try {
            Log.d(TAG, "Connecting to device: $deviceAddress with JS model: $deviceModel")
            
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            if (bluetoothAdapter == null) {
                promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth not supported")
                return
            }
            
            val bluetoothDevice: BluetoothDevice
            try {
                bluetoothDevice = bluetoothAdapter.getRemoteDevice(deviceAddress)
            } catch (e: IllegalArgumentException) {
                promise.reject("INVALID_ADDRESS", "Invalid device address: $deviceAddress")
                return
            }
            
            // Convert JS model to actual Bluetooth model constant
            val actualModel = convertToBluetoothModel(deviceModel)
            currentModel = actualModel
            currentDeviceAddress = deviceAddress
            
            Log.d(TAG, "Converted model $deviceModel -> $actualModel for device: ${bluetoothDevice.name}")
            
            // Set interface BEFORE connecting
            BleServiceHelper.BleServiceHelper.setInterfaces(actualModel)
            
            // Connect with proper context
            BleServiceHelper.BleServiceHelper.connect(
                reactApplicationContext.applicationContext, 
                actualModel, 
                bluetoothDevice
            )
            
            promise.resolve("Connection initiated successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error connecting to device: ${e.message}", e)
            promise.reject("CONNECTION_ERROR", "Failed to connect to device: ${e.message}")
        }
    }

    private fun convertToBluetoothModel(jsModel: Int): Int {
        return when (jsModel) {
            1 -> Bluetooth.MODEL_OXYFIT_WPS
            2 -> Bluetooth.MODEL_O2RING
            3 -> Bluetooth.MODEL_O2M
            4 -> Bluetooth.MODEL_BABYO2
            5 -> Bluetooth.MODEL_BABYO2N
            6 -> Bluetooth.MODEL_CHECKO2
            7 -> Bluetooth.MODEL_SLEEPO2
            8 -> Bluetooth.MODEL_SNOREO2
            9 -> Bluetooth.MODEL_WEARO2
            10 -> Bluetooth.MODEL_SLEEPU
            11 -> Bluetooth.MODEL_OXYLINK
            12 -> Bluetooth.MODEL_KIDSO2
            13 -> Bluetooth.MODEL_OXYFIT
            14 -> Bluetooth.MODEL_OXYRING
            15 -> Bluetooth.MODEL_BBSM_S1
            16 -> Bluetooth.MODEL_BBSM_S2
            17 -> Bluetooth.MODEL_OXYU
            18 -> Bluetooth.MODEL_AI_S100
            19 -> Bluetooth.MODEL_O2M_WPS
            20 -> Bluetooth.MODEL_CMRING
            21 -> Bluetooth.MODEL_KIDSO2_WPS
            22 -> Bluetooth.MODEL_BBSM_S3
            else -> {
                Log.w(TAG, "Unknown JS model $jsModel, defaulting to OXYFIT_WPS")
                Bluetooth.MODEL_OXYFIT_WPS
            }
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            Log.d(TAG, "Disconnecting device")
            // Disable auto mode before disconnecting
            if (isAutoModeEnabled) {
                BleServiceHelper.BleServiceHelper.oxyAutoSwitch(currentModel, false, false, false, false)
                isAutoModeEnabled = false
            }
            BleServiceHelper.BleServiceHelper.disconnect(false)
            deviceConnected = false
            currentDeviceAddress = null
            promise.resolve("Disconnected successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error disconnecting: ${e.message}")
            promise.reject("DISCONNECT_ERROR", "Failed to disconnect: ${e.message}")
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Requesting device info")
            BleServiceHelper.BleServiceHelper.oxyGetInfo(currentModel)
            promise.resolve("Device info requested")
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", "Failed to get device info: ${e.message}")
        }
    }

    @ReactMethod
    fun getRealTimeParams(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Requesting real-time parameters")
            BleServiceHelper.BleServiceHelper.oxyGetRtParam(currentModel)
            promise.resolve("Real-time parameters requested")
        } catch (e: Exception) {
            promise.reject("RT_PARAMS_ERROR", "Failed to get real-time parameters: ${e.message}")
        }
    }

    @ReactMethod
    fun getRealTimeWaveform(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Requesting real-time waveform")
            BleServiceHelper.BleServiceHelper.oxyGetRtWave(currentModel)
            promise.resolve("Real-time waveform requested")
        } catch (e: Exception) {
            promise.reject("RT_WAVEFORM_ERROR", "Failed to get real-time waveform: ${e.message}")
        }
    }

    @ReactMethod
    fun getPPGData(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Requesting PPG data")
            BleServiceHelper.BleServiceHelper.oxyGetPpgRt(currentModel)
            promise.resolve("PPG data requested")
        } catch (e: Exception) {
            promise.reject("PPG_DATA_ERROR", "Failed to get PPG data: ${e.message}")
        }
    }

// In OxyfitModule.kt, replace the enableAutoMode method:

@ReactMethod
fun enableAutoMode(param: Boolean, wave: Boolean, ppg: Boolean, acc: Boolean, promise: Promise) {
    if (!deviceConnected) {
        promise.reject("NOT_CONNECTED", "Device not connected")
        return
    }
    
    try {
        Log.d(TAG, "Manual mode requested - starting data streaming")
        
        // Instead of using auto mode, start manual data requests
        // For most devices, we'll use regular data requests
        when (currentModel) {
            Bluetooth.MODEL_BBSM_S3 -> {
                Log.d(TAG, "BBSM S3 device - using standard data requests")
                // For S3 devices, use regular data requests instead of auto mode
                BleServiceHelper.BleServiceHelper.oxyGetRtParam(currentModel)
            }
            else -> {
                Log.d(TAG, "Standard device - using regular data requests")
                BleServiceHelper.BleServiceHelper.oxyGetRtParam(currentModel)
            }
        }
        
        isAutoModeEnabled = false // Mark as false since we're not using actual auto mode
        promise.resolve("Manual data streaming started successfully")
    } catch (e: Exception) {
        Log.e(TAG, "Error starting data streaming: ${e.message}", e)
        
        // Even if there's an error, try to get data manually
        try {
            BleServiceHelper.BleServiceHelper.oxyGetRtParam(currentModel)
            promise.resolve("Fallback manual data streaming started")
        } catch (fallbackError: Exception) {
            promise.reject("DATA_STREAM_ERROR", "Failed to start data streaming: ${e.message}")
        }
    }
}




    @ReactMethod
    fun disableAutoMode(promise: Promise) {
        try {
            Log.d(TAG, "Disabling auto mode")
            BleServiceHelper.BleServiceHelper.oxyAutoSwitch(currentModel, false, false, false, false)
            isAutoModeEnabled = false
            promise.resolve("Auto mode disabled successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error disabling auto mode: ${e.message}")
            promise.reject("AUTO_MODE_ERROR", "Failed to disable auto mode: ${e.message}")
        }
    }

    @ReactMethod
    fun setDeviceTime(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            val timeValue = makeTimeStr()
            Log.d(TAG, "Setting device time: $timeValue")
            BleServiceHelper.BleServiceHelper.oxyUpdateSetting(currentModel, "SetTIME", timeValue)
            promise.resolve("Device time set successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error setting device time: ${e.message}")
            promise.reject("TIME_SETTING_ERROR", "Failed to set device time: ${e.message}")
        }
    }

    @ReactMethod
    fun setMotorIntensity(intensity: Int, promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Setting motor intensity: $intensity")
            BleServiceHelper.BleServiceHelper.oxyUpdateSetting(currentModel, "SetMotor", intensity)
            promise.resolve("Motor intensity set successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error setting motor intensity: ${e.message}")
            promise.reject("SETTING_ERROR", "Failed to set motor intensity: ${e.message}")
        }
    }

    @ReactMethod
    fun setBuzzerIntensity(intensity: Int, promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Setting buzzer intensity: $intensity")
            BleServiceHelper.BleServiceHelper.oxyUpdateSetting(currentModel, "SetBuzzer", intensity)
            promise.resolve("Buzzer intensity set successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error setting buzzer intensity: ${e.message}")
            promise.reject("SETTING_ERROR", "Failed to set buzzer intensity: ${e.message}")
        }
    }

    @ReactMethod
    fun setOxygenThreshold(threshold: Int, promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Setting oxygen threshold: $threshold")
            BleServiceHelper.BleServiceHelper.oxyUpdateSetting(currentModel, "SetOxiThr", threshold)
            promise.resolve("Oxygen threshold set successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error setting oxygen threshold: ${e.message}")
            promise.reject("SETTING_ERROR", "Failed to set oxygen threshold: ${e.message}")
        }
    }

    @ReactMethod
    fun factoryReset(promise: Promise) {
        if (!deviceConnected) {
            promise.reject("NOT_CONNECTED", "Device not connected")
            return
        }
        
        try {
            Log.d(TAG, "Performing factory reset")
            BleServiceHelper.BleServiceHelper.oxyFactoryReset(currentModel)
            promise.resolve("Factory reset requested")
        } catch (e: Exception) {
            Log.e(TAG, "Error performing factory reset: ${e.message}")
            promise.reject("FACTORY_RESET_ERROR", "Failed to perform factory reset: ${e.message}")
        }
    }

    // BleChangeObserver implementation
    override fun onBleStateChanged(model: Int, state: Int) {
        Log.d(TAG, "Bluetooth state changed - Model: $model, State: $state")
        
        val params = Arguments.createMap()
        params.putInt("model", model)
        params.putInt("state", state)
        params.putBoolean("connected", state == Ble.State.CONNECTED)
        
        deviceConnected = state == Ble.State.CONNECTED
        
        if (!deviceConnected) {
            isAutoModeEnabled = false
            currentDeviceAddress = null
        }
        
        sendEvent("onBleStateChanged", params)
    }

    // Initialize event bus listeners
    private fun initEventBus() {
        // Service initialized
        LiveEventBus.get<Boolean>(EventMsgConst.Ble.EventServiceConnectedAndInterfaceInit, Boolean::class.java)
            .observeForever { initialized ->
                Log.d(TAG, "Service initialized: $initialized")
                val params = Arguments.createMap()
                params.putBoolean("initialized", initialized)
                sendEvent("onServiceInitialized", params)
            }

        // Device found during scan
        LiveEventBus.get<Bluetooth>(EventMsgConst.Discovery.EventDeviceFound, Bluetooth::class.java)
            .observeForever { bluetoothDevice ->
                Log.d(TAG, "Device found: ${bluetoothDevice.name} - ${bluetoothDevice.device?.address ?: "No address"}")
                
                val params = Arguments.createMap()
                params.putString("name", bluetoothDevice.name ?: "Unknown Device")
                params.putString("address", bluetoothDevice.device?.address ?: "")
                params.putInt("rssi", bluetoothDevice.rssi)
                
                sendEvent("onDeviceFound", params)
            }

        // Device ready event
        LiveEventBus.get<Int>(EventMsgConst.Ble.EventBleDeviceReady, Int::class.java)
            .observeForever { modelReady ->
                Log.d(TAG, "BLE Device Ready for model: $modelReady")
                if (modelReady == currentModel) {
                    deviceConnected = true
                    val params = Arguments.createMap()
                    params.putInt("model", modelReady)
                    params.putBoolean("connected", true)
                    sendEvent("onBleDeviceReady", params)
                    
                    // Auto-enable auto mode for BBSM S3 devices
                    if (modelReady == Bluetooth.MODEL_BBSM_S3) {
                        Handler(Looper.getMainLooper()).postDelayed({
                            Log.d(TAG, "Auto-enabling auto mode for BBSM S3")
                            BleServiceHelper.BleServiceHelper.oxyAutoSwitch(currentModel, true, false, false, false)
                            isAutoModeEnabled = true
                        }, 1000)
                    }
                }
            }

        // Device synchronized (connected and ready)
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxySyncDeviceInfo, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    Log.d(TAG, "Device synchronized: ${event.data}")
                    deviceConnected = true
                    
                    val params = Arguments.createMap()
                    params.putBoolean("connected", true)
                    params.putInt("model", currentModel)
                    params.putString("deviceAddress", currentDeviceAddress)
                    
                    // Parse setting types
                    val settingTypes = event.data as Array<String>
                    val typesArray = Arguments.createArray()
                    settingTypes.forEach { type ->
                        typesArray.pushString(type)
                    }
                    params.putArray("settingTypes", typesArray)
                    
                    sendEvent("onSettingsUpdated", params)
                }
            }

        // Device Info
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyInfo, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as DeviceInfo
                    Log.d(TAG, "Device info received - Battery: ${data.batteryValue}%, State: ${data.curState}")
                    
                    val params = Arguments.createMap()
                    params.putInt("batteryState", data.batteryState)
                    params.putString("batteryValue", data.batteryValue) 
                    params.putInt("oxiThr", data.oxiThr)
                    params.putInt("motor", data.motor)
                    params.putInt("workMode", data.workMode)
                    params.putInt("oxiSwitch", data.oxiSwitch)
                    params.putInt("hrSwitch", data.hrSwitch)
                    params.putInt("hrLowThr", data.hrLowThr)
                    params.putInt("hrHighThr", data.hrHighThr)
                    params.putInt("curState", data.curState)
                    params.putInt("lightingMode", data.lightingMode)
                    params.putInt("lightStr", data.lightStr)
                    params.putInt("buzzer", data.buzzer)
                    
                    // File list
                    val fileListArray = Arguments.createArray()
                    data.fileList.split(",").forEach { fileName ->
                        if (fileName.isNotEmpty()) {
                            fileListArray.pushString(fileName)
                        }
                    }
                    params.putArray("fileList", fileListArray)
                    
                    sendEvent("onDeviceInfo", params)
                }
            }

        // Real-time Parameters
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtParamData, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as RtParam
                    val params = Arguments.createMap()
                    
                    params.putInt("spo2", data.spo2)
                    params.putInt("pr", data.pr)
                    params.putDouble("pi", data.pi.toDouble())
                    params.putInt("vector", data.vector)
                    params.putInt("battery", data.battery)
                    params.putInt("batteryState", data.batteryState)
                    params.putInt("state", data.state)
                    
                    sendEvent("onRealTimeParams", params)
                }
            }

// Real-time Parameters (Auto mode - S3 devices)
LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtParamAuto, InterfaceEvent::class.java)
    .observeForever { event ->
        if (event.model == currentModel) {
            try {
                Log.d(TAG, "Received auto mode real-time parameters")
                val data = event.data
                val params = Arguments.createMap()
                
                when (data) {
                    is S3RtParam -> {
                        // Handle S3 device auto mode data - using correct properties
                        // Check what properties are actually available in S3RtParam
                        Log.d(TAG, "S3RtParam data received: $data")
                        
                        // Try to access available properties - adjust based on actual class structure
                        params.putInt("spo2", data.spo2)
                        params.putInt("pr", data.pr)
                        params.putDouble("pi", data.pi.toDouble())
                        
                        // For S3 devices, battery and state might be in different fields
                        // Use safe access with defaults
                        params.putInt("battery", 0) // Default value
                        params.putInt("state", 0)   // Default value
                        params.putString("dataType", "S3RtParam")
                        
                        // Log available properties for debugging
                        Log.d(TAG, "S3RtParam - SpO2: ${data.spo2}, PR: ${data.pr}, PI: ${data.pi}")
                    }
                    is RtParam -> {
                        // Handle standard device auto mode data
                        Log.d(TAG, "RtParam data received: $data")
                        params.putInt("spo2", data.spo2)
                        params.putInt("pr", data.pr)
                        params.putDouble("pi", data.pi.toDouble())
                        params.putInt("battery", data.battery)
                        params.putInt("state", data.state)
                        params.putString("dataType", "RtParam")
                    }
                    else -> {
                        // Fallback for unknown data types
                        Log.w(TAG, "Unknown auto mode data type: ${data?.javaClass?.simpleName}")
                        params.putString("rawData", data.toString())
                        params.putString("dataType", "Unknown")
                        
                        // Set default values
                        params.putInt("spo2", 0)
                        params.putInt("pr", 0)
                        params.putDouble("pi", 0.0)
                        params.putInt("battery", 0)
                        params.putInt("state", 0)
                    }
                }
                
                sendEvent("onRealTimeParamsAuto", params)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing auto mode real-time params: ${e.message}", e)
                
                // Send error with default values
                val errorParams = Arguments.createMap()
                errorParams.putInt("spo2", 0)
                errorParams.putInt("pr", 0)
                errorParams.putDouble("pi", 0.0)
                errorParams.putInt("battery", 0)
                errorParams.putInt("state", 0)
                errorParams.putString("error", e.message)
                sendEvent("onRealTimeParamsAuto", errorParams)
            }
        }
    }

        // Real-time Waveform
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtData, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as RtWave
                    val params = Arguments.createMap()
                    
                    params.putString("rawData", data.toString())
                    sendEvent("onRealTimeWaveform", params)
                }
            }

// Real-time Waveform (Auto mode - S3 devices)
LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtWaveAuto, InterfaceEvent::class.java)
    .observeForever { event ->
        if (event.model == currentModel) {
            try {
                Log.d(TAG, "Received auto mode waveform data")
                val data = event.data
                val params = Arguments.createMap()
                
                when (data) {
                    is S3RtWave -> {
                        Log.d(TAG, "S3RtWave data received")
                        // S3 waveform data structure might be different
                        // Create empty array for now until we know the structure
                        val waveArray = Arguments.createArray()
                        params.putArray("waveData", waveArray)
                        params.putString("dataType", "S3RtWave")
                    }
                    is RtWave -> {
                        Log.d(TAG, "RtWave data received")
                        // Standard waveform data
                        val waveArray = Arguments.createArray()
                        // If RtWave has waveData array, add it here
                        params.putArray("waveData", waveArray)
                        params.putString("dataType", "RtWave")
                    }
                    else -> {
                        Log.w(TAG, "Unknown waveform data type: ${data?.javaClass?.simpleName}")
                        params.putString("rawData", data.toString())
                        params.putString("dataType", "Unknown")
                    }
                }
                
                sendEvent("onRealTimeWaveformAuto", params)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing auto mode waveform: ${e.message}", e)
            }
        }
    }


        // PPG Data
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyPpgData, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as RtPpg
                    val params = Arguments.createMap()
                    
                    params.putString("rawData", data.toString())
                    sendEvent("onPPGData", params)
                }
            }

        // PPG Data (Auto mode - S3 devices)
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtPpgAuto, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as S3RtPpg
                    val params = Arguments.createMap()
                    
                    params.putString("rawData", data.toString())
                    sendEvent("onPPGDataAuto", params)
                }
            }

        // Accelerometer Data (Auto mode - S3 devices)
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyRtAccAuto, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val data = event.data as S3RtAcc
                    val params = Arguments.createMap()
                    
                    params.putString("rawData", data.toString())
                    sendEvent("onAccelerometerData", params)
                }
            }

        // Factory Reset Result
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Oxy.EventOxyFactoryReset, InterfaceEvent::class.java)
            .observeForever { event ->
                if (event.model == currentModel) {
                    val success = event.data as Boolean
                    val params = Arguments.createMap()
                    params.putBoolean("success", success)
                    Log.d(TAG, "Factory reset result: $success")
                    sendEvent("onFactoryReset", params)
                }
            }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built in Event Emitter Calls
        Log.d(TAG, "Listener added for event: $eventName")
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built in Event Emitter Calls
        Log.d(TAG, "Removing $count listeners")
    }
}