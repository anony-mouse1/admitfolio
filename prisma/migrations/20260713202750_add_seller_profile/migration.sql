-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "backgroundTags" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "photoPath" TEXT;
