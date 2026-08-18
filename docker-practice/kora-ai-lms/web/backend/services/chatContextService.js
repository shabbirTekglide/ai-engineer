// services/chatContextService.js
// Optimized for gpt-4o-mini: 128K context window, 16K max output
import Class from "../models/class.js";
import Lecture from "../models/lecture.js";
import User from "../models/User.js";

/**
 * Fetch context-specific data for the AI assistant
 * @param {string} contextType - 'general' | 'class' | 'lecture'
 * @param {string} userId - User ID
 * @param {string} classId - Class ID (optional)
 * @param {string} lectureId - Lecture ID (optional)
 * @returns {Promise<object>} Contextual data for AI
 */
export async function fetchChatContext(contextType, userId, classId = null, lectureId = null) {
  try {
    const context = {
      type: contextType,
      data: {},
      systemPrompt: ""
    };

    // Fetch user info
    const user = await User.findById(userId).select('email role');
    if (!user) {
      throw new Error('User not found');
    }
    context.data.user = { email: user.email, role: user.role };

    switch (contextType) {
      case 'lecture':
        if (!lectureId) {
          throw new Error('Lecture ID required for lecture context');
        }
        return await fetchLectureContext(userId, lectureId, classId);

      case 'class':
        if (!classId) {
          throw new Error('Class ID required for class context');
        }
        return await fetchClassContext(userId, classId);

      case 'general':
      default:
        return await fetchGeneralContext(userId);
    }
  } catch (error) {
    console.error('Error fetching chat context:', error);
    throw error;
  }
}

/**
 * Fetch multiple lectures context (for comprehension assessment)
 * Uses ONLY notes - no transcripts
 */
async function fetchMultipleLecturesContext(userId, lectureIds, classId) {
  const lectures = await Lecture.find({
    _id: { $in: lectureIds },
    ownerId: userId,
    classId
  }).populate('classId', 'name term instructor');

  if (!lectures || lectures.length === 0) {
    throw new Error('Lectures not found or unauthorized');
  }

  const context = {
    type: 'multiple-lectures',
    lectureIds: lectures.map(l => l._id),
    classId: lectures[0].classId?._id || classId,
    data: {
      lectures: []
    }
  };

  // Extract class info from first lecture
  if (lectures[0].classId) {
    context.data.class = {
      name: lectures[0].classId.name,
      term: lectures[0].classId.term,
      instructor: lectures[0].classId.instructor
    };
  }

  // Extract info from each lecture - NOTES ONLY
  lectures.forEach(lecture => {
    const lectureData = {
      id: lecture._id,
      title: lecture.title,
      recordedAt: lecture.recordedAt
    };

    // Extract FULL notes only - no transcripts
    if (lecture.notes?.overview) {
      lectureData.notes = {
        overview: lecture.notes.overview, // Full notes, no truncation
        prompts: lecture.notes.prompts || []
      };
    }

    context.data.lectures.push(lectureData);
  });

  return context;
}

// ============================================================
// LECTURE CONTEXT - Only that lecture's notes
// ============================================================
async function fetchLectureContext(userId, lectureId, classId) {
  const lecture = await Lecture.findOne({
    _id: lectureId,
    ownerId: userId
  }).populate('classId', 'name term instructor');

  if (!lecture) {
    throw new Error('Lecture not found or unauthorized');
  }

  const context = {
    type: 'lecture',
    lectureId: lecture._id,
    classId: lecture.classId?._id || classId,
    data: {}
  };

  // Extract class info
  if (lecture.classId) {
    context.data.class = {
      name: lecture.classId.name,
      term: lecture.classId.term,
      instructor: lecture.classId.instructor
    };
  }

  // Extract lecture info
  context.data.lecture = {
    title: lecture.title,
    recordedAt: lecture.recordedAt
  };

  // Extract FULL notes only - no truncation
  if (lecture.notes?.overview) {
    context.data.notes = {
      overview: lecture.notes.overview,
      prompts: lecture.notes.prompts || []
    };
  }

  // Build system prompt
  context.systemPrompt = buildLectureSystemPrompt(context.data);

  return context;
}

