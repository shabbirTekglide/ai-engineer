import StudentProfile from '../models/studentprofile.js';
import User from '../models/User.js';
import ReferenceCode from '../models/ReferenceCode.js';
import { uploadProfilePicToS3 } from '../services/profilepicUploader.js';

function isReferenceCodeExpired(expiresAt) {
  if (!expiresAt) return false;

  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) return false;

  const endOfExpiryDay = new Date(expiryDate);
  endOfExpiryDay.setHours(23, 59, 59, 999);

  return new Date() > endOfExpiryDay;
}

function serializeStudentProfile(profileDoc, userDoc = null) {
  if (!profileDoc) return null;

  const profile = typeof profileDoc.toObject === 'function'
    ? profileDoc.toObject()
    : profileDoc;

  const user = userDoc || profile.userId || null;
  const plainUser = user && typeof user.toObject === 'function'
    ? user.toObject()
    : user;

  return {
    ...profile,
    professorClassCode: plainUser?.professorClassCode || '',
    classCodeEnteredAt: plainUser?.classCodeEnteredAt || null,
    classCodeDiscountAvailed: !!plainUser?.classCodeDiscountAvailed
  };
}


// Check if student profile exists
export const isStudentProfileCreated = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user is attached to req by auth middleware

    // Check if user exists and is a student
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.role !== 'student') {
      return res.status(400).json({
        success: false,
        message: "User is not a student"
      });
    }

    const studentProfile = await StudentProfile.findByUserId(userId);

    res.status(200).json({
      success: true,
      exists: !!studentProfile
    });

  } catch (error) {
    console.error('Error checking student profile:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Create student profile with profile picture upload
export const createStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, school, classYear, dateOfBirth, phone } = req.body;
    const profilePicFile = req.file; // Multer will put the file here

    // Check if user exists and is a student
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.role !== 'student') {
      return res.status(400).json({
        success: false,
        message: "Only students can create student profiles"
      });
    }

    // Check if profile already exists
    const existingProfile = await StudentProfile.findByUserId(userId);
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        message: "Student profile already exists"
      });
    }

    const professorClassCode = String(req.body.professorClassCode || user.professorClassCode || '').trim().toUpperCase();

    // Validate that the professor class code exists in RefCodes data if provided
    if (professorClassCode) {
      const activeRefCode = await ReferenceCode.findOne({
        code: professorClassCode,
        isActive: true
      });

      if (!activeRefCode) {
        return res.status(400).json({
          success: false,
          message: "The entered class code is incorrect, invalid, or inactive."
        });
      }

      // Check if the code has an expiry date and if it has passed
      if (activeRefCode.hasExpiry && !isReferenceCodeExpired(activeRefCode.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: "This class code has expired. Please ask your professor for an updated code."
        });
      }
    }


    const classCodeEnteredAt = professorClassCode
      ? (user.classCodeEnteredAt || new Date())
      : null;

    let profilePicUrl = null;

    // Upload profile picture if provided
    if (profilePicFile) {
      try {
        const uploadResult = await uploadProfilePicToS3({
          buffer: profilePicFile.buffer,
          mimetype: profilePicFile.mimetype,
          userEmail: user.email
        });
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Error uploading profile picture:', uploadError);
        return res.status(400).json({
          success: false,
          message: "Failed to upload profile picture",
          error: uploadError.message
        });
      }
    }

    // Create new student profile
    const studentProfile = new StudentProfile({
      userId,
      name,
      school,
      classYear,
      profilePic: profilePicUrl,
      dateOfBirth: dateOfBirth || null,
      phone: phone || ''
    });

    await studentProfile.save();

    if (professorClassCode && !user.professorClassCode) {
      user.professorClassCode = professorClassCode;
      user.classCodeEnteredAt = classCodeEnteredAt;
      await user.save();
    }

    if (professorClassCode) {
      try {
        await ReferenceCode.updateOne(
          { code: professorClassCode.toUpperCase().trim() },
          { $addToSet: { assignedUsers: userId } }
        );
      } catch (err) {
        console.error('Error adding user to reference code assignedUsers:', err);
      }
    }

    // Populate user data for response
    await studentProfile.populate('userId', 'email role isVerified professorClassCode classCodeEnteredAt classCodeDiscountAvailed');

    res.status(201).json({
      success: true,
      message: "Student profile created successfully",
      profile: serializeStudentProfile(studentProfile)
    });

  } catch (error) {
    console.error('Error creating student profile:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Student profile already exists for this user"
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create student profile",
      error: error.message
    });
  }
};

// Update student profile with profile picture upload
export const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, school, classYear, dateOfBirth, phone } = req.body;
    const profilePicFile = req.file; // Multer will put the file here

    // Check if profile exists
    const existingProfile = await StudentProfile.findByUserId(userId);
    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found"
      });
    }

    // Get user data for email (needed for Cloudinary upload)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let profilePicUrl = existingProfile.profilePic;

    // Upload new profile picture if provided
    if (profilePicFile) {
      try {
        const uploadResult = await uploadProfilePicToS3({
          buffer: profilePicFile.buffer,
          mimetype: profilePicFile.mimetype,
          userEmail: user.email
        });
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Error uploading profile picture:', uploadError);
        return res.status(400).json({
          success: false,
          message: "Failed to upload profile picture",
          error: uploadError.message
        });
      }
    }

    // Prepare update data
    const updateData = {
      ...(name && { name }),
      ...(school && { school }),
      ...(classYear && { classYear }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth || null }),
      ...(phone !== undefined && { phone: phone || '' }),
      ...(profilePicFile && { profilePic: profilePicUrl }) // Only update if new file was uploaded
    };

    // Update profile
    const updatedProfile = await StudentProfile.findOneAndUpdate(
      { userId },
      updateData,
      {
        new: true,
        runValidators: true
      }
    ).populate('userId', 'email role isVerified professorClassCode classCodeEnteredAt classCodeDiscountAvailed');

    res.status(200).json({
      success: true,
      message: "Student profile updated successfully",
      profile: serializeStudentProfile(updatedProfile)
    });

  } catch (error) {
    console.error('Error updating student profile:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update student profile",
      error: error.message
    });
  }
};

// Get student profile
export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const studentProfile = await StudentProfile.findByUserId(userId)
      .populate('userId', 'email role isVerified professorClassCode classCodeEnteredAt classCodeDiscountAvailed');

    if (!studentProfile) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found"
      });
    }

    res.status(200).json({
      success: true,
      profile: serializeStudentProfile(studentProfile)
    });

  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student profile",
      error: error.message
    });
  }
};
