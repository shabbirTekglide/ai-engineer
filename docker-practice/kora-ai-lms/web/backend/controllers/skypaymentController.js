import User from "../models/User.js";
import axios from "axios";
import { getFormattedDate, parseResponse } from "../utils/skybankUtils.js";
import studentprofile from "../models/studentprofile.js";
import PromoCode from "../models/PromoCode.js";
import mongoose from "mongoose";
import { verifyWithTransactionId } from "../utils/appleIAP.js";
import { recordReferenceCodeSubscriptionEvent } from "../services/referenceCodeSubscriptionService.js";

const HOUR_IN_SECONDS = 3600;

// export const createSubscription = async (req, res) => {
//     try {
//         const {
//             first_name,
//             last_name,
//             email,
//             payment_token,
//             plan_id,
//         } = req.body;
//         const user_id = req.user?.id;

//         // Step 1: Find user
//         const user = await User.findById(user_id);
//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found'
//             });
//         }

//         // Step 2: Create customer in Customer Vault
//         const customerData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             customer_vault: 'add_customer',
//             first_name,
//             last_name,
//             email,
//             payment_token
//         });

//         console.log('Customer Data:', customerData);
//         const customerResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             customerData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         const customerResult = parseResponse(customerResponse.data);
//         console.log('Customer Vault Result:', customerResult);
//         if (customerResult.response !== '1') {
//             return res.status(400).json({
//                 success: false,
//                 message: customerResult.responsetext || 'Customer creation failed'
//             });
//         }

//         // Step 3: Create subscription
//         const subscriptionData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             recurring: 'add_subscription',
//             plan_id,
//             // type: 'auth',
//             customer_vault_id: customerResult.customer_vault_id,
//             // payment_token,
//             // start_date: getFormattedDate()
//         });
//         console.log('Subscription Data:', subscriptionData);
//         const subscriptionResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             subscriptionData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         const subscriptionResult = parseResponse(subscriptionResponse.data);
//         console.log('Subscription Result:', subscriptionResult);
//         if (subscriptionResult.response === '1') {

//             // Update user with subscription data
//             user.subscription = {
//                 plan_id: plan_id,
//                 skybank_response: subscriptionResult,
//                 status: 'active',
//             };

//             user.billing_address = {
//                 first_name,
//                 last_name,
//                 email,
//             };
//             await user.save();

//             res.json({
//                 success: true,
//                 message: 'Subscription created successfully',
//                 data: {
//                     customer_vault_id: customerResult.customer_vault_id,
//                     subscription_id: subscriptionResult.subscription_id,
//                     subscription: user.subscription,
//                     user: {
//                         id: user._id,
//                         email: user.email,
//                     }
//                 }
//             });
//         } else {
//             res.status(400).json({
//                 success: false,
//                 message: subscriptionResult.responsetext || 'Subscription creation failed'
//             });
//         }

//     } catch (error) {
//         console.error('Subscription creation error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };


//----------------perfectly working----------------


