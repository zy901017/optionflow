/**
 * 技术指标 API
 * 获取 MACD、RSI、STOCH（KD）指标
 * 支持多周期：日线、1小时、2小时
 */

export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol, interval = '60min' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });
  }

  try {
    // 并行获取三个指标
    const [macdData, rsiData, stochData] = await Promise.all([
      fetchMACD(symbol, interval, API_KEY),
      fetchRSI(symbol, interval, API_KEY),
      fetchSTOCH(symbol, interval, API_KEY)
    ]);

    // 返回综合数据
    res.status(200).json({
      symbol,
      interval,
      macd: macdData,
      rsi: rsiData,
      stoch: stochData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Technical Indicators API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch technical indicators',
      details: error.message 
    });
  }
}

async function fetchMACD(symbol, interval, apiKey) {
  const url = `https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=${interval}&series_type=close&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    throw new Error('MACD API error');
  }

  const technical = data['Technical Analysis: MACD'];
  if (!technical) return null;

  const latest = Object.keys(technical)[0];
  const values = technical[latest];

  return {
    macd: parseFloat(values['MACD']),
    signal: parseFloat(values['MACD_Signal']),
    hist: parseFloat(values['MACD_Hist']),
    trend: parseFloat(values['MACD_Hist']) > 0 ? 'bullish' : 'bearish'
  };
}

async function fetchRSI(symbol, interval, apiKey) {
  const url = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=${interval}&time_period=14&series_type=close&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    throw new Error('RSI API error');
  }

  const technical = data['Technical Analysis: RSI'];
  if (!technical) return null;

  const latest = Object.keys(technical)[0];
  const rsi = parseFloat(technical[latest]['RSI']);

  return {
    value: rsi,
    signal: rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral'
  };
}

async function fetchSTOCH(symbol, interval, apiKey) {
  const url = `https://www.alphavantage.co/query?function=STOCH&symbol=${symbol}&interval=${interval}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    throw new Error('STOCH API error');
  }

  const technical = data['Technical Analysis: STOCH'];
  if (!technical) return null;

  const latest = Object.keys(technical)[0];
  const values = technical[latest];

  const slowK = parseFloat(values['SlowK']);
  const slowD = parseFloat(values['SlowD']);

  return {
    k: slowK,
    d: slowD,
    signal: slowK > 80 ? 'overbought' : slowK < 20 ? 'oversold' : 'neutral',
    trend: slowK > slowD ? 'bullish' : 'bearish'
  };
}

