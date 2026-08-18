import { Config } from "../models/config.js";

// Return the global settings singleton
export const getGlobalSettings = async (req, res) => {
  try {
    let role = req.user.role
    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admins only' });
    }
    const doc = await Config.getSingleton();
    return res.status(200).json({ success: true, settings: doc });
  } catch (err) {
    console.error('getGlobalSettings error', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Update translation or aiIntegration or full settings payload
export const updateGlobalSettings = async (req, res) => {
  try {
    let role = req.user.role
    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admins only' });
    }
    const payload = req.body || {};
    let doc = await Config.getSingleton();

    // Only allow editing of known fields
    if (payload.translation) doc.translation = payload.translation;
    if (payload.aiIntegration) doc.aiIntegration = payload.aiIntegration;
    if (Array.isArray(payload.models)) doc.models = payload.models;

    await doc.save();
    return res.status(200).json({ success: true, settings: doc });
  } catch (err) {
    console.error('updateGlobalSettings error', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Add a new model entry to models[]
export const addModel = async (req, res) => {
  try {
    let role = req.user.role
    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admins only' });
    }
    const { name, apiKey } = req.body || {};
    if (!name || !apiKey) {
      return res.status(400).json({ success: false, message: 'name and apiKey are required' });
    }
    let doc = await Config.getSingleton();

    doc.models = doc.models || [];
    doc.models.push({ name, apiKey });
    await doc.save();
    return res.status(201).json({ success: true, model: { name, apiKey }, settings: doc });
  } catch (err) {
    console.error('addModel error', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
