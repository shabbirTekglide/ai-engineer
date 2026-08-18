import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.ionos.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Verify transporter connection
transporter.verify((error, success) => {
    if (error) {
        console.error('Error with email transporter:', error);
    } else {
        console.log('Email transporter is ready to send messages');
    }
});

// Send Email Notification Function
export const sendEmail = async (to, subject, html) => {
    try {
        const mailOptions = {
            from: `"Your Company Name" <${process.env.EMAIL}>`,
            to,
            subject,
            html,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error('Failed to send email:', error);
    }
};

export default transporter;