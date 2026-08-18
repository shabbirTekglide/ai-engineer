import mongoose from 'mongoose';
import Lecture from '../models/lecture.js';
import ProcessingJob from '../models/processingJob.js';
import StudentProfile from '../models/studentprofile.js';
import User from '../models/User.js';

const VALID_LECTURE_STATUS = ['pending', 'processing', 'completed', 'failed'];
const VALID_JOB_STATUS = ['queued', 'processing', 'completed', 'failed', 'cancelled'];

function sanitizeTranscript(t) {
  if (!t || typeof t !== 'object') return t;
  return {
    language: t.language,
    wordCount: t.wordCount,
    asr: t.asr,
    sourceHash: t.sourceHash,
    hasText: Boolean(t.text),
    textPreview:
      typeof t.text === 'string' && t.text.length > 0
        ? `${t.text.slice(0, 280)}${t.text.length > 280 ? '…' : ''}`
        : null,
  };
}

function sanitizeNotes(n) {
  if (!n || typeof n !== 'object') return n;
  return {
    hasOverview: Boolean(n.overview),
    overviewPreview:
      typeof n.overview === 'string' && n.overview.length > 0
        ? `${n.overview.slice(0, 200)}${n.overview.length > 200 ? '…' : ''}`
        : null,
    promptCount: Array.isArray(n.prompts) ? n.prompts.length : 0,
    sourceHash: n.sourceHash,
  };
}

function sanitizeStudyGuide(sg) {
  if (!sg || typeof sg !== 'object') return sg;
  return {
    hasContent: Boolean(sg.content),
    contentLength: typeof sg.content === 'string' ? sg.content.length : 0,
    sourceHash: sg.sourceHash,
  };
}

function sanitizeQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return quiz;
  const questions = quiz.questions;
  return {
    questionCount: Array.isArray(questions) ? questions.length : 0,
    sourceHash: quiz.sourceHash,
  };
}

function sanitizeFlashcards(fc) {
  if (!fc || typeof fc !== 'object') return fc;
  const cards = fc.cards;
  return {
    cardCount: Array.isArray(cards) ? cards.length : 0,
    sourceHash: fc.sourceHash,
  };
}

function sanitizeLectureDoc(lec) {
  const o = { ...lec };
  o.transcript = sanitizeTranscript(o.transcript);
  o.notes = sanitizeNotes(o.notes);
  o.studyGuide = sanitizeStudyGuide(o.studyGuide);
  o.quiz = sanitizeQuiz(o.quiz);
  o.flashCards = sanitizeFlashcards(o.flashCards);
  return o;
}

function serializeJob(job) {
  if (!job) return null;
  const j = job.toObject ? job.toObject() : { ...job };
  j.id = j._id;
  delete j.__v;
  return j;
}

