import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import {
    AppStoreServerAPIClient,
    Environment,
    SignedDataVerifier,
    ProductType,
    Order
} from '@apple/app-store-server-library';
import fs from 'fs';
import path from 'path';
import WebhookEvent from '../models/WebhookEvent.js';
import { recordReferenceCodeSubscriptionEvent } from '../services/referenceCodeSubscriptionService.js';
// https://dev.koralearning.com/api/webhook/apple-webhook

const router = express.Router();
const allowedIPRanges = [
    '104.192.32.81', '104.192.32.82', '104.192.32.83', '104.192.32.84',
    '104.192.32.85', '104.192.32.86', '104.192.32.87',
    '104.192.36.81', '104.192.36.82', '104.192.36.83', '104.192.36.84',
    '104.192.36.85', '104.192.36.86', '104.192.36.87'
];
const isIpAllowed = (ip) => {
    return allowedIPRanges.some(range => {
        if (range.includes('/')) {
            // Handle CIDR if needed
            return ip.startsWith(range.split('/')[0]);
        }
        return ip === range;
    });
};
/*
// Add before your webhook route
router.use((req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!isIpAllowed(clientIp)) {
        console.warn(`Webhook blocked from IP: ${clientIp}`);
        return res.status(403).send('Forbidden');
    }
    next();
});
*/
// Helper: Verify webhook signature
const verifyWebhookSignature = (body, signingKey, nonce, receivedSig) => {
    const computedSig = crypto
        .createHmac('sha256', signingKey)
        .update(`${nonce}.${body}`)
        .digest('hex');
    return computedSig === receivedSig;
};

