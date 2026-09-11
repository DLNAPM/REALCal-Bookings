import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, 
  AlertOctagon, 
  Bell, 
  BellRing, 
  CheckCircle2, 
  Clock, 
  Send, 
  RefreshCw, 
  Mail, 
  MessageSquare, 
  CreditCard, 
  Cpu, 
  ShieldAlert, 
  X, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Check, 
  Zap, 
  ExternalLink,
  Info,
  DollarSign
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { SystemIncident, IncidentService, IncidentSeverity, IncidentStatus } from '../types';

interface AdminAlarmsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  adminEmail?: string;
}

export function useAdminIncidents() {
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncidentsFromApi = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents?status=all');
      if (res.ok) {
        const data = await res.json();
        if (data.incidents) {
          setIncidents(data.incidents);
        }
      }
    } catch (err: any) {
      console.warn("Could not poll incidents from API:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (db) {
      try {
        const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'), limit(100));
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const list: SystemIncident[] = [];
            snapshot.forEach((d) => {
              list.push({ id: d.id, ...d.data() } as SystemIncident);
            });
            setIncidents(list);
            setLoading(false);
          },
          (err) => {
            console.warn("Firestore listener on incidents failed (may require index), falling back to API:", err.message);
            fetchIncidentsFromApi();
          }
        );
      } catch (err: any) {
        console.warn("Error establishing incidents snapshot:", err.message);
        fetchIncidentsFromApi();
      }
    } else {
      fetchIncidentsFromApi();
    }

    // Polling interval fallback every 30s
    const interval = setInterval(fetchIncidentsFromApi, 30000);

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(interval);
    };
  }, [fetchIncidentsFromApi]);

  const activeIncidents = incidents.filter(i => i.status === 'active' || !i.acknowledged);
  const acknowledgedIncidents = incidents.filter(i => i.acknowledged && i.status !== 'resolved');
  const criticalCount = activeIncidents.filter(i => i.severity === 'critical').length;
  const highCount = activeIncidents.filter(i => i.severity === 'high').length;

  return {
    incidents,
    activeIncidents,
    acknowledgedIncidents,
    activeCount: activeIncidents.length,
    criticalCount,
    highCount,
    loading,
    error,
    refresh: fetchIncidentsFromApi
  };
}

export function AdminAlarmsBanner({ 
  onOpenModal 
}: { 
  onOpenModal: () => void;
}) {
  const { activeCount, criticalCount, activeIncidents } = useAdminIncidents();
  const latestActive = activeIncidents[0];

  if (activeCount === 0) {
    return (
      <div 
        onClick={onOpenModal}
        className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 mb-6 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/20 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Integration Health &amp; Alarms</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> All Systems Operational
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Twilio SMS, Stripe, APIs, and Email notifications are running without active incidents.
            </p>
          </div>
        </div>

        <button 
          className="text-xs font-semibold text-slate-600 group-hover:text-indigo-600 bg-slate-100 group-hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
        >
          <Bell size={13} />
          <span>Alarms Hub</span>
        </button>
      </div>
    );
  }

  const isCritical = criticalCount > 0;

  return (
    <div 
      onClick={onOpenModal}
      className={`w-full rounded-2xl p-4 mb-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer transition-all border ${
        isCritical 
          ? 'bg-rose-50/90 border-rose-200 hover:bg-rose-100/70' 
          : 'bg-amber-50/90 border-amber-200 hover:bg-amber-100/70'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
          isCritical ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-white animate-pulse'
        }`}>
          <BellRing size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-black uppercase tracking-wider ${isCritical ? 'text-rose-900' : 'text-amber-900'}`}>
              System Incident Alarm
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${isCritical ? 'bg-rose-600' : 'bg-amber-600'}`}>
              {activeCount} Active {activeCount === 1 ? 'Incident' : 'Incidents'}
            </span>
            {latestActive?.service && (
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-white/80 border border-slate-300/60 px-2 py-0.5 rounded text-slate-700">
                {latestActive.service}
              </span>
            )}
          </div>
          <p className={`text-xs font-medium mt-1 ${isCritical ? 'text-rose-800' : 'text-amber-800'}`}>
            {latestActive?.title || 'System issues require administrator review and acknowledgment.'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Dispatched to <span className="font-semibold text-slate-700">dlaniger.napm.consulting@gmail.com</span> and Enabled Property Managers.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button 
          className={`text-xs font-bold px-3.5 py-2 rounded-xl text-white shadow-sm flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer ${
            isCritical ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
          }`}
        >
          <ShieldAlert size={14} />
          <span>Acknowledge Alerts</span>
        </button>
      </div>
    </div>
  );
}

