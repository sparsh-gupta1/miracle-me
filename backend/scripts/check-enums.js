const { sequelize } = require("../src/models");

async function checkEnum() {
    try {
        const [results] = await sequelize.query(
            "SELECT n.nspname as enum_schema, t.typname as enum_name, e.enumlabel as enum_value " +
            "FROM pg_type t " +
            "JOIN pg_enum e ON t.oid = e.enumtypid " +
            "JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace " +
            "WHERE t.typname LIKE 'enum_%' " +
            "ORDER BY enum_name, e.enumsortorder"
        );
        console.log("Current ENUM values in database:");
        console.table(results);
        process.exit(0);
    } catch (error) {
        console.error("Error checking enum:", error);
        process.exit(1);
    }
}

checkEnum();
