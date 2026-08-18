import transporter from './emailService.js';
import path from 'path';
import ejs from 'ejs';
import { capitalize } from './helpers.js';

const renderTemplate = async (templatePath, data = {}) => {
  return await ejs.renderFile(templatePath, data);
};

// ============================================================================
// =========================== AUTHENTICATION EMAILS ==========================
// ============================================================================

/**
 * Auth - Borrower / Investor - Signup - Send OTP emails 
 * 
 * @param {String} email
 * @param {String} otp
 */
export const sendOtpEmail = async (email, name, otp) => {
  const templatePath = path.join(process.cwd(), 'utils/emails/templates/authentication/otp-email.ejs');
  const html = await renderTemplate(templatePath, { otp, name });

  return transporter.sendMail({
    from: `"Rubitt" <${process.env.EMAIL}>`,
    to: email,
    subject: 'Your Rubitt verification code',
    html,
  });
};

/**
 * Auth - Login 2FA - Send Login OTP emails 
 * 
 * @param {String} email
 * @param {String} otp
 * @param {String} role
 */
export const sendLoginOtpEmail = async (email, otp, role) => {
  const templatePath = path.join(process.cwd(), 'utils/emails/templates/authentication/login-otp-email.ejs');
  const html = await renderTemplate(templatePath, {
    otp,
    role: capitalize(role),
    email
  });

  return transporter.sendMail({
    from: `"Rubitt" <${process.env.EMAIL}>`,
    to: email,
    subject: 'Your Login OTP - Two-Factor Authentication',
    html,
  });
};

/**
 * Auth - Borrower / Investor - Forget Password | password reset link
 * 
 * @param {String} email
 * @param {String} token
 */
export const forgetPasswordEmail = async (email, token) => {
  try {
    console.log('userEmail ' + email);
    const templatePath = path.join(
      process.cwd(),
      'utils/emails/templates/authentication/forgot-password.ejs'
    );
    const userEmail = email.split('@')[0];
    const html = await renderTemplate(templatePath, {
      storeUrl: process.env.STORE_URL,
      token,
      emailUsername: userEmail.charAt(0).toUpperCase() + userEmail.slice(1)
    });

    await transporter.sendMail({
      from: `"Rubitt" <${process.env.EMAIL}>`,
      to: email,
      subject: 'Reset Your Password',
      html,
    });

    return { success: true, message: 'Password reset link sent successfully' };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return { success: false, message: 'Failed to send password link. Please try again later.' };
  }
};

/**
 * Auth - Borrower / Investor - Changed Password Email Notification
 * 
 * @param {String} email
 * @param {String} changedAt
 */
export const resetPasswordEmail = async (email, changedAt) => {
  try {
    const templatePath = path.join(
      process.cwd(),
      'utils/emails/templates/authentication/password-changed.ejs'
    );

    // Derive a simple userName from the email (part before @)
    const userName = (email || '').split('@')[0];

    const html = await renderTemplate(templatePath, { changedAt, userName });

    await transporter.sendMail({
      from: `"Rubitt" <${process.env.EMAIL}>`,
      to: email,
      subject: 'Your Password Has Been Changed',
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending password change confirmation:', error);
    return { success: false };
  }
};

/**
 * Sends password change confirmation email
 * 
 * @param {String} userEmail
 * @param {String} role - user role (borrower, investor, admin, loan-admin)
 */
export const passwordChangeEmail = async (userEmail, role, changedAt) => {
  console.log('Inside passwordChangeEmail function', userEmail, role, changedAt);
  try {
    const userName = userEmail.split('@')[0]; // Extract username before '@'
    console.log('userName', userName);
    console.log('userEmail', userEmail);
    console.log('role', role);
    console.log('changedAt', changedAt);
    const templatePath = path.join(
      process.cwd(),
      'utils/emails/templates/authentication/password-changed-email.ejs'
    );

    const html = await renderTemplate(templatePath, {
      userEmail,
      userName,
      role,
      changedAt
    });

    await transporter.sendMail({
      from: `"Rubitt" <${process.env.EMAIL}>`,
      to: userEmail,
      subject: 'Your Rubitt learning Password Was Changed',
      html,
    });

    return { success: true };
  } catch (err) {
    console.error('Error sending password change email:', err);
    return { success: false };
  }
};

/**
 * Auth - Borrower / Investor - Welcome Onboard email
 * 
 * @param {String} userEmail
 * @param {String} accountStatus
 */
export const welcomeOnboardEmail = async (userEmail, accountStatus) => {
  try {
    const templatePath = path.join(
      process.cwd(),
      'utils/emails/templates/authentication/welcome-onboard-email.ejs'
    );

    // Extract username before @
    const userName = userEmail.split('@')[0];

    const html = await renderTemplate(templatePath, {
      userName,
      accountStatus
    });

    await transporter.sendMail({
      from: `"Rubitt" <${process.env.EMAIL}>`,
      to: userEmail,
      subject: 'Rubitt learning - Welcome on board',
      html,
    });

    return { success: true };
  } catch (err) {
    console.error('Error sending onboarding email to the user:', err);
    return { success: false };
  }
};

// -----------------------------------------------------------------------------------------------
// =========================== AI PROMOCODE EMAILS ==========================
// -----------------------------------------------------------------------------------------------

/**
 * AI - Borrower / Investor - Promocode - Send Promocode emails 
 * 
 * @param {String} promocode
 * @param {String} description
 * @param {String} expiryDate
 * @param {String} uses
 * @param {String} emails
 * @param {String} plan
 */
export const sendPromocodeEmail = async (promocode, description, expiryDate, uses, emails, plan) => {
  const templatePath = path.join(process.cwd(), 'utils/emails/templates/payment/promocode-email.ejs');

  // Loop through each recipient to send personalized emails
  for (const email of emails) {
    // Render the template with the current email
    const html = await renderTemplate(templatePath, {
      promocode,
      description,
      expiryDate,
      uses,
      email,          // personalise for this recipient
      plan            // if your template uses it, otherwise it's ignored
    });

    await transporter.sendMail({
      from: `"Rubitt" <${process.env.EMAIL}>`,
      to: email,
      subject: 'Your Rubitt promocode',
      html,
    });
  }
};



// Contact Us Form Submission

export const sendContactUsEmail = async (firstName, lastName, email, message) => {
  const templatePath = path.join(process.cwd(), 'utils/emails/templates/authentication/contact-us-email.ejs');
  const html = await renderTemplate(templatePath, { firstName, lastName, email, message });

  await transporter.sendMail({
    from: `"<${firstName} ${lastName}>" <${process.env.EMAIL}>`,
    to: "support@koralearning.com", // Your support email
    subject: 'New Contact Us Message',
    replyTo: email,
    html,
  });
};