import { eachDayOfInterval, format, getDay, addDays } from "date-fns";

export interface PricingRule {
  id?: string;
  propertyId: string;
  type: 'default' | 'weekend' | 'holiday' | 'custom' | 'daily' | 'five_day' | 'weekly' | 'monthly';
  rate: number;
  startDate?: string;
  endDate?: string;
  targetType?: 'property' | 'room';
  roomNumber?: string | number | null;
}

export const getNightlyRate = (
  date: Date, 
  pricingRules: PricingRule[], 
  selectedRoom: any | null, 
  rentalMode: 'entire' | 'room',
  stayNights?: number
): number => {
  const applicableRules = pricingRules.filter(r => {
    if (rentalMode === 'room') {
      return r.targetType === 'room' && String(r.roomNumber) === String(selectedRoom?.roomNumber);
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

  // Let's resolve the length-of-stay (duration-based) baseline rate if stayNights is provided
  if (stayNights !== undefined && stayNights > 0) {
    let stayTypeRule: PricingRule | undefined;
    if (stayNights >= 30) {
      stayTypeRule = applicableRules.find(r => r.type === 'monthly')
        || applicableRules.find(r => r.type === 'weekly')
        || applicableRules.find(r => r.type === 'five_day')
        || applicableRules.find(r => r.type === 'daily');
    } else if (stayNights >= 7) {
      stayTypeRule = applicableRules.find(r => r.type === 'weekly')
        || applicableRules.find(r => r.type === 'five_day')
        || applicableRules.find(r => r.type === 'daily');
    } else if (stayNights >= 5) {
      stayTypeRule = applicableRules.find(r => r.type === 'five_day')
        || applicableRules.find(r => r.type === 'daily');
    } else {
      stayTypeRule = applicableRules.find(r => r.type === 'daily');
    }

    if (stayTypeRule) {
      rate = stayTypeRule.rate;
    }
  } else {
    // If stayNights is not specified/provided, fallback to looking for 'daily' rules as the default
    const dailyRule = applicableRules.find(r => r.type === 'daily');
    if (dailyRule) rate = dailyRule.rate;
  }

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
  rentalMode: 'entire' | 'room',
  sameDayModificationFee: number = 0,
  dailySelections?: {
    [dateStr: string]: {
      rentalMode: 'entire' | 'room';
      selectedBedrooms: any[];
    }
  }
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
  let nights = interval.length;
  
  let totalNightsRate = 0;
  interval.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const customSelection = dailySelections?.[dayStr];

    if (customSelection) {
      if (customSelection.rentalMode === 'room') {
        const roomsToCharge = customSelection.selectedBedrooms && customSelection.selectedBedrooms.length > 0
          ? customSelection.selectedBedrooms
          : (rooms.length > 0 ? rooms : []);
        
        if (roomsToCharge.length > 0) {
          roomsToCharge.forEach((room: any) => {
            totalNightsRate += getNightlyRate(day, pricingRules, room, 'room', nights);
          });
        } else {
          totalNightsRate += getNightlyRate(day, pricingRules, null, 'entire', nights);
        }
      } else {
        totalNightsRate += getNightlyRate(day, pricingRules, null, 'entire', nights);
      }
    } else {
      if (rentalMode === 'room' && rooms.length > 0) {
        rooms.forEach(room => {
          totalNightsRate += getNightlyRate(day, pricingRules, room, 'room', nights);
        });
      } else {
        totalNightsRate += getNightlyRate(day, pricingRules, null, 'entire', nights);
      }
    }
  });
  
  let cleaningFee = globalSettings?.cleaningFee || 100;
  let discount = 0;
  
  // Check if length-of-stay pricing rules exist for this selection
  // If there are weekly or monthly explicit rules, we do not double-discount by applying the automatic 10% weekly discount
  const hasLengthOfStayRules = pricingRules.some(r => r.type === 'weekly' || r.type === 'monthly');
  if (nights >= 7 && !hasLengthOfStayRules) {
    discount = totalNightsRate * 0.1;
    totalNightsRate -= discount;
  }
  
  let taxes = (totalNightsRate + cleaningFee) * 0.12;

  // Calculate 1 month's rate for security deposit if stay is > 60 days
  // Setup standard base rate context for a 30-day stay to calculate a whole month's rate
  let oneDayRate = 0;
  if (rentalMode === 'room' && rooms.length > 0) {
    rooms.forEach(room => {
      oneDayRate += getNightlyRate(checkIn, pricingRules, room, 'room', 30);
    });
  } else {
    oneDayRate += getNightlyRate(checkIn, pricingRules, null, 'entire', 30);
  }
  const monthlyRate = oneDayRate * 30;
  const securityDeposit = nights > 60 ? monthlyRate : 0;

  return {
    nights,
    baseTotal: totalNightsRate,
    cleaningFee,
    discount,
    taxes,
    sameDayModificationFee,
    grandTotal: totalNightsRate + cleaningFee + taxes + sameDayModificationFee,
    monthlyRate,
    securityDeposit
  };
};
