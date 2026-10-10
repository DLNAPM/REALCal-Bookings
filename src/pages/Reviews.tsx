import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Star, MessageSquare, CheckCircle2, Calendar, ShieldCheck, 
  Sparkles, Filter, Plus, ArrowLeft, Send, ThumbsUp, Building2,
  HelpCircle, Music, Award, ChevronDown, ChevronUp, ClipboardCheck
} from 'lucide-react';
import { INITIAL_REVIEWS } from '../data/initialReviews';
import { Review } from '../types';
import { LegalFooter } from '../components/LegalFooter';

export const Reviews: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const prefillProperty = searchParams.get('prop') || searchParams.get('property') || '';
  const prefillRef = searchParams.get('ref') || searchParams.get('bookingId') || '';

  const [firestoreReviews, setFirestoreReviews] = useState<Review[]>([]);
  const [apiReviews, setApiReviews] = useState<Review[]>([]);
  const [localReviews, setLocalReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Form State
  const [author, setAuthor] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [propertyName, setPropertyName] = useState(prefillProperty || '2844 Stonewall Villa');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [role, setRole] = useState('Verified Guest');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Helpful reactions tracking in local state
  const [likedReviews, setLikedReviews] = useState<Record<string, boolean>>({});
  // Expanded 5-stay questions accordion state (open by default for Kiwanis Lyons)
  const [expandedSurveyIds, setExpandedSurveyIds] = useState<Record<string, boolean>>({
    'seed-kiwanis-lyons': true,
    'review-kiwanis-lyons': true,
    'booking-d96e53b5-320f-4d03-8c0d-4e14ef9a0e2b': true
  });

  useEffect(() => {
    // 1. Fetch server-persisted reviews
    fetch('/api/reviews')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.reviews)) {
          setApiReviews(data.reviews);
        }
      })
      .catch(err => {
        console.warn("Could not fetch server /api/reviews:", err);
      });

    // 2. Fetch local storage cached reviews
    try {
      const stored = localStorage.getItem('realcal_published_reviews');
      if (stored) {
        setLocalReviews(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not read local storage reviews:", e);
    }

    // 3. Attach Firestore real-time listener if Firestore is configured
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reviewsData: Review[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Review));
        setFirestoreReviews(reviewsData);
        setLoading(false);
      }, (err) => {
        console.warn("Reviews snapshot notice (using local & seed reviews):", err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Could not attach reviews listener:", e);
      setLoading(false);
    }
  }, []);

  // Combine Firestore reviews, API reviews, local reviews, and initial seed reviews
  const allReviews: Review[] = React.useMemo(() => {
    const map = new Map<string, Review>();

    const addReview = (r: Review | any) => {
      if (!r || !r.author || !r.comment) return;
      const key = r.bookingRef 
        ? `booking-${r.bookingRef}` 
        : (r.id || `${r.author}-${r.comment.slice(0, 30)}`);
      
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ...r,
          id: r.id || key,
          rating: Number(r.rating || 5),
          verified: r.verified !== false
        });
      } else {
        // Enriched merge
        map.set(key, {
          ...r,
          ...existing,
          surveyAnswers: existing.surveyAnswers || r.surveyAnswers,
          bookingRef: existing.bookingRef || r.bookingRef,
          email: existing.email || r.email,
          phone: existing.phone || r.phone,
          role: existing.role || r.role,
        });
      }
    };

    // Priority order: Firestore -> API -> Local -> Seed
    firestoreReviews.forEach(addReview);
    apiReviews.forEach(addReview);
    localReviews.forEach(addReview);
    INITIAL_REVIEWS.forEach(addReview);

    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [firestoreReviews, apiReviews, localReviews]);

  // Filtered reviews
  const filteredReviews = allReviews.filter(rev => {
    const propName = (rev.propertyName || '').toLowerCase();
    const filter = selectedProperty.toLowerCase();
    const matchesProp = selectedProperty === 'all' || 
      propName.includes(filter) ||
      (filter.includes('stonewall') && propName.includes('stonewall'));
    const matchesRating = ratingFilter === 'all' || rev.rating === ratingFilter;
    return matchesProp && matchesRating;
  });

  // Calculate stats
  const totalCount = allReviews.length;
  const averageRating = totalCount > 0 
    ? (allReviews.reduce((acc, r) => acc + (r.rating || 5), 0) / totalCount).toFixed(1)
    : '5.0';

  const fiveStarCount = allReviews.filter(r => r.rating === 5).length;
  const fiveStarPercent = totalCount > 0 ? Math.round((fiveStarCount / totalCount) * 100) : 100;

  const handleToggleLike = (id: string) => {
    setLikedReviews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !comment.trim()) {
      setSubmitError('Please provide your name and your review comment.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const newReviewData = {
        author: author.trim(),
        role: role.trim() || 'Verified Guest',
        email: email.trim(),
        propertyName: propertyName.trim() || '2844 Stonewall Villa',
        rating,
        title: title.trim(),
        comment: comment.trim(),
        bookingRef: prefillRef || '',
        verified: true,
        createdAt: new Date().toISOString()
      };

      // 1. Post to backend API
      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newReviewData)
        });
        const resJson = await res.json();
        if (resJson?.review) {
          setApiReviews(prev => [resJson.review, ...prev]);
        }
      } catch (apiErr) {
        console.warn("API review submission warning:", apiErr);
      }

      // 2. Also write to client Firestore if active
      if (db) {
        try {
          await addDoc(collection(db, 'reviews'), {
            ...newReviewData,
            createdAt: serverTimestamp()
          });
        } catch (dbErr) {
          console.warn("Client Firestore write warning:", dbErr);
        }
      }

      // 3. Cache in local storage
      try {
        const stored = JSON.parse(localStorage.getItem('realcal_published_reviews') || '[]');
        localStorage.setItem('realcal_published_reviews', JSON.stringify([newReviewData, ...stored]));
        setLocalReviews(prev => [newReviewData as any, ...prev]);
      } catch (localErr) {}

      // 4. Also trigger manager notification if configured
      try {
        await fetch('/api/notify-review-submitted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author,
            email,
            propertyName,
            rating,
            title,
            comment,
            bookingRef: prefillRef
          })
        });
      } catch (err) {
        console.warn("Manager notification skipped or failed:", err);
      }

      setSubmitSuccess(true);
      setTitle('');
      setComment('');
      setTimeout(() => {
        setShowReviewModal(false);
        setSubmitSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error("Error submitting review:", err);
      setSubmitError(err.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Link 
              to="/" 
              className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-colors"
              title="Return to Home"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Guest Reviews & Experiences</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Verified feedback from guests, touring artists, and corporate residents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Link 
              to="/survey" 
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Take 5-Question Stay Survey"
            >
              <MessageSquare size={15} className="text-indigo-600" />
              <span>5-Question Survey</span>
            </Link>
            <button
              id="write-review-btn"
              onClick={() => setShowReviewModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Leave a Review</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12 flex-1 w-full">
        {/* Rating Summary Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Score Box */}
            <div className="md:col-span-4 flex flex-col items-center md:items-start text-center md:text-left border-b md:border-b-0 md:border-r border-slate-100 pb-6 md:pb-0 md:pr-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-slate-900 tracking-tight">{averageRating}</span>
                <span className="text-xl font-bold text-slate-400">/ 5.0</span>
              </div>
              <div className="flex items-center gap-1 my-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={20} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-xs font-semibold text-slate-500">
                Based on <strong className="text-slate-800">{totalCount}</strong> verified guest stays & reviews
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200/60">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>100% Verified Reservations</span>
              </div>
            </div>

            {/* Highlights Box */}
            <div className="md:col-span-8 flex flex-col justify-center">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 text-indigo-600 mb-1">
                    <Sparkles size={16} />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">Cleanliness</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">5.0 <span className="text-xs font-medium text-slate-400">/ 5</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">Professional sanitization & turnover before every check-in</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 text-indigo-600 mb-1">
                    <Music size={16} />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">Venue Proximity</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">4.9 <span className="text-xs font-medium text-slate-400">/ 5</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">8 mins to St. James Live, 10 mins to Wolf Creek Amphitheater</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 text-indigo-600 mb-1">
                    <Award size={16} />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">5-Star Ratio</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">{fiveStarPercent}%</div>
                  <p className="text-[11px] text-slate-500 mt-1">Rated 5 out of 5 stars by touring artists & guests</p>
                </div>
              </div>

              {/* Callout to Survey */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-600">
                  Did your booking or lease recently end? Help us maintain 5-star quality by completing your stay survey.
                </span>
                <Link 
                  to="/survey"
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 underline flex-shrink-0"
                >
                  <span>Answer the 5 Stay Questions</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-2">
              <Filter size={14} />
              <span>Filter:</span>
            </span>

            {/* Property Filter */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedProperty('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedProperty === 'all' 
                    ? 'bg-white text-indigo-600 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Properties
              </button>
              <button
                type="button"
                onClick={() => setSelectedProperty('Stonewall')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedProperty.toLowerCase().includes('stonewall') 
                    ? 'bg-white text-indigo-600 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stonewall Villa
              </button>
            </div>
          </div>

          {/* Star Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Stars:</span>
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Stars (1 - 5)</option>
              <option value="5">5 Stars Only</option>
              <option value="4">4 Stars Only</option>
              <option value="3">3 Stars Only</option>
            </select>
          </div>
        </div>

        {/* Reviews Grid */}
        {filteredReviews.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <MessageSquare size={36} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No reviews found matching your filter</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Try selecting "All Properties" or be the first to leave a comment about your stay.
            </p>
            <button
              onClick={() => { setSelectedProperty('all'); setRatingFilter('all'); }}
              className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredReviews.map((rev) => {
              const isLiked = !!likedReviews[rev.id];
              return (
                <article 
                  key={rev.id}
                  id={`review-card-${rev.id}`}
                  className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Stars + Date + Verified Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={16}
                              className={star <= rev.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}
                            />
                          ))}
                        </div>
                        {rev.title && (
                          <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">{rev.title}</h4>
                        )}
                      </div>

                      {rev.verified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-bold border border-emerald-200/60 flex-shrink-0">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span>Verified Stay</span>
                        </span>
                      )}
                    </div>

                    {/* Review Quote Body */}
                    <p className="text-sm text-slate-600 leading-relaxed font-normal">
                      "{rev.comment}"
                    </p>

                    {/* Stay Reference Tag */}
                    {rev.bookingRef && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200/70 px-2.5 py-1 rounded-lg">
                        <span className="font-semibold text-slate-400">Stay Ref:</span>
                        <span className="text-slate-700">{rev.bookingRef}</span>
                      </div>
                    )}

                    {rev.venueMentioned && (
                      <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50/70 border border-indigo-100 px-2.5 py-1 rounded-lg font-semibold">
                        <Music size={12} className="text-indigo-600" />
                        <span>Venue Proximity: {rev.venueMentioned}</span>
                      </div>
                    )}

                    {/* 5 Stay Questions & Answers Section */}
                    {rev.surveyAnswers && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setExpandedSurveyIds(prev => ({ ...prev, [rev.id]: !prev[rev.id] }))}
                          className="w-full flex items-center justify-between text-left p-2.5 rounded-xl bg-indigo-50/70 hover:bg-indigo-50 text-indigo-900 border border-indigo-150 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <ClipboardCheck size={16} className="text-indigo-600 flex-shrink-0" />
                            <span className="text-xs font-bold">5-Question Verified Stay Survey Answers</span>
                          </div>
                          <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                            {expandedSurveyIds[rev.id] ? (
                              <><span>Hide Answers</span><ChevronUp size={14} /></>
                            ) : (
                              <><span>View 5 Answers</span><ChevronDown size={14} /></>
                            )}
                          </span>
                        </button>

                        {expandedSurveyIds[rev.id] && (
                          <div className="mt-3 space-y-2.5 bg-slate-50/90 rounded-2xl p-3 border border-slate-200/80 text-xs">
                            {/* Q1: Comfort */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                                  <span className="w-4.5 h-4.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">1</span>
                                  Comfort & Lodging Experience
                                </span>
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 flex items-center gap-0.5">
                                  <Star size={10} className="fill-amber-400 text-amber-400" />
                                  <span>{rev.surveyAnswers.comfortRating || 5}/5 Stars</span>
                                </span>
                              </div>
                              <p className="text-slate-600 pl-6 leading-relaxed text-xs">
                                {rev.surveyAnswers.comfort || 'Exceptional stay. The home was impeccably clean, peaceful, and comfortable.'}
                              </p>
                            </div>

                            {/* Q2: Amenities */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                                  <span className="w-4.5 h-4.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">2</span>
                                  Amenities & Essentials Provided
                                </span>
                                {rev.surveyAnswers.amenitiesMissingTag && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                    {rev.surveyAnswers.amenitiesMissingTag}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 pl-6 leading-relaxed text-xs">
                                {rev.surveyAnswers.amenities || 'Everything was provided & complete.'}
                              </p>
                            </div>

                            {/* Q3: Cleanliness */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                                  <span className="w-4.5 h-4.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">3</span>
                                  Cleanliness & Preparation
                                </span>
                                {rev.surveyAnswers.cleanlinessRating && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                    {rev.surveyAnswers.cleanlinessRating}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 pl-6 leading-relaxed text-xs">
                                {rev.surveyAnswers.cleanliness || 'Spotless and thoroughly sanitized.'}
                              </p>
                            </div>

                            {/* Q4: Operations */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                                  <span className="w-4.5 h-4.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">4</span>
                                  Operations & Digital Smart Lock
                                </span>
                                {rev.surveyAnswers.operationsStatus && (
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60">
                                    {rev.surveyAnswers.operationsStatus}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 pl-6 leading-relaxed text-xs">
                                {rev.surveyAnswers.operations || 'Smart lock access and check-in operated flawlessly.'}
                              </p>
                            </div>

                            {/* Q5: Future Ideas / Stay Again */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                                  <span className="w-4.5 h-4.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">5</span>
                                  Future Stays & Recommendation
                                </span>
                                {rev.surveyAnswers.wouldStayAgain && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                    {rev.surveyAnswers.wouldStayAgain}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 pl-6 leading-relaxed text-xs">
                                {rev.surveyAnswers.futureIdeas || 'Would stay again without hesitation.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer: Author details & property */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm shadow-2xs flex-shrink-0">
                        {rev.author ? rev.author.charAt(0).toUpperCase() : 'G'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 leading-snug">{rev.author}</div>
                        <div className="text-[11px] text-slate-400 font-medium">{rev.role || 'Guest'}</div>
                        <div className="text-[10px] text-indigo-600 font-bold">{rev.propertyName}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleLike(rev.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isLiked 
                            ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' 
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                        title="Mark review as helpful"
                      >
                        <ThumbsUp size={13} className={isLiked ? "fill-indigo-600" : ""} />
                        <span>{isLiked ? 'Helpful (1)' : 'Helpful'}</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Leave a Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 relative my-8">
            <button 
              type="button"
              onClick={() => setShowReviewModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
            >
              &times;
            </button>

            <div className="mb-6">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
                <Star size={13} className="fill-indigo-600 text-indigo-600" />
                <span>Guest Experience</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">Leave a Review</h2>
              <p className="text-xs text-slate-500 mt-1">
                Share your feedback on your stay with C&SH Group Properties. Your review helps future guests and touring artists.
              </p>
            </div>

            {submitSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-emerald-800">
                <CheckCircle2 size={36} className="text-emerald-600 mx-auto mb-2" />
                <h3 className="text-base font-bold">Thank you for your review!</h3>
                <p className="text-xs text-emerald-700 mt-1">
                  Your comment has been submitted and posted to our Reviews Page.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                {submitError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                    {submitError}
                  </div>
                )}

                {/* Rating Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Your Overall Rating
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 cursor-pointer focus:outline-none transition-transform hover:scale-110"
                        title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      >
                        <Star 
                          size={28} 
                          className={`${
                            star <= (hoverRating || rating)
                              ? 'fill-amber-400 text-amber-400' 
                              : 'text-slate-200'
                          } transition-colors`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-600 ml-2">
                      {rating === 5 ? '5 Stars (Exceptional)' : `${rating} Stars`}
                    </span>
                  </div>
                </div>

                {/* Name & Email Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="e.g. Marcus Vance"
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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. marcus@tourproduction.com"
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Property & Stay Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Property Stayed At
                    </label>
                    <select
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Stonewall Villa">Stonewall Villa</option>
                      <option value="Stonewall Villa - Master Suite">Stonewall Villa - Master Suite</option>
                      <option value="Stonewall Villa - Guest Suite">Stonewall Villa - Guest Suite</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Your Guest Category
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Verified Guest">Verified Guest</option>
                      <option value="Touring Artist / Musician">Touring Artist / Musician</option>
                      <option value="Audio / Production Engineer">Audio / Production Engineer</option>
                      <option value="Corporate / Lease Resident">Corporate / Lease Resident</option>
                      <option value="Vacation / Family Guest">Vacation / Family Guest</option>
                    </select>
                  </div>
                </div>

                {/* Review Headline */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Review Headline (Optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Perfect retreat for our concert weekend"
                    className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Review Comment */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Your Review / Comments *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share details about your experience, comfort, cleanliness, amenities, or staff..."
                    className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between gap-3">
                  <Link
                    to="/survey"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 underline"
                  >
                    Want to answer the 5 private survey questions instead?
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReviewModal(false)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? (
                        <span>Publishing...</span>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Publish Review</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Global Footer */}
      <LegalFooter />
    </div>
  );
};
