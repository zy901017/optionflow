/**
 * 波动率分析模块
 * 计算 ±1σ 价格带、预期波动范围
 */

/**
 * 计算 ±1σ 价格带
 * @param {number} currentPrice - 当前股价
 * @param {number} iv - 隐含波动率（小数形式，如 0.35 表示 35%）
 * @param {number} dte - 距离到期天数
 * @returns {Object} 波动率分析结果
 */
export function calculateVolatilityRange(currentPrice, iv, dte) {
  if (!currentPrice || !iv || !dte) {
    return null;
  }

  // 计算年化时间因子
  const timeFactor = Math.sqrt(dte / 365);

  // 计算 1σ 波动范围
  const oneSigmaMove = currentPrice * iv * timeFactor;

  // 计算上下边界
  const oneSigmaUpper = currentPrice + oneSigmaMove;
  const oneSigmaLower = currentPrice - oneSigmaMove;

  // 计算 2σ 波动范围（95% 置信区间）
  const twoSigmaMove = oneSigmaMove * 2;
  const twoSigmaUpper = currentPrice + twoSigmaMove;
  const twoSigmaLower = currentPrice - twoSigmaMove;

  // 计算百分比
  const oneSigmaPercent = (oneSigmaMove / currentPrice) * 100;
  const twoSigmaPercent = (twoSigmaMove / currentPrice) * 100;

  return {
    currentPrice,
    iv,
    dte,
    oneSigma: {
      upper: Math.round(oneSigmaUpper * 100) / 100,
      lower: Math.round(oneSigmaLower * 100) / 100,
      move: Math.round(oneSigmaMove * 100) / 100,
      percent: Math.round(oneSigmaPercent * 100) / 100,
      probability: 68.2 // 正态分布 1σ 概率
    },
    twoSigma: {
      upper: Math.round(twoSigmaUpper * 100) / 100,
      lower: Math.round(twoSigmaLower * 100) / 100,
      move: Math.round(twoSigmaMove * 100) / 100,
      percent: Math.round(twoSigmaPercent * 100) / 100,
      probability: 95.4 // 正态分布 2σ 概率
    },
    interpretation: getVolatilityInterpretation(iv, dte)
  };
}

/**
 * 获取波动率解读
 */
function getVolatilityInterpretation(iv, dte) {
  const annualizedIV = iv * 100;
  
  let level;
  if (annualizedIV > 50) {
    level = '极高';
  } else if (annualizedIV > 35) {
    level = '高';
  } else if (annualizedIV > 20) {
    level = '中等';
  } else {
    level = '低';
  }

  return `隐含波动率 ${annualizedIV.toFixed(1)}%（${level}），预期 ${dte} 天内波动 ±${(iv * Math.sqrt(dte / 365) * 100).toFixed(1)}%`;
}

/**
 * 计算期权到期时价格在某个区间内的概率
 * @param {number} currentPrice - 当前价格
 * @param {number} lowerBound - 下边界
 * @param {number} upperBound - 上边界
 * @param {number} iv - 隐含波动率
 * @param {number} dte - 距离到期天数
 * @returns {number} 概率（0-1）
 */
export function calculateProbabilityInRange(currentPrice, lowerBound, upperBound, iv, dte) {
  if (!currentPrice || !lowerBound || !upperBound || !iv || !dte) {
    return null;
  }

  // 计算标准差
  const sigma = currentPrice * iv * Math.sqrt(dte / 365);

  // 标准化 z-score
  const zLower = (lowerBound - currentPrice) / sigma;
  const zUpper = (upperBound - currentPrice) / sigma;

  // 使用正态分布累积分布函数（简化近似）
  const probLower = normalCDF(zLower);
  const probUpper = normalCDF(zUpper);

  const probability = probUpper - probLower;

  return Math.max(0, Math.min(1, probability));
}

/**
 * 正态分布累积分布函数（CDF）近似
 */
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return z > 0 ? 1 - prob : prob;
}

/**
 * 根据 GEX 调整波动率预测
 * @param {Object} volatilityRange - 波动率范围
 * @param {Object} gexData - GEX 数据
 * @returns {Object} 调整后的波动率范围
 */
export function adjustVolatilityWithGEX(volatilityRange, gexData) {
  if (!volatilityRange || !gexData || !gexData.zero_gamma) {
    return volatilityRange;
  }

  const { currentPrice, oneSigma } = volatilityRange;
  const { zero_gamma, gamma_environment } = gexData;

  // 根据 Gamma 环境调整
  let adjustmentFactor = 1.0;

  if (gamma_environment === 'positive') {
    // 正 Gamma 环境：波动率降低
    adjustmentFactor = 0.85;
  } else if (gamma_environment === 'negative') {
    // 负 Gamma 环境：波动率放大
    adjustmentFactor = 1.15;
  }

  // 考虑价格与 Zero Gamma 的关系
  const distanceToZeroGamma = Math.abs(currentPrice - zero_gamma);
  const distancePercent = distanceToZeroGamma / currentPrice;

  if (distancePercent < 0.02) {
    // 非常接近 Zero Gamma，波动可能放大
    adjustmentFactor *= 1.1;
  }

  return {
    ...volatilityRange,
    oneSigma: {
      ...oneSigma,
      upper: Math.round(oneSigma.upper * adjustmentFactor * 100) / 100,
      lower: Math.round(oneSigma.lower * adjustmentFactor * 100) / 100
    },
    gexAdjustment: adjustmentFactor,
    gexNote: gamma_environment === 'positive' 
      ? '正 Gamma 环境，波动率降低' 
      : gamma_environment === 'negative'
      ? '负 Gamma 环境，波动率放大'
      : '无 GEX 调整'
  };
}

export default {
  calculateVolatilityRange,
  calculateProbabilityInRange,
  adjustVolatilityWithGEX
};

