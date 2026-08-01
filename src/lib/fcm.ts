import { SignJWT, importPKCS8 } from 'jose';

// Keep track of token and its expiration (cache it to avoid signing a new JWT every time)
let cachedToken: string | null = null;
let tokenExpiration: number = 0;

/**
 * Generates an OAuth2 Access Token for Firebase Cloud Messaging
 * using the embedded Service Account credentials.
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if valid (give a 1 minute buffer)
  if (cachedToken && Date.now() < tokenExpiration - 60000) {
    return cachedToken;
  }

  // Import the service account dynamically so it doesn't break if the file is missing
  // or being loaded in environments that shouldn't read it.
  const serviceAccount = (await import('./service-account.json')).default;

  const { client_email, private_key } = serviceAccount;
  const privateKey = await importPKCS8(private_key, 'RS256');

  const jwt = await new SignJWT({
    iss: client_email,
    sub: client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h') // Token valid for 1 hour
    .sign(privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiration = Date.now() + 50 * 60 * 1000; // Cache for 50 minutes
    return cachedToken as string;
  } else {
    throw new Error('Failed to obtain FCM access token: ' + JSON.stringify(data));
  }
}

/**
 * Sends a push notification directly to a device using the FCM HTTP v1 API.
 * 
 * WARNING: This is executed on the client side using an embedded Service Account key.
 * This should ONLY be used in personal projects where security is not a concern, 
 * as the private key is exposed in the frontend bundle.
 */
export async function sendDirectPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  dataPayload: Record<string, string> = {}
) {
  if (!fcmToken) return;

  try {
    const accessToken = await getAccessToken();
    const serviceAccount = (await import('./service-account.json')).default;
    const projectId = serviceAccount.project_id;

    const message = {
      message: {
        token: fcmToken,
        notification: {
          title,
          body,
          image: dataPayload.senderPhoto || undefined, // Display sender photo in notification body (Android 10+)
        },
        data: {
          ...dataPayload,
          click_action: "FLUTTER_NOTIFICATION_CLICK", // Standard for some plugins, but good for visibility
          senderPhoto: dataPayload.senderPhoto || "",
        },
        android: {
          priority: 'high',
          ttl: '86400s', // 24 hours
          notification: {
            icon: 'ic_stat_message',
            color: '#0f172a',
            default_sound: true,
            channel_id: 'messages',
            priority: 'high',
            visibility: 'public',
            notification_priority: 'PRIORITY_HIGH',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      },
    };

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('FCM Direct Send Failed:', errorText);
    } else {
      console.log('FCM Notification sent successfully to:', fcmToken);
    }
  } catch (error) {
    console.error('Error in sendDirectPushNotification:', error);
  }
}
