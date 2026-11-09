/**
 * REALCal Bookings - Smart Device Fleet & Firmware Repository
 * Manages IoT devices across properties: SmartLocks (Yamiry), Gateways, Thermostats, and Environmental Sensors.
 */

import { SmartDevice, DeviceCategory } from '../types';

export const INITIAL_DEVICES: SmartDevice[] = [
  // ==========================================
  // STONEWALL VILLA (Primary Live Property)
  // ==========================================
  {
    id: 'dev-stonewall-front',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Front Main Entry SmartLock',
    category: 'smartlock',
    model: 'Yamiry SmartLock Pro YM-300',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM300-ATL-884920',
    macAddress: '9C:B6:D0:41:8A:22',
    ipAddress: '192.168.1.142',
    hardwareRevision: 'HW Rev 4.2 (Nordic nRF52840 BLE 5.3)',
    chipset: 'Nordic nRF52840 ARM Cortex-M4 @ 64MHz',
    locationRoom: 'Main Front Door',
    batteryPercent: 88,
    powerSource: 'battery',
    signalStrengthDbm: -58,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v2.4.1',
      latestVersion: 'v2.5.0-LTS',
      releaseDate: 'Nov 2, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 4420000,
      minBatteryPercent: 25,
      sha256Checksum: '8f7a29e4d1b8c06782a176e33fbc1936c7a6e1180b27d425b0f19a4e3208df1a',
      releaseNotes: [
        'Enhanced Nordic BLE 5.3 low-power connection interval to extend battery life by 18%',
        'Optimized physical keypad input sampling; reduced touch debounce latency to 12ms',
        'Strengthened offline PIN validation algorithm with AES-256 GCM authentication',
        'Resolved intermittent auto-relock delay when door sensor detects micro-vibrations'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 05:00',
    updateHistory: [
      {
        id: 'log-1',
        fromVersion: 'v2.3.8',
        toVersion: 'v2.4.1',
        installedAt: '2026-08-14T03:12:00Z',
        installedBy: 'OTA Auto-Scheduler',
        status: 'success',
        durationSeconds: 42,
        notes: 'Scheduled maintenance window update completed successfully.'
      }
    ],
    selfTestReport: {
      lastTestedAt: new Date(Date.now() - 36 * 60 * 1000).toISOString(),
      passed: true,
      latencyMs: 24,
      diagnostics: {
        keypadOk: true,
        motorLatchOk: true,
        tamperSwitchOk: true,
        bleBeaconOk: true,
        storageOk: true,
        voltageLevel: 6.2
      }
    }
  },
  {
    id: 'dev-stonewall-gateway',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Central IoT Wi-Fi Cloud Gateway',
    category: 'gateway',
    model: 'Yamiry G3 IoT Cloud Gateway Bridge',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YMG3-ATL-771923',
    macAddress: 'D8:3A:DD:99:3F:10',
    ipAddress: '192.168.1.100',
    hardwareRevision: 'HW Rev 2.1 (Dual-Band Wi-Fi 6 + Zigbee 3.0)',
    chipset: 'Espressif ESP32-S3 Dual-Core @ 240MHz',
    locationRoom: 'Living Room Media Hub',
    batteryPercent: -1,
    powerSource: 'ac_hardwired',
    signalStrengthDbm: -42,
    connectionType: 'wifi',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v3.1.0-build.82',
      latestVersion: 'v3.2.1-security',
      releaseDate: 'Nov 5, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: true,
      channel: 'stable',
      sizeBytes: 8940000,
      minBatteryPercent: 0,
      sha256Checksum: '992a543fbc01da9e5781a733cd88b901fc412e8674519abcdf80332ef47b3112',
      releaseNotes: [
        'CRITICAL SECURITY: Upgraded mTLS certificate chain and TLS 1.3 cipher suites for Seam & AWS IoT relays',
        'Fixed MQTT keep-alive socket teardown issue during ISP micro-disconnects',
        'Doubled local BLE relay queue depth for simultaneous multi-lock code provisioning',
        'Enhanced diagnostic syslog streaming to cloud telemetry servers'
      ]
    },
    autoUpdateEnabled: false,
    autoUpdateWindow: '02:00 - 04:00',
    updateHistory: [
      {
        id: 'log-2',
        fromVersion: 'v3.0.4',
        toVersion: 'v3.1.0-build.82',
        installedAt: '2026-06-20T02:04:15Z',
        installedBy: 'Admin (dlaniger)',
        status: 'success',
        durationSeconds: 58,
        notes: 'Manual upgrade prior to peak summer occupancy.'
      }
    ],
    selfTestReport: {
      lastTestedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      passed: true,
      latencyMs: 11,
      diagnostics: {
        keypadOk: true,
        motorLatchOk: true,
        tamperSwitchOk: true,
        bleBeaconOk: true,
        storageOk: true,
        voltageLevel: 5.0
      }
    }
  },
  {
    id: 'dev-stonewall-bed-master',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Master Bedroom Suite SmartLock',
    category: 'smartlock',
    model: 'Yamiry TouchSmart Bedroom Lever YM-80',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM80-ATL-109283',
    macAddress: '9C:B6:D0:62:3B:44',
    ipAddress: '192.168.1.144',
    hardwareRevision: 'HW Rev 3.0 (BLE 5.2 Micro Lever)',
    chipset: 'Silicon Labs EFR32BG22 Cortex-M33',
    locationRoom: 'Master Bedroom',
    batteryPercent: 74,
    powerSource: 'battery',
    signalStrengthDbm: -64,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v1.9.4',
      latestVersion: 'v2.0.2',
      releaseDate: 'Oct 28, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 2840000,
      minBatteryPercent: 20,
      sha256Checksum: 'e2b34a71c890123ef6a10098dfacb6719842100cbda7619283471bbad0981eef',
      releaseNotes: [
        'Added configurable auto-relock timing (5s, 10s, 30s) directly via PIN programming',
        'Touch-key capacitive sensor self-calibration on temperature fluctuations',
        'Battery drain mitigation during prolonged gateway search periods'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 05:00',
    updateHistory: [
      {
        id: 'log-3',
        fromVersion: 'v1.8.0',
        toVersion: 'v1.9.4',
        installedAt: '2026-05-10T04:19:00Z',
        installedBy: 'OTA Auto-Scheduler',
        status: 'success',
        durationSeconds: 38
      }
    ],
    selfTestReport: {
      lastTestedAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
      passed: true,
      latencyMs: 31,
      diagnostics: {
        keypadOk: true,
        motorLatchOk: true,
        tamperSwitchOk: true,
        bleBeaconOk: true,
        storageOk: true,
        voltageLevel: 5.9
      }
    }
  },
  {
    id: 'dev-stonewall-bed-101',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Guest Bedroom 101 SmartLock',
    category: 'smartlock',
    model: 'Yamiry TouchSmart Bedroom Lever YM-80',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM80-ATL-109284',
    macAddress: '9C:B6:D0:62:3B:45',
    ipAddress: '192.168.1.145',
    hardwareRevision: 'HW Rev 3.0 (BLE 5.2 Micro Lever)',
    chipset: 'Silicon Labs EFR32BG22 Cortex-M33',
    locationRoom: 'Guest Bedroom 101',
    batteryPercent: 91,
    powerSource: 'battery',
    signalStrengthDbm: -61,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v2.0.2',
      latestVersion: 'v2.0.2',
      releaseDate: 'Oct 28, 2026',
      updateAvailable: false,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 2840000,
      minBatteryPercent: 20,
      sha256Checksum: 'e2b34a71c890123ef6a10098dfacb6719842100cbda7619283471bbad0981eef',
      releaseNotes: [
        'Device is running the latest production firmware with all security and performance patches.'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 05:00',
    updateHistory: [
      {
        id: 'log-4',
        fromVersion: 'v1.9.4',
        toVersion: 'v2.0.2',
        installedAt: '2026-10-30T03:45:00Z',
        installedBy: 'OTA Auto-Scheduler',
        status: 'success',
        durationSeconds: 36
      }
    ]
  },
  {
    id: 'dev-stonewall-bed-102',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Guest Bedroom 102 SmartLock',
    category: 'smartlock',
    model: 'Yamiry TouchSmart Bedroom Lever YM-80',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM80-ATL-109285',
    macAddress: '9C:B6:D0:62:3B:46',
    ipAddress: '192.168.1.146',
    hardwareRevision: 'HW Rev 3.0 (BLE 5.2 Micro Lever)',
    chipset: 'Silicon Labs EFR32BG22 Cortex-M33',
    locationRoom: 'Guest Bedroom 102',
    batteryPercent: 82,
    powerSource: 'battery',
    signalStrengthDbm: -68,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v1.9.4',
      latestVersion: 'v2.0.2',
      releaseDate: 'Oct 28, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 2840000,
      minBatteryPercent: 20,
      sha256Checksum: 'e2b34a71c890123ef6a10098dfacb6719842100cbda7619283471bbad0981eef',
      releaseNotes: [
        'Added configurable auto-relock timing (5s, 10s, 30s) directly via PIN programming',
        'Touch-key capacitive sensor self-calibration on temperature fluctuations',
        'Battery drain mitigation during prolonged gateway search periods'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 05:00'
  },
  {
    id: 'dev-stonewall-thermostat',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Main Zone Climate Thermostat',
    category: 'thermostat',
    model: 'Ecobee Smart Thermostat Premium',
    manufacturer: 'Ecobee Inc.',
    serialNumber: 'ECO-ATL-554199',
    macAddress: '44:61:32:89:C4:1A',
    ipAddress: '192.168.1.130',
    hardwareRevision: 'Rev 5.1 (Voice + Radar Occupancy)',
    chipset: 'Qualcomm Snapdragon Wear 4100+',
    locationRoom: 'Central Hallway',
    batteryPercent: -1,
    powerSource: 'ac_hardwired',
    signalStrengthDbm: -48,
    connectionType: 'wifi',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v4.8.12',
      latestVersion: 'v4.8.12',
      releaseDate: 'Oct 15, 2026',
      updateAvailable: false,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 14200000,
      minBatteryPercent: 0,
      sha256Checksum: '44a89bc2130fa8cde4918731adbc01827461938bdfae182937401928374619a0',
      releaseNotes: [
        'Smart occupancy sensing algorithm update for multi-bedroom vacation rentals',
        'HVAC freeze protection temperature safety margin adjustments'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '04:00 - 05:00'
  },
  {
    id: 'dev-stonewall-minut',
    propertyId: 'stonewall-villa',
    propertyName: 'Stonewall Villa',
    name: 'Noise & Environmental Sentry',
    category: 'sensor',
    model: 'Minut Smart Sensor V3',
    manufacturer: 'Minut Inc.',
    serialNumber: 'MNT-ATL-992381',
    macAddress: '70:B3:D5:E8:11:5A',
    ipAddress: '192.168.1.138',
    hardwareRevision: 'Gen 3 Hardware (PIR + Mic + Cigarette Smoke)',
    chipset: 'ARM Cortex-M4F Low Power',
    locationRoom: 'Great Room Ceiling',
    batteryPercent: 95,
    powerSource: 'battery',
    signalStrengthDbm: -52,
    connectionType: 'wifi',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v3.0.4',
      latestVersion: 'v3.1.1',
      releaseDate: 'Nov 1, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 3100000,
      minBatteryPercent: 20,
      sha256Checksum: 'aa1947bca8210385918237461902837461928374019283746192837401928374',
      releaseNotes: [
        'Improved acoustic filtering to eliminate false noise spikes from HVAC vent airflow',
        'Enhanced cigarette smoke & vape aerosol optical chamber sensitivity',
        'Reduced Wi-Fi transmission power on idle states to preserve 1-year battery life'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 04:00'
  },

  // ==========================================
  // OCEANVIEW PARADISE VILLA (Admin-Only Test Property)
  // ==========================================
  {
    id: 'dev-oceanview-front',
    propertyId: 'oceanview-paradise-villa',
    propertyName: 'Oceanview Paradise Villa',
    name: 'Oceanfront Entry Smart Deadbolt',
    category: 'smartlock',
    model: 'Yamiry Commercial Deadbolt YM-900',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM900-MIA-440192',
    macAddress: '9C:B6:D0:88:E2:01',
    ipAddress: '192.168.2.110',
    hardwareRevision: 'HW Rev 5.0 (Stainless Marine Salt-Resistant)',
    chipset: 'Nordic nRF5340 Dual-Core SoC',
    locationRoom: 'Oceanfront Main Gate',
    batteryPercent: 78,
    powerSource: 'battery',
    signalStrengthDbm: -63,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v3.4.0',
      latestVersion: 'v3.5.1',
      releaseDate: 'Nov 3, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 5120000,
      minBatteryPercent: 20,
      sha256Checksum: '1182746192837401928374619283740192837461928374019283746192837401',
      releaseNotes: [
        'Enhanced humidity calibration for marine salt air environments',
        'Added high-torque motor burst for heavy hurricane-rated exterior doors',
        'Immediate audio buzzer alert when lock bolt faces physical jamb resistance'
      ]
    },
    autoUpdateEnabled: false,
    autoUpdateWindow: '02:00 - 04:00'
  },
  {
    id: 'dev-oceanview-gateway',
    propertyId: 'oceanview-paradise-villa',
    propertyName: 'Oceanview Paradise Villa',
    name: 'Oceanfront Wi-Fi IoT Gateway',
    category: 'gateway',
    model: 'Yamiry G3 IoT Cloud Gateway Bridge',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YMG3-MIA-990184',
    macAddress: 'D8:3A:DD:12:88:FF',
    ipAddress: '192.168.2.100',
    hardwareRevision: 'HW Rev 2.1',
    chipset: 'Espressif ESP32-S3 Dual-Core @ 240MHz',
    locationRoom: 'Living Room Media Cabinet',
    batteryPercent: -1,
    powerSource: 'ac_hardwired',
    signalStrengthDbm: -40,
    connectionType: 'wifi',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v3.2.1-security',
      latestVersion: 'v3.2.1-security',
      releaseDate: 'Nov 5, 2026',
      updateAvailable: false,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 8940000,
      minBatteryPercent: 0,
      sha256Checksum: '992a543fbc01da9e5781a733cd88b901fc412e8674519abcdf80332ef47b3112',
      releaseNotes: [
        'Gateway is fully patched with latest TLS 1.3 security stack and mTLS relays.'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '03:00 - 05:00'
  },

  // ==========================================
  // MOUNTAIN RETREAT CABIN (Admin-Only Test Property)
  // ==========================================
  {
    id: 'dev-mountain-front',
    propertyId: 'mountain-retreat-cabin',
    propertyName: 'Mountain Retreat Cabin',
    name: 'Timber Entry WeatherShield SmartLock',
    category: 'smartlock',
    model: 'Yamiry WeatherShield Lock YM-450',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YM450-BR-339182',
    macAddress: '9C:B6:D0:33:41:99',
    ipAddress: '192.168.3.120',
    hardwareRevision: 'HW Rev 4.0 (Sub-Zero Cold Weather Resistant)',
    chipset: 'Nordic nRF52840 SoC',
    locationRoom: 'Front Porch Timber Door',
    batteryPercent: 86,
    powerSource: 'battery',
    signalStrengthDbm: -67,
    connectionType: 'ble',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v2.3.0',
      latestVersion: 'v2.4.5',
      releaseDate: 'Nov 4, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 4680000,
      minBatteryPercent: 25,
      sha256Checksum: '3349182746192837401928374619283740192837461928374019283746192837',
      releaseNotes: [
        'Added sub-zero battery compensation curve for mountain winter climates down to -20°F',
        'Motor pre-heat cycle to prevent latch freeze in high humidity / freezing rain conditions',
        'Optimized keypad LED backlighting duration for nighttime mountain arrivals'
      ]
    },
    autoUpdateEnabled: true,
    autoUpdateWindow: '04:00 - 06:00'
  },
  {
    id: 'dev-mountain-gateway',
    propertyId: 'mountain-retreat-cabin',
    propertyName: 'Mountain Retreat Cabin',
    name: 'Mountain Cabin Wi-Fi Gateway',
    category: 'gateway',
    model: 'Yamiry G2 Wi-Fi Gateway Bridge',
    manufacturer: 'Yamiry Smart Living Corp.',
    serialNumber: 'YMG2-BR-118274',
    macAddress: 'D8:3A:DD:77:22:11',
    ipAddress: '192.168.3.100',
    hardwareRevision: 'HW Rev 1.9',
    chipset: 'Espressif ESP32-WROOM-32',
    locationRoom: 'Great Room Mantel',
    batteryPercent: -1,
    powerSource: 'ac_hardwired',
    signalStrengthDbm: -58,
    connectionType: 'wifi',
    status: 'online',
    lastHeartbeat: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    firmware: {
      currentVersion: 'v2.8.0',
      latestVersion: 'v2.9.2',
      releaseDate: 'Nov 1, 2026',
      updateAvailable: true,
      criticalSecurityUpdate: false,
      channel: 'stable',
      sizeBytes: 6400000,
      minBatteryPercent: 0,
      sha256Checksum: '9182736450192837461928374019283746192837401928374619283740192837',
      releaseNotes: [
        'Enhanced reconnection reliability for satellite and mountain broadband connections',
        'Local PIN code caching expansion for offline guest entries during mountain storms'
      ]
    },
    autoUpdateEnabled: false,
    autoUpdateWindow: '03:00 - 05:00'
  }
];

const LOCAL_STORAGE_KEY = 'realcal_smart_devices_v1';

/**
 * Loads devices from local storage if available, falling back to INITIAL_DEVICES.
 */
export function getStoredDevices(): SmartDevice[] {
  if (typeof window === 'undefined') return INITIAL_DEVICES;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEVICES));
      return INITIAL_DEVICES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEVICES));
      return INITIAL_DEVICES;
    }
    return parsed;
  } catch (e) {
    console.error('Error reading devices from localStorage:', e);
    return INITIAL_DEVICES;
  }
}

