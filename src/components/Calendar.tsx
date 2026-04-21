import React, { useState, useEffect } from 'react';
import { format, addDays, getDay, isBefore, isSameDay, startOfDay, addMonths, subMonths, eachDayOfInterval } from 'date-fns';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BlackoutDate, PricingRule } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Calendar: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const [currentMonth, setCurrentMonth] = useState(startOfDay(new Date()));
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (!propertyId) return;
    const unsubRules = onSnapshot(query(collection(db, 'pricing_rules'), where('propertyId', '==', propertyId)), (snap) => {
      setPricingRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingRule)));
    });
    const unsubBlackouts = onSnapshot(query(collection(db, 'blackout_dates'), where('propertyId', '==', propertyId)), (snap) => {
      setBlackoutDates(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlackoutDate)));
    });
    return () => { unsubRules(); unsubBlackouts(); };
  }, [propertyId]);

  const isBlackout = (date: Date) => {
    return blackoutDates.some(b => isSameDay(startOfDay(new Date(b.date)), date));
  };

  const getNightlyRate = (date: Date): number => {
    // Priority: custom -> holiday -> weekend -> default
    const dateStr = format(date, 'yyyy-MM-dd');
    let rate = 150; // hardcoded fallback

    const defaultRule = pricingRules.find(r => r.type === 'default');
    if (defaultRule) rate = defaultRule.rate;

    const weekendRule = pricingRules.find(r => r.type === 'weekend');
    if (weekendRule && (getDay(date) === 5 || getDay(date) === 6)) rate = weekendRule.rate;

    const holidayRule = pricingRules.find(r => r.type === 'holiday' && r.startDate && r.endDate && date >= new Date(r.startDate) && date <= new Date(r.endDate));
    if (holidayRule) rate = holidayRule.rate;

    const customRule = pricingRules.find(r => r.type === 'custom' && r.startDate && date === new Date(r.startDate)); // simplify mapping
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

        days.push(
          <div
            key={cloneDay.toISOString()}
            className={cn("p-2 border relative h-24 transition-colors", 
              isDisabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50",
              isSelected ? "bg-black text-white hover:bg-gray-800" : "",
              isBetween ? "bg-gray-200" : ""
            )}
            onClick={() => handleDateClick(cloneDay)}
            onMouseEnter={() => !isDisabled && setHoverDate(cloneDay)}
          >
            <span className="absolute top-2 left-2 font-semibold">{formattedDate}</span>
            {!isDisabled && <span className={cn("absolute bottom-2 right-2 text-sm", isSelected ? 'text-gray-200' : 'text-gray-500')}>$\{(getNightlyRate(cloneDay))}</span>}
          </div>
        );

        if ((i + 1) % 7 === 0) {
            rows.push(<div className="grid grid-cols-7" key={i}>{days}</div>);
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
         priceDetails 
       }});
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 flex flex-col md:flex-row gap-8">
      <div className="flex-1 bg-white p-6 rounded-xl shadow-lg border">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft/></button>
          <h2 className="text-xl font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight/></button>
        </div>
        <div className="grid grid-cols-7 font-bold text-gray-500 text-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="border-t border-l">
          {renderMonth()}
        </div>
      </div>
      
      <div className="w-full md:w-80 bg-white p-6 rounded-xl shadow-lg border self-start sticky top-4">
         <h3 className="text-2xl font-bold mb-4">Book Your Stay</h3>
         <div className="flex gap-4 mb-4 border rounded p-2">
            <div className="flex-1 border-r">
                <p className="text-xs font-bold uppercase text-gray-500">Check-in</p>
                <p className="font-semibold">{checkIn ? format(checkIn, 'MM/dd/yyyy') : 'Add date'}</p>
            </div>
            <div className="flex-1">
                <p className="text-xs font-bold uppercase text-gray-500">Checkout</p>
                <p className="font-semibold">{checkOut ? format(checkOut, 'MM/dd/yyyy') : 'Add date'}</p>
            </div>
         </div>
         
         {priceDetails ? (
           <div className="space-y-3 mb-6">
             <div className="flex justify-between text-gray-600">
               <span>$\{(priceDetails.baseTotal / priceDetails.nights).toFixed(0)} x {priceDetails.nights} nights</span>
               <span>$\{(priceDetails.baseTotal + priceDetails.discount).toFixed(2)}</span>
             </div>
             {priceDetails.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Weekly/Monthly Discount</span>
                  <span>-$\{(priceDetails.discount).toFixed(2)}</span>
                </div>
             )}
             <div className="flex justify-between text-gray-600">
               <span>Cleaning fee</span>
               <span>$\{(priceDetails.cleaningFee).toFixed(2)}</span>
             </div>
             <div className="flex justify-between text-gray-600">
               <span>Taxes</span>
               <span>$\{(priceDetails.taxes).toFixed(2)}</span>
             </div>
             <div className="pt-3 border-t flex justify-between font-bold text-lg">
               <span>Total (USD)</span>
               <span>$\{(priceDetails.grandTotal).toFixed(2)}</span>
             </div>
           </div>
         ) : (
           <div className="mb-6 h-32 flex items-center justify-center text-gray-400 text-center text-sm">
             Select multiple dates to see pricing...
           </div>
         )}
         
         <button 
           onClick={handleBook}
           disabled={!checkIn || !checkOut}
           className="w-full py-3 bg-black hover:bg-gray-800 text-white rounded-lg font-bold text-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
         >
           Book Now
         </button>
      </div>
    </div>
  );
};
