import express from 'express';
const router = express.Router();
import { koraAboutUs, koraContact, koraDisclaimer, koraFaq, koraFeatures, koraHome, koraPricing, koraPrivacy, koraTerms } from '../../controllers/cmscontrollers/home.js';

// Homepage
router.get('/', koraHome);
// About Us Page
router.get('/about', koraAboutUs);

// Pricing Page
router.get('/pricing', koraPricing);

// FAQ Page
router.get('/faq', koraFaq);

// Features Page
router.get('/features', koraFeatures);

// Privacy Policy Page
router.get('/privacy-policy', koraPrivacy);

// TERMS & CONDITION Page
router.get('/terms', koraTerms);

// AI DISCLAIMER Page
router.get('/ai-disclaimer', koraDisclaimer);

// CONTCAT US Page
router.get('/contact', koraContact);




export default router;