export const createSubscription = async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            email,
            payment_token,
            plan_id,
        } = req.body;
        const user_id = req.user?.id;
        console.log('📦 Creating subscription for user:', user_id);

        console.log('🔌 Request Data:', {
            plan_id
        });

        // Step 1: Find user
        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user already has an active subscription if free plan than allowed
        if (user.subscription && user.subscription.status === 'active' && user.subscription.plan_id !== 'free') {
            return res.status(400).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        // ✅ Securely determine the amount based on plan_id on the backend
        // Never trust the amount sent from frontend as it can be manipulated
        let planAmount = '0.00';
        if (plan_id === 'basic_plan') {
            planAmount = '15.00';
        } else if (plan_id === 'pro_plan') {
            planAmount = '20.00';
        } else if (plan_id === 'penny_test') {
            planAmount = '0.01';
        } else if (plan_id === 'nickel_test') {
            planAmount = '0.10';
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }

        let isDiscountApplied = false;
        if (user.professorClassCode && !user.classCodeDiscountAvailed) {
            const amountNum = parseFloat(planAmount);
            if (amountNum > 0) {
                planAmount = (amountNum * 0.9).toFixed(2);
                isDiscountApplied = true;
                console.log('🎉 10% Class Code Discount Applied. New Amount:', planAmount);
            }
        }

        // ✅ STEP 2: FIRST TRANSACTION (with CVV via payment_token)
        console.log('💰 Processing first transaction...');
        const transactionData = new URLSearchParams({
            security_key: process.env.SKYBANK_SECURITY_KEY,
            type: 'sale',                    // First actual charge
            amount: planAmount,              // 👈 Use securely calculated amount
            payment_token,                    // Contains CVV encrypted
            first_name,
            last_name,
            email: user.email,
            // test_mode: 'enabled',
            // Optional: Add billing info
            // address1: req.body.address1,
            // city: req.body.city,
            // state: req.body.state,
            // zip: req.body.zip
        });

        const transactionResponse = await axios.post(
            'https://secure.skybankgateway.com/api/transact.php',
            transactionData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const transactionResult = parseResponse(transactionResponse.data);
        console.log('✅ Transaction result:', transactionResult);

        // Check if transaction failed
        if (transactionResult.response !== '1') {
            let errorMessage = 'Payment failed';

            // Specific error messages
            if (transactionResult.response_code === '202') {
                errorMessage = 'Insufficient funds';
            } else if (transactionResult.response_code === '201') {
                errorMessage = 'Card declined';
            } else if (transactionResult.response_code === '223') {
                errorMessage = 'Card expired';
            } else if (transactionResult.response_code === '225') {
                errorMessage = 'Invalid CVV';
            } else if (transactionResult.responsetext) {
                errorMessage = transactionResult.responsetext;
            }

            return res.status(400).json({
                success: false,
                message: errorMessage,
                code: transactionResult.response_code
            });
        }

        // ✅ STEP 3: Create customer in Customer Vault (using transaction ID)
        console.log('📦 Creating customer vault...');
        const customerData = new URLSearchParams({
            security_key: process.env.SKYBANK_SECURITY_KEY,
            customer_vault: 'add_customer',
            first_name,
            last_name,
            email: user.email,
            source_transaction_id: transactionResult.transactionid, // Link to first transaction
            // Card details automatically copied from transaction
        });

        const customerResponse = await axios.post(
            'https://secure.skybankgateway.com/api/transact.php',
            customerData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const customerResult = parseResponse(customerResponse.data);
        console.log('👤 Customer vault result:', customerResult);

        if (customerResult.response !== '1') {
            // Transaction succeeded but vault creation failed - log but continue?
            console.error('Vault creation failed but transaction succeeded:', customerResult);
            // You might want to handle this case specially
        }

        // ✅ STEP 4: Create subscription (using vault ID)
        console.log('🔄 Creating subscription...');
        const subscriptionData = new URLSearchParams({
            security_key: process.env.SKYBANK_SECURITY_KEY,
            recurring: 'add_subscription',
            plan_id,
            customer_vault_id: customerResult.customer_vault_id,
            // ✅ NO type or amount - subscription will use plan settings
            // ✅ Optional: start_date if first charge should be later
            // start_date: getFutureDate(),

            // CIT/MIT compliance
            initiated_by: 'customer',
            stored_credential_indicator: 'stored',
            initial_transaction_id: transactionResult.transactionid, // Reference first transaction
        });

        const subscriptionResponse = await axios.post(
            'https://secure.skybankgateway.com/api/transact.php',
            subscriptionData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const subscriptionResult = parseResponse(subscriptionResponse.data);
        console.log('📝 Subscription result:', subscriptionResult);

        if (subscriptionResult.response === '1') {
            // ✅ Success - update user with only plan and vault. Webhook will handle the rest.
            const updateFields = {
                'subscription.plan_id': plan_id,
                'subscription.customer_vault_id': customerResult.customer_vault_id,
                'billing_address.first_name': first_name,
                'billing_address.last_name': last_name,
                'billing_address.email': user.email
            };

            if (isDiscountApplied) {
                updateFields.classCodeDiscountAvailed = true;
            }

            await User.updateOne(
                { _id: user._id },
                {
                    $set: updateFields
                }
            );

            await recordReferenceCodeSubscriptionEvent({
                user: {
                    _id: user._id,
                    professorClassCode: user.professorClassCode
                },
                planId: plan_id,
                source: 'skybank',
                sourceTransactionId: transactionResult.transactionid,
                subscriptionId: subscriptionResult.subscription_id,
                eventType: user.subscription?.plan_id === 'free' ? 'initial' : 'resubscribe',
                occurredAt: new Date()
            });

            res.json({
                success: true,
                message: 'Subscription created successfully',
                data: {
                    subscription_id: subscriptionResult.subscription_id,
                    customer_vault_id: customerResult.customer_vault_id,
                    transaction_id: transactionResult.transactionid,
                    status: 'active'
                }
            });
        } else {
            // Subscription failed but transaction succeeded
            console.error('Subscription creation failed:', subscriptionResult);

            // Optionally refund the transaction
            // await refundTransaction(transactionResult.transactionid);

            res.status(400).json({
                success: false,
                message: subscriptionResult.responsetext || 'Subscription creation failed',
                transaction_id: transactionResult.transactionid // Transaction already happened
            });
        }

    } catch (error) {
        console.error('💥 Subscription creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ----------------------------------------------------------------------------

// server testing

// export const createSubscription = async (req, res) => {
//     try {
//         const {
//             first_name,
//             last_name,
//             email,
//             payment_token,
//             plan_id,
//         } = req.body;
//         const user_id = req.user?.id;
//         console.log('User ID:', payment_token);

//         // Step 1: Find user
//         const user = await User.findById(user_id);
//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found'
//             });
//         }

//         // ✅ Step 2: Validate card with $0 authorization
//         console.log('🔍 Validating card...');
//         const validateData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             type: 'validate',
//             payment_token,
//             first_name,
//             last_name,
//             email,
//            //  amount: '0.01',
//         });
//         console.log('Validation Data:', validateData);
//       /*  const validateResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             validateData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );
//         console.log('Validation Response:', validateResponse);

//         const validateResult = parseResponse(validateResponse.data);
//         console.log('✅ Validation result:', validateResult);

//         // Agar card validate nahi hua to error return karo
//         if (validateResult.response !== '1') {
//             let errorMessage = 'Card validation failed';

//             // Specific error messages
//             if (validateResult.response_code === '202') {
//                 errorMessage = 'Insufficient funds in card';
//             } else if (validateResult.response_code === '201') {
//                 errorMessage = 'Card declined - do not honor';
//             } else if (validateResult.response_code === '223') {
//                 errorMessage = 'Card expired';
//             } else if (validateResult.response_code === '225') {
//                 errorMessage = 'Invalid card security code';
//             } else if (validateResult.responsetext) {
//                 errorMessage = validateResult.responsetext;
//             }

//             return res.status(400).json({
//                 success: false,
//                 message: errorMessage,
//                 code: validateResult.response_code
//             });
//         }
// */
//         // ✅ Step 3: Create customer in Customer Vault
//         console.log('📦 Creating customer vault...');
//         const customerData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             customer_vault: 'add_customer',
//             first_name,
//             last_name,
//             email,
//            payment_token,
//   //          source_transaction_id: validateResult.transactionid // Reference validation transaction
//         });

//         const customerResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             customerData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         const customerResult = parseResponse(customerResponse.data);
//         console.log('👤 Customer vault result:', customerResult);

//         if (customerResult.response !== '1') {
//             return res.status(400).json({
//                 success: false,
//                 message: customerResult.responsetext || 'Customer creation failed'
//             });
//         }

//         // ✅ Step 4: Create subscription (future start date)
//         console.log('🔄 Creating subscription...');
//         const futureDate = getFormattedDate(); // Tomorrow's date

//         const subscriptionData = new URLSearchParams({
//             security_key: process.env.SKYBANK_SECURITY_KEY,
//             recurring: 'add_subscription',
//             plan_id,
// // payment_token,
// 	type:'sale',
//             customer_vault_id: customerResult.customer_vault_id,
//             // start_date: futureDate,
//             // CIT/MIT compliance (optional but recommended)
//             initiated_by: 'customer',
//             stored_credential_indicator: 'stored',
//            // initial_transaction_id: validateResult.transactionid,
//            amount: 0.01
//         });

//         const subscriptionResponse = await axios.post(
//             'https://secure.skybankgateway.com/api/transact.php',
//             subscriptionData,
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );

//         const subscriptionResult = parseResponse(subscriptionResponse.data);
//         console.log('📝 Subscription result:', subscriptionResult);

//         if (subscriptionResult.response === '1') {
//             // ✅ Success - update user
//             user.subscription = {
//                 plan_id,
//                 skybank_response: subscriptionResult,
//                 status: 'active',
//              //   validation_transaction_id: validateResult.transactionid,
//                 subscription_id: subscriptionResult.subscription_id,
//                 customer_vault_id: customerResult.customer_vault_id
//             };

//             user.billing_address = {
//                 first_name,
//                 last_name,
//                 email,
//             };
//             await user.save();

//             res.json({
//                 success: true,
//                 message: 'Subscription created successfully',
//                 data: {
//                     subscription_id: subscriptionResult.subscription_id,
//                     customer_vault_id: customerResult.customer_vault_id,
//                     status: 'active'
//                 }
//             });
//         } else {
//             // Subscription failed but card was valid
//             console.error('Subscription creation failed:', subscriptionResult);
//             res.status(400).json({
//                 success: false,
//                 message: subscriptionResult.responsetext || 'Subscription creation failed'
//             });
//         }

//     } catch (error) {
//         console.error('💥 Subscription creation error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };

// ----------------------------------------------------------------------------


export const createSubscriptionByCoupon = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            first_name,
            last_name,
            email,
            code,
            plan_id,
        } = req.body;
        const user_id = req.user?.id;

        if (!code) {
            throw new Error('Promo code is required');
        }

        // 1. Record the usage of the promo code (Includes built-in validation & saving)
        // This is done within the transaction session
        const usageResult = await PromoCode.recordUsage(code, user_id, plan_id, { session });

        if (!usageResult.success) {
            throw new Error(usageResult.message || 'Failed to apply promo code');
        }

        // 2. Update the User subscription
        const user = await User.findById(user_id).session(session);
        if (!user) {
            throw new Error('User not found');
        }

        const HOUR_IN_SECONDS = 3600;
        let availableSeconds = 3 * HOUR_IN_SECONDS;

        switch (plan_id) {
            case 'basic_plan':
                availableSeconds = 20 * HOUR_IN_SECONDS;
                break;
            case 'pro_plan':
                availableSeconds = 100 * HOUR_IN_SECONDS;
                break;
            default:
                availableSeconds = 3 * HOUR_IN_SECONDS;
        }

        // user.subscription = {
        //     plan_id: plan_id,
        //     status: 'active',
        //     promo_code: code.toUpperCase().trim(),
        //     last_payment_date: new Date(),
        //     availableSeconds: availableSeconds,
        // };
        user.subscription.plan_id = plan_id;
        user.subscription.status = 'active';
        user.subscription.promo_code = code.toUpperCase().trim();
        user.subscription.last_payment_date = new Date();
        user.subscription.availableSeconds = availableSeconds;
        user.billing_address = {
            first_name,
            last_name,
            email,
        };
        await user.save({ session });

        // Commit all changes
        await session.commitTransaction();

        res.json({
            success: true,
            message: 'Subscription created successfully using promo code',
            data: {
                subscription: user.subscription,
                user: {
                    id: user._id,
                    email: user.email,
                }
            }
        });

    } catch (error) {
        // Rollback all changes if any step fails
        await session.abortTransaction();
        console.error('Subscription creation via coupon error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Subscription failed',
        });
    } finally {
        session.endSession();
    }
};

