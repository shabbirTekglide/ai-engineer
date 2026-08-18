import User from "../models/User.js";

const restrictFreeTrial = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Subscription object existence check
        if (!user.subscription) {
            return res.status(400).json({ message: 'No subscription data found' });
        }

        const planId = user.subscription.plan_id;
        const status = user.subscription.status;
        const userLastPaymentDate = user.subscription.source == "apple" ? new Date(user.subscription.last_receipt_data).getTime() : new Date(user.subscription.last_payment_date || user.subscription.createdAt).getTime();

        // Time definitions
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        // -----------------------------------------------------
        // 1. Check for Time Expiration
        // -----------------------------------------------------
        let hasTimeExpired = false;
        let expirationMsg = '';

        if (planId === 'free') {
            if (now > userLastPaymentDate + ONE_WEEK_MS) {
                hasTimeExpired = true;
                expirationMsg = 'Free trial expired. Please upgrade to continue.';
            }
        } else if (planId === 'basic_plan' || planId === 'pro_plan') {
            // Check monthly expiry for paid plans
            if (now > userLastPaymentDate + ONE_MONTH_MS) {
                hasTimeExpired = true;
                expirationMsg = 'Your billing cycle has ended. Please renew.';
            }
        } else if (planId === 'KBASSUB15' || planId === 'KPROSUB20') {
            // Check monthly expiry for paid plans
            if (now > new Date(user.subscription.expires_at).getTime()) {
                hasTimeExpired = true;
                expirationMsg = 'Your billing cycle has ended. Please renew.';
            }
        }

        // -----------------------------------------------------
        // 2. Update Status in DB if Time Expired (and not already expired)
        // -----------------------------------------------------
        if (hasTimeExpired && status === 'active') {
            console.log(`User ${userId} subscription time ended. Marking as expired.`);
            user.subscription.status = 'expired';
            await user.save();

            // Return immediately after expiring
            return res.status(403).json({
                message: expirationMsg,
                code: planId === 'free' ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
                type: planId,
                status: 'expired',
                availableHours: (user.subscription.availableSeconds / 3600).toFixed(2),
                lastPaymentDate: user.subscription.last_payment_date || user.subscription.createdAt,
            });
        }

        // -----------------------------------------------------
        // 3. Final Gatekeeper (Check Status)
        // -----------------------------------------------------

        // Agar status active hai, toh jaane do
        if (user.subscription.status === 'active') {
            return next();
        }

        // Agar active nahi hai, toh reason batao
        let errorCode = 'ACCESS_DENIED';
        let errorMessage = 'Access denied.';

        switch (user.subscription.status) {
            case 'expired':
                errorCode = 'SUBSCRIPTION_EXPIRED';
                errorMessage = 'Your subscription has expired. Please renew to continue.';
                break;
            case 'completed':
                errorCode = 'LIMIT_REACHED';
                errorMessage = 'You have used all your available hours. Please renew or upgrade.';
                break;
            case 'cancelled':
                errorCode = 'SUBSCRIPTION_CANCELLED';
                errorMessage = 'Your subscription was cancelled.';
                break;
            case 'failed':
                errorCode = 'SUBSCRIPTION_FAILED';
                errorMessage = 'Your subscription failed. Please renew to continue.';
                break;
            default:
                errorCode = 'INVALID_SUBSCRIPTION';
                errorMessage = 'Invalid subscription status.';
        }

        return res.status(403).json({
            message: errorMessage,
            code: errorCode,
            type: planId,
            status: user.subscription.status,
            availableHours: (user.subscription.availableSeconds / 3600).toFixed(2),
            lastPaymentDate: user.subscription.last_payment_date || user.subscription.createdAt,
        });

    } catch (error) {
        console.error('Trial restriction middleware error:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export default restrictFreeTrial;
