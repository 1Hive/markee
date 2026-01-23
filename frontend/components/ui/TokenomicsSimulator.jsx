import React, { useState, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TokenomicsSimulator = () => {
  // Input parameters with defaults
  const [params, setParams] = useState({
    monthlySpend: 0, // Growth Fund monthly spend in USD
    initialRevenue: 0, // Initial monthly platform revenue in USD
    revenueGrowthRate: 0, // Monthly revenue growth rate (%)
    phase0Investment: 500000, // Phase 0 seed funding (first 3 months) - 0.5M
    phase1Investment: 500000, // Phase 1 seed funding (months 3-6) - 0.5M
    phase2Investment: 500000, // Phase 2 seed funding (months 6-9) - 0.5M
    phase3Investment: 500000, // Phase 3 seed funding (months 9-12) - 0.5M
    ethPrice: 3000, // ETH price in USD for calculations
  });

  // Track raw input values for decimal entry
  const [rawInputs, setRawInputs] = useState({
    phase0: '0.5',
    phase1: '0.5',
    phase2: '0.5',
    phase3: '0.5',
  });

  // Hard-coded values
  const priceIncreaseFrequency = 3; // Always 3 months (quarterly)
  const timeHorizon = 120; // Always 10 years (120 months)
  const partnerRevenuePercent = 100; // All revenue is from Platform Partners
  
  // Hard-coded price increase schedule
  const getPriceIncreaseRate = (periodNumber) => {
    if (periodNumber >= 1 && periodNumber <= 4) {
      return 100; // 100% increase for first 4 periods
    } else if (periodNumber >= 5 && periodNumber <= 12) {
      return 25; // 25% increase for next 8 periods
    } else if (periodNumber >= 13) {
      return 11.111111; // 11.111111% increase for all periods after
    }
    return 0; // No increase for period 0 (initial)
  };

  const updateParam = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  // Calculate tokenomics over time
  const simulation = useMemo(() => {
    const data = [];
    const INITIAL_SUPPLY = 50_000_000; // 50M tokens to Growth Fund
    const INITIAL_PRICE_MARKEE_PER_ETH = 100_000;
    
    let growthFundTokens = INITIAL_SUPPLY;
    let cooperativeTokens = 0;
    let platformTokens = 0;
    let customerTokens = 0;
    let seedFunderTokens = 0;
    let currentPrice = INITIAL_PRICE_MARKEE_PER_ETH;
    let treasuryBalance = 0; // Start with 0 - auto-issued tokens have no backing
    
    // Investment amounts per phase (each phase is 3 months = 1 quarter)
    const getPhaseInvestment = (month) => {
      if (month < 3) return params.phase0Investment / 3; // Phase 0: months 0-2
      if (month < 6) return params.phase1Investment / 3; // Phase 1: months 3-5
      if (month < 9) return params.phase2Investment / 3; // Phase 2: months 6-8
      if (month < 12) return params.phase3Investment / 3; // Phase 3: months 9-11
      return 0; // No investment after month 12
    };
    
    for (let month = 0; month <= timeHorizon; month++) {
      // Update price based on schedule
      if (month > 0 && month % priceIncreaseFrequency === 0) {
        const periodNumber = Math.floor(month / priceIncreaseFrequency);
        const increaseRate = getPriceIncreaseRate(periodNumber);
        currentPrice = currentPrice / (1 + increaseRate / 100);
      }
      
      // Process seed funding during first 12 months
      const monthlyInvestment = getPhaseInvestment(month);
      if (monthlyInvestment > 0) {
        const investmentInEth = monthlyInvestment / params.ethPrice;
        treasuryBalance += monthlyInvestment;
        
        const investmentTokensIssued = investmentInEth * currentPrice;
        // Seed funding has no partner allocation, same as non-partner revenue
        seedFunderTokens += investmentTokensIssued * 0.62; // 62% to seed funders
        cooperativeTokens += investmentTokensIssued * 0.38; // 38% to cooperative
      }
      
      // Calculate monthly revenue with growth
      const monthlyRevenue = params.initialRevenue * Math.pow(1 + params.revenueGrowthRate / 100, month);
      const revenueInEth = monthlyRevenue / params.ethPrice;
      
      // Revenue adds to treasury
      treasuryBalance += monthlyRevenue;
      
      // Calculate revenue split (100% platform partner)
      const partnerRevenue = revenueInEth * (partnerRevenuePercent / 100);
      const nonPartnerRevenue = revenueInEth * (1 - partnerRevenuePercent / 100);
      
      // Tokens issued from revenue
      const partnerTokensIssued = partnerRevenue * currentPrice;
      const nonPartnerTokensIssued = nonPartnerRevenue * currentPrice;
      
      // Distribute partner revenue tokens (62% customers, 25.84% platform, 12.16% coop)
      customerTokens += partnerTokensIssued * 0.62;
      platformTokens += partnerTokensIssued * 0.2584; // 68% of 38%
      cooperativeTokens += partnerTokensIssued * 0.1216; // 32% of 38%
      
      // Distribute non-partner revenue tokens (62% customers, 38% coop)
      customerTokens += nonPartnerTokensIssued * 0.62;
      cooperativeTokens += nonPartnerTokensIssued * 0.38;
      
      // Calculate total supply BEFORE redemptions
      const totalSupply = growthFundTokens + cooperativeTokens + platformTokens + customerTokens + seedFunderTokens;
      
      // Calculate Price Floor BEFORE Growth Fund redemptions
      const priceFloor = totalSupply > 0 ? treasuryBalance / totalSupply : 0;
      
      // Growth Fund redeems tokens at Price Floor to cover monthly expenses
      if (params.monthlySpend > 0 && priceFloor > 0) {
        const effectivePriceFloor = priceFloor * 0.95; // After 5% cash-out tax
        const tokensNeeded = params.monthlySpend / effectivePriceFloor;
        
        if (tokensNeeded <= growthFundTokens) {
          growthFundTokens -= tokensNeeded;
          treasuryBalance -= params.monthlySpend;
        } else {
          // Redeem all remaining Growth Fund tokens
          const maxRedemption = growthFundTokens * effectivePriceFloor;
          treasuryBalance -= maxRedemption;
          growthFundTokens = 0;
        }
      }
      
      // Recalculate total supply AFTER redemptions
      const finalTotalSupply = growthFundTokens + cooperativeTokens + platformTokens + customerTokens + seedFunderTokens;
      const priceCeiling = params.ethPrice / currentPrice; // Issuance price (what you pay to mint)
      const finalPriceFloor = finalTotalSupply > 0 ? treasuryBalance / finalTotalSupply : 0; // Redemption price (treasury backing per token)
      const marketCapAtFloor = finalPriceFloor * finalTotalSupply; // Market cap if all tokens valued at floor price
      
      data.push({
        month,
        growthFundPercent: (growthFundTokens / finalTotalSupply) * 100,
        cooperativePercent: (cooperativeTokens / finalTotalSupply) * 100,
        platformPercent: (platformTokens / finalTotalSupply) * 100,
        customerPercent: (customerTokens / finalTotalSupply) * 100,
        seedFunderPercent: (seedFunderTokens / finalTotalSupply) * 100,
        growthFundTokens,
        cooperativeTokens,
        platformTokens,
        customerTokens,
        seedFunderTokens,
        totalSupply: finalTotalSupply,
        priceCeiling,
        priceFloor: finalPriceFloor,
        treasuryValue: treasuryBalance,
        marketCapAtFloor,
        monthlyRevenue,
      });
    }
    
    return data;
  }, [params]);

  const finalMonth = simulation[simulation.length - 1];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Parameter Controls */}
        <div className="lg:col-span-4">
          {/* Parameter Controls */}
          <div className="bg-[#0F1646] rounded-xl p-6 border border-[#7C9CFF]/20">
            <h2 className="text-2xl font-bold mb-2 text-[#EDEEFF]">Configuration Parameters</h2>
            <p className="text-sm text-[#B8B6D9] mb-6">
              Revnet Issuance is pre-scheduled and locked. Use this configuration tool to simulate different revenue and expense scenarios, and see how they affect ownership and economics of the platform.
            </p>

            {/* Direct Seed Funding to Revnet Section */}
            <div className="mb-8 bg-[#1A1F4D]/50 rounded-lg p-4 border border-[#FFD93D]/20">
              <h3 className="text-base font-bold text-[#EDEEFF] mb-1">Direct Seed Funding to Revnet</h3>
              <p className="text-xs text-[#8A8FBF] mb-3">in $USD Millions </p>
              <div className="space-y-2">
                {/* Phase 0 */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#EDEEFF] w-16">
                    Phase 0
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const newVal = Math.max(0, params.phase0Investment - 100000);
                        updateParam('phase0Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase0: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rawInputs.phase0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const inputVal = e.target.value;
                        
                        // Only allow digits and one decimal point
                        if (!/^[0-9]*\.?[0-9]*$/.test(inputVal)) {
                          return; // Reject invalid characters
                        }
                        
                        // Count decimal points
                        const decimalCount = (inputVal.match(/\./g) || []).length;
                        if (decimalCount > 1) {
                          return; // Reject multiple decimal points
                        }
                        
                        // Count digits (excluding decimal point)
                        const digitCount = inputVal.replace(/[^0-9]/g, '').length;
                        
                        // Only allow if 2 or fewer digits
                        if (digitCount <= 2) {
                          setRawInputs(prev => ({ ...prev, phase0: inputVal }));
                          
                          if (inputVal === '' || inputVal === '.' || inputVal === '0.') {
                            updateParam('phase0Investment', 0);
                            return;
                          }
                          
                          const val = parseFloat(inputVal) * 1_000_000;
                          if (!isNaN(val) && val >= 0) {
                            updateParam('phase0Investment', val);
                          }
                        }
                      }}
                      onBlur={() => {
                        // Clean up display on blur
                        const val = params.phase0Investment / 1_000_000;
                        setRawInputs(prev => ({ ...prev, phase0: val.toString() }));
                      }}
                      className="w-10 px-2 py-1 bg-white border border-[#7C9CFF]/20 rounded focus:outline-none focus:border-[#7C9CFF] text-center text-sm font-semibold"
                      style={{ color: '#060A2A' }}
                    />
                    <button
                      onClick={() => {
                        const newVal = Math.min(10_000_000, params.phase0Investment + 100000);
                        updateParam('phase0Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase0: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Phase 1 */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#EDEEFF] w-16">
                    Phase 1
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const newVal = Math.max(0, params.phase1Investment - 100000);
                        updateParam('phase1Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase1: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rawInputs.phase1}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const inputVal = e.target.value;
                        
                        // Only allow digits and one decimal point
                        if (!/^[0-9]*\.?[0-9]*$/.test(inputVal)) {
                          return;
                        }
                        
                        // Count decimal points
                        const decimalCount = (inputVal.match(/\./g) || []).length;
                        if (decimalCount > 1) {
                          return;
                        }
                        
                        // Count digits (excluding decimal point)
                        const digitCount = inputVal.replace(/[^0-9]/g, '').length;
                        
                        // Only allow if 2 or fewer digits
                        if (digitCount <= 2) {
                          setRawInputs(prev => ({ ...prev, phase1: inputVal }));
                          
                          if (inputVal === '' || inputVal === '.' || inputVal === '0.') {
                            updateParam('phase1Investment', 0);
                            return;
                          }
                          
                          const val = parseFloat(inputVal) * 1_000_000;
                          if (!isNaN(val) && val >= 0) {
                            updateParam('phase1Investment', val);
                          }
                        }
                      }}
                      onBlur={() => {
                        const val = params.phase1Investment / 1_000_000;
                        setRawInputs(prev => ({ ...prev, phase1: val.toString() }));
                      }}
                      className="w-10 px-2 py-1 bg-white border border-[#7C9CFF]/20 rounded focus:outline-none focus:border-[#7C9CFF] text-center text-sm font-semibold"
                      style={{ color: '#060A2A' }}
                    />
                    <button
                      onClick={() => {
                        const newVal = Math.min(10_000_000, params.phase1Investment + 100000);
                        updateParam('phase1Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase1: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Phase 2 */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#EDEEFF] w-16">
                    Phase 2
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const newVal = Math.max(0, params.phase2Investment - 100000);
                        updateParam('phase2Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase2: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rawInputs.phase2}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const inputVal = e.target.value;
                        
                        // Only allow digits and one decimal point
                        if (!/^[0-9]*\.?[0-9]*$/.test(inputVal)) {
                          return;
                        }
                        
                        // Count decimal points
                        const decimalCount = (inputVal.match(/\./g) || []).length;
                        if (decimalCount > 1) {
                          return;
                        }
                        
                        // Count digits (excluding decimal point)
                        const digitCount = inputVal.replace(/[^0-9]/g, '').length;
                        
                        // Only allow if 2 or fewer digits
                        if (digitCount <= 2) {
                          setRawInputs(prev => ({ ...prev, phase2: inputVal }));
                          
                          if (inputVal === '' || inputVal === '.' || inputVal === '0.') {
                            updateParam('phase2Investment', 0);
                            return;
                          }
                          
                          const val = parseFloat(inputVal) * 1_000_000;
                          if (!isNaN(val) && val >= 0) {
                            updateParam('phase2Investment', val);
                          }
                        }
                      }}
                      onBlur={() => {
                        const val = params.phase2Investment / 1_000_000;
                        setRawInputs(prev => ({ ...prev, phase2: val.toString() }));
                      }}
                      className="w-10 px-2 py-1 bg-white border border-[#7C9CFF]/20 rounded focus:outline-none focus:border-[#7C9CFF] text-center text-sm font-semibold"
                      style={{ color: '#060A2A' }}
                    />
                    <button
                      onClick={() => {
                        const newVal = Math.min(10_000_000, params.phase2Investment + 100000);
                        updateParam('phase2Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase2: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Phase 3 */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#EDEEFF] w-16">
                    Phase 3
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const newVal = Math.max(0, params.phase3Investment - 100000);
                        updateParam('phase3Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase3: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rawInputs.phase3}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const inputVal = e.target.value;
                        
                        // Only allow digits and one decimal point
                        if (!/^[0-9]*\.?[0-9]*$/.test(inputVal)) {
                          return;
                        }
                        
                        // Count decimal points
                        const decimalCount = (inputVal.match(/\./g) || []).length;
                        if (decimalCount > 1) {
                          return;
                        }
                        
                        // Count digits (excluding decimal point)
                        const digitCount = inputVal.replace(/[^0-9]/g, '').length;
                        
                        // Only allow if 2 or fewer digits
                        if (digitCount <= 2) {
                          setRawInputs(prev => ({ ...prev, phase3: inputVal }));
                          
                          if (inputVal === '' || inputVal === '.' || inputVal === '0.') {
                            updateParam('phase3Investment', 0);
                            return;
                          }
                          
                          const val = parseFloat(inputVal) * 1_000_000;
                          if (!isNaN(val) && val >= 0) {
                            updateParam('phase3Investment', val);
                          }
                        }
                      }}
                      onBlur={() => {
                        const val = params.phase3Investment / 1_000_000;
                        setRawInputs(prev => ({ ...prev, phase3: val.toString() }));
                      }}
                      className="w-10 px-2 py-1 bg-white border border-[#7C9CFF]/20 rounded focus:outline-none focus:border-[#7C9CFF] text-center text-sm font-semibold"
                      style={{ color: '#060A2A' }}
                    />
                    <button
                      onClick={() => {
                        const newVal = Math.min(10_000_000, params.phase3Investment + 100000);
                        updateParam('phase3Investment', newVal);
                        setRawInputs(prev => ({ ...prev, phase3: (newVal / 1_000_000).toString() }));
                      }}
                      className="w-8 h-8 bg-[#7C9CFF] hover:bg-[#6A8AEE] text-white rounded font-bold text-lg flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                  </div>
              <div className="text-xs text-[#8A8FBF] mt-3">
                Total: ${((params.phase0Investment + params.phase1Investment + params.phase2Investment + params.phase3Investment) / 1_000_000)}M
              </div>
            </div>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Growth Fund Spending */}
          <div>
            <label className="block text-base font-semibold text-[#EDEEFF] mb-2">
              Growth Fund Monthly Spend (USD): ${params.monthlySpend.toLocaleString()}
            </label>
            <input
              type="range"
              min="0"
              max="50000"
              step="1000"
              value={params.monthlySpend}
              onChange={(e) => updateParam('monthlySpend', e.target.value)}
              className="w-full h-2 bg-[#1A1F4D] rounded-lg appearance-none cursor-pointer accent-[#7C9CFF]"
            />
          </div>

          {/* Initial Platform Revenue */}
          <div>
            <label className="block text-base font-semibold text-[#EDEEFF] mb-2">
              Initial Monthly Platform Revenue (USD): ${params.initialRevenue.toLocaleString()}
            </label>
            <input
              type="range"
              min="0"
              max="20000"
              step="500"
              value={params.initialRevenue}
              onChange={(e) => updateParam('initialRevenue', e.target.value)}
              className="w-full h-2 bg-[#1A1F4D] rounded-lg appearance-none cursor-pointer accent-[#7C9CFF]"
            />
          </div>

          {/* Revenue Growth Rate */}
          <div>
            <label className="block text-base font-semibold text-[#EDEEFF] mb-2">
              Monthly Revenue Growth Rate: {params.revenueGrowthRate}%
            </label>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={params.revenueGrowthRate}
              onChange={(e) => updateParam('revenueGrowthRate', e.target.value)}
              className="w-full h-2 bg-[#1A1F4D] rounded-lg appearance-none cursor-pointer accent-[#7C9CFF]"
            />
          </div>

          {/* ETH Price */}
          <div>
            <label className="block text-base font-semibold text-[#EDEEFF] mb-2">
              ETH Price (USD): ${params.ethPrice.toLocaleString()}
            </label>
            <input
              type="range"
              min="1000"
              max="10000"
              step="100"
              value={params.ethPrice}
              onChange={(e) => updateParam('ethPrice', e.target.value)}
              className="w-full h-2 bg-[#1A1F4D] rounded-lg appearance-none cursor-pointer accent-[#7C9CFF]"
            />
          </div>
        </div>
      </div>
        </div>

        {/* Right Column - Charts (Wider, Shorter) */}
        <div className="lg:col-span-8">
          {/* Ownership Distribution Chart */}
          <div className="bg-[#0F1646] rounded-xl p-6 mb-6 border border-[#7C9CFF]/20">
            <h3 className="text-xl font-bold mb-1 text-[#EDEEFF]">Ownership Distribution Over Time</h3>
            <p className="text-sm text-[#B8B6D9] mb-4"></p>
            
            <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={simulation}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1F4D" />
            <XAxis 
              dataKey="month" 
              stroke="#B8B6D9"
              label={{ value: 'Months', position: 'insideBottom', offset: -5, fill: '#B8B6D9' }}
            />
            <YAxis 
              stroke="#B8B6D9"
              label={{ value: 'Ownership %', angle: -90, position: 'insideLeft', fill: '#B8B6D9' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0F1646', 
                border: '1px solid #7C9CFF',
                borderRadius: '8px',
                color: '#EDEEFF'
              }}
              formatter={(value) => `${value.toFixed(2)}%`}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <Area 
              type="monotone" 
              dataKey="growthFundPercent" 
              stackId="1" 
              stroke="#FF6B6B" 
              fill="#FF6B6B" 
              name="Growth Fund"
            />
            <Area 
              type="monotone" 
              dataKey="cooperativePercent" 
              stackId="1" 
              stroke="#F897FE" 
              fill="#F897FE" 
              name="Cooperative"
            />
            <Area 
              type="monotone" 
              dataKey="platformPercent" 
              stackId="1" 
              stroke="#7C9CFF" 
              fill="#7C9CFF" 
              name="Platform Partners"
            />
            <Area 
              type="monotone" 
              dataKey="customerPercent" 
              stackId="1" 
              stroke="#4ECDC4" 
              fill="#4ECDC4" 
              name="Customers"
            />
            <Area 
              type="monotone" 
              dataKey="seedFunderPercent" 
              stackId="1" 
              stroke="#FFD93D" 
              fill="#FFD93D" 
              name="Seed Funders"
            />
          </AreaChart>
        </ResponsiveContainer>
        
        <div className="bg-[#1A1F4D]/50 rounded-lg p-3 mt-3 border border-[#7C9CFF]/20">
          <div className="text-xs text-[#B8B6D9]">
            This chart ignores token redemptions to the Revnet, which increase token floor price due to the 10% exit tax, and any token swaps outside the Revnet.
          </div>
        </div>
      </div>

          {/* Token Price Chart */}
          <div className="bg-[#0F1646] rounded-xl p-6 mb-6 border border-[#7C9CFF]/20">
            <h3 className="text-xl font-bold mb-1 text-[#EDEEFF]">Price Ceiling vs Price Floor</h3>
            <p className="text-sm text-[#B8B6D9] mb-4">Once a secondary market for MARKEE is established, token prices above the ceiling and below the floor can be arbitraged in the Revnet</p>
            
            <ResponsiveContainer width="100%" height={250}>
          <LineChart data={simulation}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1F4D" />
            <XAxis 
              dataKey="month" 
              stroke="#B8B6D9"
              label={{ value: 'Months', position: 'insideBottom', offset: -5, fill: '#B8B6D9' }}
            />
            <YAxis 
              stroke="#B8B6D9"
              label={{ value: 'Price (USD)', angle: -90, position: 'insideLeft', fill: '#B8B6D9' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0F1646', 
                border: '1px solid #7C9CFF',
                borderRadius: '8px',
                color: '#EDEEFF'
              }}
              formatter={(value) => `$${value.toFixed(4)}`}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <Line 
              type="stepAfter" 
              dataKey="priceCeiling" 
              stroke="#F897FE" 
              strokeWidth={3}
              dot={false}
              name="Price Ceiling (Issuance)"
            />
            <Line 
              type="monotone" 
              dataKey="priceFloor" 
              stroke="#4ECDC4" 
              strokeWidth={3}
              dot={false}
              name="Price Floor (Redemption)"
            />
          </LineChart>
        </ResponsiveContainer>
        
        <div className="bg-[#1A1F4D]/50 rounded-lg p-3 mt-3 border border-[#7C9CFF]/20">
          <div className="text-xs text-[#B8B6D9] space-y-1">
            <div><strong className="text-[#F897FE]">Price Ceiling:</strong> all Platform revenue goes into the Revnet at this issuance price, increasing in locked, pre-scheduled periods</div>
            <div><strong className="text-[#4ECDC4]">Price Floor:</strong> redemption price of tokens in the Revnet, equal to all revenue ÷ total supply</div>
          </div>
        </div>
      </div>

          {/* Market Cap at Price Floor Chart */}
          <div className="bg-[#0F1646] rounded-xl p-6 border border-[#7C9CFF]/20">
            <h3 className="text-xl font-bold mb-1 text-[#EDEEFF]">Market Cap at Price Floor</h3>
            <p className="text-sm text-[#B8B6D9] mb-4">Minimum market cap based on platform revenue and the redemption price</p>
            
            <ResponsiveContainer width="100%" height={250}>
          <LineChart data={simulation}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1F4D" />
            <XAxis 
              dataKey="month" 
              stroke="#B8B6D9"
              label={{ value: 'Months', position: 'insideBottom', offset: -5, fill: '#B8B6D9' }}
            />
            <YAxis 
              stroke="#7C9CFF"
              tickFormatter={(value) => {
                const maxMarketCap = Math.max(...simulation.map(d => d.marketCapAtFloor));
                if (maxMarketCap >= 1_000_000_000_000) {
                  return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
                } else if (maxMarketCap >= 1_000_000_000) {
                  return `$${(value / 1_000_000_000).toFixed(1)}B`;
                } else {
                  return `$${(value / 1_000_000).toFixed(1)}M`;
                }
              }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0F1646', 
                border: '1px solid #7C9CFF',
                borderRadius: '8px',
                color: '#EDEEFF'
              }}
              formatter={(value) => {
                const maxMarketCap = Math.max(...simulation.map(d => d.marketCapAtFloor));
                if (maxMarketCap >= 1_000_000_000_000) {
                  return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
                } else if (maxMarketCap >= 1_000_000_000) {
                  return `$${(value / 1_000_000_000).toFixed(2)}B`;
                } else {
                  return `$${(value / 1_000_000).toFixed(2)}M`;
                }
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <Line 
              type="monotone" 
              dataKey="marketCapAtFloor" 
              stroke="#7C9CFF" 
              strokeWidth={3}
              dot={false}
              name="Market Cap at Floor"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

          {/* Assumptions Note */}
          <div className="mt-8 text-center text-sm text-[#8A8FBF]">
            <p>
              Note: this is a simplified model, for educational purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenomicsSimulator;