/** @param {string[]} lectureIds */
async function primaryJobsByLectureIds(lectureIds) {
  if (!lectureIds.length) return {};
  const grouped = await ProcessingJob.aggregate([
    { $match: { lectureId: { $in: lectureIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $addFields: {
        activeRank: {
          $cond: [{ $in: ['$status', ['queued', 'processing']] }, 1, 0],
        },
      },
    },
    { $sort: { lectureId: 1, activeRank: -1, updatedAt: -1 } },
    { $group: { _id: '$lectureId', job: { $first: '$$ROOT' } } },
  ]);
  return Object.fromEntries(grouped.map((g) => [g._id.toString(), g.job]));
}

export async function getAdminLectureStats(req, res) {
  try {
    const [queueStats, lectureAgg] = await Promise.all([
      ProcessingJob.getQueueStats(),
      Lecture.aggregate([
        {
          $group: {
            _id: '$processingStatus',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const lectureByStatus = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const row of lectureAgg) {
      if (row._id && lectureByStatus[row._id] !== undefined) {
        lectureByStatus[row._id] = row.count;
        lectureByStatus.total += row.count;
      }
    }

    return res.json({
      queue: queueStats,
      lectures: lectureByStatus,
    });
  } catch (err) {
    console.error('[AdminLectures] stats error:', err);
    return res.status(500).json({ message: 'Failed to load stats', error: err.message });
  }
}

export async function listAdminLectures(req, res) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 25));
    const skip = (page - 1) * limit;
    const processingStatus = req.query.processingStatus;
    const jobStatus = req.query.jobStatus;
    const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const match = {};

    if (processingStatus && VALID_LECTURE_STATUS.includes(processingStatus)) {
      match.processingStatus = processingStatus;
    }

    if (jobStatus && VALID_JOB_STATUS.includes(jobStatus)) {
      const primary = await ProcessingJob.aggregate([
        {
          $addFields: {
            activeRank: {
              $cond: [{ $in: ['$status', ['queued', 'processing']] }, 1, 0],
            },
          },
        },
        { $sort: { lectureId: 1, activeRank: -1, updatedAt: -1 } },
        { $group: { _id: '$lectureId', status: { $first: '$status' } } },
        { $match: { status: jobStatus } },
      ]);
      const ids = primary.map((p) => p._id);
      if (ids.length === 0) {
        return res.json({ items: [], total: 0, page, limit, totalPages: 0 });
      }
      match._id = { $in: ids };
    }

    if (qRaw) {
      const escaped = qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const or = [{ title: new RegExp(escaped, 'i') }];
      if (qRaw.includes('@')) {
        const users = await User.find({ email: new RegExp(escaped, 'i') })
          .select('_id')
          .lean();
        if (users.length) {
          or.push({ ownerId: { $in: users.map((u) => u._id) } });
        }
      }
      match.$or = or;
    }

    const [lectures, total] = await Promise.all([
      Lecture.find(match)
        .populate('ownerId', 'email')
        .populate('classId', 'name code')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lecture.countDocuments(match),
    ]);

    const lectureIds = lectures.map((l) => l._id);
    const ownerIds = [
      ...new Set(lectures.map((l) => l.ownerId?._id?.toString()).filter(Boolean)),
    ];

    const [profiles, jobByLecture] = await Promise.all([
      ownerIds.length
        ? StudentProfile.find({ userId: { $in: ownerIds } }).select('userId name').lean()
        : [],
      primaryJobsByLectureIds(lectureIds),
    ]);

    const profileByUser = Object.fromEntries(
      profiles.map((p) => [p.userId.toString(), p.name]),
    );

    const items = lectures.map((lec) => {
      const jid = lec._id.toString();
      const job = jobByLecture[jid];
      return {
        id: lec._id,
        title: lec.title,
        recordedAt: lec.recordedAt,
        durationSec: lec.durationSec,
        processingStatus: lec.processingStatus,
        processingError: lec.processingError,
        updatedAt: lec.updatedAt,
        createdAt: lec.createdAt,
        owner: {
          id: lec.ownerId?._id,
          email: lec.ownerId?.email,
          name: profileByUser[lec.ownerId?._id?.toString()] || null,
        },
        class: lec.classId
          ? { id: lec.classId._id, name: lec.classId.name, code: lec.classId.code }
          : null,
        job: job
          ? {
              id: job._id,
              status: job.status,
              overallProgress: job.overallProgress,
              currentStage: job.currentStage,
              error: job.error,
              failedStage: job.failedStage,
            }
          : null,
      };
    });

    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    });
  } catch (err) {
    console.error('[AdminLectures] list error:', err);
    return res.status(500).json({ message: 'Failed to list lectures', error: err.message });
  }
}

export async function getAdminLectureDetail(req, res) {
  try {
    const { lectureId } = req.params;
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: 'Invalid lecture id' });
    }

    const lecture = await Lecture.findById(lectureId)
      .populate('ownerId', 'email role')
      .populate('classId', 'name code')
      .lean();

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    const lectureForPayload = { ...lecture };
    delete lectureForPayload.ownerId;
    delete lectureForPayload.classId;

    const ownerId = lecture.ownerId?._id;
    const profile = ownerId
      ? await StudentProfile.findOne({ userId: ownerId }).select('name school classYear').lean()
      : null;

    const jobs = await ProcessingJob.find({ lectureId }).sort({ updatedAt: -1 }).lean();
    const primary = await ProcessingJob.findPrimaryByLectureId(lectureId);

    const safeLecture = sanitizeLectureDoc(lectureForPayload);

    const pipelineLog = (primary ? serializeJob(primary) : null)
      ? buildPipelineLogFromJob(primary)
      : [];

    return res.json({
      lecture: safeLecture,
      owner: {
        id: lecture.ownerId?._id,
        email: lecture.ownerId?.email,
        role: lecture.ownerId?.role,
        profile: profile
          ? {
              name: profile.name,
              school: profile.school,
              classYear: profile.classYear,
            }
          : null,
      },
      class: lecture.classId
        ? {
            id: lecture.classId._id,
            name: lecture.classId.name,
            code: lecture.classId.code,
          }
        : null,
      primaryJob: primary ? serializeJob(primary) : null,
      jobHistory: jobs.map((j) => ({
        id: j._id,
        status: j.status,
        overallProgress: j.overallProgress,
        currentStage: j.currentStage,
        queuedAt: j.queuedAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        error: j.error,
        failedStage: j.failedStage,
        retryCount: j.retryCount,
        updatedAt: j.updatedAt,
      })),
      pipelineLog,
    });
  } catch (err) {
    console.error('[AdminLectures] detail error:', err);
    return res.status(500).json({ message: 'Failed to load lecture', error: err.message });
  }
}

