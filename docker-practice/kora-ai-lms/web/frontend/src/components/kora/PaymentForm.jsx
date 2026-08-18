// export default PaymentForm;
import { useState, useEffect, useRef } from "react";
import paymentApi from "../../api/paymentApi";
import { useDispatch, useSelector } from "react-redux";
import promoCodesApi from "../../api/promoCodesApi";
import { getStudentProfile } from "../../store/slicers/studProfileSlice";

const CLASS_CODE_DISCOUNT_RATE = 0.10;

const formatCurrency = (amount, options = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.fractionDigits ?? 2,
    maximumFractionDigits: options.fractionDigits ?? 2,
  }).format(amount);

const getDiscountedPrice = (amount) =>
  amount - (amount * CLASS_CODE_DISCOUNT_RATE);

// Plan Constants
const PLAN_DETAILS = {
  BASIC: { id: "basic_plan", price: "$15.00", numericPrice: 15, label: "Basic" },
  PRO: { id: "pro_plan", price: "$20.00", numericPrice: 20, label: "Pro" },
  NICKEL: { id: "nickel_test", price: "$0.10", numericPrice: 0.1, label: "Nickel Test" },
  PENNY: { id: "penny_test", price: "$0.01", numericPrice: 0.01, label: "Penny Test" },

};

// Backend promo/subscription validation expects these plan ids.
// Web UI currently uses `penny_test` / `nickel_test` for plan selection.
// const mapPlanIdForBackend = (planId) => {
//   if (planId === PLAN_DETAILS.BASIC.id) return "basic_plan";
//   if (planId === PLAN_DETAILS.PRO.id) return "pro_plan";
//   // Keep already-correct values, otherwise fall back to `all` to satisfy Zod enum.
//   if (planId === "free" || planId === "basic_plan" || planId === "pro_plan" || planId === "all") return planId;
//   return "all";
// };

// --- GLOBAL GUARD ---
const processedTokens = new Set();

