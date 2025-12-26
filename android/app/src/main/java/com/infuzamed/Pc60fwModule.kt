package com.infuzamed

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jeremyliao.liveeventbus.LiveEventBus
import com.lepu.blepro.constants.Ble
import com.lepu.blepro.event.InterfaceEvent
import com.lepu.blepro.ext.pc60fw.*
import com.lepu.blepro.observer.BIOL
import com.lepu.blepro.ext.BleServiceHelper
import com.lepu.blepro.objs.Bluetooth
import com.lepu.blepro.observer.BleChangeObserver
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import com.lepu.blepro.event.EventMsgConst

class Pc60fwModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), BleChangeObserver {

    private val TAG = "Pc60fwModule"
    private var currentModel = Bluetooth.MODEL_PC60FW
    private var deviceConnected = false

    override fun getName(): String {
        return "Pc60fwModule"
    }

    init {
        // Initialize BIOL observer for all supported models
BIOL(this, intArrayOf(
    Bluetooth.MODEL_PC60FW,
    Bluetooth.MODEL_PC_60NW,
    Bluetooth.MODEL_PC_60NW_1,
    Bluetooth.MODEL_PC66B,
    Bluetooth.MODEL_PF_10,
    Bluetooth.MODEL_PF_20,
    Bluetooth.MODEL_OXYSMART,
    Bluetooth.MODEL_POD2B,
    Bluetooth.MODEL_POD_1W,
    Bluetooth.MODEL_S5W,
    Bluetooth.MODEL_S6W,
    Bluetooth.MODEL_S6W1,
    Bluetooth.MODEL_S7W,
    Bluetooth.MODEL_S7BW,
    Bluetooth.MODEL_PC60NW_BLE,
    Bluetooth.MODEL_PC60NW_WPS,
    Bluetooth.MODEL_PC_60NW_NO_SN,
    Bluetooth.MODEL_OXYFIT_WPS
))
        // Initialize event bus listeners
        initEventBus()
    }

