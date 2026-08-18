import User from '../models/User.js';
import Session from '../models/session.js';
import dotenv from 'dotenv/config';
import { resetPasswordToken, verifyToken, signAccess } from '../services/tokenService.js';
import jwt from "jsonwebtoken";
import { getClientIp, lookupGeo } from "../utils/ipUtil.js";
import moment from 'moment';
import { forgetPasswordEmail, passwordChangeEmail, resetPasswordEmail, sendOtpEmail, welcomeOnboardEmail } from '../utils/emailHelper.js';
import passport from '../config/passport.js';
import Class from '../models/class.js';
import lecture from '../models/lecture.js';
import ChatThread from '../models/chatThreads.js';
import { sanitize } from '../utils/sanitize.js';
import s3 from '../config/s3-storage.js';
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import axios from 'axios';
// export const googleAuth = (req, res, next) => {
//     passport.authenticate('google', {
//         scope: ['profile', 'email']
//     })(req, res, next);
// };
export const googleAuth = (req, res, next) => {
  // Frontend se "platform" aur "redirectUri" query params mein aayenge
  const { platform, redirectUri } = req.query;

  // State object banayein taaki callback mein wapis mile
  const state = JSON.stringify({
    platform: platform || 'web',
    redirectUri: redirectUri || ''
  });

  // Base64 encode state for safety
  const encodedState = Buffer.from(state).toString('base64');

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: encodedState, // Google ye state wapis callback mein bhejega
    session: false
  })(req, res, next);
};
// Google OAuth Callback
// export const googleCallback = (req, res, next) => {
//     passport.authenticate('google', { session: false }, async (err, user, info) => {
//         try {
//             if (err) {
//                 console.error('Google OAuth Error:', err);
//                 return res.redirect(`${process.env.STORE_URL}/login?error=oauth_failed`);
//             }

//             if (!user) {
//                 return res.redirect(`${process.env.STORE_URL}/login?error=user_not_found`);
//             }

//             // Create session for the user (same as regular login)
//             const ip = getClientIp(req);
//             const geo = lookupGeo(ip);

//             const session = await Session.create({
//                 userId: user._id,
//                 userAgent: req.get('user-agent'),
//                 ip,
//                 location: geo || undefined,
//                 lastUsedAt: new Date()
//             });

//             // Generate JWT token
//             const token = signAccess(user, session._id);

//             // Redirect to frontend with token
//             const userData = {
//                 id: user._id,
//                 email: user.email,
//                 name: user.name,
//                 role: user.role,
//                 avatar: user.avatar
//             };

//             return res.redirect(`http://localhost:5173/auth/success?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`);

//         } catch (error) {
//             console.error('Google Callback Error:', error);
//             return res.redirect(`http://localhost:5173/login?error=server_error`);
//         }
//     })(req, res, next);
// };
export const googleCallback = (req, res, next) => {
  passport.authenticate('google', { session: false }, async (err, user, info) => {
    // State ko decode karein
    let platform = 'web';
    let customRedirectUri = null;

    try {
      if (req.query.state) {
        const decodedState = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
        platform = decodedState.platform;
        customRedirectUri = decodedState.redirectUri;
      }
    } catch (e) {
      console.error("State decode error", e);
    }

    // Error Handling URLs
    const webFailUrl = `${process.env.STORE_URL}/login?error=oauth_failed`;
    // Mobile fail URL (Deep Link) - Adjust scheme 'kora' to your app scheme
    const mobileFailUrl = customRedirectUri
      ? `${customRedirectUri}?error=oauth_failed`
      : `exp://localhost:8081/--/login?error=oauth_failed`;

    const failRedirect = platform === 'mobile' ? mobileFailUrl : webFailUrl;

    try {
      if (err || !user) {
        console.error('Google OAuth Error:', err);
        return res.redirect(failRedirect);
      }

      // Create Session
      const ip = getClientIp(req);
      const geo = lookupGeo(ip);

      const session = await Session.create({
        userId: user._id,
        userAgent: req.get('user-agent'),
        ip,
        location: geo || undefined,
        lastUsedAt: new Date()
      });

      const token = signAccess(user, session._id);

      // User Data for Frontend
      const userData = JSON.stringify({
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      });

      // *** DYNAMIC REDIRECT LOGIC ***
      if (platform === 'mobile') {
        // Mobile Redirect (Deep Link)
        // Agar customRedirectUri (jo Expo bhejega) available hai toh uspe bhejo
        // URL structure: exp://.../auth/success?token=...
        const targetUrl = customRedirectUri || "exp://localhost:8081/--/";
        return res.redirect(`${targetUrl}?token=${token}&user=${encodeURIComponent(userData)}`);
      } else {
        // Web Redirect (Existing Logic)
        return res.redirect(`${process.env.STORE_URL}/auth/success?token=${token}&user=${encodeURIComponent(userData)}`);
      }

    } catch (error) {
      console.error('Google Callback Error:', error);
      return res.redirect(failRedirect);
    }
  })(req, res, next);
};

