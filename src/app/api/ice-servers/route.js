export async function POST() {
  const CLOUDFLARE_TURN_KEY_ID = process.env.CLOUDFLARE_TURN_KEY_ID;
  const CLOUDFLARE_TURN_API_TOKEN = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!CLOUDFLARE_TURN_KEY_ID || !CLOUDFLARE_TURN_API_TOKEN) {
    console.error("Missing Cloudflare credentials in environment variables");
    return Response.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    console.log(`[ICE-API] Fetching ICE servers from Cloudflare...`);

    const cloudflareResponse = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }), // 24 hours TTL
      }
    );

    if (!cloudflareResponse.ok) {
      const errorText = await cloudflareResponse.text();
      console.error(
        "[ICE-API] Cloudflare API error:",
        cloudflareResponse.status,
        errorText
      );
      return Response.json(
        { error: "Failed to fetch ICE servers" },
        { status: cloudflareResponse.status }
      );
    }

    const data = await cloudflareResponse.json();
    console.log(
      `[ICE-API] Successfully fetched ${
        data.iceServers?.length || 0
      } ICE servers`
    );

    return Response.json(data, { status: 200 });
  } catch (error) {
    console.error("[ICE-API] Error fetching ICE servers:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
