/**
 * Alpha Vantage 实时期权链 API
 * 文档：https://www.alphavantage.co/documentation/#options
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

  const { symbol, date } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });
  }

  try {
    // 构建 API URL
    const url = date
      ? `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${symbol}&date=${date}&apikey=${API_KEY}`
      : `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${symbol}&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    // 检查错误
    if (data['Error Message']) {
      return res.status(400).json({ error: data['Error Message'] });
    }

    if (data['Note']) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait.' });
    }

    // 返回数据
    res.status(200).json({
      symbol: data.symbol || symbol,
      data: data.data || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Alpha Vantage Options API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch options data',
      details: error.message 
    });
  }
}

