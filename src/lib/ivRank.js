/**
 * IV Rank 计算模块
 * IV Rank = (当前 IV - 12 个月最低 IV) / (最高 - 最低) × 100%
 * 
 * 解读：
 * - IVR > 75%：高位，适合卖方策略
 * - IVR 50-75%：中高位，适合卖方策略
 * - IVR 25-50%：中等，中性
 * - IVR < 25%：低位，适合买方策略
 */

/**
 * 计算 IV Rank
 * @param {number} currentIV - 当前隐含波动率
 * @param {Array<number>} historicalIVs - 历史 IV 数组（12 个月）
 * @returns {Object} IV Rank 数据
 */
export function calculateIVRank(currentIV, historicalIVs) {
  if (!currentIV || !historicalIVs || historicalIVs.length === 0) {
    return {
      ivRank: null,
      level: 'unknown',
      recommendation: 'insufficient_data'
    };
  }

  const minIV = Math.min(...historicalIVs);
  const maxIV = Math.max(...historicalIVs);

  if (maxIV === minIV) {
    return {
      ivRank: 50,
      level: 'medium',
      recommendation: 'neutral'
    };
  }

  const ivRank = ((currentIV - minIV) / (maxIV - minIV)) * 100;

  // 确定级别和推荐
  let level, recommendation;

  if (ivRank >= 75) {
    level = 'very_high';
    recommendation = 'sell_premium'; // 卖方策略
  } else if (ivRank >= 50) {
    level = 'high';
    recommendation = 'sell_premium';
  } else if (ivRank >= 25) {
    level = 'medium';
    recommendation = 'neutral';
  } else {
    level = 'low';
    recommendation = 'buy_options'; // 买方策略
  }

  return {
    ivRank: Math.round(ivRank * 10) / 10,
    currentIV,
    minIV,
    maxIV,
    level,
    recommendation,
    interpretation: getIVRankInterpretation(ivRank)
  };
}

/**
 * 获取 IV Rank 解读
 */
function getIVRankInterpretation(ivRank) {
  if (ivRank >= 75) {
    return 'IV 处于 12 个月高位，适合卖出期权收取权利金';
  } else if (ivRank >= 50) {
    return 'IV 处于中高位，卖方策略有优势';
  } else if (ivRank >= 25) {
    return 'IV 处于中等水平，买卖方策略均可';
  } else {
    return 'IV 处于 12 个月低位，适合买入期权';
  }
}

/**
 * 从期权链提取 ATM IV
 * @param {Array} optionsChain - 期权链数据
 * @param {number} currentPrice - 当前股价
 * @returns {number} ATM IV
 */
export function extractATMIV(optionsChain, currentPrice) {
  if (!optionsChain || optionsChain.length === 0) {
    return null;
  }

  // 找到最接近 ATM 的期权
  let closestOption = null;
  let minDiff = Infinity;

  for (const option of optionsChain) {
    const strike = parseFloat(option.strike);
    const diff = Math.abs(strike - currentPrice);

    if (diff < minDiff) {
      minDiff = diff;
      closestOption = option;
    }
  }

  if (!closestOption || !closestOption.implied_volatility) {
    return null;
  }

  return parseFloat(closestOption.implied_volatility);
}

/**
 * 计算波动率百分位（Percentile）
 * @param {number} currentIV - 当前 IV
 * @param {Array<number>} historicalIVs - 历史 IV 数组
 * @returns {number} 百分位（0-100）
 */
export function calculateIVPercentile(currentIV, historicalIVs) {
  if (!currentIV || !historicalIVs || historicalIVs.length === 0) {
    return null;
  }

  const sorted = [...historicalIVs].sort((a, b) => a - b);
  const lowerCount = sorted.filter(iv => iv < currentIV).length;
  
  return Math.round((lowerCount / sorted.length) * 100);
}

export default {
  calculateIVRank,
  extractATMIV,
  calculateIVPercentile
};