/** Narrative timeline analogous to server console stage messages */
function buildPipelineLogFromJob(job) {
  const j = job.toObject ? job.toObject() : { ...job };
  const lines = [];
  const push = (ts, level, message, meta = null) => {
    lines.push({
      at: ts,
      level,
      message,
      meta,
    });
  };

  push(j.queuedAt || j.createdAt, 'info', 'Job queued for processing', {
    lectureId: j.lectureId,
    jobId: j._id,
  });

  if (j.startedAt) {
    push(j.startedAt, 'info', 'Worker started job', {
      workerInstanceId: j.workerInstanceId,
    });
  }

  const stageOrder = [
    'upload',
    'transcription',
    'notes',
    'studyGuide',
    'quiz',
    'flashcards',
    'completed',
  ];
  const stages = Array.isArray(j.stages) ? j.stages : [];

  for (const name of stageOrder) {
    if (name === 'completed') break;
    const st = stages.find((s) => s.name === name);
    if (!st) continue;

    if (st.status === 'pending') {
      push(st.startedAt || j.updatedAt, 'info', `[${name}] pending`);
    } else if (st.status === 'skipped') {
      push(st.completedAt || st.startedAt || j.updatedAt, 'warn', `[${name}] skipped`, st.details || null);
    } else if (st.status === 'in_progress') {
      push(st.startedAt || j.updatedAt, 'info', `[${name}] in progress`, {
        progress: st.progress,
        details: st.details,
      });
    } else if (st.status === 'completed') {
      push(st.completedAt || st.startedAt || j.updatedAt, 'ok', `[${name}] completed`, {
        progress: 100,
        details: st.details,
      });
    } else if (st.status === 'failed') {
      push(st.completedAt || st.startedAt || j.updatedAt, 'error', `[${name}] failed`, {
        error: st.error,
        details: st.details,
      });
    }
  }

  if (j.status === 'completed') {
    push(j.completedAt || j.updatedAt, 'ok', 'Pipeline completed', {
      overallProgress: j.overallProgress,
    });
  } else if (j.status === 'failed') {
    push(j.completedAt || j.updatedAt, 'error', 'Pipeline failed', {
      error: j.error,
      errorStack: j.errorStack,
      failedStage: j.failedStage,
    });
  } else if (j.status === 'cancelled') {
    push(j.completedAt || j.updatedAt, 'warn', 'Job cancelled');
  } else {
    push(j.updatedAt, 'info', `Job status: ${j.status}`, {
      currentStage: j.currentStage,
      overallProgress: j.overallProgress,
    });
  }

  if (j.metadata && Object.keys(j.metadata).length) {
    push(j.queuedAt || j.updatedAt, 'info', 'Processing metadata', j.metadata);
  }

  lines.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return ta - tb;
  });

  return lines;
}
