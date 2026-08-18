// import { useState, useEffect, useRef } from 'react';
// import paymentApi from '../../api/paymentApi';

// const PaymentForm = () => {
//     const [formData, setFormData] = useState({
//         first_name: '',
//         last_name: '',
//         email: '',
//         plan_id: 'daily_plan'
//     });
//     const [loading, setLoading] = useState(false);
//     const [collectLoaded, setCollectLoaded] = useState(false);

//     // ✅ Use ref to preserve form data during async operations
//     const formDataRef = useRef(formData);

//     // Update ref whenever formData changes
//     useEffect(() => {
//         formDataRef.current = formData;
//     }, [formData]);

//     // Load Collect.js with minimal configuration
//     useEffect(() => {
//         const loadCollectJS = () => {
//             if (document.querySelector('script[src*="Collect.js"]')) {
//                 return;
//             }

//             const script = document.createElement('script');
//             script.src = 'https://secure.skybankgateway.com/token/Collect.js';
//             script.setAttribute('data-tokenization-key', import.meta.env.VITE_TOKENIZATION_KEY);
//             script.setAttribute('data-variant', 'inline');

//             script.onload = () => {
//                 console.log('Collect.js loaded successfully');

//                 if (window.CollectJS) {
//                     // ✅ Use ref in callback to get latest form data
//                     window.CollectJS.configure({
//                         callback: function(response) {
//                             console.log('Token received:', response);
//                             if (response && response.token) {
//                                 finishSubmit(response.token);
//                             }
//                         },
//                         validationCallback: function(field, valid, message) {
//                             console.log(`Field ${field} validation:`, valid, message);
//                         }
//                     });

//                     setCollectLoaded(true);
//                     console.log('Collect.js configured successfully');
//                 }
//             };

//             script.onerror = () => {
//                 console.error('Failed to load Collect.js');
//             };

//             document.head.appendChild(script);
//         };

//         loadCollectJS();

//         return () => {
//             const script = document.querySelector('script[src*="Collect.js"]');
//             if (script) {
//                 document.head.removeChild(script);
//             }
//         };
//     }, []);

//     const finishSubmit = async (paymentToken) => {
//         setLoading(true);
//         try {
//             // ✅ Use ref to get the latest form data
//             const currentFormData = formDataRef.current;

//             console.log('Current form data from ref:', currentFormData);

//             const payload = {
//                 first_name: currentFormData.first_name,
//                 last_name: currentFormData.last_name,
//                 email: currentFormData.email,
//                 plan_id: currentFormData.plan_id,
//                 payment_token: paymentToken
//             };

//             console.log('Sending COMPLETE payload to backend:', payload);

//             const result = await paymentApi.createSubscription(payload);

//             console.log('Backend response:', result.data);

//             if (result.data.success) {
//                 alert('✅ Subscription created successfully!');
//                 console.log('Subscription ID:', result.data.data.subscription_id);

//                 // Reset form only after successful submission
//                 setFormData({
//                     first_name: '',
//                     last_name: '',
//                     email: '',
//                     plan_id: 'testplan'
//                 });

//                 // Clear Collect.js fields
//                 if (window.CollectJS && window.CollectJS.clearInputs) {
//                     window.CollectJS.clearInputs();
//                 }
//             } else {
//                 alert('❌ Subscription failed: ' + result.data.message);
//             }
//         } catch (error) {
//             console.error('Subscription error:', error);