// ✅ Webhook endpoint - must use express.raw() for signature verification
router.post('/skybank-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signingKey = process.env.SKYBANK_WEBHOOK_SECRET;
        const webhookBody = req.body.toString();
        const sigHeader = req.headers['webhook-signature'];

        if (!sigHeader) {
            console.warn('Missing webhook signature header');
            return res.status(401).send('Missing signature');
        }

        // Parse signature format: t=timestamp,s=signature
        const match = sigHeader.match(/t=([^,]+),s=([^,]+)/);
        if (!match) {
            console.warn('Invalid signature format');
            return res.status(401).send('Invalid signature format');
        }

        const [, nonce, signature] = match;

        if (!verifyWebhookSignature(webhookBody, signingKey, nonce, signature)) {
            console.warn('Invalid webhook signature');
            return res.status(401).send('Invalid signature');
        }

        // ✅ Signature verified - parse and process
        const event = JSON.parse(webhookBody);
        console.log('✅ Webhook received:', event);

        // Handle different event types
        await handleWebhookEvent(event);

        res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

async function handleWebhookEvent(event) {
    const eventType = event.event_type;

    switch (eventType) {
        case 'transaction.sale.success':
            // Recurring payment succeeded
            await handleRecurringPaymentSuccess(event);
            break;

        case 'transaction.sale.failure':
            // Recurring payment failed
            await handleRecurringPaymentFailure(event);
            break;

        case 'recurring.subscription.delete':
            // Subscription cancelled
            await handleSubscriptionCanceled(event);
            break;

        case 'recurring.subscription.update':
            // Subscription changed (plan, status, etc.)
            await handleSubscriptionUpdated(event);
            break;

        case 'recurring.subscription.add':
            // New subscription created (optional)
            await handleSubscriptionCreated(event);
            break;
        default:
            console.log(`Unhandled event type: ${eventType}`);
    }
}
async function handleRecurringPaymentSuccess(data) {
    console.log('Recurring payment success payload:', JSON.stringify(data, null, 2));

    try {
        const eventBody = data.event_body || data;

        // Safely extract email
        let email = null;
        if (eventBody.billing_address && eventBody.billing_address.email) {
            email = eventBody.billing_address.email;
        }
        let customerId = null;
        if (eventBody.customerid) {
            customerId = eventBody.customerid;
        }

        // Safely extract amount
        let amount = null;
        if (eventBody.action && eventBody.action.amount) {
            amount = eventBody.action.amount;
        }
        let actionDate = null;
        if (eventBody.action && eventBody.action.date) {
            actionDate = eventBody.action.date;
        }

        const transaction_id = eventBody.transaction_id

        if (!transaction_id) {
            console.error(`Cannot process webhook without identifying fields`);
            return;
        }

        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        }
        if (!user && customerId) {
            user = await User.findOne({ 'subscription.customer_vault_id': customerId });
        }

        if (!user) {
            console.error(`User not found to process transaction`);
            return;
        }

        // Setting transaction_id triggers User model pre('save') hook to renew availableSeconds
        if (!user.subscription) {
            user.subscription = {};
        }

        const HOUR_IN_SECONDS = 3600;
        let availableSeconds = 3 * HOUR_IN_SECONDS;
        const planId = user.subscription?.plan_id || 'free';

        switch (planId) {
            case 'basic_plan':
                availableSeconds = 20 * HOUR_IN_SECONDS;
                break;
            case 'pro_plan':
                availableSeconds = 100 * HOUR_IN_SECONDS;
                break;
            default:
                availableSeconds = 3 * HOUR_IN_SECONDS;
        }

        const updateData = {
            'subscription.status': 'active',
            'subscription.availableSeconds': availableSeconds,
        };

        if (transaction_id) {
            updateData['subscription.transaction_id'] = transaction_id.toString();
        }
        if (amount) {
            updateData['subscription.transaction_amount'] = amount.toString();
        }
        updateData['subscription.last_payment_date'] = new Date();
        // Atomic update to avoid dirty-writes during race conditions!
        await User.updateOne({ _id: user._id }, { $set: updateData });
        await recordReferenceCodeSubscriptionEvent({
            user: {
                _id: user._id,
                professorClassCode: user.professorClassCode
            },
            planId,
            source: 'skybank',
            sourceTransactionId: transaction_id,
            subscriptionId: user.subscription?.subscription_id,
            eventType: 'renewal',
            occurredAt: actionDate ? new Date(actionDate) : new Date()
        });

        console.log(`✅ Recurring payment recorded for ${user.email}. Pre-save hook handled renewal.`);
    } catch (err) {
        console.error("Error processing recurring payment success:", err);
    }
}
async function handleRecurringPaymentFailure(data) {
    console.log('Recurring payment failure payload:', JSON.stringify(data, null, 2));
    try {
        const eventBody = data.event_body || data;

        // Safely extract email
        let email = null;
        if (eventBody.billing_address && eventBody.billing_address.email) {
            email = eventBody.billing_address.email;
        }
        let customerId = null;
        if (eventBody.customerid) {
            customerId = eventBody.customerid;
        }
        let actionDate = null;
        if (eventBody.action && eventBody.action.date) {
            actionDate = eventBody.action.date;
        }

        const transaction_id = eventBody.transaction_id

        if (!transaction_id) {
            console.error(`Cannot process webhook without identifying fields`);
            return;
        }

        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        }
        if (!user && customerId) {
            user = await User.findOne({ 'subscription.customer_vault_id': customerId });
        }

        if (!user) {
            console.error(`User not found to process transaction`);
            return;
        }

        // Setting transaction_id triggers User model pre('save') hook to renew availableSeconds
        if (!user.subscription) {
            user.subscription = {};
        }

        const updateData = {
            'subscription.status': 'failed',
        };

        if (transaction_id) {
            updateData['subscription.transaction_id'] = transaction_id.toString();
        }
        updateData['subscription.transaction_amount'] = "0.00";

        updateData['subscription.last_failure_date'] = new Date();
        updateData['subscription.last_failure_reason'] = eventBody.action.processor_response_description;
        // Atomic update to avoid dirty-writes during race conditions!
        await User.updateOne({ _id: user._id }, { $set: updateData });

        console.log(`✅ Recurring payment recorded for ${user.email}. Pre-save hook handled renewal.`);
    } catch (err) {
        console.error("Error processing recurring payment success:", err);
    }
}

