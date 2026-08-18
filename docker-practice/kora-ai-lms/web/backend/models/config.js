import mongoose from "mongoose";

const IntegrationModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiKey: { type: String, required: true },
}, { _id: false });
// Setting schema snippet
const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  models: { type: [IntegrationModelSchema], default: [] },
  translation: { modelName: String, apiKey: String },
  aiIntegration: { modelName: String, apiKey: String },
}, { timestamps: true });

ConfigSchema.statics.getSingleton = async function() {
  // Return a Mongoose document (not a lean/plain object) so callers can call .save()
  let doc = await this.findOne({ key: 'global' });
  if (!doc) {
    doc = await this.create({ key: 'global' });
  }
  return doc;
};

export const Config = mongoose.model('Config', ConfigSchema);