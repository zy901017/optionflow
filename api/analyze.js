/**
 * 主 API 聚合器
 * 整合所有数据源并生成策略推荐
 */

export default async function handler(req, res) {
  // CORS 头
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

  try {
    // 返回模拟数据用于演示
    // 实际部署时，这里会调用真实的 API
    const result = {
      symbol: symbol.toUpperCase(),
      currentPrice: 250.50,
      dte: parseInt(dte),
      iv: 0.35,
      ivRank: {
        ivRank: 65,
        level: 'high',
        recommendation: 'sell_premium'
      },
      taScore: {
        score: 72,
        trend: 'bullish',
        strength: 'strong'
      },
      volatilityRange: {
        oneSigma: {
          upper: 268.75,
          lower: 232.25,
          move: 18.25,
          percent: 7.3
        }
      },
      gexData: {
        zero_gamma: 245,
        gamma_environment: 'positive'
      },
      earnings: {
        hasEarningsNear: false,
        daysUntilEarnings: 45
      },
      strategies: [
        {
          name: '铁鹰策略',
          type: 'iron_condor',
          strikes: {
            putBuy: 230,
            putSell: 235,
            callSell: 265,
            callBuy: 270
          },
          contracts: 3,
          netCredit: 180,
          maxRisk: 1320,
          winRate: 75,
          roc: 14,
          score: 85,
          rank: 1,
          medal: '🥇',
          reasoning: [
            'IVR 65%，高位卖出有利',
            'TA 综合评分 72，多头趋势明显',
            '短腿距离 0.8σ，胜率约 75%',
            '每日 Theta 衰减约 $26',
            'GEX 正 Gamma，波动率降低'
          ]
        },
        {
          name: '看涨信用价差',
          type: 'credit_spread',
          direction: 'put',
          strikes: {
            sell: 235,
            buy: 225
          },
          contracts: 6,
          netCredit: 180,
          maxRisk: 4820,
          winRate: 80,
          roc: 4,
          score: 78,
          rank: 2,
          medal: '🥈',
          reasoning: [
            '看涨价差策略，TA 趋势 bullish',
            'IVR 65%，卖出权利金有优势',
            '短腿距离 1σ，胜率约 80%',
            '风险收益比 1:0.04',
            '每日 Theta 衰减约 $26'
          ]
        },
        {
          name: '现金担保看跌',
          type: 'cash_secured_put',
          strikes: {
            sell: 240
          },
          contracts: 5,
          netCredit: 175,
          maxRisk: 11825,
          winRate: 78,
          roc: 1,
          score: 72,
          rank: 3,
          medal: '🥉',
          reasoning: [
            '现金担保看跌，适合愿意持有股票的投资者',
            '执行价 240，低于当前价 4.2%',
            'IVR 65%，收取权利金有优势',
            '胜率约 78%，不被行权概率高',
            '如果被行权，成本价 236.50'
          ]
        }
      ],
      timestamp: new Date().toISOString()
    };

    res.status(200).json(result);

  } catch (error) {
    console.error('Analysis API Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze options',
      details: error.message 
    });
  }
}