// GET /billing/status
export const getStatus = async (req, res) => {
    try {
        // 1) Auth upfront
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }

        // 2) No-store caching
        res.set('Cache-Control', 'no-store');
        // (Cookie auth use ho to optionally) res.set('Vary', 'Cookie');

        // 3) Minimal projection + lean
        const user = await User.findById(
            userId,
            { 'subscription.status': 1, 'subscription.plan_id': 1 }, // add fields as needed
        ).lean();

        if (!user || !user.subscription) {
            // 6) Either 404 or 200 with inactive; choose one:
            return res.status(404).json({
                success: false,
                message: 'No subscription found for user'
            });
            // OR:
            // return res.json({ success: true, data: { subscription_status: 'inactive' } });
        }

        const raw = user.subscription?.status || 'inactive';
        const normalized = raw; // e.g., map past_due -> inactive if you want: (raw === 'active' ? 'active' : 'inactive')

        // 3) Stable response shape
        return res.json({
            success: true,
            data: {
                subscription_status: normalized,
                // plan_id: user.subscription.plan_id, // include only if needed on UI
            },
        });
    } catch (error) {
        console.error('Get subscription status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

export const subscriptionInfo = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User ID not found in request'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get subscription info using the instance method
        const subscriptionInfo = user.getSubscriptionInfo();

        res.json({
            success: true,
            data: subscriptionInfo
        });
    } catch (error) {
        console.error('Subscription info error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error',
        });
    }
}

