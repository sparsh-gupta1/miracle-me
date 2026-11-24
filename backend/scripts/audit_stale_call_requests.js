require('dotenv').config();
const { Chat, CallRequest } = require('../src/models');
const { Op } = require('sequelize');

async function auditStaleCallRequests() {
  try {
    console.log("Starting audit of 'accepted' call requests...");
    
    // Find all call requests that are currently 'accepted'
    const acceptedRequests = await CallRequest.findAll({
      where: { status: 'accepted' }
    });

    console.log(`Found ${acceptedRequests.length} 'accepted' call requests.`);

    let updatedCount = 0;
    
    for (const request of acceptedRequests) {
      // Find any active chat ('started' or 'created') between these two users
      const activeChat = await Chat.findOne({
        where: {
          [Op.or]: [
            { participant1Id: request.senderId, participant2Id: request.receiverId },
            { participant1Id: request.receiverId, participant2Id: request.senderId }
          ],
          status: { [Op.in]: ['started', 'created'] }
        }
      });

      // If no active chat exists, it means the conversation is completely finished or was never started properly
      if (!activeChat) {
        await request.update({ status: 'ended' });
        updatedCount++;
      }
    }

    console.log(`Successfully migrated ${updatedCount} stale 'accepted' call requests to 'ended'.`);
  } catch (error) {
    console.error("Error during audit:", error);
  } finally {
    process.exit(0);
  }
}

auditStaleCallRequests();
