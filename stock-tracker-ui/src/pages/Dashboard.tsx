import React, { useEffect, useState, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import api from '../api';
import { useAuth } from '../AuthContext';

interface Stock {
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
}

interface WatchlistItem {
  id: string;
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
}

interface Alert {
  id: string;
  symbol: string;
  targetPrice: number;
  type: number;
  isTriggered: boolean;
}

interface AlertTriggeredPayload {
  symbol: string;
  targetPrice: number;
  message: string;
}

interface AlertForm {
  symbol: string;
  targetPrice: string;
  type: string;
}

interface RealQuote {
  symbol: string;
  companyName: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  peRatio: number;
  marketCap: number;
  volume: number;
  currency: string;
  market: string;
  lastUpdated: string;
}

const POPULAR_SYMBOLS = [
  // 🇮🇳 India — IT
  'INFY.NS', 'TCS.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS',
  // 🇮🇳 India — Banking & Finance
  'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS', 'BAJFINANCE.NS',
  // 🇮🇳 India — Oil & Energy
  'RELIANCE.NS', 'ONGC.NS', 'BPCL.NS', 'NTPC.NS', 'POWERGRID.NS',
  // 🇮🇳 India — Defense & Auto & Pharma
  'HAL.NS', 'BEL.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'DRREDDY.NS',
  // 🇮🇳 India — Other
  'TATASTEEL.NS', 'COALINDIA.NS', 'IRCTC.NS', 'INDIGO.NS', 'ADANIPORTS.NS',
  // 🇺🇸 US — Tech
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'NFLX',
  // 🇺🇸 US — Oil & Defense
  'XOM', 'CVX', 'LMT', 'RTX', 'NOC',
  // 🇺🇸 US — Banking & Finance
  'JPM', 'BAC', 'GS', 'V', 'MA',
  // 🇺🇸 US — Aviation
  'DAL', 'UAL', 'AAL'
];

interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  topic: string;
}

interface AffectedStock {
  ticker: string;
  signal: string;
  reason: string;
  historicalContext: string;
}

interface NewsAnalysis {
  explanation: string;
  sentiment: string;
  confidence: number;
  prediction: string;
  decisionSignal: string;  // ACCUMULATE | HOLD | AVOID | WATCH
  decisionReason: string;
  affectedStocks: AffectedStock[];
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function sentimentColor(s: string) {
  if (s === 'BULLISH') return '#22c55e';
  if (s === 'BEARISH') return '#ef4444';
  return '#94a3b8';
}

function signalColor(s: string) {
  if (s === 'BUY') return '#22c55e';
  if (s === 'SELL') return '#ef4444';
  return '#f59e0b';
}

function currencySymbol(currency: string) {
  if (currency === 'INR') return '₹';
  if (currency === 'GBP') return '£';
  return '$';
}

function decisionColor(signal: string) {
  if (signal === 'ACCUMULATE') return '#22c55e';
  if (signal === 'AVOID') return '#ef4444';
  if (signal === 'WATCH') return '#6366f1';
  return '#f59e0b'; // HOLD
}

function formatMktCap(cap: number, currency: string): string {
  if (!cap || cap === 0) return '—';
  const sym = currencySymbol(currency);
  if (currency === 'INR') {
    if (cap >= 1e11) return `${sym}${(cap / 1e11).toFixed(1)}L Cr`;
    if (cap >= 1e7)  return `${sym}${(cap / 1e7).toFixed(0)} Cr`;
    return `${sym}${cap}`;
  }
  if (cap >= 1e12) return `${sym}${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9)  return `${sym}${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6)  return `${sym}${(cap / 1e6).toFixed(0)}M`;
  return `${sym}${cap}`;
}

function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const W = 300, H = 56;
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const rng = mx - mn || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - mn) / rng) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#22c55e' : '#ef4444';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 56, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const LOADING_STEPS = [
  '📰 Reading article...',
  '🧠 Analyzing market context...',
  '📊 Identifying affected stocks...',
  '🔍 Researching historical patterns...',
  '✍️ Generating insights...'
];

