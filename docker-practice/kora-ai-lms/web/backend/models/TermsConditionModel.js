import mongoose from "mongoose";

const userIdSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    }
}, { timestamps: true });
const termsConditionSchema = new mongoose.Schema({
    key: {
        type: String,
        default: 'global',
        unique: true
    },
    title: {
        type: String,
        required: true,
        default: 'Terms and Conditions'
    },
    content: {
        type: String,
        required: true,
        default: 'Please update Terms and Conditions content.'
    },
    version: {
        type: String,
        required: true,
        default: "1.0"
    },
    acceptedUsers: [userIdSchema]
}, {
    timestamps: true
});

termsConditionSchema.statics.getSingleton = async function () {
    let doc = await this.findOne({ key: 'global' });
    if (!doc) {
        doc = await this.create({ key: 'global' });
    }
    return doc;
};

const TermsCondition = mongoose.model("terms_condition", termsConditionSchema);

export default TermsCondition;