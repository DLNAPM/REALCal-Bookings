import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Star, CheckCircle2, ArrowLeft, Send, Sparkles, Building2, 
  MessageSquare, HeartHandshake, ShieldCheck, ThumbsUp, HelpCircle
} from 'lucide-react';
import { LegalFooter } from '../components/LegalFooter';

export const Survey: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Prefills from URL
  const initialGuest = searchParams.get('guest') || searchParams.get('name') || user?.displayName || '';
  const initialEmail = searchParams.get('email') || user?.email || '';
  const initialPhone = searchParams.get('phone') || '';
  const initialProperty = searchParams.get('property') || searchParams.get('propertyName') || 'Stonewall Villa';
  const initialRef = searchParams.get('ref') || searchParams.get('bookingId') || searchParams.get('leaseCode') || '';
  const initialStayType = (searchParams.get('stayType') as any) || 'booking';

  // Guest Details
  const [guestName, setGuestName] = useState(initialGuest);
  const [guestEmail, setGuestEmail] = useState(initialEmail);
  const [guestPhone, setGuestPhone] = useState(initialPhone);
  const [propertyName, setPropertyName] = useState(initialProperty);
  const [bookingRef, setBookingRef] = useState(initialRef);

  // 5 Questions State
  // 1. Comfort
  const [comfortRating, setComfortRating] = useState<number>(5);
  const [comfortHover, setComfortHover] = useState<number>(0);
  const [comfort, setComfort] = useState<string>('');

  // 2. Amenities
  const [amenities, setAmenities] = useState<string>('');
  const [amenitiesMissingTag, setAmenitiesMissingTag] = useState<string>('Everything was provided');

  // 3. Cleanliness
  const [cleanlinessRating, setCleanlinessRating] = useState<string>('Exceeded expectations');
  const [cleanliness, setCleanliness] = useState<string>('');

  // 4. Operations
  const [operationsStatus, setOperationsStatus] = useState<string>('No issues - Completely smooth');
  const [operations, setOperations] = useState<string>('');

  // 5. Future Ideas
  const [wouldStayAgain, setWouldStayAgain] = useState<string>('Yes, definitely (100%)');
  const [futureIdeas, setFutureIdeas] = useState<string>('');

  // Public Review Option
  const [publishAsReview, setPublishAsReview] = useState<boolean>(true);
  const [publicReviewComment, setPublicReviewComment] = useState<string>('');
  const [reviewRole, setReviewRole] = useState<string>('Verified Guest');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Sync public review comment with comfort feedback if left empty
  useEffect(() => {
    if (!publicReviewComment && comfort) {
      setPublicReviewComment(comfort);
    }
  }, [comfort]);

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (!guestEmail.trim()) {
      setErrorMessage('Please enter your email address so management can follow up.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const surveyPayload = {
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone.trim(),
      propertyName: propertyName.trim(),
      bookingRef: bookingRef.trim(),
      stayType: initialStayType,
      comfortRating,
      comfort: comfort.trim() || `Rated ${comfortRating} stars. Comfortable stay.`,
      amenities: amenities.trim() || amenitiesMissingTag,
      cleanliness: cleanliness.trim() || cleanlinessRating,
      cleanlinessRating,
      operations: operations.trim() || operationsStatus,
      operationsStatus,
      futureIdeas: futureIdeas.trim() || `Would stay again: ${wouldStayAgain}`,
      wouldStayAgain,
      overallRating: comfortRating,
      publishAsReview,
      publicReviewComment: (publishAsReview && (publicReviewComment.trim() || comfort.trim())) || '',
      reviewRole: reviewRole.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Direct API call to submit survey and email Property Management Contacts
      const res = await fetch('/api/submit-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surveyPayload)
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || 'Failed to submit survey through server.');
      }

      // If server didn't write to DB (e.g. Firebase Admin uninitialized in local sandbox), save from client
      if (!resData.surveyId && db) {
        try {
          await addDoc(collection(db, 'surveys'), {
            ...surveyPayload,
            createdAt: serverTimestamp()
          });

          if (publishAsReview && (publicReviewComment.trim() || comfort.trim())) {
            await addDoc(collection(db, 'reviews'), {
              author: guestName.trim(),
              email: guestEmail.trim(),
              role: reviewRole.trim() || 'Verified Guest',
              propertyName: propertyName.trim(),
              rating: comfortRating,
              comment: (publicReviewComment.trim() || comfort.trim()),
              bookingRef: bookingRef.trim(),
              verified: true,
              createdAt: serverTimestamp()
            });
          }
        } catch (dbErr) {
          console.warn("Client Firestore fallback write warning:", dbErr);
        }
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error("Error submitting stay survey:", err);
      setErrorMessage(err.message || 'An error occurred while submitting your survey. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-slate-700 hover:text-indigo-600 font-bold text-xs sm:text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Return to RealCal Bookings</span>
          </Link>

          <Link
            to="/reviews"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            <Star size={14} className="fill-indigo-600 text-indigo-600" />
            <span>View Public Review Page</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-12 flex-1 w-full">
        {submitted ? (
          /* Thank You State */
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
              <CheckCircle2 size={36} />
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold mb-3 border border-emerald-200/60">
              <ShieldCheck size={14} />
              <span>Survey Completed Successfully</span>
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 tracking-tight">
              Thank you, {guestName || 'Valued Guest'}!
            </h2>

            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed mb-6">
              Your feedback on your stay at <strong>{propertyName}</strong> has been submitted and sent directly to the emails associated with our Property Management Contacts.
            </p>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 max-w-lg mx-auto text-left mb-8">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <HeartHandshake size={15} className="text-indigo-600" />
                <span>What Happens Next?</span>
              </h4>
              <p className="text-xs text-slate-500 leading-normal">
                Our property management team reviews every survey response to ensure continuous 5-star quality, prompt maintenance resolutions, and tailored amenities for all upcoming visits.
              </p>
              {publishAsReview && (
                <p className="text-xs text-indigo-700 font-semibold mt-2">
                  ✓ Your comment has also been shared on our public Review Page.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/reviews"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-100 transition-colors"
              >
                <MessageSquare size={16} />
                <span>Visit the Review Page</span>
              </Link>
              <Link
                to="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        ) : (
          /* Form State */
          <div className="space-y-6">
            {/* Header Hero Banner with Exact Template Greeting */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-100">
                  <Building2 size={16} />
                </span>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
                  RealCal Bookings &bull; C&SH Group Properties
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Guest Stay Survey & Feedback
              </h1>

              {/* Exact Template Context Block */}
              <div className="mt-4 p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2">
                <p className="font-semibold text-slate-900">
                  Hi {guestName || '[Guest Name]'},
                </p>
                <p>
                  Thank you so much for choosing to stay at <strong>{propertyName || '[Property Name]'}</strong>! It was a pleasure hosting you, and I hope you had a safe trip home.
                </p>
                <p>
                  We always strive to provide a 5-star experience, so we would love to hear your thoughts on a few quick questions:
                </p>
              </div>

              {/* Link to leave a comment on Review Page */}
              <div className="mt-4 flex items-center justify-between gap-3 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
                <span className="text-indigo-900 font-medium">
                  Looking to post a public review right away?
                </span>
                <Link
                  to={`/reviews?prop=${encodeURIComponent(propertyName)}&ref=${encodeURIComponent(bookingRef)}`}
                  className="font-bold text-indigo-700 hover:text-indigo-900 underline flex-shrink-0"
                >
                  Leave a comment on our Review Page here! &rarr;
                </Link>
              </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold">
                {errorMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmitSurvey} className="space-y-6">
              {/* Guest Information Card */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                  Reservation & Guest Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Guest Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="Your email address"
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="(404) 555-0199"
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Property Name
                    </label>
                    <select
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Stonewall Villa">Stonewall Villa</option>
                      <option value="Stonewall Villa - Master Suite">Stonewall Villa - Master Suite</option>
                      <option value="Stonewall Villa - Guest Bedroom">Stonewall Villa - Guest Bedroom</option>
                      <option value="Stonewall Villa - Entire Property">Stonewall Villa - Entire Property</option>
                    </select>
                  </div>
                </div>

                {bookingRef && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Stay Reference: <strong className="font-mono text-indigo-600">{bookingRef}</strong></span>
                    <span className="capitalize">{initialStayType.replace('_', ' ')}</span>
                  </div>
                )}
              </div>

              {/* The 5 Questions */}

              {/* Question 1: Comfort */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Comfort: How was your overall experience during your stay?
                  </h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 mb-4">
                  Rate your stay and let us know how restful and comfortable your lodging was.
                </p>

                <div className="ml-8 space-y-4">
                  {/* Star Rating */}
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setComfortRating(star)}
                        onMouseEnter={() => setComfortHover(star)}
                        onMouseLeave={() => setComfortHover(0)}
                        className="p-1 cursor-pointer focus:outline-none transition-transform hover:scale-110"
                        title={`Rate ${star} Star${star > 1 ? 's' : ''}`}
                      >
                        <Star
                          size={28}
                          className={`${
                            star <= (comfortHover || comfortRating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          } transition-colors`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-600 ml-2">
                      {comfortRating === 5 ? '5 Stars (Exceptional)' : `${comfortRating} Stars`}
                    </span>
                  </div>

                  <textarea
                    rows={3}
                    value={comfort}
                    onChange={(e) => setComfort(e.target.value)}
                    placeholder="Describe your overall experience, mattress & bed comfort, room temperature, acoustic quietness..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Question 2: Amenities */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Amenities: Was there anything missing that could have made your stay more comfortable?
                  </h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 mb-4">
                  Kitchenware, bath amenities, iron, parking access, coffee supplies, entertainment, etc.
                </p>

                <div className="ml-8 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Everything was provided & complete',
                      'More kitchen / cooking items',
                      'Extra linens or pillows',
                      'More coffee / tea options',
                      'Sound / audio equipment',
                      'Additional toiletries'
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setAmenitiesMissingTag(tag)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          amenitiesMissingTag === tag 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={amenities}
                    onChange={(e) => setAmenities(e.target.value)}
                    placeholder="Specific amenities or additions you would like to see on your next visit..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Question 3: Cleanliness */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Cleanliness: Did the space meet your expectations for cleanliness and preparation?
                  </h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 mb-4">
                  We hold our sanitization and turnover teams to hospital-grade standards.
                </p>

                <div className="ml-8 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Exceeded expectations (Spotless)',
                      'Met expectations (Clean & ready)',
                      'Needs slight attention in areas'
                    ].map((ratingOption) => (
                      <button
                        key={ratingOption}
                        type="button"
                        onClick={() => setCleanlinessRating(ratingOption)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          cleanlinessRating === ratingOption 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs font-bold' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {ratingOption}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={cleanliness}
                    onChange={(e) => setCleanliness(e.target.value)}
                    placeholder="Any specific comments on cleanliness, fragrance, bathroom, or kitchen condition..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Question 4: Operations */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Operations: Did you run into any issues with check-in, the Wi-Fi, or any appliances?
                  </h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 mb-4">
                  Let us know how the YAMIRY Smart Lock code, wireless connectivity, and in-home electronics performed.
                </p>

                <div className="ml-8 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'No issues - Completely smooth',
                      'Minor Wi-Fi or speed question',
                      'Smart Lock code assistance needed',
                      'Appliance question / issue'
                    ].map((opOption) => (
                      <button
                        key={opOption}
                        type="button"
                        onClick={() => setOperationsStatus(opOption)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          operationsStatus === opOption 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opOption}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={operations}
                    onChange={(e) => setOperations(e.target.value)}
                    placeholder="Tell us if anything needed troubleshooting so our management can address it..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Question 5: Future Ideas */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                    5
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Future Ideas: Do you have any suggestions for future improvements, or would you stay with us again?
                  </h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 mb-4">
                  Your feedback helps us continuously elevate the guest experience for future stays.
                </p>

                <div className="ml-8 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Yes, definitely (100%)',
                      'Likely would stay again',
                      'Would recommend to friends & crew',
                      'Maybe with requested additions'
                    ].map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setWouldStayAgain(choice)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          wouldStayAgain === choice 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    value={futureIdeas}
                    onChange={(e) => setFutureIdeas(e.target.value)}
                    placeholder="Any ideas, amenities, or improvements you would recommend for future guests or your next booking..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Leave a Comment on our Review Page Callout */}
              <div className="bg-white rounded-3xl border border-indigo-100 p-6 sm:p-8 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 border border-amber-200/60">
                    <Star size={20} className="fill-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      Leave a Public Comment on our Review Page
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      "Your feedback helps us keep improving for future guests. If you have a moment, we would also truly appreciate it if you could leave us a quick review on our Review Page here!"
                    </p>

                    {/* Publish checkbox toggle */}
                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="publish-toggle"
                        checked={publishAsReview}
                        onChange={(e) => setPublishAsReview(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <label htmlFor="publish-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Yes, share my comments on the public Review Page
                      </label>
                    </div>

                    {publishAsReview && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          rows={2}
                          value={publicReviewComment}
                          onChange={(e) => setPublicReviewComment(e.target.value)}
                          placeholder="Your public review message (e.g. Exceptional stay, clean suites, great location for St. James Live!)..."
                          className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-medium">Display Category:</span>
                          <select
                            value={reviewRole}
                            onChange={(e) => setReviewRole(e.target.value)}
                            className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                          >
                            <option value="Verified Guest">Verified Guest</option>
                            <option value="Touring Artist / Musician">Touring Artist / Musician</option>
                            <option value="Production Crew">Production Crew</option>
                            <option value="Corporate / Lease Resident">Corporate / Lease Resident</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Actions & Signature */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left text-xs text-slate-500">
                  <p className="font-bold text-slate-800">Management</p>
                  <p>RealCal Bookings</p>
                  <p>C&SH Group Properties, LLC</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-100 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <span>Sending Survey to Management...</span>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>Submit Survey & Feedback</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>

      <LegalFooter />
    </div>
  );
};