async function handleSubscriptionCanceled(data) {
    console.log('Subscription canceled payload:', JSON.stringify(data, null, 2));
    try {
        const eventBody = data.event_body;
        const subscription_id = eventBody.subscription_id;

        // Safely extract email from billing_address
        let email = null;
        if (eventBody.billing_address && eventBody.billing_address.email) {
            email = eventBody.billing_address.email;
        }

        if (subscription_id) {
            let user = null;
            if (email) {
                user = await User.findOne({ email: email.toLowerCase() });
            }
            if (!user) {
                user = await User.findOne({ 'subscription.subscription_id': subscription_id });
            }

            if (user) {
                // Atomic update to avoid dirty-writes during race conditions!
                await User.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            'subscription.status': 'cancelled',
                            'subscription.availableSeconds': 0
                        }
                    }
                );
                console.log(`❌ Subscription cancelled in DB for ${user.email} from webhook event`);
            } else {
                console.error(`User not found for subscription.delete event (email: ${email}, sub_id: ${subscription_id})`);
            }
        }
    } catch (err) {
        console.error("Error processing subscription canceled:", err);
    }
}
async function handleSubscriptionUpdated(data) {
    console.log('Subscription updated payload:', JSON.stringify(data, null, 2));
    // Update your local record if needed (e.g., plan changed)
}
async function handleSubscriptionCreated(data) {
    console.log('Subscription created payload:', JSON.stringify(data, null, 2));
    try {
        const eventBody = data.event_body;
        const subscription_id = eventBody.subscription_id;

        // Safely extract email from billing_address
        let email = null;
        if (eventBody.billing_address && eventBody.billing_address.email) {
            email = eventBody.billing_address.email;
        }

        if (subscription_id) {
            let user = null;
            if (email) {
                user = await User.findOne({ email: email.toLowerCase() });
            }


            if (user) {
                user.subscription.subscription_id = subscription_id.toString();
                await user.save();
                console.log(`✅ Subscription ID updated for ${user.email} from subscription.add event`);
            } else {
                console.error(`User not found for subscription.add event (email: ${email})`);
            }
        }
    } catch (err) {
        console.error("Error processing subscription created:", err);
    }
}

// ✅ 1. Load BOTH root certificates (G3 + G2)
const appleRootCAs = [
    fs.readFileSync('AppleRootCA-G3.cer'),
    fs.readFileSync('AppleRootCA-G2.cer')
];

const bundleId = process.env.APPLE_BUNDLE_ID;
const environment = Environment.PRODUCTION; // production ke liye change karna
const AppleId = process.env.APPLE_ID;
// ✅ 2. Create verifier with both certs and online checks OFF (for sandbox reliability)
const verifier = new SignedDataVerifier(
    appleRootCAs,
    true, // 🔴 Sandbox mein online checks OFF rakho – yeh aksar timeout ka karan hota hai
    environment,
    bundleId,
    AppleId// 5th parameter (appAppleId) optional, production mein chahiye
);