// ============================================================
// CLASS CONTEXT - Class info + Events from User.calendar + All lecture notes
// ============================================================
async function fetchClassContext(userId, classId) {
  const classData = await Class.findOne({
    _id: classId,
    ownerId: userId
  }).lean();

  if (!classData) {
    throw new Error('Class not found or unauthorized');
  }

  const context = {
    type: 'class',
    classId: classData._id,
    data: {}
  };

  // Extract class info
  context.data.class = {
    name: classData.name,
    term: classData.term,
    instructor: classData.instructor,
    meetingDays: classData.meetingDays,
    meetingTime: classData.meetingTime
  };

  // Fetch syllabus events from User.calendar (distributed model)
  const user = await User.findById(userId).select('calendar').lean();
  if (user?.calendar) {
    const syllabusEvents = user.calendar.filter(event =>
      event.origin === 'syllabus' &&
      event.classId &&
      event.classId.toString() === classId.toString()
    );

    if (syllabusEvents.length > 0) {
      context.data.syllabusEvents = syllabusEvents.map(e => ({
        title: e.title,
        start: e.start,
        end: e.end,
        type: e.type,
        location: e.location,
        reminders: e.reminders
      }));
    }
  }

  // Fetch ALL lectures for this class with FULL notes
  const lectures = await Lecture.find({
    classId: classId,
    ownerId: userId,
    processingStatus: 'completed'
  })
    .select('title recordedAt notes')
    .sort({ recordedAt: -1 })
    .lean();

  // Include FULL notes for each lecture - no truncation
  context.data.lectures = lectures.map(l => ({
    title: l.title,
    recordedAt: l.recordedAt,
    notes: l.notes?.overview || null // Full notes
  }));

  // Build system prompt
  context.systemPrompt = buildClassSystemPrompt(context.data);

  return context;
}

// ============================================================
// GENERAL CONTEXT - All classes + All lecture notes + All events from User.calendar
// ============================================================
async function fetchGeneralContext(userId) {
  const context = {
    type: 'general',
    data: {}
  };

  // Fetch ALL classes
  const classes = await Class.find({ ownerId: userId })
    .select('name term instructor meetingDays meetingTime')
    .sort({ createdAt: -1 })
    .lean();

  // Fetch user's calendar events (syllabus events)
  const user = await User.findById(userId).select('calendar').lean();
  const syllabusEventsByClass = {};

  if (user?.calendar) {
    user.calendar.forEach(event => {
      if (event.origin === 'syllabus' && event.classId) {
        const classIdStr = event.classId.toString();
        if (!syllabusEventsByClass[classIdStr]) {
          syllabusEventsByClass[classIdStr] = [];
        }
        syllabusEventsByClass[classIdStr].push({
          title: event.title,
          start: event.start,
          end: event.end,
          type: event.type,
          location: event.location
        });
      }
    });
  }

  // Process classes with syllabus events from User.calendar
  context.data.classes = classes.map(c => ({
    id: c._id,
    name: c.name,
    term: c.term,
    instructor: c.instructor,
    meetingDays: c.meetingDays,
    meetingTime: c.meetingTime,
    syllabusEvents: syllabusEventsByClass[c._id.toString()] || null
  }));

  // Extract ALL syllabus events from all classes
  const allSyllabusEvents = [];
  classes.forEach(c => {
    const classEvents = syllabusEventsByClass[c._id.toString()];
    if (classEvents?.length > 0) {
      classEvents.forEach(event => {
        allSyllabusEvents.push({
          ...event,
          className: c.name
        });
      });
    }
  });
  context.data.syllabusEvents = allSyllabusEvents;

  // Fetch ALL lectures with FULL notes - no transcripts
  const allLectures = await Lecture.find({
    ownerId: userId,
    processingStatus: 'completed'
  })
    .select('title classId recordedAt')
    .populate('classId', 'name term')
    .sort({ recordedAt: -1 })
    .lean();

  // Include FULL notes for each lecture
  context.data.lectures = allLectures.map(l => ({
    title: l.title,
    className: l.classId?.name,
    classTerm: l.classId?.term,
    recordedAt: l.recordedAt,
    notes: l.notes?.overview || null // Full notes, no truncation
  }));

  // Build system prompt
  context.systemPrompt = buildGeneralSystemPrompt(context.data);

  return context;
}

// ============================================================
// SYSTEM PROMPTS - Optimized for gpt-4o-mini (128K context)
// ============================================================

/**
 * LECTURE BOT - Only that lecture's notes
 */
