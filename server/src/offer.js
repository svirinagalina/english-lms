// The trial offer's plans as the server knows them (prices in roubles) and
// the discount window — must match client/src/offer.js.
export const OFFER_PLANS = [
  // lessons: added to the package on payment; Solo is the platform alone for a month.
  { id: 'solo', name: 'Соло', price: 5980, discounted: 5681, lessons: 0, practiceDays: 31 },
  { id: 'mentor', name: 'Ментор', price: 18990, discounted: 18041, lessons: 9 }
]
export const DISCOUNT_DAYS = 3
export const discountActive = (publishedAt) => new Date(publishedAt).getTime() + DISCOUNT_DAYS * 24 * 60 * 60 * 1000 > Date.now()
