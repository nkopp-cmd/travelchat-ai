-- Candidate-only payout approval decisions. Keep imported source earnings immutable.
CREATE TABLE IF NOT EXISTS preview_earning_approvals (
  batchId TEXT NOT NULL,
  earningId TEXT NOT NULL,
  approvedAt TEXT NOT NULL,
  approvedBy TEXT NOT NULL,
  PRIMARY KEY (batchId, earningId),
  FOREIGN KEY (batchId, earningId) REFERENCES legacy_guide_earnings(batchId, id)
);
CREATE INDEX IF NOT EXISTS preview_earning_approvals_batch_idx
  ON preview_earning_approvals(batchId);
