export type Suit = 'm' | 'p' | 's' | 'z';
export type TileRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Tile {
    suit: Suit;
    rank: TileRank;
}

export type Hand = Tile[];

export interface AnalysisResult {
    shanten: number;
    type: 'waiting' | 'discard';
    bestDiscards?: {
        tile: Tile;
        effectiveTiles: number;
        waitingFor: Tile[];
    }[];
    waitingTiles?: {
        tile: Tile;
        remaining: number;
    }[];
}

export const TILE_LIST: Tile[] = [
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as TileRank[]).map(r => ({ suit: 'm' as Suit, rank: r })),
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as TileRank[]).map(r => ({ suit: 'p' as Suit, rank: r })),
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as TileRank[]).map(r => ({ suit: 's' as Suit, rank: r })),
    ...([1, 2, 3, 4, 5, 6, 7] as TileRank[]).map(r => ({ suit: 'z' as Suit, rank: r })),
];

export const tileToKey = (tile: Tile): string => `${tile.suit}${tile.rank}`;

export const sortHand = (hand: Hand): Hand => {
    const suitOrder: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };
    return [...hand].sort((a, b) => {
        if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
        return a.rank - b.rank;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Tile index: m1-m9=0-8, p1-p9=9-17, s1-s9=18-26, z1-z7=27-33
// ─────────────────────────────────────────────────────────────────────────────

const TILE_COUNT = 34;
type Counts = number[];

function tileToIdx(tile: Tile): number {
    const base: Record<Suit, number> = { m: 0, p: 9, s: 18, z: 27 };
    return base[tile.suit] + tile.rank - 1;
}

function idxToTile(idx: number): Tile {
    if (idx < 9) return { suit: 'm', rank: (idx + 1) as TileRank };
    if (idx < 18) return { suit: 'p', rank: (idx - 9 + 1) as TileRank };
    if (idx < 27) return { suit: 's', rank: (idx - 18 + 1) as TileRank };
    return { suit: 'z', rank: (idx - 27 + 1) as TileRank };
}

function handToCounts(hand: Hand): Counts {
    const c = new Array(TILE_COUNT).fill(0);
    hand.forEach(t => c[tileToIdx(t)]++);
    return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-suit decomposition
// Tries ALL combinations: Kotsu, Shuntsu, Toitsu, Ryanmen, Kanchan, Skip.
// ─────────────────────────────────────────────────────────────────────────────

function suitDecompose(
    c: number[],
    pos: number,
    mentsu: number,
    taatsu: number,
    best: { mentsu: number; taatsu: number }
): void {
    if (pos === 9) {
        if (mentsu > best.mentsu || (mentsu === best.mentsu && taatsu > best.taatsu)) {
            best.mentsu = mentsu;
            best.taatsu = taatsu;
        }
        return;
    }
    if (c[pos] === 0) {
        suitDecompose(c, pos + 1, mentsu, taatsu, best);
        return;
    }

    // Kotsu (triple)
    if (c[pos] >= 3) {
        c[pos] -= 3;
        suitDecompose(c, pos, mentsu + 1, taatsu, best);
        c[pos] += 3;
    }
    // Shuntsu (sequence)
    if (pos <= 6 && c[pos + 1] > 0 && c[pos + 2] > 0) {
        c[pos]--; c[pos + 1]--; c[pos + 2]--;
        suitDecompose(c, pos, mentsu + 1, taatsu, best);
        c[pos]++; c[pos + 1]++; c[pos + 2]++;
    }
    // Toitsu (pair as taatsu)
    if (c[pos] >= 2) {
        c[pos] -= 2;
        suitDecompose(c, pos, mentsu, taatsu + 1, best);
        c[pos] += 2;
    }
    // Ryanmen / Penchan
    if (pos <= 7 && c[pos + 1] > 0) {
        c[pos]--; c[pos + 1]--;
        suitDecompose(c, pos, mentsu, taatsu + 1, best);
        c[pos]++; c[pos + 1]++;
    }
    // Kanchan
    if (pos <= 6 && c[pos + 2] > 0) {
        c[pos]--; c[pos + 2]--;
        suitDecompose(c, pos, mentsu, taatsu + 1, best);
        c[pos]++; c[pos + 2]++;
    }
    // Skip
    {
        const saved = c[pos];
        c[pos] = 0;
        suitDecompose(c, pos + 1, mentsu, taatsu, best);
        c[pos] = saved;
    }
}

function honorDecompose(c: number[]): { mentsu: number; taatsu: number } {
    let mentsu = 0;
    let taatsu = 0;
    for (let i = 0; i < 7; i++) {
        if (c[i] >= 3) mentsu++;
        else if (c[i] >= 2) taatsu++;
    }
    return { mentsu, taatsu };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shanten Calculation
//
// Win condition: n mentsu + 1 jantou, where n = floor(handSize / 3)
// (n can be 0-5, depending on how many tiles are in hand)
//
// For a hand of `total` tiles:
//   targetMentsu = floor(total / 3)
//   remainder    = total % 3
//
// If remainder == 2 (discard state, e.g. 2, 5, 8, 11, 14, 17 tiles):
//   A complete hand at this size = targetMentsu mentsu + 1 jantou
//   shanten = -1 means already won
//   Formula: shanten = 2*targetMentsu - 2*mentsu - taatsu - jantou
//   (base = 2*targetMentsu, subtract 2 per mentsu, 1 per taatsu/jantou)
//   Cap: mentsu + taatsu <= targetMentsu - jantouBonus
//
// If remainder == 1 (waiting state, e.g. 1, 4, 7, 10, 13, 16 tiles):
//   A complete hand needs one more tile (draw to win)
//   shanten = 0 means tenpai
//   Formula: shanten = 2*targetMentsu - 2*mentsu - taatsu - jantou
//   (same formula, but base is 2*targetMentsu not 2*targetMentsu-1)
//   Actually same formula works — at tenpai, drawing 1 tile completes it.
//
// Unified formula (works for both states):
//   shanten = 2*targetMentsu - 2*mentsu - taatsu - jantou
//   with cap: mentsu + taatsu <= targetMentsu - jantouBonus
//   and without jantou: shanten >= 0
//
// Verification:
//   1m 1m (2 tiles, remainder=2, targetMentsu=0):
//     jantou=11, mentsu=0, taatsu=0: shanten = 0 - 0 - 0 - 1 = -1 ✓ (食糊)
//   1m 2m (2 tiles, remainder=2, targetMentsu=0):
//     no jantou: mentsu=0, taatsu=1, cap=0-0=0, cappedTaatsu=0: shanten=max(0,0)=0
//     try jantou: no pair → no jantou path
//     best = 0 ✓ (聽牌, 叫3m)
//   1m 2m 3m 4m (4 tiles, remainder=1, targetMentsu=1):
//     no jantou: 123+4 → mentsu=1, taatsu=0, cap=1, shanten=max(0,2-2-0-0)=0
//     try jantou=44: no pair (only one 4) → skip
//     try jantou=11: no pair → skip
//     best = 0 ✓ (聽牌, 叫1m or 4m)
//   1m 1m 1m 2m 3m (5 tiles, remainder=2, targetMentsu=1):
//     jantou=11, 剩 123 → mentsu=1, taatsu=0, cap=0, shanten=2-2-0-1=-1 ✓ (食糊)
// ─────────────────────────────────────────────────────────────────────────────

function calcShanten(counts: Counts): number {
    const total = counts.reduce((a, b) => a + b, 0);
    const targetMentsu = Math.floor(total / 3);

    const evaluate = (c: Counts, hasJantou: boolean): number => {
        const mBest = { mentsu: 0, taatsu: 0 };
        const pBest = { mentsu: 0, taatsu: 0 };
        const sBest = { mentsu: 0, taatsu: 0 };

        suitDecompose([...c.slice(0, 9)], 0, 0, 0, mBest);
        suitDecompose([...c.slice(9, 18)], 0, 0, 0, pBest);
        suitDecompose([...c.slice(18, 27)], 0, 0, 0, sBest);
        const zRes = honorDecompose([...c.slice(27, 34)]);

        const totalMentsu = mBest.mentsu + pBest.mentsu + sBest.mentsu + zRes.mentsu;
        const totalTaatsu = mBest.taatsu + pBest.taatsu + sBest.taatsu + zRes.taatsu;

        const jantouBonus = hasJantou ? 1 : 0;
        // Standard points: Mentsu=2, Taatsu=1, Jantou=1. 
        // Target points = 2 * targetMentsu + 1.
        // Shanten = TargetPoints - (2*m + t + j) - 1
        const cappedMentsu = Math.min(totalMentsu, targetMentsu);
        const cappedTaatsu = Math.min(totalTaatsu, targetMentsu - cappedMentsu);

        return 2 * targetMentsu - cappedMentsu * 2 - cappedTaatsu - jantouBonus;
    };

    let best = 2 * targetMentsu; // worst case

    // No jantou: minimum shanten is 0
    const s0 = Math.max(0, evaluate(counts, false));
    if (s0 < best) best = s0;

    // Try each tile as jantou
    for (let i = 0; i < TILE_COUNT; i++) {
        if (counts[i] >= 2) {
            counts[i] -= 2;
            const s = evaluate(counts, true);
            if (s < best) best = s;
            counts[i] += 2;
        }
    }

    return Math.max(best, -1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class MahjongAnalyzer {
    private counts: Counts;
    private isWaitingState: boolean;

    constructor(hand: Hand) {
        this.counts = handToCounts(hand);
        // 3n+1 tiles → waiting (draw to improve)
        // 3n+2 tiles → discard (throw to improve)
        this.isWaitingState = hand.length % 3 === 1;
    }

    public calculateShanten(): number {
        return calcShanten([...this.counts]);
    }

    public analyze(): AnalysisResult {
        const shanten = this.calculateShanten();

        if (shanten === -1) {
            return { shanten: -1, type: this.isWaitingState ? 'waiting' : 'discard' };
        }

        if (this.isWaitingState) {
            const waitingTiles: { tile: Tile; remaining: number }[] = [];
            for (let i = 0; i < TILE_COUNT; i++) {
                if (this.counts[i] >= 4) continue;
                const newCounts = [...this.counts];
                newCounts[i]++;
                if (calcShanten(newCounts) < shanten) {
                    const remaining = 4 - this.counts[i];
                    waitingTiles.push({ tile: idxToTile(i), remaining });
                }
            }
            return { shanten, type: 'waiting', waitingTiles };
        } else {
            const bestDiscards: {
                tile: Tile;
                effectiveTiles: number;
                waitingFor: Tile[];
                resultShanten: number;
            }[] = [];

            const seen = new Set<number>();
            for (let i = 0; i < TILE_COUNT; i++) {
                if (this.counts[i] === 0 || seen.has(i)) continue;
                seen.add(i);

                const afterDiscard = [...this.counts];
                afterDiscard[i]--;
                const afterShan = calcShanten(afterDiscard);

                let effectiveCount = 0;
                const waitingFor: Tile[] = [];

                for (let j = 0; j < TILE_COUNT; j++) {
                    if (afterDiscard[j] >= 4) continue;
                    const drawn = [...afterDiscard];
                    drawn[j]++;
                    if (calcShanten(drawn) < afterShan) {
                        effectiveCount += 4 - afterDiscard[j];
                        waitingFor.push(idxToTile(j));
                    }
                }

                if (effectiveCount > 0) {
                    bestDiscards.push({
                        tile: idxToTile(i),
                        effectiveTiles: effectiveCount,
                        waitingFor,
                        resultShanten: afterShan,
                    });
                }
            }

            bestDiscards.sort((a, b) => {
                if (a.resultShanten !== b.resultShanten) return a.resultShanten - b.resultShanten;
                return b.effectiveTiles - a.effectiveTiles;
            });

            const minShanten = bestDiscards.length > 0 ? bestDiscards[0].resultShanten : shanten;
            const filteredDiscards = bestDiscards.filter(d => d.resultShanten === minShanten);

            return { shanten: minShanten, type: 'discard', bestDiscards: filteredDiscards };
        }
    }
}
