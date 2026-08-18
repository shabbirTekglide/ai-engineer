import ReferenceCode from '../models/ReferenceCode.js';
import ReferenceCodeSubscriptionEvent from '../models/ReferenceCodeSubscriptionEvent.js';
import User from '../models/User.js';
import StudentProfile from '../models/studentprofile.js';
import { OfficeConverter } from 'officeparser';
import { getReferenceCodeSubscriptionMetrics } from '../services/referenceCodeSubscriptionService.js';

const IMPORT_REQUIRED_HEADERS = ['First Name', 'Last Name', 'Semester', 'Expiry'];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvText(csvText) {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((acc, header, idx) => {
      acc[header] = values[idx] ?? '';
      return acc;
    }, {});
  });

  return { headers, rows };
}

function normalizeHeaderName(header) {
  return String(header || '').trim().toLowerCase();
}

function normalizeImportRow(row, headerMap) {
  const professorFirstName = String(row[headerMap.firstName] || '').trim();
  const professorLastName = String(row[headerMap.lastName] || '').trim();
  const semester = String(row[headerMap.semester] || '').trim();
  const expiry = String(row[headerMap.expiry] || '').trim();

  return {
    professorFirstName,
    professorLastName,
    professorName: `${professorFirstName} ${professorLastName}`.trim(),
    semester,
    expiresAt: normalizeExpiryDateInput(expiry)
  };
}

async function generateUniqueReferenceCode(existingCodes) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';

  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = 'R';

    for (let index = 0; index < 3; index += 1) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }

    for (let index = 0; index < 3; index += 1) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }

    const normalizedCode = code.toUpperCase();

    if (!existingCodes.has(normalizedCode)) {
      existingCodes.add(normalizedCode);
      return normalizedCode;
    }
  }

  throw new Error('Unable to generate a unique reference code. Please try importing again.');
}

async function extractImportRows(file) {
  if (!file?.buffer?.length) {
    throw new Error('Please upload a CSV or Excel file.');
  }

  const fileName = file.originalname || 'reference-codes.csv';
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  let csvText = '';

  if (extension === 'csv') {
    csvText = file.buffer.toString('utf8');
  } else if (extension === 'xlsx') {
    const result = await OfficeConverter.convert(file.buffer, 'csv', {
      parseConfig: { fileType: 'xlsx' }
    });
    csvText = result?.value || '';
  } else {
    throw new Error('Unsupported file format. Please upload a CSV or XLSX file.');
  }

  return parseCsvText(csvText);
}

function serializeReferenceCode(referenceCode) {
  const plain = typeof referenceCode.toObject === 'function'
    ? referenceCode.toObject()
    : referenceCode;

  return {
    ...plain,
    totalAssigned: plain.assignedUsers?.length || 0
  };
}

