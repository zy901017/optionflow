/**
 * GEXbot API 集成
 * 文档：https://www.gexbot.com/apidocs
 * 支持查询任意股票的 GEX 数据
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

  const API_KEY = process.env.GEXBOT_API_KEY || 'NmGXnEwHHbVY';

  try {
    // GEXbot API 端点
    const url = `https://api.gexbot.com/v1/ticker/${symbol.toUpperCase()}?api_key=${API_KEY}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ 
          error: 'Symbol not found',
          message: `No GEX data available for ${symbol}`
        });
      }
      throw new Error(`GEXbot API returned ${response.status}`);
    }

    const data = await response.json();

    // 返回标准化的 GEX 数据
    res.status(200).json({
      symbol: symbol.toUpperCase(),
      zero_gamma: data.zero_gamma || null,
      net_gex_vol: data.net_gex_vol || null,
      net_gex_oi: data.net_gex_oi || null,
      mneg_vol: data.mneg_vol || null,
      mpos_vol: data.mpos_vol || null,
      gamma_environment: data.net_gex_vol > 0 ? 'positive' : 'negative',
      timestamp: new Date().toISOString(),
      raw: data
    });

  } catch (error) {
    console.error('GEXbot API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch GEX data',
      details: error.message,
      fallback: {
        symbol: symbol.toUpperCase(),
        zero_gamma: null,
        net_gex_vol: null,
        gamma_environment: 'unknown',
        message: 'GEX data not available, using fallback'
      }
    });
  }
}

