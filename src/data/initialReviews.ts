export interface SeedReview {
  id: string;
  author: string;
  role: string;
  rating: number;
  title: string;
  comment: string;
  propertyName: string;
  stayDates: string;
  verified: boolean;
  venueMentioned?: string;
  createdAt: string;
}

export const INITIAL_REVIEWS: SeedReview[] = [
  {
    id: 'seed-1',
    author: 'Marcus "Keys" Vance',
    role: 'Touring Keyboardist & Musical Director',
    rating: 5,
    title: 'An absolute game-changer for touring artists',
    comment: 'We performed a 3-night residency at St. James Live, and Stonewall Villa was an absolute game-changer. Incredibly quiet, immaculate suites, super fast gigabit Wi-Fi to review setlists, and only 8 minutes to soundcheck. We got the best rest of our entire tour!',
    propertyName: 'Stonewall Villa',
    stayDates: 'August 2026',
    verified: true,
    venueMentioned: 'St. James Live',
    createdAt: '2026-08-16T14:30:00Z'
  },
  {
    id: 'seed-2',
    author: 'Elena Rostova',
    role: 'Lead Vocalist & Recording Artist',
    rating: 5,
    title: 'Pure serenity and pristine vocal rest',
    comment: 'The acoustic privacy and blackout shades at Stonewall Villa allowed me to completely rest my voice between high-energy festival sets at Wolf Creek Amphitheater. Keyless entry made coming back after midnight seamless. Exceptional hospitality!',
    propertyName: 'Stonewall Villa',
    stayDates: 'July 2026',
    verified: true,
    venueMentioned: 'Wolf Creek Amphitheater',
    createdAt: '2026-07-28T11:15:00Z'
  },
  {
    id: 'seed-3',
    author: 'David "Sub" Miller',
    role: 'Front of House Audio Engineer',
    rating: 5,
    title: 'Tour van parking and effortless check-in',
    comment: 'Ample private parking for our tour sprinter van with gear onboard gave our crew total peace of mind. The master suite was spotless and the gourmet kitchen was perfect for late-night meals after loading out.',
    propertyName: 'Stonewall Villa',
    stayDates: 'June 2026',
    verified: true,
    venueMentioned: 'St. James Live',
    createdAt: '2026-06-19T09:45:00Z'
  },
  {
    id: 'seed-4',
    author: 'Sarah & Jamison K.',
    role: 'Corporate Lease & Executive Stay',
    rating: 5,
    title: 'Immaculately maintained and wonderfully responsive management',
    comment: 'Stayed for a month-long consulting engagement in South Fulton. The property management team at C&SH Group Properties is top-tier. Ultra fast internet, quiet suburban neighborhood, and spotless cleanliness upon arrival.',
    propertyName: 'Stonewall Villa',
    stayDates: 'May 2026',
    verified: true,
    createdAt: '2026-05-30T16:20:00Z'
  },
  {
    id: 'seed-5',
    author: 'Terrance Holloway',
    role: 'Festival Guest & Concert Goer',
    rating: 5,
    title: 'Unbeatable location for Wolf Creek Amphitheater',
    comment: 'Came to Atlanta for the summer concert series at Wolf Creek Amphitheater. Avoided all highway traffic since Stonewall Villa is only 10 minutes away. The digital access codes and electronic invoice receipts made everything smooth.',
    propertyName: 'Stonewall Villa',
    stayDates: 'August 2026',
    verified: true,
    venueMentioned: 'Wolf Creek Amphitheater',
    createdAt: '2026-08-04T18:00:00Z'
  }
];
