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

function addDays(baseDate: Date, days: number, hour: number = 19): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  result.setHours(hour, 0, 0, 0);
  return result;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getEventsForNext30Days(currentDate: Date = new Date(), refreshSeed: number = 0): EventItem[] {
  const monthIndex = currentDate.getMonth(); // 0-11
  const isSummer = monthIndex >= 5 && monthIndex <= 7; // June, July, August
  const isFall = monthIndex >= 8 && monthIndex <= 10; // Sept, Oct, Nov
  const isWinter = monthIndex === 11 || monthIndex === 0 || monthIndex === 1; // Dec, Jan, Feb
  const isSpring = monthIndex >= 2 && monthIndex <= 4; // March, April, May

  const seedMod = Math.abs(refreshSeed) % 3;
  const events: EventItem[] = [];

  // --- 1. SPORTING EVENTS (5 Events) ---
  if (seedMod === 0) {
    events.push({
      id: `sports-1-seed${seedMod}`,
      title: isSummer || isSpring ? 'Atlanta Braves vs. New York Mets' : isFall ? 'Atlanta Falcons vs. New Orleans Saints' : 'Atlanta Hawks vs. Boston Celtics',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 2, 19),
      date: formatDate(addDays(currentDate, 2, 19)),
      description: isSummer || isSpring 
        ? 'Experience the electric atmosphere at Truist Park as the Atlanta Braves battle their NL East rivals in an action-packed home series.'
        : isFall 
        ? 'Feel the roar of the crowd at Mercedes-Benz Stadium as the Falcons renew one of the NFL\'s most intense division rivalries.'
        : 'Watch the Atlanta Hawks take on the powerhouse Celtics in a crucial Eastern Conference showdown live at State Farm Arena.',
      ticketUrl: isSummer || isSpring ? 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805896' : isFall ? 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897' : 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
      venue: isSummer || isSpring ? 'Truist Park' : isFall ? 'Mercedes-Benz Stadium' : 'State Farm Arena',
      distance: isSummer || isSpring ? '16.5 miles' : isFall ? '11.1 miles' : '11.4 miles'
    });

    events.push({
      id: `sports-2-seed${seedMod}`,
      title: 'Atlanta United FC vs. Orlando City SC',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 7, 19),
      date: formatDate(addDays(currentDate, 7, 19)),
      description: 'Experience the unmatched energy, flags, and supporter chants as Atlanta United dominates the pitch at Mercedes-Benz Stadium.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
      venue: 'Mercedes-Benz Stadium',
      distance: '11.1 miles'
    });

    events.push({
      id: `sports-3-seed${seedMod}`,
      title: 'Atlanta Dream vs. Las Vegas Aces',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 12, 19),
      date: formatDate(addDays(currentDate, 12, 19)),
      description: 'Catch fast-paced WNBA basketball live as the Atlanta Dream challenge top-tier competition at Gateway Center Arena in College Park.',
      ticketUrl: 'https://dream.wnba.com/',
      venue: 'Gateway Center Arena (College Park)',
      distance: '9.2 miles'
    });

    events.push({
      id: `sports-4-seed${seedMod}`,
      title: 'Atlanta Hawks vs. Miami Heat',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 18, 19),
      date: formatDate(addDays(currentDate, 18, 19)),
      description: 'High-flying dunks, elite three-pointers, and courtside entertainment at State Farm Arena in downtown Atlanta.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
      venue: 'State Farm Arena',
      distance: '11.4 miles'
    });

    events.push({
      id: `sports-5-seed${seedMod}`,
      title: 'Atlanta Braves Home Series Extravaganza',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 25, 19),
      date: formatDate(addDays(currentDate, 25, 19)),
      description: 'Enjoy Friday night fireworks, legendary ballpark eats, and prime MLB baseball action at Truist Park at The Battery.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805896',
      venue: 'Truist Park',
      distance: '16.5 miles'
    });

  } else if (seedMod === 1) {
    events.push({
      id: `sports-1-seed${seedMod}`,
      title: 'Atlanta Braves vs. Philadelphia Phillies',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 3, 19),
      date: formatDate(addDays(currentDate, 3, 19)),
      description: 'A marquee division showdown featuring superstar hitters and electrifying bullpen action at Truist Park.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805896',
      venue: 'Truist Park',
      distance: '16.5 miles'
    });

    events.push({
      id: `sports-2-seed${seedMod}`,
      title: 'Atlanta Falcons vs. Carolina Panthers',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 8, 13),
      date: formatDate(addDays(currentDate, 8, 13)),
      description: 'NFC South rivalry game packed with hard-hitting defensive plays and explosive offense under the retractable roof.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
      venue: 'Mercedes-Benz Stadium',
      distance: '11.1 miles'
    });

    events.push({
      id: `sports-3-seed${seedMod}`,
      title: 'Atlanta United FC vs. Inter Miami CF',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 14, 19),
      date: formatDate(addDays(currentDate, 14, 19)),
      description: 'A record-breaking soccer matchup with international stars descending upon Mercedes-Benz Stadium.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
      venue: 'Mercedes-Benz Stadium',
      distance: '11.1 miles'
    });

    events.push({
      id: `sports-4-seed${seedMod}`,
      title: 'Atlanta Hawks vs. Milwaukee Bucks',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 21, 19),
      date: formatDate(addDays(currentDate, 21, 19)),
      description: 'An Eastern Conference thriller as the Hawks clash with former champions at State Farm Arena.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
      venue: 'State Farm Arena',
      distance: '11.4 miles'
    });

    events.push({
      id: `sports-5-seed${seedMod}`,
      title: 'Atlanta Professional Soccer Showcase',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 27, 18),
      date: formatDate(addDays(currentDate, 27, 18)),
      description: 'High-energy local athletic tournament featuring regional clubs, food trucks, and live fan activities.',
      ticketUrl: 'https://silverbackspark.com/',
      venue: 'Silverbacks Park',
      distance: '21.0 miles'
    });

  } else {
    events.push({
      id: `sports-1-seed${seedMod}`,
      title: 'Atlanta Braves vs. Los Angeles Dodgers',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 1, 19),
      date: formatDate(addDays(currentDate, 1, 19)),
      description: 'A blockbuster National League clash bringing playoff intensity and sellout crowds to Truist Park.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-braves-tickets/artist/805896',
      venue: 'Truist Park',
      distance: '16.5 miles'
    });

    events.push({
      id: `sports-2-seed${seedMod}`,
      title: 'Atlanta Falcons vs. Tampa Bay Buccaneers',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 6, 13),
      date: formatDate(addDays(currentDate, 6, 13)),
      description: 'Prime Sunday football excitement in downtown Atlanta with tailgate festivities and halo board displays.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-falcons-tickets/artist/805897',
      venue: 'Mercedes-Benz Stadium',
      distance: '11.1 miles'
    });

    events.push({
      id: `sports-3-seed${seedMod}`,
      title: 'Atlanta Hawks vs. Golden State Warriors',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 15, 19),
      date: formatDate(addDays(currentDate, 15, 19)),
      description: 'Non-stop perimeter shooting and high-speed transition basketball live at State Farm Arena.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
      venue: 'State Farm Arena',
      distance: '11.4 miles'
    });

    events.push({
      id: `sports-4-seed${seedMod}`,
      title: 'Atlanta Dream vs. Chicago Sky',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 20, 19),
      date: formatDate(addDays(currentDate, 20, 19)),
      description: 'Intense WNBA court action with elite defense and clutch fourth-quarter shooting in College Park.',
      ticketUrl: 'https://dream.wnba.com/',
      venue: 'Gateway Center Arena (College Park)',
      distance: '9.2 miles'
    });

    events.push({
      id: `sports-5-seed${seedMod}`,
      title: 'Atlanta United FC vs. Charlotte FC',
      category: 'Sporting Events',
      rawDate: addDays(currentDate, 26, 19),
      date: formatDate(addDays(currentDate, 26, 19)),
      description: 'I-85 derby match filled with dramatic goals and passionate supporters waving flags in the supporters section.',
      ticketUrl: 'https://www.ticketmaster.com/atlanta-united-fc-tickets/artist/2213125',
      venue: 'Mercedes-Benz Stadium',
      distance: '11.1 miles'
    });
  }

  // --- 2. NIGHT LIFE ENTERTAINMENTS (5 Events) ---
  events.push({
    id: `night-1-seed${seedMod}`,
    title: seedMod === 0 ? 'Live Jazz & Soul Night at St. James Live' : seedMod === 1 ? 'St. James Live Contemporary R&B Showcase' : 'St. James Live Smooth Saxophone Experience',
    category: 'Night Life Entertainments',
    rawDate: addDays(currentDate, 4, 20),
    date: formatDate(addDays(currentDate, 4, 20)),
    description: 'An intimate evening of premier live contemporary jazz, soul, and R&B music. Exceptional acoustics paired with a refined dinner menu.',
    ticketUrl: 'https://www.stjamesliveatl.com/',
    venue: 'St. James Live',
    distance: '10.8 miles'
  });

  events.push({
    id: `night-2-seed${seedMod}`,
    title: seedMod === 0 ? 'WindDown Concert Series at Wolf Creek Amphitheater' : seedMod === 1 ? 'Wolf Creek Soul & Funk Outdoor Festival' : 'Wolf Creek R&B Legends Night',
    category: 'Night Life Entertainments',
    rawDate: addDays(currentDate, 9, 18),
    date: formatDate(addDays(currentDate, 9, 18)),
    description: 'Gather under the stars at South Fulton\'s premier open-air amphitheater for an exquisite evening of classic soul, R&B, and funk.',
    ticketUrl: 'https://www.wolfcreekamphitheater.com/',
    venue: 'Wolf Creek Amphitheater',
    distance: '5.4 miles'
  });

  events.push({
    id: `night-3-seed${seedMod}`,
    title: 'Acoustic Living Room Jazz at The Velvet Note',
    category: 'Night Life Entertainments',
    rawDate: addDays(currentDate, 16, 19),
    date: formatDate(addDays(currentDate, 16, 19)),
    description: 'Experience world-class acoustic jazz at The Velvet Note, a beautifully designed "living room" listening space renowned for pristine sound.',
    ticketUrl: 'https://thevelvetnote.com/',
    venue: 'The Velvet Note (Alpharetta)',
    distance: '29.5 miles'
  });

  events.push({
    id: `night-4-seed${seedMod}`,
    title: 'City Winery Wine & Live Concert Experience',
    category: 'Night Life Entertainments',
    rawDate: addDays(currentDate, 22, 20),
    date: formatDate(addDays(currentDate, 22, 20)),
    description: 'Sip on locally made, award-winning craft wines while enjoying an intimate performance from touring singer-songwriters at Ponce City Market.',
    ticketUrl: 'https://www.citywinery.com/atlanta',
    venue: 'City Winery Atlanta',
    distance: '14.1 miles'
  });

  events.push({
    id: `night-5-seed${seedMod}`,
    title: 'Atlanta Symphony Orchestra Live at Symphony Hall',
    category: 'Night Life Entertainments',
    rawDate: addDays(currentDate, 28, 20),
    date: formatDate(addDays(currentDate, 28, 20)),
    description: 'Immerse yourself in a majestic evening of classical masterpieces and modern cinematic scores, performed live in Midtown Atlanta.',
    ticketUrl: 'https://www.aso.org/',
    venue: 'Atlanta Symphony Hall',
    distance: '13.9 miles'
  });

  // --- 3. FAMILY (5 Events) ---
  events.push({
    id: `family-1-seed${seedMod}`,
    title: 'High Museum of Art Special Exhibition',
    category: 'Family',
    rawDate: addDays(currentDate, 5, 11),
    date: formatDate(addDays(currentDate, 5, 11)),
    description: 'Explore world-class art collections, contemporary photographic galleries, and inspiring interactive installations in Midtown.',
    ticketUrl: 'https://www.ticketmaster.com/high-museum-of-art-tickets-atlanta/venue/114690',
    venue: 'High Museum of Art',
    distance: '13.6 miles'
  });

  events.push({
    id: `family-2-seed${seedMod}`,
    title: 'Piedmont Park Family Festival & Food Truck Rally',
    category: 'Family',
    rawDate: addDays(currentDate, 11, 10),
    date: formatDate(addDays(currentDate, 11, 10)),
    description: 'A vibrant community gathering in Atlanta\'s historic green space featuring live music, local artisans, and family activities.',
    ticketUrl: 'https://www.piedmontpark.org/',
    venue: 'Piedmont Park',
    distance: '14.2 miles'
  });

  events.push({
    id: `family-3-seed${seedMod}`,
    title: 'Atlanta Botanical Garden Exhibition',
    category: 'Family',
    rawDate: addDays(currentDate, 17, 10),
    date: formatDate(addDays(currentDate, 17, 10)),
    description: 'Stroll through a stunning wonderland of massive living plant sculptures and dynamic glass artwork reflecting in Midtown gardens.',
    ticketUrl: 'https://atlantabg.org/',
    venue: 'Atlanta Botanical Garden',
    distance: '14.3 miles'
  });

  events.push({
    id: `family-4-seed${seedMod}`,
    title: 'Fernbank Museum of Natural History & Outdoor Trails',
    category: 'Family',
    rawDate: addDays(currentDate, 23, 11),
    date: formatDate(addDays(currentDate, 23, 11)),
    description: 'Travel through time from prehistoric dinosaurs to the cosmos. Discover immersive outdoor nature trails and massive 3D giant-screen films.',
    ticketUrl: 'https://www.fernbankmuseum.org/',
    venue: 'Fernbank Museum of Natural History',
    distance: '16.1 miles'
  });

  events.push({
    id: `family-5-seed${seedMod}`,
    title: 'Atlanta BeltLine Eastside Art & Walking Tour',
    category: 'Family',
    rawDate: addDays(currentDate, 29, 10),
    date: formatDate(addDays(currentDate, 29, 10)),
    description: 'A gorgeous family walking tour exploring colorful public murals, sculptures, and vibrant local culinary spots along the Eastside Trail.',
    ticketUrl: 'https://www.beltline.org/',
    venue: 'Atlanta BeltLine (Eastside)',
    distance: '14.5 miles'
  });

  // --- 4. KIDS (5 Events) ---
  events.push({
    id: `kids-1-seed${seedMod}`,
    title: 'Center for Puppetry Arts: Family Puppet Show & Workshop',
    category: 'Kids',
    rawDate: addDays(currentDate, 3, 13),
    date: formatDate(addDays(currentDate, 3, 13)),
    description: 'Experience mesmerizing puppet performances followed by a hands-on workshop where kids build and take home custom puppets.',
    ticketUrl: 'https://puppet.org/',
    venue: 'Center for Puppetry Arts',
    distance: '13.8 miles'
  });

  events.push({
    id: `kids-2-seed${seedMod}`,
    title: 'Georgia Aquarium: Behind-the-Scenes & Ocean Voyager',
    category: 'Kids',
    rawDate: addDays(currentDate, 10, 10),
    date: formatDate(addDays(currentDate, 10, 10)),
    description: 'Inspire young explorers with a journey through the world\'s largest aquatic exhibits, home to whale sharks, manta rays, and playful sea otters.',
    ticketUrl: 'https://www.georgiaaquarium.org/',
    venue: 'Georgia Aquarium',
    distance: '11.8 miles'
  });

  events.push({
    id: `kids-3-seed${seedMod}`,
    title: 'Zoo Atlanta: Wild Encounter & Giant Pandas',
    category: 'Kids',
    rawDate: addDays(currentDate, 15, 10),
    date: formatDate(addDays(currentDate, 15, 10)),
    description: 'Get up close with giant pandas, African elephants, and exotic wildlife. Highly educational and perfect for young animal lovers.',
    ticketUrl: 'https://zooatlanta.org/',
    venue: 'Zoo Atlanta',
    distance: '12.4 miles'
  });

  events.push({
    id: `kids-4-seed${seedMod}`,
    title: 'Children\'s Museum of Atlanta Interactive Play',
    category: 'Kids',
    rawDate: addDays(currentDate, 21, 10),
    date: formatDate(addDays(currentDate, 21, 10)),
    description: 'Spark child-led discovery with dynamic hands-on scientific experiments, engineering exhibits, and creative arts workshops.',
    ticketUrl: 'https://childrensmuseumatlanta.org/',
    venue: 'Children\'s Museum of Atlanta',
    distance: '11.9 miles'
  });

  events.push({
    id: `kids-5-seed${seedMod}`,
    title: 'Chastain Park Kid\'s Art & Music Fest',
    category: 'Kids',
    rawDate: addDays(currentDate, 27, 11),
    date: formatDate(addDays(currentDate, 27, 11)),
    description: 'A vibrant weekend event featuring instrument petting zoos, face painting, watercolor tents, and fun outdoor play zones.',
    ticketUrl: 'https://www.chastainparkconservancy.org/',
    venue: 'Chastain Park Amphitheatre Grounds',
    distance: '19.2 miles'
  });

  // Sort chronologically by rawDate
  return events.slice(0, 20).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
}

// Backwards compatibility alias
export function getEventsForCurrentMonth(currentDate: Date = new Date()): EventItem[] {
  return getEventsForNext30Days(currentDate, 0);
}
