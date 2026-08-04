-- "Saved for later" shelf in the review console. Purely an admin bookmark: it
-- never changes `status`, so shelving a listing neither publishes nor unpublishes
-- it, and the seller is never told. NULL means not shelved.
ALTER TABLE "Listing" ADD COLUMN     "savedAt" TIMESTAMP(3);
