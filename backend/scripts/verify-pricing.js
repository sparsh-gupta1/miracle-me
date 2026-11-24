const pricingService = require("../src/services/pricing.service");

async function verifyPricingOverview() {
    try {
        console.log("Fetching listener pricing overview...");
        const overview = await pricingService.getListenerPricingOverview();

        console.log("\nPricing Overview Structure:");
        for (const type in overview) {
            console.log(`\n--- ${type.toUpperCase()} ---`);
            console.log("Current:", JSON.stringify(overview[type].current, null, 2));
            console.log("Upcoming Count:", overview[type].upcoming.length);
            console.log("History Count:", overview[type].history.length);

            if (overview[type].upcoming.length > 0) {
                console.log("Next Upcoming:", JSON.stringify(overview[type].upcoming[0], null, 2));
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("Verification failed:", error);
        process.exit(1);
    }
}

verifyPricingOverview();
