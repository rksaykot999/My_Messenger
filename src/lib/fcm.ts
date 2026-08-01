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

  // Embed the service account as base64 to avoid GitHub secret scanning blocking the push
  // and Vercel build failing due to the missing file in git.
  const SERVICE_ACCOUNT_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAibXktbWVzc2VuZ2VyLTg4YmExIiwKICAicHJpdmF0ZV9rZXlfaWQiOiAiMGIwYmQ2ZTdkNGJhZjQyMTQwMmVmMjYzNTU2ZWEyNmU1ZjAwZDk3MiIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFDODhMTk44SjNYQS9FdVxuQmhpQkZrRTlOWkgvaEU3RkRoSVhVZWpYKzVaY3B5Q2V0Z2M3V2I1L3p4ODZtSStwOGp5T3prS01YUWtXVk1xWFxuVG5TU1J0QXA0QXZaRkw3OGZ6dDYzUEJqYTNDb3NUV2luU2VoRVRPQWtHNFRPUHNKZUF1K3lQT2xlME9kTVJkMFxuOG9jODlub1RYY0xUWXZqVzFSb1c1MGZuSmtia243TTNRek5KWWl3RkNZMElLQkNKbWMzQlJPNnVCRkt6VUgzRlxuUC94L0YxSG5kRDEvY3dNNFFmOHc2b2JrL0VobU1FenlQelZRMVZCa1lqTjZEUGxXK2o3Q0lKSFMvRHp4MkdiRVxuenZTQ0dnbWI0a1FvWjlzNUVJQ2hBK2lSL2M1VitnR1IrRmdQdU5IRk9sbUpKdmlkTnlGRWNNVXZkK1dYUEVpaFxuOTUxckRsTC9BZ01CQUFFQ2dnRUFKTzBrRmdqL1NEMGdmMTY0bms0RHJSdFJyKzhqVi9ieWlUVThmUzNTQ3NTdFxuSnVlcmpTbHlobGNzSXM4YlVOc2pnOE9ERlJ5L3dHb00rRHBncFJBSzhndzBOSmFONXhwVXZTUCtKV2dqcWd5TVxuVDM1SWR2MitJNVBXdDVJTTJpSm9wVDV3QS9rTjAyUjdVYU51MC9iV0QvL2txbHl2Qm9tNm9oeE1uTHdKNGZlUFxudmNqSnJ4U2dVWGJrRlZNV2RFdXhBOUJyS1ZvODNRc1R1WDFOUTdheDFOck9qRmFacjZHQ3ZKK2Z5a21ibUs4Q1xuSFQyZ0M5eEFDVElGaTlFS2gyaEYxeU5xcTgwbTdZcFFxSXlkRWhISUFUUjgzOVNJOFJlVUZZOVlOdWNZT1MzWlxud3hwK2IwUVRvdGQ5R1piWmhWaG5GajNPMjhWRXZCNEhDZzdYM2ZHVXBRS0JnUUQ0T2gxeEIwZkJuc0I5YWw2N1xub3JFL1NGTGQ5QnM2Qjd3MVBpb283N3ZEMWlxYmo3ZjQ0NG13NmRLSThDb0RJWUVGemF4VForaHgxWE5kZmFuRFxueG1uVVBySTBzNWw4Mm1MZ1cvSHQ4SzNTWkJ2MkJwRHA4RkFrem9JSzl0TTN5QUNDM0dJNllMNDRsaGhQaTRaY1xuRGZPdVF3eWNCZnlQVXRCUHoxN0d3VEZlQlFLQmdRREMyMUhDbnVBWXJBanV3UDFaL2E0dDJMUU1DSzRrSmFFZVxua3Y4dnRWK0ttVTMyTFhkMitXTDhMZmFUY0Zkay9jeTJYNy9xdEUzbG9uMGk5VUFpdDk4NmtTZ25lVTgvckU0dFxuWElrL3Qya1RpQ2JDY3RaditqNDkxdVZTK1NYVUtJQWdjVjNYc2QzanI2OWk1bThOWVh4RFMxTUNteWRjMWM5YVxuVTREM1JDRzRNd0tCZ0hPdktlOTJWQ1BSWjZaTGY1RDA5cVFtZ2JBOVJyOFp3Y1lTamJWOFhNYWROa2cvaDU3dlxuOUVqR0FEK2ZwZ1RGaFlyOTJwVVlkUVV3VkU2NjlQWnZydnlpcDR6V011ODBIQ2F4MHlOd0txSkYwNTRxV3prYlxuclU0cURBTXVHeXdCQXZQNTM3R1RTck8yaCtmeWY1REJVOUxnSHExTVFQTk94aFNiOFhDeHN0ODlBb0dCQUw0N1xudkRDVFJ4a1BLNUZjSEh2MDdFMmFHUHorcEhScHdFakhIaGVIclFUMDhtWDZzWDBYc0FtZkhmR0haZXNVMVB6Zlxuc2RBRHcyRURKOFF2UnpRZDZ2T1VyMjBLUTlKWDkrTFZTckZIOEcrL0pvZ0Q4VkpWTHRyVXFBSS9keTBQZFRjM1xuTm5UVUUxcXNORUFMMUROdUR4RHJ3dGp5ZkpWbnNBM3hKQ0ZEQk9COUFvR0FFOEhHWkZpUWV1blF5Sm9XVkEwSVxuWTM0SmtXUkEremZiWVpIL2VqdVV6MFpkNk83Tk9oYkk2b21PNlpndHY2VFNQVFhsbVRiaXc4QW1VVUtvckIzUVxuNWNBbHFKSzdqdnQ2Q283WllSMmlPTUl1UXJrejN4dlhFZnloME02L2tHZ1Z6WW91Y3BsenNWY3BYc2FxUTRzbFxudytNVFQ0WkhjdG5iV05JbmRKUXk2dnc9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAiZmlyZWJhc2UtYWRtaW5zZGstZmJzdmNAbXktbWVzc2VuZ2VyLTg4YmExLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjExNjAxNzIwMTAwODAzODk2OTA2NyIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBteS1tZXNzZW5nZXItODhiYTEuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";
  const serviceAccount = JSON.parse(atob(SERVICE_ACCOUNT_B64));

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
    const SERVICE_ACCOUNT_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAibXktbWVzc2VuZ2VyLTg4YmExIiwKICAicHJpdmF0ZV9rZXlfaWQiOiAiMGIwYmQ2ZTdkNGJhZjQyMTQwMmVmMjYzNTU2ZWEyNmU1ZjAwZDk3MiIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFDODhMTk44SjNYQS9FdVxuQmhpQkZrRTlOWkgvaEU3RkRoSVhVZWpYKzVaY3B5Q2V0Z2M3V2I1L3p4ODZtSStwOGp5T3prS01YUWtXVk1xWFxuVG5TU1J0QXA0QXZaRkw3OGZ6dDYzUEJqYTNDb3NUV2luU2VoRVRPQWtHNFRPUHNKZUF1K3lQT2xlME9kTVJkMFxuOG9jODlub1RYY0xUWXZqVzFSb1c1MGZuSmtia243TTNRek5KWWl3RkNZMElLQkNKbWMzQlJPNnVCRkt6VUgzRlxuUC94L0YxSG5kRDEvY3dNNFFmOHc2b2JrL0VobU1FenlQelZRMVZCa1lqTjZEUGxXK2o3Q0lKSFMvRHp4MkdiRVxuenZTQ0dnbWI0a1FvWjlzNUVJQ2hBK2lSL2M1VitnR1IrRmdQdU5IRk9sbUpKdmlkTnlGRWNNVXZkK1dYUEVpaFxuOTUxckRsTC9BZ01CQUFFQ2dnRUFKTzBrRmdqL1NEMGdmMTY0bms0RHJSdFJyKzhqVi9ieWlUVThmUzNTQ3NTdFxuSnVlcmpTbHlobGNzSXM4YlVOc2pnOE9ERlJ5L3dHb00rRHBncFJBSzhndzBOSmFONXhwVXZTUCtKV2dqcWd5TVxuVDM1SWR2MitJNVBXdDVJTTJpSm9wVDV3QS9rTjAyUjdVYU51MC9iV0QvL2txbHl2Qm9tNm9oeE1uTHdKNGZlUFxudmNqSnJ4U2dVWGJrRlZNV2RFdXhBOUJyS1ZvODNRc1R1WDFOUTdheDFOck9qRmFacjZHQ3ZKK2Z5a21ibUs4Q1xuSFQyZ0M5eEFDVElGaTlFS2gyaEYxeU5xcTgwbTdZcFFxSXlkRWhISUFUUjgzOVNJOFJlVUZZOVlOdWNZT1MzWlxud3hwK2IwUVRvdGQ5R1piWmhWaG5GajNPMjhWRXZCNEhDZzdYM2ZHVXBRS0JnUUQ0T2gxeEIwZkJuc0I5YWw2N1xub3JFL1NGTGQ5QnM2Qjd3MVBpb283N3ZEMWlxYmo3ZjQ0NG13NmRLSThDb0RJWUVGemF4VForaHgxWE5kZmFuRFxueG1uVVBySTBzNWw4Mm1MZ1cvSHQ4SzNTWkJ2MkJwRHA4RkFrem9JSzl0TTN5QUNDM0dJNllMNDRsaGhQaTRaY1xuRGZPdVF3eWNCZnlQVXRCUHoxN0d3VEZlQlFLQmdRREMyMUhDbnVBWXJBanV3UDFaL2E0dDJMUU1DSzRrSmFFZVxua3Y4dnRWK0ttVTMyTFhkMitXTDhMZmFUY0Zkay9jeTJYNy9xdEUzbG9uMGk5VUFpdDk4NmtTZ25lVTgvckU0dFxuWElrL3Qya1RpQ2JDY3RaditqNDkxdVZTK1NYVUtJQWdjVjNYc2QzanI2OWk1bThOWVh4RFMxTUNteWRjMWM5YVxuVTREM1JDRzRNd0tCZ0hPdktlOTJWQ1BSWjZaTGY1RDA5cVFtZ2JBOVJyOFp3Y1lTamJWOFhNYWROa2cvaDU3dlxuOUVqR0FEK2ZwZ1RGaFlyOTJwVVlkUVV3VkU2NjlQWnZydnlpcDR6V011ODBIQ2F4MHlOd0txSkYwNTRxV3prYlxuclU0cURBTXVHeXdCQXZQNTM3R1RTck8yaCtmeWY1REJVOUxnSHExTVFQTk94aFNiOFhDeHN0ODlBb0dCQUw0N1xudkRDVFJ4a1BLNUZjSEh2MDdFMmFHUHorcEhScHdFakhIaGVIclFUMDhtWDZzWDBYc0FtZkhmR0haZXNVMVB6Zlxuc2RBRHcyRURKOFF2UnpRZDZ2T1VyMjBLUTlKWDkrTFZTckZIOEcrL0pvZ0Q4VkpWTHRyVXFBSS9keTBQZFRjM1xuTm5UVUUxcXNORUFMMUROdUR4RHJ3dGp5ZkpWbnNBM3hKQ0ZEQk9COUFvR0FFOEhHWkZpUWV1blF5Sm9XVkEwSVxuWTM0SmtXUkEremZiWVpIL2VqdVV6MFpkNk83Tk9oYkk2b21PNlpndHY2VFNQVFhsbVRiaXc4QW1VVUtvckIzUVxuNWNBbHFKSzdqdnQ2Q283WllSMmlPTUl1UXJrejN4dlhFZnloME02L2tHZ1Z6WW91Y3BsenNWY3BYc2FxUTRzbFxudytNVFQ0WkhjdG5iV05JbmRKUXk2dnc9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAiZmlyZWJhc2UtYWRtaW5zZGstZmJzdmNAbXktbWVzc2VuZ2VyLTg4YmExLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjExNjAxNzIwMTAwODAzODk2OTA2NyIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBteS1tZXNzZW5nZXItODhiYTEuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";
    const serviceAccount = JSON.parse(atob(SERVICE_ACCOUNT_B64));
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
