// controllers/lectureController.js
import mongoose from "mongoose";
import Lecture from "../models/lecture.js";
import Class from "../models/class.js";
import User from "../models/User.js";
import { deleteAudioFromS3, uploadAudioToS3, uploadDocumentToS3 } from "../services/lectureUploader.js";
import queueService from "../services/queueService.js";
import { shuffleQuestionOptions } from "../utils/helpers.js";
import processingJob from "../models/processingJob.js";
import chatThreads from "../models/chatThreads.js";
import { extractTextFromDocument } from "../services/documentParsingService.js";
import os from "os";
import fs from "fs/promises";
import path from "path";
export const createLecture = async (req, res) => {
  try {
    // ---------- 1) AUTH ----------
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(ownerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ---------- NEW: CHECK SUBSCRIPTION LIMIT WITH DEBUGGING ----------
    let inputDuration = req.body.durationSec ? Number(req.body.durationSec) : 60;

    console.log('--- LIMIT CHECK START ---');
    console.log('Raw Input Duration:', req.body.durationSec);
    console.log('Parsed Duration:', inputDuration);

    if (inputDuration > 36000) {
      console.log('⚠️ Milliseconds detected! Converting to seconds...');
      inputDuration = inputDuration / 1000;
    }

    const estimatedDuration = Math.ceil(inputDuration);
    console.log('Final Estimated Duration (Sec):', estimatedDuration);
    console.log('User Available Seconds:', user.subscription.availableSeconds);

    const hasLimit = user.canUseService(estimatedDuration);
    console.log('✅ Can Use Service:', hasLimit);
    console.log('--- LIMIT CHECK END ---');

    if (!hasLimit) {
      return res.status(403).json({
        message: "Limit reached. You do not have enough recording time available.",
        success: false,
        required: estimatedDuration,
        available: user.availableSeconds
      });
    }

    // ---------- 2) PARAMS & BODY VALIDATION ----------
    const { classId } = req.params;
    const { title, durationSec } = req.body;

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid or missing classId" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    // ---------- 3) CLASS OWNERSHIP + nameKey ----------
    const cls = await Class.findOne({ _id: classId, ownerId });
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Atomically increment lectureNo and get the updated class
    const updatedClass = await Class.findOneAndUpdate(
      { _id: classId, ownerId },
      { $inc: { lectureNo: 1 } },
      { new: true } // return the document after increment
    );
    if (!updatedClass) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    const classNameKey = updatedClass.nameKey || updatedClass.name;
    if (!classNameKey) {
      return res.status(400).json({ message: "Class is missing nameKey" });
    }

    // Generate lecture title using the new lectureNo
    let lectureTitle = '';
    const newLectureNo = updatedClass.lectureNo; // already incremented

    if (title && typeof title === "string" && title.trim()) {
      lectureTitle = title.trim();
    } else {
      lectureTitle = `${classNameKey} — Lecture ${newLectureNo}`;
    }

    // ---------- 5) USER EMAIL ----------
    let email = req.user?.email;
    if (!email) {
      email = user?.email || String(ownerId);
    }

    // ---------- 6) CREATE LECTURE (Pending State) ----------
    const lecture = await Lecture.create({
      classId: new mongoose.Types.ObjectId(classId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title: lectureTitle,
      recordedAt: new Date(),
      durationSec: durationSec ? Number(durationSec) : undefined,
    });

    // ---------- 7) UPLOAD AUDIO TO CLOUDINARY ----------
    try {
      const result = await uploadAudioToS3(
        req.file.buffer,
        req.file.mimetype,
        email,
        classNameKey,
        lecture._id.toString(),
        lectureTitle
      );

      // ---------- 8) UPDATE LECTURE WITH CLOUDINARY FIELDS ----------
      lecture.audioUrl = result.secure_url;
      lecture.cloudinaryPublicId = result.public_id;
      lecture.cloudinaryAssetId = result.asset_id;

      const finalDuration = result.duration || estimatedDuration || 0;
      lecture.durationSec = Math.ceil(finalDuration);

      lecture.localAudioPath = null;
      lecture.relativeAudioPath = null;
      await lecture.save();

      // ---------- NEW: DEDUCT SECONDS FROM USER ----------
      if (finalDuration > 0) {
        const secondsToDeduct = Math.ceil(finalDuration);
        console.log(`Deducting ${secondsToDeduct} seconds from user ${user._id}`);
        await user.deductSeconds(secondsToDeduct);
      } else {
        await user.save();
      }

      // ✅ FIX: Get Subscription Info HERE (Right after deduction)
      // Note: Model mein function ka naam 'getSubscriptionInfo' tha
      const subscriptionInfo = user.getSubscriptionInfo();

      // ---------- 9) CREATE QUEUE JOB FOR PROCESSING ----------
      try {
        const job = await queueService.createJob(
          lecture._id,
          ownerId,
          classId,
          {
            title: lecture.title,
            audioUrl: lecture.audioUrl,
            cloudinaryPublicId: lecture.cloudinaryPublicId
          }
        );

        console.log(`Created queue job ${job._id} for lecture ${lecture._id}`);

        return res.status(201).json({
          message: "Lecture created successfully. Processing queued for background processing.",
          lecture,
          jobId: job._id,
          processingStatus: 'pending',
          remainingSeconds: user.availableSeconds,
          ...subscriptionInfo // ✅ Ab ye defined hai
        });

      } catch (processingError) {
        console.error(`Failed to create queue job for lecture ${lecture._id}:`, processingError);
        return res.status(201).json({
          message: "Lecture created successfully, but queue job creation failed. Please try again later.",
          lecture,
          processingStatus: 'pending',
          warning: "Queue system unavailable",
          ...subscriptionInfo // ✅ Ab ye defined hai
        });
      }

    } catch (cloudinaryErr) {
      // Cloudinary upload failed — clean up
      await Lecture.deleteOne({ _id: lecture._id });
      cls.lectureNo = currentLectureNo;
      await cls.save();

      return res.status(502).json({
        message: "Failed to upload audio to Cloudinary",
        error: cloudinaryErr.message,
      });
    }
  } catch (err) {
    console.error("Create Lecture Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const createDocumentLecture = async (req, res) => {
  try {
    // ---------- 1) AUTH ----------
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(ownerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ---------- LIMIT CHECK: Extract text → count words → canUseService ----------
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Document file is required" });
    }

    let wordCount = 0;
    let tempFilePath = null;
    try {
      // Write buffer to a temp file (extractTextFromDocument needs a file path)
      const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
      tempFilePath = path.join(os.tmpdir(), `kora_doc_${Date.now()}.${ext}`);
      await fs.writeFile(tempFilePath, req.file.buffer);

      const extractedText = await extractTextFromDocument(tempFilePath, ext);
      wordCount = extractedText.trim().split(/\s+/).filter(Boolean).length;
      console.log(`[Document Limit] Extracted word count: ${wordCount}`);
    } catch (extractErr) {
      console.warn('[Document Limit] Text extraction failed, using fallback wordCount=1:', extractErr.message);
      wordCount = 1; // fallback: allow if extraction fails
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        fs.unlink(tempFilePath).catch(() => { });
      }
    }

    const hasLimit = user.canUseService(wordCount);
    if (!hasLimit) {
      return res.status(403).json({
        message: "Limit reached. You do not have enough limits available to process this document.",
        success: false,
        wordCount,
        available: user.subscription?.availableSeconds
      });
    }

    // ---------- 2) PARAMS & BODY VALIDATION ----------
    const { classId } = req.params;
    const { title } = req.body;

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid or missing classId" });
    }

    // ---------- 3) CLASS OWNERSHIP + nameKey ----------
    const cls = await Class.findOne({ _id: classId, ownerId });
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Atomically increment lectureNo and get the updated class
    const updatedClass = await Class.findOneAndUpdate(
      { _id: classId, ownerId },
      { $inc: { lectureNo: 1 } },
      { new: true } // return the document after increment
    );
    if (!updatedClass) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    const classNameKey = updatedClass.nameKey || updatedClass.name;
    if (!classNameKey) {
      return res.status(400).json({ message: "Class is missing nameKey" });
    }

    // Generate lecture title using the new lectureNo
    let lectureTitle = '';
    const newLectureNo = updatedClass.lectureNo;

    if (title && typeof title === "string" && title.trim()) {
      lectureTitle = title.trim();
    } else {
      lectureTitle = `${classNameKey} — Document ${newLectureNo}`;
    }

    // ---------- 5) USER EMAIL ----------
    let email = req.user?.email || user?.email || String(ownerId);

    // ---------- 6) CREATE LECTURE (Pending State) ----------
    const lecture = await Lecture.create({
      classId: new mongoose.Types.ObjectId(classId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title: lectureTitle,
      recordedAt: new Date(),
      sourceType: 'document',
      durationSec: wordCount,
    });

    // ---------- 7) UPLOAD DOCUMENT TO S3 ----------
    try {
      const result = await uploadDocumentToS3(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        email,
        classNameKey,
        lecture._id.toString(),
        lectureTitle
      );
      console.log("S3 Upload result:", result);

      // ---------- 8) UPDATE LECTURE WITH SOURCE_FILE FIELDS ----------
      lecture.sourceFile = {
        url: result.secure_url,
        publicId: result.public_id,
        assetId: result.asset_id,
        mimeType: result.mimeType,
        originalName: result.originalName,
        sizeBytes: result.sizeBytes,
        extension: result.extension
      };

      await lecture.save();

      // ---------- DEDUCT WORDS FROM USER ----------
      if (wordCount > 0) {
        console.log(`[Document] Deducting ${wordCount} words (as seconds) from user ${user._id}`);
        await user.deductSeconds(wordCount);
      } else {
        await user.save();
      }

      const subscriptionInfo = user.getSubscriptionInfo();

      // ---------- 9) CREATE QUEUE JOB FOR PROCESSING ----------
      try {
        const job = await queueService.createJob(
          lecture._id,
          ownerId,
          classId,
          {
            title: lecture.title,
            documentUrl: lecture.sourceFile.url,
            documentPublicId: lecture.sourceFile.publicId,
            sourceType: 'document',
            extension: lecture.sourceFile.extension
          }
        );


        console.log(`Created queue job ${job._id} for document lecture ${lecture._id}`);

        return res.status(201).json({
          message: "Document uploaded successfully. Processing queued for background processing.",
          lecture,
          jobId: job._id,
          processingStatus: 'pending',
          ...subscriptionInfo
        });

      } catch (processingError) {
        console.error(`Failed to create queue job for document lecture ${lecture._id}:`, processingError);
        return res.status(201).json({
          message: "Document uploaded successfully, but queue job creation failed. Please try again later.",
          lecture,
          processingStatus: 'pending',
          warning: "Queue system unavailable",
          ...subscriptionInfo
        });
      }

    } catch (uploadErr) {
      // S3 upload failed — clean up
      await Lecture.deleteOne({ _id: lecture._id });
      cls.lectureNo = newLectureNo - 1; // Attempt to revert lectureNo
      await cls.save();

      return res.status(502).json({
        message: "Failed to upload document",
        error: uploadErr.message,
      });
    }
  } catch (err) {
    console.error("Create Document Lecture Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const reprocessLecture = async (req, res) => {
  try {
    // ---------- 1) AUTH ----------
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(ownerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { lectureId } = req.params;
    if (!lectureId || !mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid or missing lectureId" });
    }

    const lecture = await Lecture.findOne({ _id: lectureId, ownerId });
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }

    // ---------- 2) CHECK SUBSCRIPTION LIMIT ----------
    const inputDuration = lecture.durationSec ? Number(lecture.durationSec) : 60;
    const hasLimit = user.canUseService(inputDuration);

    if (!hasLimit) {
      return res.status(403).json({
        message: "Limit reached. You do not have enough recording time available.",
        success: false,
        required: inputDuration,
        available: user.availableSeconds
      });
    }

    // ---------- 3) DEDUCT SECONDS ----------
    if (lecture.durationSec > 0) {
      const secondsToDeduct = Math.ceil(lecture.durationSec);
      await user.deductSeconds(secondsToDeduct);
    } else {
      await user.save();
    }

    const subscriptionInfo = user.getSubscriptionInfo();

    // Update status to pending before queueing
    lecture.processingStatus = 'pending';
    lecture.processingError = null;
    await lecture.save();
    console.log("Lecture status updated to pending", lecture);

    // ---------- 4) CREATE QUEUE JOB FOR PROCESSING ----------
    try {
      const job = await queueService.createJob(
        lecture._id,
        ownerId,
        lecture.classId,
        {
          title: lecture.title,
          audioUrl: lecture.audioUrl,
          cloudinaryPublicId: lecture.cloudinaryPublicId
        }
      );

      return res.status(200).json({
        success: true,
        message: "Lecture re-processing queued successfully.",
        lecture,
        jobId: job._id,
        processingStatus: 'pending',
        remainingSeconds: user.availableSeconds,
        ...subscriptionInfo
      });

    } catch (processingError) {
      console.error(`Failed to create queue job for lecture ${lecture._id}:`, processingError);
      return res.status(200).json({
        success: true,
        message: "Lecture status set to pending, but queue job creation failed.",
        lecture,
        processingStatus: 'pending',
        warning: "Queue system unavailable",
        ...subscriptionInfo
      });
    }
  } catch (err) {
    console.error("Reprocess Lecture Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const deleteLecture = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({
      _id: lectureId,
      ownerId
    });

    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }

    // Delete related processing jobs
    await processingJob.deleteMany({ lectureId });

    // Delete related chat threads
    await chatThreads.deleteMany({ context: "lecture", lectureId });

    // Delete from Cloudinary if a public ID exists
    if (lecture.cloudinaryPublicId || (lecture.sourceType == "document" && lecture.sourceFile?.publicId)) {
      try {
        await deleteAudioFromS3(lecture.cloudinaryPublicId || lecture.sourceFile?.publicId);
      } catch (cloudinaryErr) {
        console.error('Cloudinary deletion error:', cloudinaryErr);
        // Continue – we don't want to fail the whole request if Cloudinary cleanup fails
      }
    }

    // Delete the lecture document
    await lecture.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Lecture deleted successfully"
    });

  } catch (err) {
    console.error('Delete lecture error:', err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const getLectureById = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    // Find lecture and verify ownership - transcript is now embedded
    const lecture = await Lecture.findOne({
      _id: lectureId,
      ownerId
    }).populate('classId', 'name code');

    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }

    // Convert Mongoose document to plain object to avoid modification issues
    const lectureData = lecture.toObject();
    // Remove quiz and flashcards from the response
    delete lectureData.quiz;
    delete lectureData.flashCards;
    // Add fullTranscript to the transcript if it exists
    if (lectureData.transcript) {
      lectureData.transcript.fullTranscript = lectureData.transcript.text;
    }

    return res.status(200).json({
      success: true,
      message: "Lecture fetched successfully",
      lecture: lectureData
    });

  } catch (err) {
    console.error('Get lecture error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};
export const getLecturesByClass = async (req, res) => {
  try {
    const { classId } = req.validParams;
    const { page = 1, limit = 5, status = 'all' } = req.query;
    console.log(classId, page, limit, status);
    const ownerId = req.user?.id;
    const skip = (page - 1) * limit;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // Verify class ownership
    const cls = await Class.findOne({ _id: classId, ownerId });
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Build query
    const query = { classId, ownerId };
    if (status && status !== 'all') {
      query.processingStatus = status;
    }

    // Get total count of lectures for this class
    const totalLectures = await Lecture.countDocuments(query);

    // Find paginated lectures for this class
    const lectures = await Lecture.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title recordedAt durationSec processingStatus processingError createdAt sourceType sourceFile documentMeta');

    return res.status(200).json({
      success: true,
      lectures,
      pagination: {
        totalLectures,
        totalPages: Math.ceil(totalLectures / limit),
        currentPage: page,
        limit
      }
    });

  } catch (err) {
    console.error('Get lectures by class error:', err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const getLectureQuiz = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({
      _id: lectureId,
      ownerId
    }).select('title quiz processingStatus');

    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }

    // Check if processing is still ongoing
    if (lecture.processingStatus === 'processing' || lecture.processingStatus === 'pending') {
      return res.status(202).json({
        message: "Lecture is still being processed. Quiz will be available once processing is complete.",
        processingStatus: lecture.processingStatus
      });
    }

    // Check if quiz exists
    if (!lecture.quiz || !lecture.quiz.questions || lecture.quiz.questions.length === 0) {
      return res.status(404).json({
        message: "Quiz not available for this lecture. It may not have been generated yet or processing failed.",
        processingStatus: lecture.processingStatus
      });
    }

    // Shuffle options for each question to randomize the position of correct answers
    const questions = lecture.quiz.questions.map(q => {
      const plainQuestion = typeof q.toObject === 'function' ? q.toObject() : { ...q };
      return plainQuestion;
    });

    const shuffledQuestions = questions.map(question => shuffleQuestionOptions(question));

    return res.status(200).json({
      success: true,
      message: "Quiz fetched successfully",
      quiz: {
        title: lecture.quiz.title,
        questions: shuffledQuestions
      }
    });

  } catch (err) {
    console.error('Get lecture quiz error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * POST /api/lecture/batch-status
 * Get processing statuses for multiple lectures in a single request.
 * Body: { lectureIds: string[] }
 * Returns a map of lectureId -> { processingStatus, processingError }
 */
export const batchLectureStatus = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const { lectureIds } = req.body;
    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ message: "lectureIds array is required" });
    }

    // Limit to 50 IDs and ensure they are valid ObjectIds
    const ids = lectureIds.slice(0, 50).filter((id) => mongoose.isValidObjectId(id));

    // 1️⃣ Fetch basic lecture status fields
    const lectures = await Lecture.find(
      { _id: { $in: ids }, ownerId },
      "processingStatus processingError"
    ).lean();

    // 2️⃣ Fetch processing jobs to obtain overallProgress (virtual field)
    const jobs = await processingJob.find(
      { lectureId: { $in: ids } },
      "lectureId overallProgress"
    ).lean();

    // Build a map of lectureId → overallProgress for quick lookup
    const progressMap = {};
    jobs.forEach((job) => {
      progressMap[job.lectureId.toString()] = job.overallProgress ?? 0;
    });

    // 3️⃣ Combine lecture status with progress info
    const statusMap = {};
    for (const lec of lectures) {
      const lectureId = lec._id.toString();
      statusMap[lectureId] = {
        processingStatus: lec.processingStatus,
        processingError: lec.processingError || null,
        overallProgress: progressMap[lectureId] ?? 0,
      };
    }

    return res.status(200).json({ success: true, statuses: statusMap });
  } catch (err) {
    console.error("Batch lecture status error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const getLectureFlashcards = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({
      _id: lectureId,
      ownerId
    }).select('title flashCards processingStatus');

    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }

    // Check if processing is still ongoing
    if (lecture.processingStatus === 'processing' || lecture.processingStatus === 'pending') {
      return res.status(202).json({
        message: "Lecture is still being processed. Flashcards will be available once processing is complete.",
        processingStatus: lecture.processingStatus
      });
    }

    // Check if flashcards exist
    if (!lecture.flashCards || !lecture.flashCards.cards || lecture.flashCards.cards.length === 0) {
      return res.status(404).json({
        message: "Flashcards not available for this lecture. They may not have been generated yet or processing failed.",
        processingStatus: lecture.processingStatus
      });
    }

    return res.status(200).json({
      success: true,
      message: "Flashcards fetched successfully",
      flashcards: {
        cards: lecture.flashCards.cards
      }
    });

  } catch (err) {
    console.error('Get lecture flashcards error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};
