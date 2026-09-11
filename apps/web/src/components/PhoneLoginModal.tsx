"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Phone,
  Sparkles,
  ArrowRight,
  Loader2,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  PencilLine,
} from "lucide-react";
import { useCustomerAuth, formatIndianPhone } from "@/lib/auth";

const MAX_ATTEMPTS = 3;

/** Valid Indian mobile: 10 digits starting with 6, 7, 8 or 9 */
function validateIndianPhone(raw: string): string | null {
  const clean = raw.replace(/\D/g, "");
  if (clean.length !== 10) return "Please enter a 10-digit mobile number.";
  if (!/^[6-9]/.test(clean)) return "Indian mobile numbers must start with 6, 7, 8 or 9.";
  return null; // valid
}

interface PhoneLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
}

export function PhoneLoginModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Unlock the Full Story Preview",
  subtitle = "Enter your mobile number to instantly read all 28 pages of your personalized storybook.",
}: PhoneLoginModalProps) {
  const { sendOtp, verifyOtp, attemptCount } = useCustomerAuth();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionOtp, setSessionOtp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [locked, setLocked] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);

  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setError(null);
      setPhoneError(null);
      setOtp(["", "", "", ""]);
      setSessionOtp(null);
      setLocked(false);
      setShowChangeWarning(false);
      setTimeout(() => phoneInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Sync lock state from store
  useEffect(() => {
    if (attemptCount >= MAX_ATTEMPTS) setLocked(true);
  }, [attemptCount]);

  if (!isOpen) return null;

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptCount);

  // ── Phone input live validation ─────────────────────────────
  function handlePhoneChange(val: string) {
    const clean = val.replace(/\D/g, "");
    setPhone(clean);
    if (phoneError) setPhoneError(validateIndianPhone(clean));
  }

  // ── Step 1: Send OTP ────────────────────────────────────────
  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    const validationError = validateIndianPhone(phone);
    if (validationError) {
      setPhoneError(validationError);
      phoneInputRef.current?.focus();
      return;
    }

    setPhoneError(null);
    setLoading(true);
    const res = await sendOtp(phone);
    setLoading(false);

    if (res.success) {
      setStep("otp");
      setCountdown(30);
      setOtp(["", "", "", ""]);
      setLocked(false);
      setSessionOtp(res.demoOtp || null);
      setError(null);
      setShowChangeWarning(false);
      setTimeout(() => otpInputs.current[0]?.focus(), 100);
    } else {
      setPhoneError(res.message || "Failed to send OTP. Please try again.");
    }
  }

  // ── Resend OTP ──────────────────────────────────────────────
  async function handleResendOtp() {
    const clean = phone.replace(/\D/g, "");
    setLoading(true);
    const res = await sendOtp(clean);
    setLoading(false);

    if (res.success) {
      setCountdown(30);
      setOtp(["", "", "", ""]);
      setLocked(false);
      setSessionOtp(res.demoOtp || null);
      setError(null);
      setTimeout(() => otpInputs.current[0]?.focus(), 80);
    }
  }

  // ── Go back to phone step (change number) ──────────────────
  function handleGoBackToPhone() {
    setShowChangeWarning(false);
    setStep("phone");
    setError(null);
    setOtp(["", "", "", ""]);
    setLocked(false);
    setTimeout(() => phoneInputRef.current?.focus(), 80);
  }

  // ── Step 2: Verify OTP ──────────────────────────────────────
  async function handleVerifyOtp(otpString?: string) {
    if (locked) return;
    const code = otpString || otp.join("");
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await verifyOtp(phone, code);
    setLoading(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setError(res.message || "Invalid OTP. Please try again.");
      setOtp(["", "", "", ""]);
      setTimeout(() => otpInputs.current[0]?.focus(), 80);
      if (attemptsLeft <= 1) setLocked(true);
    }
  }

  function handleOtpChange(index: number, val: string) {
    if (locked) return;
    const digit = val.replace(/\D/g, "").slice(-1);
    const nextOtp = [...otp];
    nextOtp[index] = digit;
    setOtp(nextOtp);

    if (digit && index < 3) {
      otpInputs.current[index + 1]?.focus();
    }

    if (nextOtp.every((d) => d.length === 1)) {
      handleVerifyOtp(nextOtp.join(""));
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-brand-borderAccent bg-white p-6 shadow-2xl md:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Top Header Badge */}
        <div className="text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            {step === "phone" ? (
              <Sparkles className="h-6 w-6" />
            ) : (
              <ShieldCheck className="h-6 w-6" />
            )}
          </span>
          <h2 className="text-2xl font-bold text-slate-deep">{title}</h2>
          <p className="mt-1.5 text-sm text-slate-mutedText">{subtitle}</p>
        </div>

        {/* ── Step 1: Phone Number Input ───────────────────────── */}
        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Mobile Number
              </label>
              <div
                className={`relative flex items-center rounded-2xl border-2 bg-slate-50/50 px-3.5 py-3 transition focus-within:bg-white ${
                  phoneError
                    ? "border-rose-400 focus-within:border-rose-400"
                    : "border-slate-200 focus-within:border-brand-primary"
                }`}
              >
                <span className="flex items-center gap-1.5 pr-2 font-bold text-slate-700">
                  <Phone className="h-4 w-4 text-brand-primary" />
                  +91
                </span>
                <span className="h-5 w-px bg-slate-300" />
                <input
                  ref={phoneInputRef}
                  type="tel"
                  maxLength={10}
                  placeholder="Enter 10-digit number"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full bg-transparent pl-3 font-semibold text-slate-800 placeholder-slate-400 outline-none"
                />
                {/* Live character count */}
                <span
                  className={`ml-1 shrink-0 text-xs font-bold tabular-nums ${
                    phone.length === 10 ? "text-emerald-500" : "text-slate-400"
                  }`}
                >
                  {phone.length}/10
                </span>
              </div>

              {/* Inline validation hint */}
              {phoneError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {phoneError}
                </p>
              ) : phone.length > 0 && phone.length < 10 ? (
                <p className="mt-1.5 text-xs text-slate-400">
                  {10 - phone.length} more digit{10 - phone.length !== 1 ? "s" : ""} needed
                </p>
              ) : phone.length === 10 ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Looks good!
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading || phone.length !== 10 || !!phoneError}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Continue with Phone <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-slate-400">
              🔒 We never share your number. Used solely for your storybook session.
            </p>
          </form>
        )}

        {/* ── Step 2: OTP Input ────────────────────────────────── */}
        {step === "otp" && (
          <div className="mt-6 space-y-4">

            {/* Phone confirmation + Change Number */}
            <div className="rounded-2xl border border-brand-borderAccent bg-brand-cream/80 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">OTP sent to</p>
                  <p className="font-bold text-slate-deep">{formatIndianPhone(phone)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangeWarning(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-brand-primary hover:text-brand-primary"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Wrong number?
                </button>
              </div>
            </div>

            {/* ⚠️ Change number warning */}
            {showChangeWarning && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">
                  Going back will cancel your current OTP.
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  A new code will be generated when you re-submit.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleGoBackToPhone}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Yes, change number
                  </button>
                  <button
                    onClick={() => setShowChangeWarning(false)}
                    className="flex-1 rounded-xl border border-amber-300 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
                  >
                    No, continue
                  </button>
                </div>
              </div>
            )}

            {/* OTP shown prominently in-app */}
            {sessionOtp && !showChangeWarning && (
              <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Your Verification Code
                </span>
                <span className="font-mono text-4xl font-extrabold tracking-[0.35em] text-amber-800">
                  {sessionOtp}
                </span>
                <span className="text-[10px] text-amber-600">
                  This code is unique to your session
                </span>
              </div>
            )}

            {/* OTP input boxes */}
            {!showChangeWarning && (
              <>
                <div>
                  <label className="mb-2 block text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                    Enter 4-Digit Verification Code
                  </label>
                  <div className="flex justify-center gap-2.5">
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => { otpInputs.current[idx] = el; }}
                        type="tel"
                        maxLength={1}
                        value={digit}
                        disabled={locked}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className={`h-14 w-12 rounded-2xl border-2 text-center font-kidsHeader text-2xl font-bold transition focus:outline-none ${
                          locked
                            ? "border-rose-200 bg-rose-50 text-rose-300"
                            : "border-slate-200 text-slate-deep focus:border-brand-primary focus:bg-brand-cream/40"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Attempt dots */}
                {!locked && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[11px] font-medium text-slate-400">Attempts:</span>
                    <div className="flex gap-1.5">
                      {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            i < attemptCount ? "bg-rose-400" : "bg-emerald-400"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">({attemptsLeft} left)</span>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold ${
                      locked ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Verify button */}
                {!locked && (
                  <button
                    onClick={() => handleVerifyOtp()}
                    disabled={loading || otp.some((d) => !d)}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Verify &amp; Unlock All Pages <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}

                {/* Resend */}
                <div className="text-center">
                  {countdown > 0 && !locked ? (
                    <span className="text-xs text-slate-400">Resend code in {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleResendOtp}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary/10 px-4 py-2 text-xs font-bold text-brand-primary transition hover:bg-brand-primary/20 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {locked ? "Get New OTP to Try Again" : "Resend OTP"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
