# Markee - Decentralized Fundraising Platform

A web3 platform that allows users to create embeddable fundraising messages that can be edited by anyone willing to pay an increasing price.

## 🚀 Features

- **Multi-chain Support**: Deploy on Ethereum, Optimism, Arbitrum, Polygon, Base, Gnosis Chain, and Celo
- **Dynamic Pricing**: Price increases when someone pays to edit, then decreases over time
- **Global Messages**: Optional platform-wide messages that override individual marquees
- **Embeddable Widgets**: Easy-to-embed JavaScript widgets for any website
- **Analytics Dashboard**: Track funds raised, contributors, and message changes

## 🏗️ Architecture

### Smart Contracts
- **MarqueeFactory.sol**: Creates and manages individual marquees
- **Marquee.sol**: Individual message contract with pricing and analytics
- **DynamicPricingModule.sol**: Handles dynamic pricing logic

### Frontend
- **Next.js Dashboard**: Creator interface for managing marquees
- **Embeddable Widget**: Widget for external websites

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/Public-Marquee/markee.git
cd markee

# Install dependencies
npm install

# Start development
npm run dev
📄 License
MIT License

**To save and exit nano:**
1. Press `Ctrl + X`
2. Press `Y` (to confirm you want to save)
3. Press `Enter` (to confirm the filename)

---

**✅ Next, let's create the root package.json:**

```bash
# Create the root package.json
nano package.json
# Markee - Decentralized Fundraising Platform

A web3 platform that allows users to create embeddable fundraising messages that can be edited by anyone willing to pay an increasing price.

## 🚀 Features

- **Multi-chain Support**: Deploy on Ethereum, Optimism, Arbitrum, Polygon, Base, Gnosis Chain, and Celo
- **Dynamic Pricing**: Price increases when someone pays to edit, then decreases over time
- **Global Messages**: Optional platform-wide messages that override individual marquees
- **Embeddable Widgets**: Easy-to-embed JavaScript widgets for any website
- **Analytics Dashboard**: Track funds raised, contributors, and message changes

## 🏗️ Architecture

### Smart Contracts
- **MarqueeFactory.sol**: Creates and manages individual marquees
- **Marquee.sol**: Individual message contract with pricing and analytics
- **DynamicPricingModule.sol**: Handles dynamic pricing logic

### Frontend
- **Next.js Dashboard**: Creator interface for managing marquees
- **Embeddable Widget**: Widget for external websites

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/Public-Marquee/markee.git
cd markee

# Install dependencies
npm install

# Start development
npm run dev