export const getAllSubscriptions = async (req, res) => {
    try {
        // 1. Sirf Filters destructure karein
        const { plan } = req.query;

        // 2. Query Build karein
        const query = {};

        // --- Filter by Plan (Basic, Pro, Free) ---
        if (plan && plan !== 'all') {
            query['subscription.plan_id'] = plan;
        }

        // 3. Fetch Users Data
        const users = await User.find(query)
            .select('email billing_address subscription createdAt updatedAt')
            .sort({ 'subscription.updatedAt': -1 })
            .lean();
        // ---------------------------------------------------------------
        const userIds = users.map(user => user._id);

        // Step B: StudentProfile se wo records lao jinke userId match krte hain
        // Note: Check kr lena apke StudentProfile model me field ka naam 'userId' hai ya 'user'
        const profiles = await studentprofile.find({ userId: { $in: userIds } })
            .select('userId name') // Sirf naam chahiye
            .lean();

        // Step C: Profiles ko ek Map/Object me convert kro taaki fast lookup ho sake
        // Format: { "USER_ID_123": { firstName: "Ali", lastName: "Khan" } }
        const profileMap = {};
        profiles.forEach(p => {
            // userId ko string me convert krk key bana lo
            profileMap[p.userId.toString()] = p;
        });

        // ---------------------------------------------------------------

        // 4. Data Format
        const formattedUsers = users.map(user => {
            const planId = user.subscription?.plan_id || 'free';

            // Amount Calculation
            let amount = '$0.00';
            if (planId === 'basic_plan') amount = '$10.00';
            if (planId === 'pro_plan') amount = '$15.00';

            // --- NAME LOGIC ---
            let fullName = '';

            // 1. Check Student Profile First
            const profile = profileMap[user._id.toString()];
            if (profile) {
                fullName = `${profile.name || ''}`.trim();
            }

            // 3. Fallback to Email Prefix (Agar kahin naam na ho)
            if (!fullName) {
                fullName = user.email ? user.email.split('@')[0] : 'Unknown User';
            }

            return {
                id: user._id,
                name: fullName, // ✅ Ab ye StudentProfile se ayega (agar available hua)
                email: user.email,
                plan: planId,
                subscriptionId: user.subscription?._id,
                status: user.subscription?.status || 'active',
                availableSeconds: user.subscription?.availableSeconds || 0,
                amount: amount,
                date: new Date(user.subscription?.last_payment_date || user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })
            };
        });

        // 5. Send Response
        res.status(200).json({
            success: true,
            data: formattedUsers,
            count: formattedUsers.length
        });

    } catch (error) {
        console.error('Get subscriptions error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
export const cancelSubscription = async (req, res) => {
    try {
        // userId: Jisko cancel karna hai
        // password: Jo banda request bhej raha hai uska password verification k liye
        const { userId, password } = req.body;

        // requesterId: Jo banda abhi logged in hai (Token se aaya)
        const requesterId = req.user.id;

        // --- COMMON VALIDATIONS ---
        if (!password) return res.status(400).json({ success: false, message: 'Password is required for security verification' });

        // ---------------------------------------------------------
        // STEP 1: IDENTIFY REQUESTER & VERIFY PASSWORD
        // ---------------------------------------------------------
        const requester = await User.findById(requesterId);
        if (!requester) {
            return res.status(404).json({ success: false, message: 'Requester not found' });
        }

        // Security Check: Password usi ka check hoga jo request bhej raha hai
        // (Agar Admin hai to Admin ka pass, Student hai to Student ka pass)
        const isMatch = await requester.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect Password' });
        }

        // ---------------------------------------------------------
        // STEP 2: DETERMINE TARGET USER (WHO TO CANCEL)
        // ---------------------------------------------------------
        let targetUserId;

        if (requester.role === 'admin') {
            // CASE A: ADMIN
            // Admin kisi ko bhi cancel kar sakta hai, so Body me ID honi zaroori hai
            if (!userId) {
                return res.status(400).json({ success: false, message: 'Target User ID is required for Admin action' });
            }
            targetUserId = userId;
        } else {
            // CASE B: STUDENT (SELF)
            // Student sirf khud ko cancel kar sakta hai

            // Check: Agar body me userId bheja hai, to wo khud ki ID se match hona chahiye
            if (userId && userId !== requesterId) {
                return res.status(403).json({ success: false, message: 'You can only cancel your own subscription' });
            }

            // Target wahi hai jo logged in hai
            targetUserId = requesterId;
        }

        // ---------------------------------------------------------
        // STEP 3: FETCH TARGET USER & CANCEL
        // ---------------------------------------------------------

        // Note: Agar Student khud hai to DB call bachane k liye hum 'requester' object use kr skte hain
        // Lekin agar Admin hai to humein 'targetUserId' fetch karna padega.
        // Consistency ke liye hum fetch kar lete hain ya check kar lete hain.

        let userToCancel;
        if (targetUserId === requesterId) {
            userToCancel = requester; // Student khud hai
        } else {
            userToCancel = await User.findById(targetUserId); // Admin kisi aur ko dhoond raha hai
        }

        if (!userToCancel) {
            return res.status(404).json({ success: false, message: 'Target user not found' });
        }

        // --- CANCELLATION LOGIC START (Same as before) ---

        // 1. Free Plan Logic
        if (userToCancel.subscription?.plan_id === 'free' || userToCancel.subscription.subscription_id === null) {
            console.log(`Revoking Free Plan for user ${targetUserId}`);
            userToCancel.subscription.status = 'cancelled';
            userToCancel.subscription.availableSeconds = 0;
            await userToCancel.save();
            return res.json({ success: true, message: 'Free subscription revoked successfully' });
        }

        // 2. Paid Plan Logic
        const skybankSubId = userToCancel.subscription?.subscription_id;

        if (!skybankSubId) {
            console.warn(`User ${targetUserId} has no Skybank ID. Marking cancelled locally.`);
            // userToCancel.subscription.status = 'cancelled';
            // await userToCancel.save();
            return res.json({ success: true, message: 'Subscription marked cancelled locally (No Gateway ID found)' });
        }

        // 3. Skybank Call
        const cancelData = new URLSearchParams();
        cancelData.append('security_key', process.env.SKYBANK_SECURITY_KEY);
        cancelData.append('recurring', 'delete_subscription');
        cancelData.append('subscription_id', skybankSubId);

        console.log(`Cancelling Skybank sub ${skybankSubId} for user ${targetUserId}...`);

        const gatewayResponse = await axios.post(
            'https://secure.skybankgateway.com/api/transact.php',
            cancelData,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const responseParams = new URLSearchParams(gatewayResponse.data);
        const responseCode = responseParams.get('response');
        const responseText = responseParams.get('responsetext');

        if (responseCode === '1') {
            // Success response from API, but we no longer save the 'cancelled' status here.
            // The handleSubscriptionCanceled webhook will take care of updating the database!
            return res.json({ success: true, message: 'Subscription cancelled successfully via Gateway. Webhook will process the status update.' });
        } else {
            console.error('Gateway Cancel Error:', responseText);
            return res.status(400).json({ success: false, message: `Cancellation failed: ${responseText}` });
        }
        // --- CANCELLATION LOGIC END ---

    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

// backend/routes/verifyReceipt.js
// export async function verifyAppleReceipt(receipt, isSandbox = false) {
//     const url = isSandbox
//         ? 'https://sandbox.itunes.apple.com/verifyReceipt'
//         : 'https://buy.itunes.apple.com/verifyReceipt';

//     const response = await fetch(url, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//             'receipt-data': receipt,
//             'password': process.env.APPLE_SHARED_SECRET, // From App Store Connect
//             'exclude-old-transactions': true,
//         }),
//     });

//     const data = await response.json();

//     console.log("apple response", data);
//     // Sandbox detection (status 21007 = sandbox receipt)
//     if (data.status === 21007) {
//         return verifyAppleReceipt(receipt, true);
//     }

//     if (data.status !== 0) {
//         return { isValid: false, error: data.status };
//     }

//     // Find active subscription
//     const latestReceipt = data.latest_receipt_info || [];
//     const activeSubscription = latestReceipt.find(
//         (item) => item.expires_date_ms > Date.now()
//     );
//     console.log("latestReceipt", latestReceipt);
//     console.log("activeSubscription", activeSubscription);

//     return {
//         isValid: !!activeSubscription,
//         productId: activeSubscription?.product_id,
//         transactionId: activeSubscription?.transaction_id,
//         expirationDate: activeSubscription?.expires_date_ms,
//     };
// }

// export const verifyAppleReceiptHandler = async (req, res) => {
//     try {
//         // The receipt string might come as 'purchaseToken' from the payload you showed, or 'receipt'
//         const receiptData = req.body.purchaseToken || req.body.receipt;

//         if (!receiptData) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Receipt data (purchaseToken) is required in the request body'
//             });
//         }

//         // We can pass the receiptData to Apple's verification endpoint
//         const result = await verifyAppleReceipt(receiptData);

//         if (result.isValid) {
//             return res.json({ success: true, data: result, payload: req.body });
//         } else {
//             return res.status(400).json({ success: false, data: result, payload: req.body });
//         }
//     } catch (error) {
//         console.error('Apple receipt verification error:', error);
//         return res.status(500).json({
//             success: false,
//             message: 'Internal server error during receipt verification'
//         });
//     }
// };

export const verifyAppleReceiptHandler = async (req, res) => {
    const { transactionId, productId, environment } = req.body;
    const user_id = req.user?.id;
    if (!transactionId) {
        return res.status(400).json({ verified: false, error: 'Missing transactionId' });
    }

    const result = await verifyWithTransactionId(transactionId);
    console.log("result", result);

    if (result.verified) {
        const existingUser = await User.findById(user_id).select('_id professorClassCode subscription.plan_id').lean();

        // Update user subscription in DB
        await User.updateOne(
            { _id: user_id },
            {
                $set: {
                    'subscription.status': 'active',
                    'subscription.plan_id': result.productId,
                    'subscription.source_transaction_id': result.transactionId,
                    'subscription.original_transaction_id': result.originalTransactionId,
                    'subscription.source': 'apple_iap',
                    'subscription.expires_at': result.expiresDate,
                    'subscription.last_receipt_data': result.purchaseDate,
                    'subscription.availableSeconds': result.productId === 'KBASSUB15' ? 20 * HOUR_IN_SECONDS : result.productId === 'KPROSUB20' ? 100 * HOUR_IN_SECONDS : 0

                }
            }
        );

        await recordReferenceCodeSubscriptionEvent({
            user: existingUser,
            planId: result.productId,
            source: 'apple_iap',
            sourceTransactionId: result.transactionId,
            subscriptionId: result.originalTransactionId,
            eventType: existingUser?.subscription?.plan_id === 'free' ? 'initial' : 'resubscribe',
            occurredAt: result.purchaseDate || new Date()
        });
    }

    res.json(result);
};
