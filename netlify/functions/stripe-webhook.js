const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64");
  }

  return Buffer.from(event.body || "", "utf8");
}

function isPaidSubscriptionStatus(status) {
  return status === "active" || status === "trialing";
}

async function updateProfileByUserId({
  supabase,
  userId,
  isPro,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeSubscriptionStatus
}) {
  if (!userId) {
    console.log("No userId provided for Supabase update.");
    return;
  }

  const updatePayload = {
    is_pro: isPro,
    stripe_subscription_status: stripeSubscriptionStatus || null
  };

  if (stripeCustomerId) {
    updatePayload.stripe_customer_id = stripeCustomerId;
  }

  if (stripeSubscriptionId) {
    updatePayload.stripe_subscription_id = stripeSubscriptionId;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId);

  if (error) {
    console.error("Supabase profile update error:", error);
    throw error;
  }

  console.log("Profile updated:", {
    userId,
    isPro,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeSubscriptionStatus
  });
}

async function updateProfileByCustomerId({
  supabase,
  stripeCustomerId,
  isPro,
  stripeSubscriptionId,
  stripeSubscriptionStatus
}) {
  if (!stripeCustomerId) {
    console.log("No Stripe customer ID provided for Supabase update.");
    return;
  }

  const { data: profile, error: findError } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (findError) {
    console.error("Supabase find profile by customer error:", findError);
    throw findError;
  }

  if (!profile) {
    console.log("No profile found for Stripe customer:", stripeCustomerId);
    return;
  }

  await updateProfileByUserId({
    supabase,
    userId: profile.id,
    isPro,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeSubscriptionStatus
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Method not allowed. Use POST."
    });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, {
        error: "Missing STRIPE_SECRET_KEY."
      });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return json(500, {
        error: "Missing STRIPE_WEBHOOK_SECRET."
      });
    }

    if (!process.env.SUPABASE_URL) {
      return json(500, {
        error: "Missing SUPABASE_URL."
      });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Missing SUPABASE_SERVICE_ROLE_KEY."
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const rawBody = getRawBody(event);

    const signature =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"];

    if (!signature) {
      return json(400, {
        error: "Missing Stripe signature header."
      });
    }

    let stripeEvent;

    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Stripe webhook signature error:", error.message);

      return json(400, {
        error: `Webhook signature verification failed: ${error.message}`
      });
    }

    console.log("Stripe webhook received:", stripeEvent.type);

    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;

        const userId =
          session.metadata?.userId ||
          session.client_reference_id ||
          null;

        const stripeCustomerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!userId) {
          console.log("checkout.session.completed missing userId.");
          break;
        }

        let subscriptionStatus = "active";

        if (stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          subscriptionStatus = subscription.status;

          await stripe.subscriptions.update(stripeSubscriptionId, {
            metadata: {
              userId
            }
          });
        }

        await updateProfileByUserId({
          supabase,
          userId,
          isPro: isPaidSubscriptionStatus(subscriptionStatus),
          stripeCustomerId,
          stripeSubscriptionId,
          stripeSubscriptionStatus: subscriptionStatus
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = stripeEvent.data.object;

        const userId =
          subscription.metadata?.userId ||
          subscription.metadata?.user_id ||
          null;

        const stripeCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        const stripeSubscriptionId = subscription.id;
        const subscriptionStatus = subscription.status;
        const isPro = isPaidSubscriptionStatus(subscriptionStatus);

        if (userId) {
          await updateProfileByUserId({
            supabase,
            userId,
            isPro,
            stripeCustomerId,
            stripeSubscriptionId,
            stripeSubscriptionStatus: subscriptionStatus
          });
        } else {
          await updateProfileByCustomerId({
            supabase,
            stripeCustomerId,
            isPro,
            stripeSubscriptionId,
            stripeSubscriptionStatus: subscriptionStatus
          });
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object;

        const userId =
          subscription.metadata?.userId ||
          subscription.metadata?.user_id ||
          null;

        const stripeCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        const stripeSubscriptionId = subscription.id;

        if (userId) {
          await updateProfileByUserId({
            supabase,
            userId,
            isPro: false,
            stripeCustomerId,
            stripeSubscriptionId,
            stripeSubscriptionStatus: "canceled"
          });
        } else {
          await updateProfileByCustomerId({
            supabase,
            stripeCustomerId,
            isPro: false,
            stripeSubscriptionId,
            stripeSubscriptionStatus: "canceled"
          });
        }

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = stripeEvent.data.object;

        const stripeCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        const stripeSubscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (stripeCustomerId && stripeSubscriptionId) {
          await updateProfileByCustomerId({
            supabase,
            stripeCustomerId,
            isPro: true,
            stripeSubscriptionId,
            stripeSubscriptionStatus: "active"
          });
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = stripeEvent.data.object;

        const stripeCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        const stripeSubscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (stripeCustomerId && stripeSubscriptionId) {
          await updateProfileByCustomerId({
            supabase,
            stripeCustomerId,
            isPro: false,
            stripeSubscriptionId,
            stripeSubscriptionStatus: "past_due"
          });
        }

        break;
      }

      default: {
        console.log("Unhandled Stripe event:", stripeEvent.type);
      }
    }

    return json(200, {
      received: true
    });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);

    return json(500, {
      error: error.message || "Stripe webhook failed."
    });
  }
};
