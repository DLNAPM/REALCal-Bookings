import React from 'react';
import { Shield, X, Download, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface PrivacyPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
    const CONSENT_Doc_URL = `${APP_URL}/consent_document.html`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col font-sans border border-slate-200">
                <div className="sticky top-0 bg-white/95 backdrop-blur px-6 py-5 border-b border-slate-100 flex justify-between items-center z-10">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                        <Shield className="text-indigo-600" />
                        Privacy Policy
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800 focus:outline-none"
                    >
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6 md:p-8 space-y-6 text-slate-600">
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">1. Information We Collect</h3>
                        <p className="leading-relaxed text-sm">
                            When you make a booking through REALCal Bookings, we collect essential information required to fulfill your reservation. This includes your name, email address, phone number, and payment details. We also collect basic account information if you choose to create an account via third-party providers (like Google).
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">2. How We Use Your Information</h3>
                        <p className="leading-relaxed text-sm mb-2">The information we collect is used strictly for:</p>
                        <ul className="list-disc list-inside text-sm space-y-1.5 ml-2">
                            <li>Processing your reservations and payments.</li>
                            <li>Communicating booking confirmations, receipts, and itineraries.</li>
                            <li>Provisioning your physical smart lock access code.</li>
                            <li>Notifying the designated property management team of your stay.</li>
                            <li>Ensuring the physical security of the rented property.</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">3. Third-Party Sharing</h3>
                        <p className="leading-relaxed text-sm">
                            We do not sell your personal data. We only share necessary data securely with our highly vetted service providers to execute your booking. This includes Stripe (for secure payment processing), Resend/Twilio (for email and SMS notifications), and Seam/York (to securely provision your physical access code).
                        </p>
                    </section>
                    
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">4. Data Security</h3>
                        <p className="leading-relaxed text-sm">
                            We implement strict, industry-standard security measures to protect your personal information from unauthorized access or disclosure. This includes end-to-end encryption for payment operations and secure, limited-scope database rules.
                        </p>
                    </section>
                    
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">5. Consent to Communications</h3>
                        <p className="leading-relaxed text-sm mb-4">
                            By booking with REALCal, you explicitly consent to receiving transactional SMS and email notifications regarding your stay. We maintain a separate, secure <strong>Opt-in menu</strong> for managing these communication preferences.
                        </p>
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
                            <div className="text-indigo-600 mt-0.5">
                                <ShieldCheck size={18} />
                            </div>
                            <div className="text-xs text-indigo-900 font-medium leading-relaxed italic">
                                To consent to automated messaging (SMS or text messaging) for access codes and booking updates, please use the <a href="/opt-in" className="underline font-bold text-indigo-700">Opt-in link</a> in the main menu. This step is required for Yorkshire smart lock code delivery.
                            </div>
                        </div>
                    </section>

                    <div className="pt-6 border-t border-slate-100 flex justify-end">
                        <button 
                            onClick={onClose}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl transition-colors shadow-sm"
                        >
                            Accept & Return
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
