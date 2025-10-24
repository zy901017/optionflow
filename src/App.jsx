import { useState } from 'react';
import './App.css';

function App() {
  const [symbol, setSymbol] = useState('');
  const [dte, setDte] = useState('7');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (!symbol) {
      setError('请输入股票代码');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/analyze?symbol=${symbol.toUpperCase()}&dte=${dte}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '分析失败');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>📊 期权现金流计算器</h1>
        <p>智能推荐周度/双周度期权策略，每组净收益 ≥ $150</p>
      </header>

      <div className="input-section">
        <div className="input-group">
          <label>股票代码</label>
          <input
            type="text"
            placeholder="输入代码（如 TSLA, SPY, QQQ）"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
          />
        </div>

        <div className="input-group">
          <label>到期天数 (DTE)</label>
          <select value={dte} onChange={(e) => setDte(e.target.value)}>
            <option value="7">7 天（周度）</option>
            <option value="14">14 天（双周度）</option>
          </select>
        </div>

        <button 
          className="analyze-btn" 
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? '分析中...' : '获取策略推荐'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div className="results">
          <div className="market-info">
            <h2>{result.symbol} 市场概况</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">当前价格</span>
                <span className="value">${result.currentPrice}</span>
              </div>
              <div className="info-item">
                <span className="label">隐含波动率</span>
                <span className="value">{(result.iv * 100).toFixed(1)}%</span>
              </div>
              <div className="info-item">
                <span className="label">IV Rank</span>
                <span className="value">{result.ivRank.ivRank}% ({result.ivRank.level})</span>
              </div>
              <div className="info-item">
                <span className="label">TA 评分</span>
                <span className="value">{result.taScore.score}/100 ({result.taScore.trend})</span>
              </div>
              <div className="info-item">
                <span className="label">波动范围</span>
                <span className="value">
                  ${result.volatilityRange.oneSigma.lower.toFixed(2)} - ${result.volatilityRange.oneSigma.upper.toFixed(2)}
                </span>
              </div>
              <div className="info-item">
                <span className="label">Gamma 环境</span>
                <span className="value">{result.gexData.gamma_environment}</span>
              </div>
            </div>
          </div>

          <div className="strategies-section">
            <h2>🎯 推荐策略（前 3 名）</h2>
            {result.strategies.map((strategy, index) => (
              <div key={index} className="strategy-card">
                <div className="strategy-header">
                  <h3>
                    {strategy.medal} {strategy.name}
                  </h3>
                  <div className="score-badge">
                    评分 {strategy.score}/100
                  </div>
                </div>

                <div className="strategy-metrics">
                  <div className="metric">
                    <span className="metric-label">净收益</span>
                    <span className="metric-value green">${strategy.netCredit}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">最大风险</span>
                    <span className="metric-value red">${strategy.maxRisk}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">胜率</span>
                    <span className="metric-value">{strategy.winRate}%</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">张数</span>
                    <span className="metric-value">{strategy.contracts}</span>
                  </div>
                </div>

                <div className="strategy-strikes">
                  <h4>执行价</h4>
                  {strategy.type === 'iron_condor' && (
                    <p>
                      Put: {strategy.strikes.putBuy}/{strategy.strikes.putSell} - 
                      Call: {strategy.strikes.callSell}/{strategy.strikes.callBuy}
                    </p>
                  )}
                  {strategy.type === 'credit_spread' && (
                    <p>
                      {strategy.direction === 'put' ? 'Put' : 'Call'}: 
                      买入 {strategy.strikes.buy} / 卖出 {strategy.strikes.sell}
                    </p>
                  )}
                  {strategy.type === 'cash_secured_put' && (
                    <p>卖出 Put {strategy.strikes.sell}</p>
                  )}
                </div>

                <div className="strategy-reasoning">
                  <h4>📝 策略理由</h4>
                  <ul>
                    {strategy.reasoning.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="disclaimer">
            <p>⚠️ <strong>风险提示：</strong>期权交易存在风险，本工具仅供参考，不构成投资建议。请在充分了解风险的情况下谨慎交易。</p>
            <p>💡 <strong>最佳实践：</strong>建议在达到 50% 最大利润时提前平仓锁定利润，严格执行止损策略。</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

