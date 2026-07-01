import React, { useState, useEffect } from 'react';
import { format, addDays, getDay, isBefore, isSameDay, startOfDay, addMonths, subMonths, eachDayOfInterval, differenceInDays } from 'date-fns';
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BlackoutDate, PricingRule } from '../types';
import { Property } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Lock, CheckCircle2, AlertCircle, FileText, Loader2, RefreshCw, HelpCircle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { getNightlyRate, calculatePriceDetails } from '../lib/pricing';
import { v4 as uuidv4 } from 'uuid';

export const Calendar: React.FC<{ 
    propertyId: string, 
    property?: Property,
    isEditMode?: boolean,
    editingBookingId?: string,
    initialCheckIn?: string,
    initialCheckOut?: string,
    initialSelectedRoom?: any,
    initialSelectedRooms?: any[],
    initialDailySelections?: any,
    onSaveEdit?: (checkIn: string, checkOut: string, priceDetails: any, selectedRooms: any[], rentalMode: 'entire' | 'room', dailySelections?: any) => void,
    onCancelEdit?: () => void
}> = ({ propertyId, property, isEditMode, editingBookingId, initialCheckIn, initialCheckOut, initialSelectedRoom, initialSelectedRooms, initialDailySelections, onSaveEdit, onCancelEdit }) => {
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
  
  const [rentalMode, setRentalMode] = useState<'entire' | 'room'>(() => {
    if (initialSelectedRooms && initialSelectedRooms.length > 0) return 'room';
    return initialSelectedRoom ? 'room' : 'entire';
  });
  
  const [selectedRooms, setSelectedRooms] = useState<any[]>(() => {
    if (initialSelectedRooms && initialSelectedRooms.length > 0) return initialSelectedRooms;
    return initialSelectedRoom ? (Array.isArray(initialSelectedRoom) ? initialSelectedRoom : [initialSelectedRoom]) : [];
  });

  const [isEntirePropertyLocked, setIsEntirePropertyLocked] = useState<boolean>(() => {
    const isRoomMode = (initialSelectedRooms && initialSelectedRooms.length > 0) || !!initialSelectedRoom;
    return !isRoomMode;
  });

  const [dailySelections, setDailySelections] = useState<{
    [dateStr: string]: {
      rentalMode: 'entire' | 'room';
      selectedBedrooms: any[];
    }
  } | null>(initialDailySelections || null);
  
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [leaseRequests, setLeaseRequests] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [agreedToHouseRules, setAgreedToHouseRules] = useState<boolean>(false);
  const [agreedToNoKidsUnder10, setAgreedToNoKidsUnder10] = useState<boolean>(false);
  
  // Lease code validation states
  const [enteredLeaseCode, setEnteredLeaseCode] = useState<string>('');
  const [validatedLeaseCode, setValidatedLeaseCode] = useState<string | null>(null);
  const [leaseDetails, setLeaseDetails] = useState<any | null>(null);
  const [isVerifyingLease, setIsVerifyingLease] = useState<boolean>(false);
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const [showLeaseForm, setShowLeaseForm] = useState<boolean>(false);

  // Lease request form states
  const [leaseRequestForm, setLeaseRequestForm] = useState({
    propertyNameOrRoom: '',
    startDate: '',
    endDate: '',
    tenantName: '',
    tenantEmail: '',
    tenantPhone: ''
  });
  const [submittingLeaseForm, setSubmittingLeaseForm] = useState<boolean>(false);
  const [leaseFormSuccess, setLeaseFormSuccess] = useState<boolean>(false);

  const navigate = useNavigate();

  // Reset and pre-populate lease form whenever checkout dates or rental mode change
  useEffect(() => {
    const formattedCheckIn = checkIn ? format(checkIn, 'yyyy-MM-dd') : '';
    const formattedCheckOut = checkOut ? format(checkOut, 'yyyy-MM-dd') : '';

    const isMatchingLeaseDates = leaseDetails && 
      leaseDetails.startDate === formattedCheckIn && 
      leaseDetails.endDate === formattedCheckOut;

    if (!isMatchingLeaseDates) {
      setEnteredLeaseCode('');
      setValidatedLeaseCode(null);
      setLeaseDetails(null);
      setLeaseError(null);
      setLeaseFormSuccess(false);
    }

    let roomText = property?.name || "Entire Property";
    if (rentalMode === 'room' && selectedRooms.length > 0) {
      roomText = `${property?.name || "Property"} - Room ${selectedRooms.map(r => r.roomNumber).join(", ")}`;
    }

    setLeaseRequestForm(prev => ({
      ...prev,
      propertyNameOrRoom: roomText,
      startDate: formattedCheckIn,
      endDate: formattedCheckOut,
      tenantName: user?.displayName || '',
      tenantEmail: user?.email || '',
    }));
  }, [checkIn, checkOut, rentalMode, selectedRooms, user, property, leaseDetails]);


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
    const unsubLeaseReqs = onSnapshot(query(collection(db, 'lease_requests'), where('propertyId', '==', propertyId)), (snap) => {
      setLeaseRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Calendar lease requests snapshot error:", error);
    });
    const unsubSettings = onSnapshot(doc(db, 'global_settings', 'settings'), (snap) => {
        if(snap.exists()) setGlobalSettings(snap.data());
    }, (error) => {
      console.error("Calendar global settings snapshot error:", error);
    });
    return () => { unsubRules(); unsubBlackouts(); unsubBookings(); unsubLeaseReqs(); unsubSettings(); };
  }, [propertyId]);

  // Synchronize and initialize dailySelections when dates change
  useEffect(() => {
    if (!checkIn || !checkOut) {
      setDailySelections(null);
      return;
    }

    const intervalDays = eachDayOfInterval({ start: startOfDay(checkIn), end: startOfDay(addDays(checkOut, -1)) });
    const updated: { [key: string]: { rentalMode: 'entire' | 'room'; selectedBedrooms: any[] } } = {};
    
    intervalDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (dailySelections && dailySelections[dateStr]) {
        updated[dateStr] = dailySelections[dateStr];
      } else if (initialDailySelections && initialDailySelections[dateStr]) {
        updated[dateStr] = initialDailySelections[dateStr];
      } else {
        updated[dateStr] = {
          rentalMode: rentalMode,
          selectedBedrooms: rentalMode === 'room' ? [...selectedRooms] : []
        };
      }
    });

    const currentKeys = Object.keys(dailySelections || {}).sort().join(',');
    const newKeys = Object.keys(updated).sort().join(',');

    if (currentKeys !== newKeys) {
      setDailySelections(updated);
    }
  }, [checkIn, checkOut, initialDailySelections]);

  const handleGlobalRentalModeChange = (mode: 'entire' | 'room') => {
    setRentalMode(mode);
    if (mode === 'entire') {
      setSelectedRooms([]);
      setIsEntirePropertyLocked(true);
    } else {
      setIsEntirePropertyLocked(false);
    }
    if (checkIn && checkOut) {
      const intervalDays = eachDayOfInterval({ start: startOfDay(checkIn), end: startOfDay(addDays(checkOut, -1)) });
      const updated: any = {};
      intervalDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        updated[dateStr] = { 
          rentalMode: mode, 
          selectedBedrooms: mode === 'room' ? (property?.bedrooms && property.bedrooms.length > 0 ? [property.bedrooms[0]] : []) : [] 
        };
      });
      setDailySelections(updated);
    }
  };

  const handleEntirePropertyClick = () => {
    if (rentalMode === 'entire') {
      setIsEntirePropertyLocked(prev => !prev);
    } else {
      handleGlobalRentalModeChange('entire');
    }
  };

  const handleGlobalRoomToggle = (room: any) => {
    setRentalMode('room');
    setSelectedRooms(prev => {
      const isSelected = prev.some(r => r.roomNumber === room.roomNumber);
      const updatedRooms = isSelected 
        ? prev.filter(r => r.roomNumber !== room.roomNumber)
        : [...prev, room];
      
      if (checkIn && checkOut) {
        const intervalDays = eachDayOfInterval({ start: startOfDay(checkIn), end: startOfDay(addDays(checkOut, -1)) });
        const updated: any = {};
        intervalDays.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          updated[dateStr] = { rentalMode: 'room', selectedBedrooms: updatedRooms };
        });
        setDailySelections(updated);
      }
      return updatedRooms;
    });
  };

  const handleDailyModeChange = (dateStr: string, mode: 'entire' | 'room') => {
    setDailySelections(prev => {
      const selections = prev || {};
      const defaultState = selections[dateStr] || { rentalMode: rentalMode, selectedBedrooms: rentalMode === 'room' ? [...selectedRooms] : [] };
      return {
        ...selections,
        [dateStr]: {
          rentalMode: mode,
          selectedBedrooms: mode === 'room' 
            ? (defaultState.selectedBedrooms.length > 0 ? defaultState.selectedBedrooms : (property?.bedrooms && property.bedrooms.length > 0 ? [property.bedrooms[0]] : [])) 
            : []
        }
      };
    });
  };

  const handleDailyRoomToggle = (dateStr: string, room: any) => {
    setDailySelections(prev => {
      const selections = prev || {};
      const defaultState = selections[dateStr] || { rentalMode: 'room', selectedBedrooms: [] };
      const currentRooms = defaultState.selectedBedrooms;
      const isSelected = currentRooms.some((r: any) => r.roomNumber === room.roomNumber);
      const updatedRooms = isSelected 
        ? currentRooms.filter((r: any) => r.roomNumber !== room.roomNumber)
        : [...currentRooms, room];
      
      return {
        ...selections,
        [dateStr]: {
          rentalMode: 'room',
          selectedBedrooms: updatedRooms
        }
      };
    });
  };

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

    // 2. Pending Lease Request Conflicts
    const isDateLeaseBlocked = leaseRequests.some(lr => {
      if (lr.status !== 'pending') return false;

      const lrStart = parseLocalDate(lr.startDate);
      const lrEnd = parseLocalDate(lr.endDate);
      if (!lrStart || !lrEnd) return false;

      const start = startOfDay(lrStart);
      const end = startOfDay(lrEnd);

      // Date is within [startDate, endDate)
      const isOverlap = date >= start && date < end;
      if (!isOverlap) return false;

      // Conflict logic:
      if (rentalMode === 'entire') {
        // If booking entire property, ANY pending lease request on those dates (entire or room) blocks it
        return true;
      } else {
        // Room mode: blocked if we are booking rooms and the pending lease request is for 'entire' property,
        // or if there is any overlap on the selected rooms.
        const lrMode = lr.rentalMode || 'entire';
        if (lrMode === 'entire') return true;

        if (selectedRooms.length > 0) {
          return selectedRooms.some(room => {
            if (lr.selectedBedrooms && lr.selectedBedrooms.some((lb: any) => lb.roomNumber === room.roomNumber)) return true;
            return false;
          });
        }
        return false;
      }
    });

    if (isDateLeaseBlocked) return true;

    // 3. Booking Conflicts
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
    const nights = (checkIn && checkOut) ? Math.max(1, differenceInDays(checkOut, checkIn)) : undefined;
    if (rentalMode === 'room' && selectedRooms.length > 0) {
        return selectedRooms.reduce((acc, room) => acc + getNightlyRate(date, pricingRules, room, 'room', nights), 0);
    }
    return getNightlyRate(date, pricingRules, null, 'entire', nights);
  };

  const validateExtendedBookingDates = (selectedCheckIn: Date, selectedCheckOut: Date): { isValid: boolean; message?: string } => {
    if (!isEditMode || !initialCheckIn || !initialCheckOut) {
      return { isValid: true };
    }

    const origStart = startOfDay(parseLocalDate(initialCheckIn)!);
    const origEnd = startOfDay(parseLocalDate(initialCheckOut)!);
    const newStart = startOfDay(selectedCheckIn);
    const newEnd = startOfDay(selectedCheckOut);

    // Check if they are actually extending the stay (earlier checkin or later checkout)
    const isExtendedBefore = newStart < origStart;
    const isExtendedAfter = newEnd > origEnd;

    if (!isExtendedBefore && !isExtendedAfter) {
      return { isValid: true };
    }

    const newInterval = eachDayOfInterval({ start: newStart, end: addDays(newEnd, -1) });
    const oldInterval = eachDayOfInterval({ start: origStart, end: addDays(origEnd, -1) }).map(d => format(d, 'yyyy-MM-dd'));

    const extendedNights = newInterval.filter(day => !oldInterval.includes(format(day, 'yyyy-MM-dd')));

    // Check conflicts for each extended stay night
    for (const night of extendedNights) {
      if (isUnavailable(night)) {
        return { 
          isValid: false, 
          message: `The extended stay night of ${format(night, 'MMMM d, yyyy')} is not available because it conflicts with another guest's booking or maintenance window.` 
        };
      }
    }

    // Also check the REQUIRED Cleaning/Maintenance day after the new checkout
    const checkOutDateDate = new Date(format(newEnd, 'yyyy-MM-dd') + 'T12:00:00');
    const cleaningDayDate = new Date(checkOutDateDate);
    cleaningDayDate.setDate(cleaningDayDate.getDate() + 1);
    const cleaningDay = startOfDay(cleaningDayDate);

    // Verify if this cleaning day is available (does not conflict with another Guest's booking or other blackouts)
    if (isUnavailable(cleaningDay)) {
      return {
        isValid: false,
        message: `The required Cleaning/Maintenance day after your extended stay (${format(cleaningDay, 'MMMM d, yyyy')}) conflicts with another guest's booking or maintenance window.`
      };
    }

    return { isValid: true };
  };

  const handleDateClick = (day: Date) => {
    if (isUnavailable(day) || isBefore(day, startOfDay(new Date()))) return;

    if (isEditMode && initialCheckIn && initialCheckOut) {
       const now = startOfDay(new Date());
       const origCheckIn = startOfDay(parseLocalDate(initialCheckIn) || new Date(initialCheckIn));
       const origCheckOut = startOfDay(parseLocalDate(initialCheckOut) || new Date(initialCheckOut));
       const isCurrentlyCheckedIn = now >= origCheckIn && now <= origCheckOut;

       if (isCurrentlyCheckedIn) {
          if (day > origCheckOut) {
             alert("You must start a new booking for the time period that starts after your current check-in date.");
             return;
          }
       }
    }

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

    const origCheckIn = initialCheckIn ? parseLocalDate(initialCheckIn) : null;
    const origCheckOut = initialCheckOut ? parseLocalDate(initialCheckOut) : null;
    const currentCheckIn = checkIn || origCheckIn;

    let proposedCheckIn: Date | null = checkIn;
    let proposedCheckOut: Date | null = checkOut;
    let ranAssign = false;

    if (isEditMode && origCheckIn && origCheckOut && currentCheckIn && isBefore(day, currentCheckIn)) {
       if (!hasConflictBetween(day, currentCheckIn)) {
          proposedCheckIn = day;
          proposedCheckOut = checkOut || origCheckOut;
          ranAssign = true;
       }
    }

    if (!ranAssign) {
      // If no selection OR clicking a boundary OR starting a fresh range
      if (!checkIn || !checkOut || isSameDay(day, checkIn) || isSameDay(day, checkOut)) {
        if (checkIn && checkOut && (isSameDay(day, checkIn) || isSameDay(day, checkOut))) {
          // Toggling a boundary: clear it to start new selection from here
          proposedCheckIn = day;
          proposedCheckOut = null;
        } else if (!checkIn) {
          proposedCheckIn = day;
          proposedCheckOut = null;
        } else if (isSameDay(day, checkIn)) {
          proposedCheckIn = null;
          proposedCheckOut = null;
        } else if (isBefore(day, checkIn)) {
          proposedCheckIn = day;
        } else {
          // Forming a range from Check-in
          if (hasConflictBetween(checkIn, day)) {
            proposedCheckIn = day;
            proposedCheckOut = null;
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
             proposedCheckOut = day;
          }
        }
      } else {
        // RANGE IS ALREADY SET (checkIn && checkOut && not same day as boundary)
        // We arrive here if the user clicked a date different from existing checkIn/checkOut
        if (isBefore(day, checkIn)) {
          // 1. Expand range BEFORE
          if (hasConflictBetween(day, checkIn)) {
            // Reset if conflict
            proposedCheckIn = day;
            proposedCheckOut = null;
          } else {
            proposedCheckIn = day;
          }
        } else if (day > checkOut) {
          // 2. Expand range AFTER
          if (hasConflictBetween(checkOut, day)) {
            proposedCheckIn = day;
            proposedCheckOut = null;
          } else {
            proposedCheckOut = day;
          }
        } else {
          // 3. Clicked BETWEEN checkIn and checkOut
          // Determine which end to move to the clicked day
          const distIn = Math.abs(day.getTime() - checkIn.getTime());
          const distOut = Math.abs(day.getTime() - checkOut.getTime());
          
          if (distIn < distOut) {
            // Closer to Check-in, Move checkIn forward (shorten from start)
            if (checkMinNights(day, checkOut)) {
              proposedCheckIn = day;
            } else {
              // If shortening violates min nights, just start over from here
              proposedCheckIn = day;
              proposedCheckOut = null;
            }
          } else {
            // Closer to Check-out, Move checkOut back (shorten from end)
            if (checkMinNights(checkIn, day)) {
              proposedCheckOut = day;
            } else {
              proposedCheckIn = day;
              proposedCheckOut = null;
            }
          }
        }
      }
    }

    // Now, run validation BEFORE applying state changes
    if (isEditMode && proposedCheckIn && proposedCheckOut && origCheckIn && origCheckOut) {
        const val = validateExtendedBookingDates(proposedCheckIn, proposedCheckOut);
        if (!val.isValid) {
            alert(val.message);
            return; // Prevent date selection
        }
    }

    setCheckIn(proposedCheckIn);
    setCheckOut(proposedCheckOut);
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
      sameDayModFee,
      dailySelections || undefined
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

  const handleVerifyLeaseCode = async () => {
    if (!enteredLeaseCode.trim()) {
      setLeaseError("Please enter a Lease Code.");
      return;
    }
    setIsVerifyingLease(true);
    setLeaseError(null);
    setValidatedLeaseCode(null);
    setLeaseDetails(null);

    try {
      const originalCode = enteredLeaseCode.trim();
      let code = originalCode;
      let leaseRef = doc(db, 'leases', code);
      let leaseSnap = await getDoc(leaseRef);

      if (!leaseSnap.exists() && originalCode !== originalCode.toUpperCase()) {
        code = originalCode.toUpperCase();
        leaseRef = doc(db, 'leases', code);
        leaseSnap = await getDoc(leaseRef);
      }

      if (leaseSnap.exists()) {
        const data = leaseSnap.data();
        if (data.status !== 'approved') {
          setLeaseError("This Lease Code is no longer active or approved.");
        } else if (data.propertyId !== propertyId) {
          setLeaseError("This Lease Code belongs to a different property.");
        } else {
          setValidatedLeaseCode(code);
          setLeaseDetails(data);
          if (data.startDate && data.endDate) {
            const startParts = data.startDate.split('-').map(Number);
            const endParts = data.endDate.split('-').map(Number);
            const sDate = new Date(startParts[0], startParts[1] - 1, startParts[2], 12, 0, 0);
            const eDate = new Date(endParts[0], endParts[1] - 1, endParts[2], 12, 0, 0);
            setCheckIn(sDate);
            setCheckOut(eDate);
          }
        }
      } else {
        setLeaseError("Lease Code not found in REALCal Bookings Database. Please double-check.");
      }
    } catch (err: any) {
      console.error("Error verifying Lease Code:", err);
      setLeaseError("Failed to check database: " + err.message);
    } finally {
      setIsVerifyingLease(false);
    }
  };

  const handleLeaseRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaseRequestForm.tenantName || !leaseRequestForm.tenantEmail) {
      alert("Tenant Name and Tenant Email are required.");
      return;
    }
    setSubmittingLeaseForm(true);
    try {
      const requestId = uuidv4();
      const payload = {
        propertyId,
        propertyNameOrRoom: leaseRequestForm.propertyNameOrRoom,
        startDate: leaseRequestForm.startDate,
        endDate: leaseRequestForm.endDate,
        tenantName: leaseRequestForm.tenantName,
        tenantEmail: leaseRequestForm.tenantEmail,
        tenantPhone: leaseRequestForm.tenantPhone,
        status: 'pending',
        rentalMode,
        selectedBedrooms: rentalMode === 'room' ? selectedRooms : [],
        createdAt: new Date().toISOString()
      };

      // Save request to Firestore
      await setDoc(doc(db, 'lease_requests', requestId), {
        ...payload,
        createdAt: serverTimestamp()
      });

      // Email Property Managers
      await fetch('/api/submit-lease-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setLeaseFormSuccess(true);
    } catch (err: any) {
      console.error("Lease Request submit error:", err);
      alert("Failed to submit Lease Request: " + err.message);
    } finally {
      setSubmittingLeaseForm(false);
    }
  };

  const handleBook = () => {
    if (checkIn && checkOut) {
       if (isBefore(checkOut, checkIn) || isSameDay(checkIn, checkOut)) {
           alert("Check-out date must be after Check-in date.");
           return;
       }
       if (differenceInDays(checkOut, checkIn) < 2) {
           alert("A minimum of 2 days is required to Proceed.");
           return;
       }
    }
    if (checkIn && checkOut && priceDetails) {
       if (rentalMode === 'room' && selectedRooms.length === 0) {
           alert("Please select at least one room.");
           return;
       }

       // Require Lease Code if consecutive nights exceed 30
       if (priceDetails.nights > 30) {
           if (globalSettings?.allowLongTermRentals === false) {
               alert("Short-Term rentals of more than 30 days is not available at this time and to choose less amount of consecutive days.");
               return;
           }
           if (!validatedLeaseCode) {
               alert(`A Lease Code is required for ${priceDetails.nights > 180 ? 'long-term' : 'short-term'} bookings. Please verify your code or fill out the Lease Request Form.`);
               return;
           }
       }

       navigate('/checkout', { state: { 
         propertyId,
         checkIn: format(checkIn, 'yyyy-MM-dd'), 
         checkOut: format(checkOut, 'yyyy-MM-dd'), 
         priceDetails,
         selectedBedrooms: selectedRooms, dailySelections,
         rentalMode,
         leaseCode: validatedLeaseCode,
         bookingType: priceDetails.nights > 180 ? 'long-term' : 'short-term'
       }});
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 container mx-auto">
      {/* Main Calendar Section - col-8 */}
      <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
        {property?.allowIndividualRoomRental && (
          <>
             <div className="bg-indigo-50/50 border border-indigo-100/55 rounded-2xl p-4 mb-5">
                <div className="flex gap-3">
                   <HelpCircle className="text-indigo-600 shrink-0 mt-0.5" size={17} />
                   <div className="space-y-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950">How to Book Entire Property vs Individual Rooms</h4>
                      <p className="text-xs text-slate-700 leading-relaxed font-normal">
                         To book the <strong>Entire Property</strong>, leave the toggle in <strong>Entire Property</strong> mode.
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed font-normal">
                         To view or select <strong>Individual or Multiple Rooms</strong>, click on the <strong className="text-indigo-700 font-bold">"Entire Property (Locked)"</strong> button first. This will release the lockdown and allow you to click <strong>"Select Rooms"</strong> to check availability and select specific rooms below.
                      </p>
                   </div>
                </div>
             </div>
             <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl mb-6">
                <button 
                   type="button"
                   onClick={handleEntirePropertyClick} 
                   className={cn(
                      "flex-1 px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all", 
                      rentalMode === 'entire' 
                         ? "bg-white shadow-sm text-indigo-600" 
                         : "text-slate-500 hover:text-indigo-600"
                   )}
                >
                   {rentalMode === 'entire' && (
                      isEntirePropertyLocked 
                         ? <Lock size={14} className="text-indigo-600" /> 
                         : <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                   )}
                   Entire Property {rentalMode === 'entire' && (isEntirePropertyLocked ? "(Locked)" : "(Released)")}
                </button>
                <button 
                   type="button"
                   onClick={() => handleGlobalRentalModeChange('room')} 
                   disabled={rentalMode === 'entire' && isEntirePropertyLocked}
                   className={cn(
                      "flex-1 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5", 
                      rentalMode === 'room' 
                         ? "bg-white shadow-sm text-indigo-600" 
                         : (rentalMode === 'entire' && isEntirePropertyLocked ? "text-slate-300 cursor-not-allowed opacity-50" : "text-slate-500 hover:text-indigo-600")
                   )}
                >
                   Select Rooms
                </button>
             </div>
          </>
        )}
        {rentalMode === 'room' && (
            <div className="flex flex-wrap gap-2 mb-6">
                {property?.bedrooms?.map(room => {
                    const isSelected = selectedRooms.some(r => r.roomNumber === room.roomNumber);
                    return (
                        <button 
                            key={room.roomNumber} 
                             onClick={() => handleGlobalRoomToggle(room)} 
                            className={cn(
                                "px-4 py-2 rounded-xl text-sm font-bold border flex flex-col items-start gap-0.5 transition-all", 
                                isSelected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300"
                            )}
                        >
                            <div className="flex justify-between w-full gap-4">
                                <span>{room.type} {room.roomNumber} (Max {room.maxCapacity || 2})</span>
                                <span className="font-mono">${room.fee}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider">
                                {room.sqFt > 0 && <span className={isSelected ? "text-indigo-200" : "text-slate-400"}>{room.sqFt} sq ft</span>}
                                {room.sqFt > 0 && <span className={isSelected ? "text-indigo-300" : "text-slate-300"}>•</span>}
                                <span className={isSelected ? "text-indigo-200" : "text-indigo-600 font-bold"}>Max {room.maxCapacity || 2} Guests</span>
                            </div>
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
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex justify-between items-center bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                   <span>🌙 Night-by-Night Customizer</span>
                   <span className="text-[9px] text-slate-400 normal-case font-normal">Adjust any night</span>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-2 scrollbar-hide">
                   {eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) }).map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const selection = dailySelections && dailySelections[dateStr] ? dailySelections[dateStr] : { rentalMode: rentalMode, selectedBedrooms: rentalMode === 'room' ? [...selectedRooms] : [] };
                      const isEntireDay = selection.rentalMode === 'entire';
                      const dayRate = isEntireDay 
                         ? getNightlyRate(day, pricingRules, null, 'entire', checkIn && checkOut ? differenceInDays(checkOut, checkIn) : undefined)
                         : selection.selectedBedrooms.reduce((acc, r) => acc + getNightlyRate(day, pricingRules, r, 'room', checkIn && checkOut ? differenceInDays(checkOut, checkIn) : undefined), 0);
                      
                      return (
                         <div key={dateStr} className="p-3 bg-slate-800/40 rounded-xl border border-slate-800/50 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                               <div className="flex flex-col">
                                  <span className="font-bold text-white text-xs">{format(day, 'EEE, MMM d')}</span>
                                  <span className="text-[10px] text-indigo-300 font-medium mt-0.5">
                                     {isEntireDay ? 'Entire Property' : `${selection.selectedBedrooms.length || 0} Room(s)`}
                                  </span>
                               </div>
                               <span className="font-mono font-bold text-indigo-400">${dayRate.toFixed(2)}</span>
                            </div>
                            
                            {property?.allowIndividualRoomRental && (
                               <div className="flex flex-col gap-1.5 border-t border-slate-800/65 pt-2 text-[10px]">
                                  {/* Selection Mode Selector to toggle entire vs room */}
                                  <div className="flex bg-slate-900/90 p-0.5 rounded-lg border border-slate-800/80">
                                     <button 
                                        type="button"
                                        onClick={() => handleDailyModeChange(dateStr, 'entire')}
                                        disabled={rentalMode === 'entire' && isEntirePropertyLocked}
                                        className={cn("flex-1 py-1 rounded-md text-[9px] font-bold text-center transition-all", isEntireDay ? "bg-indigo-600 text-white shadow-sm" : (rentalMode === 'entire' && isEntirePropertyLocked ? "text-slate-600 cursor-not-allowed opacity-50" : "text-slate-400 hover:text-white"))}
                                     >
                                        Entire Property
                                     </button>
                                     <button 
                                        type="button"
                                        onClick={() => handleDailyModeChange(dateStr, 'room')}
                                        disabled={rentalMode === 'entire' && isEntirePropertyLocked}
                                        className={cn("flex-1 py-1 rounded-md text-[9px] font-bold text-center transition-all", !isEntireDay ? "bg-indigo-600 text-white shadow-sm" : (rentalMode === 'entire' && isEntirePropertyLocked ? "text-slate-600 cursor-not-allowed opacity-50" : "text-slate-400 hover:text-white"))}
                                     >
                                        Select Rooms
                                     </button>
                                  </div>
                                  
                                  {/* Specific bedrooms checkboxes for this night if room rental chosen */}
                                  {!isEntireDay && (
                                     <div className="grid grid-cols-1 gap-1 bg-slate-950 p-2 rounded-lg border border-slate-800 mt-1">
                                        {property?.bedrooms?.map(room => {
                                           const isRoomActive = selection.selectedBedrooms.some((r: any) => r.roomNumber === room.roomNumber);
                                           return (
                                              <label key={room.roomNumber} className="flex items-center justify-between text-[10px] text-slate-400 hover:text-white cursor-pointer select-none">
                                                 <div className="flex items-center gap-1.5">
                                                    <input 
                                                       type="checkbox"
                                                       checked={isRoomActive}
                                                       onChange={() => handleDailyRoomToggle(dateStr, room)}
                                                       className="w-3 h-3 accent-indigo-500 rounded border-slate-700 bg-slate-800"
                                                    />
                                                    <span>{room.type} {room.roomNumber}</span>
                                                 </div>
                                                 <span className="font-mono text-[9px] text-indigo-300">+${room.fee}</span>
                                              </label>
                                           );
                                        })}
                                     </div>
                                  )}
                               </div>
                            )}
                         </div>
                      );
                   })}
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
                         onClick={() => handleGlobalRentalModeChange('entire')}
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
                             <div className="font-mono font-bold">${getNightlyRate(new Date(), pricingRules, null, 'entire', priceDetails?.nights).toFixed(0)}/nt</div>
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
if (false) setSelectedRooms(prev => 
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
                                     Individual Room {room.sqFt > 0 && `• ${room.sqFt} sq ft`} • Max {room.maxCapacity || 2} Guests
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className="font-mono font-bold">${getNightlyRate(new Date(), pricingRules, room, 'room', priceDetails?.nights).toFixed(0)}/nt</span>
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
            
             {/* Lease Code and Request Form section */}
             {priceDetails && priceDetails.nights > 30 && (
               globalSettings?.allowLongTermRentals === false ? (
                 <div className="bg-rose-500/10 border border-rose-500/25 rounded-3xl p-6 mb-4 text-xs font-sans text-rose-200 text-left">
                   <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-[11px] mb-2">
                     <AlertCircle size={14} />
                     <span>Short-Term Restriction ({priceDetails.nights} Nights)</span>
                   </div>
                   <p className="text-rose-300 font-semibold text-sm leading-relaxed">
                     Short-Term rentals of more than 30 days is not available at this time and to choose less amount of consecutive days.
                   </p>
                 </div>
               ) : (
                 <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 text-xs font-sans text-slate-300">
                 <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-wider text-[11px] mb-2">
                   <FileText size={14} />
                   <span>{priceDetails.nights > 180 ? 'Long-Term Lease Required' : 'Short-Term Lease Required'} ({priceDetails.nights} Nights)</span>
                 </div>
                 
                 <p className="text-slate-400 text-[11px] mb-4 leading-normal">
                   Bookings exceeding 30 nights are categorized as {priceDetails.nights > 180 ? 'long-term' : 'short-term'} rentals. An authorized <strong>Lease Code #</strong> is required before checkout.
                 </p>

                 {validatedLeaseCode ? (
                   <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-4 text-emerald-300 flex flex-col gap-1 mb-2">
                     <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-emerald-400">
                       <CheckCircle2 size={13} /> Lease Code Verified
                     </div>
                     <p className="font-mono text-sm tracking-wider font-extrabold mt-1 text-white">Code: {validatedLeaseCode}</p>
                     {leaseDetails && (
                       <div className="text-[10px] text-emerald-400 mt-2 space-y-0.5 border-t border-emerald-500/10 pt-2 text-left">
                         <div><strong className="text-slate-400">Tenant:</strong> {leaseDetails.tenantName}</div>
                         <div><strong className="text-slate-400">Email:</strong> {leaseDetails.tenantEmail}</div>
                         <div><strong className="text-slate-400">Duration:</strong> {leaseDetails.startDate} to {leaseDetails.endDate}</div>
                       </div>
                     )}
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {/* Verification Input */}
                     <div>
                       <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 text-left">Enter Lease Code #</label>
                       <div className="flex gap-2">
                         <input
                           type="text"
                           placeholder="LC-XXXXXX"
                           value={enteredLeaseCode}
                           onChange={(e) => {
                             setEnteredLeaseCode(e.target.value);
                             setLeaseError(null);
                           }}
                           className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tracking-wider focus:outline-none focus:border-indigo-500 text-xs"
                         />
                         <button
                           type="button"
                           onClick={handleVerifyLeaseCode}
                           disabled={isVerifyingLease}
                           className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold transition-all flex items-center justify-center cursor-pointer text-xs"
                         >
                           {isVerifyingLease ? <Loader2 size={13} className="animate-spin" /> : 'Verify'}
                         </button>
                       </div>
                       {leaseError && (
                         <p className="text-rose-400 mt-1.5 text-[10px] flex items-center gap-1 text-left">
                           <AlertCircle size={10} /> {leaseError}
                         </p>
                       )}
                     </div>

                     {/* Call to action for those who don't have code */}
                     <div className="border-t border-slate-800 pt-3 text-left">
                       <p className="text-[11px] text-slate-400 leading-normal mb-2">
                         Don't have a Lease Code #? You must fill out our Property Manager Lease Request Form.
                       </p>
                       <button
                         type="button"
                         onClick={() => setShowLeaseForm(true)}
                         className="text-xs text-indigo-400 hover:text-indigo-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                       >
                         📋 Fill Lease Request Form
                       </button>
                     </div>
                   </div>
                 )}

                 {/* Modal for Lease Request Form */}
                 {showLeaseForm && (
                   <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                     <div className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                       <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                         <div className="text-left">
                           <h3 className="text-base font-bold text-white flex items-center gap-1.5 font-sans">
                             <FileText className="text-indigo-400" size={18} /> Apply for Lease Code
                           </h3>
                           <p className="text-[11px] text-slate-400 mt-0.5">Your request will be routed directly to the property managers.</p>
                         </div>
                         <button
                           type="button"
                           onClick={() => setShowLeaseForm(false)}
                           className="text-slate-400 hover:text-white transition-colors p-1 font-bold text-base cursor-pointer"
                         >
                           ✕
                         </button>
                       </div>

                       {leaseFormSuccess ? (
                         <div className="text-center py-8 px-4 flex flex-col items-center justify-center">
                           <div className="bg-emerald-500/10 p-3 rounded-full mb-4">
                             <CheckCircle2 size={36} className="text-emerald-400" />
                           </div>
                           <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Lease Request Submitted!</h4>
                           <p className="text-slate-300 text-xs mb-6 max-w-sm leading-relaxed text-center">
                             Your request is automatically sent to our Property Managers. Once approved, you will receive an email containing your unique <strong>Lease Code #</strong> to finish booking.
                           </p>
                           <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl w-full text-left space-y-1 text-[11.5px] mb-6">
                             <div><span className="text-slate-500 font-medium">Tenant Name:</span> <span className="text-slate-300 font-semibold">{leaseRequestForm.tenantName}</span></div>
                             <div><span className="text-slate-500 font-medium">Email Address:</span> <span className="text-slate-300 font-semibold">{leaseRequestForm.tenantEmail}</span></div>
                             <div><span className="text-slate-500 font-medium">Dates Requested:</span> <span className="text-slate-300 font-semibold">{leaseRequestForm.startDate} to {leaseRequestForm.endDate}</span></div>
                           </div>
                           <button
                             type="button"
                             onClick={() => setShowLeaseForm(false)}
                             className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all cursor-pointer"
                           >
                             Close & Wait for Email
                           </button>
                         </div>
                       ) : (
                         <form onSubmit={handleLeaseRequestSubmit} className="space-y-4 overflow-y-auto pr-1">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                             {/* Property/Room detail */}
                             <div className="md:col-span-2">
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Entire Property or Room number
                               </label>
                               <input
                                 type="text"
                                 required
                                 value={leaseRequestForm.propertyNameOrRoom}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, propertyNameOrRoom: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                                 placeholder="e.g. Entire Cabin, Room 3"
                               />
                             </div>

                             {/* Lease Start Date */}
                             <div>
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Lease Start Date
                               </label>
                               <input
                                 type="date"
                                 required
                                 value={leaseRequestForm.startDate}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, startDate: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                               />
                             </div>

                             {/* Lease End Date */}
                             <div>
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Lease End Date
                               </label>
                               <input
                                 type="date"
                                 required
                                 value={leaseRequestForm.endDate}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, endDate: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                               />
                             </div>

                             {/* Tenant Full Name */}
                             <div className="md:col-span-2">
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Tenant Full Name
                               </label>
                               <input
                                 type="text"
                                 required
                                 placeholder="John Doe"
                                 value={leaseRequestForm.tenantName}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, tenantName: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                               />
                             </div>

                             {/* Tenant Email Address */}
                             <div>
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Tenant Email Address
                               </label>
                               <input
                                 type="email"
                                 required
                                 placeholder="johndoe@example.com"
                                 value={leaseRequestForm.tenantEmail}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, tenantEmail: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                                />
                             </div>

                             {/* Tenant Phone Number */}
                             <div>
                               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                 Tenant Phone Number
                               </label>
                               <input
                                 type="tel"
                                 required
                                 placeholder="(555) 000-0000"
                                 value={leaseRequestForm.tenantPhone}
                                 onChange={(e) => setLeaseRequestForm({...leaseRequestForm, tenantPhone: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                               />
                             </div>
                           </div>

                           <div className="flex gap-3 justify-end pt-4 border-t border-slate-800 mt-6">
                             <button
                               type="button"
                               onClick={() => setShowLeaseForm(false)}
                               className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl transition-all cursor-pointer text-xs"
                             >
                               Cancel
                             </button>
                             <button
                               type="submit"
                               disabled={submittingLeaseForm}
                               className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold px-6 py-2 rounded-xl transition-all flex items-center gap-1.5 text-xs cursor-pointer"
                             >
                               {submittingLeaseForm && <Loader2 size={13} className="animate-spin" />}
                               Submit Request
                             </button>
                           </div>
                         </form>
                       )}
                     </div>
                   </div>
                 )}
               </div>
             ))}

            {!isEditMode && checkIn && checkOut && (
               <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl mb-4 text-xs">
                  <label className="flex items-start gap-3 cursor-pointer select-none text-slate-300">
                     <input 
                       type="checkbox" 
                       id="agree-rules-checkbox"
                       checked={agreedToHouseRules}
                       onChange={(e) => setAgreedToHouseRules(e.target.checked)}
                       className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:text-indigo-600 accent-indigo-600 cursor-pointer"
                     />
                     <div className="leading-relaxed">
                        <span className="font-bold text-slate-100 block mb-1 uppercase tracking-wider text-[10px] text-amber-400">House Rules Agreement</span>
                        <span className="text-slate-300 text-[11px]">
                          I agree that properties are <strong>NOT Pet Friendly</strong> and there is <strong>ZERO tolerance</strong> for Drugs, Smoking, and Weapons. (Alcohol is OK).
                        </span>
                     </div>
                  </label>

                  {rentalMode === 'room' && (
                     <div className="pt-3 border-t border-slate-800 space-y-2 mt-3 text-left">
                        <label className="flex items-start gap-3 cursor-pointer select-none text-slate-300">
                           <input 
                             type="checkbox" 
                             id="agree-nokids-checkbox"
                             checked={agreedToNoKidsUnder10}
                             onChange={(e) => setAgreedToNoKidsUnder10(e.target.checked)}
                             className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:text-indigo-600 accent-indigo-600 cursor-pointer flex-shrink-0"
                           />
                           <div className="leading-relaxed">
                              <span className="font-bold text-slate-100 block mb-1 uppercase tracking-wider text-[10px] text-rose-400">Age Restriction Policy</span>
                              <span className="text-slate-300 text-[11px]">
                                I certify that none of the guests in our party are <strong>children under 10 years of age</strong>.
                              </span>
                           </div>
                        </label>
                        <div className="pl-7 text-[10px] text-slate-400 leading-normal italic text-left">
                           💡 <strong>SPECIAL Arrangements:</strong> Special arrangements can be made if multiple adults agree to rent rooms during the same time period. Please call the Booking Agent for more information before completing your Booking.
                        </div>
                     </div>
                  )}
               </div>
            )}
            
            <button 
              onClick={() => {
                  if (checkIn && checkOut && (isBefore(checkOut, checkIn) || isSameDay(checkIn, checkOut))) {
                      alert("Check-out date must be after Check-in date.");
                      return;
                  }
                  if (checkIn && checkOut && differenceInDays(checkOut, checkIn) < 2) {
                      alert("A minimum of 2 days is required to Proceed.");
                      return;
                  }
                  if (isEditMode && onSaveEdit && checkIn && checkOut && priceDetails) {
                      const val = validateExtendedBookingDates(checkIn, checkOut);
                      if (!val.isValid) {
                          alert(val.message);
                          return;
                      }
                      onSaveEdit(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'), priceDetails, selectedRooms, rentalMode, dailySelections);
                  } else {
                      handleBook();
                  }
              }}
              disabled={!checkIn || !checkOut || (user && user.tollFreeAccept !== true && !isEditMode) || (!agreedToHouseRules && !isEditMode) || (rentalMode === 'room' && !agreedToNoKidsUnder10 && !isEditMode) || (priceDetails && priceDetails.nights > 30 && (globalSettings?.allowLongTermRentals === false || !validatedLeaseCode) && !isEditMode)}
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
