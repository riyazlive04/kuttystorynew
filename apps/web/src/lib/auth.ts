import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Customer {
  id: string;
  phone: string;
  name?: string;
  createdAt: string;
}

interface CustomerAuthState {
  customer: Customer | null;
  pendingPhone: string | null;
  pendingOtp: string | null;
  isLoggedIn: boolean;
  attemptCount: number;

  // Actions
  sendOtp: (phone: string) => Promise<{ success: boolean; message?: string; demoOtp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setPendingPhone: (phone: string | null) => void;
}

export function formatIndianPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "").slice(-10);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return phone;
}

export const useCustomerAuth = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      pendingPhone: null,
      pendingOtp: null,
      isLoggedIn: false,
      attemptCount: 0,

      sendOtp: async (phone: string) => {
        const clean = phone.replace(/\D/g, "").slice(-10);
        if (clean.length !== 10) {
          return { success: false, message: "Please enter a valid 10-digit mobile number." };
        }

        // Generate a random 4-digit OTP per session and reset attempt count
        const demoOtp = Math.floor(1000 + Math.random() * 9000).toString();
        set({
          pendingPhone: clean,
          pendingOtp: demoOtp,
          attemptCount: 0,
        });

        return {
          success: true,
          demoOtp,
          message: `OTP sent to +91 ${clean}`,
        };
      },

      verifyOtp: async (phone: string, otp: string) => {
        const clean = phone.replace(/\D/g, "").slice(-10);
        const { pendingPhone, pendingOtp, attemptCount } = get();

        if (attemptCount >= 3) {
          return { success: false, message: "Maximum verification attempts reached. Please request a new OTP." };
        }

        // Check if OTP matches the session OTP
        if (pendingOtp && otp === pendingOtp && clean === pendingPhone) {
          const customer: Customer = {
            id: `cust_${clean}`,
            phone: clean,
            createdAt: new Date().toISOString(),
          };

          set({
            customer,
            isLoggedIn: true,
            pendingPhone: null,
            pendingOtp: null,
            attemptCount: 0,
          });

          return { success: true };
        }

        const newAttemptCount = attemptCount + 1;
        set({ attemptCount: newAttemptCount });

        if (newAttemptCount >= 3) {
          return { success: false, message: "Maximum verification attempts reached. Please request a new OTP." };
        }

        return { 
          success: false, 
          message: `Invalid OTP. ${3 - newAttemptCount} attempt(s) remaining.` 
        };
      },

      logout: () => {
        set({
          customer: null,
          isLoggedIn: false,
          pendingPhone: null,
          pendingOtp: null,
          attemptCount: 0,
        });
      },

      setPendingPhone: (phone) => set({ pendingPhone: phone }),
    }),
    {
      name: "kutty:customer_session",
      partialize: (state) => ({
        customer: state.customer,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);
