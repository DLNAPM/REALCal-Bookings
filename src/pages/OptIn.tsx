import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar as CalendarIcon, ShieldCheck, Mail, MessageSquare, AlertCircle, LogIn, CheckCircle2, Info, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { signIn, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { LegalFooter } from '../components/LegalFooter';

export const OptIn: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [showDeclineMessage, setShowDeclineMessage] = React.useState(false);
  const [isPreviewAction, setIsPreviewAction] = React.useState(false);
  const [smsConsent, setSmsConsent] = React.useState(false);

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (e) {
      console.error(e);
    }
  };

  const handleConsent = async (accepted: boolean) => {
    if (!user) {
      // Preview mode behavior
      setIsPreviewAction(true);
      if (accepted) {
        setShowSuccess(true);
      } else {
        setShowDeclineMessage(true);
      }
      return;
    }

    if (!db) return;
    const userPath = `users/${user.uid}`;
    
    // tollFreeAccept will store the SMS preference (true = opt-in, false = opt-out)
    const finalPreference = accepted ? smsConsent : false;

    try {
      await setDoc(doc(db, 'users', user.uid), {
        tollFreeAccept: finalPreference
      }, { merge: true });
      
      if (finalPreference) {
        setShowSuccess(true);
      } else {
        setShowDeclineMessage(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="py-6 px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <CalendarIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Bookings</span></h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-[32px] shadow-xl shadow-indigo-100/50 border border-slate-100 overflow-hidden transform transition-all">
          <div className="p-8 md:p-12 text-center border-b border-slate-50">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-indigo-100 ring-8 ring-indigo-50/50">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">Stay Connected</h2>
            {!user && !loading && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-indigo-100">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                Preview Mode
              </div>
            )}
            <p className="text-lg text-slate-500 leading-relaxed italic">
              To provide you with the best experience, we need your express consent to send you <span className="font-bold text-indigo-600">REALCal SMS booking notifications</span> including confirmations and access codes.
            </p>
          </div>

          <div className="p-8 md:p-12 space-y-8">
            <div className="space-y-4">
               <h3 className="text-xl font-bold text-slate-900 border-l-4 border-indigo-600 pl-4">Opt-In to REALCal SMS Booking Notifications</h3>
               <p className="text-slate-500 text-sm leading-relaxed mb-6">
                 Stay informed about your stay with reservation confirmations, reminders, and smart lock access code updates sent directly to your mobile device.
               </p>
            </div>

            <div className="max-w-md mx-auto">
              <div className={cn(
                "p-8 rounded-3xl border-2 transition-all group relative cursor-pointer shadow-sm",
                smsConsent ? "bg-indigo-50/50 border-indigo-200 ring-4 ring-indigo-50" : "bg-slate-50 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/10"
              )} onClick={() => setSmsConsent(!smsConsent)}>
                <div className="absolute top-6 right-6">
                  <div className={cn(
                    "w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center",
                    smsConsent ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-300"
                  )}>
                    {smsConsent && <Check size={20} className="text-white" />}
                  </div>
                </div>
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm text-indigo-600 group-hover:scale-110 transition-transform">
                  <MessageSquare size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">SMS Booking Notifications</h3>
                <p className="text-sm text-slate-500 leading-relaxed italic">
                  Receive reservation confirmations, reminders, and York smart lock access code updates via automated text messaging (SMS).
                </p>
                {smsConsent && (
                  <div className="mt-6 flex items-center gap-2">
                    <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Consent Selected
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4 items-start">
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-amber-800 leading-relaxed italic">
                <p className="font-bold mb-1">Opt-In Consent Disclosure</p>
                <p className="mb-2">Agreeing to receive SMS messages is optional and is not required to complete your booking or receive service.</p>
                By clicking &quot;Accept and Continue&quot;, you expressly consent to receive automated messaging (SMS or text messaging) from REALCal Bookings at the phone number associated with your account. 
                <strong> Messaging frequency is once per Property Booked transaction (confirmation, check-in, check-out).</strong> Message and data rates may apply. Reply STOP to opt-out at any time. Reply HELP for assistance.
                <div className="mt-4 pt-4 border-t border-amber-200 flex flex-wrap gap-4 font-bold not-italic">
                  <Link to="/privacy" className="text-indigo-600 underline hover:text-indigo-800">Privacy Policy</Link>
                  <Link to="/terms" className="text-indigo-600 underline hover:text-indigo-800">Terms of Service</Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              {loading ? (
                <div className="flex-1 bg-slate-100 animate-pulse h-14 rounded-2xl"></div>
              ) : (
                <>
                  <div className="flex-1 flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={() => handleConsent(true)}
                      className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-all transform hover:-translate-y-0.5"
                    >
                      Accept and Continue
                    </button>
                    <button 
                      onClick={() => handleConsent(false)}
                      disabled={smsConsent}
                      className={cn(
                        "px-8 py-4 font-bold transition-all",
                        smsConsent 
                          ? "text-slate-200 cursor-not-allowed opacity-50" 
                          : "text-slate-400 hover:text-slate-600 cursor-pointer"
                      )}
                    >
                      Decline
                    </button>
                  </div>
                </>
              )}
            </div>

            {!user && !loading && (
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-slate-400">
                    <span className="bg-white px-4 italic">Verification Required</span>
                  </div>
                </div>

                <button 
                  onClick={handleSignIn}
                  className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all transform hover:-translate-y-0.5"
                >
                  <LogIn size={20} />
                  Login with Booking Email to Save Preference
                </button>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-[11px] font-bold leading-relaxed text-center italic">
                    VENDORS: This page serves as our official verification portal for communication consent. Users must log in with their registered booking email to confirm preferences.
                </div>
              </div>
            )}
            
          <LegalFooter />
          </div>
        </div>
      </main>

      {/* Modals and other stuff... */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[32px] p-8 md:p-12 max-w-lg w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
              
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-green-100 ring-8 ring-green-50/50">
                <CheckCircle2 size={40} />
              </div>
              
              <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Thank You!</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed italic">
                &quot;Thanks for opting in to REALCal SMS booking notifications. You’ll receive reservation confirmations, reminders, and access code updates for your booking. Reply STOP to opt out, HELP for help.&quot;
              </p>
              
              <button 
                onClick={() => {
                  if (isPreviewAction) {
                    setShowSuccess(false);
                    setIsPreviewAction(false);
                    return;
                  }
                  navigate('/');
                }}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
              >
                {isPreviewAction ? 'Close Preview' : 'Browse Properties'}
              </button>
              
              <p className="mt-6 text-sm text-slate-400 italic">{isPreviewAction ? 'You are viewing a demonstration' : ''}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeclineMessage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[32px] p-8 md:p-12 max-w-lg w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-amber-500"></div>
              
              <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-amber-100 ring-8 ring-amber-50/50">
                <Info size={40} />
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">Preference Saved</h2>
              <div className="text-slate-600 mb-8 leading-relaxed space-y-4 text-left p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p>
                  You have chosen to <span className="font-bold text-amber-600">Opt-Out</span> of SMS communication. 
                </p>
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <p className="text-sm font-medium">
                    <span className="text-indigo-600 font-bold underline">PLEASE NOTE:</span> You will still receive booking confirmations via email. Your preference has been saved and you can proceed to browse and book properties.
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => {
                  if (isPreviewAction) {
                    setShowDeclineMessage(false);
                    setIsPreviewAction(false);
                    return;
                  }
                  navigate('/');
                }}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
              >
                {isPreviewAction ? 'Close Preview' : 'Continue to Browse'}
              </button>
              
              <p className="mt-6 text-sm text-slate-400 italic">{isPreviewAction ? 'Demonstration mode active' : ''}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
