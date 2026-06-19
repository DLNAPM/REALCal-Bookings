import React, { useState } from 'react';
import { Booking, Property } from '../types';
import { Link } from 'react-router-dom';
import { X, ArrowUpDown, Calendar as CalendarIcon, Printer } from 'lucide-react';
import { getBookingPriceBreakdown } from '../pages/MyBookings';

interface AdminBookingsProps {
    bookings: (Booking & { propertyName?: string; propertyImage?: string; property?: Property | null })[];
    globalSettings: any;
}

export const AdminBookings: React.FC<AdminBookingsProps> = ({ bookings, globalSettings }) => {
    const [adminSortOrder, setAdminSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedAdminBooking, setSelectedAdminBooking] = useState<(Booking & { propertyName?: string; propertyImage?: string; property?: Property | null }) | null>(null);

    const adminSortedBookings = [...bookings].sort((a, b) => {
        const dateA = a.checkIn || '';
        const dateB = b.checkIn || '';
        return adminSortOrder === 'desc' 
            ? dateB.localeCompare(dateA)
            : dateA.localeCompare(dateB);
    });

    return (
        <>
            <div className="flex justify-between items-center bg-white border border-slate-200 rounded-3xl p-4 mb-6 shadow-sm">
                <div className="text-slate-600 text-xs font-semibold pl-2">
                    Total Bookings found: <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-150/40 text-[11px] font-mono">{bookings.length} reservations</span>
                </div>
                <div className="flex items-center gap-2 pr-2">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sort Check-In:</span>
                    <button
                        type="button"
                        onClick={() => setAdminSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 px-3 rounded-xl text-xs font-extrabold border border-indigo-200 transition-colors uppercase tracking-wider cursor-pointer"
                        title="Click to toggle check-in date sorting"
                    >
                        <ArrowUpDown size={14} className="text-indigo-500" />
                        {adminSortOrder === 'desc' ? "Newest First (Desc)" : "Oldest First (Asc)"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
                {/* Left Column - Bookings Table */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[10px]/none h-11 select-none">
                                    <th className="py-3 px-4 font-black text-indigo-950">Ref#</th>
                                    <th className="py-3 px-4 font-black text-indigo-950">Guest</th>
                                    <th className="py-3 px-4 font-black text-indigo-950">Property</th>
                                    <th 
                                        onClick={() => setAdminSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                        className="py-3 px-4 font-black text-indigo-950 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        title="Click to toggle Check-In sorting order"
                                    >
                                        <div className="flex items-center gap-1">
                                            Check-In {adminSortOrder === 'desc' ? '↓' : '↑'}
                                        </div>
                                    </th>
                                    <th className="py-3 px-4 font-black text-indigo-950">Check-Out</th>
                                    <th className="py-3 px-4 font-black text-indigo-950">Total</th>
                                    <th className="py-3 px-4 font-black text-indigo-950">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {adminSortedBookings.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 px-4 text-center text-slate-400 font-medium italic">
                                            No reservations matching this criteria found.
                                        </td>
                                    </tr>
                                ) : (
                                    adminSortedBookings.map((b) => {
                                        const isSelected = selectedAdminBooking?.id === b.id;
                                        const refNum = b.bookingRef || b.id.substring(0, 8);
                                        return (
                                            <tr 
                                                key={b.id}
                                                className={`hover:bg-slate-50/50 transition-colors ${
                                                    isSelected 
                                                        ? 'bg-indigo-50/40 hover:bg-indigo-50' 
                                                        : b.status === 'cancelled' 
                                                        ? 'bg-rose-50/20 hover:bg-rose-50/30 text-slate-500' 
                                                        : ''
                                                }`}
                                            >
                                                <td className="py-3.5 px-4 font-bold font-mono">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedAdminBooking(b)}
                                                        className={`hover:underline cursor-pointer tracking-wider text-left ${isSelected ? 'text-indigo-850 font-black underline' : 'text-indigo-600 hover:text-indigo-700'}`}
                                                    >
                                                        {refNum}
                                                    </button>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-800">{b.guestName || "No Name"}</div>
                                                    <div className="text-[10px] text-slate-500 leading-relaxed font-semibold block truncate max-w-[120px]" title={b.guestEmail}>{b.guestEmail || "No Email"}</div>
                                                </td>
                                                <td className="py-3.5 px-4 font-medium text-slate-700">
                                                    {b.propertyName || b.propertyId ? (
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-800 truncate max-w-[110px]" title={b.propertyName || b.propertyId}>{b.propertyName || b.propertyId}</span>
                                                            {(b.selectedBedrooms || (b.selectedBedroom ? [b.selectedBedroom] : [])).length > 0 && (
                                                                <span className="text-[9px] text-indigo-600 font-mono font-bold">
                                                                    Rooms: {(b.selectedBedrooms || [b.selectedBedroom]).map((r: any) => r.roomNumber).join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="italic text-slate-400">N/A</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono font-bold text-slate-750">
                                                    {b.checkIn.split('T')[0]}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono text-slate-500">
                                                    {b.checkOut.split('T')[0]}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                                                    ${(b.totalPrice / 100).toFixed(2)}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] border ${
                                                        b.checkedOut ? 'bg-indigo-50 border-indigo-150 text-indigo-700' :
                                                        b.status === 'confirmed' ? 'bg-emerald-50 border-emerald-150 text-emerald-700' :
                                                        b.status === 'cancelled' ? 'bg-rose-50 border-rose-150 text-rose-700' :
                                                        'bg-amber-50 border-amber-150 text-amber-700'
                                                    }`}>
                                                        {b.checkedOut ? 'Checked Out' : b.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column - Booking Details Panel */}
                <div className="lg:col-span-4 lg:sticky lg:top-6 h-fit">
                    {selectedAdminBooking ? (
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                <div>
                                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Selected Booking</span>
                                    <h3 className="text-lg font-black text-slate-900 leading-tight">{selectedAdminBooking.propertyName}</h3>
                                    <p className="font-mono text-xs text-indigo-600 font-black mt-1">Ref: {selectedAdminBooking.bookingRef || selectedAdminBooking.id.substring(0, 8)}</p>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setSelectedAdminBooking(null)}
                                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 font-bold transition-colors cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="space-y-4 text-xs text-slate-700">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 overflow-hidden">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Guest Name</span>
                                        <span className="font-bold text-slate-800 truncate block">{selectedAdminBooking.guestName || 'N/A'}</span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 overflow-hidden">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Guest Email</span>
                                        <span className="font-bold text-slate-800 block truncate" title={selectedAdminBooking.guestEmail}>{selectedAdminBooking.guestEmail || 'N/A'}</span>
                                    </div>
                                </div>

                                {selectedAdminBooking.guestPhone && (
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Guest Phone</span>
                                        <span className="font-bold text-slate-800">{selectedAdminBooking.guestPhone}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Check In</span>
                                        <span className="font-bold text-slate-800">{selectedAdminBooking.checkIn.split('T')[0]}</span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Check Out</span>
                                        <span className="font-bold text-slate-800">{selectedAdminBooking.checkOut.split('T')[0]}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 items-center">
                                    <div>
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Guests Count</span>
                                        <span className="font-bold text-slate-800">{selectedAdminBooking.guests || 1} guest{(selectedAdminBooking.guests || 1) > 1 && 's'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Status</span>
                                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] border ${
                                            selectedAdminBooking.checkedOut ? 'bg-indigo-50 border-indigo-150 text-indigo-700' :
                                            selectedAdminBooking.status === 'confirmed' ? 'bg-emerald-50 border-emerald-150 text-emerald-700' :
                                            selectedAdminBooking.status === 'cancelled' ? 'bg-rose-50 border-rose-150 text-rose-700' :
                                            'bg-amber-50 border-amber-150 text-amber-700'
                                        }`}>
                                            {selectedAdminBooking.checkedOut ? 'Checked Out' : selectedAdminBooking.status}
                                        </span>
                                    </div>
                                </div>

                                {selectedAdminBooking.accessCode && selectedAdminBooking.status !== 'cancelled' && (
                                    <div className="bg-indigo-50 border border-indigo-100/50 p-3 rounded-xl">
                                        <span className="block text-[9px] uppercase font-bold text-indigo-400 tracking-wider mb-1">Smart Entry PIN Code</span>
                                        {selectedAdminBooking.checkedOut ? (
                                            <span className="font-mono text-xs font-bold text-slate-400 line-through tracking-wider">Deactivated (Checked Out)</span>
                                        ) : (
                                            <span className="font-mono text-base font-bold text-indigo-700 tracking-widest">{selectedAdminBooking.accessCode}</span>
                                        )}
                                    </div>
                                )}

                                {(selectedAdminBooking.selectedBedrooms || (selectedAdminBooking.selectedBedroom ? [selectedAdminBooking.selectedBedroom] : [])).length > 0 && (
                                    <div className="border-t border-slate-100 pt-3">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Booked Accommodations</span>
                                        <div className="space-y-1.5">
                                            {(selectedAdminBooking.selectedBedrooms || [selectedAdminBooking.selectedBedroom]).map((room, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-[10px]">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                        <span className="font-bold text-slate-750">Room {room.roomNumber}</span>
                                                        <span className="text-slate-450 uppercase font-medium">{room.type}</span>
                                                    </div>
                                                    <span className="font-mono text-indigo-600 font-bold block">{room.roomLockNumber}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Price details breakdown */}
                                {(() => {
                                    const breakdown = getBookingPriceBreakdown(selectedAdminBooking, globalSettings);
                                    const grandTotalVal = (breakdown.grandTotal || 0) + ((selectedAdminBooking.lateCheckoutFee || 0) / 100);
                                    return (
                                        <div className="border-t border-slate-100 pt-3 space-y-1.5">
                                            <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Bill Breakdown</span>
                                            <div className="flex justify-between text-[11px] text-slate-600">
                                                <span>Base Stay ({breakdown.nights} Nights)</span>
                                                <span className="font-mono font-medium">${(breakdown.baseTotal || 0).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-slate-600">
                                                <span>Cleaning Fee</span>
                                                <span className="font-mono font-medium">${(breakdown.cleaningFee || 0).toFixed(2)}</span>
                                            </div>
                                            {breakdown.discount > 0 && (
                                                <div className="flex justify-between text-[11px] text-emerald-600">
                                                    <span>Discount (10%)</span>
                                                    <span className="font-mono font-medium">-${breakdown.discount.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {breakdown.sameDayModificationFee > 0 && (
                                                <div className="flex justify-between text-[11px] text-indigo-600">
                                                    <span>Modification Surcharge</span>
                                                    <span className="font-mono font-medium">${breakdown.sameDayModificationFee.toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[11px] text-slate-600">
                                                <span>Taxes (12%)</span>
                                                <span className="font-mono font-medium">${(breakdown.taxes || 0).toFixed(2)}</span>
                                            </div>
                                            {(selectedAdminBooking.lateCheckoutFee || 0) > 0 && (
                                                <div className="flex justify-between text-[11px] text-rose-600 font-bold">
                                                    <span>Late Check-out Surcharge</span>
                                                    <span className="font-mono font-medium">+${((selectedAdminBooking.lateCheckoutFee || 0) / 100).toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center text-sm font-extrabold pt-2 border-t border-slate-200 text-slate-900">
                                                <span>Grand Total</span>
                                                <span className="font-mono text-indigo-600">${grandTotalVal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="pt-4 border-t border-slate-150">
                                <Link 
                                    to={`/itinerary/${selectedAdminBooking.id}`}
                                    className="w-full bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-center cursor-pointer"
                                    id="admin-btn-itinerary"
                                >
                                    <Printer size={15} /> View Itinerary
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-100/50 border border-slate-200 border-dashed rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                            <CalendarIcon className="w-12 h-12 text-slate-350 mb-3" />
                            <h3 className="text-sm font-bold text-slate-700 mb-1">No Booking Selected</h3>
                            <p className="text-xs text-slate-400 leading-relaxed max-w-[210px] mx-auto text-slate-550">
                                Click on any <strong className="text-indigo-600">Ref#</strong> reference link in the database table to preview customer details, payment structures, or click <strong>"View Itinerary"</strong> for details.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
