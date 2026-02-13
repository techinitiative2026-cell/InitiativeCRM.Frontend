import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildAuthenticatedWebSocketUrl } from "./authentication-heatmap";
import "./heatmap.css";

/*
  HeatmapLayout.tsx — updated:
  - Adds a desktop sidebar toggle action button in the header (doesn't change colors)
  - Ensures tile text never visually overflows outside tile bounds (overflow hidden + ellipsis + fitting)
  - Keeps responsive behavior: tiles resize with the treemap and per-tile font-fitting adapts
  - Does not change any color constants
*/

interface SocketMessage<T = unknown> {
  type: string;
  data?: T;
}

type PriceEntry = {
  data: any;
  price?: number | null;
  priceChange24hr?: number | null;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  key: string;
  price?: number | null;
  priceChange24hr?: number | null;
  category?: string;
  _weight?: number;
};

const HEADER_HEIGHT = 52;
const SIDEBAR_WIDTH = 240;
const MIN_TILE = 22;
const HARD_RENDER_CAP = 700;
const TREEMAP_PADDING = 12;
const CATEGORY_HEADER_HEIGHT = 40;

const FONT_STACK = '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const THEME = {
  appBg: "#0b1220",
  headerBg: "#0e1627",
  chromeBorder: "#1c2538",
  leftNavBg: "#0b1320",
  leftNavAccent: "#161d2b",
  tileNegativeBase: "#3c0c0c",
  tileNegativeBase2: "#2b0707",
  tilePositiveBase: "#0f5b27",
  tilePositiveBase2: "#083e1a",
  tileText: "#ffffff",
  tileSubtleText: "rgba(255,255,255,0.88)",
  categoryTintAlpha: 0.12,
  categoryPillAlpha: 0.22,
};

const catColorHsl = (idx: number) => {
  const hue = (idx * 47 + 12) % 360;
  return { hue, s: 64, l: 40 };
};
const catHsla = (idx: number, a = 1) => {
  const c = catColorHsl(idx);
  return `hsla(${c.hue}, ${c.s}%, ${c.l}%, ${a})`;
};

/* Helpers (unchanged) */
const getNumericPrice = (d: any): number | null => {
  if (!d) return null;
  if (typeof d === "number") return d;
  if (typeof d === "string" && !isNaN(Number(d))) return Number(d);
  if (typeof d === "object") {
    for (const k of ["price", "last", "value", "p", "close"]) {
      const v = d[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && !isNaN(Number(v))) return Number(v);
    }
  }
  return null;
};

const computeWeight = (price?: number | null, change?: number | null) => {
  const p = Math.log10((price ?? 1) + 1);
  const c = Math.min(Math.abs(change ?? 0), 10) / 10;
  return Math.max(0.6, p * 0.5 + c * 1.4);
};

const safe = (n: number) => Math.max(MIN_TILE, Math.floor(n));
const formatNumber = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
const formatPct = (n?: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);

const heatBackground = (pct?: number | null) => {
  const neutralTop = "rgba(255,255,255,0.02)";
  const neutralBottom = "rgba(0,0,0,0.06)";
  if (pct == null) return `linear-gradient(180deg, ${neutralTop}, ${neutralBottom})`;
  if (Math.abs(pct) < 0.15) return `linear-gradient(180deg, rgba(128,128,128,0.08), rgba(22,26,34,0.06))`;
  const intensity = Math.min(Math.abs(pct), 10) / 10;
  if (pct > 0) {
    const satTop = Math.round(40 + intensity * 50);
    const lightTop = Math.round(48 - intensity * 18);
    const satBottom = Math.max(30, satTop - 20);
    const lightBottom = Math.max(18, lightTop - 8);
    return `linear-gradient(180deg, hsl(140, ${satTop}%, ${lightTop}%), hsl(140, ${satBottom}%, ${lightBottom}%))`;
  } else {
    const satTop = Math.round(60 + intensity * 30);
    const lightTop = Math.round(48 - intensity * 18);
    const satBottom = Math.max(40, satTop - 20);
    const lightBottom = Math.max(18, lightTop - 8);
    return `linear-gradient(180deg, hsl(0, ${satTop}%, ${lightTop}%), hsl(0, ${satBottom}%, ${lightBottom}%))`;
  }
};

const tileBoxShadow = (pct?: number | null) =>
  pct == null
    ? "none"
    : pct >= 0
    ? "inset 0 -1px 0 rgba(0,0,0,0.90), 0 6px 20px rgba(8,88,40,0.90)"
    : "inset 0 -1px 0 rgba(0,0,0,0.90), 0 6px 20px rgba(76,12,12,0.92)";

/* Slightly larger base font sizes for readability; per-tile fitter still runs */
const tickerFontSizeForArea = (area: number, mobileScale = 1) => {
  if (area <= 900) return Math.max(8, Math.round(8 * mobileScale));
  if (area <= 2500) return Math.max(10, Math.round(10 * mobileScale));
  if (area <= 6000) return Math.max(12, Math.round(12 * mobileScale));
  if (area <= 9000) return Math.max(14, Math.round(14 * mobileScale));
  if (area <= 14000) return Math.max(16, Math.round(16 * mobileScale));
  return Math.max(18, Math.round(18 * mobileScale));
};

