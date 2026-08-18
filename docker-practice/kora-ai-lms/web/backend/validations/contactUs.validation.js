import z from "zod";

const contactUsSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    message: z.string()
});

export default contactUsSchema;
