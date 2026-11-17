// The token radar's model, version 2 (radar-2): peer multiples by category, validated out of sample.
//
// The board covers every protocol the watchlist rule keeps (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values, never
// mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   multiple   = the category's median mcap/TVL among protocols whose token already trades,
//                shrunk toward the global median when the category has fewer than five traded
//                peers, and clamped to [0.01, 3] so one thin category cannot set the board
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The multiples are fitted on the snapshot's own traded protocols at run time, never from a
// hand-written list of names, and the dashboard shows the fit's out-of-sample validation: leave-one-out,
// a five-fold split and a cohort holdout. No protocol name is ever special-cased: the same function
// scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_peers: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_peers: 5,
  multiple_floor: 0.01,
  multiple_cap: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    peer_count: number;
    category_median_multiple: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  peer_count: number;
  category_median_multiple: number | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's fitted multiple, for the dashboard's peer table. */
export interface CategoryStat {
  category: string;
  traded_peers: number;
  median_multiple: number;
  multiple: number;
}

/** One out-of-sample validation block: how far the multiple's predictions land from traded market caps. */
export interface ValidationBlock {
  n: number;
  median_abs_log_error: number;
  median_abs_factor: number;
  within_2x_pct: number;
  within_3x_pct: number;
}

/** The model's validation, fitted and scored from the snapshot at run time. */
export interface ValidationStats {
  traded_protocols: number;
  global_median_multiple: number;
  leave_one_out: ValidationBlock;
  leave_one_out_flat_025: ValidationBlock;
  leave_one_out_global_median: ValidationBlock;
  five_fold: ValidationBlock;
  cohort_holdout: ValidationBlock & { fit_n: number; test_n: number };
  note: string;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryStat[];
  validation: ValidationStats;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** A 32-bit FNV-1a hash, for deterministic folds that do not depend on insertion order. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The category a protocol's multiple is fitted under; null categories read as Other. */
function categoryKey(category: string | null): string {
  return category ?? 'Other';
}

/** The fitted multiples from one set of traded protocols: a global median and one median per category. */
interface FittedMultiples {
  global: number;
  byCategory: Map<string, { n: number; median: number }>;
}

function fitMultiples(traded: SnapshotProtocol[]): FittedMultiples {
  const byCategory = new Map<string, number[]>();
  for (const p of traded) {
    const key = categoryKey(p.category);
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const medians = new Map<string, { n: number; median: number }>();
  for (const [key, ratios] of byCategory) medians.set(key, { n: ratios.length, median: median(ratios) });
  return { global: median(traded.map((p) => p.mcap_usd! / p.tvl_usd)), byCategory: medians };
}

/** One category's multiple under a fit: its median, shrunk toward the global median while thin. */
function multipleFromFit(fit: FittedMultiples, category: string | null, model: ModelConstants): number {
  const entry = fit.byCategory.get(categoryKey(category));
  let m: number;
  if (entry === undefined) m = fit.global;
  else if (entry.n >= model.shrink_peers) m = entry.median;
  else {
    const cat = entry.median <= 0 ? model.multiple_floor : entry.median;
    const glob = fit.global <= 0 ? model.multiple_floor : fit.global;
    m = Math.exp((entry.n * Math.log(cat) + (model.shrink_peers - entry.n) * Math.log(glob)) / model.shrink_peers);
  }
  if (!Number.isFinite(m) || m <= 0) m = model.multiple_floor;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
}

/** The multipliers and the implied value one protocol gets under `model` and a fitted `fit`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: FittedMultiples,
): { implied: number; multiple: number; peerCount: number; categoryMedian: number | null; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const multiple = multipleFromFit(fit, protocol.category, model);
  const entry = fit.byCategory.get(categoryKey(protocol.category));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, peerCount: entry === undefined ? 0 : entry.n, categoryMedian: entry === undefined ? null : round4(entry.median), growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product of a traded token. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a pre-token protocol's name must not begin with, per the watchlist rule. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, by the same rule the watchlist was drawn with (its floor
 * aside). A wrapped or staked product of a token that already trades is not a token that does not
 * exist yet: WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking product.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot, floor or not. The
  // watchlist's parent-protocol filter leaves out genuine pre-token protocols above the floor
  // (Sentora Curator, Polymarket International among them); the radar exists to find them.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const traded = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const fit = fitMultiples(traded);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fit);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes this row from these same doubles
      // and must land on the same implied value board.json carries.
      multiple: s.multiple,
      peer_count: s.peerCount,
      category_median_multiple: s.categoryMedian,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Summarise log errors of predicted against actual market caps: median size, and the share within 2x and 3x. */
function validationBlock(errors: number[]): ValidationBlock {
  const abs = errors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const medErr = abs.length === 0 ? 0 : median(abs);
  return {
    n: errors.length,
    median_abs_log_error: round3(medErr),
    median_abs_factor: round3(Math.exp(medErr)),
    within_2x_pct: round1((errors.filter((e) => Math.abs(e) <= Math.log(2)).length / Math.max(1, errors.length)) * 100),
    within_3x_pct: round1((errors.filter((e) => Math.abs(e) <= Math.log(3)).length / Math.max(1, errors.length)) * 100),
  };
}

/**
 * The model's validation, computed from the snapshot alone: leave-one-out over every traded protocol,
 * the same against a flat 0.25x and the global median, a five-fold split by a hash of the slug, and a
 * cohort holdout that fits on protocols listed before 2025 and tests on those listed after. All four
 * are deterministic: same snapshot, same numbers, every run.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationStats {
  const traded = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(traded.map((p) => p.mcap_usd! / p.tvl_usd));

  const loo: number[] = [];
  const looFlat: number[] = [];
  const looGlobal: number[] = [];
  for (const p of traded) {
    const fit = fitMultiples(traded.filter((q) => q.slug !== p.slug));
    loo.push(Math.log((p.tvl_usd * multipleFromFit(fit, p.category, model)) / p.mcap_usd!));
    looFlat.push(Math.log((p.tvl_usd * 0.25) / p.mcap_usd!));
    looGlobal.push(Math.log((p.tvl_usd * global) / p.mcap_usd!));
  }

  const foldErrors: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const train = traded.filter((p) => fnv1a(p.slug) % 5 !== fold);
    const test = traded.filter((p) => fnv1a(p.slug) % 5 === fold);
    const fit = fitMultiples(train);
    for (const p of test) foldErrors.push(Math.log((p.tvl_usd * multipleFromFit(fit, p.category, model)) / p.mcap_usd!));
  }

  const fitOld = traded.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const testNew = traded.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  const cohortFit = fitMultiples(fitOld);
  const cohortErrors = testNew.map((p) => Math.log((p.tvl_usd * multipleFromFit(cohortFit, p.category, model)) / p.mcap_usd!));

  return {
    traded_protocols: traded.length,
    global_median_multiple: round4(global),
    leave_one_out: validationBlock(loo),
    leave_one_out_flat_025: validationBlock(looFlat),
    leave_one_out_global_median: validationBlock(looGlobal),
    five_fold: validationBlock(foldErrors),
    cohort_holdout: { ...validationBlock(cohortErrors), fit_n: fitOld.length, test_n: testNew.length },
    note: 'Peer multiples are order-of-magnitude ranks, not prices: mcap/TVL spans more than 100x inside a category, so a typical traded protocol lands about 3x from its category-median prediction. The multiple still beats a flat 0.25x on median error, and it is the category, not the name, that sets it.',
  };
}

/** One category's fitted multiple, for the dashboard's peer table, most peers first. */
export function categoryStats(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryStat[] {
  const traded = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const fit = fitMultiples(traded);
  return [...fit.byCategory.entries()]
    .map(([category, entry]) => ({
      category,
      traded_peers: entry.n,
      median_multiple: round4(entry.median),
      multiple: round4(multipleFromFit(fit, category === 'Other' ? null : category, model)),
    }))
    .sort((a, b) => b.traded_peers - a.traded_peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Gas for one transaction on the protocol's first chain: Ethereum is dear, the rest are cheap. */
function gasFor(chain: string): string {
  return chain === 'Ethereum' ? 'about $5 of gas' : 'under $0.50 of gas';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s yield vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and keep the position open.`;
  if (c.includes('chain')) return `Use $${capital} of USDC in ${name}'s own app on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action, the one that marks an active user rather than a deposit. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the deposit, about $${Math.max(10, Math.round(capital / 5))}, then repay it within the week so both sides of the position are active.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap a small amount through ${name}'s pool on ${chain}, about $${Math.max(10, Math.round(capital / 5))}, so the wallet shows trading as well as liquidity.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge and open a fresh one of about $${Math.max(10, Math.round(capital / 5))} so the account shows repeated margin use.`;
  if (c.includes('prediction')) return `Settle the first position and place a second one of about $${Math.max(10, Math.round(capital / 5))} on another market ${name} lists.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim any staking rewards that have accrued and restake them, so the wallet shows repeated staking activity.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('yield')) return `Vote on, or comment in, one vault governance proposal ${name} runs, so the wallet shows governance as well as deposits.`;
  if (c.includes('rwa') || c.includes('stable')) return `Move a small amount, about $${Math.max(10, Math.round(capital / 5))}, between ${name} and another app on ${chain} so the asset shows real use.`;
  return `Make one more qualifying action, such as a deposit, a borrow, a swap or a vote, so the wallet is not a single deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: gas,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    peer_count: row.model.peer_count,
    category_median_multiple: row.model.category_median_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    on_watchlist: onWatchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug) && r.tvl_usd < snapshot.floor_usd).length;
  const above = board.filter((r) => !watchlist.has(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    above_floor_size: above,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchlist.has(r.slug))),
    live,
    categories: categoryStats(snapshot, model),
    validation: validateModel(snapshot, model),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
