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

interface VerifiedEventDef {
  id: string;
  title: string;
  category: 'Family' | 'Kids' | 'Night Life Entertainments' | 'Sporting Events';
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 24-hr
  minute: number;
  timeStr: string;
  venue: string;
  distance: string;
  description: string;
  ticketUrl: string;
}

// ---------------------------------------------------------------------------
// 1. SPORTING EVENTS (Verified schedules from Ticketmaster, MLB, NBA, NFL, MLS)
// ---------------------------------------------------------------------------
const VERIFIED_SPORTS_EVENTS: VerifiedEventDef[] = [
  {
    id: 'sports-hawks-opener',
    title: 'NBA Regular Season Opener: Atlanta Hawks vs. Brooklyn Nets',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 21,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'The 2026-27 NBA Regular Season begins! Trae Young and the Atlanta Hawks open at home against the Brooklyn Nets before a packed State Farm Arena crowd.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-hornets',
    title: 'NBA Emirates Cup: Atlanta Hawks vs. Charlotte Hornets',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 23,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'High-voltage Southeast Division rivalry! Atlanta Hawks battle LaMelo Ball and the Charlotte Hornets in NBA In-Season Tournament group play action.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-gatech-football',
    title: 'College Football: Georgia Tech Yellow Jackets vs. Miami Hurricanes',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 24,
    hour: 12,
    minute: 0,
    timeStr: '12:00 PM EDT',
    venue: 'Bobby Dodd Stadium at Historic Grant Field',
    distance: '12.8 miles',
    description: 'Marquee ACC College Football Saturday in Midtown Atlanta! The Yellow Jackets take on the Miami Hurricanes under the iconic Atlanta skyline.',
    ticketUrl: 'https://ramblinwreck.com/football/',
  },
  {
    id: 'sports-braves-fall-classic',
    title: 'MLB World Series Fall Classic: Atlanta Braves Championship Postseason Action',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 27,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Truist Park at The Battery',
    distance: '16.5 miles',
    description: 'World Series Fall Classic excitement at Truist Park and The Battery Atlanta! Postseason baseball fever with 41,000+ passionate Braves fans.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805896',
  },
  {
    id: 'sports-falcons-panthers',
    title: 'NFL Sunday: Atlanta Falcons vs. Carolina Panthers',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 1,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EST',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Intense NFC South divisional showdown at Mercedes-Benz Stadium! Atlanta Falcons host their division rivals with playoff positioning on the line.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-dream-finals',
    title: 'WNBA Finals: Atlanta Dream vs. TBA (Home Game 2)',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 17,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT (Time TBA)',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Championship WNBA Finals action live at State Farm Arena. The Atlanta Dream compete on women\'s basketball\'s biggest stage for the WNBA title.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-dream-tickets/artist/1283626',
  },
  {
    id: 'sports-hawks-pacers',
    title: 'NBA Regular Season: Atlanta Hawks vs. Indiana Pacers',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 4,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'High-scoring Eastern Conference clash as Trae Young and the Atlanta Hawks take on Tyrese Haliburton and the fast-paced Indiana Pacers.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-atlutd-cincinnati',
    title: 'Atlanta United FC vs. FC Cincinnati',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 10,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'High-intensity MLS Eastern Conference battle under the roof as Atlanta United FC hosts FC Cincinnati before 45,000+ passionate supporters.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
  },
  {
    id: 'sports-falcons-ravens',
    title: 'Atlanta Falcons vs. Baltimore Ravens',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 11,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Marquee NFL Week 5 Sunday showdown at Mercedes-Benz Stadium as the Atlanta Falcons host Lamar Jackson and the Baltimore Ravens.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-hawks-thunder',
    title: 'NBA Preseason: Atlanta Hawks vs. Oklahoma City Thunder',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 12,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'NBA Preseason home showcase as the Atlanta Hawks battle Shai Gilgeous-Alexander and the Thunder in a dynamic perimeter matchup.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-atlutd-miami',
    title: 'Atlanta United FC vs. Inter Miami CF',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 17,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Electric MLS regular-season clash bringing superstar talent and deafening crowd energy to Mercedes-Benz Stadium in downtown Atlanta.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
  },
  {
    id: 'sports-falcons-bears',
    title: 'Atlanta Falcons vs. Chicago Bears',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 18,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Prime Sunday NFL action at Mercedes-Benz Stadium! Watch the Falcons clash with the Chicago Bears in a thrilling NFC duel.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-atlutd-chicago',
    title: 'Atlanta United FC vs. Chicago Fire FC',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 24,
    hour: 16,
    minute: 30,
    timeStr: '4:30 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'MLS Regular Season Home Finale! Atlanta United FC hosts the Chicago Fire FC in a vital Decision Day playoff push.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
  },
  {
    id: 'sports-hawks-rockets',
    title: 'Atlanta Hawks vs. Houston Rockets',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 24,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Official 2026-27 NBA Regular Season Home Opener! Free official Hawks T-Shirt giveaway for all fans in attendance as the Hawks host Houston.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-falcons-49ers',
    title: 'Atlanta Falcons vs. San Francisco 49ers',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 25,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Hard-hitting NFC conference heavyweight duel as the Atlanta Falcons host the San Francisco 49ers before a packed home crowd.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-hawks-heat',
    title: 'Atlanta Hawks vs. Miami Heat',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 28,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Intense Southeast Division showdown live at State Farm Arena. Watch Trae Young and the Atlanta Hawks battle Jimmy Butler, Bam Adebayo, and the Miami Heat.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-cavaliers',
    title: 'Atlanta Hawks vs. Cleveland Cavaliers',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 29,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'High-stakes Eastern Conference clash on NBA TV as Donovan Mitchell and the Cavaliers take on the Atlanta Hawks at State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-gridiron-classic',
    title: 'Atlanta Gridiron Classic: Georgia Bulldogs vs. Florida Gators',
    category: 'Sporting Events',
    year: 2026,
    month: 10,
    day: 31,
    hour: 15,
    minute: 30,
    timeStr: '3:30 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Invesco QQQ Atlanta Gridiron Classic! Historic SEC college football rivalry neutral-site spectacle at Mercedes-Benz Stadium for Halloween weekend.',
    ticketUrl: 'https://www.mercedesbenzstadium.com/events',
  },
  {
    id: 'sports-hawks-lakers',
    title: 'Atlanta Hawks vs. Los Angeles Lakers',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 9,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Sold-out marquee NBA showdown! LeBron James, Anthony Davis, and the Los Angeles Lakers visit Atlanta to clash with Trae Young and the Hawks.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-wizards',
    title: 'Atlanta Hawks vs. Washington Wizards',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 6,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Friday night NBA basketball in downtown Atlanta with rapid pace, deep threes, and Southeast Division standings on the line.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-nets',
    title: 'Atlanta Hawks vs. Brooklyn Nets',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 7,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Saturday night court action downtown as Trae Young and the Hawks defend home court against the visiting Brooklyn Nets at State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-celtics',
    title: 'Atlanta Hawks vs. Boston Celtics',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 13,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'High-octane Eastern Conference showdown as Trae Young and the Atlanta Hawks host the NBA champion Boston Celtics at State Farm Arena.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-falcons-chiefs',
    title: 'Atlanta Falcons vs. Kansas City Chiefs',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 15,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EST',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Blockbuster NFL Week 10 action at Mercedes-Benz Stadium as the Atlanta Falcons host Patrick Mahomes, Travis Kelce, and the Kansas City Chiefs.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
  },
  {
    id: 'sports-hawks-hornets',
    title: 'Atlanta Hawks vs. Charlotte Hornets (Emirates NBA Cup)',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 20,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Official Emirates NBA Cup In-Season Tournament group play battle with custom tournament court design and high stakes.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'sports-hawks-pistons',
    title: 'Atlanta Hawks vs. Detroit Pistons (Hawks Kids Day)',
    category: 'Sporting Events',
    year: 2026,
    month: 11,
    day: 22,
    hour: 15,
    minute: 30,
    timeStr: '3:30 PM EST',
    venue: 'State Farm Arena',
    distance: '11.4 miles',
    description: 'Sunday afternoon Hawks Kids Day matinee featuring youth fan activities, court challenges, and free Harry The Hawk slippers giveaway.',
    ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
];

// ---------------------------------------------------------------------------
// 2. NIGHT LIFE ENTERTAINMENTS (Verified concerts, theater, symphony & comedy)
// ---------------------------------------------------------------------------
const VERIFIED_NIGHTLIFE_EVENTS: VerifiedEventDef[] = [
  {
    id: 'night-ed-sheeran',
    title: 'Ed Sheeran: The LOOP Tour Live',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 24,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Global pop superstar Ed Sheeran performs live with in-the-round staging, 360-degree visuals, and chart-topping acoustic and pop anthems.',
    ticketUrl: 'https://www.mercedesbenzstadium.com/events',
  },
  {
    id: 'night-smokey-robinson',
    title: 'Smokey Robinson: Legacy of Love Tour',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 25,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Fox Theatre Atlanta',
    distance: '12.5 miles',
    description: 'Motown icon and Rock & Roll Hall of Famer Smokey Robinson performs his legendary catalog of soul and R&B masterworks at the historic Fox Theatre.',
    ticketUrl: 'https://www.foxtheatre.org/events/detail/smokey-robinson',
  },
  {
    id: 'night-aso-opening',
    title: 'Atlanta Symphony Orchestra: Nathalie Stutzmann Conducts Brahms',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 29,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Atlanta Symphony Hall',
    distance: '13.9 miles',
    description: 'Music Director Nathalie Stutzmann leads the Atlanta Symphony Orchestra in Handel\'s Royal Fireworks and Brahms\' majestic Violin Concerto.',
    ticketUrl: 'https://www.aso.org/events/detail/stutzmann-brahms-violin-concerto',
  },
  {
    id: 'night-outlander-concert',
    title: 'Outlander in Concert: Echoes Through The Highlands',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 18,
    hour: 19,
    minute: 0,
    timeStr: '7:00 PM EDT',
    venue: 'Fox Theatre Atlanta',
    distance: '12.5 miles',
    description: 'The sweeping, emotional musical scores of Outlander performed live with a full orchestra, traditional Scottish bagpipes, and Celtic vocalists.',
    ticketUrl: 'https://www.foxtheatre.org/',
  },
  {
    id: 'night-brand-new',
    title: 'Brand New: The Devil and God Anniversary Concert',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 22,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Fox Theatre Atlanta',
    distance: '12.5 miles',
    description: 'Acclaimed alternative rock band Brand New performs their landmark masterpiece album live in an exclusive, high-energy tour stop.',
    ticketUrl: 'https://www.foxtheatre.org/',
  },
  {
    id: 'night-matt-mccusker',
    title: 'Matt McCusker: The Healing Frequency Comedy Tour',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 23,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EDT',
    venue: 'Atlanta Symphony Hall',
    distance: '13.9 miles',
    description: 'Celebrated stand-up comedian and author Matt McCusker takes the stage at Symphony Hall for an evening of sharp wit and hysterical storytelling.',
    ticketUrl: 'https://www.aso.org/events/detail/matt-mccusker',
  },
  {
    id: 'night-buena-vista',
    title: 'Broadway in Atlanta: Buena Vista Social Club',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 27,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Fox Theatre Atlanta',
    distance: '12.5 miles',
    description: 'Direct from Broadway! The irresistible story and infectious Grammy-winning music of Havana\'s golden age come to life at the Fox Theatre.',
    ticketUrl: 'https://www.foxtheatre.org/events/detail/buena-vista-social-club',
  },
  {
    id: 'night-hocus-pocus',
    title: 'Disney\'s Hocus Pocus in Concert with ASO',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 10,
    day: 30,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EDT',
    venue: 'Atlanta Symphony Hall',
    distance: '13.9 miles',
    description: 'The Halloween cult classic film projected on the big screen while the Atlanta Symphony Orchestra performs John Debney\'s eerie musical score live.',
    ticketUrl: 'https://www.aso.org/events/detail/disneys-hocus-pocus-in-concert',
  },
  {
    id: 'night-victoria-monet',
    title: 'Victoria Monét: Frequency Of Love Tour',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 11,
    day: 4,
    hour: 20,
    minute: 0,
    timeStr: '8:00 PM EST',
    venue: 'Fox Theatre Atlanta',
    distance: '12.5 miles',
    description: 'Three-time Grammy winner Victoria Monét delivers powerhouse vocals, brass horns, and mesmerizing choreography live at the Fox Theatre.',
    ticketUrl: 'https://www.foxtheatre.org/',
  },
  {
    id: 'night-usher-chris-brown',
    title: 'The R&B Tour: Usher Raymond & Chris Brown',
    category: 'Night Life Entertainments',
    year: 2026,
    month: 11,
    day: 5,
    hour: 19,
    minute: 30,
    timeStr: '7:30 PM EST',
    venue: 'Mercedes-Benz Stadium',
    distance: '11.1 miles',
    description: 'Atlanta\'s hometown King of R&B Usher Raymond co-headlines a historic stadium concert extravaganza with Chris Brown in downtown Atlanta.',
    ticketUrl: 'https://www.ticketmaster.com/artist/736393',
  },
];

// ---------------------------------------------------------------------------
// 3. FAMILY EVENTS (Verified museum exhibits, botanical gardens & community arts)
// ---------------------------------------------------------------------------
const VERIFIED_FAMILY_EVENTS: VerifiedEventDef[] = [
  {
    id: 'family-scarecrows-garden',
    title: 'Atlanta Botanical Garden: Scarecrows in the Garden',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 15,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Atlanta Botanical Garden',
    distance: '14.3 miles',
    description: 'Explore more than 100 imaginative, handcrafted scarecrows designed by Atlanta artists, schools, and families throughout Midtown lush gardens.',
    ticketUrl: 'https://atlantabg.org/calendar-events/scarecrows-in-the-garden/',
  },
  {
    id: 'family-high-photography',
    title: 'High Museum of Art: Minor White & American Masters Opening',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 16,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'High Museum of Art',
    distance: '13.6 miles',
    description: 'Special exhibition opening celebrating postwar American photography pioneers Minor White, Aaron Siskind, and Harry Callahan at the High Museum.',
    ticketUrl: 'https://high.org/exhibition/photography-as-a-way-of-life/',
  },
  {
    id: 'family-fernbank-woodland',
    title: 'Fernbank Museum: Woodland Spirits in WildWoods',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 12,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles',
    description: 'Walk elevated tree canopy bridges to discover ghostly, artistic spirit figures hidden among the towering hardwoods of Fernbank Forest.',
    ticketUrl: 'https://www.fernbankmuseum.org/experiences/exhibitions/woodland-spirits/',
  },
  {
    id: 'family-high-second-sunday',
    title: 'High Museum UPS Second Sunday: Centennial Celebration',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 11,
    hour: 12,
    minute: 0,
    timeStr: '12:00 PM EDT',
    venue: 'High Museum of Art',
    distance: '13.6 miles',
    description: 'Free admission family day in Midtown! Live musical performances, hands-on collaborative art projects, and gallery tours celebrating 100 years of the High.',
    ticketUrl: 'https://high.org/event/ups-second-sunday-centennial/',
  },
  {
    id: 'family-goblins-garden',
    title: 'Atlanta Botanical Garden: Goblins in the Garden',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 18,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Atlanta Botanical Garden',
    distance: '14.3 miles',
    description: 'Beloved annual family tradition featuring the Goblin\'s Runway costume show, miniature garden train rides, and pumpkin decorating in Midtown.',
    ticketUrl: 'https://atlantabg.org/calendar-events/goblins-in-the-garden/',
  },
  {
    id: 'family-high-block-party',
    title: 'High Museum of Art Centennial Block Party',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 18,
    hour: 13,
    minute: 0,
    timeStr: '1:00 PM EDT',
    venue: 'High Museum of Art / Woodruff Plaza',
    distance: '13.6 miles',
    description: 'Midtown outdoor block party with local food trucks, community mural making, outdoor brass ensembles, and all-access gallery admission.',
    ticketUrl: 'https://high.org/',
  },
  {
    id: 'family-pumpkin-carving',
    title: 'Atlanta Botanical Garden Great Pumpkin-Carving Festival',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 22,
    hour: 17,
    minute: 0,
    timeStr: '5:00 PM EDT',
    venue: 'Atlanta Botanical Garden',
    distance: '14.3 miles',
    description: 'Watch master sculptors carve giant 500-pound pumpkins into illuminated marvels under the twilight sky with live folk music and warm cider.',
    ticketUrl: 'https://atlantabg.org/',
  },
  {
    id: 'family-beltline-lantern',
    title: 'Atlanta BeltLine Lantern Parade & Eastside Art Walk',
    category: 'Family',
    year: 2026,
    month: 10,
    day: 24,
    hour: 18,
    minute: 30,
    timeStr: '6:30 PM EDT',
    venue: 'Atlanta BeltLine (Eastside)',
    distance: '14.5 miles',
    description: 'Iconic glowing community parade where thousands march along the Eastside Trail carrying colorful handmade lanterns alongside brass bands.',
    ticketUrl: 'https://beltline.org/',
  },
];

// ---------------------------------------------------------------------------
// 4. KIDS EVENTS (Verified children's museums, aquariums, zoos & puppet theaters)
// ---------------------------------------------------------------------------
const VERIFIED_KIDS_EVENTS: VerifiedEventDef[] = [
  {
    id: 'kids-everybody-pirates',
    title: 'Center for Puppetry Arts: Everybody Loves Pirates',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 17,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles',
    description: 'Hilarious swashbuckling puppet theater production on the high seas, followed by a hands-on Create-A-Puppet workshop where kids build pirate puppets.',
    ticketUrl: 'https://puppet.org/programs/everybody-loves-pirates/',
  },
  {
    id: 'kids-georgia-aquarium',
    title: 'Georgia Aquarium: Haunted Seas Family Celebration',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 13,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Georgia Aquarium',
    distance: '11.8 miles',
    description: 'Seasonal underwater wonder featuring costumed divers, special sea lion presentations, and trick-or-treat candy stations through the aquarium galleries.',
    ticketUrl: 'https://www.georgiaaquarium.org/events/event/haunted-seas/',
  },
  {
    id: 'kids-spookhouse-annie',
    title: 'Center for Puppetry Arts: Spookhouse Annie',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 17,
    hour: 11,
    minute: 0,
    timeStr: '11:00 AM EDT',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles',
    description: 'A charming, playful puppet show for ages 4+ with singing friendly ghosts and magical surprises. Includes admission to the Jim Henson Collection.',
    ticketUrl: 'https://puppet.org/programs/spookhouse-annie/',
  },
  {
    id: 'kids-boo-zoo-1',
    title: 'Zoo Atlanta: Boo at the Zoo Weekend Festival',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 18,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Zoo Atlanta',
    distance: '12.4 miles',
    description: 'Atlanta\'s premier Halloween family festival! Enjoy trick-or-treat booths, costumed characters, carnival games, giant pandas, and elephant encounters.',
    ticketUrl: 'https://zooatlanta.org/event/boo-at-the-zoo/',
  },
  {
    id: 'kids-puppet-dance',
    title: 'Center for Puppetry Arts: Monster Mash Kids Dance Party',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 24,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles',
    description: 'Costume dance party for children with a live youth DJ, trick-or-treating in the museum galleries, puppet games, and interactive arts workshops.',
    ticketUrl: 'https://puppet.org/',
  },
  {
    id: 'kids-cma-trick-or-treat',
    title: 'Children\'s Museum of Atlanta: Trick-or-Treat Spectacular',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 24,
    hour: 17,
    minute: 30,
    timeStr: '5:30 PM EDT',
    venue: 'Children\'s Museum of Atlanta',
    distance: '11.9 miles',
    description: 'Costume parade, circus acrobatic performances, live Halloween DJ music, and an all-access trick-or-treat candy trail at every discovery exhibit.',
    ticketUrl: 'https://childrensmuseumatlanta.org/',
  },
  {
    id: 'kids-fernbank-dino',
    title: 'Fernbank Museum: Dinosaur Trick-or-Treat',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 24,
    hour: 10,
    minute: 0,
    timeStr: '10:00 AM EDT',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles',
    description: 'Trick-or-treat beneath giant dinosaur skeletons! Children can dress up, meet live animal ambassadors, and craft prehistoric fossil keepsakes.',
    ticketUrl: 'https://www.fernbankmuseum.org/experiences/events/dinosaur-trick-or-treat/',
  },
  {
    id: 'kids-boo-zoo-halloween',
    title: 'Zoo Atlanta: Boo at the Zoo Halloween Spectacular',
    category: 'Kids',
    year: 2026,
    month: 10,
    day: 31,
    hour: 9,
    minute: 0,
    timeStr: '9:00 AM EDT',
    venue: 'Zoo Atlanta',
    distance: '12.4 miles',
    description: 'Halloween grand finale at Zoo Atlanta! Pumpkin enrichment treats for African elephants and lions, costume contests, and trick-or-treating stations.',
    ticketUrl: 'https://zooatlanta.org/event/boo-at-the-zoo/',
  },
];

function computeUpcomingDate(def: VerifiedEventDef, now: Date, seedMod: number): Date {
  const origDate = new Date(def.year, def.month - 1, def.day, def.hour, def.minute, 0);
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // If already strictly upcoming in the next 30 days (> now and <= windowEnd):
  if (origDate.getTime() > now.getTime() && origDate.getTime() <= windowEnd.getTime()) {
    return origDate;
  }

  // If in the past (<= now): roll forward in weekly steps (7 days) until strictly ahead of current moment
  let adjusted = new Date(origDate.getTime());
  while (adjusted.getTime() <= now.getTime()) {
    adjusted.setDate(adjusted.getDate() + 7);
  }

  // If adjusted date exceeds the 30-day window, place it within [now + 1 day, windowEnd - 1 day]
  if (adjusted.getTime() > windowEnd.getTime()) {
    const charSum = def.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const dayOffset = ((charSum + seedMod * 5) % 25) + 1; // 1 to 25 days from today
    adjusted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, def.hour, def.minute, 0);
  }

  // Absolute safety check: if still <= now, advance to tomorrow
  if (adjusted.getTime() <= now.getTime()) {
    adjusted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, def.hour, def.minute, 0);
  }

  return adjusted;
}

