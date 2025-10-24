/**
 * 增强版策略生成器
 * 包含 6-8 种实用期权策略
 */

/**
 * 生成所有策略推荐
 */
export function generateAllStrategies(params) {
  const { symbol, currentPrice, atmIV, dte, volatilityRange, gexData, taScore, ivRank } = params;

  const strategies = [];

  // 1. 铁鹰策略（卖方）
  if (ivRank.ivRank >= 45) {
    strategies.push(generateIronCondor(params));
  }

  // 2. 垂直价差 - 看涨/看跌
  strategies.push(generateVerticalSpread(params));

  // 3. 蝶式策略（买方）
  if (ivRank.ivRank <= 60) {
    strategies.push(generateButterfly(params));
  }

  // 4. 现金担保看跌
  if (taScore.trend !== 'bearish') {
    strategies.push(generateCashSecuredPut(params));
  }

  // 5. 日历价差
  if (dte >= 7) {
    strategies.push(generateCalendarSpread(params));
  }

  // 6. 对角价差
  if (dte >= 7 && taScore.trend !== 'neutral') {
    strategies.push(generateDiagonalSpread(params));
  }

  // 计算综合评分并排序
  strategies.forEach(strategy => {
    strategy.score = calculateScore(strategy, ivRank, taScore, gexData);
  });

  strategies.sort((a, b) => b.score - a.score);

  // 添加排名和奖牌
  strategies.forEach((s, i) => {
    s.rank = i + 1;
    s.medal = ['🥇', '🥈', '🥉'][i] || '📊';
  });

  return strategies.slice(0, 3);
}

/**
 * 1. 铁鹰策略（Iron Condor）- 卖方策略
 */
function generateIronCondor(params) {
  const { currentPrice, atmIV, dte, volatilityRange, ivRank } = params;

  const putSellStrike = Math.round(volatilityRange.oneSigma.lower / 5) * 5;
  const putBuyStrike = putSellStrike - 10;
  const callSellStrike = Math.round(volatilityRange.oneSigma.upper / 5) * 5;
  const callBuyStrike = callSellStrike + 10;

  const creditPerContract = atmIV * currentPrice * 0.025;
  const contracts = Math.ceil(150 / creditPerContract);
  const netCredit = Math.round(creditPerContract * contracts);
  const maxRisk = (10 * 100 * contracts) - netCredit;

  return {
    name: '铁鹰策略',
    type: 'iron_condor',
    direction: 'neutral',
    strikes: {
      putBuy: putBuyStrike,
      putSell: putSellStrike,
      callSell: callSellStrike,
      callBuy: callBuyStrike
    },
    contracts,
    netCredit,
    maxRisk,
    winRate: 68 + (ivRank.ivRank > 70 ? 7 : ivRank.ivRank > 50 ? 4 : 0),
    roc: Math.round((netCredit / maxRisk) * 100),
    strategyType: 'seller',
    reasoning: [
      `卖方策略，收取权利金 $${netCredit}`,
      `IVR ${ivRank.ivRank}%，${ivRank.level === 'high' ? '高 IV 环境理想' : '适合卖出'}`,
      `价格区间：${putSellStrike} - ${callSellStrike}（±1σ）`,
      `胜率约 ${68 + (ivRank.ivRank > 70 ? 7 : ivRank.ivRank > 50 ? 4 : 0)}%`,
      `每日 Theta 收益约 $${Math.round(netCredit / dte)}`
    ]
  };
}

/**
 * 2. 垂直价差（Vertical Spread）- 方向性策略
 */
function generateVerticalSpread(params) {
  const { currentPrice, atmIV, dte, volatilityRange, taScore, ivRank } = params;

  const isBullish = taScore.trend === 'bullish' || taScore.trend === 'neutral';
  const spreadWidth = 10;

  let buyStrike, sellStrike, strategyName;

  if (isBullish) {
    // Bull Put Spread（看涨信用价差）
    sellStrike = Math.round(volatilityRange.oneSigma.lower / 5) * 5;
    buyStrike = sellStrike - spreadWidth;
    strategyName = '看涨信用价差';
  } else {
    // Bear Call Spread（看跌信用价差）
    sellStrike = Math.round(volatilityRange.oneSigma.upper / 5) * 5;
    buyStrike = sellStrike + spreadWidth;
    strategyName = '看跌信用价差';
  }

  const creditPerContract = atmIV * currentPrice * 0.018;
  const contracts = Math.ceil(150 / creditPerContract);
  const netCredit = Math.round(creditPerContract * contracts);
  const maxRisk = (spreadWidth * 100 * contracts) - netCredit;

  return {
    name: strategyName,
    type: 'vertical_spread',
    direction: isBullish ? 'bullish' : 'bearish',
    strikes: {
      buy: buyStrike,
      sell: sellStrike
    },
    contracts,
    netCredit,
    maxRisk,
    winRate: 72 + (ivRank.ivRank > 60 ? 5 : 0),
    roc: Math.round((netCredit / maxRisk) * 100),
    strategyType: 'seller',
    reasoning: [
      `${isBullish ? '看涨' : '看跌'}方向性策略，卖出 ${isBullish ? 'Put' : 'Call'} 价差`,
      `TA 趋势 ${taScore.trend}，与策略方向一致`,
      `卖出行权价 ${sellStrike}，买入保护 ${buyStrike}`,
      `胜率约 ${72 + (ivRank.ivRank > 60 ? 5 : 0)}%，风险有限`,
      `最大利润 $${netCredit}，风险收益比 1:${(maxRisk/netCredit).toFixed(2)}`
    ]
  };
}

