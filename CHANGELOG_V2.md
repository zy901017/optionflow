# 📋 更新日志 V2.0

## 🎉 V2.0 - 真实数据集成版本

**发布日期：** 2025-10-24

---

## ✅ 主要更新

### 1. 真实期权价格集成 ⭐

**之前（V1.0）：**
- 使用公式估算期权价格
- `creditPerContract = atmIV * currentPrice * 0.025`
- 不准确，仅供参考

**现在（V2.0）：**
- ✅ 从 Alpha Vantage **REALTIME_OPTIONS** API 获取真实期权链
- ✅ 提取具体执行价的 **Bid/Ask/Mid** 价格
- ✅ 使用真实价格计算净收益和最大风险
- ✅ 显示每个期权腿的实际价格

**示例输出：**
```json
{
  "name": "铁鹰策略",
  "strikes": {
    "putBuy": 230,
    "putSell": 235,
    "callSell": 265,
    "callBuy": 270
  },
  "prices": {
    "putBuy": "0.85",
    "putSell": "1.25",
    "callSell": "1.30",
    "callBuy": "0.90"
  },
  "netCredit": 180,
  "usingRealPrices": true
}
```

---

### 2. 增强策略引擎

**新增策略类型：**
1. ✅ 铁鹰策略（Iron Condor）
2. ✅ 垂直价差（Vertical Spread）- 看涨/看跌
3. ✅ 蝶式策略（Butterfly）- 买方策略
4. ✅ 现金担保看跌（Cash-Secured Put）
5. ✅ 日历价差（Calendar Spread）
6. ✅ 对角价差（Diagonal Spread）

**策略分类：**
- **卖方策略：** 铁鹰、垂直价差、现金担保看跌
- **买方策略：** 蝶式、日历价差、对角价差

---

### 3. 智能期权链解析

**功能：**
- ✅ 解析 Alpha Vantage 期权链数据
- ✅ 按 DTE 过滤期权（±3 天）
- ✅ 按执行价排序
- ✅ 提取 Greeks（Delta, Gamma, Theta, Vega）
- ✅ 提取流动性数据（Volume, Open Interest）

**API 返回：**
```json
{
  "optionsChain": {
    "calls": [
      {
        "strike": 250,
        "bid": 3.20,
        "ask": 3.40,
        "mid": 3.30,
        "iv": 0.35,
        "delta": 0.52,
        "volume": 1250,
        "openInterest": 5430
      }
    ],
    "puts": [...]
  },
  "optionsAvailable": true
}
```

---

### 4. 波动率处理优化

**SPX 专用：**
- ✅ 使用 VIX 作为隐含波动率
- ✅ 自动检测 symbol === 'SPX'

**其他股票：**
- ✅ 从期权链提取 ATM IV
- ✅ 使用股票自身的隐含波动率
- ✅ 不再错误地使用 VIX

**示例：**
```json
{
  "symbol": "TSLA",
  "iv": 0.60,
  "ivSource": "options_chain"
}

{
  "symbol": "SPX",
  "iv": 0.15,
  "ivSource": "VIX"
}
```

---

### 5. 缓存机制

**实现：**
- ✅ 简单的内存缓存
- ✅ 默认 TTL：5 分钟（300 秒）
- ✅ 避免 API 限额超限
- ✅ 自动清理过期缓存

**缓存键：**
```
{symbol}-{dte}
例如：TSLA-7, SPY-14
```

---

### 6. 错误处理和重试

**功能：**
- ✅ 自动重试（最多 3 次）
- ✅ 429 错误（限额超限）→ 指数退避
- ✅ 网络错误 → 重试
- ✅ 备用策略（当期权数据不可用时）

---

## 📊 性能对比

| 指标 | V1.0 | V2.0 | 提升 |
|------|------|------|------|
| 数据来源 | 模拟 | 真实 API | ✅ |
| 期权价格 | 估算 | 真实价格 | ✅ |
| 策略类型 | 3 种 | 6 种 | +100% |
| 波动率处理 | 单一 | 智能区分 | ✅ |
| 缓存机制 | 无 | 有 | ✅ |
| 错误处理 | 基础 | 完善 | ✅ |

---

## 🔧 技术细节

### API 端点

**主 API：**
```
GET /api/analyze?symbol=TSLA&dte=7
```

**响应示例：**
```json
{
  "symbol": "TSLA",
  "currentPrice": 250.50,
  "iv": 0.60,
  "ivSource": "options_chain",
  "strategies": [
    {
      "name": "铁鹰策略",
      "netCredit": 180,
      "maxRisk": 1320,
      "winRate": 75,
      "usingRealPrices": true,
      "prices": {
        "putSell": "1.25",
        "putBuy": "0.85",
        "callSell": "1.30",
        "callBuy": "0.90"
      }
    }
  ],
  "optionsAvailable": true,
  "cached": false
}
```

---

### 环境变量

```bash
ALPHA_VANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
GEXBOT_API_KEY=your_key_here
```

---

## ⚠️ 已知限制

### 1. API 限额

**Alpha Vantage 免费版：**
- 5 请求/分钟
- 500 请求/天

**建议：**
- 使用缓存（已实现）
- 前端限制请求频率
- 考虑升级到付费版

### 2. 期权链数据

**可能的问题：**
- 某些股票可能没有期权
- 流动性差的期权可能没有价格
- DTE 匹配可能不精确（±3 天）

**解决方案：**
- 自动回退到估算值
- 显示 `usingRealPrices: false`
- 提示用户验证

---

## 🚀 部署说明

### 1. 更新代码

```bash
# 解压新版本
unzip options-flow-calculator-v2.0-final.zip

# 或通过 Git 更新
git pull origin main
```

### 2. 环境变量

确保 Vercel 项目中配置了 3 个 API 密钥。

### 3. 重新部署

```bash
vercel --prod
```

或在 Vercel Dashboard 中点击 "Redeploy"。

---

## 📝 使用建议

### 1. 验证真实价格

虽然使用了真实价格，但仍建议：
- 在券商平台验证期权价格
- 检查 Bid/Ask 价差
- 确认流动性充足

### 2. 监控 API 限额

- 查看 Vercel Functions 日志
- 监控 429 错误
- 必要时增加缓存时间

### 3. 测试不同股票

- 高流动性：SPY, QQQ, AAPL
- 中等流动性：TSLA, NVDA, MSFT
- 低流动性：小盘股（可能没有期权数据）

---

## 🎯 下一步计划

### V2.1（计划中）

- [ ] 添加更多技术指标（MACD, RSI, KD）
- [ ] 实现 IV Rank 历史计算
- [ ] 增强财报日期过滤
- [ ] 添加用户认证

### V3.0（未来）

- [ ] 实时期权链更新（WebSocket）
- [ ] 高级策略（比率价差、铁蝴蝶）
- [ ] 回测功能
- [ ] 移动端 App

---

## 📞 支持

如有问题或建议，请：
1. 检查 Vercel Functions 日志
2. 验证环境变量配置
3. 查看浏览器控制台错误

---

**V2.0 已准备就绪！** 🚀📈