const partition = (
  items: Rect[],
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal = true
): Rect[] => {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], x, y, width: w, height: h }];
  const total = items.reduce((s, it) => s + (it._weight ?? computeWeight(it.price, it.priceChange24hr)), 0);
  if (total <= 0) {
    const half = Math.floor(items.length / 2);
    return [
      ...partition(items.slice(0, half), x, y, Math.floor(w / 2), h, !horizontal),
      ...partition(items.slice(half), x + Math.floor(w / 2), y, Math.ceil(w / 2), h, !horizontal),
    ];
  }
  let acc = 0;
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    acc += (items[i]._weight ?? computeWeight(items[i].price, items[i].priceChange24hr));
    if (acc >= total / 2) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) idx = 0;
  if (idx >= items.length - 1) idx = items.length - 2;
  const a = items.slice(0, idx + 1);
  const b = items.slice(idx + 1);
  const aWeight = a.reduce((s, it) => s + (it._weight ?? computeWeight(it.price, it.priceChange24hr)), 0);
  if (horizontal) {
    const wA = safe((w * aWeight) / total);
    return [
      ...partition(a, x, y, wA, h, !horizontal),
      ...partition(b, x + wA, y, safe(w - wA), h, !horizontal),
    ];
  } else {
    const hA = safe((h * aWeight) / total);
    return [
      ...partition(a, x, y, w, hA, !horizontal),
      ...partition(b, x, y + hA, w, safe(h - hA), !horizontal),
    ];
  }
};

/* Category detection helpers unchanged (kept as before) */
const FIXED_CATEGORIES = [
  "All",
  "Crypto",
  "Metals",
  "Commodities",
  "Equities",
  "ETF",
  "Indices",
  "FX",
  "Bonds",
  "Other",
];

const KNOWN_CRYPTO_TICKERS = new Set([
  "BTC", "ETH", "BNB", "ADA", "SOL", "DOT", "DOGE", "LTC", "XRP", "LINK",
  "MATIC", "AVAX", "ATOM", "TRX", "ALGO", "XLM", "FIL", "NEAR", "APT"
]);

const KNOWN_QUOTE_SUFFIXES = ["USD", "USDT", "USDC", "EUR", "GBP", "JPY", "BTC", "ETH", "BUSD", "TRY"];

const METAL_IDENTIFIERS = ["XAU", "XAG", "GOLD", "SILVER", "XPT", "XPD", "PLATINUM", "PALLADIUM"];
const COMMODITY_IDENTIFIERS = ["WTI", "BRENT", "OIL", "NG", "GAS", "COPPER", "COFFEE", "CORN", "WHEAT", "SOY", "SUGAR", "COTTON"];

const extractBaseSymbol = (key: string) => {
  if (!key) return key;
  const up = key.toUpperCase();
  const sepMatch = up.match(/^([A-Z0-9]+)[-_\/]/);
  if (sepMatch) return sepMatch[1];
  const dotMatch = up.match(/^([A-Z0-9]+)\./);
  if (dotMatch) return dotMatch[1];
  for (const q of KNOWN_QUOTE_SUFFIXES) {
    if (up.endsWith(q) && up.length > q.length) return up.slice(0, up.length - q.length);
  }
  return up;
};

const getCategoryFromData = (d: any, key?: string): string => {
  if (!d && !key) return "Other";
  const candidate =
    (d && (d.assetClass || d.asset_class || d.assetType || d.type || d.instrumentType || d.category)) || "";
  if (candidate && typeof candidate === "string" && candidate.trim() !== "") {
    const v = candidate.toString().trim();
    const up = v.toLowerCase();
    if (up.includes("crypto") || up.includes("digital")) return "Crypto";
    if (up.includes("metal") || up.includes("precious")) return "Metals";
    if (up.includes("commodity")) return "Commodities";
    if (up.includes("etf")) return "ETF";
    if (up.includes("equity") || up.includes("stock") || up.includes("share")) return "Equities";
    if (up.includes("index")) return "Indices";
    if (up.includes("forex") || up.includes("fx") || up.includes("currency")) return "FX";
    if (up.includes("bond") || up.includes("treasury")) return "Bonds";
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return detectCategory(d, key);
};

const detectCategory = (d: any, key?: string): string => {
  const upKey = (key || "").toString().toUpperCase();
  const typeHints = (
    (d && (d.assetClass || d.asset_class || d.asset || d.type || d.instrumentType || d.category)) || ""
  ).toString().toLowerCase();
  if (typeHints.includes("crypto") || typeHints.includes("digital")) return "Crypto";
  if (typeHints.includes("metal") || typeHints.includes("precious")) return "Metals";
  if (typeHints.includes("commodity") || typeHints.includes("commodities")) return "Commodities";
  if (typeHints.includes("etf")) return "ETF";
  if (typeHints.includes("equity") || typeHints.includes("stock")) return "Equities";
  if (typeHints.includes("index")) return "Indices";
  if (typeHints.includes("forex") || typeHints.includes("fx") || typeHints.includes("currency")) return "FX";
  if (typeHints.includes("bond") || typeHints.includes("treasury")) return "Bonds";
  const exchange = ((d && (d.exchange || d.exchangeName || d.market)) || "").toString().toLowerCase();
  if (exchange.includes("binance") || exchange.includes("coinbase") || exchange.includes("kraken")) return "Crypto";
  if (exchange.includes("nyse") || exchange.includes("nasdaq")) return "Equities";
  const base = extractBaseSymbol(upKey);
  if (!base) return "Other";
  for (const m of METAL_IDENTIFIERS) if (base === m || upKey.includes(m)) return "Metals";
  for (const c of COMMODITY_IDENTIFIERS) if (base === c || upKey.includes(c)) return "Commodities";
  if (KNOWN_CRYPTO_TICKERS.has(base)) return "Crypto";
  for (const q of KNOWN_QUOTE_SUFFIXES) {
    if (upKey.endsWith(q)) {
      const possibleBase = upKey.slice(0, upKey.length - q.length);
      if (KNOWN_CRYPTO_TICKERS.has(possibleBase)) return "Crypto";
    }
  }
  const name = ((d && (d.name || d.fullName || d.description)) || "").toString().toLowerCase();
  if (name.includes("bitcoin") || name.includes("ethereum") || name.includes("crypto")) return "Crypto";
  if (name.includes("gold") || name.includes("silver")) return "Metals";
  if (name.includes("oil") || name.includes("brent") || name.includes("wti")) return "Commodities";
  if (name.includes("etf")) return "ETF";
  if (name.match(/\binc\b|\bcorp\b|\bltd\b|\bcompany\b/) && !name.includes("fund")) return "Equities";
  if (name.includes("index")) return "Indices";
  if (/^[A-Z]{6}$/.test(upKey)) {
    const left = upKey.slice(0, 3);
    const right = upKey.slice(3, 6);
    const fiatCandidates = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "SGD"];
    if (fiatCandidates.includes(left) && fiatCandidates.includes(right)) return "FX";
  }
  if (upKey.includes("/")) {
    const parts = upKey.split("/");
    if (parts.length === 2) {
      const [a, b] = parts;
      const fiatCandidates = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "SGD"];
      if (fiatCandidates.includes(a) && fiatCandidates.includes(b)) return "FX";
    }
  }
  if (upKey.endsWith("ETF") || name.includes("etf")) return "ETF";
  return "Other";
};

