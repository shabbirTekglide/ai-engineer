import React from 'react'
import TestPaymentForm from '../../components/kora/TestPaymentForm'
import { useLocation } from 'react-router-dom';
function Payment() {
  const location = useLocation();
  const { planId, planPrice } = location.state || {};
  return (
    <div>
      <TestPaymentForm planId={planId} planPrice={planPrice} />
    </div>
  )
}

export default Payment