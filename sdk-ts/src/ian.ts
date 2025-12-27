/**
 * Inter-Agent Netting (IAN) v0.1
 * Re-export from netting.ts for backwards compatibility
 */

export {
  net_receipts,
  compute_netting_hash,
  make_ian,
  verify_ian,
  type IAN,
  type NetObligation,
  type NettingResult
} from './netting.js';
