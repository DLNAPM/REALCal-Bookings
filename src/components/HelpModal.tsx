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
                                    <li>Instantly receive your physical YAMIRY smart-lock access code and email itinerary.</li>
                                </ol>
                            </section>

                            <section>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Intended Audience</h3>
                                <p className="leading-relaxed">
                                    This app is built for Property Managers, Hosts, and boutique Rental Businesses who want to automate their direct-booking workflows without relying on massive third-party OTAs (Online Travel Agencies) taking large commissions. It is designed for businesses using modern IoT infrastructure (like YAMIRY smart locks) and integrated payment systems.
                                </p>
                            </section>

                            <section className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                                    Disclaimer & Intended Use
                                </h3>
                                <p className="text-slate-700 text-sm leading-relaxed mb-3">
                                    This application is configured in a live, production environment integrated with Render.com hosting, utilizing live production API keys for payment gateways, SMS notifications, and physical access code generation.
                                </p>
                                <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 ml-2">
                                    <li><strong>Production Environment:</strong> Payments, guest records, and smart-lock physical integrations are live and fully active. Real charges will occur on standard transactions, and actual YAMIRY smart locks will be provisioned.</li>
                                    <li><strong>Security & Verification:</strong> Ensure all direct bookings go through proper identification and guest screening, as smart-lock authorization is automatically completed on successful checkout.</li>
                                    <li><strong>Liability & Support:</strong> The operators and hosting platform are not liable for property damage, unauthorized access incidents, or financial processing disputes resulting from improper manual overrides or IoT hardware disconnects.</li>
                                </ul>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
