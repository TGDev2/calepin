-- Add word count constraint (CAL-013).
ALTER TABLE "source_text_versions" ADD CONSTRAINT "source_text_versions_word_count_check" CHECK ("wordCount" <= 2000);