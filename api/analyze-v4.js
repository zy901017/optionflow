/**
 * 主 API 聚合器 V4 - 修复价格问题，添加调试信息
 */

const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item || Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl = 180) { // 缩短到 3 分钟
  cache.set(key, { data, expiry: Date.now() + ttl * 1000 });
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url}`);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log(`Response received:`, JSON.stringify(data).substring(0, 200));
        return data;
      }
      if (response.status === 429) {
        console.log(`Rate limit hit, retrying in ${2000 * (i + 1)}ms`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error(`Fetch error (attempt ${i + 1}/${retries}):`, error.message);
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

  const { symbol, dte = 7, nocache = false } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `${upperSymbol}-${dte}`;

  // 添加 nocache 参数强制刷新
  if (!nocache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.status(200).json({ ...cached, cached: true });
    }
  }

  try {
    const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    const GEX_KEY = process.env.GEXBOT_API_KEY;

    console.log(`Analyzing ${upperSymbol} with DTE ${dte}`);

    // 1. 获取股票报价
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${upperSymbol}&apikey=${AV_KEY}`;
    const quoteData = await fetchWithRetry(quoteUrl);
    
    const quote = quoteData['Global Quote'];
    if (!quote || !quote['05. price']) {
      console.error('Invalid quote data:', quoteData);
      throw new Error('Invalid symbol or no data available');
    }

    const currentPrice = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));
    const tradingDay = quote['07. latest trading day'];

    console.log(`Price data: ${upperSymbol} = $${currentPrice}, change ${changePercent}%, trading day ${tradingDay}`);

    // 数据验证
    if (isNaN(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid price: ${currentPrice}`);
    }

    // 2. 获取期权链数据
    const optionsUrl = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${upperSymbol}&apikey=${AV_KEY}`;
    let optionsData;
    try {
      optionsData = await fetchWithRetry(optionsUrl);
    } catch (e) {
      console.error('Options fetch failed:', e.message);
      optionsData = null;
    }

    let atmIV = 0.30;
    let ivSource = 'default';
    let optionsChain = { calls: [], puts: [] };

    if (optionsData && optionsData.data && optionsData.data.length > 0) {
      console.log(`Options data received: ${optionsData.data.length} contracts`);
      optionsChain = parseOptionsChain(optionsData.data, parseInt(dte));
      console.log(`Parsed options: ${optionsChain.calls.length} calls, ${optionsChain.puts.length} puts`);

      // 找到 ATM 期权提取 IV
      const atmOptions = optionsData.data
        .filter(opt => opt.type === 'call')
        .sort((a, b) => Math.abs(parseFloat(a.strike) - currentPrice) - Math.abs(parseFloat(b.strike) - currentPrice));

      if (atmOptions.length > 0 && atmOptions[0].implied_volatility) {
        atmIV = parseFloat(atmOptions[0].implied_volatility);
        ivSource = 'options_chain';
        console.log(`ATM IV from options chain: ${(atmIV * 100).toFixed(1)}%`);
      }
    } else {
      console.log('No options data available, using default IV');
    }

    // 3. SPX 特殊处理：使用 VIX
    if (upperSymbol === 'SPX' || upperSymbol === 'SPY') {
      try {
        const vixUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=VIX&apikey=${AV_KEY}`;
        const vixData = await fetchWithRetry(vixUrl);
        if (vixData['Global Quote'] && vixData['Global Quote']['05. price']) {
          atmIV = parseFloat(vixData['Global Quote']['05. price']) / 100;
          ivSource = 'VIX';
          console.log(`Using VIX: ${(atmIV * 100).toFixed(1)}%`);
        }
      } catch (e) {
        console.log('VIX fetch failed, using options chain IV');
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

    console.log(`Volatility range: $${volatilityRange.oneSigma.lower} - $${volatilityRange.oneSigma.upper}`);

    // 5. GEX 数据
    let gexData = {
      zero_gamma: currentPrice,
      gamma_environment: 'neutral',
      available: false
    };

    try {
      const gexUrl = `https://api.gexbot.com/gamma-exposure?symbol=${upperSymbol}&apikey=${GEX_KEY}`;
      const gexResponse = await fetchWithRetry(gexUrl);
      if (gexResponse && gexResponse.zero_gamma) {
        gexData = {
          zero_gamma: gexResponse.zero_gamma,
          gamma_environment: gexResponse.gamma_environment || 'neutral',
          available: true
        };
        console.log(`GEX data: zero_gamma=${gexData.zero_gamma}, env=${gexData.gamma_environment}`);
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

    // 9. 生成策略
    const strategies = generateStrategiesWithRealPrices({
      symbol: upperSymbol,
      currentPrice,
      atmIV,
      dte: daysToExpiry,
      volatilityRange,
      gexData,
      taScore,
      ivRank,
      optionsChain
    });

    const result = {
      symbol: upperSymbol,
      currentPrice,
      change,
      changePercent,
      tradingDay,
      dte: daysToExpiry,
      iv: atmIV,
      ivSource,
      ivRank,
      taScore,
      volatilityRange,
      gexData,
      earnings,
      strategies,
      optionsAvailable: optionsChain.calls.length > 0 || optionsChain.puts.length > 0,
      timestamp: new Date().toISOString(),
      cached: false,
      debug: {
        apiCalls: {
          quote: 'success',
          options: optionsData ? 'success' : 'failed',
          gex: gexData.available ? 'success' : 'failed'
        }
      }
    };

    console.log(`Analysis complete for ${upperSymbol}: price=$${currentPrice}, strategies=${strategies.length}`);

    setCache(cacheKey, result, 180); // 3 分钟缓存
    res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze',
      details: error.message,
      symbol: symbol.toUpperCase(),
      timestamp: new Date().toISOString()
    });
  }
}

// ... 其余函数与 v3 相同 ...
function parseOptionsChain(data, targetDTE) {
  const calls = [];
  const puts = [];
  const today = new Date();

  data.forEach(option => {
    const expiration = new Date(option.expiration);
    const daysToExp = Math.round((expiration - today) / (1000 * 60 * 60 * 24));

    if (Math.abs(daysToExp - targetDTE) <= 3) {
      const optionData = {
        strike: parseFloat(option.strike),
        bid: parseFloat(option.bid) || 0,
        ask: parseFloat(option.ask) || 0,
        last: parseFloat(option.last) || 0,
        mid: ((parseFloat(option.bid) || 0) + (parseFloat(option.ask) || 0)) / 2,
        iv: parseFloat(option.implied_volatility) || 0,
        delta: parseFloat(option.delta) || 0,
        gamma: parseFloat(option.gamma) || 0,
        theta: parseFloat(option.theta) || 0,
        vega: parseFloat(option.vega) || 0,
        volume: parseInt(option.volume) || 0,
        openInterest: parseInt(option.open_interest) || 0,
        expiration: option.expiration,
        daysToExp
      };

      if (option.type === 'call') {
        calls.push(optionData);
      } else {
        puts.push(optionData);
      }
    }
  });

  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  return { calls, puts };
}

function findOptionByStrike(options, targetStrike) {
  if (options.length === 0) return null;
  return options.reduce((closest, option) => {
    const closestDiff = Math.abs(closest.strike - targetStrike);
    const optionDiff = Math.abs(option.strike - targetStrike);
    return optionDiff < closestDiff ? option : closest;
  });
}

function generateStrategiesWithRealPrices(params) {
  const { currentPrice, atmIV, dte, volatilityRange, taScore, ivRank, gexData, optionsChain } = params;
  const strategies = [];

  const hasOptions = optionsChain.calls.length > 0 && optionsChain.puts.length > 0;

  // 1. 铁鹰策略
  if (ivRank.ivRank >= 45 && hasOptions) {
    const putSellStrike = Math.round(volatilityRange.oneSigma.lower / 5) * 5;
    const putBuyStrike = putSellStrike - 10;
    const callSellStrike = Math.round(volatilityRange.oneSigma.upper / 5) * 5;
    const callBuyStrike = callSellStrike + 10;

    const putSellOpt = findOptionByStrike(optionsChain.puts, putSellStrike);
    const putBuyOpt = findOptionByStrike(optionsChain.puts, putBuyStrike);
    const callSellOpt = findOptionByStrike(optionsChain.calls, callSellStrike);
    const callBuyOpt = findOptionByStrike(optionsChain.calls, callBuyStrike);

    if (putSellOpt && putBuyOpt && callSellOpt && callBuyOpt) {
      const creditPerContract = (putSellOpt.mid - putBuyOpt.mid + callSellOpt.mid - callBuyOpt.mid) * 100;
      const contracts = Math.max(1, Math.ceil(150 / creditPerContract));
      const netCredit = Math.round(creditPerContract * contracts);
      const maxRisk = Math.round(((putSellStrike - putBuyStrike) * 100 * contracts) - netCredit);

      strategies.push({
        name: '铁鹰策略',
        type: 'iron_condor',
        strikes: {
          putBuy: putBuyOpt.strike,
          putSell: putSellOpt.strike,
          callSell: callSellOpt.strike,
          callBuy: callBuyOpt.strike
        },
        prices: {
          putBuy: putBuyOpt.mid.toFixed(2),
          putSell: putSellOpt.mid.toFixed(2),
          callSell: callSellOpt.mid.toFixed(2),
          callBuy: callBuyOpt.mid.toFixed(2)
        },
        contracts,
        netCredit,
        maxRisk,
        winRate: 68 + (ivRank.ivRank > 70 ? 7 : 4),
        roc: Math.round((netCredit / maxRisk) * 100),
        usingRealPrices: true,
        reasoning: [
          `IVR ${ivRank.ivRank}%，高位卖出有利`,
          `TA 综合评分 ${taScore.score}，多头趋势明显`,
          `短腿距离 ${((putSellStrike - currentPrice) / currentPrice * 100).toFixed(1)}%，胜率约 ${68 + (ivRank.ivRank > 70 ? 7 : 4)}%`,
          `每日 Theta 衰减约 $${Math.round(netCredit / dte)}`,
          `GEX ${gexData.gamma_environment} Gamma，波动率降低`
        ]
      });
    }
  }

  // 2. 垂直价差
  if (hasOptions) {
    const isBullish = taScore.trend === 'bullish' || taScore.trend === 'neutral';
    const sellStrike = isBullish 
      ? Math.round(volatilityRange.oneSigma.lower / 5) * 5
      : Math.round(volatilityRange.oneSigma.upper / 5) * 5;
    const buyStrike = isBullish ? sellStrike - 10 : sellStrike + 10;

    const sellOpt = isBullish 
      ? findOptionByStrike(optionsChain.puts, sellStrike)
      : findOptionByStrike(optionsChain.calls, sellStrike);
    const buyOpt = isBullish
      ? findOptionByStrike(optionsChain.puts, buyStrike)
      : findOptionByStrike(optionsChain.calls, buyStrike);

    if (sellOpt && buyOpt) {
      const creditPerContract = (sellOpt.mid - buyOpt.mid) * 100;
      const contracts = Math.max(1, Math.ceil(150 / creditPerContract));
      const netCredit = Math.round(creditPerContract * contracts);
      const maxRisk = Math.round((Math.abs(sellStrike - buyStrike) * 100 * contracts) - netCredit);

      strategies.push({
        name: isBullish ? '看涨信用价差' : '看跌信用价差',
        type: 'vertical_spread',
        strikes: {
          sell: sellOpt.strike,
          buy: buyOpt.strike
        },
        prices: {
          sell: sellOpt.mid.toFixed(2),
          buy: buyOpt.mid.toFixed(2)
        },
        contracts,
        netCredit,
        maxRisk,
        winRate: 72 + (ivRank.ivRank > 60 ? 8 : 0),
        roc: Math.round((netCredit / maxRisk) * 100),
        usingRealPrices: true,
        reasoning: [
          `TA 趋势 ${taScore.trend}，方向性策略`,
          `卖出 ${sellOpt.strike}@$${sellOpt.mid.toFixed(2)}`,
          `买入 ${buyOpt.strike}@$${buyOpt.mid.toFixed(2)}`,
          `净收益 $${netCredit}，胜率 ${72 + (ivRank.ivRank > 60 ? 8 : 0)}%`,
          `ROC ${Math.round((netCredit / maxRisk) * 100)}%`
        ]
      });
    }
  }

  // 3. 现金担保看跌
  if (taScore.trend !== 'bearish' && hasOptions) {
    const sellStrike = Math.round((currentPrice * 0.95) / 5) * 5;
    const sellOpt = findOptionByStrike(optionsChain.puts, sellStrike);

    if (sellOpt) {
      const creditPerContract = sellOpt.mid * 100;
      const contracts = Math.max(1, Math.ceil(150 / creditPerContract));
      const netCredit = Math.round(creditPerContract * contracts);
      const maxRisk = Math.round((sellOpt.strike * 100 * contracts) - netCredit);

      strategies.push({
        name: '现金担保看跌',
        type: 'cash_secured_put',
        strikes: {
          sell: sellOpt.strike
        },
        prices: {
          sell: sellOpt.mid.toFixed(2)
        },
        contracts,
        netCredit,
        maxRisk,
        winRate: 76,
        roc: Math.round((netCredit / maxRisk) * 100),
        usingRealPrices: true,
        reasoning: [
          '适合愿意持股的投资者',
          `卖出 Put ${sellOpt.strike}@$${sellOpt.mid.toFixed(2)}`,
          `收取权利金 $${netCredit}`,
          `如被行权，成本价 $${(sellOpt.strike - sellOpt.mid).toFixed(2)}`,
          '胜率约 76%'
        ]
      });
    }
  }

  if (strategies.length === 0) {
    strategies.push(generateFallbackStrategy(params));
  }

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

function generateFallbackStrategy(params) {
  const { currentPrice, atmIV, dte, volatilityRange, ivRank } = params;
  
  const putSell = Math.round(volatilityRange.oneSigma.lower / 5) * 5;
  const credit = atmIV * currentPrice * 0.025;
  const contracts = Math.ceil(150 / credit);
  const netCredit = Math.round(credit * contracts);
  const maxRisk = (10 * 100 * contracts) - netCredit;

  return {
    name: '铁鹰策略（估算）',
    type: 'iron_condor',
    strikes: {
      putBuy: putSell - 10,
      putSell,
      callSell: Math.round(volatilityRange.oneSigma.upper / 5) * 5,
      callBuy: Math.round(volatilityRange.oneSigma.upper / 5) * 5 + 10
    },
    contracts,
    netCredit,
    maxRisk,
    winRate: 68,
    roc: Math.round((netCredit / maxRisk) * 100),
    usingRealPrices: false,
    reasoning: [
      '基于 IV 估算（期权链数据不可用）',
      `预估净收益 $${netCredit}`,
      `IVR ${ivRank.ivRank}%`,
      '建议验证实际期权价格',
      `每日 Theta 约 $${Math.round(netCredit / dte)}`
    ]
  };
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
  score += s.usingRealPrices ? 5 : 3;
  
  return Math.round(Math.max(0, Math.min(100, score)));
}

