/**
 * 综合评分系统
 * 对策略进行 0-100 分评分并排序
 */

/**
 * 计算策略综合评分
 * @param {Array} strategies - 策略数组
 * @param {Object} marketData - 市场数据
 * @returns {Array} 排序后的策略数组
 */
export function scoreAndRankStrategies(strategies, marketData) {
  const { ivRank, taScore, gexData, earnings } = marketData;

  // 为每个策略计算评分
  const scoredStrategies = strategies.map(strategy => {
    const score = calculateStrategyScore(strategy, {
      ivRank,
      taScore,
      gexData,
      earnings
    });

    return {
      ...strategy,
      score: Math.round(score)
    };
  });

  // 按评分降序排序
  scoredStrategies.sort((a, b) => b.score - a.score);

  return scoredStrategies;
}

/**
 * 计算单个策略的评分
 */
function calculateStrategyScore(strategy, context) {
  let score = 0;

  // 1. 胜率（25%）
  const winRateScore = (strategy.winRate / 100) * 25;
  score += winRateScore;

  // 2. ROC 收益风险比（20%）
  const rocScore = Math.min((strategy.roc / 50) * 20, 20); // 最高 20 分
  score += rocScore;

  // 3. TA 综合评分（15%）
  const taScore = (context.taScore.score / 100) * 15;
  score += taScore;

  // 4. IV Rank 适配度（15%）
  const ivrScore = calculateIVRScore(strategy, context.ivRank);
  score += ivrScore;

  // 5. GEX 适配度（10%）
  const gexScore = calculateGEXScore(strategy, context.gexData);
  score += gexScore;

  // 6. 流动性（10%）
  const liquidityScore = 10; // 简化：假设流动性良好
  score += liquidityScore;

  // 7. Greeks 健康度（5%）
  const greeksScore = 5; // 简化：假设健康
  score += greeksScore;

  // 8. 财报惩罚（-10 分）
  if (context.earnings?.hasEarningsNear) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 计算 IV Rank 适配度评分
 */
function calculateIVRScore(strategy, ivRank) {
  const ivr = ivRank.ivRank;

  // 卖方策略在高 IVR 时得分高
  if (strategy.type === 'iron_condor' || strategy.type === 'credit_spread' || strategy.type === 'cash_secured_put') {
    if (ivr >= 75) {
      return 15;
    } else if (ivr >= 50) {
      return 12;
    } else if (ivr >= 25) {
      return 8;
    } else {
      return 4;
    }
  }

  // 买方策略在低 IVR 时得分高
  if (ivr < 25) {
    return 15;
  } else if (ivr < 50) {
    return 10;
  } else {
    return 5;
  }
}

/**
 * 计算 GEX 适配度评分
 */
function calculateGEXScore(strategy, gexData) {
  if (!gexData || !gexData.gamma_environment) {
    return 5; // 无 GEX 数据，给中等分
  }

  const { gamma_environment } = gexData;

  // 卖方策略在正 Gamma 环境得分高
  if (strategy.type === 'iron_condor' || strategy.type === 'credit_spread' || strategy.type === 'cash_secured_put') {
    return gamma_environment === 'positive' ? 10 : 6;
  }

  // 买方策略在负 Gamma 环境得分高
  return gamma_environment === 'negative' ? 10 : 6;
}

/**
 * 生成策略推荐理由
 */
export function generateRecommendationSummary(strategy, rank) {
  const medals = ['🥇', '🥈', '🥉'];
  const medal = medals[rank - 1] || '📊';

  return {
    ...strategy,
    rank,
    medal,
    summary: `${medal} 第${rank}推荐 - 评分 ${strategy.score}/100，胜率 ${strategy.winRate}%，净收益 $${strategy.netCredit}`
  };
}

export default {
  scoreAndRankStrategies,
  generateRecommendationSummary
};

