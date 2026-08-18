import mongoose from "mongoose";
import { sendContactUsEmail } from "../utils/emailHelper.js";

const contactUsSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// // Post-save middleware – sends email after document is saved
// contactUsSchema.post('save', function(doc) {
//     // Fire-and-forget: don't await, catch errors to avoid crashing the save operation
//     sendContactUsEmail(doc.firstName, doc.lastName, doc.email, doc.message)
//         .catch(err => console.error('Failed to send contact email:', err));
// });

const ContactUs = mongoose.model("ContactUs", contactUsSchema);

export default ContactUs;