const PaymentForm = ({ planId, planPrice }) => {
  const dispatch = useDispatch();
  // 1. Initial State Setup
  const isInitiallyPro = planId === PLAN_DETAILS.PRO.id;
  const initialPlanId = isInitiallyPro
    ? PLAN_DETAILS.PRO.id
    : PLAN_DETAILS.BASIC.id;
  const profile = useSelector((state) => state.studentprofile?.profile || {});
  const {
    name = "",
    professorClassCode = "",
    classCodeDiscountAvailed = false,
  } = profile;
  // const name = profile?.name || '';
  const [isPro, setIsPro] = useState(isInitiallyPro);
  const [testPlan, setTestPlan] = useState(null); // TEMPORARY
  const [formData, setFormData] = useState({
    first_name: name || "",
    last_name: "",
    email: "",
    plan_id: initialPlanId,
  });

  const [showCoupon, setShowCoupon] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponStatus, setCouponStatus] = useState(null); // { success: boolean, message: string }

  // const navigate = useNavigate(); // Not using this for success anymore
  const [loading, setLoading] = useState(false);
  const [collectJsLoaded, setCollectJsLoaded] = useState(false);

  // --- REFS (Source of Truth for Callback) ---
  const formDataRef = useRef(formData);

  // ✅ CRITICAL FIX: Direct Reference for Plan ID
  const activePlanRef = useRef(initialPlanId);

  // Form Data sync
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    if (!profile?.name && !profile?.professorClassCode) {
      dispatch(getStudentProfile());
    }
  }, [dispatch, profile]);

  // --- TOGGLE HANDLER ---
  const handlePlanToggle = (requestedProStatus) => {
    setIsPro(requestedProStatus);
    setTestPlan(null); // TEMPORARY

    const newPlanId = requestedProStatus
      ? PLAN_DETAILS.PRO.id
      : PLAN_DETAILS.BASIC.id;

    setFormData((prev) => ({
      ...prev,
      plan_id: newPlanId,
    }));

    activePlanRef.current = newPlanId;
    console.log("Plan switched to:", newPlanId);
  };

  // TEMPORARY TEST TOGGLE - CAN BE COMMENTED OUT LATER
  const handleTestPlanToggle = (testPlanId) => {
    setTestPlan(testPlanId);
    setFormData((prev) => ({
      ...prev,
      plan_id: testPlanId,
    }));
    activePlanRef.current = testPlanId;
    setCouponStatus(null);
  };

  console.log("couponStatus", couponStatus);
  const currentPlanName = testPlan === PLAN_DETAILS.NICKEL.id ? PLAN_DETAILS.NICKEL.label : testPlan === PLAN_DETAILS.PENNY.id ? PLAN_DETAILS.PENNY.label : isPro
    ? PLAN_DETAILS.PRO.label
    : PLAN_DETAILS.BASIC.label;
  const selectedPlanDetails = testPlan === PLAN_DETAILS.NICKEL.id
    ? PLAN_DETAILS.NICKEL
    : testPlan === PLAN_DETAILS.PENNY.id
      ? PLAN_DETAILS.PENNY
      : isPro
        ? PLAN_DETAILS.PRO
        : PLAN_DETAILS.BASIC;
  const isClassCodeDiscountEligible = Boolean(
    professorClassCode && !classCodeDiscountAvailed &&
    [
      PLAN_DETAILS.BASIC.id,
      PLAN_DETAILS.PRO.id,
      PLAN_DETAILS.NICKEL.id,
      PLAN_DETAILS.PENNY.id,
    ].includes(selectedPlanDetails.id),
  );
  const discountedDisplayPrice = isClassCodeDiscountEligible
    ? formatCurrency(
      getDiscountedPrice(selectedPlanDetails.numericPrice),
      selectedPlanDetails.id === PLAN_DETAILS.PENNY.id ? { fractionDigits: 3 } : {},
    )
    : null;
  const currentPrice = couponStatus?.valid
    ? "$00.00"
    : discountedDisplayPrice || selectedPlanDetails.price;

  // --- LOAD & CLEANUP LOGIC ---
  useEffect(() => {
    const cleanupOldInstances = () => {
      const oldScripts = document.querySelectorAll('script[src*="Collect.js"]');
      oldScripts.forEach((s) => s.remove());
      const iframes = document.querySelectorAll('iframe[id*="collect"]');
      iframes.forEach((f) => f.remove());
      const oldStyles = document.querySelectorAll(
        'link[href*="skybankgateway.com/token/styles.css"]',
      );
      oldStyles.forEach((l) => l.remove());
      const appleScripts = document.querySelectorAll(
        'script[src*="apple-pay-sdk.js"]',
      );
      appleScripts.forEach((s) => s.remove());
      if (window.CollectJS) delete window.CollectJS;
    };

    cleanupOldInstances();

    const script = document.createElement("script");
    script.src = "https://secure.skybankgateway.com/token/Collect.js";
    script.setAttribute(
      "data-tokenization-key",
      import.meta.env.VITE_TOKENIZATION_KEY,
    );
    script.setAttribute("data-payment-type", "cc");
    script.setAttribute("data-button-text", "Subscribe Now");
    script.setAttribute("data-field-cvv-display", "required");
    script.async = true;

    script.onload = () => {
      console.log("Collect.js Script Loaded");
    };
    document.head.appendChild(script);

    const initInterval = setInterval(() => {
      if (window.CollectJS) {
        clearInterval(initInterval);
        setCollectJsLoaded(true);

        window.CollectJS.configure({
          callback: async (response) => {
            if (processedTokens.has(response.token)) {
              console.warn("Duplicate token blocked");
              return;
            }
            processedTokens.add(response.token);
            console.log("Payment token received");
            await createSubscription(response.token);
          },
          validationCallback: (field, valid, message) => {
            console.log(`Field ${field}:`, valid);
          },
          fieldsAvailable: () => {
            console.log("Collect.js fields rendered");
          },
        });
      }
    }, 200);

    return () => {
      clearInterval(initInterval);
      cleanupOldInstances();
    };
  }, []);

  const createSubscription = async (paymentToken) => {
    setLoading(true);

    try {
      const currentFormData = formDataRef.current;
      const finalPlanId = activePlanRef.current;

      console.log("🚀 SUBMITTING SUBSCRIPTION");
      console.log("Selected Plan ID:", finalPlanId);

      const subscriptionData = {
        first_name: currentFormData.first_name,
        last_name: currentFormData.last_name,
        email: currentFormData.email,
        plan_id: finalPlanId,
        payment_token: paymentToken,
      };

      const result = await paymentApi.createSubscription(subscriptionData);

      if (result.data?.success || result.success) {
        alert(
          `✅ Successfully subscribed to ${finalPlanId === PLAN_DETAILS.PRO.id ? "Pro" : "Basic"} Plan!`,
        );

        // ✅ CHANGED: Use window.location.href for HARD REFRESH navigation
        window.location.href = "/student/dashboard";
      } else {
        throw new Error(
          result.data?.message || result.message || "Subscription failed",
        );
      }
    } catch (error) {
      console.error("Subscription error:", error);
      let msg =
        error.response?.data?.message || error.message || "Network error";
      alert(`🚨 Error: ${msg}`);

      if (window.CollectJS && window.CollectJS.reload) {
        window.CollectJS.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsApplyingCoupon(true);
    setCouponStatus(null);
    try {
      console.log("Coupon code:", couponCode);
      // const backendPlan = mapPlanIdForBackend(activePlanRef.current);
      console.log("Plan ID (frontend):", activePlanRef.current);
      const resp = await promoCodesApi
        .validatePromoCode(couponCode, activePlanRef.current)
        .then((res) => {
          setCouponStatus(res.data);
          setIsApplyingCoupon(false);
        })
        .catch((err) => {
          setCouponStatus(err.response.data);
          setIsApplyingCoupon(false);
        });
      console.log("Coupon status:", resp);
    } catch (err) {
      setCouponStatus({ success: false, message: "Error validating coupon." });
      setIsApplyingCoupon(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handleSubmitByCoupon = async (e) => {
    e.preventDefault();
    const currentFormData = formDataRef.current;

    if (
      !currentFormData.first_name.trim() ||
      !currentFormData.last_name.trim() ||
      !currentFormData.email.trim()
    ) {
      alert("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      // const backendPlan = mapPlanIdForBackend(activePlanRef.current);
      const payload = {
        first_name: currentFormData.first_name,
        last_name: currentFormData.last_name,
        email: currentFormData.email,
        code: couponCode,
        plan_id: activePlanRef.current,
      };

      const result = await paymentApi.createSubscriptionByCoupon(payload);

      if (result.data?.success) {
        alert(`✅ Successfully subscribed via coupon!`);
        window.location.href = "/student/dashboard";
      } else {
        throw new Error(result.data?.message || "Subscription failed");
      }
    } catch (error) {
      console.error("Coupon subscription error:", error);
      alert(
        `🚨 Error: ${error.response?.data?.message || error.message || "Network error"}`,
      );
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    const currentFormData = formDataRef.current;

    if (
      !currentFormData.first_name.trim() ||
      !currentFormData.last_name.trim() ||
      !currentFormData.email.trim()
    ) {
      alert("Please fill all required fields");
      return;
    }

    if (!window.CollectJS) {
      alert("Payment system loading... please wait.");
      return;
    }

    try {
      window.CollectJS.startPaymentRequest();
    } catch (error) {
      console.error("Error starting payment request:", error);
      alert("Error processing payment. Please try again.");
    }
  };

  return (
    <div className="bg-[#F3F6FF] flex justify-center items-center h-screen">
      <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">
        <div className="flex flex-col items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Subscribe to {currentPlanName}
          </h2>

          <div className="bg-gray-100 p-1 rounded-full flex relative w-48 shadow-inner">
            <button
              type="button"
              onClick={() => {
                handlePlanToggle(false);
                setCouponStatus(null);
              }}
              className={`cursor-pointer w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${!isPro && !testPlan
                ? "bg-white text-[#320C85] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Basic
            </button>
            <button
              type="button"
              onClick={() => {
                handlePlanToggle(true);
                setCouponStatus(null);
              }}
              className={`cursor-pointer w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${isPro && !testPlan
                ? "bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Pro
            </button>
          </div>

          {/* TEMPORARY TEST PLAN OPTIONS - EASILY COMMENT OUT LATER */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleTestPlanToggle(PLAN_DETAILS.NICKEL.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 ${testPlan === PLAN_DETAILS.NICKEL.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Nickel Test
            </button>
            <button
              type="button"
              onClick={() => handleTestPlanToggle(PLAN_DETAILS.PENNY.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 ${testPlan === PLAN_DETAILS.PENNY.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Penny Test
            </button>
          </div>
          {/* END TEMPORARY TEST PLAN OPTIONS */}

          <div className="mt-2 text-center">
            {couponStatus?.valid ? (
              <p className="text-lg font-medium text-gray-700">
                {currentPrice}
                <span className="text-sm text-gray-500 font-normal">/month</span>
              </p>
            ) : isClassCodeDiscountEligible ? (
              <div className="space-y-1">
                <div className="flex items-end justify-center gap-2">
                  <span className="text-sm font-semibold text-gray-400 line-through">
                    {selectedPlanDetails.price}
                  </span>
                  <span className="text-lg font-bold text-gray-800">
                    {discountedDisplayPrice}
                  </span>
                  <span className="text-sm text-gray-500 font-normal">/month</span>
                </div>
                <p className="text-xs font-semibold text-green-600">
                  Extra 10% class code discount available for this subscription
                </p>
              </div>
            ) : (
              <p className="text-lg font-medium text-gray-700">
                {currentPrice}
                <span className="text-sm text-gray-500 font-normal">/month</span>
              </p>
            )}
          </div>
        </div>

        <form onSubmit={couponStatus?.valid ? handleSubmitByCoupon : handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              type="text"
              name="first_name"
              value={formData.first_name}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#9144E0] focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              name="last_name"
              value={formData.last_name}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                id="useCoupon"
                checked={showCoupon}
                onChange={(e) => {
                  setShowCoupon(e.target.checked);
                  setCouponStatus(null);
                }}
                className="w-4 h-4 text-[#6F2CCA] focus:ring-[#6F2CCA] border-gray-300 rounded cursor-pointer transition-all duration-200"
              />
              <label htmlFor="useCoupon" className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-[#6F2CCA] transition-colors duration-200">
                I have a coupon code
              </label>
            </div>

            {showCoupon && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Enter code"
                    className="flex-grow p-3 border border-gray-100 bg-gray-50 rounded-lg text-sm focus:ring-2 focus:ring-[#9144E0]/20 focus:border-[#9144E0] outline-none transition-all"
                    disabled={loading || isApplyingCoupon}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={loading || isApplyingCoupon || !couponCode.trim()}
                    className="bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] hover:opacity-90 disabled:bg-gray-300 disabled:opacity-100 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95"
                  >
                    {isApplyingCoupon ? "..." : "Apply"}
                  </button>
                </div>
                {couponStatus && (
                  <p className={`text-xs font-medium px-2 ${couponStatus.valid ? "text-green-600" : "text-red-500"}`}>
                    {couponStatus.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-3">Payment Information</h3>
            <div id="collectjs-fields" className="mb-4"></div>

            {!collectJsLoaded && (
              <div className="text-amber-600 text-sm mb-4">
                Loading payment gateway...
              </div>
            )}
          </div>

          <button
            type="submit"
            id="payButton"
            disabled={loading || !collectJsLoaded}
            className={`cursor-pointer w-full text-white p-3 rounded-md transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed
                        ${isPro ? "bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] hover:opacity-90" : "bg-[#320C85] hover:bg-[#280A6B]"}`}
          >
            {loading ? "Processing..." : `Subscribe Now - ${currentPrice}`}
          </button>

          {collectJsLoaded && (
            <p className="text-xs text-gray-500 text-center mt-4">
              Your payment information is securely processed by our payment
              gateway.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;