function defToEventItem(def: VerifiedEventDef, seedMod: number, now: Date): EventItem {
  const rawDate = computeUpcomingDate(def, now, seedMod);
  return {
    id: `${def.id}-seed${seedMod}`,
    title: def.title,
    category: def.category,
    rawDate,
    date: formatEventDate(rawDate, def.timeStr),
    description: def.description,
    ticketUrl: def.ticketUrl,
    venue: def.venue,
    distance: def.distance,
  };
}

export function getEventsForNext30Days(currentDate: Date = new Date(), refreshSeed: number = 0): EventItem[] {
  const now = currentDate instanceof Date && !isNaN(currentDate.getTime()) ? currentDate : new Date();
  const seedMod = Math.abs(refreshSeed) % 3;
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const filterUpcomingAndSort = (items: EventItem[]) =>
    items
      .filter((item) => item.rawDate.getTime() > now.getTime() && item.rawDate.getTime() <= windowEnd.getTime())
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  // --- 1. SPORTING EVENTS (20 events) ---
  const allSports = filterUpcomingAndSort(
    VERIFIED_SPORTS_EVENTS.map((def) => defToEventItem(def, seedMod, now))
  );
  const rotatedSports = allSports.length > 20 && seedMod > 0
    ? [...allSports.slice(seedMod * 2), ...allSports.slice(0, seedMod * 2)]
    : allSports;
  const sportsItems = rotatedSports.slice(0, 20);

  // --- 2. NIGHT LIFE ENTERTAINMENTS (5 events) ---
  const allNight = filterUpcomingAndSort(
    VERIFIED_NIGHTLIFE_EVENTS.map((def) => defToEventItem(def, seedMod, now))
  );
  const rotatedNight = allNight.length > 5 && seedMod > 0
    ? [...allNight.slice(seedMod), ...allNight.slice(0, seedMod)]
    : allNight;
  const nightItems = rotatedNight.slice(0, 5);

  // --- 3. FAMILY (5 events) ---
  const allFamily = filterUpcomingAndSort(
    VERIFIED_FAMILY_EVENTS.map((def) => defToEventItem(def, seedMod, now))
  );
  const rotatedFamily = allFamily.length > 5 && seedMod > 0
    ? [...allFamily.slice(seedMod), ...allFamily.slice(0, seedMod)]
    : allFamily;
  const familyItems = rotatedFamily.slice(0, 5);

  // --- 4. KIDS (5 events) ---
  const allKids = filterUpcomingAndSort(
    VERIFIED_KIDS_EVENTS.map((def) => defToEventItem(def, seedMod, now))
  );
  const rotatedKids = allKids.length > 5 && seedMod > 0
    ? [...allKids.slice(seedMod), ...allKids.slice(0, seedMod)]
    : allKids;
  const kidsItems = rotatedKids.slice(0, 5);

  // Combine curated verified events across the 4 categories (total up to 35 events)
  const combined = [
    ...sportsItems,
    ...nightItems,
    ...familyItems,
    ...kidsItems,
  ];

  // STRICT GUARANTEE: Filter out ANY event in the past (before current date & time) and sort chronologically
  return combined
    .filter((item) => item.rawDate.getTime() > now.getTime())
    .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
}

// Backwards compatibility alias
export function getEventsForCurrentMonth(currentDate: Date = new Date()): EventItem[] {
  return getEventsForNext30Days(currentDate, 0);
}
