import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Cpu, 
  Wifi, 
  Battery, 
  BatteryLow, 
  CheckCircle2, 
  ShieldAlert, 
  Sliders, 
  Lock, 
  Key, 
  Thermometer, 
  Activity, 
  Clock, 
  Download, 
  X, 
  ChevronDown, 
  Search, 
  LogOut, 
  Calendar as CalendarIcon, 
  Compass, 
  Star, 
  HelpCircle, 
  Server, 
  Terminal, 
  Zap, 
  RefreshCw, 
  ShieldCheck, 
  ArrowLeft 
} from 'lucide-react';
import { useAuth, isAdminEmail } from '../contexts/AuthContext';
import { signIn, signOut } from '../lib/firebase';
import { SmartDevice, DeviceCategory } from '../types';
import { 
  getStoredDevices, 
  saveStoredDevices, 
  applyFirmwareUpdate, 
  executeDeviceSelfTest 
} from '../data/devicesData';
import { KNOWN_PROPERTY_PROFILES } from '../data/propertyLocations';
import { LegalFooter } from '../components/LegalFooter';
import { cn } from '../lib/utils';

export function DeviceSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isAdmin = Boolean(user && (user.role === 'admin' || isAdminEmail(user.email)));

  // Devices State
  const [devices, setDevices] = useState<SmartDevice[]>(() => getStoredDevices());
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'outdated' | 'up_to_date'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date>(() => new Date());

  // Active Firmware Update Modal State (RESTRICTED TO ADMINS)
  const [updatingDevice, setUpdatingDevice] = useState<SmartDevice | null>(null);
  const [otaProgress, setOtaProgress] = useState<number>(0);
  const [otaStage, setOtaStage] = useState<string>('');
  const [otaLogs, setOtaLogs] = useState<string[]>([]);
  const [otaStatus, setOtaStatus] = useState<'idle' | 'downloading' | 'verifying' | 'flashing' | 'rebooting' | 'completed' | 'failed'>('idle');

  // Device Settings Modal State (Auto-update, channel, relock - RESTRICTED TO ADMINS)
  const [editingSettingsDevice, setEditingSettingsDevice] = useState<SmartDevice | null>(null);
  const [tempAutoUpdate, setTempAutoUpdate] = useState<boolean>(true);
  const [tempAutoWindow, setTempAutoWindow] = useState<string>('03:00 - 05:00');
  const [tempChannel, setTempChannel] = useState<'stable' | 'beta'>('stable');

  // Self-Test / Ping Running State
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);

  // Expanded technical specs card tracking
  const [expandedDeviceIds, setExpandedDeviceIds] = useState<Record<string, boolean>>({});

  // Sync with localStorage updates across tabs / events
  useEffect(() => {
    const handleStorageUpdate = (e: any) => {
      if (e.detail) {
        setDevices(e.detail);
      } else {
        setDevices(getStoredDevices());
      }
    };
    window.addEventListener('realcal:devices_updated', handleStorageUpdate);
    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      window.removeEventListener('realcal:devices_updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, []);

  // Filter properties based on role constraint:
  // "ONLY Admins can see the TEST Properties: Oceanview Paradise Villa, Mountain Retreat Cabin"
  const accessibleProperties = useMemo(() => {
    return KNOWN_PROPERTY_PROFILES.filter(p => {
      if (p.isTestProperty) {
        return isAdmin;
      }
      return true;
    });
  }, [isAdmin]);

  // Filter devices based on accessible properties, selected category, status, and search
  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      // 1. Non-Admin Category Restriction (SmartLocks, IoT Gateways & Badges, Climate Thermostats, Safety & Sensors)
      const RESTRICTED_CATEGORIES: string[] = ['smartlock', 'gateway', 'thermostat', 'sensor'];
      if (!isAdmin && RESTRICTED_CATEGORIES.includes(dev.category)) {
        return false;
      }

      // 2. Property access check
      const prop = KNOWN_PROPERTY_PROFILES.find(p => p.id === dev.propertyId);
      if (prop?.isTestProperty && !isAdmin) {
        return false;
      }
      if (selectedPropertyId !== 'all' && dev.propertyId !== selectedPropertyId) {
        return false;
      }

      // 3. Category check
      if (selectedCategory !== 'all' && dev.category !== selectedCategory) {
        return false;
      }

      // 3. Status filter (Only applied if admin)
      if (isAdmin) {
        if (selectedStatusFilter === 'outdated' && !dev.firmware.updateAvailable) {
          return false;
        }
        if (selectedStatusFilter === 'up_to_date' && dev.firmware.updateAvailable) {
          return false;
        }
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = dev.name.toLowerCase().includes(q);
        const matchModel = dev.model.toLowerCase().includes(q);
        const matchSerial = dev.serialNumber.toLowerCase().includes(q);
        const matchMac = dev.macAddress.toLowerCase().includes(q);
        const matchRoom = (dev.locationRoom || '').toLowerCase().includes(q);
        const matchProp = dev.propertyName.toLowerCase().includes(q);
        return matchName || matchModel || matchSerial || matchMac || matchRoom || matchProp;
      }

      return true;
    });
  }, [devices, isAdmin, selectedPropertyId, selectedCategory, selectedStatusFilter, searchQuery]);

  // Summary counts
  const totalAccessibleCount = filteredDevices.length;
  const updatesAvailableCount = filteredDevices.filter(d => d.firmware.updateAvailable).length;
  const criticalUpdatesCount = filteredDevices.filter(d => d.firmware.criticalSecurityUpdate).length;
  const upToDateCount = totalAccessibleCount - updatesAvailableCount;

  // Handle Check For Updates (RESTRICTED TO ADMINS)
  const handleCheckForUpdates = () => {
    if (!isAdmin) {
      alert("Access Denied: Checking for firmware updates is restricted to Property Administrators.");
      return;
    }
    setIsCheckingUpdates(true);
    setTimeout(() => {
      setLastCheckedAt(new Date());
      setIsCheckingUpdates(false);
    }, 750);
  };

  // Launch OTA Update flow (RESTRICTED TO ADMINS)
  const handleStartOtaUpdate = (device: SmartDevice) => {
    if (!isAdmin) {
      alert("Access Denied: Firmware updates and OTA flashing are restricted to Property Administrators.");
      return;
    }

    setUpdatingDevice(device);
    setOtaProgress(5);
    setOtaStatus('downloading');
    setOtaStage('Connecting to secure REALCal OTA CDN server...');
    setOtaLogs([
      `[${new Date().toLocaleTimeString()}] Initializing OTA update session for ${device.name}`,
      `[OTA-SESSION] Target Hardware: ${device.model} (S/N: ${device.serialNumber})`,
      `[OTA-CHANNEL] Channel: ${device.firmware.channel.toUpperCase()} · Target Version: ${device.firmware.latestVersion}`,
      `[OTA-DOWNLOAD] Fetching binary payload (${(device.firmware.sizeBytes / 1000000).toFixed(2)} MB)...`
    ]);

    // Simulate multi-stage OTA update
    let currentProgress = 5;
    const interval = setInterval(() => {
      currentProgress += Math.floor(10 + Math.random() * 15);
      
      if (currentProgress < 30) {
        setOtaProgress(currentProgress);
        setOtaStage(`Downloading signed binary package (${currentProgress}%)...`);
        setOtaLogs(prev => [
          ...prev, 
          `[OTA-DOWNLOAD] Block chunk at offset 0x00${currentProgress.toString(16).padStart(4, '0')} received OK`
        ]);
      } else if (currentProgress < 55) {
        setOtaStatus('verifying');
        setOtaProgress(currentProgress);
        setOtaStage('Verifying SHA-256 cryptographic signature & hardware compatibility...');
        setOtaLogs(prev => {
          if (!prev.some(l => l.includes('SHA-256'))) {
            return [
              ...prev,
              `[SECURITY] Validating SHA-256: ${device.firmware.sha256Checksum.slice(0, 16)}...`,
              `[SECURITY] Cryptographic signature matches REALCal Hardware Authority.`
            ];
          }
          return prev;
        });
      } else if (currentProgress < 85) {
        setOtaStatus('flashing');
        setOtaProgress(currentProgress);
        setOtaStage(`Streaming firmware blocks over ${device.connectionType.toUpperCase()} to EEPROM (${currentProgress}%)...`);
        setOtaLogs(prev => [
          ...prev,
          `[FLASH-ROM] Writing sectors at 0x${(currentProgress * 256).toString(16)} · CRC32: OK`
        ]);
      } else if (currentProgress < 98) {
        setOtaStatus('rebooting');
        setOtaProgress(92);
        setOtaStage('Flashing complete. Microcontroller soft reboot & hardware handshake...');
        setOtaLogs(prev => {
          if (!prev.some(l => l.includes('REBOOT'))) {
            return [
              ...prev,
              `[REBOOT] Sending soft-reset signal to ${device.chipset}...`,
              `[HANDSHAKE] Awaiting post-boot BLE beacon ping...`
            ];
          }
          return prev;
        });
      } else {
        clearInterval(interval);
        setOtaProgress(100);
        setOtaStatus('completed');
        setOtaStage(`Firmware successfully updated to ${device.firmware.latestVersion}!`);
        setOtaLogs(prev => [
          ...prev,
          `[ONLINE] Device ping response in 14ms.`,
          `[VERIFIED] Running Firmware Version: ${device.firmware.latestVersion}`,
          `[SUCCESS] OTA deployment finalized. All registers normal.`
        ]);

        // Apply update in persistent storage
        const { allDevices } = applyFirmwareUpdate(
          device.id, 
          device.firmware.latestVersion, 
          user?.displayName || user?.email || 'Authorized Administrator'
        );
        setDevices(allDevices);
      }
    }, 450);
  };

  // Close OTA Modal
  const handleCloseOtaModal = () => {
    if (otaStatus !== 'idle' && otaStatus !== 'completed' && otaStatus !== 'failed') {
      if (!confirm('Firmware is currently being flashed. Are you sure you want to dismiss the progress view? The update will continue in the background.')) {
        return;
      }
    }
    setUpdatingDevice(null);
    setOtaProgress(0);
    setOtaStatus('idle');
    setOtaLogs([]);
  };

  // Run Self-Test / Ping on device (Accessible to all users)
  const handleRunSelfTest = (deviceId: string) => {
    setTestingDeviceId(deviceId);
    setTimeout(() => {
      const updated = executeDeviceSelfTest(deviceId);
      if (updated) {
        setDevices(getStoredDevices());
      }
      setTestingDeviceId(null);
    }, 600);
  };

  // Run Self-Test across all visible devices (Accessible to all users)
  const handleTestAllDevices = () => {
    setIsTestingAll(true);
    setTimeout(() => {
      filteredDevices.forEach(d => {
        executeDeviceSelfTest(d.id);
      });
      setDevices(getStoredDevices());
      setIsTestingAll(false);
    }, 850);
  };

  // Batch Update All Outdated Devices (RESTRICTED TO ADMINS)
  const handleBatchUpdateAll = () => {
    if (!isAdmin) {
      alert("Access Denied: Batch firmware updates are restricted to Property Administrators.");
      return;
    }

    const outdated = filteredDevices.filter(d => d.firmware.updateAvailable);
    if (outdated.length === 0) return;

    if (!confirm(`Are you sure you want to update firmware on all ${outdated.length} outdated devices simultaneously?`)) {
      return;
    }

    outdated.forEach((dev) => {
      applyFirmwareUpdate(dev.id, dev.firmware.latestVersion, user?.displayName || user?.email || 'Admin Batch OTA');
    });
    setDevices(getStoredDevices());
    alert(`Successfully deployed OTA firmware updates to ${outdated.length} devices!`);
  };

  // Open Device Settings Modal (RESTRICTED TO ADMINS)
  const handleOpenSettings = (device: SmartDevice) => {
    if (!isAdmin) {
      alert("Access Denied: Hardware and firmware configuration is restricted to Property Administrators.");
      return;
    }
    setEditingSettingsDevice(device);
    setTempAutoUpdate(device.autoUpdateEnabled);
    setTempAutoWindow(device.autoUpdateWindow);
    setTempChannel(device.firmware.channel);
  };

  // Save Device Settings (RESTRICTED TO ADMINS)
  const handleSaveSettings = () => {
    if (!isAdmin || !editingSettingsDevice) return;

    const current = getStoredDevices();
    const updated = current.map(d => {
      if (d.id === editingSettingsDevice.id) {
        return {
          ...d,
          autoUpdateEnabled: tempAutoUpdate,
          autoUpdateWindow: tempAutoWindow,
          firmware: {
            ...d.firmware,
            channel: tempChannel
          }
        };
      }
      return d;
    });

    saveStoredDevices(updated);
    setDevices(updated);
    setEditingSettingsDevice(null);
  };

  // Toggle Technical Specifications
  const toggleSpecs = (id: string) => {
    setExpandedDeviceIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Category Icon Resolver
  const renderCategoryIcon = (category: DeviceCategory, size: number = 20) => {
    switch (category) {
      case 'smartlock':
        return <Lock size={size} className="text-indigo-600" />;
      case 'gateway':
        return <Server size={size} className="text-blue-600" />;
      case 'thermostat':
        return <Thermometer size={size} className="text-emerald-600" />;
      case 'sensor':
        return <Activity size={size} className="text-purple-600" />;
      default:
        return <Cpu size={size} className="text-indigo-600" />;
    }
  };

  // 1. Authentication Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700">Verifying session credentials...</p>
        <p className="text-xs text-slate-400 mt-1">Please wait a moment</p>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Only show Device Settings after a user has logged into APP
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 justify-between">
        <header className="pt-6 px-6 max-w-7xl mx-auto w-full z-10 relative">
          <div className="flex justify-between items-center bg-white rounded-2xl shadow-xs border border-slate-200 py-3 px-5">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-85 transition-opacity">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <CalendarIcon size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                REALCal <span className="text-indigo-600">Bookings</span>
              </h1>
            </Link>
            <Link to="/" className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 transition-colors">
              <ArrowLeft size={14} /> Back to Home
            </Link>
          </div>
        </header>

        <main className="flex-1 max-w-md mx-auto w-full px-6 flex items-center justify-center py-12">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-8 sm:p-10 text-center w-full">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-5 shadow-xs">
              <Lock size={30} />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
              Sign In Required
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-8">
              Device Settings is protected and only accessible after logging into the application. Please sign in to view and monitor connected smart devices for your stay.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => signIn()}
                className="w-full py-3.5 px-6 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-2xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Key size={16} />
                <span>Sign In to Access Device Settings</span>
              </button>
              <Link
                to="/"
                className="w-full py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors inline-block"
              >
                Return to Home
              </Link>
            </div>
          </div>
        </main>

        <LegalFooter />
      </div>
    );
  }

  // 3. Non-ADMIN Gate: Non-ADMINS should not have visibility to:
  //    SmartLocks, IoT Gateways & Badges, Climate Thermostats, Safety & Sensors
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 justify-between">
        <header className="pt-6 px-6 max-w-7xl mx-auto w-full z-10 relative">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white rounded-2xl shadow-xs border border-slate-200 py-3 px-5">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-85 transition-opacity">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <CalendarIcon size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                REALCal <span className="text-indigo-600">Bookings</span>
              </h1>
            </Link>

            <div className="flex items-center gap-3">
              <Link to="/my-bookings" className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors">
                <CalendarIcon size={14} className="text-indigo-500" /> My Bookings
              </Link>
              <Link to="/alerts-and-events" className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors">
                <Compass size={14} /> Alerts &amp; Events
              </Link>
              <div className="flex items-center gap-2 bg-slate-50 py-1 pl-1 pr-3 rounded-full border border-slate-200">
                {user.photoURL && (
                  <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                )}
                <span className="text-xs font-semibold text-slate-700 truncate max-w-[90px]">
                  {user.displayName ? user.displayName.split(' ')[0] : 'Guest'}
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                  Guest
                </span>
                <button onClick={() => signOut()} className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer" title="Sign Out">
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10">
            <div className="flex items-start sm:items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                <ShieldAlert size={28} />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold rounded-lg uppercase tracking-wider mb-1">
                  <Lock size={12} /> Administrator Access Required
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Restricted Device Settings
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Non-ADMIN users do not have visibility to the following Device Settings categories:
                </p>
              </div>
            </div>

            {/* The 4 Restricted Categories Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shrink-0">
                  <Lock size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">SmartLocks</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">Admin Only</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Yamiry keyless deadbolt firmware, motor calibration, tamper alerts, and physical hardware telemetry.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <Server size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">IoT Gateways &amp; Badges</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">Admin Only</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Central Wi-Fi/BLE cloud bridge relays, Zigbee coordinators, and physical RFID/BLE keycard badges.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                  <Thermometer size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Climate Thermostats</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">Admin Only</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Central HVAC smart thermostats, heating/cooling schedules, compressor limits, and ROM firmware.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-100/70 text-purple-700 flex items-center justify-center shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Safety &amp; Sensors</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">Admin Only</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Connected Smoke/CO detectors, freeze monitors, flood sensors, noise decibel monitors, and door contacts.
                  </p>
                </div>
              </div>
            </div>

            {/* Guest Guidance Banner */}
            <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-slate-700 text-xs leading-relaxed flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 text-sm">Need your door entry code or check-in instructions?</p>
                  <p className="text-slate-600 mt-0.5">
                    Your personal keyless door PIN, Wi-Fi network password, and arrival itinerary are safely accessible in your verified booking details.
                  </p>
                </div>
              </div>
              <Link
                to="/my-bookings"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs whitespace-nowrap shadow-xs transition-colors shrink-0"
              >
                Go to My Bookings
              </Link>
            </div>

            {/* Navigation Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-8 pt-6 border-t border-slate-100">
              <Link
                to="/"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Return to Home
              </Link>
              <Link
                to="/alerts-and-events"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Explore Alerts &amp; Events
              </Link>
            </div>
          </div>
        </main>

        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-16">
      {/* Top Header Navigation */}
      <header className="pt-6 px-6 max-w-7xl mx-auto w-full z-10 relative">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
          <div className="flex flex-col items-center sm:items-start gap-1 flex-shrink-0">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-85 transition-opacity">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <CalendarIcon size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                REALCal <span className="text-indigo-600">Bookings</span>
              </h1>
            </Link>
          </div>

          {/* Navigation Bar Links */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-end">
            {isAdmin && (
              <Link 
                to="/admin" 
                className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white"
                title="Admin Dashboard"
              >
                <Key size={15}/>
                <span className="hidden md:inline">Admin</span>
              </Link>
            )}
            <Link 
              to="/my-bookings" 
              className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white"
            >
              <CalendarIcon size={15}/>
              <span className="hidden md:inline">My Bookings</span>
            </Link>
            <Link 
              to="/device-settings" 
              className="text-indigo-600 bg-indigo-50 font-bold flex items-center gap-1.5 text-xs sm:text-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-indigo-200/60 shadow-2xs"
            >
              <Cpu size={15} className="text-indigo-600" />
              <span>Device Settings</span>
            </Link>
            <Link 
              to="/alerts-and-events"
              className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1.5 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white"
            >
              <Compass size={15}/>
              <span className="hidden md:inline">Alerts &amp; Events</span>
            </Link>
            <Link 
              to="/reviews" 
              className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white"
            >
              <Star size={15} className="text-amber-500 fill-amber-500/30"/>
              <span className="hidden md:inline">Reviews</span>
            </Link>
            <Link 
              to="/faq" 
              className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white"
            >
              <HelpCircle size={15}/>
              <span className="hidden md:inline">FAQ</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-2 bg-white py-1 pl-1 pr-2 sm:pr-4 rounded-full border border-slate-200 shadow-sm ml-1">
                {user.photoURL && (
                  <img 
                    src={user.photoURL} 
                    alt="Avatar" 
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full" 
                    referrerPolicy="no-referrer" 
                  />
                )}
                <div className="text-left hidden sm:block">
                  <p className="font-semibold text-xs leading-none text-slate-800 truncate max-w-[80px]">
                    {user.displayName ? user.displayName.split(' ')[0] : 'Guest'}
                  </p>
                  <p className="text-[9px] text-indigo-600 font-medium leading-none mt-0.5">
                    {isAdmin ? 'Admin' : 'Guest'}
                  </p>
                </div>
                <button 
                  onClick={() => signOut()} 
                  className="text-slate-400 hover:text-red-500 transition-colors p-1 sm:p-1.5 rounded-full hover:bg-slate-50 cursor-pointer"
                  title="Logout"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signIn()} 
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors text-xs sm:text-sm shadow-sm"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6">
        {/* Breadcrumb / Back Link */}
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors">
            <ArrowLeft size={14} /> Back to Property Overview
          </Link>
        </div>

        {/* Page Hero Header */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
                <Cpu size={16} />
                <span>{isAdmin ? 'IoT Hardware & Over-The-Air Systems (Admin Mode)' : 'Guest Hardware & Access Status'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {isAdmin ? 'Device Settings & Firmware Management' : 'Device Settings & Hardware Status'}
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                {isAdmin ? (
                  'Monitor real-time device status, inspect installed firmware architecture, test microcontroller communication, and flash Over-The-Air (OTA) updates for smart locks, cloud gateways, thermostats, and environmental sensors.'
                ) : (
                  'Monitor hardware health, battery percentages, and communication telemetry for smart locks, access gateways, climate control, and safety sensors at your property.'
                )}
              </p>
            </div>

            {/* Quick Fleet Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {isAdmin ? (
                <>
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={isCheckingUpdates}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <RefreshCw size={15} className={cn(isCheckingUpdates && "animate-spin text-indigo-600")} />
                    <span>{isCheckingUpdates ? 'Checking OTA Servers...' : 'Check for Updates'}</span>
                  </button>

                  <button
                    onClick={handleTestAllDevices}
                    disabled={isTestingAll}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Activity size={15} className={cn(isTestingAll && "animate-pulse text-indigo-600")} />
                    <span>{isTestingAll ? 'Pinging Fleet...' : 'Test Device Pings'}</span>
                  </button>

                  {updatesAvailableCount > 0 && (
                    <button
                      onClick={handleBatchUpdateAll}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      <Download size={15} />
                      <span>Update All Outdated ({updatesAvailableCount})</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleTestAllDevices}
                    disabled={isTestingAll}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Activity size={15} className={cn(isTestingAll && "animate-pulse text-indigo-600")} />
                    <span>{isTestingAll ? 'Pinging Devices...' : 'Test Device Pings'}</span>
                  </button>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                    <Lock size={13} className="text-slate-400" />
                    <span>Firmware sections restricted to Admins</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Metrics (Zero-Pill Typography) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Connected Devices</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalAccessibleCount}</p>
              <p className="text-xs text-slate-400 mt-0.5">100% online &amp; responding</p>
            </div>

            {isAdmin ? (
              <>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Up-to-Date Firmware</p>
                  <p className="text-2xl font-extrabold text-emerald-600 mt-1">{upToDateCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Latest stable build</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Updates Available</p>
                  <p className={cn("text-2xl font-extrabold mt-1", updatesAvailableCount > 0 ? "text-amber-600" : "text-slate-900")}>
                    {updatesAvailableCount}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {criticalUpdatesCount > 0 ? `${criticalUpdatesCount} critical security patch` : 'Non-critical improvements'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Last OTA Sync</p>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1">
                    {lastCheckedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Automated 60s heartbeats</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Operational State</p>
                  <p className="text-2xl font-extrabold text-emerald-600 mt-1">100%</p>
                  <p className="text-xs text-slate-400 mt-0.5">All hardware active</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Power Fleet</p>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1">
                    {filteredDevices.filter(d => d.powerSource === 'battery').length} Battery
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {filteredDevices.filter(d => d.powerSource === 'ac_hardwired').length} AC Hardwired
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Protocol</p>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1">BLE &amp; Wi-Fi</p>
                  <p className="text-xs text-slate-400 mt-0.5">AES-256 Encrypted</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search devices by name, model, room, serial, or MAC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Property Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Property:</span>
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Accessible Properties ({accessibleProperties.length})</option>
                {accessibleProperties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isTestProperty ? '(Admin Test Property)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter Tabs (Segmented Controls) - ONLY ADMINS */}
            {isAdmin && (
              <div className="flex items-center p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
                <button
                  onClick={() => setSelectedStatusFilter('all')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                    selectedStatusFilter === 'all' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  All ({filteredDevices.length})
                </button>
                <button
                  onClick={() => setSelectedStatusFilter('outdated')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                    selectedStatusFilter === 'outdated' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Updates Available ({devices.filter(d => d.firmware.updateAvailable).length})
                </button>
                <button
                  onClick={() => setSelectedStatusFilter('up_to_date')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                    selectedStatusFilter === 'up_to_date' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Up to Date
                </button>
              </div>
            )}
          </div>

          {/* Category Tabs (Segmented Controls) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 mt-3 border-t border-slate-100 scrollbar-none">
            {[
              { id: 'all', label: 'All Categories' },
              { id: 'smartlock', label: 'SmartLocks (Yamiry)' },
              { id: 'gateway', label: 'IoT Gateways & Badges' },
              { id: 'thermostat', label: 'Climate Thermostats' },
              { id: 'sensor', label: 'Safety & Sensors' },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer",
                  selectedCategory === cat.id 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Devices Cards Grid */}
        {filteredDevices.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center my-6">
            <Cpu size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No hardware devices found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No devices match your current filters. Try resetting the search or category filters above.
            </p>
            <button
              onClick={() => {
                setSelectedPropertyId('all');
                setSelectedCategory('all');
                setSelectedStatusFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredDevices.map(device => {
              const isOutdated = device.firmware.updateAvailable;
              const isCritical = device.firmware.criticalSecurityUpdate;
              const isExpanded = !!expandedDeviceIds[device.id];
              const isTesting = testingDeviceId === device.id || isTestingAll;

              return (
                <div 
                  key={device.id} 
                  className={cn(
                    "bg-white rounded-3xl border transition-all shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden",
                    isAdmin && isCritical 
                      ? "border-amber-300/80 ring-1 ring-amber-300/40" 
                      : isAdmin && isOutdated 
                        ? "border-indigo-200" 
                        : "border-slate-200"
                  )}
                >
                  {/* Card Header */}
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                          {renderCategoryIcon(device.category, 20)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 leading-snug">{device.name}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <span>{device.propertyName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{device.locationRoom || 'Main'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Power / Signal Telemetry */}
                      <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                        {device.powerSource === 'battery' ? (
                          <div className="flex items-center gap-1" title={`Battery: ${device.batteryPercent}%`}>
                            {device.batteryPercent > 60 ? (
                              <Battery size={16} className="text-emerald-600" />
                            ) : device.batteryPercent > 25 ? (
                              <Battery size={16} className="text-amber-500" />
                            ) : (
                              <BatteryLow size={16} className="text-red-500" />
                            )}
                            <span className="font-mono text-[11px] font-semibold">{device.batteryPercent}%</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-500" title="AC Mains Powered">
                            <Zap size={14} className="text-amber-500" />
                            <span className="text-[11px] font-semibold">AC</span>
                          </div>
                        )}

                        <span aria-hidden="true">·</span>

                        <div className="flex items-center gap-1" title={`Signal: ${device.signalStrengthDbm} dBm (${device.connectionType.toUpperCase()})`}>
                          <Wifi size={14} className="text-slate-600" />
                          <span className="text-[11px] font-mono">{device.connectionType.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Hardware Model & Chipset */}
                    <div className="text-xs text-slate-500 space-y-0.5 mb-4 bg-slate-50/70 p-3 rounded-2xl border border-slate-100 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Model:</span>
                        <span className="font-semibold text-slate-700">{device.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Serial:</span>
                        <span className="text-slate-600">{device.serialNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Hardware:</span>
                        <span className="text-slate-600">{device.hardwareRevision}</span>
                      </div>
                    </div>

                    {/* FIRMWARE SECTION - RESTRICTED TO ONLY ADMINS */}
                    {isAdmin ? (
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Firmware Architecture</span>
                          {isCritical ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-700">
                              <ShieldAlert size={14} className="text-amber-600" /> Critical Security Update
                            </span>
                          ) : isOutdated ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                              <Download size={14} /> Update Available
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 size={14} className="text-emerald-600" /> Up to Date
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                          <div>
                            <p className="text-[11px] text-slate-400 font-medium">Installed Version</p>
                            <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                              {device.firmware.currentVersion}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-400 font-medium">Latest Available</p>
                            <p className={cn("text-sm font-mono font-bold mt-0.5", isOutdated ? "text-indigo-600" : "text-slate-700")}>
                              {device.firmware.latestVersion}
                            </p>
                          </div>
                        </div>

                        {/* Release Notes Preview */}
                        {device.firmware.releaseNotes && device.firmware.releaseNotes.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/60">
                            <p className="text-[11px] text-slate-500 font-semibold mb-1">
                              {isOutdated ? 'What’s New in ' + device.firmware.latestVersion + ':' : 'Active Release Notes:'}
                            </p>
                            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                              {device.firmware.releaseNotes.slice(0, 2).map((note, idx) => (
                                <li key={idx} className="leading-relaxed">{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Guest View: Clean Access State without Firmware Controls */
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Access &amp; Security</span>
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={13} className="text-emerald-600" /> Operational &amp; Secured
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Entry Method</span>
                            <span className="font-semibold text-slate-700">Keyless Access Code</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Encryption</span>
                            <span className="font-semibold text-slate-700">AES-256 Cloud Link</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-200/60">
                          <Lock size={12} className="text-slate-400 shrink-0" />
                          <span>Firmware management restricted to Property Administrators.</span>
                        </div>
                      </div>
                    )}

                    {/* Self-Test / Diagnostic Report Preview if available */}
                    {device.selfTestReport && (
                      <div className="flex items-center justify-between text-xs text-slate-500 px-1 py-1 mb-2">
                        <span className="flex items-center gap-1">
                          <Activity size={13} className="text-emerald-600" />
                          <span>Diagnostics: Passed</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{device.selfTestReport.latencyMs}ms ping</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(device.selfTestReport.lastTestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* Expandable Technical Specs Accordion */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs font-mono text-slate-600 space-y-1.5 bg-slate-50/50 p-3 rounded-xl mb-3">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-sans">MAC Address:</span>
                          <span>{device.macAddress}</span>
                        </div>
                        {device.ipAddress && (
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-sans">IP Address:</span>
                            <span>{device.ipAddress}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-sans">SoC / Core:</span>
                          <span className="truncate max-w-[200px]" title={device.chipset}>{device.chipset}</span>
                        </div>
                        {isAdmin && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-sans">SHA-256 Checksum:</span>
                              <span className="truncate max-w-[160px]" title={device.firmware.sha256Checksum}>
                                {device.firmware.sha256Checksum.slice(0, 16)}...
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-sans">Auto-Update Window:</span>
                              <span>{device.autoUpdateEnabled ? device.autoUpdateWindow : 'Disabled'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-sans">Firmware Channel:</span>
                              <span className="capitalize">{device.firmware.channel}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Toggle Technical Specs Link */}
                    <button
                      onClick={() => toggleSpecs(device.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Technical Registers' : 'View Hardware Specs & Registers'}</span>
                      <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  </div>

                  {/* Card Action Footer */}
                  <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRunSelfTest(device.id)}
                        disabled={isTesting}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Ping device and verify hardware registers"
                      >
                        <Activity size={13} className={cn(isTesting && "animate-spin text-indigo-600")} />
                        <span>{isTesting ? 'Pinging...' : 'Self-Test'}</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleOpenSettings(device)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                          title="Configure Auto-Update & Maintenance"
                        >
                          <Sliders size={13} />
                          <span>Settings</span>
                        </button>
                      )}
                    </div>

                    {/* FIRMWARE UPDATE BUTTONS - RESTRICTED TO ONLY ADMINS */}
                    {isAdmin ? (
                      isOutdated ? (
                        <button
                          onClick={() => handleStartOtaUpdate(device)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Download size={14} />
                          <span>Update Firmware ({device.firmware.latestVersion})</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartOtaUpdate(device)}
                          className="px-3 py-1.5 bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                          title="Re-flash or verify current firmware integrity"
                        >
                          <RefreshCw size={13} />
                          <span>Re-Verify ROM</span>
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                        <Lock size={12} /> Managed by Admin
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FIRMWARE INSTALLATION & AUDIT LEDGER - RESTRICTED TO ONLY ADMINS */}
        {isAdmin ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Clock size={20} className="text-indigo-600" />
                  Firmware Installation &amp; Audit Ledger
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cryptographic log of all applied Over-The-Air firmware updates, checksum verifications, and rollbacks.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="uppercase bg-slate-50 border-y border-slate-100 text-slate-400 font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Device / Hardware</th>
                    <th className="px-4 py-3">Version Upgrade</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Installed By</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devices.flatMap(d => (d.updateHistory || []).map(entry => ({ ...entry, device: d }))).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        No firmware update history entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    devices
                      .flatMap(d => (d.updateHistory || []).map(entry => ({ ...entry, device: d })))
                      .sort((a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime())
                      .map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            <div>{item.device.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.device.model}</div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-700">
                            {item.fromVersion} &rarr; <span className="text-indigo-600">{item.toVersion}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(item.installedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.installedBy}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500">
                            {item.durationSeconds ? `${item.durationSeconds}s` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-emerald-700 uppercase">
                              ✓ Verified Success
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Non-Admin Guest reassurance card */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Protected Hardware Infrastructure</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl leading-relaxed">
                  Smart door locks, climate systems, and gateways receive cryptographic Over-The-Air security updates managed exclusively by property administration. Guest entry PIN codes and reservations remain fully operational during all scheduled updates.
                </p>
              </div>
            </div>
            <Link 
              to="/faq" 
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors whitespace-nowrap"
            >
              Hardware FAQs
            </Link>
          </div>
        )}
      </main>

      {/* OTA Firmware Update Modal - RESTRICTED TO ONLY ADMINS */}
      {isAdmin && updatingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
                  <Download size={15} />
                  <span>Over-The-Air (OTA) Firmware Flasher</span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {updatingDevice.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upgrading firmware from <span className="font-mono font-bold text-slate-800">{updatingDevice.firmware.currentVersion}</span> to <span className="font-mono font-bold text-indigo-600">{updatingDevice.firmware.latestVersion}</span>
                </p>
              </div>
              <button
                onClick={handleCloseOtaModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Progress Stage */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold mb-2">
                  <span className="text-slate-700">{otaStage}</span>
                  <span className="font-mono font-bold text-indigo-600">{otaProgress}%</span>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      otaStatus === 'completed' 
                        ? "bg-emerald-500" 
                        : "bg-indigo-600 bg-gradient-to-r from-indigo-500 to-indigo-600 animate-pulse"
                    )}
                    style={{ width: `${otaProgress}%` }}
                  />
                </div>
              </div>

              {/* Hardware Safety Checklist */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">OTA Safety Verification Checklist</p>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Battery &ge; 25% ({updatingDevice.powerSource === 'battery' ? `${updatingDevice.batteryPercent}%` : 'AC Mains'})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Signal RSSI OK ({updatingDevice.signalStrengthDbm} dBm)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>SHA-256 Verified</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Lock Idle / Latched</span>
                  </div>
                </div>
              </div>

              {/* Live Terminal / Serial Console */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={14} /> Live Telemetry Output
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Nordic BLE 5.3 / 115200 baud</span>
                </div>
                <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-xs max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                  {otaLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed">
                      {log.startsWith('[') ? (
                        <span>
                          <span className="text-indigo-400">{log.split(']')[0]}]</span>
                          {log.split(']').slice(1).join(']')}
                        </span>
                      ) : (
                        log
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              {otaStatus === 'completed' ? (
                <button
                  onClick={handleCloseOtaModal}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Done (Firmware Active)
                </button>
              ) : (
                <button
                  onClick={handleCloseOtaModal}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Dismiss to Background
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Device Configuration Settings Modal - RESTRICTED TO ONLY ADMINS */}
      {isAdmin && editingSettingsDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Device Hardware Settings</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingSettingsDevice.name} ({editingSettingsDevice.model})</p>
              </div>
              <button
                onClick={() => setEditingSettingsDevice(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {/* Auto-Update Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-800">Auto-Update Firmware</p>
                  <p className="text-xs text-slate-500 mt-0.5">Automatically flash verified security patches during low-occupancy windows.</p>
                </div>
                <input
                  type="checkbox"
                  checked={tempAutoUpdate}
                  onChange={(e) => setTempAutoUpdate(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 border-slate-300 cursor-pointer"
                />
              </div>

              {/* Maintenance Window */}
              {tempAutoUpdate && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Maintenance Window
                  </label>
                  <select
                    value={tempAutoWindow}
                    onChange={(e) => setTempAutoWindow(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="02:00 - 04:00">02:00 AM – 04:00 AM (Recommended)</option>
                    <option value="03:00 - 05:00">03:00 AM – 05:00 AM</option>
                    <option value="04:00 - 06:00">04:00 AM – 06:00 AM</option>
                  </select>
                </div>
              )}

              {/* Firmware Release Channel */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Firmware Channel
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTempChannel('stable')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      tempChannel === 'stable'
                        ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <p className="text-xs font-bold">Stable (LTS)</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Production-tested, verified for maximum reliability.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTempChannel('beta')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      tempChannel === 'beta'
                        ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <p className="text-xs font-bold">Beta Preview</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Early access to new features and low-latency improvements.</p>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingSettingsDevice(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <LegalFooter />
    </div>
  );
}