function StockGroup({ stocks, flag, label }: { stocks: AffectedStock[]; flag: string; label: string }) {
  if (stocks.length === 0) return null;
  return (
    <>
      <div className="analysis-market-label">{flag} {label}</div>
      <div className="analysis-stocks">
        {stocks.map((s, i) => (
          <div key={i} className="affected-stock">
            <div className="affected-stock-header">
              <span className="affected-ticker">{s.ticker}</span>
              <span className="affected-signal" style={{ color: signalColor(s.signal), borderColor: signalColor(s.signal) }}>{s.signal}</span>
            </div>
            <p className="affected-reason">{s.reason}</p>
            {s.historicalContext && <p className="affected-history">🕐 {s.historicalContext}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const [analysis, setAnalysis] = React.useState<NewsAnalysis | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [stepIdx, setStepIdx] = React.useState(0);

  React.useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx(i => (i + 1) % LOADING_STEPS.length), 6000);
    return () => clearInterval(t);
  }, [loading]);

  const explain = async () => {
    if (analysis) { setOpen(o => !o); return; }
    setLoading(true);
    setOpen(true);
    try {
      const res = await api.post('/news/analyze', { title: article.title, summary: article.summary });
      setAnalysis(res.data);
    } catch {
      setAnalysis({ explanation: 'Could not load analysis. Please try again.', sentiment: 'NEUTRAL', confidence: 0, prediction: '', decisionSignal: '', decisionReason: '', affectedStocks: [] });
    } finally {
      setLoading(false);
    }
  };

  const indianStocks = analysis?.affectedStocks.filter(s => s.ticker.endsWith('.NS') || s.ticker.endsWith('.BO')) ?? [];
  const usStocks = analysis?.affectedStocks.filter(s => !s.ticker.endsWith('.NS') && !s.ticker.endsWith('.BO')) ?? [];

  return (
    <div className="news-card">
      <div className="news-meta">
        <span className="news-source">{article.source}</span>
        <span className="news-time">{timeAgo(article.publishedAt)}</span>
        {article.topic && <span className="news-topic">{article.topic}</span>}
      </div>
      <a className="news-title" href={article.url} target="_blank" rel="noreferrer">
        {article.title}
      </a>
      {article.summary && article.summary !== article.title && (
        <p className="news-summary">{article.summary}</p>
      )}
      <button className="btn-explain" onClick={explain} disabled={loading}>
        {loading ? LOADING_STEPS[stepIdx] : open ? '▲ Hide Analysis' : '💡 Explain'}
      </button>
      {open && loading && (
        <div className="news-analysis">
          <div className="analysis-generating">
            <span className="gen-dot" /><span className="gen-dot" /><span className="gen-dot" />
            <span>{LOADING_STEPS[stepIdx]}</span>
          </div>
        </div>
      )}
      {open && analysis && (
        <div className="news-analysis">
          <div className="analysis-header">
            <span className="analysis-sentiment" style={{ color: sentimentColor(analysis.sentiment) }}>
              {analysis.sentiment}
            </span>
            <span className="analysis-confidence">{analysis.confidence}% confidence</span>
          </div>

          {analysis.decisionSignal && (
            <div className="decision-signal-row">
              <span className="decision-badge" style={{ background: decisionColor(analysis.decisionSignal) + '22', color: decisionColor(analysis.decisionSignal), borderColor: decisionColor(analysis.decisionSignal) }}>
                {analysis.decisionSignal === 'ACCUMULATE' ? '✅' : analysis.decisionSignal === 'AVOID' ? '🚫' : analysis.decisionSignal === 'WATCH' ? '👀' : '⏸️'} {analysis.decisionSignal}
              </span>
              {analysis.decisionReason && <span className="decision-reason">{analysis.decisionReason}</span>}
            </div>
          )}

          <div className="analysis-section-label">📋 What Happened</div>
          <p className="analysis-explanation">{analysis.explanation}</p>

          {analysis.prediction && (
            <>
              <div className="analysis-section-label">🔮 Prediction</div>
              <p className="analysis-prediction">{analysis.prediction}</p>
            </>
          )}

          {(indianStocks.length > 0 || usStocks.length > 0) && (
            <div className="analysis-section-label">📈 Impacted Stocks</div>
          )}
          <StockGroup stocks={indianStocks} flag="🇮🇳" label="Indian Markets (NSE)" />
          <StockGroup stocks={usStocks} flag="🇺🇸" label="US Markets" />
        </div>
      )}
    </div>
  );
}

function rangeLabel(pos: number): { text: string; color: string } {
  if (pos <= 20) return { text: '📍 Near 1-year low', color: '#ef4444' };
  if (pos <= 40) return { text: '📉 Below mid-range', color: '#f97316' };
  if (pos <= 60) return { text: '⚖️ Mid range', color: '#94a3b8' };
  if (pos <= 80) return { text: '📈 Above mid-range', color: '#22d3ee' };
  return { text: '🔝 Near 1-year high', color: '#22c55e' };
}

function peLabel(pe: number): { text: string; color: string } {
  if (pe <= 0)  return { text: '', color: '' };
  if (pe < 15)  return { text: 'Cheap', color: '#22c55e' };
  if (pe < 25)  return { text: 'Fair value', color: '#94a3b8' };
  if (pe < 35)  return { text: 'Moderately valued', color: '#f59e0b' };
  return { text: 'Expensive', color: '#ef4444' };
}

function cardInsight(rangePos: number, pe: number, isUp: boolean, has52w: boolean): { text: string; color: string } | null {
  const low  = has52w && rangePos <= 25;
  const high = has52w && rangePos >= 75;
  const mid  = has52w && rangePos > 25 && rangePos < 75;
  const cheap     = pe > 0 && pe < 15;
  const fair      = pe >= 15 && pe < 25;
  const expensive = pe >= 25;
  const hasPE = pe > 0;

  if (low && cheap)     return { text: '🟢 Near its yearly low and trading cheap — could be a good entry point. Worth researching.', color: '#22c55e' };
  if (low && fair)      return { text: '🟡 Near its yearly low and fairly priced — possible recovery opportunity. Check the news first.', color: '#f59e0b' };
  if (low && expensive) return { text: '🔴 Near its yearly low but still expensive — price could fall further. Be cautious.', color: '#ef4444' };
  if (low && !hasPE)    return { text: '🟡 Near its lowest price in a year — might be a dip worth watching closely.', color: '#f59e0b' };

  if (high && cheap)    return { text: '🟢 Near its yearly high and still affordable — strong momentum with room to grow.', color: '#22c55e' };
  if (high && fair)     return { text: '🟡 Near its yearly high at fair value — performing well but may be slowing down.', color: '#f59e0b' };
  if (high && expensive)return { text: '🔴 Near its yearly high and expensive — good time to take profits if you already hold this.', color: '#ef4444' };
  if (high && !hasPE)   return { text: '🟡 Near its highest price in a year — strong run, but be careful chasing it higher.', color: '#f59e0b' };

  if (mid && cheap && isUp)  return { text: '🟢 Rising today and trading cheap — healthy momentum at a good price.', color: '#22c55e' };
  if (mid && cheap && !isUp) return { text: '🟢 Small dip today but still trading cheap — could be a minor correction, not a red flag.', color: '#22c55e' };
  if (mid && fair && isUp)   return { text: '🟡 Moving up steadily at a fair price — no strong signal, but looks stable.', color: '#94a3b8' };
  if (mid && fair && !isUp)  return { text: '🟡 Minor dip today in a fair price range — no strong signal either way.', color: '#94a3b8' };
  if (mid && expensive)      return { text: '🔴 In mid range but looking expensive — the price may already reflect all the good news.', color: '#ef4444' };

  if (isUp)  return { text: '🟡 Rising today — check the news tab to understand why before acting.', color: '#94a3b8' };
  return { text: '🟡 Dipping today — check the news tab to see if this is a concern or a buying dip.', color: '#94a3b8' };
}

interface Prediction { signal: string; emoji: string; color: string; headline: string; reasoning: string; }

function getNewsSentiment(articles: NewsArticle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (!articles.length) return 'NEUTRAL';
  const text = articles.map(a => (a.title + ' ' + (a.summary || '')).toLowerCase()).join(' ');
  const bullWords = ['surge', 'gain', 'beat', 'record', 'rise', 'growth', 'profit', 'strong', 'upgrade', 'outperform', 'rally', 'boost', 'expand', 'win', 'positive', 'bullish', 'buy', 'target raised', 'accumulate'];
  const bearWords = ['fall', 'drop', 'loss', 'miss', 'decline', 'cut', 'downgrade', 'sell', 'weak', 'bearish', 'crash', 'slump', 'lower', 'warning', 'risk', 'concern', 'negative', 'trouble', 'probe', 'penalty', 'fine'];
  const bull = bullWords.filter(w => text.includes(w)).length;
  const bear = bearWords.filter(w => text.includes(w)).length;
  if (bull > bear + 1) return 'BULLISH';
  if (bear > bull + 1) return 'BEARISH';
  return 'NEUTRAL';
}

interface CombinedVerdict { emoji: string; label: string; color: string; advice: string; }
function getCombinedVerdict(priceSignal: string, newsSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL', hasNews: boolean): CombinedVerdict {
  if (!hasNews) return { emoji: '📊', label: 'Price Signal Only', color: '#94a3b8', advice: 'No recent news found. Rely on the price-action signal below.' };
  const p = priceSignal.toUpperCase();
  const isBullPrice  = p.includes('BUY') || p.includes('ACCUMULATE') || p.includes('HOLD');
  const isBearPrice  = p.includes('SELL') || p.includes('AVOID') || p.includes('WAIT');
  const isWatchPrice = p.includes('WATCH');

  // BULLISH news
  if (newsSentiment === 'BULLISH') {
    if (isBullPrice)   return { emoji: '✅', label: 'Strong Buy Signal',            color: '#22c55e', advice: 'Both recent news and price trend are positive. Good conditions to consider entering or adding to your position.' };
    if (isBearPrice)   return { emoji: '⏳', label: 'Good Stock — Wait for Dip',   color: '#f59e0b', advice: 'Fundamentals look good based on news, but the price just moved a lot. Wait 2–3 days for it to settle before entering for a better price.' };
    if (isWatchPrice)  return { emoji: '📰', label: 'News-Driven Upside Possible', color: '#6366f1', advice: 'No strong price signal yet, but recent news is positive. This stock could move higher — worth keeping a close watch.' };
  }

  // BEARISH news
  if (newsSentiment === 'BEARISH') {
    if (isBullPrice)   return { emoji: '⚠️', label: 'Caution — Negative News',     color: '#f97316', advice: 'The price looks like a good entry technically, but recent news is negative. Hold off until the news sentiment improves before buying.' };
    if (isBearPrice)   return { emoji: '🔴', label: 'Avoid for Now',                color: '#ef4444', advice: 'Both news and price signal are negative. This is not a good time to buy — wait for conditions to improve.' };
    if (isWatchPrice)  return { emoji: '🚨', label: 'Watch Out — Bad News',         color: '#ef4444', advice: 'No strong price signal yet, but recent news is negative. The stock could fall from here — avoid entering until news improves.' };
  }

  // NEUTRAL news
  if (isBullPrice)   return { emoji: '📊', label: 'Price Looks Good',              color: '#22c55e', advice: 'Price trend is positive and news is neutral. Decent entry conditions — just make sure there are no red flags in the news.' };
  if (isBearPrice)   return { emoji: '🟡', label: 'Price Risk — Stay Cautious',    color: '#f59e0b', advice: 'Price signal suggests caution and news offers no positive catalyst. Better to wait for a clearer signal before entering.' };
  return               { emoji: '👀', label: 'No Clear Signal — Keep Watching',    color: '#94a3b8', advice: 'Neither news nor price is showing a strong signal right now. Add to your watchlist and revisit when something changes.' };
}

function generatePrediction(quote: RealQuote, rangePos: number, has52w: boolean): Prediction {
  const name = quote.companyName.split(' ').slice(0, 2).join(' ');
  const sym = currencySymbol(quote.currency);
  const isUp = quote.change >= 0;
  const absPctNum = Math.abs(quote.changePercent);
  const pe = quote.peRatio;
  const hasPE = pe > 0;

  const nearLow  = has52w && rangePos <= 35;
  const nearHigh = has52w && rangePos >= 68;
  const expensive = hasPE && pe >= 30;
  const bigDropToday = !isUp && absPctNum >= 4;
  const bigGainToday = isUp && absPctNum >= 4;

  // BIG CRASH TODAY — always wait first
  if (bigDropToday) {
    return {
      signal: 'WAIT — Do not panic sell or rush to buy', emoji: '⏸️', color: '#f59e0b',
      headline: `${name} just had a sharp single-day fall of ${absPctNum.toFixed(1)}%. The worst thing to do right now is act impulsively.`,
      reasoning: `A drop this large almost always has a specific news trigger. Read the News tab first to understand why it fell. If it is a temporary overreaction, this could be a buying opportunity. If it is a genuine problem (earnings miss, regulatory issue, sector crisis), the price may keep falling. Wait 2–3 days to see if the stock stabilises before making any decision.`,
    };
  }

  // BIG SURGE TODAY — do not chase
  if (bigGainToday) {
    return {
      signal: nearHigh ? 'CONSIDER SELLING — Near top after big gain' : 'WAIT — Do not chase the surge', emoji: '⚠️', color: '#f97316',
      headline: `${name} just surged ${absPctNum.toFixed(1)}% in a single day. Buying after a big jump is risky.`,
      reasoning: `Stocks often give back a portion of big single-day gains in the following days. If you already hold this stock, today's surge is a good opportunity to review if you want to take some profits. If you do not hold it yet, wait for the excitement to settle before entering — you will likely get a better price.`,
    };
  }

  // NEAR LOW + NOT EXPENSIVE → BUY
  if (nearLow && !expensive) {
    const peNote = hasPE
      ? (pe < 20 ? ` The valuation also looks cheap (PE ${pe.toFixed(1)}), which adds to the case.` : ` The valuation is reasonable (PE ${pe.toFixed(1)}), so you are not overpaying.`)
      : '';
    return {
      signal: 'BUY / ACCUMULATE — Based on price history', emoji: '🟢', color: '#22c55e',
      headline: `${name} is near its lowest price in a year — historically this is where patient investors tend to find value.`,
      reasoning: `The stock has fallen ${((quote.fiftyTwoWeekHigh - quote.price) / quote.fiftyTwoWeekHigh * 100).toFixed(0)}% from its peak of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}.${peNote} Based on the price alone, this looks like a better-than-average entry point. However, always check the News tab first — a low price can mean either "on sale" or "falling for a good reason". If the news is neutral or temporary, accumulating here can be a solid long-term move.`,
    };
  }

  // NEAR LOW + EXPENSIVE → WAIT
  if (nearLow && expensive) {
    return {
      signal: 'WAIT — Low price but still expensive', emoji: '🟡', color: '#f59e0b',
      headline: `${name} is near its yearly low in price, but the valuation (PE ${pe.toFixed(1)}) is still high.`,
      reasoning: `The stock has dropped significantly from its peak, but it is still priced as if the market expects strong future growth. If that growth does not come, the price could fall further even from here. Wait to see if the PE ratio comes down — either through a lower price or improving earnings — before entering.`,
    };
  }

  // NEAR HIGH + EXPENSIVE → SELL / TAKE PROFITS
  if (nearHigh && expensive) {
    return {
      signal: 'CONSIDER SELLING — Near top and expensive', emoji: '🔴', color: '#ef4444',
      headline: `${name} is near its 1-year high and looks overvalued. If you hold it, this may be a good time to lock in gains.`,
      reasoning: `The stock has climbed ${((quote.price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow * 100).toFixed(0)}% from its yearly low to ${sym}${quote.price.toLocaleString()}. At a PE of ${pe.toFixed(1)}, you are paying a high premium. Stocks at this combination — near the top of their range AND expensive — tend to correct more sharply when any bad news hits. For new buyers, the risk-reward is not favourable here. For existing holders, taking partial profits is a reasonable strategy.`,
    };
  }

  // NEAR HIGH + NOT EXPENSIVE → HOLD, CAUTIOUS FOR NEW BUYERS
  if (nearHigh) {
    return {
      signal: 'HOLD if you own it — Cautious for new buyers', emoji: '🟡', color: '#6366f1',
      headline: `${name} is near its 1-year high. Great if you already own it — but entering now carries more risk.`,
      reasoning: `The stock has had a strong run. If you hold it, there is no urgent reason to sell — let it continue if the fundamentals are solid. But for new buyers, entering near a 52-week high means you have less cushion if the stock pulls back. Consider waiting for a small dip of 5–10% to get a better entry price.`,
    };
  }

  // DEFAULT: MID RANGE → WATCH
  return {
    signal: 'WATCH — No strong signal yet', emoji: '👀', color: '#94a3b8',
    headline: `${name} is in the middle of its 1-year price range — no clear buy or sell trigger from the numbers alone.`,
    reasoning: `The price is not at an extreme high or low, and there is no obvious valuation edge right now. In this zone, the News tab matters more than the price chart. Check for any recent developments — a positive catalyst could push it higher, while bad news could send it lower. Keep it on your watchlist and revisit when a clearer signal emerges.`,
  };
}

interface StorySection { icon: string; label: string; text: string; color: string; }

function buildStockStory(quote: RealQuote, rangePos: number, has52w: boolean, sym: string): StorySection[] {
  const sections: StorySection[] = [];
  const name = quote.companyName.split(' ').slice(0, 2).join(' ');
  const isUp = quote.change >= 0;
  const absPct = Math.abs(quote.changePercent).toFixed(2);
  const absChange = Math.abs(quote.change).toFixed(2);
  const absPctNum = Math.abs(quote.changePercent);

  // ── Today ──────────────────────────────────────────────────
  let todayText = '';
  if (absPctNum < 0.5) {
    todayText = `${name} barely moved today — less than half a percent change. Quiet day, no signal either way.`;
  } else if (absPctNum < 1.5) {
    todayText = isUp
      ? `${name} edged up ${absPct}% (${sym}${absChange} per share). Small gain — nothing dramatic, just normal daily fluctuation.`
      : `${name} slipped ${absPct}% (${sym}${absChange} per share). A minor dip — the kind that happens on any ordinary market day.`;
  } else if (absPctNum < 3.5) {
    todayText = isUp
      ? `${name} gained ${absPct}% today, adding ${sym}${absChange} per share. That is a meaningful single-day rise — something likely drove this. Check the News tab to find out what.`
      : `${name} dropped ${absPct}% today, losing ${sym}${absChange} per share. That is a noticeable fall for one day — something likely triggered it. Check the News tab to understand why.`;
  } else if (absPctNum < 6) {
    todayText = isUp
      ? `${name} surged ${absPct}% in a single day — a very large move. Major positive news is almost certainly behind this. Do not chase it without reading the news first.`
      : `${name} fell ${absPct}% in a single day — a very large move. Something significant likely happened. Check the News tab immediately before making any decision.`;
  } else {
    todayText = isUp
      ? `${name} jumped over ${absPct}% today — an extraordinary single-day swing. This does not happen without major news. Read the news before acting.`
      : `${name} crashed ${absPct}% today — an extreme drop for a single session. Read the news immediately. This kind of move is almost never routine.`;
  }
  sections.push({
    icon: isUp ? '📈' : '📉',
    label: isUp ? `Up ${absPct}% today (+${sym}${absChange} per share)` : `Down ${absPct}% today (−${sym}${absChange} per share)`,
    text: todayText,
    color: isUp ? '#22c55e' : '#ef4444',
  });

  // ── vs Last Year ───────────────────────────────────────────
  if (has52w) {
    const dropPct = ((quote.fiftyTwoWeekHigh - quote.price) / quote.fiftyTwoWeekHigh * 100).toFixed(0);
    const risePct = ((quote.price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow * 100).toFixed(0);
    const rl = rangeLabel(rangePos);
    let rangeText = '';

    if (rangePos <= 15) {
      rangeText = isUp
        ? `${name} is showing a small bounce today, but it is still just ${risePct}% above its 1-year floor of ${sym}${quote.fiftyTwoWeekLow.toFixed(0)}. The stock has shed ${dropPct}% from its peak of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}. One day of green does not confirm a recovery — wait for consistent momentum before acting.`
        : `${name} is trading extremely close to its lowest price in a year (${sym}${quote.fiftyTwoWeekLow.toFixed(0)}), having fallen ${dropPct}% from its peak of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}. A continued fall to new lows would be a serious red flag. Check the news to understand what is driving this.`;
    } else if (rangePos <= 35) {
      rangeText = isUp
        ? `${name} has recovered slightly today, but it is still ${dropPct}% below its 1-year high of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}. The stock is in the lower part of its annual range — potentially interesting if the fundamentals are solid.`
        : `${name} has dropped ${dropPct}% from its yearly peak of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)} and is drifting lower. Continued selling in this zone could push it to new lows. Worth watching closely and checking the News tab.`;
    } else if (rangePos <= 65) {
      rangeText = isUp
        ? `${name} sits in the middle of its 1-year range (between ${sym}${quote.fiftyTwoWeekLow.toFixed(0)} and ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}), and is moving up today. No extreme reading either way — it is about ${dropPct}% below its peak.`
        : `${name} is in the middle of its 1-year range (between ${sym}${quote.fiftyTwoWeekLow.toFixed(0)} and ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}). Today's dip is not alarming on its own — it is still ${risePct}% above its yearly low.`;
    } else if (rangePos <= 85) {
      rangeText = isUp
        ? `${name} is climbing and is now ${risePct}% above its 1-year low of ${sym}${quote.fiftyTwoWeekLow.toFixed(0)}, approaching its peak of ${sym}${quote.fiftyTwoWeekHigh.toFixed(0)}. Strong momentum — but the higher it goes, the more careful you need to be about the entry price.`
        : `${name} is pulling back slightly from near the top of its 1-year range. It is still ${risePct}% above its low of ${sym}${quote.fiftyTwoWeekLow.toFixed(0)}. A small pullback from a high is normal — not a cause for panic.`;
    } else {
      rangeText = isUp
        ? `${name} is trading near its highest price in a year — up ${risePct}% from its low of ${sym}${quote.fiftyTwoWeekLow.toFixed(0)}. Impressive run. But buying at the top is risky. Make sure there is still a strong reason to expect further growth.`
        : `${name} is near its 1-year high but pulling back today. It has climbed ${risePct}% from its low of ${sym}${quote.fiftyTwoWeekLow.toFixed(0)} — some profit-taking at the top is normal. Not necessarily a warning sign.`;
    }
    sections.push({ icon: '📍', label: rl.text, text: rangeText, color: rl.color });
  }

  // ── Valuation ──────────────────────────────────────────────
  if (quote.peRatio > 0) {
    const pe = quote.peRatio.toFixed(1);
    let peColor = '#94a3b8', peLabel = '', peText = '';
    if (quote.peRatio < 15) {
      peColor = '#22c55e'; peLabel = `PE ${pe} — Looks Cheap`;
      peText = `For every ${sym}1 of annual profit ${name} earns, you are currently paying just ${sym}${pe} in the stock price. That is below average — making it look like a bargain. But a low PE can also mean the market doubts future growth. Pair this with the news before deciding.`;
    } else if (quote.peRatio < 25) {
      peColor = '#94a3b8'; peLabel = `PE ${pe} — Fairly Priced`;
      peText = `You are paying ${sym}${pe} for every ${sym}1 of profit ${name} makes — that is within the normal range. The stock is not a screaming bargain, but it is not overpriced either. Reasonable for long-term investors.`;
    } else if (quote.peRatio < 35) {
      peColor = '#f59e0b'; peLabel = `PE ${pe} — Moderately Expensive`;
      peText = `${name} is priced at ${sym}${pe} per ${sym}1 of profit — above average. The market is betting on strong future growth. If that growth disappoints, the price could fall significantly.`;
    } else {
      peColor = '#ef4444'; peLabel = `PE ${pe} — Expensive`;
      peText = `At ${sym}${pe} per ${sym}1 of earnings, ${name} carries a high valuation. Investors are paying a steep premium for expected future growth. High reward potential — but high risk if expectations are not met.`;
    }
    sections.push({ icon: '💰', label: peLabel, text: peText, color: peColor });
  }

  // ── Volume ─────────────────────────────────────────────────
  const volM = (quote.volume / 1_000_000).toFixed(1);
  let volColor = '#64748b', volLabel = '', volText = '';
  if (quote.volume > 50_000_000) {
    volColor = '#f97316'; volLabel = `${volM}M shares — Unusually High Activity`;
    volText = `${volM} million shares of ${name} changed hands today — far above what is typical. Volume this high usually means large institutions (mutual funds, FIIs, hedge funds) are making a significant move. Go to the News tab now — something important is happening.`;
  } else if (quote.volume > 10_000_000) {
    volColor = '#22d3ee'; volLabel = `${volM}M shares — Above Average Activity`;
    volText = `${volM} million shares traded today — more than a normal day for ${name}. Elevated volume alongside today's price move suggests real conviction behind the direction. Worth paying attention to.`;
  } else if (quote.volume > 1_000_000) {
    volColor = '#64748b'; volLabel = `${volM}M shares — Normal Activity`;
    volText = `${volM} million shares changed hands today — a routine day for ${name}. No unusual buying or selling pressure. The price move today happened on normal volume, so it may not sustain.`;
  } else {
    volColor = '#475569'; volLabel = `${volM}M shares — Light Activity`;
    volText = `Only ${volM} million shares traded today — lighter than usual for ${name}. Low volume means fewer participants are confident enough to buy or sell. The market may be in a wait-and-see mode.`;
  }
  sections.push({ icon: '📊', label: volLabel, text: volText, color: volColor });

  // ── Company Size ───────────────────────────────────────────
  if (quote.marketCap > 0) {
    const capStr = formatMktCap(quote.marketCap, quote.currency);
    const isInr = quote.currency === 'INR';

    const isLarge = (isInr && quote.marketCap > 2e11) || (!isInr && quote.marketCap > 1e10);
    const isMid   = (isInr && quote.marketCap > 5e10) || (!isInr && quote.marketCap > 2e9);
    let sizeLabel2 = '', sizeText = '';
    if (isLarge) {
      sizeLabel2 = `${capStr} — Large Company`;
      sizeText = `${name} is a large, well-established company. At this size, it is unlikely to suddenly collapse — but it also will not double in value overnight. Suitable for investors who prefer stability over rapid growth.`;
    } else if (isMid) {
      sizeLabel2 = `${capStr} — Mid-Sized Company`;
      sizeText = `${name} sits in the mid-size range — more growth potential than the big giants, but also more vulnerable to sector downturns or bad earnings. A balanced risk-reward option.`;
    } else {
      sizeLabel2 = `${capStr} — Smaller Company`;
      sizeText = `${name} is a relatively small company. Smaller companies can grow fast and multiply your investment — but they are also more exposed to negative news or market downturns. Do thorough research before investing.`;
    }
    sections.push({ icon: '🏢', label: sizeLabel2, text: sizeText, color: '#64748b' });
  }

  return sections;
}

interface HistoryPoint { close: number; date: string; }

function PriceChart({ data, currency }: { data: HistoryPoint[]; currency: string }) {
  if (data.length < 3) return null;
  const sym = currencySymbol(currency);
  const W = 500, H = 160;
  const PAD = { top: 12, right: 12, bottom: 34, left: 60 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const closes = data.map(d => d.close);
  const mn = Math.min(...closes), mx = Math.max(...closes);
  const rng = mx - mn || 1;
  const px = (i: number) => PAD.left + (i / (data.length - 1)) * cW;
  const py = (v: number) => PAD.top + cH - ((v - mn) / rng) * cH;
  const pts = data.map((d, i) => `${px(i).toFixed(1)},${py(d.close).toFixed(1)}`).join(' ');
  const first = `${px(0).toFixed(1)},${py(data[0].close).toFixed(1)}`;
  const last  = `${px(data.length - 1).toFixed(1)},${py(data[data.length - 1].close).toFixed(1)}`;
  const areaPath = `M${first} ` + data.map((d, i) => `L${px(i).toFixed(1)},${py(d.close).toFixed(1)}`).join(' ')
    + ` L${px(data.length - 1).toFixed(1)},${(PAD.top + cH).toFixed(1)} L${PAD.left},${(PAD.top + cH).toFixed(1)} Z`;
  const isUp = data[data.length - 1].close >= data[0].close;
  const color = isUp ? '#22c55e' : '#ef4444';
  const fillId = isUp ? 'chartFillUp' : 'chartFillDn';
  const fillColor0 = isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
  const yVals = [mn, mn + rng / 2, mx];
  const xIdx = [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtPrice = (v: number) => {
    if (v >= 1000) return `${sym}${(v / 1000).toFixed(1)}k`;
    return `${sym}${v.toFixed(0)}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor0} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      {yVals.map((v, i) => (
        <line key={i} x1={PAD.left} x2={W - PAD.right} y1={py(v).toFixed(1)} y2={py(v).toFixed(1)}
          stroke="#1e2235" strokeWidth="1" />
      ))}
      <path d={areaPath} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* end-dot */}
      <circle cx={last.split(',')[0]} cy={last.split(',')[1]} r="3" fill={color} />
      {yVals.map((v, i) => (
        <text key={i} x={PAD.left - 4} y={(py(v) + 4).toFixed(1)}
          textAnchor="end" fontSize="10" fill="#64748b">{fmtPrice(v)}</text>
      ))}
      {xIdx.map(idx => (
        <text key={idx} x={px(idx).toFixed(1)} y={H - 4}
          textAnchor="middle" fontSize="10" fill="#64748b">{fmtDate(data[idx].date)}</text>
      ))}
    </svg>
  );
}

function StockDetailModal({ quote, watchlist, onAddToWatchlist, onRemoveFromWatchlist, onGoToNews, onClose }: {
  quote: RealQuote;
  watchlist: WatchlistItem[];
  onAddToWatchlist: (q: RealQuote) => Promise<void>;
  onRemoveFromWatchlist: (id: string) => Promise<void>;
  onGoToNews: (query: string) => void;
  onClose: () => void;
}) {
  const sym = currencySymbol(quote.currency);
  const flag = quote.market === 'India' ? '🇮🇳' : '🇺🇸';
  const isUp = quote.change >= 0;
  const has52w = quote.fiftyTwoWeekHigh > 0 && quote.fiftyTwoWeekLow > 0;
  const rangePos = has52w
    ? Math.min(100, Math.max(0, ((quote.price - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100))
    : 50;
  const rl = rangeLabel(rangePos);
  const prediction = generatePrediction(quote, rangePos, has52w);
  const story = buildStockStory(quote, rangePos, has52w, sym);

  const [histData, setHistData] = useState<HistoryPoint[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [watchWorking, setWatchWorking] = useState(false);
  const [stockNews, setStockNews] = useState<NewsArticle[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const watchEntry = watchlist.find(w => w.symbol === quote.symbol);
  const isWatching = !!watchEntry;

  const newsSentiment = newsLoaded ? getNewsSentiment(stockNews) : 'NEUTRAL';
  const combinedVerdict = getCombinedVerdict(prediction.signal, newsSentiment, newsLoaded && stockNews.length > 0);

  useEffect(() => {
    const q = encodeURIComponent(quote.companyName.split(' ').slice(0, 3).join(' '));
    api.get(`/news/search?q=${q}&max=3`)
      .then(r => { setStockNews(r.data ?? []); setNewsLoaded(true); })
      .catch(() => { setStockNews([]); setNewsLoaded(true); });
  }, [quote.symbol]);

  const handleWatchToggle = async () => {
    setWatchWorking(true);
    try {
      if (isWatching) await onRemoveFromWatchlist(watchEntry!.id);
      else await onAddToWatchlist(quote);
    } finally {
      setWatchWorking(false);
    }
  };

  useEffect(() => {
    setHistLoading(true);
    api.get(`/marketdata/history/${quote.symbol}?range=3mo`)
      .then(r => {
        const pts: HistoryPoint[] = (r.data.history ?? []).map((h: { close: number; date: string }) => ({ close: h.close, date: h.date }));
        setHistData(pts);
      })
      .catch(() => setHistData([]))
      .finally(() => setHistLoading(false));
  }, [quote.symbol]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <strong className="modal-symbol">{quote.symbol}</strong>
            <span className="market-badge" style={{ marginLeft: '0.5rem' }}>{flag} {quote.market}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className={`btn-watch${isWatching ? ' watching' : ''}`}
              onClick={handleWatchToggle}
              disabled={watchWorking}
            >
              {isWatching ? '★ Watching' : '☆ Add to Watchlist'}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <span className="company modal-company">{quote.companyName}</span>

        <div className="modal-price-row">
          <span className="stock-price">{sym}{quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className={`card-change ${isUp ? 'up' : 'down'}`}>
            {isUp ? '▲' : '▼'} {sym}{Math.abs(quote.change).toFixed(2)} ({Math.abs(quote.changePercent).toFixed(2)}%) today
          </span>
        </div>

        {/* Price chart */}
        <div className="chart-wrap">
          {histLoading ? (
            <div className="chart-loading">Loading chart...</div>
          ) : histData.length > 2 ? (
            <PriceChart data={histData} currency={quote.currency} />
          ) : (
            <div className="chart-loading">Chart unavailable</div>
          )}
          <div className="chart-label">3-month price history</div>
        </div>

        {has52w && (
          <div className="week52-wrap">
            <div className="week52-track">
              <div className="week52-fill" style={{ width: `${rangePos}%` }} />
              <div className="week52-dot" style={{ left: `${rangePos}%` }} />
            </div>
            <div className="week52-labels">
              <span>{sym}{quote.fiftyTwoWeekLow.toFixed(0)}</span>
              <span className="week52-mid" style={{ color: rl.color }}>{rl.text}</span>
              <span>{sym}{quote.fiftyTwoWeekHigh.toFixed(0)}</span>
            </div>
          </div>
        )}

        <div className="combined-verdict" style={{ borderColor: combinedVerdict.color }}>
          <div className="combined-verdict-header" style={{ color: combinedVerdict.color }}>
            {combinedVerdict.emoji} {combinedVerdict.label}
          </div>
          <p className="combined-verdict-advice">{combinedVerdict.advice}</p>
          <div className="combined-verdict-signals">
            <span>📰 News: <strong style={{ color: newsSentiment === 'BULLISH' ? '#22c55e' : newsSentiment === 'BEARISH' ? '#ef4444' : '#94a3b8' }}>{newsLoaded ? newsSentiment : '...'}</strong></span>
            <span>📊 Price: <strong style={{ color: prediction.color }}>{prediction.signal}</strong></span>
          </div>
        </div>

        <div className="prediction-box" style={{ borderColor: prediction.color }}>
          <div className="prediction-label-row">
            <span className="prediction-source-tag">📊 Price-Action Signal</span>
            <span className="prediction-source-note">Based on 3-month price history &amp; valuation</span>
          </div>
          <div className="prediction-signal" style={{ color: prediction.color }}>
            {prediction.emoji} {prediction.signal}
          </div>
          <p className="prediction-headline">{prediction.headline}</p>
          <p className="prediction-reasoning">{prediction.reasoning}</p>
          <p className="prediction-disclaimer">⚠️ This is a technical signal only — it does not factor in news or fundamentals. Check the 📰 News tab for AI-driven fundamental analysis.</p>
        </div>

        <div className="stock-story">
          {story.map((s, i) => (
            <div key={i} className="story-section">
              <span className="story-icon">{s.icon}</span>
              <div className="story-body">
                <span className="story-label" style={{ color: s.color }}>{s.label}</span>
                <p className="story-text">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Latest news snippet */}
        <div className="modal-news-section">
          <div className="modal-news-header">
            <span>📰 Latest News</span>
          </div>
          {stockNews.length === 0 ? (
            <p className="modal-news-empty">No recent news found.</p>
          ) : (
            stockNews.map((n, i) => (
              <div key={i} className="modal-news-item">
                <a href={n.url} target="_blank" rel="noreferrer" className="modal-news-title">{n.title}</a>
                <span className="modal-news-meta">{n.source} · {timeAgo(n.publishedAt)}</span>
              </div>
            ))
          )}
          <button className="modal-news-more" onClick={() => { onClose(); onGoToNews(quote.companyName); }}>
            🔍 Search all news about {quote.companyName.split(' ')[0]} →
          </button>
        </div>
      </div>
    </div>
  );
}

function RealQuoteCard({ quote, watchlist, onAddToWatchlist, onRemoveFromWatchlist, onGoToNews }: {
  quote: RealQuote;
  sparkPrices?: number[];
  watchlist: WatchlistItem[];
  onAddToWatchlist: (q: RealQuote) => Promise<void>;
  onRemoveFromWatchlist: (id: string) => Promise<void>;
  onGoToNews: (query: string) => void;
}) {
  const sym = currencySymbol(quote.currency);
  const flag = quote.market === 'India' ? '🇮🇳' : '🇺🇸';
  const isUp = quote.change >= 0;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="stock-card" onClick={() => setOpen(true)}>
        <div className="stock-header">
          <strong>{quote.symbol}</strong>
          <span className="market-badge">{flag} {quote.market}</span>
        </div>
        <span className="company">{quote.companyName}</span>
        <div className="stock-price">{sym}{quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className={`card-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '▲' : '▼'} {sym}{Math.abs(quote.change).toFixed(2)} ({Math.abs(quote.changePercent).toFixed(2)}%) today
        </div>
        <span className="card-tap-hint">Tap for details →</span>
      </div>
      {open && (
        <StockDetailModal
          quote={quote}
          watchlist={watchlist}
          onAddToWatchlist={onAddToWatchlist}
          onRemoveFromWatchlist={onRemoveFromWatchlist}
          onGoToNews={onGoToNews}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notification, setNotification] = useState('');
  const [alertForm, setAlertForm] = useState<AlertForm>({ symbol: '', targetPrice: '', type: '0' });
  const [tab, setTab] = useState('live');
  const connRef = useRef<HubConnection | null>(null);

  // News tab state
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSearch, setNewsSearch] = useState('');
  const [newsSearchResults, setNewsSearchResults] = useState<NewsArticle[] | null>(null);
  const [newsSearchLoading, setNewsSearchLoading] = useState(false);

  // Live prices tab state
  const [realQuotes, setRealQuotes] = useState<RealQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveSearch, setLiveSearch] = useState('');
  const [searchedQuote, setSearchedQuote] = useState<RealQuote | null>(null);
  const [searchedHistory, setSearchedHistory] = useState<number[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string; exchange: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get('/stock/watchlist').then(r => setWatchlist(r.data));
    api.get('/alert').then(r => setAlerts(r.data));
  }, []);

  // Load popular real quotes when Live Prices or Top Movers tab is opened
  useEffect(() => {
    if ((tab !== 'live' && tab !== 'movers') || realQuotes.length > 0) return;
    loadRealQuotes();
  }, [tab]);

  // Load market news when News tab is opened, then auto-refresh every 10 minutes
  const fetchNews = () => {
    setNewsLoading(true);
    api.get('/news/market')
      .then(r => setNewsArticles(r.data))
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  };

  useEffect(() => {
    if (tab !== 'news') return;
    fetchNews();
    const interval = setInterval(fetchNews, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(interval);
  }, [tab]);

  const searchNews = async () => {
    const q = newsSearch.trim();
    if (!q) return;
    setNewsSearchLoading(true);
    setNewsSearchResults(null);
    api.get(`/news/search?q=${encodeURIComponent(q)}&max=10`)
      .then(r => setNewsSearchResults(r.data))
      .catch(() => setNewsSearchResults([]))
      .finally(() => setNewsSearchLoading(false));
  };

  const loadRealQuotes = () => {
    setQuotesLoading(true);
    setRealQuotes([]);
    api.post('/marketdata/quotes', { symbols: POPULAR_SYMBOLS })
      .then(r => setRealQuotes(r.data))
      .catch(() => {})
      .finally(() => setQuotesLoading(false));
  };

  useEffect(() => {
    const hubUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5082/api')
      .replace(/\/api$/, '') + '/hubs/stock';

    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => user.token
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('PriceUpdate', (updates: Stock[]) => {
      // Update watchlist prices
      setWatchlist(prev => prev.map(w => {
        const u = updates.find(x => x.symbol === w.symbol);
        return u ? { ...w, price: u.price, change: u.change, changePercent: u.changePercent } : w;
      }));
      // Update live prices tab
      setRealQuotes(prev => {
        if (prev.length === 0) return prev; // not loaded yet — skip
        return prev.map(q => {
          const u = updates.find(x => x.symbol === q.symbol);
          if (!u) return q;
          return { ...q, price: u.price, change: u.change, changePercent: u.changePercent };
        });
      });
      setLastUpdated(new Date());
    });

    conn.on('AlertTriggered', (data: AlertTriggeredPayload) => {
      setNotification(data.message);
      setAlerts(prev => prev.map(a =>
        a.symbol === data.symbol && !a.isTriggered ? { ...a, isTriggered: true } : a
      ));
      setTimeout(() => setNotification(''), 6000);
    });

    conn.start().catch(console.error);
    connRef.current = conn;
    return () => { conn.stop(); };
  }, [user.token]);

  const addToWatchlist = async (quote: RealQuote) => {
    const res = await api.post('/stock/watchlist', { symbol: quote.symbol, companyName: quote.companyName });
    setWatchlist(prev => [...prev, res.data]);
  };

  const removeFromWatchlist = async (id: string) => {
    await api.delete(`/stock/watchlist/${id}`);
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  const goToNews = (query: string) => {
    setNewsSearch(query);
    setTab('news');
    setNewsSearchLoading(true);
    setNewsSearchResults(null);
    api.get(`/news/search?q=${encodeURIComponent(query)}&max=10`)
      .then(r => setNewsSearchResults(r.data))
      .catch(() => setNewsSearchResults([]))
      .finally(() => setNewsSearchLoading(false));
  };

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post('/alert', {
      symbol: alertForm.symbol.toUpperCase(),
      targetPrice: parseFloat(alertForm.targetPrice),
      type: parseInt(alertForm.type)
    });
    setAlerts(prev => [res.data, ...prev]);
    setAlertForm({ symbol: '', targetPrice: '', type: '0' });
  };

  const deleteAlert = async (id: string) => {
    await api.delete(`/alert/${id}`);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleLiveSearchChange = (value: string) => {
    setLiveSearch(value);
    setSearchError('');
    setSearchedQuote(null);
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/marketdata/search?q=${encodeURIComponent(value.trim())}`);
        setSuggestions(res.data);
        setShowSuggestions(res.data.length > 0);
      } catch { setSuggestions([]); }
    }, 350);
  };

  const pickSuggestion = (sym: string) => {
    setLiveSearch(sym);
    setSuggestions([]);
    setShowSuggestions(false);
    fetchQuoteForSymbol(sym);
  };

  const fetchQuoteForSymbol = async (sym: string) => {
    if (!sym) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchedQuote(null);
    setSearchedHistory([]);
    try {
      const [quoteRes, histRes] = await Promise.allSettled([
        api.get(`/marketdata/quote/${sym}`),
        api.get(`/marketdata/history/${sym}?range=3mo`)
      ]);
      if (quoteRes.status === 'fulfilled') setSearchedQuote(quoteRes.value.data);
      else setSearchError(`Could not find "${sym}". For India NSE stocks add .NS (e.g. INFY.NS). For US stocks use the ticker directly (e.g. NVDA).`);
      if (histRes.status === 'fulfilled') {
        const closes: number[] = (histRes.value.data.history ?? []).map((h: { close: number }) => h.close);
        setSearchedHistory(closes);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const searchStock = async () => {
    const sym = liveSearch.trim().toUpperCase();
    setSuggestions([]);
    setShowSuggestions(false);
    fetchQuoteForSymbol(sym);
  };

  return (
    <div className="dashboard">
      <header>
        <h1>📈 StockNova</h1>
        <div>
          <span>Welcome, {user.name}</span>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      {notification && <div className="alert-banner">🔔 {notification}</div>}

      <nav className="tabs">
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>🔴 Live Prices</button>
        <button className={tab === 'movers' ? 'active' : ''} onClick={() => setTab('movers')}>📊 Top Movers</button>
        <button className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}>📰 News</button>
        <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => setTab('watchlist')}>Watchlist ({watchlist.length})</button>
        <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>Alerts ({alerts.filter(a => !a.isTriggered).length})</button>
      </nav>

      {tab === 'movers' && (
        <div className="movers-tab">
          {quotesLoading ? (
            <p className="empty">⏳ Loading stock data...</p>
          ) : realQuotes.length === 0 ? (
            <p className="empty">No data yet. Please wait a moment.</p>
          ) : (() => {
            const sorted = [...realQuotes].sort((a, b) => b.changePercent - a.changePercent);
            const gainers = sorted.filter(q => q.changePercent > 0).slice(0, 5);
            const losers  = sorted.filter(q => q.changePercent < 0).slice(-5).reverse();
            const sym = (q: RealQuote) => currencySymbol(q.currency);
            const Row = ({ q, isGainer }: { q: RealQuote; isGainer: boolean }) => (
              <div className="mover-card">
                <div className="mover-card-left">
                  <span className="mover-card-sym">{q.symbol}</span>
                  <span className="mover-card-name">{q.companyName}</span>
                </div>
                <div className="mover-card-right">
                  <span className="mover-card-price">{sym(q)}{q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className={`mover-card-chg ${isGainer ? 'up' : 'down'}`}>
                    {isGainer ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                  </span>
                </div>
              </div>
            );
            return (
              <>
                <div className="movers-section">
                  <h3 className="movers-section-title up">📈 Top Gainers Today</h3>
                  {gainers.length === 0 ? <p className="empty">No gainers today.</p> : gainers.map(q => <Row key={q.symbol} q={q} isGainer={true} />)}
                </div>
                <div className="movers-section">
                  <h3 className="movers-section-title down">📉 Top Losers Today</h3>
                  {losers.length === 0 ? <p className="empty">No losers today.</p> : losers.map(q => <Row key={q.symbol} q={q} isGainer={false} />)}
                </div>
                <p className="movers-note">Based on {realQuotes.length} tracked stocks · Refresh Live Prices to update</p>
              </>
            );
          })()}
        </div>
      )}

      {tab === 'watchlist' && (
        <div>
          {watchlist.length === 0 ? (
            <p className="empty">No stocks in watchlist. Search and add from 🔴 Live Prices.</p>
          ) : (
            <div className="stock-grid">
              {watchlist.map(w => (
                <div key={w.id} className="stock-card">
                  <div className="stock-header">
                    <strong>{w.symbol}</strong>
                    <button className="btn-remove" onClick={() => removeFromWatchlist(w.id)}>✕</button>
                  </div>
                  <span className="company">{w.companyName}</span>
                  <div className="stock-price">${w.price?.toFixed(2)}</div>
                  <div className={`stock-change ${w.change >= 0 ? 'up' : 'down'}`}>
                    {w.change >= 0 ? '▲' : '▼'} ${Math.abs(w.change).toFixed(2)} ({w.changePercent?.toFixed(2)}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="alerts-section">
          <form className="alert-form" onSubmit={createAlert}>
            <h3>Set Price Alert</h3>
            <div className="alert-form-row">
              <select value={alertForm.symbol} onChange={e => setAlertForm({ ...alertForm, symbol: e.target.value })} required>
                <option value="">Select Stock</option>
                {POPULAR_SYMBOLS.map(sym => <option key={sym} value={sym}>{sym}</option>)}
              </select>
              <select value={alertForm.type} onChange={e => setAlertForm({ ...alertForm, type: e.target.value })}>
                <option value="0">Price goes Above</option>
                <option value="1">Price goes Below</option>
              </select>
              <input type="number" step="0.01" placeholder="Target Price ($)"
                value={alertForm.targetPrice}
                onChange={e => setAlertForm({ ...alertForm, targetPrice: e.target.value })} required />
              <button type="submit">Create Alert</button>
            </div>
          </form>

          <div className="alert-list">
            {alerts.length === 0 && <p className="empty">No alerts set.</p>}
            {alerts.map(a => (
              <div key={a.id} className={`alert-item ${a.isTriggered ? 'triggered' : ''}`}>
                <span><strong>{a.symbol}</strong> — {a.type === 0 ? 'Above' : 'Below'} ${a.targetPrice.toFixed(2)}</span>
                <span>{a.isTriggered ? '✅ Triggered' : '⏳ Pending'}</span>
                <button className="btn-remove" onClick={() => deleteAlert(a.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'live' && (
        <div className="live-section">
          <div className="live-search-box">
            <p className="search-hint">
              Type a company name or ticker — suggestions appear as you type.&nbsp;
              India NSE → <code>INFY.NS</code> &nbsp;|&nbsp; US → <code>NVDA</code> &nbsp;|&nbsp; India BSE → <code>INFY.BO</code>
            </p>
            <div className="search-row" style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search any stock worldwide... e.g. NVIDIA, INFY.NS, RELIANCE"
                value={liveSearch}
                onChange={e => handleLiveSearchChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchStock(); if (e.key === 'Escape') setShowSuggestions(false); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                autoComplete="off"
              />
              <button onClick={searchStock} disabled={searchLoading}>
                {searchLoading ? 'Searching...' : '🔍 Search'}
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="symbol-suggestions">
                  {suggestions.map(s => (
                    <li key={s.symbol} onMouseDown={() => pickSuggestion(s.symbol)}>
                      <span className="suggest-ticker">{s.symbol}</span>
                      <span className="suggest-name">{s.name}</span>
                      <span className="suggest-exchange">{s.exchange}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searchError && <p className="search-error">{searchError}</p>}
            {searchedQuote && (
              <div className="search-result">
                <p className="result-label">Search Result</p>
                <div className="stock-grid">
                  <RealQuoteCard quote={searchedQuote} sparkPrices={searchedHistory} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onGoToNews={goToNews} />
                </div>
              </div>
            )}
          </div>

          <div className="section-title-row">
            <h3 className="section-title">Popular Stocks — Real Prices</h3>
            <div className="live-status-row">
              {lastUpdated && (
                <span className="live-badge">
                  <span className="live-dot" />
                  Live · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button className="btn-refresh" onClick={loadRealQuotes} disabled={quotesLoading}>
                {quotesLoading ? '⏳' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {quotesLoading ? (
            <p className="empty">⏳ Fetching real prices...</p>
          ) : (
            <>
              <p className="market-group-label">🇮🇳 India (NSE)</p>
              <div className="stock-grid">
                {realQuotes.filter(q => q.market === 'India').map(q => <RealQuoteCard key={q.symbol} quote={q} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onGoToNews={goToNews} />)}
              </div>
              <p className="market-group-label" style={{ marginTop: '1.25rem' }}>🇺🇸 United States</p>
              <div className="stock-grid">
                {realQuotes.filter(q => q.market !== 'India').map(q => <RealQuoteCard key={q.symbol} quote={q} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onGoToNews={goToNews} />)}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'news' && (
        <div className="news-section">
          <div className="news-search-box">
            <div className="search-row">
              <input
                type="text"
                placeholder="Search any topic... e.g. India oil stocks, RBI rate cut, defence sector"
                value={newsSearch}
                onChange={e => setNewsSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchNews()}
              />
              <button onClick={searchNews} disabled={newsSearchLoading}>
                {newsSearchLoading ? 'Searching...' : '🔍 Search'}
              </button>
            </div>
          </div>

          {newsSearchResults !== null && (
            <div className="news-results-block">
              <div className="section-title-row">
                <h3 className="section-title">Search Results ({newsSearchResults.length})</h3>
                <button className="btn-refresh" onClick={() => setNewsSearchResults(null)}>✕ Clear</button>
              </div>
              {newsSearchResults.length === 0
                ? <p className="empty">No articles found.</p>
                : newsSearchResults.map((a, i) => <NewsCard key={i} article={a} />)}
            </div>
          )}

          <div className="section-title-row" style={{ marginTop: newsSearchResults ? '1.5rem' : 0 }}>
            <h3 className="section-title">📡 Top Market News</h3>
            <button className="btn-refresh" onClick={fetchNews} disabled={newsLoading}>
              {newsLoading ? '⏳' : '↻ Refresh'}
            </button>
          </div>
          {newsLoading ? (
            <p className="empty">⏳ Fetching latest news...</p>
          ) : (() => {
            const indiaNews = newsArticles.filter(a =>
              /india|rbi|nse|bse|sensex|nifty/i.test(a.topic + ' ' + a.title)
            );
            const usNews = newsArticles.filter(a =>
              /\bus\b|federal reserve|nasdaq|s&p|dow jones|wall street/i.test(a.topic + ' ' + a.title)
            );
            const otherNews = newsArticles.filter(a =>
              !indiaNews.includes(a) && !usNews.includes(a)
            );
            return (
              <>
                {indiaNews.length > 0 && (
                  <>
                    <p className="market-group-label" style={{ marginTop: '1rem' }}>🇮🇳 India Markets</p>
                    {indiaNews.map((a, i) => <NewsCard key={'in' + i} article={a} />)}
                  </>
                )}
                {usNews.length > 0 && (
                  <>
                    <p className="market-group-label" style={{ marginTop: '1.25rem' }}>🇺🇸 US Markets</p>
                    {usNews.map((a, i) => <NewsCard key={'us' + i} article={a} />)}
                  </>
                )}
                {otherNews.length > 0 && (
                  <>
                    <p className="market-group-label" style={{ marginTop: '1.25rem' }}>🌐 Global</p>
                    {otherNews.map((a, i) => <NewsCard key={'gl' + i} article={a} />)}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
