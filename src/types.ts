export type RuleType = 'default' | 'weekend' | 'holiday' | 'custom';

export interface Property {
  id: string;
  name: string;
  description: string;
  images: string[];
  isTestProperty?: boolean;
  hasSmartLock?: boolean;
  allowIndividualRoomRental?: boolean;
  bedrooms?: { roomNumber: string; roomLockNumber: string; type: 'Master Bed' | 'Guest Bedroom'; sqFt: number; fee: number }[];
  createdAt: any;
}

export interface PricingRule {
  id: string;
  propertyId: string;
  type: RuleType;
  rate: number;
  startDate?: string;
  endDate?: string;
  name?: string;
  createdAt: any;
}

export interface BlackoutDate {
  id: string;
  propertyId: string;
  date: string;
  reason?: string;
  createdAt: any;
}

export interface PropertyManager {
  id: string;
  name: string;
  email: string;
  phone: string;
  enabled: boolean;
  createdAt: any;
}

export interface Booking {
  id: string;
  userId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  totalPrice: number;
  guests: number;
  accessCode?: string;
  bookingRef?: string;
  cancellationFee?: number;
  createdAt: any;
  updatedAt: any;
}

export interface GlobalSettings {
  minDaysDefault: number;
  minDaysWeekend: number;
  cancellationRules: {
    id: string;
    minBookingDays: number;
    freeCancelHoursBefore: number;
    lateCancelFeePercent: number;
  }[];
  updatedAt?: any;
}
