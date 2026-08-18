import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import AppleStrategy from 'passport-apple';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google Profile Received:', profile);

        // Check if user exists with Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
            return done(null, user);
        }

        // Check if user exists with email
        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            user.isVerified = true;
            await user.save();
            return done(null, user);
        }

        // Create new user
        const newUser = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            // name: profile.displayName,
            // avatar: profile.photos?.[0]?.value,
            role: 'student', // Default role
            isVerified: true,
            authProvider: 'google'
        });

        await newUser.save();
        return done(null, newUser);

    } catch (error) {
        console.error('Error in Google Strategy:', error);
        return done(error, null);
    }
}));

// Apple Auth Strategy
passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    callbackURL: process.env.APPLE_CALLBACK_URL || `${process.env.BACKEND_URL}/api/auth/apple/callback`,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyString: process.env.APPLE_PRIVATE_KEY ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, idToken, done) => {
    try {
        // Decode idToken to get user data (profile is empty)
        let appleUserId = null;
        let email = null;
        let emailVerified = false;

        if (!idToken) {
            return done(new Error('No idToken received from Apple'), null);
        }

        try {
            // Decode idToken to get user data (profile is empty)
            const parts = idToken.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('payload', payload)
            appleUserId = payload.sub;
            email = payload.email;
            emailVerified = payload.email_verified === true;
            console.log('✅ Apple user data:', { appleUserId, email, emailVerified });
        } catch (err) {
            console.error('Failed to decode Apple idToken', err);
            return done(new Error('Invalid idToken'), null);
        }

        if (!appleUserId) {
            return done(new Error('Missing Apple ID (sub) in idToken'), null);
        }

        // Find or create user
        let user = await User.findOne({ appleId: appleUserId });
        if (user) {
            console.log(`Existing Apple user: ${user._id}`);
            return done(null, user);
        }

        // Optional: decide what to do if email already exists
        if (email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                // ❌ Reject to avoid unexpected linking (recommended)
                // return done(new Error(`An account with email ${email} already exists. Please log in with that method first.`), null);

                // ✅ Or link automatically (uncomment if you want old behaviour)
                existingUser.appleId = appleUserId;
                await existingUser.save();
                return done(null, existingUser);
            }
        }

        // Create new user
        const newUser = new User({
            appleId: appleUserId,
            email: email || null,
            isVerified: emailVerified,
            role: 'student',
            authProvider: 'apple'
        });

        // Save name if provided (only first time)
        if (req.body && req.body.user) {
            try {
                const appleUser = JSON.parse(req.body.user);
                if (appleUser.name) {
                    const { firstName, lastName } = appleUser.name;
                    newUser.name = `${firstName || ''} ${lastName || ''}`.trim();
                }
            } catch (err) {
                console.error('Error parsing Apple user object', err);
            }
        }

        await newUser.save();
        console.log(`✅ New Apple user created: ${newUser._id}`);
        return done(null, newUser);

    } catch (error) {
        console.error('Apple Strategy error:', error);
        return done(error, null);
    }
}));
export default passport;