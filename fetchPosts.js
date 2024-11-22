const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });
const fs = require('fs');
const path = require('path');
const cache_path = `${process.env.HOME}/.cache/bluesky_cache`;
const limit = 3;

async function fetchPosts(keyword, date, hour) {
    try {
        // create the cache directory if it doesn't exist
        fs.mkdirSync(cache_path, { recursive: true });

        // Read the token from the file
        const tokenData = JSON.parse(fs.readFileSync('bluesky_token.json', 'utf8'));
        const token = tokenData.token;

        // If parameters are not provided, prompt for them
        keyword = keyword || prompt('Enter keyword to search: ');
        date = date || prompt('Enter date (YYYY-MM-DD): ');
        hour = hour || prompt('Enter hour (00-23): ');

        // Pad hour with leading zero if needed
        hour = hour.toString().padStart(2, '0');

        // Create the directory structure
        const dirPath = path.join('posts', keyword, date, hour);
        fs.mkdirSync(dirPath, { recursive: true });

        console.log(`Fetching posts for keyword "${keyword}" on ${date} at ${hour}:00...`);

        // Calculate the time range for the given hour
        const startTime = new Date(`${date}T${hour}:00:00Z`).toISOString();
        const endTime = new Date(`${date}T${hour}:59:59Z`).toISOString();

        let posts;
        // check if the cache file exists
        const cacheFilePath = path.join(cache_path, `${keyword}_${date}_${hour}.json`);

        if (fs.existsSync(cacheFilePath)) {
            console.log(`Cache file found for ${keyword} on ${date} at ${hour}:00. Loading from cache...`);
            posts = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        } else {
            // Make the API request to Bluesky with date range parameters
            const response = await axios.get('https://bsky.social/xrpc/app.bsky.feed.searchPosts', {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                params: {
                    q: `${keyword} since:${startTime} until:${endTime}`,
                    limit: 100
                }
            });
            posts = response.data;
            // store the response in a cache file under the key of the keyword, date, and hour
            fs.writeFileSync(cacheFilePath, JSON.stringify(posts, null, 2));
        }   

        // Format each post and save individually
        const formattedPosts = posts.posts.map(post => ({
            text: post.record.text,
            author: post.author.handle,
            timestamp: post.indexedAt,
            uri: post.uri,
            cid: post.cid
        }));

        // Save each post to its own file
        formattedPosts.forEach((post, index) => {
            const fileName = `post_${(index + 1).toString().padStart(4, '0')}_${post.author}_${date}_${hour}.json`;
            const filePath = path.join(dirPath, fileName);
            fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
        });

        console.log(`Found ${formattedPosts.length} posts`);
        console.log(`Results saved to: ${dirPath}`);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Check if arguments are provided via command line
const [,, keyword, date, hour] = process.argv;

// Execute the function
fetchPosts(keyword, date, hour); 