export const appleAuth = (req, res, next) => {
  const { platform, redirectUri } = req.query;

  const state = JSON.stringify({
    platform: platform || 'web',
    redirectUri: redirectUri || ''
  });

  const encodedState = Buffer.from(state).toString('base64');

  passport.authenticate('apple', {
    state: encodedState,
    session: false
  })(req, res, next);
};

export const appleCallback = (req, res, next) => {
  passport.authenticate('apple', { session: false }, async (err, user, info) => {
    let platform = 'web';
    let customRedirectUri = null;

    try {
      // Apple state could be in req.body or req.query
      const stateStr = req.body?.state || req.query?.state;
      if (stateStr) {
        const decodedState = JSON.parse(Buffer.from(stateStr, 'base64').toString());
        platform = decodedState.platform;
        customRedirectUri = decodedState.redirectUri;
      }
    } catch (e) {
      console.error("State decode error", e);
    }

    const webFailUrl = `${process.env.STORE_URL}/login?error=oauth_failed`;
    const mobileFailUrl = customRedirectUri
      ? `${customRedirectUri}?error=oauth_failed`
      : `exp://localhost:8081/--/login?error=oauth_failed`;

    const failRedirect = platform === 'mobile' ? mobileFailUrl : webFailUrl;

    try {
      if (err || !user) {
        console.error('Apple OAuth Error:', err);
        return res.redirect(failRedirect);
      }

      const ip = getClientIp(req);
      const geo = lookupGeo(ip);

      const session = await Session.create({
        userId: user._id,
        userAgent: req.get('user-agent'),
        ip,
        location: geo || undefined,
        lastUsedAt: new Date()
      });

      const token = signAccess(user, session._id);

      const userData = JSON.stringify({
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      });

      if (platform === 'mobile') {
        const targetUrl = customRedirectUri || "exp://localhost:8081/--/";
        return res.redirect(`${targetUrl}?token=${token}&user=${encodeURIComponent(userData)}`);
      } else {
        return res.redirect(`${process.env.STORE_URL}/auth/success?token=${token}&user=${encodeURIComponent(userData)}`);
      }
    } catch (error) {
      console.error('Apple Callback Error:', error);
      return res.redirect(failRedirect);
    }
  })(req, res, next);
};

