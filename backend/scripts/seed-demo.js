/**
 * Idempotent demo data: admin, experts, pricing, free minutes, commissions,
 * intro video and a demo customer (9999999999) with ₹150.
 * Run after migrations: npm run seed:demo
 */
require("dotenv").config();
const crypto = require("crypto");
const { Database } = require("../src/config");

const EXPERTS = [
  { mobile: "9000000001", name: "Acharya Keshav", role: "astrologer", gender: "male", rating: 4.8, reviews: 1240, exp: 12, languages: ["English", "Hindi"],
    specialty: "Vedic Astrology", headline: "Vedic Astrologer & Kundli Specialist",
    about: "Over 12 years of experience in Vedic Jyotish, Kundli matching, and Prashna charts. Dedicated to providing calm, authentic remedies for career and relationship crossroads.",
    specialities: ["Career", "Kundli Matching", "Vedic Remedies", "Prashna"],
    review: { author: "R.K.", when: "2 days ago", text: "Very calm, insightful guidance on my job transition. Accurate analysis.", rating: 4.8 },
    price: { chat: 10, audio: 15, video: 25 } },
  { mobile: "9000000002", name: "Pt. Ramesh Gopal", role: "astrologer", gender: "male", rating: 4.9, reviews: 2110, exp: 15, languages: ["English", "Hindi"],
    specialty: "Tarot Specialist", headline: "Tarot & Numerology Specialist", video: false,
    about: "Certified Tarot Master and Numerologist with deep practice in life guidance, career transitions, and decision clarity.",
    specialities: ["Tarot", "Numerology", "Career"],
    review: { author: "M.S.", when: "Yesterday", text: "Direct answers and very uplifting consultation.", rating: 4.9 },
    price: { chat: 12, audio: 18, video: 30 } },
  { mobile: "9000000003", name: "Priya Sharma", role: "listener", gender: "female", rating: 4.8, reviews: 640, exp: 4, languages: ["English", "Hindi"],
    specialty: "Listener", headline: "Empathetic Listener",
    about: "A warm, non-judgemental ear for stress, loneliness and everyday worries.",
    specialities: ["Stress", "Relationships", "Loneliness"],
    review: { author: "A.T.", when: "3 days ago", text: "Felt heard for the first time in weeks.", rating: 5 },
    price: { chat: 8, audio: 12, video: 18 } },
  { mobile: "9000000004", name: "Sunita Mehra", role: "astrologer", gender: "female", rating: 4.7, reviews: 510, exp: 8, languages: ["English", "Hindi", "Gujarati"],
    specialty: "Tarot Reader", headline: "Tarot Reader & Love Guidance", manualBusy: true,
    about: "Intuitive tarot reader focusing on love, family and emotional clarity.",
    specialities: ["Love", "Family", "Tarot"],
    review: { author: "P.D.", when: "1 week ago", text: "Gentle and accurate reading.", rating: 4.7 },
    price: { chat: 14, audio: 20, video: 32 } },
  { mobile: "9000000005", name: "Dr. Lakshmi Iyer", role: "astrologer", gender: "female", rating: 4.9, reviews: 1780, exp: 20, languages: ["English", "Tamil"],
    specialty: "Vedic Astrology", headline: "Senior Jyotish Acharya", manualOffline: true,
    about: "Two decades of Vedic astrology practice with a focus on health and family harmony.",
    specialities: ["Health", "Family", "Vedic Remedies"],
    review: { author: "S.V.", when: "5 days ago", text: "Deep knowledge, very reassuring.", rating: 4.9 },
    price: { chat: 20, audio: 30, video: 40 } },
  { mobile: "9000000006", name: "Rohan Verma", role: "listener", gender: "male", rating: 4.5, reviews: 220, exp: 2, languages: ["English", "Hindi"],
    specialty: "Listener", headline: "Friendly Listener",
    about: "Here to listen — career pressure, breakups, or just a bad day.",
    specialities: ["Career", "Breakups"], price: { chat: 8, audio: 12, video: 18 } },
  { mobile: "9000000007", name: "Meera Nair", role: "listener", gender: "female", rating: 4.6, reviews: 380, exp: 6, languages: ["English", "Malayalam", "Tamil"],
    specialty: "Listener", headline: "Calm Listener", about: "Soft-spoken and patient, available for evening conversations.",
    specialities: ["Anxiety", "Family"], price: { chat: 9, audio: 13, video: 19 } },
  { mobile: "9000000008", name: "Pt. Devendra Joshi", role: "astrologer", gender: "male", rating: 4.6, reviews: 905, exp: 25, languages: ["Hindi", "English"],
    specialty: "Vastu & Numerology", headline: "Vastu Shastra & Numerology Expert",
    about: "Vastu consultations for homes and workplaces, plus numerology-based name and date guidance.",
    specialities: ["Vastu", "Numerology", "Business"], price: { chat: 16, audio: 24, video: 36 } },
];

const SERVICES = { chat: "chat", audio: "audio_call", video: "video_call" };