/* HARDCODED DATA (kept as provided by you) */
const USE_HARDCODED = true;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const round = (v: number, d = 2) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

const HARDCODED_BY_CATEGORY: Record<string, string[]> = {
  Crypto: ["BTC/USD","ETH/USD","BNB/USD","ADA/USD","SOL/USD","DOT/USD","DOGE/USD","LTC/USD","LINK/USD","MATIC/USD"],
  Metals: ["XAU/USD","XAG/USD","PLAT/USD","PALL/USD"],
  Commodities: ["WTI/USD","BRENT/USD","NG/USD","COFFEE/USD","COPPER/USD","CORN/USD"],
  Equities: ["AAPL/USD","MSFT/USD","GOOGL/USD","AMZN/USD","TSLA/USD","NVDA/USD","META/USD","JPM/USD","V/USD","DIS/USD"],
  ETF: ["SPY/USD","QQQ/USD","IWM/USD","GLD/USD"],
  Indices: ["SPX/USD","DJI/USD","NDX/USD"],
  FX: ["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD"],
  Bonds: ["US10Y","US30Y","GER10Y"],
  Other: ["VIX","DOGE-OPTION","CUSTOM-INDEX"]
};

type Hardcoin = {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  category: string;
  exchange: string;
};

const HARDCODED_COINS: Hardcoin[] = Object.entries(HARDCODED_BY_CATEGORY).flatMap(([cat, symbols]) =>
  symbols.map((sym, i) => {
    let price = 1;
    let exchange = "Exchange";
    let pct = round(rand(-8, 8), 2);
    switch (cat) {
      case "Crypto":
        exchange = "Coinbase";
        if (i < 2) price = round(rand(1000, 60000), 2);
        else if (i < 6) price = round(rand(1, 2000), 4);
        else price = round(rand(0.01, 50), 4);
        pct = round(rand(-12, 12), 2);
        break;
      case "Metals":
        exchange = "COMEX";
        if (sym.startsWith("XAU")) price = round(rand(1600, 2200), 2);
        else if (sym.startsWith("XAG")) price = round(rand(18, 35), 2);
        else price = round(rand(800, 2000), 2);
        pct = round(rand(-3, 3), 2);
        break;
      case "Commodities":
        exchange = "NYMEX";
        if (sym.startsWith("WTI") || sym.startsWith("BRENT")) price = round(rand(40, 120), 2);
        else price = round(rand(2, 800), 2);
        pct = round(rand(-6, 6), 2);
        break;
      case "Equities":
        exchange = "NASDAQ";
        price = round(rand(20, 3500), 2);
        pct = round(rand(-5, 5), 2);
        break;
      case "ETF":
        exchange = "NYSE Arca";
        price = round(rand(40, 600), 2);
        pct = round(rand(-3, 3), 2);
        break;
      case "Indices":
        exchange = "Index";
        price = round(rand(2000, 42000), 2);
        pct = round(rand(-2, 2), 2);
        break;
      case "FX":
        exchange = "Forex";
        price = round(rand(0.5, 1.6), 4);
        pct = round(rand(-1.5, 1.5), 2);
        break;
      case "Bonds":
        exchange = "Treasury";
        price = round(rand(50, 120), 2);
        pct = round(rand(-0.6, 0.6), 2);
        break;
      case "Other":
        exchange = "OtherEx";
        price = round(rand(0.1, 1000), 2);
        pct = round(rand(-8, 8), 2);
        break;
      default:
        price = round(rand(1, 1000), 2);
        pct = round(rand(-5, 5), 2);
    }
    return {
      symbol: sym,
      name: `${sym} (${cat})`,
      price,
      priceChange24h: pct,
      category: cat,
      exchange,
    };
  })
);

const buildInitialPricesMap = (): Record<string, PriceEntry> => {
  const m: Record<string, PriceEntry> = {};
  HARDCODED_COINS.forEach((c) => {
    m[c.symbol] = {
      data: { name: c.name, symbol: c.symbol, exchange: c.exchange, category: c.category },
      price: c.price,
      priceChange24hr: c.priceChange24h,
    };
  });
  return m;
};