/**
 * Saves updated devices array to localStorage and notifies listeners.
 */
export function saveStoredDevices(devices: SmartDevice[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
    window.dispatchEvent(new CustomEvent('realcal:devices_updated', { detail: devices }));
  } catch (e) {
    console.error('Error saving devices to localStorage:', e);
  }
}

/**
 * Applies a firmware update to a specific device, logging the transition.
 */
export function applyFirmwareUpdate(
  deviceId: string, 
  targetVersion: string, 
  installedBy: string = 'User'
): { updatedDevice: SmartDevice | null; allDevices: SmartDevice[] } {
  const current = getStoredDevices();
  let updatedDevice: SmartDevice | null = null;

  const nextDevices = current.map((device) => {
    if (device.id !== deviceId) return device;

    const oldVersion = device.firmware.currentVersion;
    const isNowLatest = targetVersion === device.firmware.latestVersion;

    const newHistoryEntry = {
      id: `log-${Date.now()}`,
      fromVersion: oldVersion,
      toVersion: targetVersion,
      installedAt: new Date().toISOString(),
      installedBy,
      status: 'success' as const,
      durationSeconds: Math.floor(35 + Math.random() * 25),
      notes: `Firmware upgrade to ${targetVersion} successfully flashed and verified via OTA.`
    };

    const updated: SmartDevice = {
      ...device,
      status: 'online',
      lastHeartbeat: new Date().toISOString(),
      firmware: {
        ...device.firmware,
        currentVersion: targetVersion,
        updateAvailable: !isNowLatest,
        criticalSecurityUpdate: false
      },
      updateHistory: [newHistoryEntry, ...(device.updateHistory || [])]
    };

    updatedDevice = updated;
    return updated;
  });

  saveStoredDevices(nextDevices);
  return { updatedDevice, allDevices: nextDevices };
}

/**
 * Simulates running a device ping / self-test.
 */
export function executeDeviceSelfTest(deviceId: string): SmartDevice | null {
  const current = getStoredDevices();
  let resultDevice: SmartDevice | null = null;

  const nextDevices = current.map((device) => {
    if (device.id !== deviceId) return device;

    const isBattery = device.powerSource === 'battery';
    const updated: SmartDevice = {
      ...device,
      lastHeartbeat: new Date().toISOString(),
      status: 'online',
      selfTestReport: {
        lastTestedAt: new Date().toISOString(),
        passed: true,
        latencyMs: Math.floor(12 + Math.random() * 28),
        diagnostics: {
          keypadOk: true,
          motorLatchOk: true,
          tamperSwitchOk: true,
          bleBeaconOk: true,
          storageOk: true,
          voltageLevel: isBattery ? +(5.6 + Math.random() * 0.7).toFixed(1) : 5.0
        }
      }
    };
    resultDevice = updated;
    return updated;
  });

  saveStoredDevices(nextDevices);
  return resultDevice;
}
