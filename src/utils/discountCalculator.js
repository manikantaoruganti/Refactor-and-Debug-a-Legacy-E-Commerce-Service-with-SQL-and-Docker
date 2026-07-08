/**
 * Calculates the final amount after applying a discount.
 * @param {number} totalAmount - The initial total amount before discount.
 * @param {number} discountPercentage - The discount percentage (e.g., 10 for 10%). Can be 0 to 100.
 * @returns {{finalAmount: number, discountApplied: number}} - The final amount and the amount of discount applied.
 */
function calculateFinalAmount(totalAmount, discountPercentage) {
  // Ensure totalAmount is a non-negative number
  if (typeof totalAmount !== 'number' || isNaN(totalAmount) || totalAmount < 0) {
    throw new Error('Invalid totalAmount: Must be a non-negative number.');
  }

  // Ensure discountPercentage is a number between 0 and 100
  if (typeof discountPercentage !== 'number' || isNaN(discountPercentage)) {
    discountPercentage = 0; // Default to no discount if invalid
  }
  discountPercentage = Math.max(0, Math.min(100, discountPercentage)); // Clamp between 0 and 100

  const discountFactor = discountPercentage / 100;
  const discountAmount = totalAmount * discountFactor;
  let finalAmount = totalAmount - discountAmount;

  // Ensure final amount is not negative
  finalAmount = Math.max(0, finalAmount);

  return {
    finalAmount: parseFloat(finalAmount.toFixed(2)), // Round to 2 decimal places
    discountApplied: parseFloat(discountAmount.toFixed(2)), // Round to 2 decimal places
  };
}

module.exports = {
  calculateFinalAmount,
};
