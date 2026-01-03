import fetch from "node-fetch";

let cachedToken = null;
let cachedTokenExpiry = 0;

function getBaseUrl() {
  return process.env.HHAX_BASE_URL || "https://api.hhax.example";
}

function getAuthConfig() {
  return {
    clientId: process.env.HHAX_CLIENT_ID,
    clientSecret: process.env.HHAX_CLIENT_SECRET,
    scope: process.env.HHAX_SCOPE || "evv",
  };
}

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiry > now + 60 * 1000) {
    return cachedToken;
  }

  const { clientId, clientSecret, scope } = getAuthConfig();
  const response = await fetch(`${getBaseUrl()}/identity/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId || "",
      client_secret: clientSecret || "",
      scope,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HHAX token request failed: ${response.status} ${message}`);
  }

  const payload = await response.json();
  cachedToken = payload.access_token;
  cachedTokenExpiry = now + (payload.expires_in || 1800) * 1000;
  return cachedToken;
}

async function requestWithToken(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`HHAX request failed: ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function submitCaregiver(caregiverPayload) {
  return requestWithToken("/evv/caregivers", {
    method: "POST",
    body: JSON.stringify(caregiverPayload),
  });
}

export async function submitVisit(visitPayload) {
  return requestWithToken("/evv/visits", {
    method: "POST",
    body: JSON.stringify(visitPayload),
  });
}

export async function pollTransactionStatus(transactionId) {
  return requestWithToken(`/evv/transactions/${transactionId}`, {
    method: "GET",
  });
}