// Get current user (updated)
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp -otpExpiry');
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        // name: user.name,
        role: user.role,
        // avatar: user.avatar,
        authProvider: user.authProvider,
        isVerified: user.isVerified,
        subscription_tier: user.subscription_tier,
        has_active_subscription: user.has_active_subscription
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
export const sendOtp = async (req, res) => {
  try {
    const { email, name } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists && userExists.isVerified == true) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes

    // Create or update user with OTP
    let user = await User.findOneAndUpdate(
      { email },
      { otp, otpExpiry, isVerified: false },
      { upsert: true, new: true }
    );

    try {
      // Send OTP Email
      await sendOtpEmail(email, name, otp);
    } catch (error) {
      console.error('Email sending failed:', error.message);
      return res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
    }

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.status(200).json({ message: 'OTP verified. Please set your password.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const setPassword = async (req, res) => {
  try {
    const { email, password, confirm_password } = req.body;

    if (password != confirm_password) {
      return res.status(500).json({ message: 'Please add the similar password in confirm password field' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return res.status(400).json({ message: 'User not verified or not found' });
    }

    user.password = password;
    await user.save();
    await welcomeOnboardEmail(email, user.isVerified);
    res.status(200).json({ message: 'Password set successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login Authentication Controller
export const login = async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user || !(user.role === role)) {
      return res.status(401).json({ message: 'you are not authenticated for this' });
    }
    // Create a new session first
    const ip = getClientIp(req);
    const geo = lookupGeo(ip);

    const session = await Session.create({
      userId: user._id,
      userAgent: req.get('user-agent'),
      ip,
      location: geo || undefined,
      lastUsedAt: new Date()
    });

    // Sign a JWT that carries this session id
    const token = signAccess(user, session._id);

    return res.status(200).json({ message: 'Login successful', token });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};



export const changePassword = async (req, res) => {
  const { oldPassword, newPassword, confirmNewPassword, token } = req.body;

  if (!oldPassword || !newPassword || !confirmNewPassword || !token) {
    return res.status(400).send({ message: "All fields are required." });
  }
  if (oldPassword === newPassword) {
    return res.status(400).send({ message: "New Password must be different from Old Password." });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).send({ message: "New Password & Confirm Password do not match." });
  }
  try {
    const tokenVerify = verifyToken(token);
    if (!tokenVerify) {
      return res.status(401).send({ message: "Invalid token" });
    }
    const user = await User.findById(tokenVerify.sub);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    const passwordStatus = await user.comparePassword(oldPassword);
    if (!passwordStatus) {
      return res.status(401).send({ message: "Incorrect old password" });
    }
    user.password = newPassword;  // You should hash it before saving in production
    await user.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    const changedAt = moment().format('MMMM Do YYYY, h:mm:ss a');
    const userEmail = user.email;
    console.log('userEmail from changePassword', userEmail);
    await passwordChangeEmail(user.email, user.role, changedAt);

    res.status(200).send({ message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Something went wrong. Please contact support." });
  }
};

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    const token = resetPasswordToken(user);
    const response = await forgetPasswordEmail(email, token);
    if (!response.success) {
      return res.status(500).json(response);
    }
    return res.status(200).json(response);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Reset Password Link 
export const resetPassword = async (req, res) => {
  try {
    const tokenVerify = verifyToken(req.params.token);
    const { newPassword, confirmNewPassword } = req.body;
    console.log(tokenVerify);
    if (!newPassword || !confirmNewPassword || newPassword !== confirmNewPassword) {
      return res.status(500).send({ message: "Password fields not matched. Verify the data and try again" });
    }
    if (!tokenVerify) {
      return res.status(401).send({ message: "Invalid token" });
    }
    const user = await User.findOne({ _id: tokenVerify.id });
    if (!user) {
      return res.status(401).send({ message: "no user found" });
    }
    user.password = req.body.newPassword;
    await user.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    const changedAt = moment().format('MMMM Do YYYY, h:mm:52 a'); // Example: "May 21st 2025, 3:14:52 pm"
    await resetPasswordEmail(user.email, changedAt);
    res.status(200).send({ message: "Password updated successfully" });

  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Fetch User Authentication Controller
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// export const logout = async (req, res) => {
//   try {
//     const { userId, sid } = req.user || {};
//     if (!sid) return res.status(400).json({ message: 'Missing session id on request' });

//     // Revoke only this session (the one bound to the JWT)
//     const session = await Session.findOne({ _id: sid, userId, revokedAt: null });
//     if (!session) {
//       // Already revoked or not found; treat as idempotent logout
//       return res.json({ success: true, message: 'Logged out' });
//     }

//     session.revokedAt = new Date();
//     await session.save();

//     return res.json({ success: true, message: 'Logged out' });
//   } catch (e) {
//     return res.status(500).json({ message: 'Server error', error: e.message });
//   }
// };

export const logout = async (req, res) => {
  try {
    // Get token from header
    const hdr = req.get('authorization') || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    console.log('hdr', hdr)
    console.log('token', token)
    if (!token) {
      // If no token, just return success since user is already logged out
      return res.json({ success: true, message: 'Logged out' });
    }

    // Use jwt.decode instead of verifyToken to get payload even if token is expired
    const payload = jwt.decode(token);
    console.log('payload', payload)

    if (payload && payload.sid) {
      // If we have a session id in the payload, try to revoke that session
      const session = await Session.findOne({
        _id: payload.sid,
        revokedAt: null
      });

      if (session) {
        session.revokedAt = new Date();
        await session.save();
        console.log('revoked successfully')
      }
    }

    return res.json({ success: true, message: 'Logged out' });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required for security verification' });
    }

    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Security Check: Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect Password' });
    }

    const operations = [];

    // 0. Cancel Skybank Subscription
    if (user.subscription?.source === 'skybank' && user.subscription?.subscription_id) {
      operations.push(
        (async () => {
          try {
            const skybankSubId = user.subscription.subscription_id;
            console.log(`[AuthController] Cancelling Skybank sub ${skybankSubId} for deleted user ${userId}...`);

            const cancelData = new URLSearchParams();
            cancelData.append('security_key', process.env.SKYBANK_SECURITY_KEY);
            cancelData.append('recurring', 'delete_subscription');
            cancelData.append('subscription_id', skybankSubId);

            const gatewayResponse = await axios.post(
              'https://secure.skybankgateway.com/api/transact.php',
              cancelData,
              { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const responseParams = new URLSearchParams(gatewayResponse.data);
            if (responseParams.get('response') === '1') {
              console.log(`[AuthController] Skybank subscription cancelled successfully for ${userId}`);
            } else {
              console.error(`[AuthController] Skybank cancellation failed:`, responseParams.get('responsetext'));
            }
          } catch (err) {
            console.error('[AuthController] Error cancelling Skybank subscription:', err.message || err);
          }
        })()
      );
    }

    // 1. Delete all AWS S3 assets for this user (their entire user folder)
    operations.push(
      (async () => {
        try {
          const userEmail = user.email;
          if (!userEmail) return;

          const folderPrefix = `${sanitize(userEmail)}/`;
          console.log('[AuthController] Deleting AWS S3 folder for', folderPrefix);

          if (process.env.AWS_ACCESS_KEY_ID) {
            const listParams = { Bucket: process.env.AWS_S3_BUCKET, Prefix: folderPrefix };
            const listedObjects = await s3.send(new ListObjectsV2Command(listParams));

            if (listedObjects.Contents && listedObjects.Contents.length > 0) {
              const deleteParams = {
                Bucket: process.env.AWS_S3_BUCKET,
                Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) }
              };
              await s3.send(new DeleteObjectsCommand(deleteParams));
              console.log(`[AuthController] Deleted ${listedObjects.Contents.length} objects from S3`);
            }
          }
        } catch (err) {
          console.error('[AuthController] Error deleting AWS folder:', err.message || err);
        }
      })()
    );

    // 2. Delete all lectures owned by the user
    operations.push(
      (async () => {
        try {
          const lectures = await lecture.find({ ownerId: userId }).select('_id');
          const deletePromises = lectures.map(l =>
            lecture.findByIdAndDelete(l._id).catch(e =>
              console.error('[AuthController] Failed to delete lecture', l._id, e.message)
            )
          );
          await Promise.all(deletePromises);
        } catch (err) {
          console.error('[AuthController] Error finding/deleting lectures:', err.message || err);
        }
      })()
    );

    // 3. Delete all chat threads owned by the user
    operations.push(
      ChatThread.deleteMany({ ownerId: userId })
        .catch(err => console.error('[AuthController] Failed to delete chat threads:', err.message))
    );

    // 4. Delete all classes owned by the user
    operations.push(
      Class.deleteMany({ ownerId: userId })
        .catch(err => console.error('[AuthController] Failed to delete classes:', err.message))
    );

    // 5. Delete all sessions for the user
    operations.push(
      Session.deleteMany({ userId: userId })
        .catch(err => console.error('[AuthController] Failed to delete sessions:', err.message))
    );

    // Run all tasks (AWS, lectures, chat-threads, classes, sessions) CONCURRENTLY!
    await Promise.allSettled(operations);

    // Finally delete the user document
    await User.findByIdAndDelete(userId);

    res.status(200).json({ success: true, message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};