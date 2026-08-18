import {
    AppStoreServerAPIClient,
    Environment,
    SignedDataVerifier,
    ProductType,
    Order
} from '@apple/app-store-server-library';
import fs from 'fs';

// Credentials load karein (.env se)
const issuerId = process.env.APPLE_ISSUER_ID;
const keyId = process.env.APPLE_KORA_KEY_ID;
const bundleId = process.env.APPLE_BUNDLE_ID;
const privateKey = process.env.APPLE_SUBSCRIPTION_PRIVATE_KEY; // .p8 file ka content
const AppleId = process.env.APPLE_ID;

const environment = Environment.SANDBOX;

const client = new AppStoreServerAPIClient(
    privateKey,
    keyId,
    issuerId,
    bundleId,
    environment,
);

// Optional: JWS verifier (receipt nahi hai toh zaroori nahi, lekin rakhte hain)
const appleRootCAs = [fs.readFileSync('AppleRootCA-G3.cer')];
const verifier = new SignedDataVerifier(
    appleRootCAs, // appleRootCAs needs to be an array, not a boolean
    true,
    environment,
    bundleId,
    // AppleId
);

// Main verification function
export async function verifyWithTransactionId(transactionId) {
    try {
        // Step 1: Get transaction info
        const transactionResponse = await client.getTransactionInfo(transactionId);

        // The response contains signedTransactionInfo (JWS)
        const decodedTransaction = await verifier.verifyAndDecodeTransaction(
            transactionResponse.signedTransactionInfo
        );
        console.log("decodedTransaction", decodedTransaction);

        // Check expiry for subscriptions
        const now = Date.now();
        const expiresDate = parseInt(decodedTransaction.expiresDate);

        if (expiresDate < now) {
            return {
                verified: false,
                error: 'Subscription expired',
                transaction: decodedTransaction
            };
        }

        // Optionally fetch full history using originalTransactionId
        const originalId = decodedTransaction.originalTransactionId;
        const history = await client.getTransactionHistory(
            originalId,
            null,
            {
                productTypes: [ProductType.AUTO_RENEWABLE],
                sort: Order.DESCENDING,
                revoked: false,
            }
        );

        let activeSubscription = null;
        for (const signedTx of history.signedTransactions) {
            const tx = await verifier.verifyAndDecodeTransaction(signedTx);
            if (parseInt(tx.expiresDate) > now) {
                activeSubscription = tx;
                break;
            }
        }

        return {
            verified: true,
            productId: decodedTransaction.productId,
            transactionId: decodedTransaction.transactionId,
            originalTransactionId: originalId,
            expiresDate: decodedTransaction.expiresDate,
            isActive: !!activeSubscription,
            purchaseDate: decodedTransaction.purchaseDate,
            willAutoRenew: decodedTransaction.autoRenewStatus === 1,
        };

    } catch (error) {
        console.error('Verification error:', error);
        return { verified: false, error: error.message };
    }
}