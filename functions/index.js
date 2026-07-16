const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.onNewMessage = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const chatId = context.params.chatId;

    // Get the chat document to find the other participant
    const chatSnap = await admin.firestore().doc(`chats/${chatId}`).get();
    const chatData = chatSnap.data();

    if (!chatData) return null;

    const senderId = message.senderId;
    const recipientId = chatData.participants.find(id => id !== senderId);

    if (!recipientId) return null;

    // Get the recipient's FCM token
    const userSnap = await admin.firestore().doc(`users/${recipientId}`).get();
    const userData = userSnap.data();

    if (!userData || !userData.fcmToken) {
      console.log("No FCM token found for user", recipientId);
      return null;
    }

    const payload = {
      notification: {
        title: userData.name || "New Message",
        body: message.text || "📷 Photo",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
      data: {
        chatId: chatId,
        senderId: senderId,
      },
      token: userData.fcmToken,
    };

    try {
      await admin.messaging().send(payload);
      console.log("Notification sent successfully");
    } catch (error) {
      console.error("Error sending notification:", error);
    }
    return null;
  });

exports.onNewCall = functions.firestore
  .document("calls/{callId}")
  .onCreate(async (snap, context) => {
    const callData = snap.data();

    if (callData.status !== "ringing") return null;

    const recipientId = callData.calleeId;
    const userSnap = await admin.firestore().doc(`users/${recipientId}`).get();
    const userData = userSnap.data();

    if (!userData || !userData.fcmToken) return null;

    const payload = {
      notification: {
        title: "Incoming Call",
        body: `${callData.callerName} is calling you`,
      },
      data: {
        callId: context.params.callId,
        type: callData.type,
      },
      token: userData.fcmToken,
    };

    try {
      await admin.messaging().send(payload);
    } catch (error) {
      console.error("Error sending call notification:", error);
    }
    return null;
  });