// ✅ 3. Webhook endpoint
router.post('/apple-webhook', express.json(), async (req, res) => {
    try {
        const { signedPayload } = req.body;
        if (!signedPayload) {
            return res.status(400).send('Missing signedPayload');
        }

        // ✅ 4. Verify using the same verifier
        let payload;
        try {
            payload = await verifier.verifyAndDecodeNotification(signedPayload);
        } catch (err) {
            console.error('Verification failed:', err);
            return res.status(401).send('Invalid signature');
        }

        const { notificationType, notificationUUID, data, notificationSubtype } = payload;
        console.log('Apple webhook received:', notificationType);
        // ✅ 5. Idempotency check (store UUID in DB)
        const alreadyProcessed = await WebhookEvent.findOne({ uuid: notificationUUID });
        if (alreadyProcessed) {
            console.log(`Duplicate webhook ignored: ${notificationUUID}`);
            return res.status(200).send('OK');
        }

        // ✅ 6. Decode transaction info (if present)
        let transactionInfo = null;
        if (data?.signedTransactionInfo) {
            try {
                transactionInfo = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo);
                console.log('Decoded transactionInfo:', transactionInfo);
            } catch (err) {
                console.error('Failed to decode transaction info:', err.message);
            }
        }

        // ✅ 7. Handle event (update subscription status)
        await handleAppleWebhookEvent(notificationType, notificationSubtype, transactionInfo);

        // ✅ 8. Mark as processed
        await WebhookEvent.create({ uuid: notificationUUID, processedAt: new Date() });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

async function handleAppleWebhookEvent(notificationType, notificationSubtype, transactionInfo) {
    if (!transactionInfo || !transactionInfo.originalTransactionId) {
        console.log(`Skipping Apple Webhook event: missing originalTransactionId (${notificationType})`);
        return;
    }
    const HOUR_IN_SECONDS = 3600;
    const { originalTransactionId, transactionId, expiresDate } = transactionInfo;

    // Find the user by originalTransactionId
    const user = await User.findOne({ 'subscription.original_transaction_id': originalTransactionId });
    if (!user) {
        console.log(`User not found for Apple originalTransactionId: ${originalTransactionId}`);
        return;
    }

    const expiry = parseInt(expiresDate);

    // Handle the specific notification types from Apple
    switch (notificationType) {
        case 'SUBSCRIBED': // working
            console.log('Apple IAP Subscribed for', transactionId);
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'active',
                        'subscription.plan_id': transactionInfo.productId,
                        'subscription.source_transaction_id': transactionInfo.transactionId,
                        'subscription.original_transaction_id': transactionInfo.originalTransactionId,
                        'subscription.source': 'apple_iap',
                        'subscription.expires_at': new Date(transactionInfo.expiresDate),
                        'subscription.last_receipt_data': new Date(transactionInfo.purchaseDate),
                        'subscription.availableSeconds': transactionInfo.productId === 'KBASSUB15' ? 20 * HOUR_IN_SECONDS : transactionInfo.productId === 'KPROSUB20' ? 100 * HOUR_IN_SECONDS : 0
                    }
                }
            )
            await recordReferenceCodeSubscriptionEvent({
                user: {
                    _id: user._id,
                    professorClassCode: user.professorClassCode
                },
                planId: transactionInfo.productId,
                source: 'apple_iap',
                sourceTransactionId: transactionInfo.transactionId,
                subscriptionId: transactionInfo.originalTransactionId,
                eventType: 'initial',
                occurredAt: transactionInfo.purchaseDate ? new Date(transactionInfo.purchaseDate) : new Date()
            });
            break;
        case 'DID_RENEW': // working Successful auto-renewal
            console.log(`Apple IAP Renewed for ${user.email}`); 3
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'active',
                        'subscription.plan_id': transactionInfo.productId,
                        'subscription.source_transaction_id': transactionInfo.transactionId,
                        'subscription.original_transaction_id': transactionInfo.originalTransactionId,
                        'subscription.source': 'apple_iap',
                        'subscription.expires_at': new Date(transactionInfo.expiresDate),
                        'subscription.last_receipt_data': new Date(transactionInfo.purchaseDate),
                        'subscription.availableSeconds': transactionInfo.productId === 'KBASSUB15' ? 20 * HOUR_IN_SECONDS : transactionInfo.productId === 'KPROSUB20' ? 100 * HOUR_IN_SECONDS : 0

                    }
                }
            )
            await recordReferenceCodeSubscriptionEvent({
                user: {
                    _id: user._id,
                    professorClassCode: user.professorClassCode
                },
                planId: transactionInfo.productId,
                source: 'apple_iap',
                sourceTransactionId: transactionInfo.transactionId,
                subscriptionId: transactionInfo.originalTransactionId,
                eventType: 'renewal',
                occurredAt: transactionInfo.purchaseDate ? new Date(transactionInfo.purchaseDate) : new Date()
            });
            break;

        case 'EXPIRED': //working
            console.log(`Apple IAP Expired for ${user.email}`);
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'expired',
                        'subscription.availableSeconds': 0,
                        'subscription.expires_at': new Date(transactionInfo.expiresDate),
                        'subscription.last_receipt_data': new Date(transactionInfo.purchaseDate)
                    }
                }
            )
            break;
        case 'DID_CHANGE_RENEWAL_PREF': //working
            console.log(`Apple IAP Did change subscription Preference for ${user.email}`);
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'active',
                        'subscription.plan_id': transactionInfo.productId,
                        'subscription.source_transaction_id': transactionInfo.transactionId,
                        'subscription.original_transaction_id': transactionInfo.originalTransactionId,
                        'subscription.source': 'apple_iap',
                        'subscription.expires_at': new Date(transactionInfo.expiresDate),
                        'subscription.last_receipt_data': new Date(transactionInfo.purchaseDate),
                        'subscription.availableSeconds': transactionInfo.productId === 'KBASSUB15' ? 20 * HOUR_IN_SECONDS : transactionInfo.productId === 'KPROSUB20' ? 100 * HOUR_IN_SECONDS : 0

                    }
                }
            )

            break;
        case 'DID_CHANGE_RENEWAL_STATUS': //working for cancel
            console.log(`Apple IAP Did cancel Status for ${user.email}`);
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'cancelled',
                        'subscription.availableSeconds': 0,
                        'subscription.expires_at': new Date(transactionInfo.expiresDate),
                        'subscription.last_receipt_data': new Date(transactionInfo.purchaseDate),
                        'subscription.source_transaction_id': transactionInfo.transactionId,
                        'subscription.original_transaction_id': transactionInfo.originalTransactionId,
                        'subscription.source': 'apple_iap',
                        'subscription.plan_id': transactionInfo.productId,
                    }
                }
            )
            break;
        default:
            console.log(`Unhandled Apple webhook notificationType: ${notificationType}`);
            // Just update the expiration date to keep records somewhat synced
            user.subscription.expires_at = new Date(expiry);
            break;
    }

    // Saving will trigger the pre('save') hook in User model to reset their availableSeconds if transaction_id changed
    await user.save();
    console.log(`✅ Apple Webhook processed for user: ${user.email}`);
}

export default router;
