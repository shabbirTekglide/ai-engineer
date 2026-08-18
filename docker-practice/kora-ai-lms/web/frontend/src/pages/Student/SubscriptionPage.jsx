// src/components/kora/SubscriptionPage.jsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Check, Star, Crown, Zap, Rocket, Book } from 'lucide-react'; // Removed LogOut as it wasn't used in view
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { getStudentProfile } from '../../store/slicers/studProfileSlice';
// import SubscriptionDialog from '../../components/kora/SubscriptionDialog';

const CLASS_CODE_DISCOUNT_RATE = 0.10;

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

const getDiscountedPrice = (amount) =>
  amount - (amount * CLASS_CODE_DISCOUNT_RATE);

const SubscriptionPage = () => {
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.studentprofile?.profile);

  useEffect(() => {
    if (!profile) {
      dispatch(getStudentProfile());
    }
  }, [dispatch, profile]);

  const isClassCodeDiscountEligible = Boolean(
    profile?.professorClassCode && !profile?.classCodeDiscountAvailed,
  );

  // --- UPDATED HANDLER ---
  const handlePlanClick = (plan) => {
    // If it's the free plan, do nothing (button is disabled, but safety check here)
    if (plan.name === 'Free') return;

    // Navigate to payment page with the plan ID in state
    navigate('/payment', {
      state: {
        planId: plan.id,
        planPrice: plan.price // Optional: helpful to pass price too
      }
    });
  };

  const handleCloseSubscriptionDialog = () => {
    setSubscriptionDialogOpen(false);
    setSelectedPlan(null);
  };

  const plans = [
    {
      id: 'testplan',
      name: 'Free',
      price: '$0',
      numericPrice: 0,
      period: 'month',
      description: 'Free Trial Includes:',
      features: ['3 hours of Lecture Recording', '7 days of full access to all AI tools', 'Syllabus & calendar sync', 'Cross-device sync'],
      icon: <Zap className="h-6 w-6" />,
      popular: false
    },
    {
      id: 'basic_plan',
      name: 'Basic', // Note: logic below checks for 'basic' or 'Premium'
      price: '$15.00',
      numericPrice: 15,
      period: 'month',
      description: 'Basic Includes:',
      features: [
        'Up to 20 hours of lecture recording:', 'AI-powered note generation', 'Study Guides', 'Smart flashcard creation', 'Practice quizzes',
        'Syllabus & calendar sync', 'Cross-device sync', 'Unlimited study sessions', 'Unlimited classes'
      ],
      icon: <Star className="h-6 w-6" />,
      popular: true
    },
    {
      id: 'pro_plan',
      name: 'Pro',
      price: '$20.00',
      numericPrice: 20,
      period: 'month',
      description: 'Pro Includes:',
      features: [
        'Unlimited Lecture Recording', 'AI-powered note generation', 'Study Guides', 'Smart flashcard creation', 'Practice quizzes',
        'Syllabus & calendar sync', 'Cross-device sync', 'Unlimited study sessions', 'Unlimited classes'
      ],
      icon: <Crown className="h-6 w-6" />,
      popular: false
    }
  ];

  const cardFeatures = [
    { id: 1, featureIcon: <Star />, featureTitle: "Smart Learning", featureText: "AI-powered personalized study plans" },
    { id: 2, featureIcon: <Rocket />, featureTitle: "Unlimited Access", featureText: "Study anytime, anywhere without limits" },
    { id: 3, featureIcon: <Book />, featureTitle: "Better Results", featureText: "Proven to improve learning outcomes" },
  ];

  return (
    <>
      <div className="min-h-screen font-[Inter] bg-gradient-to-b from-blue-50 via-purple-50 to-indigo-100 py-16 px-6">

        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">
              Upgrade Your <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Learning Experience</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Unlock the full potential of <span className="font-semibold text-blue-600">Rubitt</span> with our premium plans. Choose the perfect plan for your learning journey.
            </p>
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              // Helper to check if plan is free
              const isFreePlan = plan.name === 'Free';
              const showClassCodeDiscount = isClassCodeDiscountEligible && !isFreePlan;
              const discountedPrice = showClassCodeDiscount
                ? formatCurrency(getDiscountedPrice(plan.numericPrice))
                : null;

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col justify-between rounded-2xl p-6 bg-white shadow-md hover:shadow-lg border ${plan.popular ? "border-[#9810FA] shadow-lg" : "border-gray-200"} transition-all duration-300`}
                >
                  {plan.popular && (
                    <Badge className="hover:bg-none focus:ring-none focus:none absolute -top-3 left-1/2 -translate-x-1/2 bg-[#9810FA] text-white px-4 py-1 rounded-full text-sm shadow-md">
                      Most Popular
                    </Badge>
                  )}

                  <CardHeader className=" pb-0">
                    <div className="flex justify-center mb-4">
                      <div
                        className={`p-4 rounded-full ${plan.name === "Free" ? "bg-gray-100 text-gray-600" :
                          (plan.name === "basic" || plan.name === "Premium") ? "bg-blue-100 text-blue-600" :
                            "bg-purple-100 text-purple-600"
                          }`}
                      >
                        {plan.icon}
                      </div>
                    </div>

                    <CardTitle className="text-center">
                      <span className="text-2xl font-extrabold tracking-tight text-gray-900">{plan.name}</span>
                    </CardTitle>

                    <div className="mt-3 text-center">
                      {showClassCodeDiscount ? (
                        <div className="space-y-1">
                          <div className="flex items-end justify-center gap-2">
                            <span className="text-lg font-semibold text-gray-400 line-through">{plan.price}</span>
                            <span className="text-4xl font-extrabold text-gray-900">{discountedPrice}</span>
                            <span className="text-gray-500 ml-1">/{plan.period}</span>
                          </div>
                          <p className="text-xs font-semibold text-green-600">Includes an extra 10% class code discount, applicable to the student's first month only.
</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                          <span className="text-gray-500 ml-2">/{plan.period}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-gray-600 mt-5 text-sm">{plan.description}</p>
                  </CardHeader>

                  <CardContent className="flex flex-col flex-1 justify-between mt-2 p-3">
                    <ul className="space-y-3 mb-8 text-left">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700 text-sm">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className={`${idx === 0 ? "font-bold" : ""}`}>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* --- UPDATED BUTTON LOGIC --- */}
                    <Button
                      onClick={() => handlePlanClick(plan)}
                      disabled={isFreePlan} // Disable if Free
                      className={`mt-auto w-full py-3 text-md font-semibold rounded-xl shadow-sm transition-all duration-200 
                        ${isFreePlan
                          ? "bg-gray-400 text-white cursor-not-allowed opacity-70 hover:bg-gray-400" // Disabled styles
                          : (plan.name === "basic" || plan.name === "Premium")
                            ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                            : "bg-[#9810FA] hover:bg-purple-700 text-white cursor-pointer"
                        }`}
                    >
                      {isFreePlan ? "Free Plan" : "Get Started"}
                    </Button>

                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Feature cards */}
          {/* <div className="max-w-6xl mx-auto mt-20 text-center">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm text-gray-700">
              {cardFeatures.map((item) => (
                <div
                  key={item.id}
                  className="p-5 [box-shadow:rgba(0,_0,_0,_0.1)_0px_10px_15px_-3px,_rgba(0,_0,_0,_0.05)_0px_4px_6px_-2px] bg-white rounded-sm transition-all duration-200"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="h-7 w-7 text-[#9810FA] flex justify-center items-center">{item.featureIcon}</span>
                    <h3 className="font-semibold text-gray-900 text-lg">{item.featureTitle}</h3>
                  </div>
                  <p className="text-center">{item.featureText}</p>
                </div>
              ))}
            </div>
          </div> */}
        </div>

        {/* <SubscriptionDialog
          open={subscriptionDialogOpen}
          onClose={handleCloseSubscriptionDialog}
          plan={selectedPlan}
        /> */}
      </div>
    </>
  );
};

export default SubscriptionPage;
