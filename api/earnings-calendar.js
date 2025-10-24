/**
 * 财报日期 API
 * 使用 Alpha Vantage EARNINGS_CALENDAR
 * 检查近 7 天是否有财报
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
    const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${symbol}&horizon=3month&apikey=${API_KEY}`;

    const response = await fetch(url);
    const csvText = await response.text();

    // 检查错误
    if (csvText.includes('Error Message') || csvText.includes('Note')) {
      return res.status(429).json({ error: 'API rate limit or error' });
    }

    // 解析 CSV
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      return res.status(200).json({
        symbol,
        hasEarningsNear: false,
        nextEarningsDate: null,
        daysUntilEarnings: null,
        message: 'No upcoming earnings found'
      });
    }

    // 跳过标题行
    const dataLines = lines.slice(1);
    
    // 查找最近的财报日期
    let nearestEarnings = null;
    let minDays = Infinity;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length < 2) continue;

      const earningsDate = new Date(parts[1]);
      earningsDate.setHours(0, 0, 0, 0);

      const diffTime = earningsDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays < minDays) {
        minDays = diffDays;
        nearestEarnings = {
          date: parts[1],
          estimate: parts[2] || 'N/A'
        };
      }
    }

    // 判断是否在近 7 天内
    const hasEarningsNear = minDays <= 7;

    res.status(200).json({
      symbol,
      hasEarningsNear,
      nextEarningsDate: nearestEarnings?.date || null,
      daysUntilEarnings: minDays === Infinity ? null : minDays,
      estimate: nearestEarnings?.estimate || null,
      warning: hasEarningsNear ? '⚠️ 财报在近 7 天内，风险较高' : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Earnings Calendar API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch earnings calendar',
      details: error.message,
      fallback: {
        symbol,
        hasEarningsNear: false,
        message: 'Unable to verify earnings, proceed with caution'
      }
    });
  }
}

