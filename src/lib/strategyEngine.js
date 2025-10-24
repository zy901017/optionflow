/**
 * 策略推荐引擎
 * 专注于周度/双周度现金流策略
 * 每组净收益 ≥ $150
 */

import { calculateVolatilityRange, calculateProbabilityInRange } from './volatilityAnalysis.js';

/**
 * 生成策略推荐
 * @param {Object} marketData - 市场数据
 * @returns {Array} 策略数组
 */
export function generateStrategies(marketData) {
  const {
    symbol,
    currentPrice,
    optionsChain,
    iv,
    dte,
    ivRank,
    taScore,
    gexData,
    earnings
  } = marketData;

  const strategies = [];

  // 计算波动率范围
  const volRange = calculateVolatilityRange(currentPrice, iv, dte);

  // 策略 1: 铁鹰策略（Iron Condor）
  if (ivRank.ivRank >= 40) {
    const ironCondor = generateIronCondor(marketData, volRange);
    if (ironCondor) strategies.push(ironCondor);
  }

  // 策略 2: 信用价差（Credit Spread）
  const creditSpread = generateCreditSpread(marketData, volRange);
  if (creditSpread) strategies.push(creditSpread);

  // 策略 3: 现金担保看跌（Cash-Secured Put）
  if (taScore.trend !== 'bearish') {
    const cashSecuredPut = generateCashSecuredPut(marketData, volRange);
    if (cashSecuredPut) strategies.push(cashSecuredPut);
  }

  return strategies;
}

/**
 * 生成铁鹰策略
 */
function generateIronCondor(marketData, volRange) {
  const { currentPrice, iv, dte, ivRank, taScore, gexData } = marketData;

  // 执行价选择：基于 0.8σ
  const putSellStrike = roundToStrike(volRange.oneSigma.lower * 1.05);
  const putBuyStrike = roundToStrike(putSellStrike - getWingWidth(currentPrice));
  const callSellStrike = roundToStrike(volRange.oneSigma.upper * 0.95);
  const callBuyStrike = roundToStrike(callSellStrike + getWingWidth(currentPrice));

  // 估算权利金（简化）
  const creditPerContract = estimateCredit(currentPrice, iv, dte, 'iron_condor');

  // 计算张数（满足 $150 净收益）
  const minCredit = 150;
  const contracts = Math.ceil(minCredit / creditPerContract);

  // 总净收益和最大风险
  const netCredit = creditPerContract * contracts;
  const wingWidth = callBuyStrike - callSellStrike;
  const maxRisk = (wingWidth * 100 - creditPerContract) * contracts;

  // 胜率估算
  const winProbability = calculateProbabilityInRange(
    currentPrice,
    putSellStrike,
    callSellStrike,
    iv,
    dte
  );

  // 理由
  const reasoning = [
    `IVR ${ivRank.ivRank}%，${ivRank.level === 'high' || ivRank.level === 'very_high' ? '高位卖出有利' : '适合卖出'}`,
    `TA 综合评分 ${taScore.score}，${taScore.trend === 'neutral' ? '中性市场适合铁鹰' : '趋势' + taScore.trend}`,
    `短腿距离 0.8σ，胜率约 ${Math.round(winProbability * 100)}%`,
    `每日 Theta 衰减约 $${Math.round(creditPerContract / dte * contracts)}`,
    gexData?.gamma_environment === 'positive' ? 'GEX 正 Gamma，波动率降低' : ''
  ].filter(Boolean);

  return {
    name: '铁鹰策略',
    type: 'iron_condor',
    strikes: {
      putBuy: putBuyStrike,
      putSell: putSellStrike,
      callSell: callSellStrike,
      callBuy: callBuyStrike
    },
    contracts,
    netCredit: Math.round(netCredit),
    maxRisk: Math.round(maxRisk),
    winRate: Math.round(winProbability * 100),
    roc: Math.round((netCredit / maxRisk) * 100),
    breakevens: {
      lower: putSellStrike - creditPerContract / 100,
      upper: callSellStrike + creditPerContract / 100
    },
    reasoning,
    score: null // 将在综合评分模块计算
  };
}

/**
 * 生成信用价差策略
 */