//             if (error.response?.data?.errors) {
//                 const errorMessages = error.response.data.errors.map(err =>
//                     `${err.field}: ${err.message}`
//                 ).join('\n');
//                 alert(`Validation errors:\n${errorMessages}`);
//             } else if (error.response?.data?.message) {
//                 alert(`🚨 Error: ${error.response.data.message}`);
//             } else {
//                 alert('🚨 Network error. Please try again.');
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     const handleSubmit = (e) => {
//         e.preventDefault();

//         // Basic validation
//         if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) {
//             alert('Please fill all required fields');
//             return;
//         }

//         if (!formData.email.includes('@')) {
//             alert('Please enter a valid email address');
//             return;
//         }

//         if (!collectLoaded) {
//             alert('Payment system is still loading. Please wait...');
//             return;
//         }

//         console.log('Form submitted with user data:', formData);
//         console.log('Processing payment...');

//         // Start payment processing
//         if (window.CollectJS && window.CollectJS.startPaymentRequest) {
//             window.CollectJS.startPaymentRequest();
//         }
//     };

//     const handleInputChange = (e) => {
//         setFormData({
//             ...formData,
//             [e.target.name]: e.target.value
//         });
//     };

//     return (
//         <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">
//             <h2 className="text-2xl font-bold mb-6 text-gray-800">
//                 Subscribe to Premium - $9.99/month
//             </h2>

//             <form onSubmit={handleSubmit} className="space-y-4">
//                 {/* User Information */}
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         First Name *
//                     </label>
//                     <input
//                         type="text"
//                         name="first_name"
//                         placeholder="Enter your first name"
//                         value={formData.first_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         Last Name *
//                     </label>
//                     <input
//                         type="text"
//                         name="last_name"
//                         placeholder="Enter your last name"
//                         value={formData.last_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         Email Address *
//                     </label>
//                     <input
//                         type="email"
//                         name="email"
//                         placeholder="Enter your email"
//                         value={formData.email}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 {/* Payment Section */}
//                 <div className="border-t pt-4">
//                     <h3 className="text-lg font-semibold mb-3">Payment Information</h3>

//                     <div className="space-y-4">
//                         <div>
//                             <label className="block text-sm font-medium text-gray-700 mb-1">
//                                 Card Number *
//                             </label>
//                             <div
//                                 id="ccnumber"
//                                 className=" w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500  bg-white"
//                             />
//                         </div>

//                         <div className="grid grid-cols-2 gap-4">
//                             <div>
//                                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                                     Expiration Date *
//                                 </label>
//                                 <div
//                                     id="ccexp"
//                                     className="w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500  bg-white"
//                                 />
//                             </div>

//                             <div>
//                                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                                     CVV *
//                                 </label>
//                                 <div
//                                     id="cvv"
//                                     className=" w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500  bg-white"
//                                 />
//                             </div>
//                         </div>
//                     </div>
//                 </div>

//                 <button
//                     type="submit"
//                     id="submitButton"
//                     disabled={loading || !collectLoaded}
//                     className="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
//                 >
//                     {loading ? (
//                         <span className="flex items-center justify-center">
//                             <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
//                                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
//                                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
//                             </svg>
//                             Processing...
//                         </span>
//                     ) : (
//                         !collectLoaded ? 'Loading Payment...' : 'Subscribe Now - $9.99/month'
//                     )}
//                 </button>
//             </form>

//             {!collectLoaded && (
//                 <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
//                     <p className="text-yellow-800 text-sm">
//                         Payment system is loading. Please wait...
//                     </p>
//                 </div>
//             )}
//         </div>
//     );
// };

// export default PaymentForm;

// ----------------------------------------------------------------------------------------------

// import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// import paymentApi from '../../api/paymentApi';

// const PaymentForm = () => {
//     const [formData, setFormData] = useState({
//         first_name: '',
//         last_name: '',
//         email: '',
//         plan_id: 'testplan'
//     });
//     const [loading, setLoading] = useState(false);
//     const [collectLoaded, setCollectLoaded] = useState(false);

//     // ✅ Use ref to preserve form data during async operations
//     const formDataRef = useRef(formData);

//     // Update ref whenever formData changes
//     useEffect(() => {
//         formDataRef.current = formData;
//     }, [formData]);

//     // ✅ useCallback for finishSubmit to prevent recreation
//     const finishSubmit = useCallback(async (paymentToken) => {
//         setLoading(true);
//         try {
//             // ✅ Use ref to get the latest form data
//             const currentFormData = formDataRef.current;

//             console.log('Current form data from ref:', currentFormData);

//             const payload = {
//                 first_name: currentFormData.first_name,
//                 last_name: currentFormData.last_name,
//                 email: currentFormData.email,
//                 plan_id: currentFormData.plan_id,
//                 payment_token: paymentToken
//             };

//             console.log('Sending COMPLETE payload to backend:', payload);

//             const result = await paymentApi.createSubscription(payload);

//             console.log('Backend response:', result.data);

//             if (result.data.success) {
//                 alert('✅ Subscription created successfully!');
//                 console.log('Subscription ID:', result.data.data.subscription_id);

//                 // Reset form only after successful submission
//                 setFormData({
//                     first_name: '',
//                     last_name: '',
//                     email: '',
//                     plan_id: 'testplan'
//                 });

//                 // Clear Collect.js fields
//                 if (window.CollectJS && window.CollectJS.clearInputs) {
//                     window.CollectJS.clearInputs();
//                 }
//             } else {
//                 alert('❌ Subscription failed: ' + result.data.message);
//             }
//         } catch (error) {
//             console.error('Subscription error:', error);

//             if (error.response?.data?.errors) {
//                 const errorMessages = error.response.data.errors.map(err =>
//                     `${err.field}: ${err.message}`
//                 ).join('\n');
//                 alert(`Validation errors:\n${errorMessages}`);
//             } else if (error.response?.data?.message) {
//                 alert(`🚨 Error: ${error.response.data.message}`);
//             } else {
//                 alert('🚨 Network error. Please try again.');
//             }
//         } finally {
//             setLoading(false);
//         }
//     }, []); // ✅ Empty dependency - stable reference

//     // ✅ useCallback for Collect.js configuration
//     const configureCollectJS = useCallback(() => {
//         if (window.CollectJS) {
//             window.CollectJS.configure({
//                 callback: function(response) {
//                     console.log('Token received:', response);
//                     if (response && response.token) {
//                         finishSubmit(response.token);
//                     }
//                 },
//                 validationCallback: function(field, valid, message) {
//                     console.log(`Field ${field} validation:`, valid, message);
//                 }
//             });

//             setCollectLoaded(true);
//             console.log('Collect.js configured successfully');
//         }
//     }, [finishSubmit]); // ✅ finishSubmit dependency

//     // ✅ useCallback for script load
//     const loadCollectJS = useCallback(() => {
//         if (document.querySelector('script[src*="Collect.js"]')) {
//             configureCollectJS();
//             return;
//         }

//         const script = document.createElement('script');
//         script.src = 'https://secure.skybankgateway.com/token/Collect.js';
//         script.setAttribute('data-tokenization-key', import.meta.env.VITE_TOKENIZATION_KEY);
//         script.setAttribute('data-variant', 'inline');

//         script.onload = () => {
//             console.log('Collect.js loaded successfully');
//             configureCollectJS();
//         };

//         script.onerror = () => {
//             console.error('Failed to load Collect.js');
//         };

//         document.head.appendChild(script);
//     }, [configureCollectJS]); // ✅ configureCollectJS dependency

//     // Load Collect.js with minimal configuration
//     useEffect(() => {
//         loadCollectJS();

//         return () => {
//             const script = document.querySelector('script[src*="Collect.js"]');
//             if (script) {
//                 document.head.removeChild(script);
//             }
//         };
//     }, [loadCollectJS]); // ✅ loadCollectJS dependency

//     // ✅ useCallback for handleSubmit
//     const handleSubmit = useCallback((e) => {
//         e.preventDefault();

//         // Basic validation
//         if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) {
//             alert('Please fill all required fields');
//             return;
//         }

//         if (!formData.email.includes('@')) {
//             alert('Please enter a valid email address');
//             return;
//         }

//         if (!collectLoaded) {
//             alert('Payment system is still loading. Please wait...');
//             return;
//         }

//         console.log('Form submitted with user data:', formData);
//         console.log('Processing payment...');

//         // Start payment processing
//         if (window.CollectJS && window.CollectJS.startPaymentRequest) {
//             window.CollectJS.startPaymentRequest();
//         }
//     }, [formData, collectLoaded]); // ✅ formData and collectLoaded dependencies

//     // ✅ useCallback for handleInputChange
//     const handleInputChange = useCallback((e) => {
//         const { name, value } = e.target;
//         setFormData(prev => ({
//             ...prev,
//             [name]: value
//         }));
//     }, []); // ✅ Empty dependency - stable function

//     // ✅ useMemo for loading text to prevent recalculation
//     const buttonText = useMemo(() => {
//         if (loading) {
//             return (
//                 <span className="flex items-center justify-center">
//                     <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
//                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
//                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
//                     </svg>
//                     Processing...
//                 </span>
//             );
//         }
//         return !collectLoaded ? 'Loading Payment...' : 'Subscribe Now - $9.99/month';
//     }, [loading, collectLoaded]); // ✅ loading and collectLoaded dependencies

//     // ✅ useMemo for warning message
//     const warningMessage = useMemo(() => {
//         if (!collectLoaded) {
//             return (
//                 <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
//                     <p className="text-yellow-800 text-sm">
//                         Payment system is loading. Please wait...
//                     </p>
//                 </div>
//             );
//         }
//         return null;
//     }, [collectLoaded]); // ✅ collectLoaded dependency

//     return (
//         <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">
//             <h2 className="text-2xl font-bold mb-6 text-gray-800">
//                 Subscribe to Premium - $9.99/month
//             </h2>

//             <form onSubmit={handleSubmit} className="space-y-4">
//                 {/* User Information */}
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         First Name *
//                     </label>
//                     <input
//                         type="text"
//                         name="first_name"
//                         placeholder="Enter your first name"
//                         value={formData.first_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         Last Name *
//                     </label>
//                     <input
//                         type="text"
//                         name="last_name"
//                         placeholder="Enter your last name"
//                         value={formData.last_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                         Email Address *
//                     </label>
//                     <input
//                         type="email"
//                         name="email"
//                         placeholder="Enter your email"
//                         value={formData.email}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                     />
//                 </div>

//                 {/* Payment Section */}
//                 <div className="border-t pt-4">
//                     <h3 className="text-lg font-semibold mb-3">Payment Information</h3>

//                     <div className="space-y-4">
//                         <div>
//                             <label className="block text-sm font-medium text-gray-700 mb-1">
//                                 Card Number *
//                             </label>
//                             <div
//                                 id="ccnumber"
//                                 className="w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 bg-white"
//                                 style={{ minHeight: '44px' }}
//                             />
//                         </div>

//                         <div className="grid grid-cols-2 gap-4">
//                             <div>
//                                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                                     Expiration Date *
//                                 </label>
//                                 <div
//                                     id="ccexp"
//                                     className="w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 bg-white"
//                                     style={{ minHeight: '44px' }}
//                                 />
//                             </div>

//                             <div>
//                                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                                     CVV *
//                                 </label>
//                                 <div
//                                     id="cvv"
//                                     className="w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 bg-white"
//                                     style={{ minHeight: '44px' }}
//                                 />
//                             </div>
//                         </div>
//                     </div>
//                 </div>

//                 <button
//                     type="submit"
//                     id="submitButton"
//                     disabled={loading || !collectLoaded}
//                     className="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
//                 >
//                     {buttonText}
//                 </button>
//             </form>

//             {warningMessage}
//         </div>
//     );
// };

// export default PaymentForm;

// ----------------------------------------------------------------------------------------------

// import { useState, useEffect, useRef } from 'react';
// import paymentApi from '../../api/paymentApi';
// import { useNavigate } from 'react-router-dom';

// // Plan Constants
// const PLAN_DETAILS = {
//     BASIC: { id: 'basic_plan', price: '$10.00', label: 'Basic' },
//     PRO:   { id: 'pro_plan',   price: '$15.00', label: 'Pro' }
// };

// // --- GLOBAL GUARD (Outside Component) ---
// // Ye React cycle se bahar hai, isliye agar component remount bhi hua
// // toh bhi ye yaad rakhega ki konsa token use ho chuka hai.
// const processedTokens = new Set();

// const PaymentForm = ({ planId, planPrice }) => {
//     const isInitiallyPro = planId === PLAN_DETAILS.PRO.id;
//     const [isPro, setIsPro] = useState(isInitiallyPro);

//     const [formData, setFormData] = useState({
//         first_name: '',
//         last_name: '',
//         email: '',
//         plan_id: planId || PLAN_DETAILS.BASIC.id
//     });

//     const navigate = useNavigate();
//     const [loading, setLoading] = useState(false);
//     const [collectJsLoaded, setCollectJsLoaded] = useState(false);

//     const formDataRef = useRef(formData);

//     useEffect(() => {
//         formDataRef.current = formData;
//     }, [formData]);

//     const handlePlanToggle = (requestedProStatus) => {
//         setIsPro(requestedProStatus);
//         setFormData(prev => ({
//             ...prev,
//             plan_id: requestedProStatus ? PLAN_DETAILS.PRO.id : PLAN_DETAILS.BASIC.id
//         }));
//     };

//     const currentPrice = isPro ? PLAN_DETAILS.PRO.price : PLAN_DETAILS.BASIC.price;
//     const currentPlanName = isPro ? PLAN_DETAILS.PRO.label : PLAN_DETAILS.BASIC.label;

//     // --- HARD RESET & LOAD LOGIC ---
//     useEffect(() => {
//         // 1. Pehle purani gandagi saaf karein (Iframes + Scripts)
//         const cleanupOldInstances = () => {
//             const oldScripts = document.querySelectorAll('script[src*="Collect.js"]');
//             oldScripts.forEach(s => s.remove());

//             // CollectJS aksar iframes inject karta hai, unhein bhi udao
//             const iframes = document.querySelectorAll('iframe[id*="collect"]');
//             iframes.forEach(f => f.remove());

//             if (window.CollectJS) {
//                 delete window.CollectJS;
//             }
//         };

//         cleanupOldInstances();

//         // 2. Fresh Script Inject karein
//         const script = document.createElement('script');
//         script.src = 'https://secure.skybankgateway.com/token/Collect.js';
//         script.setAttribute('data-tokenization-key', import.meta.env.VITE_TOKENIZATION_KEY);
//         script.setAttribute('data-payment-type', 'cc');
//         script.setAttribute('data-button-text', 'Subscribe Now');
//         script.setAttribute('data-field-cvv-display', 'required');
//         script.async = true;

//         script.onload = () => {
//             console.log('Collect.js Script Loaded');
//             // Script load hone k baad wait for object initialization
//         };

//         document.head.appendChild(script);

//         // 3. Wait for Window Object & Configure
//         const initInterval = setInterval(() => {
//             if (window.CollectJS) {
//                 clearInterval(initInterval);
//                 setCollectJsLoaded(true);

//                 window.CollectJS.configure({
//                     callback: async (response) => {
//                         // --- ULTIMATE DUPLICATE CHECK ---
//                         // Agar ye token pehle process ho chuka hai, toh yahin ruk jao
//                         if (processedTokens.has(response.token)) {
//                             console.warn('Duplicate token blocked:', response.token);
//                             return;
//                         }

//                         // Token ko used mark karo
//                         processedTokens.add(response.token);

//                         console.log('Payment token received:', response.token);
//                         await createSubscription(response.token);
//                     },
//                     validationCallback: (field, valid, message) => {
//                         console.log(`Field ${field}:`, valid, message);
//                     },
//                     fieldsAvailable: () => {
//                         console.log('Collect.js fields rendered');
//                     }
//                 });
//             }
//         }, 200);

//         // 4. CLEANUP ON UNMOUNT
//         return () => {
//             clearInterval(initInterval);
//             cleanupOldInstances(); // Unmount hote hi script aur global object uda do
//         };
//     }, []);

//     const createSubscription = async (paymentToken) => {
//         setLoading(true);

//         try {
//             const currentFormData = formDataRef.current;
//             console.log('Creating subscription...');

//             const subscriptionData = {
//                 first_name: currentFormData.first_name,
//                 last_name: currentFormData.last_name,
//                 email: currentFormData.email,
//                 plan_id: currentFormData.plan_id,
//                 payment_token: paymentToken
//             };

//             const result = await paymentApi.createSubscription(subscriptionData);

//             if (result.data?.success || result.success) {
//                 alert('✅ Subscription created successfully!');

//                 // Clear the used token from memory after success (optional, but keeps Set small)
//                 // processedTokens.delete(paymentToken);

//                 navigate('/student/dashboard');
//             } else {
//                 throw new Error(result.data?.message || result.message || 'Subscription failed');
//             }
//         } catch (error) {
//             console.error('Subscription error:', error);

//             // Error handle karo
//             let msg = 'Network error';
//             if (error.response) msg = error.response.data?.message;
//             else if (error.message) msg = error.message;

//             alert(`🚨 Error: ${msg}`);

//             // Agar fail hua hai, toh humein user ko allow karna chahiye dobara try karne k liye
//             // Isliye token ko "processed" list se hata do taaki retry allowed ho (agar naya token generate nahi hua toh)
//             // Note: Usually CollectJS naya token deta hai har click pe, lekin safety k liye:
//             // processedTokens.delete(paymentToken);

//             // Reload form for retry
//             if (window.CollectJS && window.CollectJS.reload) {
//                 window.CollectJS.reload();
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     const handleInputChange = (e) => {
//         const { name, value } = e.target;
//         setFormData(prev => ({
//             ...prev,
//             [name]: value
//         }));
//     };

//     const handleSubmit = (e) => {
//         e.preventDefault();

//         const currentFormData = formDataRef.current;
//         if (!currentFormData.first_name.trim() || !currentFormData.last_name.trim() || !currentFormData.email.trim()) {
//             alert('Please fill all required fields');
//             return;
//         }

//         if (!window.CollectJS) {
//             alert('Payment system loading... please wait.');
//             return;
//         }

//         try {
//             window.CollectJS.startPaymentRequest();
//         } catch (error) {
//             console.error('Error starting payment request:', error);
//             alert('Error processing payment. Please try again.');
//         }
//     };

//     return (
//         <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">

//             <div className="flex flex-col items-center mb-6">
//                 <h2 className="text-2xl font-bold text-gray-800 mb-4">
//                     Subscribe to {currentPlanName}
//                 </h2>

//                 <div className="bg-gray-100 p-1 rounded-full flex relative w-48 shadow-inner">
//                     <button
//                         type="button"
//                         onClick={() => handlePlanToggle(false)}
//                         className={`w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${
//                             !isPro
//                                 ? 'bg-white text-blue-600 shadow-sm'
//                                 : 'text-gray-500 hover:text-gray-700'
//                         }`}
//                     >
//                         Basic
//                     </button>
//                     <button
//                         type="button"
//                         onClick={() => handlePlanToggle(true)}
//                         className={`w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${
//                             isPro
//                                 ? 'bg-[#9810FA] text-white shadow-sm'
//                                 : 'text-gray-500 hover:text-gray-700'
//                         }`}
//                     >
//                         Pro
//                     </button>
//                 </div>
//                 <p className="mt-2 text-lg font-medium text-gray-700">
//                     {currentPrice}<span className="text-sm text-gray-500 font-normal">/month</span>
//                 </p>
//             </div>

//             <form onSubmit={handleSubmit} className="space-y-4">
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
//                     <input
//                         type="text"
//                         name="first_name"
//                         value={formData.first_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                         disabled={loading}
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
//                     <input
//                         type="text"
//                         name="last_name"
//                         value={formData.last_name}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                         disabled={loading}
//                     />
//                 </div>

//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
//                     <input
//                         type="email"
//                         name="email"
//                         value={formData.email}
//                         onChange={handleInputChange}
//                         className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                         required
//                         disabled={loading}
//                     />
//                 </div>

//                 <div className="border-t pt-4">
//                     <h3 className="text-lg font-semibold mb-3">Payment Information</h3>
//                     <div id="collectjs-fields" className="mb-4"></div>

//                     {!collectJsLoaded && (
//                         <div className="text-amber-600 text-sm mb-4">Loading payment gateway...</div>
//                     )}
//                 </div>

//                 <button
//                     type="submit"
//                     id="payButton"
//                     disabled={loading || !collectJsLoaded}
//                     className={`w-full text-white p-3 rounded-md transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed
//                         ${isPro ? "bg-[#9810FA] hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}`}
//                 >
//                     {loading ? "Processing..." : `Subscribe Now - ${currentPrice}`}
//                 </button>

//                 {collectJsLoaded && (
//                     <p className="text-xs text-gray-500 text-center mt-4">
//                         Your payment information is securely processed by our payment gateway.
//                     </p>
//                 )}
//             </form>
//         </div>
//     );
// };

// export default PaymentForm;
import { useState, useEffect, useRef } from "react";
import paymentApi from "../../api/paymentApi";
import { useSelector } from "react-redux";
import promoCodesApi from "../../api/promoCodesApi";
// Plan Constants
const PLAN_DETAILS = {
  BASIC: { id: "penny_test", price: "$10.00", label: "Basic" },
  PRO: { id: "nickel_test", price: "$15.00", label: "Pro" },
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
  // 1. Initial State Setup
  const isInitiallyPro = planId === PLAN_DETAILS.PRO.id;
  const initialPlanId = isInitiallyPro
    ? PLAN_DETAILS.PRO.id
    : PLAN_DETAILS.BASIC.id;
  const { name = "" } = useSelector(
    (state) => state.studentprofile?.profile || {},
  );
  // const name = profile?.name || '';
  const [isPro, setIsPro] = useState(isInitiallyPro);
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

  // --- TOGGLE HANDLER ---
  const handlePlanToggle = (requestedProStatus) => {
    setIsPro(requestedProStatus);

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

  console.log("couponStatus", couponStatus);
  const currentPrice = couponStatus?.valid ? "$00.00" : isPro
    ? PLAN_DETAILS.PRO.price
    : PLAN_DETAILS.BASIC.price;
  const currentPlanName = isPro
    ? PLAN_DETAILS.PRO.label
    : PLAN_DETAILS.BASIC.label;

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
              className={`w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${!isPro
                ? "bg-white text-blue-600 shadow-sm"
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
              className={`w-1/2 rounded-full py-1.5 text-sm font-semibold transition-all duration-300 ${isPro
                ? "bg-[#9810FA] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Pro
            </button>
          </div>
          <p className="mt-2 text-lg font-medium text-gray-700">
            {currentPrice}
            <span className="text-sm text-gray-500 font-normal">/month</span>
          </p>
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
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-4 h-4 text-[#9810FA] focus:ring-[#9810FA] border-gray-300 rounded cursor-pointer transition-all duration-200"
              />
              <label htmlFor="useCoupon" className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-[#9810FA] transition-colors duration-200">
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
                    className="flex-grow p-3 border border-gray-100 bg-gray-50 rounded-lg text-sm focus:ring-2 focus:ring-[#9810FA]/20 focus:border-[#9810FA] outline-none transition-all"
                    disabled={loading || isApplyingCoupon}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={loading || isApplyingCoupon || !couponCode.trim()}
                    className="bg-[#9810FA] hover:bg-purple-700 disabled:bg-gray-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95"
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
                        ${isPro ? "bg-[#9810FA] hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}`}
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
