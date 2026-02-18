import React, { useState, useMemo, useEffect } from 'react';
import {
  MahjongAnalyzer,
  sortHand,
  tileToKey
} from './logic/mahjong';
import type {
  Suit,
  TileRank,
  Tile,
  Hand
} from './logic/mahjong';
import { ChevronRight, Scale, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SUIT_LABELS: Record<Suit, string> = { m: '萬子', p: '筒子', s: '索子', z: '字牌' };
const RANK_CHARS: Record<string, string> = {
  'm1': '一', 'm2': '二', 'm3': '三', 'm4': '四', 'm5': '五', 'm6': '六', 'm7': '七', 'm8': '八', 'm9': '九',
  'p1': '①', 'p2': '②', 'p3': '③', 'p4': '④', 'p5': '⑤', 'p6': '⑥', 'p7': '⑦', 'p8': '⑧', 'p9': '⑨',
  's1': '１', 's2': '２', 's3': '３', 's4': '４', 's5': '５', 's6': '６', 's7': '７', 's8': '８', 's9': '９',
  'z1': '東', 'z2': '南', 'z3': '西', 'z4': '北', 'z5': '中', 'z6': '發', 'z7': '白'
};

const getTileChar = (tile: Tile) => RANK_CHARS[tileToKey(tile)] || tile.rank.toString();

const getShantenText = (shanten: number, type: 'waiting' | 'discard') => {
  if (shanten === -1) return '已食糊！';
  if (type === 'discard') {
    // 3n+2 張牌時（如 11 張），shanten 0 代表「打一張就聽牌」，所以叫一向聽
    if (shanten === 0) return '一向聽';
    if (shanten === 1) return '兩向聽';
    return `${shanten + 1} 向聽`;
  } else {
    // 3n+1 張牌時（如 10 張），shanten 0 代表「已經聽牌」，叫聽牌中
    if (shanten === 0) return '聽牌中';
    if (shanten === 1) return '一向聽';
    if (shanten === 2) return '兩向聽';
    return `${shanten} 向聽`;
  }
};



const App: React.FC = () => {
  const [hand, setHand] = useState<Hand>([]);
  const [activeSuit, setActiveSuit] = useState<Suit>('m');
  const lastClickTime = React.useRef<number>(0);

  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', preventZoom, { passive: false });
    return () => {
      document.removeEventListener('touchstart', preventZoom);
    };
  }, []);



  const clearHand = () => {
    setHand([]);
    if (window.navigator.vibrate) window.navigator.vibrate(50);
  };

  const addTile = (tile: Tile, isKeyboard = false) => {
    // 防止手指誤觸（200ms 冷卻時間，鍵盤輸入除外）
    const now = Date.now();
    if (!isKeyboard && now - lastClickTime.current < 200) return;
    if (!isKeyboard) lastClickTime.current = now;

    setHand(prev => {
      // 檢查總張數是否超過 17 張
      if (prev.length >= 17) return prev;

      // 檢查同款牌是否已超過 4 張
      const existingCount = prev.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
      if (existingCount >= 4) return prev;

      return sortHand([...prev, tile]);
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免干擾瀏覽器快速鍵
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // 1-9 加牌
      if (/^[1-9]$/.test(key)) {
        const rank = parseInt(key) as TileRank;
        // 字牌只有 1-7
        if (activeSuit === 'z' && rank > 7) return;
        addTile({ suit: activeSuit, rank }, true);
      }

      // m, p, s, z 切換花色
      if (['m', 'p', 's', 'z'].includes(key)) {
        setActiveSuit(key as Suit);
      }

      // Backspace 刪除最後一張
      if (key === 'backspace') {
        setHand(prev => prev.slice(0, -1));
      }

      // Escape 清空
      if (key === 'escape') {
        setHand([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSuit]); // 只依賴 activeSuit，addTile 已經是穩定的（或使用 functional update）

  const removeTile = (index: number) => {
    setHand(prev => prev.filter((_, i) => i !== index));
  };

  const discardByTile = (tile: Tile) => {
    setHand(prev => {
      const idx = prev.findIndex(t => t.suit === tile.suit && t.rank === tile.rank);
      if (idx > -1) {
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      }
      return prev;
    });
  };

  const analysis = useMemo(() => {
    if (hand.length < 1) return null;
    const analyzer = new MahjongAnalyzer(hand);
    return analyzer.analyze();
  }, [hand]);

  return (
    <div className="app-container">
      <motion.div
        key="main"
        className="main-layout"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Skeuomorphic Header */}
        <header className="header">
          <div className="header-inner">
            <h1>雀王</h1>
          </div>
        </header>

        <main className="main-content fade-in-classic">
          {/* Section: Analysis */}
          <div className="classical-card">
            <div className="section-title">
              <Scale size={14} /> {analysis?.type === 'waiting' ? '聽牌及進張分析' : '打牌戰術建議'}
            </div>

            {!analysis ? (
              <div className="placeholder-text">輸入手牌後顯示詳細分析</div>
            ) : (
              <div>
                <div className="analysis-badge">
                  {getShantenText(analysis.shanten, analysis.type)}
                </div>

                {analysis.type === 'waiting' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                    {analysis.waitingTiles && analysis.waitingTiles.length > 0 ? (
                      <div className="waiting-tiles-grid">
                        {analysis.waitingTiles.map((w, i) => (
                          <div key={i} className="wait-tile-box">
                            <div className="mj-tile-3d waiting-tile-large">
                              <span className={`tile-inner suit-${w.tile.suit}`} data-char={getTileChar(w.tile)}>{getTileChar(w.tile)}</span>
                            </div>
                            <span className="remain-count">餘 {w.remaining} 張</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="placeholder-text">無效進張</div>
                    )}
                  </div>
                ) : (
                  <div>
                    {analysis.bestDiscards && analysis.bestDiscards.length > 0 ? (
                      analysis.bestDiscards.slice(0, 3).map((d, i) => (
                        <motion.div
                          key={i}
                          className="discard-item"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => discardByTile(d.tile)}
                        >
                          <div className="mj-tile-3d" style={{ transform: 'scale(0.7)', flexShrink: 0 }}>
                            <span className={`tile-inner suit-${d.tile.suit}`} data-char={getTileChar(d.tile)}>{getTileChar(d.tile)}</span>
                          </div>
                          <div className="discard-info" style={{ flexGrow: 1 }}>
                            <h4>建議打 {getTileChar(d.tile)}</h4>
                            <p>效率：{d.effectiveTiles} 張 (期待：{d.waitingFor.slice(0, 3).map(getTileChar).join(', ')})</p>
                          </div>
                          <ChevronRight size={16} />
                        </motion.div>
                      ))
                    ) : (
                      <div className="placeholder-text">
                        {analysis.shanten === -1 ? '🀄 恭喜食糊！已經不需要打牌了。' : '目前無需打牌。'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </main>

        {/* Fixed Bottom Area */}
        <footer className="footer-input-area">
          {/* Section: My Hand */}
          <div className="classical-card">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', userSelect: 'none' }}>
              <span
                onClick={clearHand}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', transition: 'opacity 0.2s' }}
                className="reset-trigger"
              >
                我的手牌 ({hand.length}/17)
              </span>
            </div>
            <div className="hand-container">
              <AnimatePresence mode="popLayout">
                {hand.map((tile, index) => (
                  <motion.div
                    key={`${tileToKey(tile)}-${index}`}
                    layout="position"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    whileTap={{ y: 2, scale: 0.78 }}
                    transition={{
                      layout: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.15 },
                      scale: { duration: 0.1 }
                    }}
                    className="mj-tile-3d"
                    style={{ scale: 0.8 }}
                    onClick={() => removeTile(index)}
                  >
                    <span className={`tile-inner suit-${tile.suit}`} data-char={getTileChar(tile)}>{getTileChar(tile)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {hand.length === 0 && (
                <div className="placeholder-text">
                  牌桌是空的，請下方選取手牌
                </div>
              )}
            </div>
          </div>

          {/* Section: Tile Input */}
          <div className="classical-card">
            <div className="section-title">
              <Info size={14} /> 點選牌組加入手牌
            </div>

            <div className="tile-input-body">
              <div className="suit-navigation">
                {(['m', 'p', 's', 'z'] as Suit[]).map(s => (
                  <button
                    key={s}
                    className={`suit-nav-item ${activeSuit === s ? 'active' : ''}`}
                    onClick={() => setActiveSuit(s)}
                  >
                    {SUIT_LABELS[s]}
                  </button>
                ))}
              </div>

              <div className={`input-grid ${activeSuit === 'z' ? 'honor-grid' : ''}`}>
                {(activeSuit === 'z' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).map(rank => {
                  const tile: Tile = { suit: activeSuit, rank: rank as TileRank };
                  const count = hand.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
                  const isMaxed = count >= 4;

                  return (
                    <motion.div
                      key={tileToKey(tile)}
                      className={`mj-tile-3d ${isMaxed ? 'maxed' : ''}`}
                      layout
                      whileTap={{ y: 2, scale: 0.96 }}
                      onClick={() => addTile(tile)}
                      style={{ opacity: isMaxed ? 0.4 : 1, transition: 'opacity 0.2s' }}
                    >
                      <span className={`tile-inner suit-${activeSuit}`} data-char={getTileChar(tile)}>{getTileChar(tile)}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </footer>
      </motion.div>
    </div>
  );
};

export default App;