(async () => {
  await Database.testConnection();
  await Database.initModels();
  const { User, AstrologerCustomPricing, ListenerCustomPricing, Commission, IntroVideo } = require("../src/models");
  const walletService = require("../src/services/wallet.service");
  const pricingService = require("../src/services/pricing.service");
  const freeMinutes = require("../src/services/freeMinutes.service");

  const [admin] = await User.findOrCreate({
    where: { email: "admin@miracleme.app" },
    defaults: { role: "admin", name: "Admin", password: "admin12345", isVerified: true },
  });

  for (const e of EXPERTS) {
    const fields = {
      name: e.name, role: e.role, rating: e.rating, language: e.languages, isVerified: true, isActive: true,
      isVideoCallAvailable: e.video !== false, manualOffline: !!e.manualOffline, isManualBusy: !!e.manualBusy,
      profile: {
        gender: e.gender, experienceYears: e.exp, reviewCount: e.reviews, specialty: e.specialty, headline: e.headline,
        about: e.about, specialities: e.specialities, featuredReview: e.review || null,
      },
    };
    const [user] = await User.findOrCreate({ where: { mobileNumber: e.mobile, isActive: true }, defaults: fields });
    await user.update(fields);
    await walletService.ensureUserWallets(user.id, user.role);

    for (const [name, type] of Object.entries(SERVICES)) {
      const where = e.role === "astrologer" ? { astrologerId: user.id, serviceType: type, userId: null } : { listenerId: user.id, serviceType: type };
      const Model = e.role === "astrologer" ? AstrologerCustomPricing : ListenerCustomPricing;
      const [row] = await Model.findOrCreate({ where, defaults: { ...where, pricePerMinute: e.price[name], isActive: true } });
      await row.update({ pricePerMinute: e.price[name], isActive: true });
    }
  }

  for (const [name, type] of Object.entries(SERVICES)) {
    await pricingService.createListenerGlobalPricing({ serviceType: type, pricePerMinute: { chat: 8, audio: 12, video: 18 }[name] }, admin.id);
    for (const role of ["listener", "astrologer"]) {
      const [row] = await Commission.findOrCreate({
        where: { role, serviceType: type, isActive: true },
        defaults: { role, serviceType: type, commissionPercentage: 20, effectiveFrom: new Date(), createdBy: admin.id, isActive: true },
      });
    }
  }

  for (const [type, minutes] of [["chat", 5], ["audio_call", 3], ["video_call", 2]]) {
    await freeMinutes.setFreeMinutesConfig(type, minutes, admin.id);
  }

  if (!(await IntroVideo.findOne({ where: { isActive: true } }))) {
    await IntroVideo.create({
      title: "Welcome to Miracle Me", description: "A quick tour of how Miracle Me works.",
      s3Key: "demo/intro.mp4", s3Url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      mimeType: "video/mp4", fileSize: 0, isActive: true, uploadedBy: admin.id,
    });
  }

  const [customer] = await User.findOrCreate({
    where: { mobileNumber: "9999999999", isActive: true },
    defaults: { role: "user", name: "Demo Customer", isVerified: true },
  });
  await walletService.ensureUserWallets(customer.id, "user");
  const balance = await walletService.getWalletBalance(customer.id);
  if (balance < 150) {
    await walletService.creditWallet(customer.id, 150 - balance, "recharge", crypto.randomUUID(), "Demo seed balance");
  }

  // Demo history for the Chats tab (only when the customer has none yet).
  const { Chat, Message } = require("../src/models");
  const { Op } = require("sequelize");
  if ((await Chat.count({ where: { [Op.or]: [{ participant1Id: customer.id }, { participant2Id: customer.id }] } })) === 0) {
    const byPhone = async (m) => (await User.findOne({ where: { mobileNumber: m, isActive: true } })).id;
    const [keshav, ramesh, priya] = await Promise.all([byPhone("9000000001"), byPhone("9000000002"), byPhone("9000000003")]);
    const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
    const past = (expert, serviceType, minutes, hoursAgo) => Chat.create({
      participant1Id: customer.id, participant2Id: expert, serviceType, status: "ended",
      startedAt: ago(hoursAgo), endedAt: new Date(ago(hoursAgo).getTime() + minutes * 60000),
      durationSeconds: minutes * 60, lastMessageAt: ago(hoursAgo),
    });
    await past(priya, "audio_call", 12, 20);
    await past(keshav, "chat", 18, 30);
    const thread = await Chat.create({ participant1Id: customer.id, participant2Id: ramesh, serviceType: "chat", status: "ended", startedAt: ago(5), endedAt: ago(4.8), durationSeconds: 600, lastMessageAt: ago(4.8) });
    await Message.create({ chatId: thread.id, senderId: ramesh, receiverId: customer.id, content: "Please share your updated birth time so I can...", messageType: "text" });
  }

  console.log(`Seeded ${EXPERTS.length} experts, demo customer 9999999999 (OTP ${process.env.DEMO_OTP || "1234"}).`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
