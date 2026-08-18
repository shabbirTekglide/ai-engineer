import TermsCondition from "../models/TermsConditionModel.js";

export const getTermsCondition = async (req, res) => {
    try {
        const userId = req.user?.id;
        const termsCondition = await TermsCondition.getSingleton();
        if (!termsCondition) {
            return res.status(404).json({ success: false, message: "Terms and Conditions not found" });
        }
        const isAccepted = termsCondition.acceptedUsers.some(item => item.userId?.toString() === userId.toString());
        if (!isAccepted) {
            return res.status(200).json({ success: true, accepted: false, data: termsCondition });
        } else {
            return res.status(200).json({ success: true, accepted: true, message: "Terms and Conditions already accepted" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const acceptTermsCondition = async (req, res) => {
    try {
        const userId = req.user?.id;
        const termsCondition = await TermsCondition.getSingleton();
        if (!termsCondition) {
            return res.status(404).json({ success: false, message: "Terms and Conditions not found" });
        }
        const isAccepted = termsCondition.acceptedUsers.some(item => item.userId?.toString() === userId.toString());
        if (!isAccepted) {
            termsCondition.acceptedUsers.push({ userId });
            await termsCondition.save();
            return res.status(200).json({ success: true, accepted: true, message: "Terms and Conditions accepted successfully" });
        } else {
            return res.status(200).json({ success: true, accepted: true, message: "Terms and Conditions already accepted" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTermsCondition = async (req, res) => {
    try {
        const { title, content, version } = req.body;
        const termsCondition = await TermsCondition.getSingleton();
        if (!termsCondition) {
            return res.status(404).json({ success: false, message: "Terms and Conditions not found" });
        }

        // If version is updated, clear acceptedUsers
        if (version && version !== termsCondition.version) {
            termsCondition.acceptedUsers = [];
        }

        termsCondition.title = title || termsCondition.title;
        termsCondition.content = content || termsCondition.content;
        termsCondition.version = version || termsCondition.version;

        await termsCondition.save();
        return res.status(200).json({ success: true, message: "Terms and Conditions updated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};