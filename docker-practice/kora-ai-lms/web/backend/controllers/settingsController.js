import { Setting } from "../models/setting.js";

export const toggleNotificationEnable = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - User ID required'
      });
    }

    // Get current settings or create if doesn't exist
    let settings = await Setting.findOne({ userId });
    
    if (!settings) {
      // Create new settings with default values
      settings = new Setting({ userId });
    }

    // Toggle the notificationEnabled field
    const newNotificationState = !settings.notificationEnabled;
    settings.notificationEnabled = newNotificationState;

    // Save the updated settings
    await settings.save();

    return res.status(200).json({
      success: true,
      message: `Notifications ${newNotificationState ? 'enabled' : 'disabled'} successfully`,
      notificationEnabled: settings.notificationEnabled

    });

  } catch (error) {
    console.error('Toggle notification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating notification settings',
      error: error.message
    });
  }
};

export const toggleStudyReminder = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - User ID required'
      });
    }

    // Get current settings or create if doesn't exist
    let settings = await Setting.findOne({ userId });
    
    if (!settings) {
      // Create new settings with default values
      settings = new Setting({ userId });
    }
    console.log('setting', settings)
    // Toggle the notificationEnabled field
    const newNotificationState = !settings.studyReminders;
    settings.studyReminders = newNotificationState;

    // Save the updated settings
    await settings.save();

    return res.status(200).json({
      success: true,
      message: `Notifications ${settings.studyReminders ? 'enabled' : 'disabled'} successfully`,
      studyReminders: settings.studyReminders
      
    });

  } catch (error) {
    console.error('Toggle studyReminder error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating notification settings',
      error: error.message
    });
  }
};

export const getSettings = async (req, res) =>{
  try {
     const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - User ID required'
      });
    }

    // Get current settings or create if doesn't exist
    let settings = await Setting.findOne({ userId });
    
    if (!settings) {
      // Create new settings with default values
      settings = new Setting({ userId });
    }
    return res.status(200).json({
      success: true,
      message: `Notifications retreived successfully`,
      settings
    });

  } catch (error) {
    console.error('get setting error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while getting settings',
      error: error.message
    });
  }
}