/* ===================== COMPONENT ===================== */

export const HeatmapLayout: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const treemapRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [prices, setPrices] = useState<Record<string, PriceEntry>>(() =>
    USE_HARDCODED ? buildInitialPricesMap() : {}
  );
  const [size, setSize] = useState({ width: 1024, height: 720 });

  const [filters, setFilters] = useState({
    search: "",
    show: "all" as
      | "all"
      | "gainers"
      | "losers"
      | "topGainers"
      | "topLosers"
      | "highVol"
      | "lowVol",
    minChange: -100,
    maxChange: 100,
    minPrice: 0,
    maxPrice: Infinity,
    excludeStable: true,
    sortBy: "weight" as "weight" | "change" | "price",
    category: "All" as string | null,
  });

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );

  // new: desktop sidebar visibility toggle
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 900px)").matches : true
  );
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [isFullscreen, setIsFullscreen] = useState(false);

  // sync with breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(ev.matches);
      if (ev.matches) {
        setSidebarVisible(false);
        setSidebarOpen(false);
      } else {
        setSidebarVisible(true);
        setSidebarOpen(false);
      }
    };
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    handler(mq);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (sidebarOpen) document.body.style.overflow = "hidden";
    else if (!isFullscreen) document.body.style.overflow = "";
  }, [sidebarOpen, isFullscreen]);

  const toggleSidebar = () => setSidebarVisible((s) => !s);

  const enterFullscreen = async () => {
    const el = rootRef.current ?? document.documentElement;
    try {
      if ((el as any).requestFullscreen) await (el as any).requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    } catch {}
  };
  const exitFullscreen = async () => {
    try {
      if ((document as any).exitFullscreen) await (document as any).exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    } catch {}
  };
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as any);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as any);
    };
  }, []);

  // websocket (skipped when hardcoded)
  useEffect(() => {
    if (USE_HARDCODED) return;
    let alive = true;
    const connect = async () => {
      try {
        const wsUrl = await buildAuthenticatedWebSocketUrl("wss://oracle-app.zeeve.net/api/ws/prices");
        const ws = new WebSocket(wsUrl.toString());
        socketRef.current = ws;
        ws.onmessage = (e) => {
          if (!alive) return;
          try {
            const msg = JSON.parse(e.data) as SocketMessage;
            if (msg.type !== "price_update") return;
            const d: any = msg.data;
            const key = (d.symbol ?? d.id ?? d.ticker)?.toString();
            if (!key) return;
            setPrices((p) => ({ ...p, [key]: { data: d, price: getNumericPrice(d), priceChange24hr: Number(d.priceChange24h) || 0 } }));
          } catch {}
        };
        ws.onerror = () => {};
      } catch {}
    };
    connect();
    return () => {
      alive = false;
      try { socketRef.current?.close(); } catch {}
      socketRef.current = null;
    };
  }, []);

  // treemap size observer
  useEffect(() => {
    const el = treemapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(10, r.width), height: Math.max(10, r.height) });
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(update);
      resizeObserverRef.current.observe(el);
    } else {
      window.addEventListener("resize", update);
    }
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      } else {
        window.removeEventListener("resize", update);
      }
    };
  }, [treemapRef, isMobile, sidebarVisible, sidebarOpen, isFullscreen]);

  const mobileScale = isMobile ? 0.78 : 1;

  const categories = useMemo(() => {
    const map = new Map<string, { count: number }>();
    Object.entries(prices).forEach(([k, v]) => {
      const cat = getCategoryFromData(v.data, k);
      const prev = map.get(cat) ?? { count: 0 };
      prev.count++;
      map.set(cat, prev);
    });
    const out: { name: string; count: number; idx: number; color: string; colorBg: string }[] = [];
    FIXED_CATEGORIES.forEach((name, i) => {
      if (name === "All") {
        const total = Object.keys(prices).length;
        out.push({ name, count: total, idx: i, color: catHsla(i, 1), colorBg: catHsla(i, THEME.categoryTintAlpha) });
      } else {
        const info = map.get(name);
        out.push({ name, count: info ? info.count : 0, idx: i, color: catHsla(i, 1), colorBg: catHsla(i, THEME.categoryTintAlpha) });
      }
    });
    const extras = Array.from(map.entries()).filter(([name]) => !FIXED_CATEGORIES.includes(name)).sort((a,b)=>b[1].count - a[1].count);
    extras.forEach(([name, info]) => { const idx = out.length; out.push({ name, count: info.count, idx, color: catHsla(idx,1), colorBg: catHsla(idx, THEME.categoryTintAlpha) }); });
    return out;
  }, [prices]);

  const entries = useMemo<Rect[]>(() => {
    let data: Rect[] = Object.entries(prices).map(([k, v]) => ({ key: k, price: v.price, priceChange24hr: v.priceChange24hr, x:0, y:0, width:0, height:0, category: getCategoryFromData(v.data,k) }));
    // filters/sorting unchanged...
    data = data.filter((e) => {
      const pct = e.priceChange24hr ?? 0;
      const price = e.price ?? 0;
      if (filters.excludeStable && ["USDT","USDC","DAI","BUSD","TUSD"].some((s)=>e.key.endsWith(s))) return false;
      if (filters.search && !e.key.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.show === "gainers" && pct <= 0) return false;
      if (filters.show === "losers" && pct >= 0) return false;
      if (pct < filters.minChange || pct > filters.maxChange) return false;
      if (price < filters.minPrice || price > filters.maxPrice) return false;
      if (expandedCategory && expandedCategory !== "All") return e.category === expandedCategory;
      if (filters.category && filters.category !== "All" && e.category !== filters.category) return false;
      return true;
    });
    if (filters.show === "topGainers") data = [...data].sort((a,b)=>(b.priceChange24hr??0)-(a.priceChange24hr??0)).slice(0,30);
    if (filters.show === "topLosers") data = [...data].sort((a,b)=>(a.priceChange24hr??0)-(b.priceChange24hr??0)).slice(0,30);
    if (filters.show === "highVol") data = [...data].sort((a,b)=>Math.abs(b.priceChange24hr??0)-Math.abs(a.priceChange24hr??0)).slice(0,40);
    if (filters.show === "lowVol") data = data.filter((e)=>Math.abs(e.priceChange24hr??0) <= 1.5);
    if (!["topGainers","topLosers","highVol"].includes(filters.show)) {
      if (filters.sortBy === "change") data.sort((a,b)=>Math.abs(b.priceChange24hr??0)-Math.abs(a.priceChange24hr??0));
      else if (filters.sortBy === "price") data.sort((a,b)=>(b.price??0)-(a.price??0));
      else data.sort((a,b)=>computeWeight(b.price,b.priceChange24hr)-computeWeight(a.price,a.priceChange24hr));
    }
    return data.slice(0, HARD_RENDER_CAP);
  }, [prices, filters, expandedCategory]);

  const groupedRects = useMemo<Rect[]>(() => {
    const innerW = Math.max(10, size.width - TREEMAP_PADDING*2);
    const innerH = Math.max(10, size.height - TREEMAP_PADDING*2);
    const areaX = TREEMAP_PADDING;
    const areaY = TREEMAP_PADDING;
    const buckets = new Map<string, Rect[]>();
    for (const e of entries) {
      const cat = e.category ?? "Other";
      const arr = buckets.get(cat) ?? [];
      const weight = computeWeight(e.price, e.priceChange24hr);
      arr.push({...e, _weight: weight});
      buckets.set(cat, arr);
    }
    if (expandedCategory && expandedCategory !== "All") {
      const items = buckets.get(expandedCategory) ?? [];
      if (!items.length) return [];
      const headerH = Math.min(CATEGORY_HEADER_HEIGHT, Math.floor(innerH * 0.18));
      const itemsAreaY = areaY + headerH;
      const itemsAreaH = Math.max(0, innerH - headerH);
      if (itemsAreaH <= MIN_TILE) return partition(items, areaX, areaY, innerW, innerH);
      return partition(items, areaX, itemsAreaY, innerW, itemsAreaH);
    }
    const placeholders: Rect[] = [];
    for (const [name, items] of buckets.entries()) {
      const catWeight = items.reduce((s,it)=>s + (it._weight ?? computeWeight(it.price,it.priceChange24hr)), 0);
      placeholders.push({ key: `__category__${name}`, x:0, y:0, width:0, height:0, price: undefined, priceChange24hr: undefined, category: name, _weight: Math.max(0.0001, catWeight) });
    }
    if (!placeholders.length) return [];
    placeholders.sort((a,b)=>(b._weight??0)-(a._weight??0));
    const catRects = partition(placeholders, areaX, areaY, innerW, innerH);
    const out: Rect[] = [];
    for (const catRect of catRects) {
      const catName = catRect.category ?? "Other";
      const items = buckets.get(catName) ?? [];
      if (!items.length) continue;
      const headerH = Math.min(CATEGORY_HEADER_HEIGHT, Math.floor(catRect.height * 0.18));
      const itemsAreaY = catRect.y + headerH;
      const itemsAreaH = Math.max(0, catRect.height - headerH);
      if (itemsAreaH <= MIN_TILE) {
        const inner = partition(items, catRect.x, catRect.y, catRect.width, catRect.height);
        inner.forEach((it)=>{ it.category = catName; out.push(it); });
      } else {
        const inner = partition(items, catRect.x, itemsAreaY, catRect.width, itemsAreaH);
        inner.forEach((it)=>{ it.category = catName; out.push(it); });
      }
    }
    return out;
  }, [entries, size, expandedCategory]);

  const categoryRects = useMemo(() => {
    const innerW = Math.max(10, size.width - TREEMAP_PADDING*2);
    const innerH = Math.max(10, size.height - TREEMAP_PADDING*2);
    const areaX = TREEMAP_PADDING;
    const areaY = TREEMAP_PADDING;
    const buckets = new Map<string, { items:Rect[]; weight:number; avgChange:number; count:number }>();
    for (const e of entries) {
      const cat = e.category ?? "Other";
      const prev = buckets.get(cat) ?? { items: [], weight: 0, avgChange: 0, count: 0 };
      const w = computeWeight(e.price, e.priceChange24hr);
      prev.items.push({...e, _weight: w});
      prev.weight += w;
      prev.avgChange += (e.priceChange24hr ?? 0);
      prev.count += 1;
      buckets.set(cat, prev);
    }
    if (expandedCategory && expandedCategory !== "All") {
      return buckets.has(expandedCategory) ? [{ name: expandedCategory, rect: { x: areaX, y: areaY, width: innerW, height: innerH }, count: buckets.get(expandedCategory)!.count, avgChange: (buckets.get(expandedCategory)!.count ? buckets.get(expandedCategory)!.avgChange / buckets.get(expandedCategory)!.count : 0) }] : [];
    }
    const placeholders: Rect[] = [];
    for (const [name, info] of buckets.entries()) placeholders.push({ key: `__category__${name}`, x:0, y:0, width:0, height:0, category: name, _weight: Math.max(0.0001, info.weight) });
    if (!placeholders.length) return [];
    placeholders.sort((a,b)=>(b._weight??0)-(a._weight??0));
    const catRects = partition(placeholders, areaX, areaY, innerW, innerH);
    return catRects.map((cr) => {
      const info = buckets.get(cr.category ?? "Other");
      const count = info ? info.count : 0;
      const avgChange = info && info.count ? info.avgChange / info.count : 0;
      return { name: cr.category ?? "Other", rect: cr, count, avgChange };
    });
  }, [entries, size, expandedCategory]);

  /* fitting refs & logic (unchanged) */
  const tickerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const priceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pillRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const fitText = (el: HTMLElement | null, maxWidth: number, maxHeight: number | null, lo: number, hi: number) => {
    if (!el) return lo;
    el.style.boxSizing = "border-box";
    el.style.maxWidth = `${Math.max(0, maxWidth)}px`;
    el.style.lineHeight = "1";
    const fits = (sizePx: number) => {
      el.style.fontSize = `${sizePx}px`;
      // force reflow
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetWidth;
      const wFits = el.scrollWidth <= Math.max(0, maxWidth) + 0.5;
      const hFits = !maxHeight ? true : el.scrollHeight <= Math.max(0, maxHeight) + 0.5;
      return wFits && hFits;
    };
    let best = lo;
    let a = lo;
    let b = hi;
    while (a <= b) {
      const mid = Math.floor((a + b) / 2);
      if (fits(mid)) {
        best = mid;
        a = mid + 1;
      } else {
        b = mid - 1;
      }
    }
    el.style.fontSize = `${best}px`;
    return best;
  };

  useLayoutEffect(() => {
    if (!groupedRects || groupedRects.length === 0) return;
    for (const r of groupedRects) {
      const key = r.key;
      const area = Math.max(1, r.width * r.height);

      const tickerEl = tickerRefs.current.get(key);
      if (tickerEl) {
        const baseTicker = Math.max(8, Math.round(Math.sqrt(area) / 6));
        const heightBasedMax = Math.max(6, Math.floor((r.height || 0) * 0.42));
        const maxTicker = Math.max(6, Math.min(Math.max(baseTicker, 8), heightBasedMax));
        const minTicker = Math.max(6, Math.floor(maxTicker * 0.28));

        // compute padding from the tile container we set below (we set padding:6)
        const paddingH = 2 * 6;
        const maxWidth = Math.max(6, r.width - paddingH - 4);
        const maxHeight = Math.floor((r.height || 0) * 0.5);
        fitText(tickerEl, maxWidth, maxHeight, minTicker, maxTicker);

        tickerEl.style.whiteSpace = "nowrap";
        tickerEl.style.overflow = "hidden";
        tickerEl.style.textOverflow = "ellipsis";
        tickerEl.style.setProperty("--ticker-font-size", tickerEl.style.fontSize || `${maxTicker}px`);
        tickerEl.style.maxWidth = `${Math.max(0, maxWidth)}px`;
        tickerEl.style.boxSizing = "border-box";
      }

      const priceEl = priceRefs.current.get(key);
      if (priceEl) {
        const maxPriceByHeight = Math.max(6, Math.floor((r.height || 0) * 0.25));
        const basePrice = Math.max(8, Math.floor(Math.sqrt(area) / 8));
        const maxPrice = Math.max(7, Math.min(basePrice, maxPriceByHeight));
        const minPrice = 6;
        const maxWidthPrice = Math.max(6, r.width - 8 - 4);
        fitText(priceEl, maxWidthPrice, Math.floor((r.height || 0) * 0.4), minPrice, maxPrice);
        priceEl.style.whiteSpace = "nowrap";
        priceEl.style.overflow = "hidden";
        priceEl.style.textOverflow = "ellipsis";
        priceEl.style.setProperty("--price-font-size", priceEl.style.fontSize || `${maxPrice}px`);
        priceEl.style.maxWidth = `${Math.max(0, maxWidthPrice)}px`;
      }

      const pillEl = pillRefs.current.get(key);
      if (pillEl) {
        const maxPillByHeight = Math.max(6, Math.floor((r.height || 0) * 0.18));
        const basePill = Math.max(8, Math.floor((r.width || 0) / 12));
        const maxPill = Math.max(7, Math.min(basePill, maxPillByHeight));
        const minPill = 6;
        const maxWidthPill = Math.max(6, r.width - 16 - 4);
        fitText(pillEl, maxWidthPill, Math.floor((r.height || 0) * 0.25), minPill, maxPill);
        pillEl.style.whiteSpace = "nowrap";
        pillEl.style.overflow = "hidden";
        pillEl.style.textOverflow = "ellipsis";
        pillEl.style.setProperty("--pill-font-size", pillEl.style.fontSize || `${maxPill}px`);
        pillEl.style.maxWidth = `${Math.max(0, maxWidthPill)}px`;
        pillEl.style.boxSizing = "border-box";
        pillEl.style.display = "inline-block";
      }
    }
  }, [groupedRects, mobileScale, prices]);

  /* RENDER */
  return (
    <div ref={rootRef} className={`heatmap-root ${isFullscreen ? "presentation-fullscreen" : ""}`} data-theme="dark" style={{ height: "100%", background: THEME.appBg, color: THEME.tileText, fontFamily: FONT_STACK }}>
      {/* HEADER */}
      {!isFullscreen && (
        <header className="heatmap-header" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px" }}>
          {/* Desktop sidebar toggle (action button) */}
          {!isMobile ? (
            <button aria-label="Toggle categories" onClick={toggleSidebar} className="heatmap-hamburger">
              {sidebarVisible ? "Hide categories" : "Show categories"}
            </button>
          ) : (
            <button aria-label="Open categories" onClick={() => setSidebarOpen(true)} className="heatmap-hamburger">☰</button>
          )}

          <div className="heatmap-title" style={{ fontWeight: 800 }}>Market Heatmap</div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div className="heatmap-controls">
              {[
                ["all", "All"],
                ["gainers", "Gainers"],
                ["losers", "Losers"],
                ["lowVol", "Calm"],
              ].map(([v, label]) => (
                <button key={v} onClick={() => setFilters((f) => ({ ...f, show: v as any }))} className={`control-btn ${filters.show === v ? "selected" : ""}`} style={{ fontSize: 13 * mobileScale }}>
                  {label}
                </button>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={filters.excludeStable} onChange={() => setFilters((f) => ({ ...f, excludeStable: !f.excludeStable }))} />
              <span style={{ fontSize: 13 * mobileScale }}>Exclude Stables</span>
            </label>

            <input placeholder="Search" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} className="heatmap-search" style={{ fontSize: 13 * mobileScale, padding: "6px 8px", borderRadius: 8 }} />

            <button className="enter-fullscreen-btn" onClick={() => enterFullscreen()} title="Enter fullscreen presentation">⤢</button>
          </div>
        </header>
      )}

      <div className="heatmap-main" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Desktop sidebar */}
        {!isMobile && sidebarVisible && !expandedCategory && !isFullscreen && (
          <aside className="heatmap-sidebar" style={{ width: SIDEBAR_WIDTH, padding: 12, boxSizing: "border-box", overflowY: "auto" }}>
            <div className="sidebar-section">
              <div className="sidebar-title" style={{ fontWeight: 800 }}>Universe</div>
              <div className="sidebar-all" style={{ marginTop: 8 }}>
                <button onClick={() => { setFilters((f) => ({ ...f, category: "All" })); setExpandedCategory(null); }}>All ({Object.keys(prices).length})</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Categories</div>
              {categories.map((c) => (
                <div key={c.name} onClick={() => { setFilters((f) => ({ ...f, category: c.name })); setExpandedCategory(c.name === "All" ? null : c.name); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, cursor: "pointer", borderRadius: 6 }}>
                  <span style={{ width: 12, height: 12, background: c.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{c.count} items</div>
                  </div>
                  <div style={{ fontSize: 12 }}>{c.count}</div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Mobile drawer */}
        {isMobile && (
          <div role="dialog" aria-modal="true" className={`mobile-drawer ${sidebarOpen ? "open" : ""}`} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "86%", maxWidth: 320, background: THEME.leftNavBg, transform: sidebarOpen ? "translateX(0)" : "translateX(-110%)", transition: "transform 220ms ease", zIndex: 1400, padding: 12, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>Categories</div>
              <button onClick={() => setSidebarOpen(false)}>✕</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { setFilters((f) => ({ ...f, category: "All" })); setExpandedCategory(null); setSidebarOpen(false); }} style={{ width: "100%", padding: 10, borderRadius: 8 }}>All ({Object.keys(prices).length})</button>
              <div style={{ marginTop: 12 }}>
                {categories.map((c) => (
                  <button key={c.name} onClick={() => { setFilters((f) => ({ ...f, category: c.name })); setExpandedCategory(c.name === "All" ? null : c.name); setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 8, borderRadius: 8, marginTop: 8 }}>
                    <span style={{ width: 12, height: 12, background: c.color }} />
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{c.count} items</div>
                    </div>
                    <div style={{ fontSize: 12 }}>{c.count}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TREEMAP */}
        <div className="heatmap-treemap" style={{ flex: 1, padding: TREEMAP_PADDING, position: "relative", minHeight: 0 }}>
          <div ref={treemapRef} className="treemap-inner" style={{ position: "relative", width: "100%", height: "100%" }}>
            {/* Categories (backgrounds + label) */}
            {!expandedCategory && categoryRects.map((c) => {
              const r = c.rect;
              if (!r) return null;
              if (r.width < 80 || r.height < 40) return null;
              const idx = categories.findIndex((cat) => cat.name === c.name);
              const outline = idx >= 0 ? catHsla(idx, 0.18) : "rgba(255,255,255,0.06)";
              const tintBg = idx >= 0 ? catHsla(idx, 0.06) : "rgba(255,255,255,0.03)";
              const headerH = Math.min(CATEGORY_HEADER_HEIGHT, Math.floor(r.height * 0.18));
              const labelTop = r.y + 6 + Math.max(0, Math.floor((Math.min(headerH, CATEGORY_HEADER_HEIGHT) - 28) / 2));
              return (
                <div key={`cat-${c.name}`}>
                  <div aria-hidden style={{ position: "absolute", left: r.x + 6, top: r.y + 6, width: Math.max(0, r.width - 12), height: Math.max(0, r.height - 12), borderRadius: 10, background: tintBg, boxShadow: `inset 0 0 0 1px ${outline}`, pointerEvents: "none", zIndex: 0 }} />
                  <div aria-hidden style={{ position: "absolute", left: r.x + 6, top: r.y + 6, width: Math.max(0, r.width - 12), height: Math.min(headerH, Math.floor(r.height * 0.18)), borderTopLeftRadius: 10, borderTopRightRadius: 10, background: `linear-gradient(90deg, ${outline}, rgba(255,255,255,0.02))`, opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />
                  <button onClick={() => { setFilters((f) => ({ ...f, category: c.name })); setExpandedCategory(c.name === "All" ? null : c.name); }} style={{ position: "absolute", left: r.x + 12, top: labelTop, padding: "6px 10px", borderRadius: 8, background: outline, color: THEME.tileText, fontWeight: 800, fontSize: 13, zIndex: 6, border: "none", cursor: "pointer", pointerEvents: "auto", opacity: 0.98, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.28)" }} title={`Show ${c.name}`} aria-pressed={filters.category === c.name}>
                    <span style={{ display: "inline-block", minWidth: 84, textAlign: "left" }}>{c.name} ({c.count})</span>
                    <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 12, opacity: 0.95 }}>{typeof c.avgChange === "number" ? `${c.avgChange >= 0 ? "+" : ""}${c.avgChange.toFixed(2)}%` : "—"}</span>
                  </button>
                </div>
              );
            })}

            {/* Tiles */}
            {groupedRects.map((r) => {
              const area = r.width * r.height;
              const tickerFontSize = tickerFontSizeForArea(area, mobileScale);
              const catIdx = categories.findIndex((c) => c.name === r.category);
              const tint = catIdx >= 0 ? catHsla(catIdx, THEME.categoryTintAlpha) : "transparent";
              const pillBg = catIdx >= 0 ? catHsla(catIdx, THEME.categoryPillAlpha) : "rgba(255,255,255,0.03)";
              const heatBg = heatBackground(r.priceChange24hr);
              const background = `linear-gradient(180deg, ${tint}, ${tint}), ${heatBg}`;
              const boxShadow = tileBoxShadow(r.priceChange24hr);

              // enforce overflow hidden on tiles and set padding so fitText can compute available width reliably
              const tileStyle = {
                position: "absolute",
                left: r.x,
                top: r.y,
                width: Math.max(0, r.width),
                height: Math.max(0, r.height),
                ["--tile-bg" as any]: background,
                ["--tile-padding" as any]: `${Math.max(6, Math.min(12, r.width * 0.02))}px`,
                ["--ticker-font-size" as any]: `${tickerFontSize}px`,
                ["--tile-box-shadow" as any]: boxShadow,
                ["--pill-bg" as any]: pillBg,
                boxSizing: "border-box",
                zIndex: 2,
                overflow: "hidden",        // prevents content escaping tile
                borderRadius: 8,
                padding: 6,                // fixed padding used by fitText above
                backgroundImage: background,
                boxShadow: boxShadow,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              } as React.CSSProperties & Record<string, any>;

              return (
                <div key={r.key} className="treemap-tile" title={`${r.key} — ${formatPct(r.priceChange24hr)}`} style={tileStyle}>
                  <div className="tile-top" style={{ overflow: "hidden" }}>
                    <div
                      className="tile-ticker"
                      ref={(el) => {
                        if (el) tickerRefs.current.set(r.key, el);
                        else tickerRefs.current.delete(r.key);
                      }}
                      style={{
                        fontSize: `var(--ticker-font-size, ${tickerFontSize}px)`,
                        fontWeight: 800,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: THEME.tileText,
                        textShadow: "0 2px 0 rgba(0,0,0,0.25)",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {r.key}
                    </div>

                    {area > 5000 && (
                      <div className="tile-desc" style={{ marginTop: 6, color: THEME.tileSubtleText, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(prices[r.key]?.data?.name || prices[r.key]?.data?.description) ?? ""}
                      </div>
                    )}
                  </div>

                  {area > 600 && (
                    <div className="tile-bottom" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div className="tile-price-col" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        <div
                          className="tile-price"
                          ref={(el) => {
                            if (el) priceRefs.current.set(r.key, el);
                            else priceRefs.current.delete(r.key);
                          }}
                          style={{
                            fontWeight: 700,
                            color: THEME.tileText,
                            fontSize: `var(--price-font-size, ${Math.max(10, Math.floor(Math.sqrt(area) / 6))}px)`,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "100%",
                            boxSizing: "border-box",
                          }}
                        >
                          {area > 2000 ? `$${formatNumber(r.price)}` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: THEME.tileSubtleText, marginTop: 4 }}>{formatPct(r.priceChange24hr)}</div>
                      </div>

                      {/* <div style={{ marginLeft: "auto" }}>
                        <div
                          className="tile-pill"
                          ref={(el) => {
                            if (el) pillRefs.current.set(r.key, el);
                            else pillRefs.current.delete(r.key);
                          }}
                          style={{
                            fontSize: `var(--pill-font-size, 12px)`,
                            padding: "6px 8px",
                            borderRadius: 12,
                            background: pillBg,
                            color: THEME.tileText,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow:   "ellipsis",
                            maxWidth: Math.min(120, Math.max(40, r.width * 0.4)),
                            boxSizing: "border-box",
                            display: "inline-block",
                          }}
                        >
                          {r.category ?? "Other"}
                        </div>
                      </div> */}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isFullscreen && (
        <button className="presentation-exit-btn" onClick={() => exitFullscreen()} title="Exit fullscreen" style={{ position: "fixed", right: 20, top: 20, zIndex: 1400, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "8px 10px", borderRadius: 6, cursor: "pointer" }}>
          ✕
        </button>
      )}
    </div>
  );
};