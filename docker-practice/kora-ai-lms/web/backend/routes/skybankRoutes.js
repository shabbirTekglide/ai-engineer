import express from 'express';
import { subscriptionSchema } from '../validations/subscription.validator.js';
import { cancelSubscription, createSubscription, createSubscriptionByCoupon, getAllSubscriptions, getStatus, subscriptionInfo, verifyAppleReceiptHandler } from '../controllers/skypaymentController.js';
import { validateBody } from '../middleware/validate.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';
const router = express.Router();


router.post('/create', protectedDashboard(), validateBody(subscriptionSchema), createSubscription)
router.post('/create-by-coupon', protectedDashboard(), createSubscriptionByCoupon)
router.get('/status', protectedDashboard(), getStatus)
router.get('/subscriptionInfo', protectedDashboard(), subscriptionInfo)
router.get('/all-subscriptions', protectedDashboard('admin'), getAllSubscriptions)
router.post('/cancel', protectedDashboard('all'), cancelSubscription)
router.post('/verify-apple-receipt', protectedDashboard(), verifyAppleReceiptHandler)
// router.get('/verify-customer/:customerVaultId', async (req, res) => {
//     try {
//         const { customerVaultId } = req.params;

//         const verifyData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             customer_vault: 'get_customer',
//             customer_vault_id: customerVaultId
//         });

//         const verifyResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             verifyData
//         );

//         const verifyResult = parseResponse(verifyResponse.data);

//         console.log('Customer Details:', verifyResult);

//         res.json({
//             success: true,
//             customer: verifyResult
//         });

//     } catch (error) {
//         console.error('Verify customer error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to verify customer'
//         });
//     }
// });

// Debug ke liye temporary endpoint banao
// router.get('/debug-customer/:customerVaultId', async (req, res) => {
//     try {
//         const { customerVaultId } = req.params;

//         console.log('🔍 Checking customer vault ID:', customerVaultId);

//         // Pehle verify karo ke customerVaultId valid format mein hai
//         if (!customerVaultId || customerVaultId.length < 5) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid customer vault ID format'
//             });
//         }

//         const verifyData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             customer_vault: 'get_customer',
//             customer_vault_id: customerVaultId
//         });

//         console.log('📤 Sending to Skybank:', {
//             customer_vault: 'get_customer',
//             customer_vault_id: customerVaultId
//         });

//         const verifyResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             verifyData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         console.log('📥 Raw response from Skybank:', verifyResponse.data);

//         const verifyResult = parseResponse(verifyResponse.data);

//         console.log('📝 Parsed response:', verifyResult);

//         if (verifyResult.response === '1') {
//             res.json({
//                 success: true,
//                 message: 'Customer found',
//                 customer: {
//                     first_name: verifyResult.first_name,
//                     last_name: verifyResult.last_name,
//                     email: verifyResult.email,
//                     customer_vault_id: customerVaultId
//                 }
//             });
//         } else {
//             res.status(404).json({
//                 success: false,
//                 message: verifyResult.responsetext || 'Customer not found',
//                 response_code: verifyResult.response_code,
//                 full_response: verifyResult
//             });
//         }

//     } catch (error) {
//         console.error('❌ Verify customer error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to verify customer',
//             error: error.message
//         });
//     }
// });

// Cancel subscription
// router.post('/:subscription_id/cancel', async (req, res) => {
//     try {
//         const { subscription_id } = req.params;

//         const cancelData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             recurring: 'delete_subscription',
//             subscription_id
//         });

//         const cancelResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             cancelData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         const cancelResult = parseResponse(cancelResponse.data);

//         if (cancelResult.response === '1') {
//             // Update MongoDB
//             await Subscription.findOneAndUpdate(
//                 { subscription_id },
//                 { status: 'cancelled' }
//             );

//             res.json({
//                 success: true,
//                 message: 'Subscription cancelled successfully'
//             });
//         } else {
//             res.status(400).json({
//                 success: false,
//                 message: cancelResult.responsetext || 'Cancellation failed'
//             });
//         }

//     } catch (error) {
//         console.error('Cancel subscription error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error'
//         });
//     }
// });

// Helper function to parse gateway response



export default router;



