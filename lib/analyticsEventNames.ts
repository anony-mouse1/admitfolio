// Shared by client interactions and server-confirmed purchase events. Keeping
// names in one place prevents the Vercel dashboard from splitting one funnel
// across accidental spelling variants.
export const ANALYTICS_EVENTS = {
  browseOpened: 'Browse Opened',
  listingViewed: 'Listing Viewed',
  checkoutStarted: 'Checkout Started',
  // Fires when the field holds something that is not an address, so a buyer who
  // gives up on a typo can be told apart from one who gives up on the price.
  // Its two properties are the two Checkout Email Submitted carries, so both
  // stages slice the same way in the dashboard.
  checkoutEmailInvalid: 'Checkout Email Invalid',
  checkoutEmailSubmitted: 'Checkout Email Submitted',
  checkoutPaymentLoaded: 'Checkout Payment Loaded',
  purchaseCompleted: 'Purchase Completed',
  matchSearch: 'Match Search',
  sellerSignupStarted: 'Seller Signup Started',
  sellerEmailVerified: 'Seller Email Verified',
  sellerListingSubmitted: 'Seller Listing Submitted',
} as const;
