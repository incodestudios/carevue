// routes/stripe.webhook.js

import express, { Router } from "express";
import Agency from "../models/Agency.js";
import stripeLib  from "stripe";

// Construct Stripe client lazily so that env vars have been loaded.
const router = Router();

router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  // create Stripe client inside handler to avoid initialization before
  // dotenv has been loaded when modules are statically imported
  const stripe = stripeLib(process.env.STRIPE_SECRET);
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const agencyId = session.metadata.agencyId;
      await Agency.findByIdAndUpdate(agencyId, {
        status: "active",
        billingStatus: "paid",
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
      });
      break;
    }
    case "invoice.payment_failed": {
      // set billingStatus = past_due
      break;
    }
  }

  res.json({ received: true });
});

export default router;