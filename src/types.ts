export type RuleType = 'default' | 'weekend' | 'holiday' | 'custom' | 'daily' | 'five_day' | 'weekly' | 'monthly';

export interface PropertyImage {
  url: string;
  roomNumber?: string;
}

export interface Property {
  id: string;
  name: string;
  location?: string;
  description: string;
  images: (string | PropertyImage)[];
  promoVideoUrl?: string;
  isTestProperty?: boolean;
  hasSmartLock?: boolean;
  frontDoorCode?: string;
  allowIndividualRoomRental?: boolean;
  bedrooms?: { roomNumber: string; roomLockNumber: string; type: 'Master Bed' | 'Guest Bedroom'; sqFt: number; fee: number; maxCapacity?: number }[];
  createdAt: any;
}

export function getImageUrl(img: string | PropertyImage | undefined | null): string {
  if (!img) return '';
  if (typeof img === 'string') return img;
  return img.url || '';
}

export function getImageRoomNumber(img: string | PropertyImage | undefined | null): string | undefined {
  if (!img) return undefined;
  if (typeof img === 'string') return undefined;
  return img.roomNumber;
}

export interface PricingRule {
  id: string;
  propertyId: string;
  type: RuleType;
  rate: number;
  startDate?: string;
  endDate?: string;
  name?: string;
  targetType?: 'property' | 'room';
  roomNumber?: string;
  createdAt: any;
}

export interface BlackoutDate {
  id: string;
  propertyId: string;
  date: string;
  reason?: string;
  targetType?: 'property' | 'room';
  roomNumber?: string;
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
  status: 'pending' | 'confirmed' | 'cancelled' | 'pending_payment';
  totalPrice: number; // in cents
  paymentIntentId?: string;
  guests: number;
  accessCode?: string;
  bookingRef?: string;
  cancellationFee?: number; // in cents
  deletedByGuest?: boolean;
  selectedBedroom?: any;
  selectedBedrooms?: any[];
  guestPhone?: string;
  guestEmail?: string;
  guestName?: string;
  createdAt: any;
  updatedAt: any;
  priceDetails?: any;
  checkedIn?: boolean;
  checkedInAt?: string;
  checkedOut?: boolean;
  checkedOutAt?: string;
  lateCheckoutFee?: number;
  overdueHours?: number;
  checkoutRemindersEnabled?: boolean;
  sent12hReminder?: boolean;
  sent2hReminder?: boolean;
  sent1hReminder?: boolean;
  invoiceDetails?: any;
  invoiceEmailed?: boolean;
  rentalMode?: string;
  propertyName?: string;
  propertyImage?: string;
  agreedToHouseRules?: boolean;
  agreedToBookingAgreement?: boolean;
  agreementsAcceptedAt?: string;
  renewalDecision?: 'yes' | 'no' | 'pending' | 'renewed';
  sentRenewalNotification?: boolean;
  sentRenewalNotificationAt?: string;
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

export interface Lease {
  id: string;
  leaseCode: string;
  invoiceNumber?: string;
  bookingId?: string;
  propertyId: string;
  propertyNameOrRoom: string;
  startDate: string;
  endDate: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  leaseType?: 'month_to_month' | 'fixed';
  monthlyRent?: number;
  status: 'approved' | 'revoked' | 'active' | 'pending_renewal' | 'renewed' | 'terminating';
  validatedForNextMonth?: boolean;
  validatedAt?: string;
  lastReminderSentAt?: string;
  createdAt: any;
}

export interface LeaseRequest {
  id: string;
  propertyId: string;
  propertyNameOrRoom: string;
  startDate: string;
  endDate: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export interface DiscountCode {
  id: string;
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  guestEmailRestriction?: string;
  propertyRestriction?: string;
  maxUses?: number;
  useCount: number;
  isActive: boolean;
  notes?: string;
  createdAt: any;
}


