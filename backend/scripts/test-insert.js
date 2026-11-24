const { sequelize } = require("../src/models");
const { v4: uuidv4 } = require("uuid");

async function testInsert() {
    try {
        const chatId = "d625e750-8704-4786-8805-fdfee3285c23"; // From user logs
        const userId = "c5e2a08f-604d-4ce6-b35a-53d1e5f6f4d7"; // From user logs
        const receiverId = "469d3004-616f-4087-9526-b480ed0cfa82"; // From user logs

        const [result] = await sequelize.query(
            `INSERT INTO "messages" ("id", "chatId", "senderId", "receiverId", "content", "messageType", "isDelivered", "isRead", "createdAt", "updatedAt") 
       VALUES (:id, :chatId, :senderId, :receiverId, :content, :messageType, :isDelivered, :isRead, NOW(), NOW()) RETURNING id`,
            {
                replacements: {
                    id: uuidv4(),
                    chatId,
                    senderId: userId,
                    receiverId,
                    content: "test voice message",
                    messageType: "voice",
                    isDelivered: false,
                    isRead: false
                }
            }
        );
        console.log("Insert successful! ID:", result[0].id);
        process.exit(0);
    } catch (error) {
        console.error("Insert failed:", error);
        process.exit(1);
    }
}

testInsert();
