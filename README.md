# 📊 期权现金流计算器

智能推荐周度/双周度期权策略，每组净收益 ≥ $150

## 🎯 核心功能

- ✅ 支持任意美股期权（用户输入代码）
- ✅ 智能推荐 3 个最优策略
- ✅ 实时数据（价格、IV、Greeks）
- ✅ IV Rank 计算（12 个月）
- ✅ TA 综合评分（MACD/RSI/KD）
- ✅ GEX 数据集成
- ✅ 财报日期过滤
- ✅ 综合评分系统（0-100）
- ✅ 每组净收益 ≥ $150

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 API 密钥

# 3. 启动开发服务器
pnpm dev

# 4. 访问
# http://localhost:5173
```

### 部署到 Vercel

1. 在 Vercel 导入项目
2. 配置环境变量：
   - `ALPHA_VANTAGE_API_KEY` = TSKQYES97RY1THS9
   - `FINNHUB_API_KEY` = d3sr3lhr01qpdd5kuhg0d3sr3lhr01qpdd5kuhgg
   - `GEXBOT_API_KEY` = NmGXnEwHHbVY
3. 点击 Deploy

## 📦 项目结构

```
options-flow-calculator/
├── api/                          # Serverless API 函数
│   ├── analyze.js               # 主 API 聚合器
│   ├── alphavantage-options.js  # Alpha Vantage 期权链
│   ├── gexbot-data.js           # GEXbot API
│   ├── stock-quote.js           # 股票报价
│   ├── technical-indicators.js  # 技术指标
│   └── earnings-calendar.js     # 财报日期
├── src/
│   ├── lib/                     # 核心算法模块
│   │   ├── ivRank.js           # IV Rank 计算
│   │   ├── taScore.js          # TA 综合评分
│   │   ├── volatilityAnalysis.js # 波动率分析
│   │   ├── strategyEngine.js   # 策略推荐引擎
│   │   └── scoringSystem.js    # 综合评分系统
│   ├── App.jsx                  # 主应用组件
│   └── App.css                  # 样式文件
├── vercel.json                  # Vercel 配置
└── package.json                 # 项目配置
```

## 📊 支持的策略

1. **铁鹰策略** (Iron Condor) - 中性策略
2. **信用价差** (Credit Spread) - 方向性策略
3. **现金担保看跌** (Cash-Secured Put) - 持股策略

## ⚠️ 风险提示

期权交易存在风险，本工具仅供参考，不构成投资建议。

## 💡 最佳实践

1. 达到 50% 最大利润时提前平仓
2. 严格执行止损策略
3. 规避近 7 天财报

---

**祝您交易顺利！** 🚀📈

