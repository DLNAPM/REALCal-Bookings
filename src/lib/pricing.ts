import { eachDayOfInterval, format, getDay, addDays } from "date-fns";

export interface PricingRule {
  id?: string;
  propertyId: string;
  type: 'default' | 'weekend' | 'holiday' | 'custom';
  rate: number;
  startDate?: string;
  endDate?: string;
  targetType?: 'property' | 'room';
  roomNumber?: number | null;
}

export const getNightlyRate = (date: Date, pricingRules: PricingRule[], selectedRoom: any | null, rentalMode: 'entire' | 'room'): number => {
  const applicableRules = pricingRules.filter(r => {
    if (rentalMode === 'room') {
      return r.targetType === 'room' && r.roomNumber === selectedRoom?.roomNumber;
    } else {
      return !r.targetType || r.targetType === 'property';
    }
  });

  // Initial base rate fallback
  let rate = 150; 
  if (rentalMode === 'room' && selectedRoom) {
    rate = selectedRoom.fee || 150;
  }

  const dateStr = format(date, 'yyyy-MM-dd');

  // Find rules by priority
  const defaultRule = applicableRules.find(r => r.type === 'default');
  if (defaultRule) rate = defaultRule.rate;

  const weekendRule = applicableRules.find(r => r.type === 'weekend');
  if (weekendRule && (getDay(date) === 5 || getDay(date) === 6)) rate = weekendRule.rate;

  const holidayRule = applicableRules.find(r => r.type === 'holiday' && r.startDate && r.endDate && dateStr >= r.startDate && dateStr <= r.endDate);
  if (holidayRule) rate = holidayRule.rate;

  const customRule = applicableRules.find(r => r.type === 'custom' && r.startDate && dateStr === r.startDate);
  if (customRule) rate = customRule.rate;

  return rate;
};

export const calculatePriceDetails = (
  checkInStr: string, 
  checkOutStr: string, 
  pricingRules: PricingRule[], 
  globalSettings: any, 
  selectedRooms: any[] | any | null, 
  rentalMode: 'entire' | 'room'
) => {
  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);
  
  // Normalize selectedRooms to an array if it's not null
  let rooms: any[] = [];
  if (rentalMode === 'room') {
    if (Array.isArray(selectedRooms)) {
      rooms = selectedRooms;
    } else if (selectedRooms) {
      rooms = [selectedRooms];
    }
  }

  // Date-fns eachDayOfInterval includes the end date, but checkout day is not charged
  const interval = eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) });
  
  let totalNightsRate = 0;
  interval.forEach(day => {
    if (rentalMode === 'room' && rooms.length > 0) {
      rooms.forEach(room => {
        totalNightsRate += getNightlyRate(day, pricingRules, room, 'room');
      });
    } else {
      totalNightsRate += getNightlyRate(day, pricingRules, null, 'entire');
    }
  });
  
  let cleaningFee = globalSettings?.cleaningFee || 100;
  // If renting multiple rooms, maybe cleaning fee is per room? 
  // Let's assume singular cleaning fee for entire property or per booking for now unless specified.
  // Actually, let's make it per room if room rental, or a base fee.
  if (rentalMode === 'room' && rooms.length > 1) {
     // Optional: adjust cleaning fee for multiple rooms? 
     // User didn't specify, so I'll keep it simple but maybe multiply by rooms if we want to be realistic.
     // However, let's stick to the current logic unless it feels wrong.
  }
  let nights = interval.length;
  let discount = 0;
  
  // 10% discount for 7+ days (simplified common logic)
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
