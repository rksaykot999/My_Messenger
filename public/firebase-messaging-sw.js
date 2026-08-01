importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCcpoTsFtl6OhJCtULG4b250JxlexU1owY",
  authDomain: "my-messenger-88ba1.firebaseapp.com",
  projectId: "my-messenger-88ba1",
  storageBucket: "my-messenger-88ba1.firebasestorage.app",
  messagingSenderId: "1038574226468",
  appId: "1:1038574226468:web:56065c221d5d9d48e31cb1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Received background message ", payload);
  const notificationTitle = payload.notification?.title || "New Message";
  const notificationOptions = {
    body: payload.notification?.body || "",
    // You can add an icon here later if needed
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
