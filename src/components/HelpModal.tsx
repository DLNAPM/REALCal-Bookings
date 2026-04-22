import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export const HelpModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-xl hover:bg-indigo-500 hover:scale-110 transition-all flex items-center justify-center opacity-90 hover:opacity-100 focus:outline-none"
                aria-label="Help & Information"
            >
                <HelpCircle size={28} />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col font-sans border border-slate-200">
                        <div className="sticky top-0 bg-white/95 backdrop-blur px-6 py-5 border-b border-slate-100 flex justify-between items-center z-10">
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                                <HelpCircle className="text-indigo-600" />
                                About REALCal Bookings
                            </h2>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800 focus:outline-none"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="p-6 md:p-8 space-y-8 text-slate-600">
                            <section>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Description</h3>
                                <p className="leading-relaxed">
                                    REALCal Bookings is an end-to-end automated property management and rental platform. It securely handles calendar availability, dynamic pricing, direct user checkouts, and fully automates the provisioning of physical smart lock access codes for guests.
                                </p>
                            </section>

                            <section>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">How to Use</h3>
                                <ol className="list-decimal list-inside space-y-2 leading-relaxed ml-2 text-slate-700">
                                    <li>Browse available properties from the Landing Page.</li>
                                    <li>Select a property to view live calendar availability and smart-pricing for your dates.</li>
                                    <li>Highlight your check-in and check-out dates on the calendar.</li>
                                    <li>Proceed to Checkout to confirm your reservation and pay securely via Stripe.</li>
                                    <li>Instantly receive your physical Yale smart-lock access code and email itinerary.</li>
                                </ol>
                            </section>

                            <section>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Intended Audience</h3>
                                <p className="leading-relaxed">
                                    This app is built for Property Managers, Hosts, and boutique Rental Businesses who want to automate their direct-booking workflows without relying on massive third-party OTAs (Online Travel Agencies) taking large commissions. It is designed for businesses using modern IoT infrastructure (like Yale smart locks) and integrated payment systems.
                                </p>
                            </section>

                            <section className="bg-amber-50 rounded-2xl p-6 border border-amber-200/60">
                                <h3 className="text-lg font-bold text-amber-900 mb-2 flex items-center gap-2">
                                    Disclaimer & Intended Use
                                </h3>
                                <p className="text-amber-800 text-sm leading-relaxed mb-3">
                                    The automation of physical property access (Smart Locks) and direct payment processing carries inherent security and liability risks. 
                                </p>
                                <ul className="list-disc list-inside text-amber-700/90 text-sm space-y-1.5 ml-2">
                                    <li><strong>Not for unverified guests:</strong> Always ensure you have a robust offline identity verification process or deposit system before granting automated physical access to high-value assets.</li>
                                    <li><strong>Test Environment:</strong> The current environment is configured with test keys for demonstration. Do not expect real locks or real credit cards to process until you fully replace the environment variables with live API credentials.</li>
                                    <li><strong>Liability:</strong> The creators of this software template are not liable for property damage, unauthorized access, or financial loss resulting from improper configuration of your IoT devices or payment portals.</li>
                                </ul>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
