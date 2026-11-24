// Commercial model (spec §01). Validate before launch; values are configuration, not constants of nature.
export const BEAT_COMMISSION_BPS = 1200; // 12% of beat sales
export const BOOKING_COMMISSION_BPS = 700; // 7% of platform-originated bookings only (manual/walk-in: 0%)
export const PROVIDER_FEE_BPS = 195; // sandbox provider processing fee
export const CURRENCY = "GHS";

export const bps = (amount: number, b: number) => Math.round((amount * b) / 10_000);

export function formatMoney(minor: number, currency = CURRENCY) {
  const v = (minor / 100).toLocaleString("en-GH", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return `${currency} ${v}`;
}
