-- Add 'meter' type for ComputeMeterReceipt and EnergyMeterReceipt
BEGIN;

-- Drop and recreate the check constraint to include 'meter'
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_type_check;
ALTER TABLE receipts ADD CONSTRAINT receipts_type_check
    CHECK (type IN ('msr', 'ian', 'fc', 'mbs', 'dbp', 'amr', 'meter'));

COMMIT;
