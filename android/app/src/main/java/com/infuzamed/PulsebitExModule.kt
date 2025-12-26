package com.infuzamed

import android.bluetooth.BluetoothDevice
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jeremyliao.liveeventbus.LiveEventBus
import com.lepu.blepro.ext.BleServiceHelper
import com.lepu.blepro.constants.Ble
import com.lepu.blepro.event.InterfaceEvent
import com.lepu.blepro.ext.pulsebit.DeviceInfo
import com.lepu.blepro.ext.pulsebit.EcgFile
import com.lepu.blepro.objs.Bluetooth
import com.lepu.blepro.observer.BleChangeObserver
import android.app.Application
import android.bluetooth.BluetoothAdapter
import com.lepu.blepro.event.EventMsgConst

class PulsebitExModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), BleChangeObserver {

    private val TAG = "PulsebitExModule"
    private val model = Bluetooth.MODEL_PULSEBITEX
    private var fileNames = mutableListOf<String>()
    private var currentDevice: BluetoothDevice? = null

    init {
        setupEventBusListeners()
    }

    override fun getName(): String {
        return "PulsebitEx"
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // React Native Methods
    @ReactMethod
    fun initializeSDK() {
        try {
            val application = reactApplicationContext.applicationContext as Application
            BleServiceHelper.BleServiceHelper.initService(application)
            sendEvent("SDKInitialized", null)
        } catch (e: Exception) {
            val errorMap = Arguments.createMap()
            errorMap.putString("error", e.message ?: "Unknown error")
            sendEvent("SDKError", errorMap)
        }
    }

    @ReactMethod
    fun startScan() {
        BleServiceHelper.BleServiceHelper.startScan(intArrayOf(model))
    }

    @ReactMethod
    fun stopScan() {
        BleServiceHelper.BleServiceHelper.stopScan()
        // Send event back that scan ended
        val params = Arguments.createMap().apply {
            putString("status", "scan_stopped")
        }
        sendEvent("scanStopped", params)
    }

    @ReactMethod
    fun connectDevice(deviceName: String, deviceAddress: String, promise: Promise) {
        try {
            // Get the BluetoothDevice object
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            val device = bluetoothAdapter.getRemoteDevice(deviceAddress)
            
            // Set the interface for the device model
            BleServiceHelper.BleServiceHelper.setInterfaces(model)
            
            // Connect to the device using the correct model
            BleServiceHelper.BleServiceHelper.connect(reactApplicationContext, model, device)
            currentDevice = device
            
            val params = Arguments.createMap().apply {
                putString("macAddress", deviceAddress)
                putString("action", "connectRequested")
            }
            sendEvent("connectionRequest", params)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in connectDevice: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to connect: ${e.message}")
        }
    }

    @ReactMethod
    fun disconnectDevice(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.disconnect(false)
            currentDevice = null
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in disconnectDevice: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to disconnect: ${e.message}")
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.pulsebitExGetInfo(model)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in getDeviceInfo: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to get device info: ${e.message}")
        }
    }

    @ReactMethod
    fun getFileList(promise: Promise) {
        try {
            fileNames.clear()
            BleServiceHelper.BleServiceHelper.pulsebitExGetFileList(model)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in getFileList: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to get file list: ${e.message}")
        }
    }