/**
 * 3. 蝶式策略（Butterfly）- 买方策略
 */
function generateButterfly(params) {
  const { currentPrice, atmIV, dte, ivRank } = params;

  const centerStrike = Math.round(currentPrice / 5) * 5;
  const wingWidth = 10;
  const lowerStrike = centerStrike - wingWidth;
  const upperStrike = centerStrike + wingWidth;

  const debitPerContract = atmIV * currentPrice * 0.012;
  const contracts = Math.ceil(150 / (wingWidth * 100 - debitPerContract));
  const netDebit = Math.round(debitPerContract * contracts);
  const maxProfit = (wingWidth * 100 * contracts) - netDebit;
  const maxRisk = netDebit;

  return {
    name: '蝶式策略',
    type: 'butterfly',
    direction: 'neutral',
    strikes: {
      lower: lowerStrike,
      center: centerStrike,
      upper: upperStrike
    },
    contracts,
    netDebit,
    maxProfit,
    maxRisk,
    winRate: 55 + (ivRank.ivRank < 40 ? 10 : 0),
    roc: Math.round((maxProfit / netDebit) * 100),
    strategyType: 'buyer',
    reasoning: [
      `买方策略，支付成本 $${netDebit}`,
      `IVR ${ivRank.ivRank}%，${ivRank.level === 'low' ? '低 IV 环境理想' : '适合买入'}`,
      `最大利润 $${maxProfit}，在价格 = ${centerStrike} 时实现`,
      `风险有限（最多亏损 $${netDebit}）`,
      `适合预期价格在 ${lowerStrike}-${upperStrike} 区间内`
    ]
  };
}

/**
 * 4. 现金担保看跌（Cash-Secured Put）
 */
function generateCashSecuredPut(params) {
  const { currentPrice, atmIV, dte, ivRank } = params;

  const sellStrike = Math.round((currentPrice * 0.95) / 5) * 5;
  const creditPerContract = atmIV * currentPrice * 0.012;
  const contracts = Math.ceil(150 / creditPerContract);
  const netCredit = Math.round(creditPerContract * contracts);
  const maxRisk = (sellStrike * 100 * contracts) - netCredit;

  return {
    name: '现金担保看跌',
    type: 'cash_secured_put',
    direction: 'bullish',
    strikes: {
      sell: sellStrike
    },
    contracts,
    netCredit,
    maxRisk,
    winRate: 76,
    roc: Math.round((netCredit / maxRisk) * 100),
    strategyType: 'seller',
    reasoning: [
      '卖方策略，适合愿意持有股票的投资者',
      `卖出 Put ${sellStrike}，低于当前价 ${((1 - sellStrike/currentPrice) * 100).toFixed(1)}%`,
      `收取权利金 $${netCredit}，降低持股成本`,
      `如果被行权，实际成本价 $${(sellStrike - creditPerContract).toFixed(2)}`,
      `胜率约 76%，不被行权概率高`
    ]
  };
}

/**
 * 5. 日历价差（Calendar Spread）
 */
