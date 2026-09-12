package com.twentytwohealth.rpm

import android.bluetooth.BluetoothDevice
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lepu.blepro.ext.BleServiceHelper
import com.lepu.blepro.constants.Ble
import com.lepu.blepro.event.InterfaceEvent
import com.lepu.blepro.objs.Bluetooth
import com.lepu.blepro.ext.bp2.*
import com.jeremyliao.liveeventbus.LiveEventBus
import com.lepu.blepro.utils.DateUtil
import com.lepu.blepro.utils.FilterUtil
import android.content.Context
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import com.lepu.blepro.event.EventMsgConst

class Bp2Module(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "Bp2Module"
    private var currentModel: Int? = null
    private var currentDevice: BluetoothDevice? = null
    
    // Supported device models
    private val supportedModels = intArrayOf(
        Bluetooth.MODEL_BP2,
        Bluetooth.MODEL_BP2A,
        Bluetooth.MODEL_BP2T
    )

    override fun getName(): String {
        return "Bp2Module"
    }

    init {
        // Initialize event listeners
        initEventBus()
    }

    private fun sendEvent(reactContext: ReactContext, eventName: String, params: WritableMap?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending event: ${e.message}")
        }
    }

    private fun initEventBus() {
        // Device connection event
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2SyncTime)
            .observeForever {
                try {
                    val model = it.model
                    val isConnected = it.data as? Boolean ?: false
                    
                    if (isConnected && supportedModels.contains(model)) {
                        currentModel = model
                        val params = Arguments.createMap()
                        params.putInt("model", model)
                        params.putBoolean("connected", true)
                        sendEvent(reactApplicationContext, "onDeviceConnected", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2SyncTime: ${e.message}")
                }
            }

        // Device found event - using LiveEventBus with Bluetooth object
LiveEventBus.get<Bluetooth>(EventMsgConst.Discovery.EventDeviceFound)
    .observeForever { device ->
                try {
                    if (supportedModels.contains(device.model)) {
                        val params = Arguments.createMap()
                        params.putString("name", device.name)
                        // Use the device's address directly (BluetoothDevice address)
                        params.putString("address", device.device?.address ?: "")
                        params.putInt("model", device.model)
                        sendEvent(reactApplicationContext, "onDeviceFound", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in device found event: ${e.message}")
                }
            }

        // Scan status event
        LiveEventBus.get<Boolean>("EventScanStatus")
            .observeForever { isScanning ->
                try {
                    val params = Arguments.createMap()
                    params.putBoolean("scanning", isScanning)
                    sendEvent(reactApplicationContext, "onScanStatusChanged", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in scan status event: ${e.message}")
                }
            }

        // Connection status event
        LiveEventBus.get<Boolean>("EventBleDeviceConnected")
            .observeForever { isConnected ->
                try {
                    val params = Arguments.createMap()
                    params.putBoolean("connected", isConnected)
                    sendEvent(reactApplicationContext, "onConnectionStatusChanged", params)
                    
                    if (!isConnected) {
                        currentModel = null
                        currentDevice = null
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in connection status event: ${e.message}")
                }
            }

        // Device Info
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2Info)
            .observeForever {
                try {
                    val data = it.data as? DeviceInfo
                    if (data != null) {
                        val params = Arguments.createMap()
                        params.putString("deviceInfo", data.toString())
                        params.putInt("model", it.model)
                        sendEvent(reactApplicationContext, "onBp2Info", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2Info: ${e.message}")
                }
            }

        // Real-time Data
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2RtData)
            .observeForever {
                try {
                    val data = it.data as? RtData
                    if (data != null) {
                        val params = Arguments.createMap()
                        params.putInt("model", it.model)
                        
                        // Add status information with null safety
                        val status = Arguments.createMap()
                        data.status?.let { statusData ->
                            status.putInt("deviceStatus", statusData.deviceStatus)
                            status.putInt("batteryStatus", statusData.batteryStatus)
                            status.putInt("percent", statusData.percent)
                                val statusDesc = when (statusData.deviceStatus) {
                                    0 -> "Sleep"
                                    1 -> "Memory"
                                    2 -> "Charging"
                                    3 -> "Ready"
                                    4 -> "BP Measuring"
                                    5 -> "BP Measure End"
                                    6 -> "ECG Measuring"
                                    7 -> "ECG Measure End"
                                    20 -> "VEN"
                                    else -> "Unknown"
                                }
                            status.putString("deviceStatusDesc", statusDesc)
                        }
                        
                        params.putMap("status", status)
                        
                        // Add parameter data based on type with null safety
                        data.param?.let { paramData ->
                            params.putInt("paramDataType", paramData.paramDataType)
                            
                            when(paramData.paramDataType) {
                                0 -> { // BP measuring
                                    val bpIng = RtBpIng(paramData.paramData)
                                    val bpData = Arguments.createMap()
                                    bpData.putInt("pressure", bpIng.pressure)
                                    bpData.putInt("pr", bpIng.pr)
                                    bpData.putBoolean("isDeflate", bpIng.isDeflate)
                                    bpData.putBoolean("isPulse", bpIng.isPulse)
                                    params.putMap("bpData", bpData)
                                }
                                1 -> { // BP result
                                    val bpResult = RtBpResult(paramData.paramData)
                                    val bpData = Arguments.createMap()
                                    bpData.putInt("sys", bpResult.sys)
                                    bpData.putInt("dia", bpResult.dia)
                                    bpData.putInt("mean", bpResult.mean)
                                    bpData.putInt("pr", bpResult.pr)
                                    bpData.putBoolean("isDeflate", bpResult.isDeflate)
                                    bpData.putInt("result", bpResult.result)
                                    params.putMap("bpData", bpData)
                                }
                                2 -> { // ECG measuring
                                    val ecgIng = RtEcgIng(paramData.paramData)
                                    val ecgData = Arguments.createMap()
                                    ecgData.putInt("hr", ecgIng.hr)
                                    ecgData.putBoolean("isLeadOff", ecgIng.isLeadOff)
                                    ecgData.putBoolean("isPoolSignal", ecgIng.isPoolSignal)
                                    ecgData.putInt("curDuration", ecgIng.curDuration)
                                    
                                    // Convert ECG floats to array safely
                                    val ecgArray = Arguments.createArray()
                                    paramData.ecgFloatsFilter?.forEach { 
                                        ecgArray.pushDouble(it.toDouble()) 
                                    }
                                    ecgData.putArray("ecgData", ecgArray)
                                    
                                    params.putMap("ecgData", ecgData)
                                }
                                3 -> { // ECG result
                                    val ecgResult = RtEcgResult(paramData.paramData)
                                    val ecgData = Arguments.createMap()
                                    ecgData.putInt("hr", ecgResult.hr)
                                    ecgData.putInt("qrs", ecgResult.qrs)
                                    ecgData.putInt("pvcs", ecgResult.pvcs)
                                    ecgData.putInt("qtc", ecgResult.qtc)
                                    
                                    val diagnosis = Arguments.createMap()
                                    diagnosis.putBoolean("isRegular", ecgResult.diagnosis.isRegular)
                                    diagnosis.putBoolean("isPoorSignal", ecgResult.diagnosis.isPoorSignal)
                                    diagnosis.putBoolean("isLeadOff", ecgResult.diagnosis.isLeadOff)
                                    diagnosis.putBoolean("isFastHr", ecgResult.diagnosis.isFastHr)
                                    diagnosis.putBoolean("isSlowHr", ecgResult.diagnosis.isSlowHr)
                                    diagnosis.putBoolean("isIrregular", ecgResult.diagnosis.isIrregular)
                                    diagnosis.putBoolean("isPvcs", ecgResult.diagnosis.isPvcs)
                                    diagnosis.putBoolean("isHeartPause", ecgResult.diagnosis.isHeartPause)
                                    diagnosis.putBoolean("isFibrillation", ecgResult.diagnosis.isFibrillation)
                                    diagnosis.putBoolean("isWideQrs", ecgResult.diagnosis.isWideQrs)
                                    diagnosis.putBoolean("isProlongedQtc", ecgResult.diagnosis.isProlongedQtc)
                                    diagnosis.putBoolean("isShortQtc", ecgResult.diagnosis.isShortQtc)
                                    diagnosis.putString("resultMess", ecgResult.diagnosis.resultMess)
                                    
                                    ecgData.putMap("diagnosis", diagnosis)
                                    params.putMap("ecgData", ecgData)
                                }
                            }
                        }
                        
                        sendEvent(reactApplicationContext, "onBp2RtData", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2RtData: ${e.message}")
                }
            }

        // File List
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2FileList)
            .observeForever {
                try {
                    val fileNames = it.data as? ArrayList<String>
                    val params = Arguments.createMap()
                    val filesArray = Arguments.createArray()
                    params.putInt("model", it.model)
                    
                    fileNames?.forEach { filesArray.pushString(it) }
                    params.putArray("fileNames", filesArray)
                    
                    sendEvent(reactApplicationContext, "onBp2FileList", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2FileList: ${e.message}")
                }
            }

        // File Read Progress
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2ReadingFileProgress)
            .observeForever {
                try {
                    val progress = it.data as? Int ?: 0
                    val params = Arguments.createMap()
                    params.putInt("progress", progress)
                    params.putInt("model", it.model)
                    
                    sendEvent(reactApplicationContext, "onBp2ReadingProgress", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2ReadingFileProgress: ${e.message}")
                }
            }

        // File Read Complete
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2ReadFileComplete)
            .observeForever {
                try {
                    val data = it.data as? Bp2File
                    if (data != null) {
                        val params = Arguments.createMap()
                        params.putInt("model", it.model)
                        
                        params.putString("fileName", data.fileName)
                        params.putInt("type", data.type)
                        
                        if (data.type == 1) { // BP File
                            val file = BpFile(data.content)
                            val bpData = Arguments.createMap()
                            bpData.putDouble("measureTime", file.measureTime.toDouble())
                            params.putMap("bpFile", bpData)
                        } else if (data.type == 2) { // ECG File
                            val file = EcgFile(data.content)
                            val ecgData = Arguments.createMap()
                            ecgData.putDouble("measureTime", file.measureTime.toDouble())
                            ecgData.putDouble("recordingTime", file.recordingTime.toDouble())
                            
                            // Convert ECG data to array safely
                            val ecgArray = Arguments.createArray()
                            FilterUtil.getEcgFileFilterData(it.model, data.content)?.forEach { 
                                ecgArray.pushDouble(it.toDouble()) 
                            }
                            ecgData.putArray("ecgData", ecgArray)
                            
                            // Diagnosis data
                            val diagnosis = Arguments.createMap()
                            diagnosis.putBoolean("isRegular", file.diagnosis.isRegular)
                            diagnosis.putBoolean("isPoorSignal", file.diagnosis.isPoorSignal)
                            diagnosis.putBoolean("isLeadOff", file.diagnosis.isLeadOff)
                            diagnosis.putBoolean("isFastHr", file.diagnosis.isFastHr)
                            diagnosis.putBoolean("isSlowHr", file.diagnosis.isSlowHr)
                            diagnosis.putBoolean("isIrregular", file.diagnosis.isIrregular)
                            diagnosis.putBoolean("isPvcs", file.diagnosis.isPvcs)
                            diagnosis.putBoolean("isHeartPause", file.diagnosis.isHeartPause)
                            diagnosis.putBoolean("isFibrillation", file.diagnosis.isFibrillation)
                            diagnosis.putBoolean("isWideQrs", file.diagnosis.isWideQrs)
                            diagnosis.putBoolean("isProlongedQtc", file.diagnosis.isProlongedQtc)
                            diagnosis.putBoolean("isShortQtc", file.diagnosis.isShortQtc)
                            diagnosis.putString("resultMess", file.diagnosis.resultMess)
                            
                            ecgData.putMap("diagnosis", diagnosis)
                            params.putMap("ecgFile", ecgData)
                        }
                        
                        sendEvent(reactApplicationContext, "onBp2ReadFileComplete", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2ReadFileComplete: ${e.message}")
                }
            }

        // Config Get
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2GetConfig)
            .observeForever {
                try {
                    val config = it.data as? Bp2Config
                    if (config != null) {
                        val params = Arguments.createMap()
                        params.putInt("model", it.model)
                        params.putBoolean("soundOn", config.isSoundOn)
                        sendEvent(reactApplicationContext, "onBp2Config", params)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2GetConfig: ${e.message}")
                }
            }

        // File Read Error
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2ReadFileError)
            .observeForever {
                try {
                    val fileName = it.data as? String ?: ""
                    val params = Arguments.createMap()
                    params.putInt("model", it.model)
                    params.putString("fileName", fileName)
                    sendEvent(reactApplicationContext, "onBp2ReadFileError", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2ReadFileError: ${e.message}")
                }
            }

        // Config Set Result
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2SetConfig)
            .observeForever {
                try {
                    val success = it.data as? Boolean ?: false
                    val params = Arguments.createMap()
                    params.putInt("model", it.model)
                    params.putBoolean("success", success)
                    sendEvent(reactApplicationContext, "onBp2SetConfigResult", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2SetConfig: ${e.message}")
                }
            }

        // Factory Reset Result
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.BP2.EventBp2FactoryReset)
            .observeForever {
                try {
                    val success = it.data as? Boolean ?: false
                    val params = Arguments.createMap()
                    params.putInt("model", it.model)
                    params.putBoolean("success", success)
                    sendEvent(reactApplicationContext, "onBp2FactoryResetResult", params)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in EventBp2FactoryReset: ${e.message}")
                }
            }
    }

    @ReactMethod
    fun initService(promise: Promise) {
        try {
            if (!BleServiceHelper.BleServiceHelper.checkService()) {
                BleServiceHelper.BleServiceHelper.initService(
                    reactApplicationContext.applicationContext as android.app.Application
                )
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in initService: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to init service: ${e.message}")
        }
    }

    @ReactMethod
    fun startScan(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.startScan(supportedModels)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in startScan: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to start scan: ${e.message}")
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.stopScan()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in stopScan: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to stop scan: ${e.message}")
        }
    }

        @ReactMethod
        fun connect(deviceName: String, deviceAddress: String, deviceModel: Int, promise: Promise) {
            try {
                // Get the BluetoothDevice object
                val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
                val device = bluetoothAdapter.getRemoteDevice(deviceAddress)
                
                // Set the interface for the SPECIFIC device model found
                BleServiceHelper.BleServiceHelper.setInterfaces(deviceModel)
                
                // Connect to the device using the correct model
                BleServiceHelper.BleServiceHelper.connect(reactApplicationContext, deviceModel, device)
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error in connect: ${e.message}")
                promise.reject("BP2_ERROR", "Failed to connect: ${e.message}")
            }
        }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.disconnect(false)
            currentModel = null
            currentDevice = null
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error in disconnect: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to disconnect: ${e.message}")
        }
    }

    @ReactMethod
    fun getInfo(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.bp2GetInfo(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in getInfo: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to get device info: ${e.message}")
        }
    }

    @ReactMethod
    fun getConfig(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.bp2GetConfig(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in getConfig: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to get config: ${e.message}")
        }
    }

    @ReactMethod
    fun setConfig(soundOn: Boolean, promise: Promise) {
        try {
            currentModel?.let { model ->
                val config = Bp2Config().apply { isSoundOn = soundOn }
                BleServiceHelper.BleServiceHelper.bp2SetConfig(model, config)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in setConfig: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to set config: ${e.message}")
        }
    }

    @ReactMethod
    fun startRealTime(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.startRtTask(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in startRealTime: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to start real-time: ${e.message}")
        }
    }

    @ReactMethod
    fun stopRealTime(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.stopRtTask(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in stopRealTime: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to stop real-time: ${e.message}")
        }
    }

    @ReactMethod
    fun getFileList(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.bp2GetFileList(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in getFileList: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to get file list: ${e.message}")
        }
    }

    @ReactMethod
    fun readFile(fileName: String, promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.bp2ReadFile(model, fileName)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in readFile: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to read file: ${e.message}")
        }
    }

    @ReactMethod
    fun factoryReset(promise: Promise) {
        try {
            currentModel?.let { model ->
                BleServiceHelper.BleServiceHelper.bp2FactoryReset(model)
                promise.resolve(true)
            } ?: run {
                promise.reject("BP2_ERROR", "No device connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in factoryReset: ${e.message}")
            promise.reject("BP2_ERROR", "Failed to factory reset: ${e.message}")
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

    @ReactMethod
    fun getConnectedDeviceModel(promise: Promise) {
        try {
            currentModel?.let { model ->
                promise.resolve(model)
            } ?: run {
                promise.resolve(-1) // No device connected
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting connected device model: ${e.message}")
            promise.resolve(-1)
        }
    }
}