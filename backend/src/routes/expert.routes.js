const router = require("express").Router();
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/expert.controller");

router.use(authenticate);
router.get("/", controller.listExperts);
router.get("/:id", controller.getExpert);
router.get("/:id/quote", controller.getQuote);

module.exports = router;
