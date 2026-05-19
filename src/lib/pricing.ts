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

export const calculatePriceDetails = (checkInStr: string, checkOutStr: string, pricingRules: PricingRule[], globalSettings: any, selectedRoom: any | null, rentalMode: 'entire' | 'room') => {
  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);
  
  // Date-fns eachDayOfInterval includes the end date, but checkout day is not charged
  const interval = eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) });
  
  let totalNightsRate = 0;
  interval.forEach(day => {
    totalNightsRate += getNightlyRate(day, pricingRules, selectedRoom, rentalMode);
  });
  
  let cleaningFee = globalSettings?.cleaningFee || 100;
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
