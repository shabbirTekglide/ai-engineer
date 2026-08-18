import axios from "axios";
import ContactUs from "../models/contactUs.js";

const createContactUs = async (req, res) => {
    try {
        // 1. Data extraction from validated middleware
        const { firstName, lastName, email, message } = req.validated;

        // 2. Database Entry
        let contactUsEntry;
        try {
            contactUsEntry = new ContactUs({ firstName, lastName, email, message });
            await contactUsEntry.save();
        } catch (dbError) {
            console.error('Database Save Error:', dbError);
            return res.status(400).json({ success: false, message: 'Could not save entry to database' });
        }

        // 3. Freshdesk Ticket Creation
        const payload = {
            email,
            subject: `Kora Contact-Us Inquiry`,
            description: `Name: ${firstName} ${lastName}\nEmail: ${email}\nMessage: ${message}`,
            priority: 1,
            status: 2,
            type: "Website Inquiry",
            tags: ["kora"],
            group_id: 4000015388,
        };

        try {
            // Freshdesk requires Basic Auth (API_KEY:X)
            const authHeader = Buffer.from(`${process.env.FRESHDESK_API_KEY}:X`).toString('base64');

            await axios.post(
                `${process.env.FRESHDESK_DOMAIN}/api/v2/tickets`,
                payload, {
                auth: {
                    username: process.env.FRESHDESK_API_KEY,
                    password: 'X'
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
            );

        } catch (apiError) {
            // Log specific Freshdesk error details
            if (apiError.response) {
                console.error('Freshdesk API Error:', apiError.response.data);
                // Note: Entry saved in DB but ticket failed. 
                // You might want to notify admin or retry.
            } else {
                console.error('Network Error during Freshdesk call:', apiError.message);
            }
            // Optional: User ko success hi bhejein kyunki DB mein save ho gaya hai? 
            // Ya failure? Yahan success bhej rahe hain with a warning log.
        }

        return res.status(201).json({
            success: true,
            message: 'Message received! Our team will get back to you shortly.'
        });

    } catch (error) {
        console.error('Unexpected Global Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong on our end. Please try again later.'
        });
    }
};

export { createContactUs };