function buildLectureSystemPrompt(data) {
  let prompt = `You are Kora, an intelligent AI study assistant. You are helping a student understand a SPECIFIC LECTURE.

${'='.repeat(60)}
LECTURE CONTEXT
${'='.repeat(60)}
Class: ${data.class?.name || 'Unknown'}${data.class?.term ? ` (${data.class.term})` : ''}
Instructor: ${data.class?.instructor || 'N/A'}
Lecture: "${data.lecture?.title}"
Recorded: ${data.lecture?.recordedAt ? new Date(data.lecture.recordedAt).toLocaleDateString() : 'Unknown'}

${'='.repeat(60)}
COMPLETE LECTURE NOTES
${'='.repeat(60)}
`;

  if (data.notes?.overview) {
    prompt += data.notes.overview;
  } else {
    prompt += '[No notes available for this lecture]';
  }

  if (data.notes?.prompts?.length > 0) {
    prompt += `\n\nStudy Prompts:\n${data.notes.prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
  }

  prompt += `

${'='.repeat(60)}
KORA — CONVERSATIONAL TUTOR (DEFAULT: TEXTING STYLE)
${'='.repeat(60)}

You are Kora, a friendly tutor chatting with a student about ONE specific lecture: "${data.lecture?.title}".

Your job is to help the student understand the lecture content in a natural, human, texting-style conversation.

CONVERSATION STYLE (STRICT):
- Write in short, flowing paragraphs like a helpful tutor in chat.
- Sound natural, warm, and supportive.
- Keep the default answer concise (about 2–6 short paragraphs) unless the student asks for more depth.

FORMATTING RULES (VERY IMPORTANT):
- DO NOT use bullet points, numbered lists, headings, tables, or nested lists by default.
- DO NOT use markdown formatting symbols like asterisks (** for bold, * for italic), underscores, or any markdown syntax.
- Write in plain text only - no formatting symbols, no bold, no italic, no structured lists.
- DO NOT format responses like lecture notes or study guides.
- ONLY use structured formatting (bullets/headers/tables) if the student explicitly asks for it, e.g.:
  "Give me bullet points", "List key points", "Make a summary", "Provide key takeaways", "Outline this", "Make a table".

SCOPE & ACCURACY (STRICT):
- Only use information from THIS lecture's transcript/notes/context.
- If the answer is not in the provided lecture content, say so clearly (e.g., "I don't see that in this lecture's content") and ask the student to share the relevant part or clarify.
- Never invent facts, quotes, or examples that are not present in the lecture.

BEHAVIOR:
- If the student is confused, explain the same idea in a simpler way, then optionally ask one quick check-in question like: "Does that click?" or "Want a quick example?"
- If the student asks something outside this lecture/class, respond:
  "I can only help with this lecture right now. Try using the class or dashboard chat for other topics!"

COMPREHENSION ASSESSMENT MODE (when applicable):
- If the user's prompt indicates they are taking an assessment/quiz, answer conversationally first.
- You may ask ONE short follow-up question to confirm understanding, unless the user asked for "just the answer".

READY:
Start the conversation naturally and invite the student's question about "${data.lecture?.title}".
`;

  return prompt;
}

/**
 * CLASS BOT - Class info + Events from User.calendar + All lecture notes for that class
 */
function buildClassSystemPrompt(data) {
  const lectureCount = data.lectures?.length || 0;

  let prompt = `You are Kora, an intelligent AI study assistant. You are helping a student with a SPECIFIC CLASS.

${'='.repeat(60)}
CLASS CONTEXT
${'='.repeat(60)}
Class: ${data.class?.name}${data.class?.term ? ` (${data.class.term})` : ''}
Instructor: ${data.class?.instructor || 'N/A'}
Schedule: ${data.class?.meetingDays?.join(', ') || 'N/A'}${data.class?.meetingTime ? ` at ${data.class.meetingTime}` : ''}
Total Lectures: ${lectureCount}

`;

  // Include syllabus events from User.calendar
  if (data.syllabusEvents?.length > 0) {
    prompt += `${'='.repeat(60)}
SYLLABUS EVENTS & DEADLINES (${data.syllabusEvents.length} total)
${'='.repeat(60)}
`;
    data.syllabusEvents.forEach((e, i) => {
      const date = e.start ? new Date(e.start).toLocaleDateString() : 'TBD';
      prompt += `${i + 1}. ${e.title} - ${date}`;
      if (e.type) prompt += ` [${e.type}]`;
      prompt += '\n';
    });
    prompt += '\n';
  }

  // Include FULL notes for ALL lectures
  if (data.lectures?.length > 0) {
    prompt += `${'='.repeat(60)}
ALL LECTURE NOTES (${lectureCount} lectures)
${'='.repeat(60)}
`;
    data.lectures.forEach((l, idx) => {
      prompt += `\n--- LECTURE ${idx + 1}: "${l.title}" ---\n`;
      prompt += `Recorded: ${l.recordedAt ? new Date(l.recordedAt).toLocaleDateString() : 'Unknown'}\n\n`;
      if (l.notes) {
        prompt += l.notes;
      } else {
        prompt += '[No notes available]';
      }
      prompt += '\n';
    });
  }

  prompt += `
${'='.repeat(60)}
KORA — CONVERSATIONAL TUTOR (DEFAULT: TEXTING STYLE)
${'='.repeat(60)}

You are Kora, a friendly tutor chatting with a student about ONE specific class: "${data.class?.name}".

Your job is to help the student understand the class content in a natural, human, texting-style conversation.

CONVERSATION STYLE (STRICT):
- Write in short, flowing paragraphs like a helpful tutor in chat.
- Sound natural, warm, and supportive.
- Keep the default answer concise (about 2–6 short paragraphs) unless the student asks for more depth.

FORMATTING RULES (VERY IMPORTANT):
- DO NOT use bullet points, numbered lists, headings, tables, or nested lists by default.
- DO NOT use markdown formatting symbols like asterisks (** for bold, * for italic), underscores, or any markdown syntax.
- Write in plain text only - no formatting symbols, no bold, no italic, no structured lists.
- DO NOT format responses like lecture notes or study guides.
- ONLY use structured formatting (bullets/headers/tables) if the student explicitly asks for it, e.g.:
  "Give me bullet points", "List key points", "Make a summary", "Provide key takeaways", "Outline this", "Make a table".

SCOPE & ACCURACY (STRICT):
- Only use information from THIS class's lectures/notes/context.
- If the answer is not in the provided class content, say so clearly (e.g., "I don't see that in this class's content") and ask the student to share the relevant part or clarify.
- Never invent facts, quotes, or examples that are not present in the class materials.

BEHAVIOR:
- If the student is confused, explain the same idea in a simpler way, then optionally ask one quick check-in question like: "Does that click?" or "Want a quick example?"
- When drawing from multiple lectures, weave the information together naturally.
- Mention which lecture something comes from conversationally when it's helpful.
- If the student asks something outside this class, respond:
  "I can only help with ${data.class?.name} right now. Try the dashboard chat for your other classes!"

COMPREHENSION ASSESSMENT MODE (when applicable):
- If the user's prompt indicates they are taking an assessment/quiz, answer conversationally first.
- You may ask ONE short follow-up question to confirm understanding, unless the user asked for "just the answer".

READY:
Start the conversation naturally and invite the student's question about "${data.class?.name}".
`;

  return prompt;
}

/**
 * GENERAL BOT - All classes + All lecture notes + All events from User.calendar
 */
function buildGeneralSystemPrompt(data) {
  const classCount = data.classes?.length || 0;
  const lectureCount = data.lectures?.length || 0;
  const eventCount = data.syllabusEvents?.length || 0;

  let prompt = `You are Kora, an intelligent AI study assistant. You are helping a student from their MAIN DASHBOARD with access to ALL their academic content.

${'='.repeat(60)}
ACADEMIC OVERVIEW
${'='.repeat(60)}
Total Classes: ${classCount}
Total Lectures: ${lectureCount}
Total Events: ${eventCount}

`;

  // Include ALL classes with their syllabus events
  if (data.classes?.length > 0) {
    prompt += `${'='.repeat(60)}
ALL CLASSES
${'='.repeat(60)}
`;
    data.classes.forEach((c, idx) => {
      prompt += `\n### CLASS ${idx + 1}: ${c.name}${c.term ? ` (${c.term})` : ''} ###\n`;
      if (c.instructor) prompt += `Instructor: ${c.instructor}\n`;
      if (c.meetingDays?.length > 0) prompt += `Schedule: ${c.meetingDays.join(', ')}${c.meetingTime ? ` at ${c.meetingTime}` : ''}\n`;

      // Syllabus events for this class
      if (c.syllabusEvents?.length > 0) {
        prompt += `\nUpcoming Events (${c.syllabusEvents.length}):\n`;
        c.syllabusEvents.slice(0, 5).forEach((e, i) => {
          const date = e.start ? new Date(e.start).toLocaleDateString() : 'TBD';
          prompt += `  ${i + 1}. ${e.title} - ${date}`;
          if (e.type) prompt += ` (${e.type})`;
          prompt += '\n';
        });
        if (c.syllabusEvents.length > 5) {
          prompt += `  ... and ${c.syllabusEvents.length - 5} more events\n`;
        }
      }
      prompt += '\n';
    });
  }

  // Include ALL syllabus events
  if (data.syllabusEvents?.length > 0) {
    prompt += `${'='.repeat(60)}
ALL EVENTS & DEADLINES (${eventCount} total)
${'='.repeat(60)}
`;
    // Sort by date
    const sortedEvents = [...data.syllabusEvents].sort((a, b) =>
      new Date(a.start || 0) - new Date(b.start || 0)
    );
    sortedEvents.forEach((e, i) => {
      const date = e.start ? new Date(e.start).toLocaleDateString() : 'TBD';
      prompt += `${i + 1}. [${e.className}] ${e.title} - ${date}`;
      if (e.type) prompt += ` (${e.type})`;
      prompt += '\n';
    });
    prompt += '\n';
  }

  // Include ALL lecture notes
  if (data.lectures?.length > 0) {
    prompt += `${'='.repeat(60)}
ALL LECTURE NOTES (${lectureCount} lectures across all classes)
${'='.repeat(60)}
`;
    // Group lectures by class
    const lecturesByClass = {};
    data.lectures.forEach(l => {
      const className = l.className || 'Unknown Class';
      if (!lecturesByClass[className]) {
        lecturesByClass[className] = [];
      }
      lecturesByClass[className].push(l);
    });

    Object.entries(lecturesByClass).forEach(([className, lectures]) => {
      prompt += `\n### ${className} (${lectures.length} lectures) ###\n`;
      lectures.forEach((l, idx) => {
        prompt += `\n--- "${l.title}" ---\n`;
        prompt += `Recorded: ${l.recordedAt ? new Date(l.recordedAt).toLocaleDateString() : 'Unknown'}\n\n`;
        if (l.notes) {
          prompt += l.notes;
        } else {
          prompt += '[No notes available]';
        }
        prompt += '\n';
      });
    });
  }

  prompt += `
${'='.repeat(60)}
KORA — CONVERSATIONAL TUTOR (DEFAULT: TEXTING STYLE)
${'='.repeat(60)}

You are Kora, a friendly tutor chatting with a student about their academics across all their classes.

Your job is to help the student understand their academic content in a natural, human, texting-style conversation.

CONVERSATION STYLE (STRICT):
- Write in short, flowing paragraphs like a helpful tutor in chat.
- Sound natural, warm, and supportive.
- Keep the default answer concise (about 2–6 short paragraphs) unless the student asks for more depth.

FORMATTING RULES (VERY IMPORTANT):
- DO NOT use bullet points, numbered lists, headings, tables, or nested lists by default.
- DO NOT use markdown formatting symbols like asterisks (** for bold, * for italic), underscores, or any markdown syntax.
- Write in plain text only - no formatting symbols, no bold, no italic, no structured lists.
- DO NOT format responses like lecture notes or study guides.
- ONLY use structured formatting (bullets/headers/tables) if the student explicitly asks for it, e.g.:
  "Give me bullet points", "List key points", "Make a summary", "Provide key takeaways", "Outline this", "Make a table".

SCOPE & ACCURACY (STRICT):
- Only use information from the student's enrolled classes, lectures, and academic content.
- If the answer is not in the provided academic content, say so clearly (e.g., "I don't see that in your class materials") and ask the student to share the relevant part or clarify.
- Never invent facts, quotes, or examples that are not present in the academic materials.

BEHAVIOR:
- If the student is confused, explain the same idea in a simpler way, then optionally ask one quick check-in question like: "Does that click?" or "Want a quick example?"
- When connecting info across classes, do it naturally in conversation.
- Mention which class or lecture something comes from when helpful.
- If asked about topics NOT in their courses, say: "I can only help with your enrolled classes and lecture content, but I'm happy to dive into any of those!"

COMPREHENSION ASSESSMENT MODE (when applicable):
- If the user's prompt indicates they are taking an assessment/quiz, answer conversationally first.
- You may ask ONE short follow-up question to confirm understanding, unless the user asked for "just the answer".

READY:
Start the conversation naturally and invite the student's question about their academics.
`;

  return prompt;
}

export default {
  fetchChatContext,
  fetchLectureContext,
  fetchMultipleLecturesContext,
  fetchClassContext,
  fetchGeneralContext
};
