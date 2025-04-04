// scripts/fetch-episodes.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const yaml = require('js-yaml');
const { format } = require('date-fns');

// Your podcast RSS feed URL
const RSS_URL = 'https://feeds.megaphone.fm/GLSS1396629297';
const EPISODES_DIR = path.join(__dirname, '../_episodes');
const DATA_DIR = path.join(__dirname, '../_data');

// Ensure directories exist
if (!fs.existsSync(EPISODES_DIR)) {
  fs.mkdirSync(EPISODES_DIR, { recursive: true });
  console.log('Created _episodes directory');
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created _data directory');
}

async function fetchRSS() {
  try {
    console.log('Fetching podcast RSS feed...');
    const response = await axios.get(RSS_URL);
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    return result.rss.channel;
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    process.exit(1);
  }
}

function extractMegaphoneId(url) {
  // Make sure url is a string before using match
  if (!url || typeof url !== 'string') {
    // If url is an object with a text or _ property (common in XML to JSON conversions)
    if (url && typeof url === 'object') {
      if (url._ && typeof url._ === 'string') {
        url = url._;
      } else if (url.text && typeof url.text === 'string') {
        url = url.text;
      } else {
        // Convert object to string or use empty string
        url = String(url) || '';
      }
    } else {
      // Default to empty string if url is null/undefined or not convertible
      url = '';
    }
  }
  
  // Now safely use match on the string
  const match = url.match(/\/([a-zA-Z0-9]+)\.mp3$/) || url.match(/([a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12})/) || [];
  return match[1] || '';
}

async function processEpisodes() {
  const channel = await fetchRSS();
  const episodes = Array.isArray(channel.item) ? channel.item : [channel.item];
  
  console.log(`Found ${episodes.length} episodes`);
  
  episodes.forEach((episode) => {
    try {
      const pubDate = new Date(episode.pubDate);
      const formattedDate = format(pubDate, 'yyyy-MM-dd');
      // Handle potential missing titles
      const title = episode.title ? episode.title.replace(/[^\w\s]/gi, '').trim() : 'untitled';
      const slug = `${formattedDate}-${title.toLowerCase().replace(/\s+/g, '-')}`;
      
      // Safely get megaphone ID
      const megaphoneId = extractMegaphoneId(episode.guid || (episode.enclosure && episode.enclosure.url) || '');
      
      // Extract episode details
      const episodeData = {
        layout: 'episode',
        title: episode.title || 'Untitled Episode',
        date: episode.pubDate,
        description: episode.description || episode['itunes:summary'] || '',
        duration: episode['itunes:duration'] || '',
        episode_number: episode['itunes:episode'] || '',
        season: episode['itunes:season'] || '',
        explicit: episode['itunes:explicit'] || 'no',
        audio_url: episode.enclosure && episode.enclosure.url ? episode.enclosure.url : '',
        image: episode['itunes:image'] && episode['itunes:image'].href ? episode['itunes:image'].href : 
               (channel['itunes:image'] && channel['itunes:image'].href ? channel['itunes:image'].href : ''),
        megaphone_id: megaphoneId
      };
      
      // Create episode file
      const fileContent = `---\n${yaml.dump(episodeData)}---\n\n${episode.description || episode['itunes:summary'] || ''}`;
      const filePath = path.join(EPISODES_DIR, `${slug}.md`);
      
      fs.writeFileSync(filePath, fileContent);
      console.log(`Created episode file: ${slug}.md`);
    } catch (error) {
      console.error(`Error processing episode: ${error.message}`);
      // Continue with next episode instead of failing the entire process
    }
  });
  
  try {
    // Also create episodes.json for potential client-side usage
    const episodesData = episodes.map(episode => {
      try {
        // Safely get megaphone ID
        const megaphoneId = extractMegaphoneId(episode.guid || (episode.enclosure && episode.enclosure.url) || '');
        
        return {
          title: episode.title || 'Untitled Episode',
          date: episode.pubDate,
          description: episode.description || episode['itunes:summary'] || '',
          audio_url: episode.enclosure && episode.enclosure.url ? episode.enclosure.url : '',
          megaphone_id: megaphoneId,
          image: episode['itunes:image'] && episode['itunes:image'].href ? episode['itunes:image'].href : 
                 (channel['itunes:image'] && channel['itunes:image'].href ? channel['itunes:image'].href : ''),
          episode_number: episode['itunes:episode'] || '',
          season: episode['itunes:season'] || ''
        };
      } catch (error) {
        console.error(`Error mapping episode for JSON: ${error.message}`);
        // Return a minimal valid object if there's an error with this episode
        return { title: 'Error Processing Episode', date: new Date().toISOString() };
      }
    });
    
    const jsonPath = path.join(DATA_DIR, 'episodes.json');
    fs.writeFileSync(jsonPath, JSON.stringify(episodesData, null, 2));
    console.log(`Created episodes.json data file at ${jsonPath}`);
  } catch (error) {
    console.error(`Error creating episodes.json: ${error.message}`);
  }
}

// Run the script
processEpisodes();