function generateCreditSpread(marketData, volRange) {
  const { currentPrice, iv, dte, ivRank, taScore } = marketData;

  // 根据 TA 趋势选择方向
  const direction = taScore.trend === 'bullish' ? 'put' : 'call';

  let sellStrike, buyStrike;

  if (direction === 'put') {
    // 看涨 Put Credit Spread
    sellStrike = roundToStrike(volRange.oneSigma.lower * 1.05);
    buyStrike = roundToStrike(sellStrike - getWingWidth(currentPrice));
  } else {
    // 看跌 Call Credit Spread
    sellStrike = roundToStrike(volRange.oneSigma.upper * 0.95);
    buyStrike = roundToStrike(sellStrike + getWingWidth(currentPrice));
  }

  // 估算权利金
  const creditPerContract = estimateCredit(currentPrice, iv, dte, 'credit_spread');

  // 计算张数
  const minCredit = 150;
  const contracts = Math.ceil(minCredit / creditPerContract);

  // 总净收益和最大风险
  const netCredit = creditPerContract * contracts;
  const spreadWidth = Math.abs(buyStrike - sellStrike);
  const maxRisk = (spreadWidth * 100 - creditPerContract) * contracts;

  // 胜率估算
  const winProbability = direction === 'put'
    ? calculateProbabilityInRange(currentPrice, sellStrike, Infinity, iv, dte)
    : calculateProbabilityInRange(currentPrice, -Infinity, sellStrike, iv, dte);

  // 理由
  const reasoning = [
    `${direction === 'put' ? '看涨' : '看跌'}价差策略，TA 趋势 ${taScore.trend}`,
    `IVR ${ivRank.ivRank}%，卖出权利金有优势`,
    `短腿距离 1σ，胜率约 ${Math.round(winProbability * 100)}%`,
    `风险收益比 1:${(netCredit / maxRisk).toFixed(2)}`,
    `每日 Theta 衰减约 $${Math.round(creditPerContract / dte * contracts)}`
  ];

  return {
    name: direction === 'put' ? '看涨信用价差' : '看跌信用价差',
    type: 'credit_spread',
    direction,
    strikes: {
      sell: sellStrike,
      buy: buyStrike
    },
    contracts,
    netCredit: Math.round(netCredit),
    maxRisk: Math.round(maxRisk),
    winRate: Math.round(winProbability * 100),
    roc: Math.round((netCredit / maxRisk) * 100),
    breakeven: direction === 'put'
      ? sellStrike - creditPerContract / 100
      : sellStrike + creditPerContract / 100,
    reasoning,
    score: null
  };
}

/**
 * 生成现金担保看跌策略
 */
function generateCashSecuredPut(marketData, volRange) {
  const { currentPrice, iv, dte, ivRank, taScore } = marketData;

  // 执行价选择：0.9σ 下限
  const sellStrike = roundToStrike(volRange.oneSigma.lower * 1.1);

  // 估算权利金
  const creditPerContract = estimateCredit(currentPrice, iv, dte, 'cash_secured_put');

  // 计算张数
  const minCredit = 150;
  const contracts = Math.ceil(minCredit / creditPerContract);

  // 总净收益和最大风险
  const netCredit = creditPerContract * contracts;
  const maxRisk = (sellStrike * 100 - creditPerContract) * contracts;

  // 胜率估算
  const winProbability = calculateProbabilityInRange(currentPrice, sellStrike, Infinity, iv, dte);

  // 理由
  const reasoning = [
    `现金担保看跌，适合愿意持有股票的投资者`,
    `执行价 ${sellStrike}，低于当前价 ${((currentPrice - sellStrike) / currentPrice * 100).toFixed(1)}%`,
    `IVR ${ivRank.ivRank}%，收取权利金有优势`,
    `胜率约 ${Math.round(winProbability * 100)}%，不被行权概率高`,
    `如果被行权，成本价 ${(sellStrike - creditPerContract / 100).toFixed(2)}`
  ];

  return {
    name: '现金担保看跌',
    type: 'cash_secured_put',
    strikes: {
      sell: sellStrike
    },
    contracts,
    netCredit: Math.round(netCredit),
    maxRisk: Math.round(maxRisk),
    winRate: Math.round(winProbability * 100),
    roc: Math.round((netCredit / maxRisk) * 100),
    breakeven: sellStrike - creditPerContract / 100,
    reasoning,
    score: null
  };
}

/**
 * 四舍五入到标准执行价
 */
function roundToStrike(price) {
  // 根据价格选择间隔
  let interval;
  if (price < 50) {
    interval = 1;
  } else if (price < 100) {
    interval = 2.5;
  } else if (price < 200) {
    interval = 5;
  } else {
    interval = 10;
  }

  return Math.round(price / interval) * interval;
}

/**
 * 获取翼宽
 */
function getWingWidth(currentPrice) {
  if (currentPrice < 50) {
    return 5;
  } else if (currentPrice < 100) {
    return 10;
  } else if (currentPrice < 300) {
    return 15;
  } else {
    return 20;
  }
}

/**
 * 估算权利金（简化）
 */
function estimateCredit(currentPrice, iv, dte, strategyType) {
  const timeFactor = Math.sqrt(dte / 365);
  const volFactor = iv * currentPrice * timeFactor;

  let credit;

  switch (strategyType) {
    case 'iron_condor':
      credit = volFactor * 0.15; // 铁鹰约 15% 波动范围
      break;
    case 'credit_spread':
      credit = volFactor * 0.10; // 价差约 10%
      break;
    case 'cash_secured_put':
      credit = volFactor * 0.12; // 现金担保约 12%
      break;
    default:
      credit = volFactor * 0.10;
  }

  return Math.max(50, Math.round(credit)); // 最低 $50
}

export default {
  generateStrategies
};

