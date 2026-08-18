import mongoose from "mongoose";
import Lecture from "../models/lecture.js";
import { shuffleArray, shuffleQuestionOptions } from "../utils/helpers.js";
import { EnhancedTranscriptionProcessor } from "../services/enhancedTranscriptionProcessor.js";
export const getPracticeQuiz = async (req, res) => {
  try {
    const { classId, lectureIds } = req.body;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ success: false, message: "please select at least one lecture" });
    }

    for (const lectureId of lectureIds) {
      if (!mongoose.isValidObjectId(lectureId)) {
        return res.status(400).json({ success: false, message: `one of your lecture IDs is Invalid, lecture ID: ${lectureId}` });
      }
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: "Invalid class ID" });
    }

    // Find lecture with transcript for quiz generation
    const lectures = await Lecture.find({
      _id: { $in: lectureIds },
      ownerId,
      classId
    }).select('title processingStatus quiz');

    const TOTAL_QUESTIONS = 25;

    const lecturesWithQuizzes = lectures.filter(lecture =>
      lecture.quiz?.questions?.length > 0
    );

    if (lecturesWithQuizzes.length === 0) {
      return res.status(404).json({
        message: "No quizzes available for the selected lectures."
      });
    }

    if (lectures.length !== lecturesWithQuizzes.length) {
      return res.status(404).json({ success: false, message: "One or more lectures not found or unavailable" });
    }

    const allQuestions = [];

    // Step 1: Calculate base and extra questions
    const baseQuestionsPerLecture = Math.floor(TOTAL_QUESTIONS / lecturesWithQuizzes.length);
    const extraQuestionsNeeded = TOTAL_QUESTIONS % lecturesWithQuizzes.length;

    console.log(`Distribution: ${baseQuestionsPerLecture} base questions + ${extraQuestionsNeeded} extra from some lectures`);

    // Step 2: Collect base questions from each lecture
    for (let i = 0; i < lecturesWithQuizzes.length; i++) {
      const lecture = lecturesWithQuizzes[i];
      let questionsToTake = baseQuestionsPerLecture;

      // Add one extra question for the first few lectures if needed
      if (i < extraQuestionsNeeded) {
        questionsToTake += 1;
      }

      const shuffled = shuffleArray([...lecture.quiz.questions]);
      const selected = shuffled.slice(0, questionsToTake);

      // Add sourceLecture to each selected question and ensure plain objects
      const questionsWithSource = selected.map(q => {
        const plainQuestion = typeof q.toObject === 'function' ? q.toObject() : { ...q };

        return {
          ...plainQuestion,
          sourceLecture: {
            id: lecture._id.toString(),
            title: lecture.title
          }
        };
      });

      allQuestions.push(...questionsWithSource);

      console.log(`Took ${questionsToTake} questions from ${lecture.title}`);
    }

    // Step 3: If we still don't have 25 questions (due to limited questions in lectures), try to get more
    let remainingNeeded = TOTAL_QUESTIONS - allQuestions.length;

    if (remainingNeeded > 0) {
      console.log(`Still need ${remainingNeeded} more questions to reach 25`);

      // Try to get additional questions from any lecture that has more available
      for (const lecture of lecturesWithQuizzes) {
        if (remainingNeeded <= 0) break;

        // Count how many questions we already have from this lecture
        const currentCount = allQuestions.filter(q =>
          q.sourceLecture.id === lecture._id.toString()
        ).length;

        // Check if this lecture has more questions available
        if (currentCount < lecture.quiz.questions.length) {
          // Get all questions from this lecture that haven't been selected
          const selectedIds = new Set(
            allQuestions
              .filter(q => q.sourceLecture.id === lecture._id.toString())
              .map(q => q._id?.toString() || q.id?.toString())
          );

          const availableQuestions = lecture.quiz.questions.filter(q => {
            const questionId = q._id?.toString() || q.id?.toString();
            return !selectedIds.has(questionId);
          });

          // Take as many as needed or available
          const toTake = Math.min(remainingNeeded, availableQuestions.length);

          if (toTake > 0) {
            const shuffledAvailable = shuffleArray(availableQuestions);
            const additionalQuestions = shuffledAvailable.slice(0, toTake).map(q => {
              const plainQuestion = typeof q.toObject === 'function' ? q.toObject() : { ...q };

              return {
                ...plainQuestion,
                sourceLecture: {
                  id: lecture._id.toString(),
                  title: lecture.title
                }
              };
            });

            allQuestions.push(...additionalQuestions);
            remainingNeeded -= toTake;

            console.log(`Added ${toTake} additional questions from ${lecture.title}`);
          }
        }
      }
    }

    // Final shuffle and ensure exactly 25 questions
    let finalQuestions = shuffleArray(allQuestions).slice(0, TOTAL_QUESTIONS);

    // Shuffle options for each question to randomize the position of correct answers
    finalQuestions = finalQuestions.map(question => shuffleQuestionOptions(question));

    console.log(`Final quiz: ${finalQuestions.length} questions from ${lecturesWithQuizzes.length} lectures`);

    return res.status(200).json({
      success: true,
      message: "Quiz generated successfully",
      quiz: {
        title: `Practice Quiz (${finalQuestions.length} questions)`,
        questions: finalQuestions,
        summary: {
          totalQuestions: finalQuestions.length,
          lecturesUsed: lecturesWithQuizzes.length,
          baseQuestionsPerLecture: baseQuestionsPerLecture,
          extraQuestions: extraQuestionsNeeded
        }
      }
    });

  } catch (err) {
    console.error('Get practice quiz error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};


// export const getFlashCards = async (req, res) => {
//   try {
//     const { classId, lectureId } = req.body;
//     const ownerId = req.user?.id;

//     if (!ownerId) {
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }
//     if (!mongoose.isValidObjectId(lectureId)) {
//       return res.status(400).json({ success: false, message: "Invalid lecture ID" });
//     }

//     if (!mongoose.isValidObjectId(classId)) {
//       return res.status(400).json({ success: false, message: "Invalid class ID" });
//     }

//     // Find lecture with transcript for quiz generation
//     const lecture = await Lecture.findOne({ 
//       _id: lectureId, 
//       ownerId,
//       classId 
//     }).select('title processingStatus flashCards');

//     if (!lecture) {
//       return res.status(404).json({ success: false, message: "Lecture not found or unauthorized" });
//     }
//     // Check if processing is still ongoing
//     if (lecture.processingStatus === 'processing' || lecture.processingStatus === 'pending') {
//       return res.status(202).json({
//         message: "Lecture is still being processed. Flashcards will be available once processing is complete.",
//         processingStatus: lecture.processingStatus
//       });
//     }

//     // Check if flashcards exist
//     if (!lecture.flashCards || !lecture.flashCards.cards || lecture.flashCards.cards.length === 0) {
//       return res.status(404).json({ 
//         message: "Flashcards not available for this lecture. They may not have been generated yet or processing failed.",
//         processingStatus: lecture.processingStatus
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Flashcards fetched successfully",
//       flashcards: {
//         cards: lecture.flashCards.cards
//       }
//     });

//   } catch (err) {
//     console.error('Get lecture flashcards error:', err);
//     return res.status(500).json({ 
//       success: false,
//       message: "Server error", 
//       error: err.message 
//     });
//   }
// };

export const getFlashCards = async (req, res) => {
  try {
    const { classId, lectureIds } = req.body;
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ success: false, message: "please select at least one lecture" });
    }

    for (const lectureId of lectureIds) {
      if (!mongoose.isValidObjectId(lectureId)) {
        return res.status(400).json({ success: false, message: `one of your lecture IDs is Invalid, lecture ID: ${lectureId}` });
      }
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: "Invalid class ID" });
    }

    // Find lecture with transcript for quiz generation
    const lectures = await Lecture.find({
      _id: { $in: lectureIds },
      ownerId,
      classId
    }).select('title processingStatus flashCards');

    const TOTAL_QUESTIONS = 25;

    const lecturesWithFlashCards = lectures.filter(lecture =>
      lecture?.flashCards?.cards?.length > 0
    );

    if (lecturesWithFlashCards.length === 0) {
      return res.status(404).json({
        message: "No FlashCards available for the selected lectures."
      });
    }

    if (lectures.length !== lecturesWithFlashCards.length) {
      return res.status(404).json({ success: false, message: "One or more lectures not found or unavailable" });
    }

    const allQuestions = [];

    // Step 1: Calculate base and extra questions
    const baseQuestionsPerLecture = Math.floor(TOTAL_QUESTIONS / lecturesWithFlashCards.length);
    const extraQuestionsNeeded = TOTAL_QUESTIONS % lecturesWithFlashCards.length;

    console.log(`Distribution: ${baseQuestionsPerLecture} base questions + ${extraQuestionsNeeded} extra from some lectures`);

    // Step 2: Collect base questions from each lecture
    for (let i = 0; i < lecturesWithFlashCards.length; i++) {
      const lecture = lecturesWithFlashCards[i];
      let questionsToTake = baseQuestionsPerLecture;

      // Add one extra question for the first few lectures if needed
      if (i < extraQuestionsNeeded) {
        questionsToTake += 1;
      }

      const shuffled = shuffleArray([...lecture.flashCards.cards]);
      const selected = shuffled.slice(0, questionsToTake);

      // Add sourceLecture to each selected question and ensure plain objects
      const questionsWithSource = selected.map(q => {
        const plainQuestion = typeof q.toObject === 'function' ? q.toObject() : { ...q };

        return {
          ...plainQuestion,
          sourceLecture: {
            id: lecture._id.toString(),
            title: lecture.title
          }
        };
      });

      allQuestions.push(...questionsWithSource);

      console.log(`Took ${questionsToTake} questions from ${lecture.title}`);
    }

    // Step 3: If we still don't have 25 questions (due to limited questions in lectures), try to get more
    let remainingNeeded = TOTAL_QUESTIONS - allQuestions.length;

    if (remainingNeeded > 0) {
      console.log(`Still need ${remainingNeeded} more questions to reach 25`);

      // Try to get additional questions from any lecture that has more available
      for (const lecture of lecturesWithFlashCards) {
        if (remainingNeeded <= 0) break;

        // Count how many questions we already have from this lecture
        const currentCount = allQuestions.filter(q =>
          q.sourceLecture.id === lecture._id.toString()
        ).length;

        // Check if this lecture has more questions available
        if (currentCount < lecture.flashCards.cards.length) {
          // Get all questions from this lecture that haven't been selected
          const selectedIds = new Set(
            allQuestions
              .filter(q => q.sourceLecture.id === lecture._id.toString())
              .map(q => q._id?.toString() || q.id?.toString())
          );

          const availableQuestions = lecture.flashCards.cards.filter(q => {
            const questionId = q._id?.toString() || q.id?.toString();
            return !selectedIds.has(questionId);
          });

          // Take as many as needed or available
          const toTake = Math.min(remainingNeeded, availableQuestions.length);

          if (toTake > 0) {
            const shuffledAvailable = shuffleArray(availableQuestions);
            const additionalQuestions = shuffledAvailable.slice(0, toTake).map(q => {
              const plainQuestion = typeof q.toObject === 'function' ? q.toObject() : { ...q };

              return {
                ...plainQuestion,
                sourceLecture: {
                  id: lecture._id.toString(),
                  title: lecture.title
                }
              };
            });

            allQuestions.push(...additionalQuestions);
            remainingNeeded -= toTake;

            console.log(`Added ${toTake} additional questions from ${lecture.title}`);
          }
        }
      }
    }

    // Final shuffle and ensure exactly 25 questions
    const finalQuestions = shuffleArray(allQuestions).slice(0, TOTAL_QUESTIONS);

    console.log(`Final quiz: ${finalQuestions.length} questions from ${lecturesWithFlashCards.length} lectures`);

    return res.status(200).json({
      success: true,
      message: "Quiz generated successfully",
      flashcards: {
        title: `Practice Quiz (${finalQuestions.length} questions)`,
        cards: finalQuestions,
        summary: {
          totalQuestions: finalQuestions.length,
          lecturesUsed: lecturesWithFlashCards.length,
          baseQuestionsPerLecture: baseQuestionsPerLecture,
          extraQuestions: extraQuestionsNeeded
        }
      }
    });

  } catch (err) {
    console.error('Get practice quiz error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

export const getStudyGuide = async (req, res) => {
  try {
    const { classId, lectureIds } = req.body;
    const ownerId = req.user?.id;

    // Validation checks
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ success: false, message: "Please select at least one lecture" });
    }

    // Validate lecture IDs
    for (const lectureId of lectureIds) {
      if (!mongoose.isValidObjectId(lectureId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid lecture ID: ${lectureId}`
        });
      }
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid class ID"
      });
    }

    // Find lectures with transcript for study guide generation
    const lectures = await Lecture.find({
      _id: { $in: lectureIds },
      ownerId,
      classId
    }).select('title processingStatus transcript studyGuide');

    // Check if lectures exist
    if (!lectures || lectures.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lectures not found or unauthorized"
      });
    }

    // Check if processing is still ongoing for any lecture
    const pendingLectures = lectures.filter(l =>
      l.processingStatus === 'processing' || l.processingStatus === 'pending'
    );

    if (pendingLectures.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more lectures are still being processed. Study guide will be available once processing is complete.",
        processingStatus: lectures.map(l => ({
          lectureId: l._id,
          title: l.title,
          status: l.processingStatus
        }))
      });
    }

    // Check if all lectures have transcripts
    const lecturesWithoutTranscript = lectures.filter(l => !l.transcript?.text);
    if (lecturesWithoutTranscript.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Transcript not available for some lectures. Study guide cannot be generated.",
        processingStatus: lectures.map(l => ({
          lectureId: l._id,
          title: l.title,
          hasTranscript: !!l.transcript?.text
        }))
      });
    }

    // Initialize the processor for study guide generation
    const processor = new EnhancedTranscriptionProcessor({
      openaiApiKey: process.env.OPENAI_API_KEY,
      userId: ownerId
    });

    // Generate study guides for each lecture (use cached if available)
    const studyGuides = await Promise.all(lectures.map(async (lecture) => {
      // Check if study guide already exists and is cached
      if (lecture.studyGuide?.content) {
        console.log(`[StudyGuide] Using cached study guide for "${lecture.title}"`);
        return {
          lectureId: lecture._id,
          title: lecture.title,
          studyGuide: lecture.studyGuide.content,
          cached: true
        };
      }

      // Generate new study guide from transcript
      console.log(`[StudyGuide] Generating new study guide for lecture ${lecture._id}`);
      try {
        const studyGuideContent = await processor.generateStudyGuide(
          lecture.transcript.text
        );

        // Cache the generated study guide in the database
        await Lecture.findByIdAndUpdate(lecture._id, {
          $set: {
            studyGuide: {
              content: studyGuideContent,
              sourceHash: lecture.transcript.sourceHash || null
            }
          }
        });

        console.log(`[StudyGuide] Cached study guide for "${lecture.title}"`);

        return {
          lectureId: lecture._id,
          title: lecture.title,
          studyGuide: studyGuideContent,
          cached: false
        };
      } catch (genError) {
        console.error(`[StudyGuide] Failed to generate for "${lecture.title}":`, genError);
        return {
          lectureId: lecture._id,
          title: lecture.title,
          studyGuide: null,
          error: genError.message
        };
      }
    }));

    // Check if any study guides failed to generate
    const failedGuides = studyGuides.filter(sg => sg.error);
    if (failedGuides.length === studyGuides.length) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate study guides for all lectures.",
        errors: failedGuides.map(f => ({ lectureId: f.lectureId, title: f.title, error: f.error }))
      });
    }

    // Return the study guides
    const combinedStudyGuide = {
      overview: `Study guide for ${lectures.length} lecture(s)`,
      studyGuides: studyGuides.map(sg => ({
        lectureId: sg.lectureId,
        title: sg.title,
        studyGuide: sg.studyGuide,
        cached: sg.cached,
        error: sg.error || null
      })),
      totalLectures: lectures.length,
      generatedCount: studyGuides.filter(sg => !sg.error).length
    };

    return res.status(200).json({
      success: true,
      message: "Study guide generated successfully",
      data: combinedStudyGuide
    });

  } catch (err) {
    console.error('Get Study Guide error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};