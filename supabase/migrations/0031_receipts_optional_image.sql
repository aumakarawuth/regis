-- 0031_receipts_optional_image.sql
-- send-receipt can now send a text-only notice with no receipt image.
alter table receipts alter column storage_path drop not null;
