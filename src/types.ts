export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'restricted';

export interface UserProfile {
  uid: string;
  name: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  location?: string;
  language: string;
  phone?: string;
  bankAccount?: string;
  ifscCode?: string;
  phoneVerified?: boolean;
  createdAt: string;
}

export interface Machine {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  price: number;
  priceUnit: 'hr' | 'acre';
  image?: string;
  location?: string;
  description?: string;
  available: boolean;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Booking {
  id: string;
  renterId: string;
  machineId: string;
  ownerId: string;
  machineName: string;
  renterName: string;
  date: string; // Creation date
  bookingDate: string; // The date the machine is booked for
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  work_done: boolean;
  basePrice: number; // Original rent
  renterFee: number; // Extra paid by renter
  renterTotal: number; // basePrice + renterFee
  ownerFee: number; // Deducted from owner
  ownerNet: number; // basePrice - ownerFee
  totalPrice: number; // This was used before, keeping for compatibility or as basePrice
  workDuration?: number;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  date: string;
  read: boolean;
  type: 'info' | 'success' | 'warning';
}
