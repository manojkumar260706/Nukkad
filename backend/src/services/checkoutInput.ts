import { z } from 'zod';

const checkoutInput = z.object({
  storeId: z.string().min(1).max(50),
  customerName: z.string().trim().min(1, 'Enter your name.').max(100, 'Enter a name of 100 characters or fewer.'),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ()-]{10,19}$/, 'Enter a valid phone number, such as 9876543210.').refine(phone => {
    const digits = phone.replace(/\D/g, '').length;
    return digits >= 10 && digits <= 15;
  }, 'Enter a phone number with 10 to 15 digits.'),
  deliveryType: z.enum(['delivery', 'pickup']),
  address: z.string().trim().min(8, 'Enter your full delivery address.').max(500, 'Enter a delivery address of 500 characters or fewer.').optional(),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid six-digit delivery PIN code.').optional(),
  items: z.array(z.object({
    productId: z.string().min(1).max(50), quantity: z.number().int().min(1).max(999)
  })).min(1).max(50)
});

export function parseCheckoutInput(body: unknown, customerId: string) {
  const input = checkoutInput.safeParse(body);
  if (!input.success) {
    const errors = input.error.flatten().fieldErrors;
    const error = errors.customerName?.[0] || errors.customerPhone?.[0] ||
      errors.address?.[0] || errors.postalCode?.[0] ||
      (errors.items ? 'Check the items and quantities in your cart.' : 'Refresh the page and select your store and order type again.');
    throw new Error(error);
  }
  const { address, postalCode, ...details } = input.data;
  if (details.deliveryType === 'delivery' && (!address || !postalCode)) {
    throw new Error('Enter the delivery address and PIN code.');
  }
  return {
    ...details, checkout: { customerId,
      address: details.deliveryType === 'delivery' ? `${address}, ${postalCode}` : undefined,
      postalCode }
  };
}
