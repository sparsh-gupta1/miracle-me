const { sequelize } = require("../config/database");

// Import models
const User = require("./user.model");
const Chat = require("./chat.model");
const Message = require("./message.model");
const ChatParticipant = require("./chatParticipant.model");
const UserMetadata = require("./userMetadata.model");
const ChatSetting = require("./chatSetting.model");
const UserBlockList = require("./userBlocklist.model");
const CallRequest = require("./callRequest.model");
const Transaction = require("./transaction.model");
const ListenerGlobalPricing = require("./listenerGlobalPricing.model");
const ListenerCustomPricing = require("./listenerCustomPricing.model");
const AstrologerCustomPricing = require("./astrologerCustomPricing.model");
const Wallet = require("./wallet.model");
const WalletTransaction = require("./walletTransaction.model");
const Ledger = require("./ledger.model");
const Commission = require("./commission.model");
const CommunicationCharge = require("./communicationCharge.model");
const DailyEarnings = require("./dailyEarnings.model");
const WithdrawalRule = require("./withdrawalRule.model");
const WithdrawalRequest = require("./withdrawalRequest.model");
const FreeMinutesConfig = require("./freeMinutesConfig.model");
const UserFreeMinutesUsage = require("./userFreeMinutesUsage.model");
const UserFavorite = require("./userFavorite.model");
const Announcement = require("./announcement.model");
const BankInfo = require("./bankInfo.model");
const IntroVideo = require("./introVideo.model");
const IntroVideoView = require("./introVideoView.model");
const ResponseWindow = require("./responseWindow.model");

const models = {
  User,
  Chat,
  Message,
  ChatParticipant,
  UserMetadata,
  ChatSetting,
  UserBlockList,
  UserFavorite,
  CallRequest,
  Transaction,
  ListenerGlobalPricing,
  ListenerCustomPricing,
  AstrologerCustomPricing,
  Wallet,
  WalletTransaction,
  Ledger,
  Commission,
  CommunicationCharge,
  DailyEarnings,
  WithdrawalRule,
  WithdrawalRequest,
  FreeMinutesConfig,
  UserFreeMinutesUsage,
  Announcement,
  BankInfo,
  IntroVideo,
  IntroVideoView,
  ResponseWindow,
};

// Initialize models with sequelize instance
Object.values(models).forEach((model) => {
  if (typeof model.initialize === "function") {
    model.initialize(sequelize);
  }
});

// Run associations
Object.values(models).forEach((model) => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

// Export all models
module.exports = {
  sequelize,
  ...models,
};
