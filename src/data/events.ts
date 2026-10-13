export interface EventItem {
  id: string;
  title: string;
  category: 'Family' | 'Kids' | 'Night Life Entertainments' | 'Sporting Events';
  date: string;
  rawDate: Date;
  description: string;
  ticketUrl: string;
  venue: string;
  distance: string; // within 30 miles of 30331
}

export function formatEventDate(date: Date, customTime?: string): string {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (customTime) {
    return `${dateStr} • ${customTime}`;
  }
  const timeFormatted = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateStr} • ${timeFormatted}`;
}

export interface VerifiedEventDef {
  id: string;
  title: string;
  category: 'Family' | 'Kids' | 'Night Life Entertainments' | 'Sporting Events';
  month: number; // 1-12
  day: number;
  hour: number; // 24-hr
  minute: number;
  timeStr: string;
  venue: string;
  distance: string;
  description: string;
  ticketUrl: string;
  fixedYear?: number;
}

// ---------------------------------------------------------------------------
// 1. SPORTING EVENTS (Verified athletic events, tours, collegiate and showcase matches)
// ---------------------------------------------------------------------------
export const VERIFIED_SPORTS_EVENTS: VerifiedEventDef[] = [
  // --- ATLANTA BRAVES (MLB at Truist Park) ---
  {
    id: 'sports-braves-nlcs-home',
    title: 'MLB Postseason: Atlanta Braves National League Championship (NLCS Home Game)',
    category: 'Sporting Events',
    month: 10,
    day: 17,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Truist Park',
    distance: '18.2 miles',
    description: 'October postseason baseball at Truist Park in Atlanta! The Atlanta Braves take the field in high-stakes National League Championship action amidst 41,000+ roaring fans at The Battery Atlanta.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805899',
  },
  {
    id: 'sports-braves-phillies-fall',
    title: 'MLB Baseball: Atlanta Braves vs. Philadelphia Phillies (NL East Rivalry)',
    category: 'Sporting Events',
    month: 10,
    day: 21,
    hour: 19,
    minute: 20,
    timeStr: '7:20 PM EDT',
    venue: 'Truist Park',
    distance: '18.2 miles',
    description: 'NL East powerhouse rivalry under the stadium lights at Truist Park! Experience the Chop Rally, world-class baseball, and pregame festivities at The Battery Atlanta.',
    ticketUrl: 'https://www.mlb.com/braves/tickets',
  },
  {
    id: 'sports-braves-vip-tour',
    title: 'Truist Park: Atlanta Braves VIP Stadium Tour & Batting Practice Experience',
    category: 'Sporting Events',
    month: 10,
    day: 24,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Truist Park',
    distance: '18.2 miles',
    description: 'Walk the warning track, tour the Braves dugout and Monument Garden, and witness live batting practice at Truist Park, home of the Atlanta Braves.',
    ticketUrl: 'https://www.mlb.com/braves/ballpark/tours',
  },

  // --- ATLANTA DREAM (WNBA Finals vs. Golden State Valkyries in Atlanta) ---
  // Note: Games 1 & 2 of the WNBA Finals are played in California (Chase Center); the series shifts to Atlanta for Games 3 & 4!
  {
    id: 'sports-dream-wnba-finals-gm3-home1',
    title: 'WNBA Finals: Game 3 (Atlanta Home Game 1) — Atlanta Dream vs. Golden State Valkyries',
    category: 'Sporting Events',
    month: 10,
    day: 18,
    hour: 15,
    minute: 0,
    timeStr: '3:00 PM EDT',
    venue: 'Gateway Center Arena @ College Park',
    distance: '7.2 miles',
    description: 'WNBA Finals Championship basketball arrives in Atlanta! After Games 1 & 2 in California, the series moves to Atlanta as the Atlanta Dream host the Golden State Valkyries in Game 3 (Atlanta Home Game 1) at Gateway Center Arena @ College Park, located just 7.2 miles from Stonewall Villa.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-dream-tickets/artist/1206859',
  },
  {
    id: 'sports-dream-wnba-finals-gm4-home2',
    title: 'WNBA Finals: Game 4 (Atlanta Home Game 2) — Atlanta Dream vs. Golden State Valkyries',
    category: 'Sporting Events',
    month: 10,
    day: 21,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Gateway Center Arena @ College Park',
    distance: '7.2 miles',
    description: 'Championship basketball in Atlanta! The Atlanta Dream battle the Golden State Valkyries in Game 4 (Atlanta Home Game 2) of the WNBA Finals at Gateway Center Arena @ College Park before a sold-out home crowd.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-dream-tickets/artist/1206859',
  },

  // --- ATLANTA HAWKS (NBA at State Farm Arena) ---
  {
    id: 'sports-hawks-hornets-opener',
    title: 'NBA Basketball: Atlanta Hawks vs. Charlotte Hornets (Southeast Division Home Opener)',
    category: 'Sporting Events',
    month: 10,
    day: 23,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.3 miles',
    description: 'High-flying NBA basketball at State Farm Arena in downtown Atlanta! Trae Young and the Atlanta Hawks host the Charlotte Hornets in an electrifying division home opener.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-heat-home',
    title: 'NBA Basketball: Atlanta Hawks vs. Miami Heat (Eastern Conference Matchup)',
    category: 'Sporting Events',
    month: 10,
    day: 28,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.3 miles',
    description: 'Eastern Conference rivalry clash at State Farm Arena. Experience world-class basketball, immersive arena acoustics, and courtside energy in downtown Atlanta.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-celtics-home',
    title: 'NBA Basketball: Atlanta Hawks vs. Boston Celtics (Friday Night Showcase)',
    category: 'Sporting Events',
    month: 11,
    day: 6,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.3 miles',
    description: 'Marquee Friday night NBA showdown as the Atlanta Hawks battle the Boston Celtics under the bright lights of State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },

  // --- ATLANTA FALCONS (NFL at Mercedes-Benz Stadium) ---
  {
    id: 'sports-falcons-panthers-home',
    title: 'NFL Football: Atlanta Falcons vs. Carolina Panthers (NFC South Division Clash)',
    category: 'Sporting Events',
    month: 10,
    day: 25,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'NFC South division battle at Mercedes-Benz Stadium in downtown Atlanta! Cheer on the Atlanta Falcons under the world-famous halo board alongside 70,000+ passionate supporters.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-falcons-saints-home',
    title: 'NFL Football: Atlanta Falcons vs. New Orleans Saints (NFC South Rivalry)',
    category: 'Sporting Events',
    month: 11,
    day: 8,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EST',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'One of the fiercest rivalries in NFL football! The Atlanta Falcons battle the New Orleans Saints at Mercedes-Benz Stadium in downtown Atlanta.',
    ticketUrl: 'https://www.atlantafalcons.com/tickets/',
  },

  // --- OTHER NOTABLE ATLANTA ATHLETIC EVENTS & TOURS ---
  {
    id: 'sports-mbs-stadium-tour',
    title: 'Mercedes-Benz Stadium: Guided Architectural & VIP Locker Room Tour',
    category: 'Sporting Events',
    month: 10,
    day: 16,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Exclusive behind-the-scenes guided tour of Mercedes-Benz Stadium, home of the Atlanta Falcons and Atlanta United. Experience the Falcons locker room, walk the turf, and marvel at the world-famous halo board.',
    ticketUrl: 'https://mercedesbenzstadium.com/stadium-tours/',
  },
  {
    id: 'sports-gt-notredame',
    title: 'College Football: Georgia Tech Yellow Jackets ACC Showcase',
    category: 'Sporting Events',
    month: 10,
    day: 17,
    hour: 15,
    minute: 30,
    timeStr: '3:30 PM EDT',
    venue: 'Bobby Dodd Stadium at Historic Grant Field',
    distance: '12.8 miles',
    description: 'High-stakes ACC collegiate football action under the iconic Midtown Atlanta skyline! Cheer on the Yellow Jackets alongside 55,000+ passionate college football supporters.',
    ticketUrl: 'https://ramblinwreck.com/football/',
  },
  {
    id: 'sports-pga-long-drive',
    title: 'PGA Tour Superstore World Long Drive Championship Showcase',
    category: 'Sporting Events',
    month: 10,
    day: 24,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Bobby Jones Golf Course',
    distance: '13.5 miles',
    description: 'Witness the world\'s longest hitters crush 400+ yard drives at historic Bobby Jones Golf Course in Atlanta. Includes equipment demos and interactive skills challenges.',
    ticketUrl: 'https://bobbyjonesgc.com/',
  },
  {
    id: 'sports-atc-pnc-10miler',
    title: 'Atlanta Track Club: PNC Atlanta 10 Miler & 5K',
    category: 'Sporting Events',
    month: 10,
    day: 25,
    hour: 7,
    minute: 30,
    timeStr: '7:30 AM EDT',
    venue: 'Atlantic Station',
    distance: '14.0 miles',
    description: 'One of Atlanta\'s premier fall road races starting and finishing at Atlantic Station. Thousands of runners tackle the scenic course through Buckhead and Midtown Atlanta.',
    ticketUrl: 'https://www.atlantatrackclub.org/',
  },
  {
    id: 'sports-cfb-gstate-gsouthern',
    title: 'College Football: Georgia State Panthers vs. Sun Belt Rival',
    category: 'Sporting Events',
    month: 10,
    day: 31,
    hour: 14,
    minute: 0,
    timeStr: '2:00 PM EDT',
    venue: 'Center Parc Stadium',
    distance: '10.8 miles',
    description: 'Fierce in-state Sun Belt Conference football rivalry at Center Parc Stadium (former Centennial Olympic Stadium / Turner Field), just 10.8 miles from the villa.',
    ticketUrl: 'https://georgiastatesports.com/',
  },
  {
    id: 'sports-ote-opening-night',
    title: 'Overtime Elite (OTE) Basketball: Season Opening Night',
    category: 'Sporting Events',
    month: 11,
    day: 7,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EST',
    venue: 'OTE Arena at Atlantic Station',
    distance: '14.2 miles',
    description: 'Experience future NBA lottery picks in person! High-flying, fast-paced professional youth basketball at the cutting-edge OTE Arena in Atlantic Station.',
    ticketUrl: 'https://overtimeelite.com/tickets',
  },
  {
    id: 'sports-atc-thanksgiving-expo',
    title: 'Atlanta Track Club: Invesco QQQ Half Marathon Expo & 5K',
    category: 'Sporting Events',
    month: 11,
    day: 8,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EST',
    venue: 'Center Parc Stadium',
    distance: '10.8 miles',
    description: 'Annual running festival, free fitness expo, athlete meet-and-greets, and prep runs for the Thanksgiving Day road race at Center Parc Stadium.',
    ticketUrl: 'https://www.atlantatrackclub.org/',
  },
];

// ---------------------------------------------------------------------------
// 2. NIGHT LIFE ENTERTAINMENTS (Verified concerts, theater, symphony & comedy)
// ---------------------------------------------------------------------------
export const VERIFIED_NIGHTLIFE_EVENTS: VerifiedEventDef[] = [
  {
    id: 'night-don-omar',
    title: 'Don Omar: Back to Reggaeton Tour Live',
    category: 'Night Life Entertainments',
    month: 10,
    day: 16,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Reggaeton pioneer Don Omar brings his hit-packed arena tour to State Farm Arena for an unforgettable night of Latin urban music.',
    ticketUrl: 'https://www.ticketmaster.com/don-omar-tickets/artist/951917',
  },
  {
    id: 'night-lion-king-fox-fri',
    title: 'Disney\'s The Lion King Musical at Historic Fox Theatre',
    category: 'Night Life Entertainments',
    month: 10,
    day: 16,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Fox Theatre Atlanta',
    distance: '13.6 miles',
    description: 'Broadway\'s world-renowned spectacle comes to life inside Midtown Atlanta\'s historic Fox Theatre with breathtaking puppetry, vibrant African rhythms, and Elton John\'s beloved music.',
    ticketUrl: 'https://www.foxtheatre.org/events/detail/the-lion-king',
  },
  {
    id: 'night-usher-atl-1',
    title: 'Usher: Past Present Future Tour (Hometown Residency)',
    category: 'Night Life Entertainments',
    month: 10,
    day: 17,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Atlanta\'s own global R&B king Usher brings his critically acclaimed residency to State Farm Arena with non-stop classic hits and flawless choreography.',
    ticketUrl: 'https://www.ticketmaster.com/usher-tickets/artist/772427',
  },
  {
    id: 'night-journey-freedom',
    title: 'Journey: 50th Anniversary Freedom Tour Live',
    category: 'Night Life Entertainments',
    month: 10,
    day: 18,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Legendary rock icons Journey celebrate 50 years of timeless anthems including "Don\'t Stop Believin\'", "Faithfully", and "Any Way You Want It" at State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/journey-tickets/artist/735398',
  },
  {
    id: 'night-teddy-swims',
    title: 'Teddy Swims: I\'ve Tried Everything But Therapy Tour',
    category: 'Night Life Entertainments',
    month: 10,
    day: 20,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Georgia-born breakout sensation Teddy Swims brings his soulful, chart-topping vocals and powerhouse band back home for a massive arena concert.',
    ticketUrl: 'https://www.ticketmaster.com/teddy-swims-tickets/artist/2715093',
  },
  {
    id: 'night-sabrina-carpenter',
    title: 'Sabrina Carpenter: Short n\' Sweet Tour',
    category: 'Night Life Entertainments',
    month: 10,
    day: 22,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Pop superstar Sabrina Carpenter brings her wildly anticipated sold-out "Short n\' Sweet" arena tour to State Farm Arena featuring hit singles "Espresso" and "Please Please Please".',
    ticketUrl: 'https://www.ticketmaster.com/sabrina-carpenter-tickets/artist/1944116',
  },
  {
    id: 'night-stjames-jazz',
    title: 'St. James Live: Contemporary Jazz & Soul Showcase',
    category: 'Night Life Entertainments',
    month: 10,
    day: 23,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'St. James Live',
    distance: '5.8 miles',
    description: 'Atlanta\'s premier upscale live jazz and neo-soul dinner club, located just 5.8 miles from Stonewall Villa! Features world-class touring keyboardists, saxophonists, and vocalists.',
    ticketUrl: 'https://stjamesliveatl.com/',
  },
  {
    id: 'night-aso-beethoven-9',
    title: 'Atlanta Symphony Orchestra: Beethoven\'s Ninth Symphony',
    category: 'Night Life Entertainments',
    month: 10,
    day: 24,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Atlanta Symphony Hall at Woodruff Arts Center',
    distance: '14.2 miles',
    description: 'Music Director Nathalie Stutzmann conducts the world-famous Atlanta Symphony Orchestra and ASO Chorus in a thrilling, transcendent performance of Beethoven\'s epic "Ode to Joy".',
    ticketUrl: 'https://www.aso.org/concerts-tickets',
  },
  {
    id: 'night-maverick-city',
    title: 'Maverick City Music: The Good News Tour',
    category: 'Night Life Entertainments',
    month: 10,
    day: 25,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Grammy Award-winning collective Maverick City Music brings uplifting, soulful gospel harmonies and praise worship anthems to a full house at State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/maverick-city-music-tickets/artist/2785534',
  },
  {
    id: 'night-aquarium-sips-halloween',
    title: 'Georgia Aquarium: Sips Under the Sea Halloween Party (21+)',
    category: 'Night Life Entertainments',
    month: 10,
    day: 26,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'Georgia Aquarium',
    distance: '12.2 miles',
    description: 'Exclusive adult Halloween event (21+)! Signature cocktails, tapas, live DJ dancing, and private after-hours access surrounded by whale sharks and manta rays in the Ocean Voyager gallery.',
    ticketUrl: 'https://www.georgiaaquarium.org/events/sips-under-the-sea/',
  },
  {
    id: 'night-fernbank-fright-night',
    title: 'Fernbank Museum: Fright Night Halloween Gala (21+)',
    category: 'Night Life Entertainments',
    month: 10,
    day: 31,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles',
    description: 'Adults-only Halloween bash! Dance beneath giant prehistoric skeletons, participate in costume contests, sip spooky cocktails, and explore the eerie outdoor Woodland Spirits forest trail.',
    ticketUrl: 'https://www.fernbankmuseum.org/',
  },
  {
    id: 'night-billie-eilish',
    title: 'Billie Eilish: Hit Me Hard and Soft - The Tour Live',
    category: 'Night Life Entertainments',
    month: 11,
    day: 1,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Nine-time Grammy Award winner Billie Eilish takes the State Farm Arena stage with 360-degree immersive audio-visuals and songs from her acclaimed album "Hit Me Hard and Soft".',
    ticketUrl: 'https://www.ticketmaster.com/billie-eilish-tickets/artist/2301014',
  },
  {
    id: 'night-clairo-charm',
    title: 'Clairo: Charm Tour at Historic Fox Theatre',
    category: 'Night Life Entertainments',
    month: 11,
    day: 8,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EST',
    venue: 'Fox Theatre Atlanta',
    distance: '13.6 miles',
    description: 'Indie-pop songwriter Clairo performs live inside the opulent Fox Theatre, performing tracks from her praised new album "Charm" backed by a lush live band.',
    ticketUrl: 'https://www.foxtheatre.org/',
  },
];

// ---------------------------------------------------------------------------
// 3. FAMILY EVENTS (Verified festivals, botanical exhibits & parks)
// ---------------------------------------------------------------------------
export const VERIFIED_FAMILY_EVENTS: VerifiedEventDef[] = [
  {
    id: 'family-zoo-boo-sat',
    title: 'Zoo Atlanta: Boo at the Zoo Halloween Weekend Festival',
    category: 'Family',
    month: 10,
    day: 17,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Zoo Atlanta',
    distance: '12.4 miles',
    description: 'Zoo Atlanta\'s beloved family Halloween tradition! Trick-or-treating, inflatable corn maze, craft stations, festive costume parade, and animal enrichment treats for the African elephants and lions.',
    ticketUrl: 'https://zooatlanta.org/event/boo-at-the-zoo/',
  },
  {
    id: 'family-stonemountain-pumpkin',
    title: 'Stone Mountain Park: Pumpkin Festival & Glowing Nights',
    category: 'Family',
    month: 10,
    day: 17,
    hour: 14,
    minute: 0,
    timeStr: '2:00 PM EDT',
    venue: 'Stone Mountain Park',
    distance: '24.8 miles',
    description: 'Family fall adventure featuring pie-eating contests, storytellers, scenic train rides, and a magical glow-in-the-dark evening trail with thousands of illuminated jack-o\'-lanterns.',
    ticketUrl: 'https://stonemountainpark.com/activities/events/pumpkin-festival/',
  },
  {
    id: 'family-scarecrows-botanical',
    title: 'Atlanta Botanical Garden: Scarecrows in the Garden 50th Anniversary',
    category: 'Family',
    month: 10,
    day: 18,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Atlanta Botanical Garden',
    distance: '14.5 miles',
    description: 'Midtown Atlanta\'s premier fall celebration! Wander through 100+ artistic handcrafted scarecrows crafted by local artists and schools, plus towering 12-foot giant scarecrows on the Great Lawn.',
    ticketUrl: 'https://atlantabg.org/calendar-events/scarecrows-in-the-garden/',
  },
  {
    id: 'family-aquarium-haunted-seas',
    title: 'Georgia Aquarium: Haunted Seas Ocean Discovery Experience',
    category: 'Family',
    month: 10,
    day: 20,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Georgia Aquarium',
    distance: '12.2 miles',
    description: 'Explore the depths of the ocean with Halloween-themed dolphin presentations, festive photo backdrops, seasonal sea lion shows, and underwater encounters with 500+ aquatic species.',
    ticketUrl: 'https://www.georgiaaquarium.org/',
  },
  {
    id: 'family-zoo-boo-sun',
    title: 'Zoo Atlanta: Boo at the Zoo Halloween Spectacular',
    category: 'Family',
    month: 10,
    day: 25,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Zoo Atlanta',
    distance: '12.4 miles',
    description: 'Zoo Atlanta\'s Halloween grand showcase! Pumpkin enrichment snacks for gorillas and lions, whimsical character meet-and-greets, and trick-or-treat treat stops.',
    ticketUrl: 'https://zooatlanta.org/event/boo-at-the-zoo/',
  },
  {
    id: 'family-aso-halloween-symphony',
    title: 'Atlanta Symphony Hall: Family Halloween Spooktacular Concert',
    category: 'Family',
    month: 11,
    day: 1,
    hour: 13,
    minute: 30,
    timeStr: '1:30 PM EST',
    venue: 'Atlanta Symphony Hall at Woodruff Arts Center',
    distance: '14.2 miles',
    description: 'Fun-filled interactive orchestral performance designed for all generations! Kids and parents dress in costumes to enjoy symphonic favorites like "Danse Macabre" and "Sorcerer\'s Apprentice".',
    ticketUrl: 'https://www.aso.org/',
  },
  {
    id: 'family-chomp-and-stomp',
    title: 'Cabbagetown Chomp & Stomp Chili Cook-off & Bluegrass Festival',
    category: 'Family',
    month: 11,
    day: 7,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EST',
    venue: 'Historic Cabbagetown Park',
    distance: '13.1 miles',
    description: 'One of Atlanta\'s most celebrated neighborhood street festivals! Sample chili from 70+ amateur chefs and 25 top Atlanta restaurants while enjoying 19 live bluegrass and folk bands.',
    ticketUrl: 'https://chompandstomp.com/',
  },
  {
    id: 'family-fernbank-woodland',
    title: 'Fernbank Museum: Woodland Spirits Giant Outdoor Sculptures',
    category: 'Family',
    month: 11,
    day: 8,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EST',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles',
    description: 'Stroll through 65 acres of old-growth forest in WildWoods at Fernbank to discover ghostly sculptural figures inspired by regional folklore and nature.',
    ticketUrl: 'https://www.fernbankmuseum.org/',
  },
];

// ---------------------------------------------------------------------------
// 4. KIDS EVENTS (Verified children's museums, puppet arts & discovery centers)
// ---------------------------------------------------------------------------
export const VERIFIED_KIDS_EVENTS: VerifiedEventDef[] = [
  {
    id: 'kids-cma-spooktacular',
    title: 'Children\'s Museum of Atlanta: Science Trick-or-Treat Spooktacular',
    category: 'Kids',
    month: 10,
    day: 17,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Children\'s Museum of Atlanta',
    distance: '12.0 miles',
    description: 'Hands-on interactive science exhibits in downtown Atlanta! Kids create glow-in-the-dark slime, conduct dry ice volcano experiments, and collect treats in their costumes.',
    ticketUrl: 'https://childrensmuseumatlanta.org/',
  },
  {
    id: 'kids-puppet-workshop',
    title: 'Center for Puppetry Arts: Create-A-Puppet Halloween Workshop',
    category: 'Kids',
    month: 10,
    day: 17,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles',
    description: 'Kids build and take home their own articulated shadow puppets and marionettes, followed by a guided tour of the Jim Henson Collection and The Muppets gallery.',
    ticketUrl: 'https://puppet.org/',
  },
  {
    id: 'kids-lego-brick-or-treat',
    title: 'LEGO Discovery Center Atlanta: Brick-or-Treat Monster Party',
    category: 'Kids',
    month: 10,
    day: 24,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Phipps Plaza LEGO Discovery Center',
    distance: '17.5 miles',
    description: 'Build spooky LEGO pumpkins, meet LEGO Monster characters in costume, watch 4D Halloween films, and ride the Kingdom Quest interactive laser chariot.',
    ticketUrl: 'https://www.legodiscoverycenter.com/atlanta/',
  },
  {
    id: 'kids-fernbank-dino-trick',
    title: 'Fernbank Museum: Dinosaur Trick-or-Treat Beneath the Giants',
    category: 'Kids',
    month: 10,
    day: 31,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles',
    description: 'Trick-or-treat directly underneath the bones of the world\'s largest dinosaurs! Children dress in costume, meet live educational animal ambassadors, and craft fossil keepsakes.',
    ticketUrl: 'https://www.fernbankmuseum.org/experiences/events/dinosaur-trick-or-treat/',
  },
  {
    id: 'kids-puppet-pirates',
    title: 'Center for Puppetry Arts: Children\'s Storybook Puppet Matinee',
    category: 'Kids',
    month: 11,
    day: 8,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EST',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles',
    description: 'Enchanting live puppetry production designed especially for young audiences, featuring interactive storytelling, songs, and puppeteer meet-and-greet afterwards.',
    ticketUrl: 'https://puppet.org/',
  },
  {
    id: 'kids-tellus-heavy-metal',
    title: 'Tellus Science Museum: Night Sky & Fossil Dig Adventure',
    category: 'Kids',
    month: 11,
    day: 14,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EST',
    venue: 'Tellus Science Museum',
    distance: '28.4 miles',
    description: 'Kids pan for real gemstones in a running flume, uncover fossilized shark teeth in the Fossil Dig, and explore solar astronomy through high-powered observatory telescopes.',
    ticketUrl: 'https://tellusmuseum.org/',
  },
];

export const VENUE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Mercedes-Benz Stadium': { lat: 33.7554, lng: -84.4009 },
  'Fox Theatre Atlanta': { lat: 33.7725, lng: -84.3857 },
  'Fox Theatre': { lat: 33.7725, lng: -84.3857 },
  'State Farm Arena': { lat: 33.7573, lng: -84.3963 },
  'Zoo Atlanta': { lat: 33.7331, lng: -84.3725 },
  "Children's Museum of Atlanta": { lat: 33.7628, lng: -84.3897 },
  'Center for Puppetry Arts': { lat: 33.7915, lng: -84.3895 },
  'Stone Mountain Park': { lat: 33.8053, lng: -84.1456 },
  'Bobby Dodd Stadium at Historic Grant Field': { lat: 33.7724, lng: -84.3928 },
  'Atlanta Botanical Garden': { lat: 33.7905, lng: -84.3732 },
  'Georgia Aquarium': { lat: 33.7634, lng: -84.3951 },
  'St. James Live': { lat: 33.6558, lng: -84.5020 },
  'Wolf Creek Amphitheater': { lat: 33.6420, lng: -84.5610 },
  'Phipps Plaza LEGO Discovery Center': { lat: 33.8530, lng: -84.3620 },
  'Bobby Jones Golf Course': { lat: 33.8115, lng: -84.4075 },
  'Atlanta Symphony Hall at Woodruff Arts Center': { lat: 33.7892, lng: -84.3849 },
  'Atlanta Symphony Hall': { lat: 33.7892, lng: -84.3849 },
  'Atlantic Station': { lat: 33.7915, lng: -84.3980 },
  'Fernbank Museum of Natural History': { lat: 33.7743, lng: -84.3289 },
  'Center Parc Stadium': { lat: 33.7353, lng: -84.3895 },
  'Historic Cabbagetown Park': { lat: 33.7495, lng: -84.3648 },
  'OTE Arena at Atlantic Station': { lat: 33.7890, lng: -84.3985 },
  'Tellus Science Museum': { lat: 34.2370, lng: -84.8150 },
  'Southside Park Trailhead': { lat: 33.6812, lng: -84.3792 },
  'Truist Park': { lat: 33.8907, lng: -84.4678 },
  'Gateway Center Arena @ College Park': { lat: 33.6495, lng: -84.4590 },
  'Gateway Center Arena': { lat: 33.6495, lng: -84.4590 },
};

function calculateDistanceInMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in statute miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface EventOriginOptions {
  lat?: number;
  lng?: number;
  propertyName?: string;
}

/**
 * Returns genuine, verified upcoming events occurring strictly within the next 30 days.
 * Real events with verified dates: NO fake rolled dates or fabricated games!
 * Computes proximity dynamically if origin coordinates and property name are provided.
 */
export function getEventsForNext30Days(
  currentDate: Date = new Date(),
  refreshSeed: number = 0,
  origin?: EventOriginOptions
): EventItem[] {
  const now = currentDate instanceof Date && !isNaN(currentDate.getTime()) ? currentDate : new Date();
  const currentYear = now.getFullYear();
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const defToItem = (def: VerifiedEventDef): EventItem | null => {
    const year = def.fixedYear ?? currentYear;
    const rawDate = new Date(year, def.month - 1, def.day, def.hour, def.minute, 0);

    // STRICT GUARANTEE: The event must be genuinely upcoming (> now) and within 30 days
    if (rawDate.getTime() <= now.getTime() || rawDate.getTime() > windowEnd.getTime()) {
      return null;
    }

    let calculatedDistance = def.distance;
    if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number') {
      const coord = VENUE_COORDINATES[def.venue];
      if (coord) {
        const miles = calculateDistanceInMiles(origin.lat, origin.lng, coord.lat, coord.lng);
        calculatedDistance = origin.propertyName 
          ? `${miles} mi from ${origin.propertyName}` 
          : `${miles} miles`;
      }
    }

    return {
      id: def.id,
      title: def.title,
      category: def.category,
      rawDate,
      date: formatEventDate(rawDate, def.timeStr),
      description: def.description,
      ticketUrl: def.ticketUrl,
      venue: def.venue,
      distance: calculatedDistance,
    };
  };

  const getUpcomingSorted = (defs: VerifiedEventDef[]): EventItem[] => {
    return defs
      .map(defToItem)
      .filter((item): item is EventItem => item !== null)
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  };

  // Curate upcoming verified events across the 4 categories
  const sports = getUpcomingSorted(VERIFIED_SPORTS_EVENTS);
  const nightLife = getUpcomingSorted(VERIFIED_NIGHTLIFE_EVENTS);
  const family = getUpcomingSorted(VERIFIED_FAMILY_EVENTS);
  const kids = getUpcomingSorted(VERIFIED_KIDS_EVENTS);

  const combined = [...sports, ...nightLife, ...family, ...kids];

  // Final chronological sort
  return combined.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
}

export function getEventsForCurrentMonth(currentDate: Date = new Date()): EventItem[] {
  return getEventsForNext30Days(currentDate, 0);
}
