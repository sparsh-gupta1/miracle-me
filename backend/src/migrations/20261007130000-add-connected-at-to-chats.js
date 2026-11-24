"use strict";

// When the session actually connected: both callers joined Agora, or the listener sent the
// first reply in a chat. Billing (and free-minute consumption) is measured from here, so a
// chat the listener never answered costs nothing.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("chats", "connected_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Sessions live at deploy time were connected under the old rule; keep billing them.
    await queryInterface.sequelize.query(
      `UPDATE chats SET connected_at = started_at WHERE status = 'started' AND started_at IS NOT NULL`
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("chats", "connected_at");
  },
};
