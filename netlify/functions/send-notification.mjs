const ADMIN_EMAIL = "shadowsid71@gmail.com";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405 }
    );
  }

  const secret = Netlify.env.get("LUMEX_WEBHOOK_SECRET");
  const suppliedSecret = request.headers.get(
    "x-lumex-webhook-secret"
  );

  if (!secret || suppliedSecret !== secret) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const apiKey = Netlify.env.get("RESEND_API_KEY");
  const from = Netlify.env.get("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    return Response.json(
      { error: "Email configuration is incomplete" },
      { status: 500 }
    );
  }

  try {
    const payload = await request.json();
    const record = payload.record;

    if (
      payload.type !== "INSERT" ||
      payload.table !== "admin_notifications" ||
      !record
    ) {
      return Response.json(
        { error: "Invalid notification event" },
        { status: 400 }
      );
    }

    const details = record.details || {};

    const eventNames = {
      wallet_added: "New wallet added",
      wallet_changed: "Wallet updated",
      post_submitted: "New campaign post submitted"
    };

    const subject = eventNames[record.event_type];

    if (!subject) {
      return Response.json(
        { error: "Unsupported event" },
        { status: 400 }
      );
    }

    const rows = Object.entries(details)
      .map(([key, value]) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd">
            <strong>${escapeHtml(key)}</strong>
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd">
            ${escapeHtml(value)}
          </td>
        </tr>
      `)
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#16a36a">Lumexol Admin Notification</h2>
        <p>A new activity has occurred on Lumexol.</p>
        <h3>${escapeHtml(subject)}</h3>
        <p>${escapeHtml(record.title || "")}</p>

        <table style="width:100%;border-collapse:collapse">
          ${rows}
        </table>

        <p style="color:#777;font-size:12px">
          Lumexol automated notification.
        </p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lumex-notification-${record.id}`
      },
      body: JSON.stringify({
        from,
        to: [ADMIN_EMAIL],
        subject: `Lumexol: ${subject}`,
        html
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend error:", result);

      return Response.json(
        { error: "Email delivery failed" },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: "Admin notification email sent"
    });

  } catch (error) {
    console.error("Notification error:", error);

    return Response.json(
      { error: "Notification processing failed" },
      { status: 500 }
    );
  }
};
