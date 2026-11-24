const { sequelize } = require("../src/models");

async function checkColumnType() {
    try {
        const [results] = await sequelize.query(
            "SELECT column_name, data_type, udt_name " +
            "FROM information_schema.columns " +
            "WHERE table_name = 'messages' AND column_name = 'messageType'"
        );
        console.log("Column type for messages.messageType:");
        console.table(results);
        process.exit(0);
    } catch (error) {
        console.error("Error checking column type:", error);
        process.exit(1);
    }
}

checkColumnType();
