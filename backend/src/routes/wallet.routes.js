const router = require("express").Router();
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/expert.controller");

router.use(authenticate);
router.get("/", controller.getWallet);
router.post("/demo-topup", controller.demoTopup);

module.exports = router;
