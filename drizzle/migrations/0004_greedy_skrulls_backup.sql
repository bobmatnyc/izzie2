-- Add updated_at column to verifications table
-- Fixes Drizzle ORM compatibility issue

-- Add updated_at column with default timestamp
ALTER TABLE "verifications" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

-- Create trigger for automatic updated_at updates
CREATE TRIGGER update_verifications_updated_at BEFORE UPDATE ON verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
