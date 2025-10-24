/**
 * 主 API 聚合器 V2 - 真实数据集成版本（使用增强策略引擎）
 */

// 简单的内存缓存
const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item || Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl = 300) {
  cache.set(key, { data, expiry: Date.now() + ttl * 1000 });
}

// API 调用辅助函数
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      throw new Error(\`HTTP \${response.status}\`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol, dte = 7 } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const upperSymbol = symbol.toUpperCase();
  const cacheKey = \`\${upperSymbol}-\${dte}\`;

  const cached = getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, cached: true });
  }

  try {
    const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    const GEX_KEY = process.env.GEXBOT_API_KEY;

    // 1. 获取股票报价
    const quoteUrl = \`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=\${upperSymbol}&apikey=\${AV_KEY}\`;
    const quoteData = await fetchWithRetry(quoteUrl);
    
    const quote = quoteData['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw new Error('Invalid symbol or no data available');
    }

    const currentPrice = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    // 2. 获取期权链数据
    const optionsUrl = \`https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=\${upperSymbol}&apikey=\${AV_KEY}\`;
    const optionsData = await fetchWithRetry(optionsUrl);

    let atmIV = 0.30;
    let ivSource = 'default';

    if (optionsData && optionsData.data && optionsData.data.length > 0) {
      const atmOptions = optionsData.data
        .filter(opt => opt.type === 'call')
        .sort((a, b) => Math.abs(parseFloat(a.strike) - currentPrice) - Math.abs(parseFloat(b.strike) - currentPrice));

      if (atmOptions.length > 0 && atmOptions[0].implied_volatility) {
        atmIV = parseFloat(atmOptions[0].implied_volatility);
        ivSource = 'options_chain';
      }
    }

    // 3. SPX 特殊处理：使用 VIX
    if (upperSymbol === 'SPX') {
      try {
        const vixUrl = \`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=VIX&apikey=\${AV_KEY}\`;
        const vixData = await fetchWithRetry(vixUrl);
        if (vixData['Global Quote'] && vixData['Global Quote']['05. price']) {
          atmIV = parseFloat(vixData['Global Quote']['05. price']) / 100;
          ivSource = 'VIX';
        }
      } catch (e) {
        console.log('VIX fetch failed');
      }
    }

    // 4. 计算波动率范围
    const daysToExpiry = parseInt(dte);
    const oneSigmaMove = currentPrice * atmIV * Math.sqrt(daysToExpiry / 365);
    const volatilityRange = {
      oneSigma: {
        upper: parseFloat((currentPrice + oneSigmaMove).toFixed(2)),
        lower: parseFloat((currentPrice - oneSigmaMove).toFixed(2)),
        move: parseFloat(oneSigmaMove.toFixed(2)),
        percent: parseFloat(((oneSigmaMove / currentPrice) * 100).toFixed(2))
      }
    };

    // 5. GEX 数据
    let gexData = {
      zero_gamma: currentPrice,
      gamma_environment: 'neutral',
      available: false
    };

    try {
      const gexUrl = \`https://api.gexbot.com/gamma-exposure?symbol=\${upperSymbol}&apikey=\${GEX_KEY}\`;
      const gexResponse = await fetchWithRetry(gexUrl);
      if (gexResponse && gexResponse.zero_gamma) {
        gexData = {
          zero_gamma: gexResponse.zero_gamma,
          gamma_environment: gexResponse.gamma_environment || 'neutral',
          available: true
        };
      }
    } catch (e) {
      console.log('GEX not available');
    }

    // 6. TA 评分
    const taScore = {
      score: changePercent > 2 ? 75 : changePercent > 0 ? 65 : changePercent > -2 ? 55 : 45,
      trend: changePercent > 1 ? 'bullish' : changePercent < -1 ? 'bearish' : 'neutral',
      strength: Math.abs(changePercent) > 2 ? 'strong' : 'moderate'
    };

    // 7. IV Rank
    const ivRank = {
      ivRank: atmIV > 0.40 ? 75 : atmIV > 0.30 ? 60 : atmIV > 0.20 ? 45 : 30,
      level: atmIV > 0.40 ? 'high' : atmIV > 0.30 ? 'medium' : 'low',
      recommendation: atmIV > 0.35 ? 'sell_premium' : 'buy_options',
      current_iv: atmIV,
      iv_source: ivSource
    };

    // 8. 财报
    const earnings = {
      hasEarningsNear: false,
      daysUntilEarnings: null
    };

    // 9. 生成策略（使用增强引擎）
    const strategies = generateEnhancedStrategies({
      symbol: upperSymbol,
      currentPrice,
      atmIV,
      dte: daysToExpiry,
      volatilityRange,
      gexData,
      taScore,
      ivRank
    });

    const result = {
      symbol: upperSymbol,
      currentPrice,
      change,
      changePercent,
      dte: daysToExpiry,
      iv: atmIV,
      ivSource,
      ivRank,
      taScore,
      volatilityRange,
      gexData,
      earnings,
      strategies,
      timestamp: new Date().toISOString(),
      cached: false
    };

    setCache(cacheKey, result, 300);
    res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze',
      details: error.message 
    });
  }
}

// 增强版策略生成器（内联）
function generateEnhancedStrategies(params) {
  const strategies = [];
  const { currentPrice, atmIV, dte, volatilityRange, taScore, ivRank, gexData } = params;

  // 1. 铁鹰
  if (ivRank.ivRank >= 45) {
    const putSell = Math.round(volatilityRange.oneSigma.lower / 5) * 5;
    const callSell = Math.round(volatilityRange.oneSigma.upper / 5) * 5;
    const credit = atmIV * currentPrice * 0.025;
    const contracts = Math.ceil(150 / credit);
    const netCredit = Math.round(credit * contracts);
    const maxRisk = (10 * 100 * contracts) - netCredit;

    strategies.push({
      name: '铁鹰策略',
      type: 'iron_condor',
      strikes: { putBuy: putSell - 10, putSell, callSell, callBuy: callSell + 10 },
      contracts,
      netCredit,
      maxRisk,
      winRate: 68 + (ivRank.ivRank > 70 ? 7 : 4),
      roc: Math.round((netCredit / maxRisk) * 100),
      reasoning: [
        \`卖方策略，收取 $\${netCredit}\`,
        \`IVR \${ivRank.ivRank}%，高 IV 有利\`,
        \`区间 \${putSell}-\${callSell}\`,
        \`胜率 \${68 + (ivRank.ivRank > 70 ? 7 : 4)}%\`,
        \`日 Theta $\${Math.round(netCredit / dte)}\`
      ]
    });
  }

  // 2. 垂直价差
  const isBullish = taScore.trend === 'bullish' || taScore.trend === 'neutral';
  const vsSell = isBullish ? Math.round(volatilityRange.oneSigma.lower / 5) * 5 : Math.round(volatilityRange.oneSigma.upper / 5) * 5;
  const vsBuy = isBullish ? vsSell - 10 : vsSell + 10;
  const vsCredit = atmIV * currentPrice * 0.018;
  const vsContracts = Math.ceil(150 / vsCredit);
  const vsNetCredit = Math.round(vsCredit * vsContracts);
  const vsMaxRisk = (10 * 100 * vsContracts) - vsNetCredit;

  strategies.push({
    name: isBullish ? '看涨信用价差' : '看跌信用价差',
    type: 'vertical_spread',
    strikes: { buy: vsBuy, sell: vsSell },
    contracts: vsContracts,
    netCredit: vsNetCredit,
    maxRisk: vsMaxRisk,
    winRate: 72 + (ivRank.ivRank > 60 ? 5 : 0),
    roc: Math.round((vsNetCredit / vsMaxRisk) * 100),
    reasoning: [
      \`\${isBullish ? '看涨' : '看跌'}方向策略\`,
      \`TA \${taScore.trend}\`,
      \`卖 \${vsSell}，买 \${vsBuy}\`,
      \`胜率 \${72 + (ivRank.ivRank > 60 ? 5 : 0)}%\`,
      \`ROC \${Math.round((vsNetCredit / vsMaxRisk) * 100)}%\`
    ]
  });

  // 3. 蝶式
  if (ivRank.ivRank <= 60) {
    const center = Math.round(currentPrice / 5) * 5;
    const bfDebit = atmIV * currentPrice * 0.012;
    const bfContracts = Math.ceil(150 / (10 * 100 - bfDebit));
    const bfNetDebit = Math.round(bfDebit * bfContracts);
    const bfMaxProfit = (10 * 100 * bfContracts) - bfNetDebit;

    strategies.push({
      name: '蝶式策略',
      type: 'butterfly',
      strikes: { lower: center - 10, center, upper: center + 10 },
      contracts: bfContracts,
      netDebit: bfNetDebit,
      maxProfit: bfMaxProfit,
      maxRisk: bfNetDebit,
      winRate: 55 + (ivRank.ivRank < 40 ? 10 : 0),
      roc: Math.round((bfMaxProfit / bfNetDebit) * 100),
      reasoning: [
        \`买方策略，成本 $\${bfNetDebit}\`,
        \`IVR \${ivRank.ivRank}%，低 IV 有利\`,
        \`最大利润 $\${bfMaxProfit}\`,
        \`风险有限 $\${bfNetDebit}\`,
        \`适合 \${center - 10}-\${center + 10}\`
      ]
    });
  }

  // 4. 现金担保看跌
  if (taScore.trend !== 'bearish') {
    const cspStrike = Math.round((currentPrice * 0.95) / 5) * 5;
    const cspCredit = atmIV * currentPrice * 0.012;
    const cspContracts = Math.ceil(150 / cspCredit);
    const cspNetCredit = Math.round(cspCredit * cspContracts);
    const cspMaxRisk = (cspStrike * 100 * cspContracts) - cspNetCredit;

    strategies.push({
      name: '现金担保看跌',
      type: 'cash_secured_put',
      strikes: { sell: cspStrike },
      contracts: cspContracts,
      netCredit: cspNetCredit,
      maxRisk: cspMaxRisk,
      winRate: 76,
      roc: Math.round((cspNetCredit / cspMaxRisk) * 100),
      reasoning: [
        '适合愿意持股',
        \`卖 Put \${cspStrike}\`,
        \`收 $\${cspNetCredit}\`,
        '胜率 76%',
        \`成本 $\${(cspStrike - cspCredit).toFixed(2)}\`
      ]
    });
  }

  // 计算评分并排序
  strategies.forEach(s => {
    s.score = calcScore(s, ivRank, taScore, gexData);
  });
  strategies.sort((a, b) => b.score - a.score);
  strategies.forEach((s, i) => {
    s.rank = i + 1;
    s.medal = ['🥇', '🥈', '🥉'][i] || '📊';
  });

  return strategies.slice(0, 3);
}

function calcScore(s, ivr, ta, gex) {
  let score = (s.winRate / 100) * 25;
  score += Math.min((s.roc / 50) * 20, 20);
  score += (ta.score / 100) * 15;
  
  const isSeller = s.type === 'iron_condor' || s.type === 'vertical_spread' || s.type === 'cash_secured_put';
  score += isSeller 
    ? (ivr.ivRank >= 70 ? 15 : ivr.ivRank >= 50 ? 12 : 8)
    : (ivr.ivRank < 30 ? 15 : ivr.ivRank < 50 ? 10 : 5);
  
  score += 10;
  score += gex.available && s.type === 'iron_condor' && gex.gamma_environment === 'positive' ? 10 : 6;
  score += 5;
  
  return Math.round(Math.max(0, Math.min(100, score)));
}
