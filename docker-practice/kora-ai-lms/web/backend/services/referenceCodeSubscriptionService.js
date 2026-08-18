import User from '../models/User.js';
import ReferenceCode from '../models/ReferenceCode.js';
import ReferenceCodeSubscriptionEvent from '../models/ReferenceCodeSubscriptionEvent.js';

const PLAN_BUCKET_ALIASES = {
  KBASSUB15: 'basic_plan',
  KPROSUB20: 'pro_plan'
};

function getUserPlanEnumValues() {
  const subscriptionSchema = User.schema.path('subscription')?.schema;
  const planPath = subscriptionSchema?.path('plan_id');
  return Array.isArray(planPath?.enumValues) ? planPath.enumValues : [];
}

function normalizePlanBucket(planId) {
  const normalized = String(planId || '').trim();
  return PLAN_BUCKET_ALIASES[normalized] || normalized;
}

function formatPlanLabel(planId) {
  const normalized = String(planId || '').trim();
  if (!normalized) return '';

  if (normalized.endsWith('_plan')) {
    return normalized
      .replace(/_plan$/, '')
      .split(/[_-]/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  if (/^[a-z0-9_-]+$/i.test(normalized) && (normalized.includes('_') || normalized.includes('-'))) {
    return normalized
      .split(/[_-]/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  return normalized;
}

export function getTrackableSubscriptionPlans() {
  const uniquePlanBuckets = Array.from(new Set(
    getUserPlanEnumValues()
      .filter((planId) => planId && planId !== 'free')
      .map((planId) => normalizePlanBucket(planId))
  ));

  return uniquePlanBuckets
    .map((planId) => ({
      id: planId,
      label: formatPlanLabel(planId)
    }));
}

const PAID_PLAN_IDS = getTrackableSubscriptionPlans().map((plan) => plan.id);

export function isPaidPlan(planId) {
  return PAID_PLAN_IDS.includes(normalizePlanBucket(planId));
}

function isReferenceCodeValidForTracking(referenceCode, occurredAt = new Date()) {
  if (!referenceCode || referenceCode.isActive === false) {
    return false;
  }

  if (referenceCode.expiresAt && new Date(referenceCode.expiresAt) < new Date(occurredAt)) {
    return false;
  }

  return true;
}

export async function recordReferenceCodeSubscriptionEvent({
  user = null,
  userId = null,
  planId,
  source = 'unknown',
  sourceTransactionId = null,
  subscriptionId = null,
  eventType = 'initial',
  occurredAt = new Date()
}) {
  if (!isPaidPlan(planId)) {
    return { recorded: false, reason: 'non_paid_plan' };
  }

  const resolvedUser = user || await User.findById(userId)
    .select('_id professorClassCode')
    .lean();

  if (!resolvedUser?._id) {
    return { recorded: false, reason: 'user_not_found' };
  }

  const normalizedCode = String(resolvedUser.professorClassCode || '').toUpperCase().trim();
  if (!normalizedCode) {
    return { recorded: false, reason: 'no_reference_code' };
  }

  const referenceCode = await ReferenceCode.findOne({ code: normalizedCode })
    .select('_id code expiresAt isActive')
    .lean();

  if (!isReferenceCodeValidForTracking(referenceCode, occurredAt)) {
    return { recorded: false, reason: 'invalid_or_expired_reference_code' };
  }

  try {
    const event = await ReferenceCodeSubscriptionEvent.create({
      userId: resolvedUser._id,
      referenceCodeId: referenceCode._id,
      referenceCode: referenceCode.code,
      planId: normalizePlanBucket(planId),
      eventType,
      source,
      sourceTransactionId: sourceTransactionId ? String(sourceTransactionId) : null,
      subscriptionId: subscriptionId ? String(subscriptionId) : null,
      occurredAt
    });

    return { recorded: true, event };
  } catch (error) {
    if (error?.code === 11000) {
      return { recorded: false, reason: 'duplicate_event' };
    }

    throw error;
  }
}

export async function getReferenceCodeSubscriptionMetrics() {
  const [totalSubscriptions, activeSubscriptions, totalSubscriptionsByPlan, activeSubscriptionsByPlan] = await Promise.all([
    ReferenceCodeSubscriptionEvent.aggregate([
      {
        $group: {
          _id: '$referenceCode',
          count: { $sum: 1 }
        }
      }
    ]),
    User.aggregate([
      {
        $match: {
          role: 'student',
          professorClassCode: { $ne: '', $exists: true },
          'subscription.plan_id': { $in: [...PAID_PLAN_IDS, ...Object.keys(PLAN_BUCKET_ALIASES)] },
          'subscription.status': 'active'
        }
      },
      {
        $group: {
          _id: '$professorClassCode',
          count: { $sum: 1 }
        }
      }
    ]),
    ReferenceCodeSubscriptionEvent.aggregate([
      {
        $group: {
          _id: {
            referenceCode: '$referenceCode',
            planId: '$planId'
          },
          count: { $sum: 1 }
        }
      }
    ]),
    User.aggregate([
      {
        $match: {
          role: 'student',
          professorClassCode: { $ne: '', $exists: true },
          'subscription.plan_id': { $in: [...PAID_PLAN_IDS, ...Object.keys(PLAN_BUCKET_ALIASES)] },
          'subscription.status': 'active'
        }
      },
      {
        $group: {
          _id: {
            referenceCode: '$professorClassCode',
            planId: '$subscription.plan_id'
          },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const totalByPlanMap = new Map();
  totalSubscriptionsByPlan.forEach((entry) => {
    const code = String(entry._id?.referenceCode || '').toUpperCase().trim();
    const planId = normalizePlanBucket(entry._id?.planId);
    if (!code || !planId) return;

    const existing = totalByPlanMap.get(code) || {};
    existing[planId] = (existing[planId] || 0) + entry.count;
    totalByPlanMap.set(code, existing);
  });

  const activeByPlanMap = new Map();
  activeSubscriptionsByPlan.forEach((entry) => {
    const code = String(entry._id?.referenceCode || '').toUpperCase().trim();
    const planId = normalizePlanBucket(entry._id?.planId);
    if (!code || !planId) return;

    const existing = activeByPlanMap.get(code) || {};
    existing[planId] = (existing[planId] || 0) + entry.count;
    activeByPlanMap.set(code, existing);
  });

  return {
    plans: getTrackableSubscriptionPlans(),
    totalMap: new Map(totalSubscriptions.map((entry) => [String(entry._id).toUpperCase().trim(), entry.count])),
    activeMap: new Map(activeSubscriptions.map((entry) => [String(entry._id).toUpperCase().trim(), entry.count])),
    totalByPlanMap,
    activeByPlanMap
  };
}
