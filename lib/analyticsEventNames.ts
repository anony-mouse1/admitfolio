// Shared by client interactions and server-confirmed purchase events. Keeping
// names in one place prevents the Vercel dashboard from splitting one funnel
// across accidental spelling variants.
export const ANALYTICS_EVENTS = {
  browseOpened: 'Browse Opened',
  listingViewed: 'Listing Viewed',
  checkoutStarted: 'Checkout Started',
  purchaseCompleted: 'Purchase Completed',
  matchSearch: 'Match Search',
  sellerSignupStarted: 'Seller Signup Started',
  sellerEmailVerified: 'Seller Email Verified',
  sellerListingSubmitted: 'Seller Listing Submitted',
} as const;
