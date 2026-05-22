import React, { useState, useEffect } from 'react';
import { format, addDays, getDay, isBefore, isSameDay, startOfDay, addMonths, subMonths, eachDayOfInterval } from 'date-fns';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BlackoutDate, PricingRule } from '../types';
import { Property } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { getNightlyRate, calculatePriceDetails } from '../lib/pricing';

export const Calendar: React.FC<{ 
    propertyId: string, 
    property?: Property,
    isEditMode?: boolean,
    editingBookingId?: string,
    initialCheckIn?: string,
    initialCheckOut?: string,
    initialSelectedRoom?: any,
    onSaveEdit?: (checkIn: string, checkOut: string, priceDetails: any, selectedRooms: any[], rentalMode: 'entire' | 'room') => void,
    onCancelEdit?: () => void
}> = ({ propertyId, property, isEditMode, editingBookingId, initialCheckIn, initialCheckOut, initialSelectedRoom, onSaveEdit, onCancelEdit }) => {
  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const initial = initialCheckIn ? parseLocalDate(initialCheckIn) : null;
    return initial ? startOfDay(initial) : startOfDay(new Date());
  });
  const [checkIn, setCheckIn] = useState<Date | null>(initialCheckIn ? parseLocalDate(initialCheckIn) : null);
  const [checkOut, setCheckOut] = useState<Date | null>(initialCheckOut ? parseLocalDate(initialCheckOut) : null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [rentalMode, setRentalMode] = useState<'entire' | 'room'>(initialSelectedRoom ? 'room' : 'entire');
  const [selectedRooms, setSelectedRooms] = useState<any[]>(
    initialSelectedRoom ? (Array.isArray(initialSelectedRoom) ? initialSelectedRoom : [initialSelectedRoom]) : []
  );
  
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (!propertyId || !db) return;
    const unsubRules = onSnapshot(query(collection(db, 'pricing_rules'), where('propertyId', '==', propertyId)), (snap) => {
      setPricingRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingRule)));
    }, (error) => {
      console.error("Calendar pricing rules snapshot error:", error);
    });
    const unsubBlackouts = onSnapshot(query(collection(db, 'blackout_dates'), where('propertyId', '==', propertyId)), (snap) => {
      setBlackoutDates(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlackoutDate)));
    }, (error) => {
      console.error("Calendar blackout dates snapshot error:", error);
    });
    const unsubBookings = onSnapshot(query(collection(db, 'bookings'), where('propertyId', '==', propertyId)), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Calendar bookings snapshot error:", error);
    });
    const unsubSettings = onSnapshot(doc(db, 'global_settings', 'settings'), (snap) => {
        if(snap.exists()) setGlobalSettings(snap.data());
    }, (error) => {
      console.error("Calendar global settings snapshot error:", error);
    });
    return () => { unsubRules(); unsubBlackouts(); unsubBookings(); unsubSettings(); };
  }, [propertyId]);

  useEffect(() => {
    if (checkIn && checkOut) {
      const interval = eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) });
      if (interval.some(d => isUnavailable(d))) {
        setCheckIn(null);
        setCheckOut(null);
      }
    } else if (checkIn) {
      if (isUnavailable(checkIn)) {
        setCheckIn(null);
      }
    }
  }, [rentalMode, selectedRooms, bookings, blackoutDates]);

  const isUnavailable = (date: Date) => {
    // 1. Manual Blackouts
    const isDateBlackout = blackoutDates.some(b => {
      // Ignore maintenance blackout for the booking being edited
      if (editingBookingId && b.id && b.id.startsWith(`maint-${editingBookingId}`)) return false;

      const bDate = parseLocalDate(b.date);
      if (!bDate || !isSameDay(startOfDay(bDate), date)) return false;
      
      if (rentalMode === 'entire') {
        // Entire property is blocked if there's ANY blackout (property-wide or any room)
        return true;
      } else {
        // Room mode: blocked if entire property is blacked out OR any of our selected rooms are blacked out
        if (!b.targetType || b.targetType === 'property') return true;
        // If no rooms selected yet, we technically don't block based on room blackouts here, 
        // but often we want to see if any room is available.
        // If rooms ARE selected, block if any selected room is blacked out.
        if (selectedRooms.length > 0) {
           return selectedRooms.some(room => b.roomNumber === room.roomNumber);
        }
        return false;
      }
    });

    if (isDateBlackout) return true;

    // 2. Booking Conflicts
    return bookings.some(b => {
      if (b.status === 'cancelled') return false;
      // Ignore the booking being edited
      if (editingBookingId && b.id === editingBookingId) return false;
      
      const bStart = parseLocalDate(b.checkIn);
      const bEnd = parseLocalDate(b.checkOut);
      if (!bStart || !bEnd) return false;
      
      const start = startOfDay(bStart);
      const end = startOfDay(bEnd);
      
      // Date is within [checkIn, checkOut)
      const isOverlap = date >= start && date < end;
      if (!isOverlap) return false;

      // Conflict logic:
      if (rentalMode === 'entire') {
        // If booking entire property, ANY existing booking (entire or room) blocks it
        return true;
      } else {
        // Room mode: blocked if entire property is booked OR any of our selected rooms are booked
        if (!b.selectedBedroom && !b.selectedBedrooms) return true; // Entire property booking blocks all rooms
        
        if (selectedRooms.length > 0) {
            return selectedRooms.some(room => {
                // Check legacy selectedBedroom
                if (b.selectedBedroom && b.selectedBedroom.roomNumber === room.roomNumber) return true;
                // Check new selectedBedrooms array
                if (b.selectedBedrooms && b.selectedBedrooms.some((rb: any) => rb.roomNumber === room.roomNumber)) return true;
                return false;
            });
        }
        return false;
      }
    });
  };

  const getRate = (date: Date): number => {
    if (rentalMode === 'room' && selectedRooms.length > 0) {
        return selectedRooms.reduce((acc, room) => acc + getNightlyRate(date, pricingRules, room, 'room'), 0);
    }
    return getNightlyRate(date, pricingRules, null, 'entire');
  };

  const handleDateClick = (day: Date) => {
    if (isUnavailable(day) || isBefore(day, startOfDay(new Date()))) return;

    const checkMinNights = (start: Date, end: Date): boolean => {
      const interval = eachDayOfInterval({ start, end });
      const nights = interval.length - 1;
      if (nights < 1) return false;
      
      let minRequired = globalSettings?.minDaysDefault || 1;
      const hasWeekend = interval.some(d => getDay(d) === 5 || getDay(d) === 6);
      if (hasWeekend) {
          minRequired = globalSettings?.minDaysWeekend || 1;
      }
      return nights >= minRequired;
    };

    const hasConflictBetween = (start: Date, end: Date): boolean => {
      const interval = eachDayOfInterval({ start, end });
      return interval.slice(0, -1).some(d => isUnavailable(d));
    };

    // If no selection OR clicking a boundary OR starting a fresh range
    if (!checkIn || !checkOut || isSameDay(day, checkIn) || isSameDay(day, checkOut)) {
      if (checkIn && checkOut && (isSameDay(day, checkIn) || isSameDay(day, checkOut))) {
        // Toggling a boundary: clear it to start new selection from here
        setCheckIn(day);
        setCheckOut(null);
      } else if (!checkIn) {
        setCheckIn(day);
        setCheckOut(null);
      } else if (isSameDay(day, checkIn)) {
        setCheckIn(null);
        setCheckOut(null);
      } else if (isBefore(day, checkIn)) {
        setCheckIn(day);
      } else {
        // Forming a range from Check-in
        if (hasConflictBetween(checkIn, day)) {
          setCheckIn(day);
          setCheckOut(null);
        } else {
           // check min nights
           const interval = eachDayOfInterval({ start: checkIn, end: day });
           const nights = interval.length - 1;
           let minRequired = globalSettings?.minDaysDefault || 1;
           if (interval.some(d => getDay(d) === 5 || getDay(d) === 6)) minRequired = globalSettings?.minDaysWeekend || 1;
           
           if (nights < minRequired) {
             alert(`Your dates include a requirement of at least ${minRequired} nights. Please extend your checkout date.`);
             return;
           }
           setCheckOut(day);
        }
      }
      return;
    }

    // RANGE IS ALREADY SET (checkIn && checkOut && not same day as boundary)
    // We arrive here if the user clicked a date different from existing checkIn/checkOut
    if (isBefore(day, checkIn)) {
      // 1. Expand range BEFORE
      if (hasConflictBetween(day, checkIn)) {
        // Reset if conflict
        setCheckIn(day);
        setCheckOut(null);
      } else {
        setCheckIn(day);
      }
    } else if (day > checkOut) {
      // 2. Expand range AFTER
      if (hasConflictBetween(checkOut, day)) {
        setCheckIn(day);
        setCheckOut(null);
      } else {
        setCheckOut(day);
      }
    } else {
      // 3. Clicked BETWEEN checkIn and checkOut
      // Determine which end to move to the clicked day
      const distIn = Math.abs(day.getTime() - checkIn.getTime());
      const distOut = Math.abs(day.getTime() - checkOut.getTime());
      
      if (distIn < distOut) {
        // Closer to Check-in, Move checkIn forward (shorten from start)
        if (checkMinNights(day, checkOut)) {
          setCheckIn(day);
        } else {
          // If shortening violates min nights, just start over from here
          setCheckIn(day);
          setCheckOut(null);
        }
      } else {
        // Closer to Check-out, Move checkOut back (shorten from end)
        if (checkMinNights(checkIn, day)) {
          setCheckOut(day);
        } else {
          setCheckIn(day);
          setCheckOut(null);
        }
      }
    }
  };

  const calculatePrice = () => {
    if (!checkIn || !checkOut) return null;

    let sameDayModFee = 0;
    if (isEditMode && initialCheckIn) {
      const origCheckInYMD = initialCheckIn.split('T')[0];
      const today = new Date();
      const todayYMD = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      const newCheckInYMD = format(checkIn, 'yyyy-MM-dd');
      
      // If original booking was same-day check-in, and the guest changed the check-in date
      if (origCheckInYMD === todayYMD && newCheckInYMD !== origCheckInYMD) {
        const origDateObj = parseLocalDate(initialCheckIn);
        if (origDateObj) {
          let originalRate = 0;
          if (rentalMode === 'room' && selectedRooms && selectedRooms.length > 0) {
            selectedRooms.forEach(room => {
              originalRate += getNightlyRate(origDateObj, pricingRules, room, 'room');
            });
          } else {
            originalRate = getNightlyRate(origDateObj, pricingRules, null, 'entire');
          }
          sameDayModFee = Math.round(originalRate * 0.5 * 100) / 100;
        }
      }
    }

    return calculatePriceDetails(
      checkIn.toISOString(), 
      checkOut.toISOString(), 
      pricingRules, 
      globalSettings, 
      selectedRooms, 
      rentalMode,
      sameDayModFee
    );
  };

  const priceDetails = calculatePrice();

  const renderMonth = () => {
    const monthStart = startOfDay(currentMonth);
    monthStart.setDate(1);
    const startDate = startOfDay(monthStart);
    while(getDay(startDate) !== 0) startDate.setDate(startDate.getDate() - 1); // go back to Sunday

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    for (let i = 0; i < 42; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = new Date(day);

        const isPast = isBefore(cloneDay, startOfDay(new Date()));
        const isBlocked = isUnavailable(cloneDay);
        const isDisabled = isPast || isBlocked;
        const isSelected = checkIn && isSameDay(cloneDay, checkIn) || checkOut && isSameDay(cloneDay, checkOut);
        
        let isBetween = false;
        if (checkIn && checkOut && cloneDay > checkIn && cloneDay < checkOut) isBetween = true;
        if (checkIn && !checkOut && hoverDate && cloneDay > checkIn && cloneDay < hoverDate && !isDisabled) isBetween = true;

        let cellBg = "bg-white text-slate-800 border border-slate-100 font-semibold";
        if (isDisabled) cellBg = "bg-slate-50 text-slate-400 border border-transparent line-through";
        if (isSelected) cellBg = "bg-indigo-600 text-white font-bold ring-4 ring-indigo-100 z-10";
        else if (isBetween) cellBg = "bg-indigo-50 text-indigo-900 border-indigo-100";

        days.push(
          <div
            key={cloneDay.toISOString()}
            className={cn("h-16 relative rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center group overflow-hidden", cellBg)}
            onClick={() => handleDateClick(cloneDay)}
            onMouseEnter={() => !isDisabled && setHoverDate(cloneDay)}
          >
            <span className="font-semibold text-lg">{formattedDate}</span>
            {!isDisabled && <span className={cn("text-xs opacity-70", isSelected ? 'text-indigo-100' : 'text-slate-500')}>${getRate(cloneDay)}</span>}
          </div>
        );

        if ((i + 1) % 7 === 0) {
            rows.push(<div className="grid grid-cols-7 gap-2 mb-2" key={i}>{days}</div>);
            days = [];
        }
        day = addDays(day, 1);
    }
    return rows;
  };

  const handleBook = () => {
    if (checkIn && checkOut && priceDetails) {
       if (rentalMode === 'room' && selectedRooms.length === 0) {
           alert("Please select at least one room.");
           return;
       }
       navigate('/checkout', { state: { 
         propertyId,
         checkIn: format(checkIn, 'yyyy-MM-dd'), 
         checkOut: format(checkOut, 'yyyy-MM-dd'), 
         priceDetails,
         selectedBedrooms: selectedRooms,
         rentalMode
       }});
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 container mx-auto">
      {/* Main Calendar Section - col-8 */}
      <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
        {property?.allowIndividualRoomRental && (
            <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl mb-6">
               <button onClick={() => {setRentalMode('entire'); setSelectedRooms([]);}} className={cn("flex-1 px-4 py-2 rounded-xl font-bold text-sm", rentalMode === 'entire' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>Entire Property</button>
               <button onClick={() => setRentalMode('room')} className={cn("flex-1 px-4 py-2 rounded-xl font-bold text-sm", rentalMode === 'room' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>Select Rooms</button>
            </div>
        )}
        {rentalMode === 'room' && (
            <div className="flex flex-wrap gap-2 mb-6">
                {property?.bedrooms?.map(room => {
                    const isSelected = selectedRooms.some(r => r.roomNumber === room.roomNumber);
                    return (
                        <button 
                            key={room.roomNumber} 
                            onClick={() => {
                                setSelectedRooms(prev => 
                                    isSelected 
                                        ? prev.filter(r => r.roomNumber !== room.roomNumber)
                                        : [...prev, room]
                                );
                            }} 
                            className={cn(
                                "px-4 py-2 rounded-xl text-sm font-bold border flex flex-col items-start gap-0.5 transition-all", 
                                isSelected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300"
                            )}
                        >
                            <div className="flex justify-between w-full gap-4">
                                <span>{room.type} {room.roomNumber}</span>
                                <span className="font-mono">${room.fee}</span>
                            </div>
                            {room.sqFt > 0 && <span className={cn("text-[10px] font-medium uppercase tracking-wider", isSelected ? "text-indigo-200" : "text-slate-400")}>{room.sqFt} sq ft</span>}
                        </button>
                    );
                })}
            </div>
        )}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex gap-4 items-center">
             <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-slate-100 flex items-center justify-center bg-slate-50"><ChevronLeft/></button>
             {format(currentMonth, 'MMMM yyyy')}
             <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-slate-100 flex items-center justify-center bg-slate-50"><ChevronRight/></button>
          </h2>
          <div className="flex gap-2 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-white rounded-sm border border-slate-200"></span> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-600 rounded-sm"></span> Selected</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-200 rounded-sm"></span> Booked</span>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-2 flex-grow mb-2">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs font-bold text-slate-400 py-2 uppercase tracking-widest">{d}</div>
           ))}
        </div>
        <div className="">
          {renderMonth()}
        </div>
      </div>
      
      {/* Checkout Section - col-4 */}
      <div className="lg:col-span-4 bg-slate-900 rounded-3xl p-6 text-white flex flex-col shadow-xl sticky top-24 self-start">
         <h2 className="text-xl font-semibold mb-6">Price Breakdown</h2>
         
         <div className="space-y-4 flex-grow mb-6">
            <div className="flex justify-between items-center text-slate-400">
              <span>Check-in</span>
              <span className="text-white font-medium">{checkIn ? format(checkIn, 'MMM d, yyyy') : '--'}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Check-out</span>
              <span className="text-white font-medium">{checkOut ? format(checkOut, 'MMM d, yyyy') : '--'}</span>
            </div>
            
            {priceDetails && checkIn && checkOut && (
              <div className="border-t border-slate-800 my-4 pt-4 space-y-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nightly Breakdown</div>
                <div className="max-h-32 overflow-y-auto space-y-2 pr-2 scrollbar-hide">
                   {eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) }).map(day => (
                      <div key={day.toISOString()} className="flex justify-between items-center text-sm">
                         <span className="text-slate-400">{format(day, 'MMM d, yyyy')}</span>
                         <span className="font-mono">${getRate(day).toFixed(2)}</span>
                      </div>
                   ))}
                </div>
                
                <div className="border-t border-slate-800 mt-2 pt-2 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">
                        {rentalMode === 'room' && selectedRooms.length > 0 
                            ? `${selectedRooms.length} Room${selectedRooms.length > 1 ? 's' : ''} Selected` 
                            : `Entire Property`} Subtotal
                    </span>
                    <span className="font-mono">${(priceDetails.baseTotal + priceDetails.discount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Cleaning fee</span>
                    <span className="font-mono">${(priceDetails.cleaningFee).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Occupancy taxes</span>
                    <span className="font-mono">${(priceDetails.taxes).toFixed(2)}</span>
                  </div>
                  {priceDetails.discount > 0 && (
                    <div className="flex justify-between items-center text-emerald-400">
                      <span>10% Weekly Discount</span>
                      <span className="font-mono">-${(priceDetails.discount).toFixed(2)}</span>
                    </div>
                  )}
                  {priceDetails.sameDayModificationFee > 0 && (
                    <div className="flex justify-between items-center text-amber-500 font-bold border-t border-slate-800/60 pt-2 mt-1">
                      <span className="flex items-center gap-1.5">⚠️ Same-Day Change Fee (50%)</span>
                      <span className="font-mono">${(priceDetails.sameDayModificationFee).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {property?.allowIndividualRoomRental && (
               <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Rental Selection</div>
                  <div className="grid grid-cols-1 gap-2">
                      <button 
                         onClick={() => { setRentalMode('entire'); setSelectedRooms([]); }}
                         className={cn(
                             "flex justify-between items-center text-sm p-3 rounded-xl border transition-all text-left",
                             rentalMode === 'entire' 
                                 ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20" 
                                 : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600"
                         )}
                      >
                         <div>
                             <div className="font-bold">Entire Property</div>
                             <div className="text-[10px] opacity-70 uppercase tracking-tighter">Full access</div>
                         </div>
                         <div className="text-right">
                             <div className="font-mono font-bold">${getNightlyRate(new Date(), pricingRules, null, 'entire').toFixed(0)}/nt</div>
                             <div className="text-[10px] opacity-50">Property Rate</div>
                         </div>
                      </button>

                      {property.bedrooms?.map(room => {
                         const isSelected = selectedRooms.some(r => r.roomNumber === room.roomNumber);
                         return (
                          <button 
                             key={room.roomNumber} 
                             onClick={() => { 
                                setRentalMode('room'); 
                                setSelectedRooms(prev => 
                                    isSelected 
                                        ? prev.filter(r => r.roomNumber !== room.roomNumber)
                                        : [...prev, room]
                                );
                             }}
                             className={cn(
                                 "flex justify-between items-center text-sm p-3 rounded-xl border transition-all text-left",
                                 (rentalMode === 'room' && isSelected) 
                                     ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20" 
                                     : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600"
                             )}
                          >
                             <div>
                                 <div className="font-bold">{room.type} {room.roomNumber}</div>
                                 <div className="text-[10px] opacity-70 uppercase tracking-tighter italic">
                                     Individual Room {room.sqFt > 0 && `• ${room.sqFt} sq ft`}
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className="font-mono font-bold">${room.fee}/nt</span>
                                 <div className="text-[10px] opacity-50">Room Rate</div>
                             </div>
                          </button>
                         );
                      })}
                  </div>
               </div>
            )}
         </div>
         
         <div className="mt-auto">
            {priceDetails ? (
              <div className="flex justify-between items-end mb-6 border-t border-slate-800 pt-6">
                <span className="text-slate-400">Total Price</span>
                <span className="text-3xl font-bold font-mono">${(priceDetails.grandTotal).toFixed(2)}</span>
              </div>
            ) : (
              <div className="mb-6 h-12 flex items-center justify-center text-slate-400 text-sm">
                 Select dates to compute total
              </div>
            )}
            
            {user && user.tollFreeAccept !== true && !isEditMode && (
               <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-200 text-xs text-center leading-relaxed font-medium mb-4">
                  <p className="flex items-center justify-center gap-1.5 mb-2 font-bold uppercase tracking-wider text-[10px]">
                     <Lock size={12} className="text-amber-500" /> Checkout Restricted
                  </p>
                  To proceed with this booking, you must first accept our <Link to="/opt-in" className="text-amber-500 underline hover:text-amber-400">Communication Consent</Link> for SMS & Email updates.
               </div>
            )}
            
            <button 
              onClick={() => {
                  if (isEditMode && onSaveEdit && checkIn && checkOut && priceDetails) {
                      onSaveEdit(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'), priceDetails, selectedRooms, rentalMode);
                  } else {
                      handleBook();
                  }
              }}
              disabled={!checkIn || !checkOut || (user && user.tollFreeAccept !== true && !isEditMode)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {isEditMode ? 'Save Changes' : 'Proceed to Checkout'}
            </button>
            {isEditMode && onCancelEdit && (
              <button 
                onClick={onCancelEdit}
                className="w-full mt-3 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
              >
                Cancel
              </button>
            )}
         </div>
      </div>
    </div>
  );
};