function generateCalendarSpread(params) {
  const { currentPrice, atmIV, dte } = params;

  const strike = Math.round(currentPrice / 5) * 5;
  const shortDTE = dte;
  const longDTE = dte + 7; // 长腿多 7 天

  const shortCredit = atmIV * currentPrice * 0.015;
  const longDebit = atmIV * currentPrice * 0.022;
  const netDebit = longDebit - shortCredit;

  const contracts = Math.ceil(150 / (shortCredit * 0.7)); // 预期收益约 70% 短腿权利金
  const netDebitTotal = Math.round(netDebit * contracts);
  const maxProfit = Math.round(shortCredit * 0.7 * contracts);
  const maxRisk = netDebitTotal;

  return {
    name: '日历价差',
    type: 'calendar_spread',
    direction: 'neutral',
    strikes: {
      strike: strike,
      shortDTE: shortDTE,
      longDTE: longDTE
    },
    contracts,
    netDebit: netDebitTotal,
    maxProfit,
    maxRisk,
    winRate: 62,
    roc: Math.round((maxProfit / netDebitTotal) * 100),
    strategyType: 'buyer',
    reasoning: [
      '时间价值策略，卖出近月买入远月',
      `执行价 ${strike}（ATM），利用时间衰减差异`,
      `短腿 ${shortDTE} 天，长腿 ${longDTE} 天`,
      `最大利润在短腿到期时实现`,
      `适合预期价格在 ${strike} 附近波动`
    ]
  };
}

/**
 * 6. 对角价差（Diagonal Spread）
 */
function generateDiagonalSpread(params) {
  const { currentPrice, atmIV, dte, taScore } = params;

  const isBullish = taScore.trend === 'bullish';
  const shortStrike = isBullish 
    ? Math.round((currentPrice * 1.03) / 5) * 5
    : Math.round((currentPrice * 0.97) / 5) * 5;
  const longStrike = isBullish
    ? Math.round((currentPrice * 1.05) / 5) * 5
    : Math.round((currentPrice * 0.95) / 5) * 5;

  const shortDTE = dte;
  const longDTE = dte + 7;

  const shortCredit = atmIV * currentPrice * 0.014;
  const longDebit = atmIV * currentPrice * 0.020;
  const netDebit = longDebit - shortCredit;

  const contracts = Math.ceil(150 / (shortCredit * 0.6));
  const netDebitTotal = Math.round(netDebit * contracts);
  const maxProfit = Math.round(shortCredit * 0.6 * contracts);
  const maxRisk = netDebitTotal;

  return {
    name: isBullish ? '看涨对角价差' : '看跌对角价差',
    type: 'diagonal_spread',
    direction: isBullish ? 'bullish' : 'bearish',
    strikes: {
      shortStrike,
      longStrike,
      shortDTE,
      longDTE
    },
    contracts,
    netDebit: netDebitTotal,
    maxProfit,
    maxRisk,
    winRate: 58,
    roc: Math.round((maxProfit / netDebitTotal) * 100),
    strategyType: 'buyer',
    reasoning: [
      `${isBullish ? '看涨' : '看跌'}方向性策略，结合时间价值`,
      `卖出近月 ${shortStrike}，买入远月 ${longStrike}`,
      `TA 趋势 ${taScore.trend}，与策略方向一致`,
      `短腿 ${shortDTE} 天，长腿 ${longDTE} 天`,
      `适合温和的方向性移动`
    ]
  };
}

/**
 * 计算策略综合评分
 */
function calculateScore(strategy, ivRank, taScore, gexData) {
  let score = 0;

  // 1. 胜率（25%）
  score += (strategy.winRate / 100) * 25;

  // 2. ROC（20%）
  score += Math.min((strategy.roc / 50) * 20, 20);

  // 3. TA 评分（15%）
  score += (taScore.score / 100) * 15;

  // 4. IV Rank 适配度（15%）
  if (strategy.strategyType === 'seller') {
    // 卖方策略在高 IVR 时得分高
    score += ivRank.ivRank >= 70 ? 15 : ivRank.ivRank >= 50 ? 12 : ivRank.ivRank >= 30 ? 8 : 4;
  } else {
    // 买方策略在低 IVR 时得分高
    score += ivRank.ivRank < 30 ? 15 : ivRank.ivRank < 50 ? 10 : 5;
  }

  // 5. 方向性匹配（10%）
  if (strategy.direction === 'neutral') {
    score += 10;
  } else if (strategy.direction === taScore.trend) {
    score += 10;
  } else if (strategy.direction !== taScore.trend && taScore.trend !== 'neutral') {
    score += 3; // 方向不匹配，降低评分
  } else {
    score += 7;
  }

  // 6. GEX 适配度（10%）
  if (gexData.available) {
    if (strategy.type === 'iron_condor' && gexData.gamma_environment === 'positive') {
      score += 10;
    } else if (strategy.strategyType === 'buyer' && gexData.gamma_environment === 'negative') {
      score += 10;
    } else {
      score += 6;
    }
  } else {
    score += 5;
  }

  // 7. 流动性（5%）
  score += 5;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export default {
  generateAllStrategies
};

