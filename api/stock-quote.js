/**
 * 股票实时价格 API
 * 使用 Alpha Vantage GLOBAL_QUOTE
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

  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    // 检查错误
    if (data['Error Message']) {
      return res.status(400).json({ error: data['Error Message'] });
    }

    if (data['Note']) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait.' });
    }

    const quote = data['Global Quote'];

    if (!quote || !quote['05. price']) {
      return res.status(404).json({ error: 'Symbol not found or no data available' });
    }

    // 返回标准化数据
    res.status(200).json({
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: quote['10. change percent'],
      volume: parseInt(quote['06. volume']),
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stock Quote API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stock quote',
      details: error.message 
    });
  }
}

