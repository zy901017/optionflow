/**
 * 技术分析综合评分模块
 * 整合多周期 MACD、RSI、KD 指标
 * 输出 0-100 分的综合评分
 */

/**
 * 计算 TA 综合评分
 * @param {Object} indicators - 技术指标数据
 * @param {Object} indicators.daily - 日线指标
 * @param {Object} indicators.hourly1 - 1小时指标
 * @param {Object} indicators.hourly2 - 2小时指标
 * @returns {Object} TA 综合评分
 */
export function calculateTAScore(indicators) {
  const scores = {
    daily: calculatePeriodScore(indicators.daily),
    hourly1: calculatePeriodScore(indicators.hourly1),
    hourly2: calculatePeriodScore(indicators.hourly2)
  };

  // 加权平均：日线 50%，1小时 25%，2小时 25%
  const totalScore = 
    scores.daily.score * 0.5 +
    scores.hourly1.score * 0.25 +
    scores.hourly2.score * 0.25;

  // 综合趋势判断
  const trends = [
    scores.daily.trend,
    scores.hourly1.trend,
    scores.hourly2.trend
  ];

  const bullishCount = trends.filter(t => t === 'bullish').length;
  const bearishCount = trends.filter(t => t === 'bearish').length;

  let overallTrend;
  if (bullishCount >= 2) {
    overallTrend = 'bullish';
  } else if (bearishCount >= 2) {
    overallTrend = 'bearish';
  } else {
    overallTrend = 'neutral';
  }

  return {
    score: Math.round(totalScore),
    trend: overallTrend,
    strength: getStrength(totalScore),
    details: scores,
    interpretation: getInterpretation(totalScore, overallTrend)
  };
}

/**
 * 计算单个周期的评分
 */
function calculatePeriodScore(periodData) {
  if (!periodData || !periodData.macd || !periodData.rsi || !periodData.stoch) {
    return {
      score: 50,
      trend: 'neutral',
      signals: []
    };
  }

  let score = 50; // 基准分
  const signals = [];

  // MACD 评分（权重 40%）
  const macdScore = evaluateMACD(periodData.macd);
  score += macdScore.adjustment;
  signals.push(...macdScore.signals);

  // RSI 评分（权重 30%）
  const rsiScore = evaluateRSI(periodData.rsi);
  score += rsiScore.adjustment;
  signals.push(...rsiScore.signals);

  // STOCH (KD) 评分（权重 30%）
  const stochScore = evaluateSTOCH(periodData.stoch);
  score += stochScore.adjustment;
  signals.push(...stochScore.signals);

  // 限制在 0-100 范围
  score = Math.max(0, Math.min(100, score));

  // 判断趋势
  let trend;
  if (score >= 60) {
    trend = 'bullish';
  } else if (score <= 40) {
    trend = 'bearish';
  } else {
    trend = 'neutral';
  }

  return {
    score: Math.round(score),
    trend,
    signals
  };
}

/**
 * 评估 MACD
 */
function evaluateMACD(macd) {
  const signals = [];
  let adjustment = 0;

  if (macd.hist > 0) {
    adjustment += 15;
    signals.push('MACD 柱状图为正，看涨');
  } else {
    adjustment -= 15;
    signals.push('MACD 柱状图为负，看跌');
  }

  if (macd.macd > macd.signal) {
    adjustment += 5;
    signals.push('MACD 线在信号线上方');
  } else {
    adjustment -= 5;
    signals.push('MACD 线在信号线下方');
  }

  return { adjustment, signals };
}

/**
 * 评估 RSI
 */
function evaluateRSI(rsi) {
  const signals = [];
  let adjustment = 0;

  if (rsi.value > 70) {
    adjustment -= 10;
    signals.push('RSI 超买（>70），可能回调');
  } else if (rsi.value > 60) {
    adjustment += 5;
    signals.push('RSI 强势（60-70）');
  } else if (rsi.value > 50) {
    adjustment += 10;
    signals.push('RSI 中性偏多（50-60）');
  } else if (rsi.value > 40) {
    adjustment -= 10;
    signals.push('RSI 中性偏空（40-50）');
  } else if (rsi.value > 30) {
    adjustment -= 5;
    signals.push('RSI 弱势（30-40）');
  } else {
    adjustment += 10;
    signals.push('RSI 超卖（<30），可能反弹');
  }

  return { adjustment, signals };
}

/**
 * 评估 STOCH (KD)
 */
function evaluateSTOCH(stoch) {
  const signals = [];
  let adjustment = 0;

  if (stoch.k > 80) {
    adjustment -= 10;
    signals.push('KD 超买（>80），可能回调');
  } else if (stoch.k > 50) {
    adjustment += 10;
    signals.push('KD 强势（>50）');
  } else if (stoch.k > 20) {
    adjustment -= 10;
    signals.push('KD 弱势（<50）');
  } else {
    adjustment += 10;
    signals.push('KD 超卖（<20），可能反弹');
  }

  if (stoch.k > stoch.d) {
    adjustment += 5;
    signals.push('K 线在 D 线上方，看涨');
  } else {
    adjustment -= 5;
    signals.push('K 线在 D 线下方，看跌');
  }

  return { adjustment, signals };
}

/**
 * 获取强度描述
 */
function getStrength(score) {
  if (score >= 75) return 'very_strong';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'moderate';
  if (score >= 25) return 'weak';
  return 'very_weak';
}

/**
 * 获取解读
 */
function getInterpretation(score, trend) {
  if (trend === 'bullish') {
    if (score >= 75) {
      return '多头趋势强劲，技术面非常看涨';
    } else if (score >= 60) {
      return '多头趋势明显，技术面看涨';
    } else {
      return '多头趋势温和，技术面偏多';
    }
  } else if (trend === 'bearish') {
    if (score <= 25) {
      return '空头趋势强劲，技术面非常看跌';
    } else if (score <= 40) {
      return '空头趋势明显，技术面看跌';
    } else {
      return '空头趋势温和，技术面偏空';
    }
  } else {
    return '技术面中性，无明显方向';
  }
}

export default {
  calculateTAScore
};

