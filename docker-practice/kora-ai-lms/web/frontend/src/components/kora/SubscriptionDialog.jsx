import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { useEffect, useRef, useState } from 'react';
import paymentApi from '../../api/paymentApi';
import { Calendar, CheckCircle, CreditCard, Lock, Shield } from 'lucide-react';
const SubscriptionDialog = ({ open, onClose, plan }) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    plan_id: plan ? plan.id : ''
  });
  const [loading, setLoading] = useState(false);
  const [collectLoaded, setCollectLoaded] = useState(false);
  const formDataRef = useRef(formData);

  // Update ref whenever formData changes
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);


  useEffect(() => {

    const loadCollectJS = () => {
      if (document.querySelector('script[src*="Collect.js"]')) {
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://secure.skybankgateway.com/token/Collect.js';
      script.setAttribute('data-tokenization-key', import.meta.env.VITE_TOKENIZATION_KEY);
      script.setAttribute('data-variant', 'inline');

      script.onload = () => {
        console.log('Collect.js loaded successfully');

        if (window.CollectJS) {
          // ✅ Use ref in callback to get latest form data
          window.CollectJS.configure({
            callback: function (response) {
              console.log('Token received:', response);
              if (response && response.token) {
                finishSubmit(response.token);
              }
            },
            validationCallback: function (field, valid, message) {
              console.log(`Field ${field} validation:`, valid, message);
            }
          });

          setCollectLoaded(true);
          console.log('Collect.js configured successfully');
        }
      };

      script.onerror = () => {
        console.error('Failed to load Collect.js');
      };

      document.head.appendChild(script);
    };

    loadCollectJS();

    return () => {
      const script = document.querySelector('script[src*="Collect.js"]');
      if (script) {
        document.head.removeChild(script);
      }
    };
  }, [open]);
  const finishSubmit = async (paymentToken) => {
    setLoading(true);
    try {
      // ✅ Use ref to get the latest form data
      const currentFormData = formDataRef.current;

      console.log('Current form data from ref:', currentFormData);

      const payload = {
        first_name: currentFormData.first_name,
        last_name: currentFormData.last_name,
        email: currentFormData.email,
        plan_id: plan ? plan.id : '',
        payment_token: paymentToken
      };

      console.log('Sending COMPLETE payload to backend:', payload);

      const result = await paymentApi.createSubscription(payload);

      console.log('Backend response:', result.data);

      if (result.data.success) {
        alert('✅ Subscription created successfully!');
        console.log('Subscription ID:', result.data.data.subscription_id);

        // Reset form only after successful submission
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
        });

        // Clear Collect.js fields
        if (window.CollectJS && window.CollectJS.clearInputs) {
          window.CollectJS.clearInputs();
        }
      } else {
        alert('❌ Subscription failed: ' + result.data.message);
      }
    } catch (error) {
      console.error('Subscription error:', error);

      if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map(err =>
          `${err.field}: ${err.message}`
        ).join('\n');
        alert(`Validation errors:\n${errorMessages}`);
      } else if (error.response?.data?.message) {
        alert(`🚨 Error: ${error.response.data.message}`);
      } else {
        alert('🚨 Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = (e) => {
    e.preventDefault();

    // Basic validation
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) {
      alert('Please fill all required fields');
      return;
    }

    if (!formData.email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    if (!collectLoaded) {
      alert('Payment system is still loading. Please wait...');
      return;
    }

    console.log('Form submitted with user data:', formData);
    console.log('Processing payment...');

    // Start payment processing
    if (window.CollectJS && window.CollectJS.startPaymentRequest) {
      window.CollectJS.startPaymentRequest();
    }
  };
  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (!plan) return null;


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="text-center ">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 mb-4 animate-bounce-slow">
              <CreditCard className="h-8 w-8 text-purple-600" />
            </div>
            <DialogTitle className="text-3xl font-bold text-gray-900 mb-2">Subscribe to {plan.name}</DialogTitle>
            <p className="text-gray-600">
              Complete your subscription to unlock {plan.name} features
            </p>
          </div>
        </DialogHeader>

        {/* Plan Summary */}
        <div className="relative mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 p-6 border border-purple-200 shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200 rounded-full opacity-20 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-200 rounded-full opacity-20 blur-3xl" />
          <div className="relative  flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-blue-900">{plan.name} Plan</h3>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Best Value
                </span>
              </div>
              <p className="text-2xl font-extrabold text-[#9810FA]">
                {plan.price}/<span className='text-sm'> {plan.period}</span></p>

            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-2 text-sm text-gray-700">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span>Billed monthly</span>
              </div>
              <div className="flex items-center justify-end gap-2 text-sm text-gray-700">
                <Shield className="h-4 w-4 text-green-600" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        {/* Personal Information Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-100 text-purple-600 text-sm font-bold">1</span>
            Personal Information
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name <span className='text-red-500'>*</span></Label>
              <Input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 rounded-sm border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 outline-none"
                placeholder="John"
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name <span className='text-red-500'>*</span></Label>
              <Input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 rounded-sm border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 outline-none"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email <span className='text-red-500'>*</span></Label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 rounded-sm border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 outline-none"
              placeholder="johndoe@gmail.com"
            />
          </div>

          {/* Payment Section */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-100 text-purple-600 text-sm font-bold">2</span>
              Payment Information
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Number <span className='text-red-500'>*</span>
                </label>
                <div className="relative">
                  <div
                    id="ccnumber"
                    className=" w-full px-4 py-3 rounded-xl border border-gray-300 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent bg-white transition-all duration-200"
                  />
                  <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date <span className='text-red-500'>*</span>
                  </label>
                  <div
                    id="ccexp"
                    className="w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500  bg-white"
                  />

                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CVV <span className='text-red-500'>*</span>
                  </label>
                  <div className="relative">
                    <div
                      id="cvv"
                      className=" w-full border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500  bg-white"
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 p-3 rounded-xl border border-green-200">
                <Lock className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>Your payment information is encrypted and secure</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            id="submitButton"
            disabled={loading || !collectLoaded}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 rounded-xl font-normal text-md hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              `Subscribe to ${plan.name} - ${plan.price}/${plan.period.split(' ')[0]}`
            )}
          </button>
        </form>


        <p className="text-xs text-gray-500 text-center leading-relaxed">
          By subscribing, you agree to our{' '}
          <a href="#" className="text-purple-600 hover:text-purple-700 font-medium underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-purple-600 hover:text-purple-700 font-medium underline">Privacy Policy</a>.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionDialog;
