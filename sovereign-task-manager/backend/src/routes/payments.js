const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/payments/create-session
// @desc    Create Stripe checkout session for subscription
// @access  Private
router.post('/create-session', [
  protect,
  body('priceId').optional().isString(),
  body('plan').isIn(['premium', 'enterprise'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { plan, priceId } = req.body;
    const user = req.user;

    // Check if user already has an active subscription
    if (user.subscription.status === 'active' && user.subscription.plan === plan) {
      return res.status(400).json({
        error: 'Subscription Error',
        message: 'You already have an active subscription to this plan'
      });
    }

    // Create or retrieve Stripe customer
    let customer;
    if (user.subscription.stripeCustomerId) {
      customer = await stripe.customers.retrieve(user.subscription.stripeCustomerId);
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: {
          userId: user._id.toString()
        }
      });
      user.subscription.stripeCustomerId = customer.id;
    }

    // Determine price ID
    let finalPriceId = priceId;
    if (!finalPriceId) {
      finalPriceId = process.env.STRIPE_PRICE_ID; // Default premium price
      if (plan === 'enterprise') {
        // In production, you'd have different price IDs for different plans
        finalPriceId = process.env.STRIPE_PRICE_ID; // For demo, using same price
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price: finalPriceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancelled`,
      metadata: {
        userId: user._id.toString(),
        plan: plan
      },
      allow_promotion_codes: true,
    });

    // Update user with session info
    user.subscription.plan = plan; // Temporary until payment confirms
    await user.save();

    res.json({
      message: 'Checkout session created',
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      error: 'Payment Service Error',
      message: 'Failed to create checkout session'
    });
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhooks
// @access  Public (Stripe webhook)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// @route   GET /api/payments/subscription
// @desc    Get user's subscription status
// @access  Private
router.get('/subscription', protect, async (req, res) => {
  try {
    const user = req.user;

    let subscriptionDetails = null;
    if (user.subscription.stripeCustomerId) {
      try {
        // Get customer from Stripe
        const customer = await stripe.customers.retrieve(user.subscription.stripeCustomerId, {
          expand: ['subscriptions']
        });

        if (customer.subscriptions.data.length > 0) {
          const subscription = customer.subscriptions.data[0];
          subscriptionDetails = {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            items: subscription.items.data.map(item => ({
              price: item.price.id,
              quantity: item.quantity
            }))
          };
        }
      } catch (error) {
        console.error('Error fetching subscription from Stripe:', error);
      }
    }

    res.json({
      subscription: {
        plan: user.subscription.plan,
        status: user.subscription.status,
        stripeCustomerId: user.subscription.stripeCustomerId,
        currentPeriodEnd: user.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
        stripeDetails: subscriptionDetails
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve subscription status'
    });
  }
});

// @route   POST /api/payments/cancel-subscription
// @desc    Cancel user's subscription
// @access  Private
router.post('/cancel-subscription', protect, async (req, res) => {
  try {
    const user = req.user;

    if (!user.subscription.stripeCustomerId) {
      return res.status(400).json({
        error: 'Subscription Error',
        message: 'No active subscription found'
      });
    }

    // Get subscription from Stripe
    const customer = await stripe.customers.retrieve(user.subscription.stripeCustomerId, {
      expand: ['subscriptions']
    });

    if (customer.subscriptions.data.length === 0) {
      return res.status(400).json({
        error: 'Subscription Error',
        message: 'No active subscription found in Stripe'
      });
    }

    const subscription = customer.subscriptions.data[0];

    // Cancel at period end
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    });

    // Update user
    user.subscription.cancelAtPeriodEnd = true;
    await user.save();

    res.json({
      message: 'Subscription will be cancelled at the end of the billing period',
      cancelAtPeriodEnd: user.subscription.currentPeriodEnd
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to cancel subscription'
    });
  }
});

// Webhook event handlers
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.userId;
  const plan = session.metadata.plan;

  const user = await User.findById(userId);
  if (!user) {
    console.error('User not found for checkout session:', session.id);
    return;
  }

  user.subscription.plan = plan;
  user.subscription.status = 'active';
  user.subscription.stripeSubscriptionId = session.subscription;
  await user.save();

  console.log(`Subscription activated for user ${userId}: ${plan} plan`);
}

async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

  if (user) {
    user.subscription.status = 'active';
    user.subscription.currentPeriodEnd = new Date(invoice.period_end * 1000);
    await user.save();

    console.log(`Payment succeeded for user ${user._id}`);
  }
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

  if (user) {
    user.subscription.status = 'past_due';
    await user.save();

    console.log(`Payment failed for user ${user._id}`);
  }
}

async function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

  if (user) {
    user.subscription.status = 'cancelled';
    user.subscription.cancelAtPeriodEnd = false;
    await user.save();

    console.log(`Subscription cancelled for user ${user._id}`);
  }
}

module.exports = router;