export function AdminAlarmsModal({ 
  isOpen, 
  onClose,
  adminEmail = 'dlaniger.napm.consulting@gmail.com'
}: AdminAlarmsPanelProps) {
  const { incidents, refresh } = useAdminIncidents();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>('active');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);
  
  // Acknowledgment dialog state
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [ackNotes, setAckNotes] = useState<string>('');
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);

  // Testing dispatch state
  const [isTestingAlert, setIsTestingAlert] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredIncidents = incidents.filter(inc => {
    if (statusFilter === 'active') {
      if (inc.status === 'resolved' || inc.acknowledged) return false;
    } else if (statusFilter === 'acknowledged') {
      if (!inc.acknowledged || inc.status === 'resolved') return false;
    } else if (statusFilter === 'resolved') {
      if (inc.status !== 'resolved') return false;
    }

    if (serviceFilter !== 'all' && inc.service !== serviceFilter) {
      return false;
    }
    return true;
  });

  const activeCount = incidents.filter(i => i.status === 'active' || !i.acknowledged).length;
  const ackCount = incidents.filter(i => i.acknowledged && i.status !== 'resolved').length;
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

  const handleAcknowledge = async (id: string) => {
    setIsSubmittingAck(true);
    try {
      const res = await fetch(`/api/incidents/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acknowledgedBy: adminEmail || 'Admin',
          notes: ackNotes.trim()
        })
      });

      if (!res.ok) {
        // Fallback directly to client-side Firestore if API failed
        if (db) {
          const docRef = doc(db, 'incidents', id);
          await updateDoc(docRef, {
            acknowledged: true,
            status: 'acknowledged',
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: adminEmail || 'Admin',
            acknowledgmentNotes: ackNotes.trim(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      setAcknowledgingId(null);
      setAckNotes('');
      await refresh();
    } catch (err: any) {
      console.error("Error acknowledging incident:", err);
      alert(`Could not acknowledge incident: ${err.message}`);
    } finally {
      setIsSubmittingAck(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`/api/incidents/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: adminEmail || 'Admin'
        })
      });

      if (!res.ok && db) {
        const docRef = doc(db, 'incidents', id);
        await updateDoc(docRef, {
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          resolvedBy: adminEmail || 'Admin',
          updatedAt: new Date().toISOString()
        });
      }

      await refresh();
    } catch (err: any) {
      console.error("Error resolving incident:", err);
      alert(`Could not resolve incident: ${err.message}`);
    }
  };

  const handleTestAlert = async (testService: IncidentService = 'api') => {
    setIsTestingAlert(true);
    setTestSuccessMessage(null);
    try {
      const res = await fetch('/api/incidents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: testService,
          severity: 'high',
          adminEmail
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestSuccessMessage("Test alarm created! Notification emails and SMS dispatched to App Admin and Property Managers.");
        await refresh();
      } else {
        alert(data.error || "Failed dispatching test alarm");
      }
    } catch (err: any) {
      console.error("Test alert error:", err);
      alert(`Test alarm failed: ${err.message}`);
    } finally {
      setIsTestingAlert(false);
    }
  };

  const getServiceIcon = (service: IncidentService) => {
    switch (service) {
      case 'stripe':
        return <CreditCard size={16} className="text-violet-600" />;
      case 'twilio':
        return <MessageSquare size={16} className="text-red-500" />;
      case 'gemini':
        return <Zap size={16} className="text-amber-600" />;
      case 'smtp':
        return <Mail size={16} className="text-blue-600" />;
      case 'billing':
        return <DollarSign size={16} className="text-emerald-600" />;
      default:
        return <Cpu size={16} className="text-slate-600" />;
    }
  };

  const getSeverityBadge = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Critical</span>;
      case 'high':
        return <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">High</span>;
      case 'warning':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Warning</span>;
      default:
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Info</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-100">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">Alarms &amp; Incident Monitoring Hub</h2>
                {activeCount > 0 && (
                  <span className="bg-rose-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                    {activeCount} Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Incidents are automatically emailed to <span className="font-semibold text-slate-700">{adminEmail}</span> and texted to Enabled Property Managers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => handleTestAlert('twilio')}
              disabled={isTestingAlert}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Send a real test notification to verify email &amp; SMS delivery"
            >
              <Send size={13} className={isTestingAlert ? 'animate-spin' : ''} />
              <span>{isTestingAlert ? 'Dispatching...' : 'Test Alarm Dispatch'}</span>
            </button>
            <button
              onClick={() => refresh()}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              title="Refresh incidents"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Test Alert Success Toast */}
        {testSuccessMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{testSuccessMessage}</span>
            </div>
            <button onClick={() => setTestSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Status Filter Tabs & Service Filters */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 bg-white space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'active' 
                    ? 'bg-white text-rose-700 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Alarms ({activeCount})
              </button>
              <button
                onClick={() => setStatusFilter('acknowledged')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'acknowledged' 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Acknowledged ({ackCount})
              </button>
              <button
                onClick={() => setStatusFilter('resolved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'resolved' 
                    ? 'bg-white text-emerald-700 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Resolved ({resolvedCount})
              </button>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'all' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({incidents.length})
              </button>
            </div>

            {/* Service Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'twilio', 'stripe', 'gemini', 'billing', 'smtp', 'api'].map((srv) => (
                <button
                  key={srv}
                  onClick={() => setServiceFilter(srv)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer uppercase tracking-tight ${
                    serviceFilter === srv
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {srv === 'all' ? 'All Services' : srv}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Incidents List Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40">
          {filteredIncidents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {statusFilter === 'active' ? 'No Active Alarms' : 'No Incidents Found'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {statusFilter === 'active' 
                  ? 'All integrated services (Twilio, Stripe, Gemini AI, SMTP) are communicating normally without unacknowledged incidents.' 
                  : 'There are no incidents matching the current filter criteria.'}
              </p>
              {statusFilter === 'active' && (
                <button
                  onClick={() => handleTestAlert('api')}
                  disabled={isTestingAlert}
                  className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Trigger Health Check Test Alarm
                </button>
              )}
            </div>
          ) : (
            filteredIncidents.map((incident) => {
              const isExpanded = expandedIncidentId === incident.id;
              const isAcknowledging = acknowledgingId === incident.id;
              const formattedDate = new Date(incident.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={incident.id}
                  className={`bg-white rounded-2xl border transition-all shadow-sm ${
                    incident.status === 'active' && !incident.acknowledged
                      ? 'border-rose-300 ring-1 ring-rose-200/60'
                      : incident.status === 'resolved'
                      ? 'border-slate-200 opacity-80'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="p-4 sm:p-5">
                    {/* Top Row: Service, Severity, Status, Time */}
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 uppercase tracking-tight">
                          {getServiceIcon(incident.service)}
                          <span>{incident.service}</span>
                        </div>
                        {getSeverityBadge(incident.severity)}
                        {incident.status === 'active' && !incident.acknowledged ? (
                          <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                            Active Alarm
                          </span>
                        ) : incident.status === 'resolved' ? (
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                            Resolved
                          </span>
                        ) : (
                          <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                            Acknowledged
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock size={12} />
                        <span>{formattedDate}</span>
                      </div>
                    </div>

                    {/* Title and Message */}
                    <h4 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                      {incident.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mb-3 leading-relaxed">
                      {incident.message}
                    </p>

                    {/* Metadata chips */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-3">
                      {incident.errorCode && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] text-slate-700 font-semibold">
                          Code: {incident.errorCode}
                        </span>
                      )}
                      {incident.endpoint && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] text-slate-600">
                          Route: {incident.endpoint}
                        </span>
                      )}
                      {incident.notificationsSent && (
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                          <Check size={11} />
                          Dispatched to {incident.notificationsSent.emails.length} Emails
                          {incident.notificationsSent.sms.length > 0 ? ` & ${incident.notificationsSent.sms.length} SMS` : ''}
                        </span>
                      )}
                    </div>

                    {/* Acknowledged Badge & Notes if acknowledged */}
                    {incident.acknowledged && (
                      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 mb-3 text-xs text-indigo-900">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-indigo-600" />
                            Acknowledged by {incident.acknowledgedBy || 'Admin'}
                          </span>
                          {incident.acknowledgedAt && (
                            <span className="text-[11px] text-indigo-500">
                              {new Date(incident.acknowledgedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {incident.acknowledgmentNotes && (
                          <p className="text-xs text-indigo-800 mt-1 pl-4 border-l-2 border-indigo-300">
                            "{incident.acknowledgmentNotes}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Resolved info if resolved */}
                    {incident.status === 'resolved' && (
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 mb-3 text-xs text-emerald-900 flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          Resolved by {incident.resolvedBy || 'Admin'}
                        </span>
                        {incident.resolvedAt && (
                          <span className="text-[11px] text-emerald-600">
                            {new Date(incident.resolvedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Collapsible Details */}
                    {incident.errorDetails && (
                      <div>
                        <button
                          onClick={() => setExpandedIncidentId(isExpanded ? null : incident.id)}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer py-1"
                        >
                          <span>{isExpanded ? 'Hide Technical Details' : 'View Technical Details & Payload'}</span>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {isExpanded && (
                          <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48 leading-normal border border-slate-800">
                            {incident.errorDetails}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-[11px] text-slate-400 font-mono">
                        ID: {incident.id}
                      </div>

                      <div className="flex items-center gap-2">
                        {!incident.acknowledged && (
                          <button
                            onClick={() => setAcknowledgingId(isAcknowledging ? null : incident.id)}
                            className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldAlert size={13} />
                            <span>Acknowledge Alert</span>
                          </button>
                        )}

                        {incident.status !== 'resolved' && (
                          <button
                            onClick={() => handleResolve(incident.id)}
                            className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle2 size={13} />
                            <span>Mark Resolved</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Acknowledgment Dialog */}
                    {isAcknowledging && (
                      <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-fadeIn">
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Acknowledge Alert &amp; Add Resolution Notes:
                        </label>
                        <p className="text-[11px] text-slate-500 mb-2">
                          Record an acknowledgment note explaining your investigation or mitigation action (e.g. updated Twilio token, checked Stripe balance, adjusted quota tier).
                        </p>
                        <textarea
                          value={ackNotes}
                          onChange={(e) => setAckNotes(e.target.value)}
                          placeholder="e.g., Reviewed Twilio balance / Investigated card error / Logged ticket with provider..."
                          className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
                          rows={2}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setAcknowledgingId(null)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleAcknowledge(incident.id)}
                            disabled={isSubmittingAck}
                            className="text-xs font-bold px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <Check size={13} />
                            <span>{isSubmittingAck ? 'Saving...' : 'Confirm Acknowledgment'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Alert notifications: Email to {adminEmail} &bull; SMS to Enabled Property Managers</span>
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-xs bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            Close Hub
          </button>
        </div>

      </div>
    </div>
  );
}