    // Send events to React Native
    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun initBleService(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.initService(reactApplicationContext.applicationContext as android.app.Application)
            promise.resolve("BLE service initialized")
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "Failed to initialize BLE service: ${e.message}")
        }
    }

    @ReactMethod
    fun startScan() {
        Log.d(TAG, "Starting BLE scan")
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
            Log.d(TAG, "Attempting to connect to device: $deviceAddress with model: $deviceModel")
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            if (bluetoothAdapter == null) {
                promise.reject("CONNECTION_ERROR", "Bluetooth not supported")
                return
            }
            
            val bluetoothDevice = bluetoothAdapter.getRemoteDevice(deviceAddress)
            
            // Convert JS model to actual Bluetooth model constant
            val actualModel = convertToBluetoothModel(deviceModel)
            currentModel = actualModel
            
            Log.d(TAG, "Setting interface for model: $actualModel")
            BleServiceHelper.BleServiceHelper.setInterfaces(actualModel)
            BleServiceHelper.BleServiceHelper.connect(reactApplicationContext, actualModel, bluetoothDevice)
            promise.resolve("Connecting to device")
        } catch (e: Exception) {
            Log.e(TAG, "Error connecting to device: ${e.message}")
            promise.reject("CONNECTION_ERROR", "Failed to connect: ${e.message}")
        }
    }

    private fun convertToBluetoothModel(jsModel: Int): Int {
        return when (jsModel) {
            1 -> Bluetooth.MODEL_PC60FW
            2 -> Bluetooth.MODEL_PC_60NW
            3 -> Bluetooth.MODEL_PC_60NW_1
            4 -> Bluetooth.MODEL_PC66B
            5 -> Bluetooth.MODEL_PF_10
            6 -> Bluetooth.MODEL_PF_20
            7 -> Bluetooth.MODEL_OXYSMART
            8 -> Bluetooth.MODEL_POD2B
            9 -> Bluetooth.MODEL_POD_1W
            10 -> Bluetooth.MODEL_S5W
            11 -> Bluetooth.MODEL_S6W
            12 -> Bluetooth.MODEL_S7W
            else -> Bluetooth.MODEL_PC60FW // Default
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            BleServiceHelper.BleServiceHelper.disconnect(false)
            deviceConnected = false
            promise.resolve("Disconnected")
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", "Failed to disconnect: ${e.message}")
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        if (deviceConnected) {
            BleServiceHelper.BleServiceHelper.pc60fwGetInfo(currentModel)
            promise.resolve("Device info requested")
        } else {
            promise.reject("NOT_CONNECTED", "Device not connected")
        }
    }

    @ReactMethod
    fun getBatteryLevel(promise: Promise) {
        if (deviceConnected) {
            // Battery level is automatically sent via events
            promise.resolve("Battery level will be sent via events")
        } else {
            promise.reject("NOT_CONNECTED", "Device not connected")
        }
    }

    // BleChangeObserver implementation
    override fun onBleStateChanged(model: Int, state: Int) {
        Log.d(TAG, "Bluetooth state changed for model $model: $state")
        
        val params = Arguments.createMap()
        params.putInt("model", model)
        params.putInt("state", state)
        params.putBoolean("connected", state == Ble.State.CONNECTED)
        
        deviceConnected = state == Ble.State.CONNECTED
        sendEvent("onBleStateChanged", params)
    }

    // Initialize event bus listeners
    private fun initEventBus() {
        // Device Info - FIXED: Using correct property access
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.PC60Fw.EventPC60FwDeviceInfo)
            .observeForever {
                if (it.model == currentModel) {
                    val data = it.data as DeviceInfo
                    val params = Arguments.createMap()
                    
                    // Extract available information from DeviceInfo
                    // Since we don't know exact properties, send the string representation
                    // and try to extract common fields
                    params.putString("rawDeviceInfo", data.toString())
                    
                    // Try to get basic info using reflection or common methods
                    try {
                        // Check if deviceName field exists
                        val nameField = data.javaClass.declaredFields.find { it.name == "deviceName" }
                        if (nameField != null) {
                            nameField.isAccessible = true
                            val nameValue = nameField.get(data) as? String
                            params.putString("deviceName", nameValue ?: "Unknown")
                        } else {
                            params.putString("deviceName", "Unknown Device")
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error extracting device name: ${e.message}")
                        params.putString("deviceName", "Unknown Device")
                    }
                    
                    sendEvent("onDeviceInfo", params)
                }
            }

        // Real-time Parameters
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.PC60Fw.EventPC60FwRtParam)
            .observeForever {
                if (it.model == currentModel) {
                    val data = it.data as RtParam
                    val params = Arguments.createMap()
                    params.putInt("spo2", data.spo2)
                    params.putInt("pr", data.pr)
                    params.putDouble("pi", data.pi.toDouble())
                    params.putBoolean("isProbeOff", data.isProbeOff)
                    params.putBoolean("isPulseSearching", data.isPulseSearching)
                    sendEvent("onRtParam", params)
                }
            }

        // Real-time Waveform
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.PC60Fw.EventPC60FwRtWave)
            .observeForever {
                if (it.model == currentModel) {
                    val data = it.data as RtWave
                    val waveArray = Arguments.createArray()
                    data.waveIntData.forEach { value ->
                        waveArray.pushInt(value)
                    }
                    val params = Arguments.createMap()
                    params.putArray("waveData", waveArray)
                    sendEvent("onRtWave", params)
                }
            }

        // Battery Level
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.PC60Fw.EventPC60FwBatLevel)
            .observeForever {
                if (it.model == currentModel) {
                    val data = it.data as Int
                    val batteryPercent = when (data) {
                        0 -> 25
                        1 -> 50
                        2 -> 75
                        3 -> 100
                        else -> 0
                    }
                    val params = Arguments.createMap()
                    params.putInt("batteryLevel", batteryPercent)
                    sendEvent("onBatteryLevel", params)
                }
            }

        // Working Status
        LiveEventBus.get<InterfaceEvent>(InterfaceEvent.PC60Fw.EventPC60FwWorkingStatus)
            .observeForever {
                if (it.model == currentModel) {
                    val data = it.data as WorkingStatus
                    val params = Arguments.createMap()
                    params.putInt("mode", data.mode)
                    params.putInt("step", data.step)
                    params.putInt("para1", data.para1)
                    params.putInt("para2", data.para2)
                    
                    // Add human-readable descriptions
                    params.putString("modeText", getModeText(data.mode))
                    params.putString("stepText", getStepText(data.step))
                    params.putString("resultText", getResultText(data.para1))
                    
                    sendEvent("onWorkingStatus", params)
                }
            }
            
        // Device Found during scan
        LiveEventBus.get<Bluetooth>(EventMsgConst.Discovery.EventDeviceFound)
            .observeForever { bluetoothDevice ->
                Log.d(TAG, "Device found: ${bluetoothDevice.name} - ${bluetoothDevice.device?.address ?: "No address"}")
                
                val params = Arguments.createMap()
                params.putString("name", bluetoothDevice.name ?: "Unknown Device")
                
                // Extract address from the underlying BluetoothDevice
                val address = bluetoothDevice.device?.address ?: ""
                params.putString("address", address)
                
                sendEvent("onDeviceFound", params)
            }
            
        // Service initialized
        LiveEventBus.get<Boolean>(EventMsgConst.Ble.EventServiceConnectedAndInterfaceInit)
            .observeForever { initialized ->
                val params = Arguments.createMap()
                params.putBoolean("initialized", initialized)
                sendEvent("onServiceInitialized", params)
            }

        // Device ready event - CRITICAL for connection flow
        LiveEventBus.get<Int>(EventMsgConst.Ble.EventBleDeviceReady)
            .observeForever { modelReady ->
                Log.d(TAG, "Device ready event received for model: $modelReady")
                if (modelReady == currentModel) {
                    deviceConnected = true
                    val params = Arguments.createMap()
                    params.putInt("model", modelReady)
                    params.putBoolean("connected", true)
                    sendEvent("onBleDeviceReady", params)
                    
                    // Automatically request device info when connected
                    BleServiceHelper.BleServiceHelper.pc60fwGetInfo(currentModel)
                }
            }
    }

    private fun getModeText(mode: Int): String {
        return when (mode) {
            0x01 -> "Spot Check"
            0x02 -> "Continuous"
            0x03 -> "Menu"
            else -> "Unknown"
        }
    }

    private fun getStepText(step: Int): String {
        return when (step) {
            0x00 -> "Idle"
            0x01 -> "Preparing"
            0x02 -> "Measuring"
            0x03 -> "Result"
            0x04 -> "Analysis Result"
            0x05 -> "Finish"
            else -> "Unknown"
        }
    }

    private fun getResultText(resultCode: Int): String {
        return when (resultCode) {
            0x00 -> "No irregularity found"
            0x01 -> "Suspected a little fast pulse"
            0x02 -> "Suspected fast pulse"
            0x03 -> "Suspected short run of fast pulse"
            0x04 -> "Suspected a little slow pulse"
            0x05 -> "Suspected slow pulse"
            0x06 -> "Suspected occasional short pulse interval"
            0x07 -> "Suspected irregular pulse interval"
            0x08 -> "Suspected fast pulse with short pulse interval"
            0x09 -> "Suspected slow pulse with short pulse interval"
            0x0A -> "Suspected slow pulse with irregular pulse interval"
            0xFF -> "Poor signal. Measure again"
            else -> "Unknown result"
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