function normalizeExpiryDateInput(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const isoLikeValue = /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)
    ? `${trimmedValue}T23:59:59.999Z`
    : trimmedValue;

  const date = new Date(isoLikeValue);
  if (Number.isNaN(date.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

export const getAllReferenceCodes = async (req, res) => {
  try {
    const { active, semester } = req.query;
    const query = {};

    if (active === 'true') query.isActive = true;
    if (active === 'false') query.isActive = false;
    if (semester && semester !== 'all') query.semester = semester;

    const referenceCodes = await ReferenceCode.find(query)
      .select('_id code description professorName professorFirstName professorLastName semester assignedUsers isActive expiresAt createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    // Dynamically calculate actual assigned user count from User table (covers old/new entries)
    const [counts, subscriptionMetrics] = await Promise.all([
      User.aggregate([
        { $match: { role: 'student', professorClassCode: { $ne: '', $exists: true } } },
        { $group: { _id: '$professorClassCode', count: { $sum: 1 } } }
      ]),
      getReferenceCodeSubscriptionMetrics()
    ]);

    const countMap = new Map(counts.map(c => [String(c._id).toUpperCase().trim(), c.count]));

    const data = referenceCodes.map(rc => {
      const plain = typeof rc.toObject === 'function' ? rc.toObject() : rc;
      const cleanCode = (plain.code || '').toUpperCase().trim();
      const totalByPlan = subscriptionMetrics.totalByPlanMap.get(cleanCode) || {};
      const activeByPlan = subscriptionMetrics.activeByPlanMap.get(cleanCode) || {};
      const planSubscriptionCounts = subscriptionMetrics.plans.reduce((acc, plan) => {
        acc[plan.id] = Math.max(totalByPlan[plan.id] || 0, activeByPlan[plan.id] || 0);
        return acc;
      }, {});

      return {
        ...plain,
        totalAssigned: countMap.get(cleanCode) || 0,
        totalPlanSubscriptions: Math.max(subscriptionMetrics.totalMap.get(cleanCode) || 0, subscriptionMetrics.activeMap.get(cleanCode) || 0),
        activeSubscriptions: subscriptionMetrics.activeMap.get(cleanCode) || 0,
        planSubscriptionCounts
      };
    });

    res.status(200).json({
      success: true,
      data,
      plans: subscriptionMetrics.plans,
      count: data.length
    });
  } catch (error) {
    console.error('Get all reference codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const importReferenceCodes = async (req, res) => {
  try {
    const { headers, rows } = await extractImportRows(req.file);

    if (!headers.length) {
      return res.status(400).json({
        success: false,
        message: 'The import file is empty.'
      });
    }

    const normalizedHeaders = headers.reduce((acc, header) => {
      acc[normalizeHeaderName(header)] = header;
      return acc;
    }, {});

    const missingHeaders = IMPORT_REQUIRED_HEADERS.filter(
      (header) => !normalizedHeaders[normalizeHeaderName(header)]
    );

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingHeaders.join(', ')}`
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The import file does not contain any data rows.'
      });
    }

    const headerMap = {
      firstName: normalizedHeaders['first name'],
      lastName: normalizedHeaders['last name'],
      semester: normalizedHeaders.semester,
      expiry: normalizedHeaders.expiry
    };

    const existingCodes = new Set(
      (await ReferenceCode.find({}, 'code').lean()).map((item) => item.code.toUpperCase().trim())
    );

    const documentsToInsert = [];
    const rowErrors = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const normalizedRow = normalizeImportRow(row, headerMap);

      if (!normalizedRow.professorFirstName) {
        rowErrors.push(`Row ${rowNumber}: First Name is required.`);
      }

      if (!normalizedRow.professorLastName) {
        rowErrors.push(`Row ${rowNumber}: Last Name is required.`);
      }

      if (!normalizedRow.semester) {
        rowErrors.push(`Row ${rowNumber}: Semester is required.`);
      }

      if (!String(row[headerMap.expiry] || '').trim()) {
        rowErrors.push(`Row ${rowNumber}: Expiry is required.`);
      } else if (!normalizedRow.expiresAt) {
        rowErrors.push(`Row ${rowNumber}: Expiry must be a valid date.`);
      }

      documentsToInsert.push(normalizedRow);
    });

    if (rowErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: rowErrors[0],
        errors: rowErrors
      });
    }

    const payload = [];
    for (const document of documentsToInsert) {
      payload.push({
        code: await generateUniqueReferenceCode(existingCodes),
        description: '',
        professorName: document.professorName,
        professorFirstName: document.professorFirstName,
        professorLastName: document.professorLastName,
        semester: document.semester,
        expiresAt: document.expiresAt,
        assignedUsers: [],
        isActive: true
      });
    }

    const createdReferenceCodes = await ReferenceCode.insertMany(payload);

    res.status(201).json({
      success: true,
      message: `${createdReferenceCodes.length} reference code${createdReferenceCodes.length === 1 ? '' : 's'} imported successfully`,
      data: createdReferenceCodes.map(serializeReferenceCode)
    });
  } catch (error) {
    console.error('Import reference codes error:', error);
    const statusCode = /Unsupported file format|Please upload|Unable to generate|does not contain/i.test(error.message || '')
      ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to import reference codes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// export const createReferenceCode = async (req, res) => {
//   try {
//     const referenceData = req.validated || req.body;
//     const normalizedReferenceData = {
//       ...referenceData,
//       expiresAt: referenceData.expiresAt || null
//     };

//     const existing = await ReferenceCode.findOne({
//       code: normalizedReferenceData.code.toUpperCase().trim()
//     });

//     if (existing) {
//       return res.status(400).json({
//         success: false,
//         message: 'Reference code already exists'
//       });
//     }

//     const referenceCode = await ReferenceCode.create(normalizedReferenceData);

//     res.status(201).json({
//       success: true,
//       message: 'Reference code created successfully',
//       data: serializeReferenceCode(referenceCode)
//     });
//   } catch (error) {
//     console.error('Create reference code error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

export const createReferenceCode = async (req, res) => {
  try {
    const fallbackExpiresAt = normalizeExpiryDateInput(req.body?.expiresAt);

    const normalizedReferenceData = {
      ...(req.validated || req.body),
      code: (req.validated?.code || req.body?.code || '').toUpperCase().trim(),
      professorName: `${req.validated?.professorFirstName || req.body?.professorFirstName || ''} ${req.validated?.professorLastName || req.body?.professorLastName || ''}`.trim(),
      assignedUsers: req.validated?.assignedUsers || [],
      isActive: req.validated?.isActive ?? true,
      expiresAt: req.validated?.expiresAt ?? fallbackExpiresAt ?? null
    };

    const existing = await ReferenceCode.findOne({
      code: normalizedReferenceData.code
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Reference code already exists'
      });
    }

    const referenceCode = await ReferenceCode.create(normalizedReferenceData);

    res.status(201).json({
      success: true,
      message: 'Reference code created successfully',
      data: serializeReferenceCode(referenceCode)
    });
  } catch (error) {
    console.error('Create reference code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
export const updateReferenceCode = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.validated || req.body;
    const fallbackExpiresAt = normalizeExpiryDateInput(req.body?.expiresAt);
    const normalizedUpdateData = {
      ...updateData,
      ...(updateData.code ? { code: updateData.code.toUpperCase().trim() } : {}),
      ...(updateData.professorFirstName || updateData.professorLastName
        ? {
            professorName: `${updateData.professorFirstName || ''} ${updateData.professorLastName || ''}`.trim()
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updateData, 'expiresAt')
        ? { expiresAt: updateData.expiresAt ?? fallbackExpiresAt ?? null }
        : {})
    };

    if (normalizedUpdateData.code) {
      const existing = await ReferenceCode.findOne({
        code: normalizedUpdateData.code.toUpperCase().trim(),
        _id: { $ne: id }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Reference code with this name already exists'
        });
      }
    }

    const referenceCode = await ReferenceCode.findByIdAndUpdate(
      id,
      { $set: normalizedUpdateData },
      { new: true, runValidators: true }
    );

    if (!referenceCode) {
      return res.status(404).json({
        success: false,
        message: 'Reference code not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reference code updated successfully',
      data: serializeReferenceCode(referenceCode)
    });
  } catch (error) {
    console.error('Update reference code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getReferenceCodeDetailById = async (req, res) => {
  try {
    const { id } = req.params;
    const referenceCode = await ReferenceCode.findById(id).lean();

    if (!referenceCode) {
      return res.status(404).json({
        success: false,
        message: 'Reference code not found'
      });
    }

    const assignedCount = await User.countDocuments({
      role: 'student',
      professorClassCode: referenceCode.code.toUpperCase().trim()
    });

    const data = {
      ...referenceCode,
      totalAssigned: assignedCount
    };

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get reference code detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


export const deleteReferenceCode = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReferenceCode = await ReferenceCode.findByIdAndDelete(id);

    if (!deletedReferenceCode) {
      return res.status(404).json({
        success: false,
        message: 'Reference code not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reference code deleted successfully'
    });
  } catch (error) {
    console.error('Delete reference code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('name email isVerified').lean();
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAttributionReport = async (req, res) => {
  try {
    const users = await User.find({
      role: 'student',
      professorClassCode: { $ne: '', $exists: true }
    }).lean();

    const userIds = users.map(u => u._id);
    const profiles = await StudentProfile.find({ userId: { $in: userIds } }).lean();
    const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

    const referenceCodes = await ReferenceCode.find().lean();
    const codeMap = new Map(referenceCodes.map(rc => [rc.code.toUpperCase().trim(), rc]));

    const data = users.map(user => {
      const profile = profileMap.get(user._id.toString());
      const refCode = user.professorClassCode ? codeMap.get(user.professorClassCode.toUpperCase().trim()) : null;

      const shortId = `u${user._id.toString().slice(-7)}`;

      // Resolve subscription status
      const planId = user.subscription?.plan_id || 'free';
      const status = user.subscription?.status || 'active';

      let subscriptionStatus = 'None';
      if (['basic_plan', 'pro_plan', 'KBASSUB15', 'KPROSUB20'].includes(planId)) {
        subscriptionStatus = status === 'active' ? 'Active' : 'None';
      } else if (planId === 'free') {
        const createdAtDate = new Date(user.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - createdAtDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
          subscriptionStatus = 'Trial';
        } else {
          const availableSeconds = user.subscription?.availableSeconds ?? 0;
          subscriptionStatus = availableSeconds > 0 ? 'Free' : 'None';
        }
      }

      return {
        userId: shortId,
        mongoUserId: user._id,
        email: user.email,
        studentName: profile?.name || 'N/A',
        classCode: user.professorClassCode || 'N/A',
        professor: refCode?.professorName || 'N/A',
        professorFirstName: refCode?.professorFirstName || '',
        professorLastName: refCode?.professorLastName || '',
        semester: refCode?.semester || 'N/A',
        dateCodeEntered: user.classCodeEnteredAt || profile?.classCodeEnteredAt || user.createdAt,
        accountCreated: user.createdAt,
        subscriptionStatus
      };
    });

    // Sort by date entered descending
    data.sort((a, b) => new Date(b.dateCodeEntered) - new Date(a.dateCodeEntered));

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get attribution report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