    @ReactMethod
    fun readFile(fileName: String, promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.pulsebitExReadFile(model, fileName)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in readFile: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to read file: ${e.message}")
        }
    }

    @ReactMethod
    fun readAllFiles(promise: Promise) {
        try {
            if (fileNames.isNotEmpty()) {
                readFile(fileNames[0], promise)
            } else {
                promise.reject("PULSEBIT_ERROR", "No files available to read")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in readAllFiles: ${e.message}")
            promise.reject("PULSEBIT_ERROR", "Failed to read files: ${e.message}")
        }
    }

    @ReactMethod
    fun isBluetoothAvailable(promise: Promise) {
        try {
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            val isAvailable = bluetoothAdapter != null && bluetoothAdapter.isEnabled
            promise.resolve(isAvailable)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking Bluetooth availability: ${e.message}")
            promise.resolve(false)
        }
    }

    // Event Bus Listeners
    private fun setupEventBusListeners() {
        // Device found event - using the same approach as Bp2Module
        LiveEventBus.get<Bluetooth>(EventMsgConst.Discovery.EventDeviceFound)
            .observeForever { bluetooth ->
                if (bluetooth.model == model) {
                    val params = Arguments.createMap().apply {
                        putString("name", bluetooth.name)
                        putString("macAddress", bluetooth.macAddr)
                        putString("address", bluetooth.device?.address ?: bluetooth.macAddr)
                        putInt("model", bluetooth.model)
                    }
                    sendEvent("deviceFound", params)
                }
            }

        // Service connection status event - similar to Bp2Module
        LiveEventBus.get<Boolean>(EventMsgConst.Ble.EventServiceConnectedAndInterfaceInit)
            .observeForever { isConnected ->
                val params = Arguments.createMap().apply {
                    putBoolean("connected", isConnected)
                    putString("status", if (isConnected) "service_ready" else "service_disconnected")
                }
                sendEvent("serviceStatus", params)
            }

        // BLE device connection status event - similar to Bp2Module
        LiveEventBus.get<Boolean>("EventBleDeviceConnected")
            .observeForever { isConnected ->
                val params = Arguments.createMap().apply {
                    putBoolean("connected", isConnected)
                }
                sendEvent("connectionStatusChanged", params)
                
                if (!isConnected) {
                    currentDevice = null
                }
            }

        // Scan status event - similar to Bp2Module
        LiveEventBus.get<Boolean>("EventScanStatus")
            .observeForever { isScanning ->
                val params = Arguments.createMap().apply {
                    putBoolean("scanning", isScanning)
                }
                sendEvent("scanStatusChanged", params)
            }

        // Device ready event
        LiveEventBus.get<Int>(EventMsgConst.Ble.EventBleDeviceReady)
            .observeForever { deviceModel ->
                if (deviceModel == model) {
                    val params = Arguments.createMap().apply {
                        putInt("model", deviceModel)
                        putBoolean("connected", true)
                        putString("status", "device_ready")
                    }
                    sendEvent("deviceReady", params)
                }
            }

        // Device info event
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitDeviceInfo)
            .observeForever { event ->
                try {
                    val deviceInfo = event.data as DeviceInfo
                    val params = Arguments.createMap().apply {
                        // some versions don't have fw/hw as direct fields
                        putString("serialNumber", deviceInfo.sn ?: "Unknown")
                        putString("deviceInfo", deviceInfo.toString())
                        putInt("model", event.model)
                    }
                    sendEvent("deviceInfo", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing device info: ${e.message}")
                    val errorParams = Arguments.createMap().apply {
                        putString("error", "Failed to parse device info: ${e.message}")
                    }
                    sendEvent("deviceInfoError", errorParams)
                }
            }

        // PulsebitEX file list
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitGetFileList)
            .observeForever { event ->
                try {
                    val files = event.data as? ArrayList<String> ?: arrayListOf()
                    fileNames.clear()
                    fileNames.addAll(files)
                    
                    val params = Arguments.createMap().apply {
                        putArray("fileList", Arguments.fromList(files))
                        putInt("model", event.model)
                    }
                    sendEvent("pulsebitGetFileList", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing file list: ${e.message}")
                }
            }

        // File list progress event
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitGetFileListProgress)
            .observeForever { event ->
                try {
                    val progress = event.data as? Int ?: 0
                    val params = Arguments.createMap().apply {
                        putInt("progress", progress)
                        putString("type", "fileList")
                        putInt("model", event.model)
                    }
                    sendEvent("progress", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing progress: ${e.message}")
                }
            }

        // PulsebitEX ECG file data
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitReadFileComplete)
            .observeForever { event ->
                try {
                    val ecgFile = event.data as? EcgFile
                    if (ecgFile != null) {
                        val params = Arguments.createMap().apply {
                            putString("fileName", fileNames.firstOrNull())
                            putDouble("recordingTime", ecgFile.recordingTime.toDouble())
                            putInt("hr", ecgFile.hr)
                            putInt("user", ecgFile.user)
                            putInt("model", event.model)
                            
                            // Convert wave data to mV values: mV = n * 0.0012820952991323
                            val waveData = Arguments.createArray()
                            if (ecgFile.waveShortData != null) {
                                for (i in ecgFile.waveShortData.indices) {
                                    val mV = ecgFile.waveShortData[i] * 0.0012820952991323
                                    waveData.pushDouble(mV.toDouble())
                                }
                            }
                            putArray("waveData", waveData)
                            
                            // ECG diagnosis results
                            val diagnosis = ecgFile.result
                            if (diagnosis != null) {
                                putBoolean("isRegular", diagnosis.isRegular)
                                putBoolean("isPoorSignal", diagnosis.isPoorSignal)
                                putBoolean("isFastHr", diagnosis.isFastHr)
                                putBoolean("isSlowHr", diagnosis.isSlowHr)
                                putBoolean("isIrregular", diagnosis.isIrregular)
                                putBoolean("isPvcs", diagnosis.isPvcs)
                                putBoolean("isHeartPause", diagnosis.isHeartPause)
                                putBoolean("isFibrillation", diagnosis.isFibrillation)
                                putBoolean("isWideQrs", diagnosis.isWideQrs)
                                putBoolean("isProlongedQtc", diagnosis.isProlongedQtc)
                                putBoolean("isShortQtc", diagnosis.isShortQtc)
                                putBoolean("isStElevation", diagnosis.isStElevation)
                                putBoolean("isStDepression", diagnosis.isStDepression)
                                
                                // Create a summary string
                                val summary = buildString {
                                    append("ECG Analysis Results:\n")
                                    if (diagnosis.isRegular) append("• Regular Rhythm\n")
                                    if (diagnosis.isPoorSignal) append("• Poor Signal Quality\n")
                                    if (diagnosis.isFastHr) append("• Fast Heart Rate\n")
                                    if (diagnosis.isSlowHr) append("• Slow Heart Rate\n")
                                    if (diagnosis.isIrregular) append("• Irregular Rhythm\n")
                                    if (diagnosis.isPvcs) append("• Possible PVCs\n")
                                    if (diagnosis.isHeartPause) append("• Possible Heart Pause\n")
                                    if (diagnosis.isFibrillation) append("• Possible Atrial Fibrillation\n")
                                    if (diagnosis.isWideQrs) append("• Wide QRS Complex\n")
                                    if (diagnosis.isProlongedQtc) append("• Prolonged QTc\n")
                                    if (diagnosis.isShortQtc) append("• Short QTc\n")
                                    if (diagnosis.isStElevation) append("• ST Elevation\n")
                                    if (diagnosis.isStDepression) append("• ST Depression\n")
                                }
                                putString("diagnosisSummary", summary)
                            }
                        }
                        sendEvent("pulsebitReadFileComplete", params)
                        
                        // Remove processed file
                        if (fileNames.isNotEmpty()) {
                            fileNames.removeAt(0)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing ECG file: ${e.message}")
                }
            }

        // Reading file progress event
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitReadingFileProgress)
            .observeForever { event ->
                try {
                    val progress = event.data as? Int ?: 0
                    val params = Arguments.createMap().apply {
                        putInt("progress", progress)
                        putString("type", "reading")
                        putInt("model", event.model)
                    }
                    sendEvent("progress", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing reading progress: ${e.message}")
                }
            }

        // Handle read file error
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitReadFileError)
            .observeForever { event ->
                val errorParams = Arguments.createMap().apply {
                    putString("error", "Failed to read file")
                    putInt("model", event.model)
                }
                sendEvent("ecgFileError", errorParams)
            }

        // Handle get file list error
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.Pulsebit.EventPulsebitGetFileListError)
            .observeForever { event ->
                val errorParams = Arguments.createMap().apply {
                    putString("error", "Failed to get file list")
                    putInt("model", event.model)
                }
                sendEvent("fileListError", errorParams)
            }
    }

    override fun onBleStateChanged(model: Int, state: Int) {
        if (model == this.model) {
            val params = Arguments.createMap().apply {
                putInt("model", model)
                putInt("state", state)
                putBoolean("connected", state == Ble.State.CONNECTED)
                putString("stateName", when (state) {
                    Ble.State.CONNECTED -> "CONNECTED"
                    Ble.State.CONNECTING -> "CONNECTING"
                    Ble.State.DISCONNECTED -> "DISCONNECTED"
                    Ble.State.DISCONNECTING -> "DISCONNECTING"
                    else -> "UNKNOWN"
                })
            }
            sendEvent("bleStateChanged", params)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built in Event Emitter Calls
    }
}