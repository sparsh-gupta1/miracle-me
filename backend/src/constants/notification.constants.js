const getDisplayName = (name) => {
  if (!name || name === "null" || name === "undefined") return "Anonymous user";
  return name;
};

module.exports = {
  PUSH: {
    INCOMING_REQUEST: {
      TITLE: (serviceType) => {
        if (serviceType === "chat") return "Chat Request";
        if (serviceType === "video_call" || serviceType === "video") return "Incoming Video Call";
        if (serviceType === "audio_call" || serviceType === "audio") return "Incoming Audio Call";
        return "Incoming Request";
      },
      BODY: (callerName, serviceType) => {
        if (serviceType === "chat") return `${getDisplayName(callerName)} wants to connect with you.`;
        if (serviceType === "video_call" || serviceType === "video") return `${getDisplayName(callerName)} is requesting a video call...`;
        if (serviceType === "audio_call" || serviceType === "audio") return `${getDisplayName(callerName)} is requesting an audio call...`;
        return `${getDisplayName(callerName)} wants to connect with you.`;
      },
    },
    MISSED_REQUEST: {
      TITLE: (serviceType) => {
        if (serviceType === "chat") return "Missed Chat Request";
        if (serviceType === "video_call" || serviceType === "video") return "Missed Video Call";
        if (serviceType === "audio_call" || serviceType === "audio") return "Missed Audio Call";
        return "Missed Request";
      },
      BODY: (callerName, serviceType) => {
        if (serviceType === "chat") return `You missed a chat request from ${getDisplayName(callerName)}.`;
        return `You missed a call from ${getDisplayName(callerName)}.`;
      },
    },
    RECHARGE_REQUIRED: {
      TITLE: "Recharge Required",
      BODY: (callerName, serviceType) => {
        const typeStr = serviceType === "chat" ? "chat with you" : "call you";
        return `${getDisplayName(callerName)} is trying to ${typeStr}. Please recharge your wallet to connect!`;
      },
    },
    NEW_MESSAGE: {
      TITLE: "New Message",
      BODY: (senderName) => `${getDisplayName(senderName)} wants to connect with you.`,
    }
  },
  CHAT: {
    MEDIA_IMAGE: "📷 Image",
    MEDIA_VIDEO: "🎥 Video",
    MEDIA_VOICE: "🎵 Voice message",
  }
};
