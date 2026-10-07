-- JSON map of frame shape -> { light, dark } file names for the hero
-- animation, so gallery cards can show tall, square, or wide variants.
-- NULL on older jobs, which only offer hero_light / hero_dark (16:9).
ALTER TABLE jobs ADD COLUMN heroes TEXT;
