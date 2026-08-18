import React from 'react';
import PaymentForm from '../../components/kora/PaymentForm';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

function Payment() {
  const location = useLocation();
  const navigate = useNavigate();
  const { subscriptionType, subscriptionStatus } = useSelector((state) => state.auth);
  let { planId, planPrice } = location.state || {};
  const queryParams = new URLSearchParams(location.search);
  if (!planId) {
    planId = queryParams.get('planId');
    planPrice = queryParams.get('planPrice'); // optional, can be null
  }
  // Now planId is available from either source
  console.log('Plan ID:', planId);
  console.log('Plan Price:', planPrice);
  // Condition: active status AND it's not a free plan
  const hasActivePaidPlan = subscriptionStatus === 'active' && subscriptionType !== 'free';

  return (
    <div className="p-4" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {hasActivePaidPlan ? (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '32px', maxWidth: '450px', width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg style={{ width: '32px', height: '32px', color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', marginTop: 0 }}>Active Subscription</h2>
          <p style={{ color: '#4b5563', marginBottom: '24px', lineHeight: '1.5' }}>
            Your current plan (<strong style={{ textTransform: 'capitalize' }}>{subscriptionType?.replace('_', ' ')}</strong>) is already active. You can continue enjoying the premium features.
          </p>
          <button
            onClick={() => navigate(-1)} // Go back to previous page
            style={{ backgroundColor: '#4f46e5', color: '#ffffff', padding: '10px 24px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Go Back
          </button>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          <PaymentForm planId={planId} planPrice={planPrice} />
        </div>
      )}
    </div>
  );
}

export default Payment;