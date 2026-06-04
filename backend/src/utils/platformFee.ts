/**
 * Platform fee charged to the customer for online payments.
 * The fee covers the Razorpay gateway cost and is non-refundable.
 *
 * Slab table:
 *  ₹1   – ₹99   → ₹5
 *  ₹100 – ₹299  → ₹10
 *  ₹300 – ₹499  → ₹15
 *  ₹500 +        → ₹20
 */
export const getPlatformFee = (baseAmount: number): number => {
  if (baseAmount < 100)  return 5;
  if (baseAmount < 300)  return 10;
  if (baseAmount < 500)  return 15;
  return 20;
};

/** Returns both the fee and the total (base + fee) to charge via Razorpay. */
export const withPlatformFee = (baseAmount: number): { fee: number; total: number } => {
  const fee = getPlatformFee(baseAmount);
  return { fee, total: parseFloat((baseAmount + fee).toFixed(2)) };
};
