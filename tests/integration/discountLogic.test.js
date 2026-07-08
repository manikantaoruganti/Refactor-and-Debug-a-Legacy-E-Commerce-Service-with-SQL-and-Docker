const { calculateFinalAmount } = require('../../src/utils/discountCalculator');

describe('Discount Logic - calculateFinalAmount', () => {
  // Test cases for various discount scenarios
  const testCases = [
    { total: 100, discount: 0, expectedFinal: 100, expectedDiscount: 0, description: '0% discount' },
    { total: 100, discount: 10, expectedFinal: 90, expectedDiscount: 10, description: '10% discount' },
    { total: 100, discount: 50, expectedFinal: 50, expectedDiscount: 50, description: '50% discount' },
    { total: 100, discount: 100, expectedFinal: 0, expectedDiscount: 100, description: '100% discount' },
    { total: 50.50, discount: 20, expectedFinal: 40.40, expectedDiscount: 10.10, description: 'Decimal total, 20% discount' },
    { total: 0, discount: 10, expectedFinal: 0, expectedDiscount: 0, description: 'Zero total amount' },
    { total: 100, discount: -10, expectedFinal: 90, expectedDiscount: 10, description: 'Negative discount (should be treated as 0)' },
    { total: 100, discount: 150, expectedFinal: 0, expectedDiscount: 100, description: 'Discount > 100% (should be capped at 100%)' },
    { total: 123.45, discount: 15, expectedFinal: 104.93, expectedDiscount: 18.52, description: 'Complex decimal calculation' },
    { total: 10, discount: 0.5, expectedFinal: 9.95, expectedDiscount: 0.05, description: 'Small decimal discount' },
    { total: 10, discount: 99.99, expectedFinal: 0.00, expectedDiscount: 9.99, description: 'Near 100% discount' },
    { total: 10, discount: 'invalid', expectedFinal: 10, expectedDiscount: 0, description: 'Invalid discount type (should default to 0)' },
    { total: 10, discount: null, expectedFinal: 10, expectedDiscount: 0, description: 'Null discount (should default to 0)' },
  ];

  testCases.forEach(({ total, discount, expectedFinal, expectedDiscount, description }) => {
    it(`should correctly calculate for ${description} (Total: ${total}, Discount: ${discount})`, () => {
      const { finalAmount, discountApplied } = calculateFinalAmount(total, discount);
      expect(finalAmount).toBeCloseTo(expectedFinal, 2);
      expect(discountApplied).toBeCloseTo(expectedDiscount, 2);
    });
  });

  it('should throw an error for negative total amount', () => {
    expect(() => calculateFinalAmount(-100, 10)).toThrow('Invalid totalAmount: Must be a non-negative number.');
  });

  it('should throw an error for non-numeric total amount', () => {
    expect(() => calculateFinalAmount('abc', 10)).toThrow('Invalid totalAmount: Must be a non-negative number.');
    expect(() => calculateFinalAmount(null, 10)).toThrow('Invalid totalAmount: Must be a non-negative number.');
    expect(() => calculateFinalAmount(undefined, 10)).toThrow('Invalid totalAmount: Must be a non-negative number.');
  });
});
