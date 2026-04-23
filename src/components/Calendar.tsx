import React, { useState, useEffect } from 'react';
import { format, addDays, getDay, isBefore, isSameDay, startOfDay, addMonths, subMonths, eachDayOfInterval } from 'date-fns';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BlackoutDate, PricingRule } from '../types';
import { Property } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Calendar: React.FC<{ 
    propertyId: string, 
    property?: Property,
    isEditMode?: boolean,
    initialCheckIn?: string,
    initialCheckOut?: string,
    onSaveEdit?: (checkIn: string, checkOut: string, priceDetails: any) => void,
    onCancelEdit?: () => void
}> = ({ propertyId, property, isEditMode, initialCheckIn, initialCheckOut, onSaveEdit, onCancelEdit }) => {
  const [currentMonth, setCurrentMonth] = useState(initialCheckIn ? startOfDay(new Date(initialCheckIn)) : startOfDay(new Date()));
  const [checkIn, setCheckIn] = useState<Date | null>(initialCheckIn ? new Date(initialCheckIn) : null);
  const [checkOut, setCheckOut] = useState<Date | null>(initialCheckOut ? new Date(initialCheckOut) : null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [rentalMode, setRentalMode] = useState<'entire' | 'room'>('entire');
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (!propertyId || !db) return;
    const unsubRules = onSnapshot(query(collection(db, 'pricing_rules'), where('propertyId', '==', propertyId)), (snap) => {
      setPricingRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingRule)));
    });
    const unsubBlackouts = onSnapshot(query(collection(db, 'blackout_dates'), where('propertyId', '==', propertyId)), (snap) => {
      setBlackoutDates(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlackoutDate)));
    });
    const unsubSettings = onSnapshot(doc(db, 'global_settings', 'settings'), (snap) => {
        if(snap.exists()) setGlobalSettings(snap.data());
    });
    return () => { unsubRules(); unsubBlackouts(); unsubSettings(); };
  }, [propertyId]);

  const isBlackout = (date: Date) => {
    return blackoutDates.some(b => isSameDay(startOfDay(new Date(b.date)), date));
  };

  const getNightlyRate = (date: Date): number => {
    // Collect rules that match our current target
    const applicableRules = pricingRules.filter(r => {
        if (rentalMode === 'room') {
            return r.targetType === 'room' && r.roomNumber === selectedRoom?.roomNumber;
        } else {
            return !r.targetType || r.targetType === 'property';
        }
    });

    // Initial base rate
    let rate = 150; 
    if (rentalMode === 'room' && selectedRoom) {
        rate = selectedRoom.fee;
    }

    // Priority: custom -> holiday -> weekend -> default
    const dateStr = format(date, 'yyyy-MM-dd');

    const defaultRule = applicableRules.find(r => r.type === 'default');
    if (defaultRule) rate = defaultRule.rate;

    const weekendRule = applicableRules.find(r => r.type === 'weekend');
    if (weekendRule && (getDay(date) === 5 || getDay(date) === 6)) rate = weekendRule.rate;

    const holidayRule = applicableRules.find(r => r.type === 'holiday' && r.startDate && r.endDate && date >= new Date(r.startDate) && date <= new Date(r.endDate));
    if (holidayRule) rate = holidayRule.rate;

    const customRule = applicableRules.find(r => r.type === 'custom' && r.startDate && dateStr === r.startDate);
    if (customRule) rate = customRule.rate;

    return rate;
  };

  const handleDateClick = (day: Date) => {
    if (isBlackout(day) || isBefore(day, startOfDay(new Date()))) return;

    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(day);
      setCheckOut(null);
    } else {
      if (isBefore(day, checkIn)) {
        setCheckIn(day);
      } else {
        // Enforce no blackouts in between
        const interval = eachDayOfInterval({ start: checkIn, end: day });
        const hasBlackout = interval.some(d => isBlackout(d));
        if (hasBlackout) {
          setCheckIn(day);
          setCheckOut(null);
        } else {
          // Check Minimum Booking Days constraint
          const nights = interval.length - 1; // interval includes check out day too
          if (nights < 1) return; // Cannot check out same day
          
          let minRequired = globalSettings?.minDaysDefault || 1;
          const hasWeekend = interval.some(d => getDay(d) === 5 || getDay(d) === 6);
          if (hasWeekend) {
              minRequired = globalSettings?.minDaysWeekend || 1;
          }
          
          if (nights < minRequired) {
              alert(`Your dates include a requirement of at least ${minRequired} nights. Please extend your checkout date.`);
              return;
          }
           
          setCheckOut(day);
        }
      }
    }
  };

  const calculatePrice = () => {
    if (!checkIn || !checkOut) return null;
    const interval = eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) });
    let totalNightsRate = 0;
    interval.forEach(day => {
      totalNightsRate += getNightlyRate(day);
    });
    
    let cleaningFee = 100;
    let nights = interval.length;
    let discount = 0;
    
    // 10% discount for 7+ days
    if (nights >= 7) {
      discount = totalNightsRate * 0.1;
     totalNightsRate -= discount;
    }
    
    let taxes = (totalNightsRate + cleaningFee) * 0.12;

    return {
      nights,
      baseTotal: totalNightsRate,
      cleaningFee,
      discount,
      taxes,
      grandTotal: totalNightsRate + cleaningFee + taxes
    };
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
        const isBlocked = isBlackout(cloneDay);
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
            {!isDisabled && <span className={cn("text-xs opacity-70", isSelected ? 'text-indigo-100' : 'text-slate-500')}>$\{(getNightlyRate(cloneDay))}</span>}
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
       navigate('/checkout', { state: { 
         propertyId,
         checkIn: checkIn.toISOString(), 
         checkOut: checkOut.toISOString(), 
         priceDetails,
         selectedBedroom: selectedRoom
       }});
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 container mx-auto">
      {/* Main Calendar Section - col-8 */}
      <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
        {property?.allowIndividualRoomRental && (
            <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl mb-6">
               <button onClick={() => {setRentalMode('entire'); setSelectedRoom(null);}} className={cn("flex-1 px-4 py-2 rounded-xl font-bold text-sm", rentalMode === 'entire' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>Entire Property</button>
               <button onClick={() => setRentalMode('room')} className={cn("flex-1 px-4 py-2 rounded-xl font-bold text-sm", rentalMode === 'room' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>Specific Room</button>
            </div>
        )}
        {rentalMode === 'room' && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
               {property?.bedrooms?.map(room => (
                   <button key={room.roomNumber} onClick={() => setSelectedRoom(room)} className={cn("px-4 py-2 rounded-xl text-sm font-bold border", selectedRoom?.roomNumber === room.roomNumber ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-700")}>
                       {room.type} {room.roomNumber} (${room.fee})
                   </button>
               ))}
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
            
            {priceDetails && (
              <div className="border-t border-slate-800 my-4 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span>{rentalMode === 'room' && selectedRoom ? `Room ${selectedRoom.roomNumber} (${selectedRoom.type})` : `Entire Property`} × {priceDetails.nights} nights</span>
                  <span className="font-mono">${(priceDetails.baseTotal + priceDetails.discount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span>Cleaning fee</span>
                  <span className="font-mono">${(priceDetails.cleaningFee).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span>Occupancy taxes</span>
                  <span className="font-mono">${(priceDetails.taxes).toFixed(2)}</span>
                </div>
                {priceDetails.discount > 0 && (
                  <div className="flex justify-between items-center text-emerald-400">
                    <span>Discount</span>
                    <span className="font-mono">-${(priceDetails.discount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            
            {property?.allowIndividualRoomRental && (
               <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Available Rooms & Rates</div>
                  {property.bedrooms?.map(room => (
                     <div key={room.roomNumber} className={cn("flex justify-between text-sm p-2 rounded-lg transition-colors", selectedRoom?.roomNumber === room.roomNumber ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50")}>
                        <span>{room.type} {room.roomNumber}</span>
                        <span className="font-mono">${room.fee}/night</span>
                     </div>
                  ))}
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
            
            <button 
              onClick={() => {
                  if (isEditMode && onSaveEdit && checkIn && checkOut && priceDetails) {
                      onSaveEdit(checkIn.toISOString(), checkOut.toISOString(), priceDetails);
                  } else {
                      handleBook();
                  }
              }}
              disabled={!checkIn || !checkOut}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:bg-slate-700 disabled:text-slate-500"
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
